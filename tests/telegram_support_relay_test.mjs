import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = 'workflows/advanced/telegram-support-relay.json';
const workflow = JSON.parse(fs.readFileSync(path.join(root, workflowPath), 'utf8'));
const node = (name) => workflow.nodes.find((candidate) => candidate.name === name);
let assertionCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

assert.equal(workflow.id, 'advancedTelegramSupportRelayV1');
assert.equal(workflow.active, false);
assert.deepEqual(workflow.pinData, {});
assert.equal(workflow.settings.saveDataErrorExecution, 'none');
assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
assert.equal(workflow.nodes.filter(({type}) => type !== 'n8n-nodes-base.stickyNote').length, 10);
assert.ok(workflow.nodes.every(({type}) => ![
  'n8n-nodes-base.code',
  'n8n-nodes-base.function',
  'n8n-nodes-base.functionItem',
  'n8n-nodes-base.executeWorkflow',
].includes(type)));
ok('advanced workflow выключен, не хранит execution payloads и состоит из десяти no-code блоков');

const settings = node('1. Настройки и безопасный пример');
const assignments = new Map(settings.parameters.assignments.assignments.map((assignment) => [assignment.name, assignment]));
assert.equal(assignments.get('sendEnabled').value, false);
assert.equal(assignments.get('allowedPrivateChatIds').value, 'REPLACE_WITH_ALLOWED_PRIVATE_CHAT_IDS');
assert.equal(assignments.get('operatorGroupChatId').value, 'REPLACE_WITH_OPERATOR_GROUP_CHAT_ID');
assert.equal(assignments.get('source').value, "={{ $json.message ? 'telegram' : 'manual' }}");
assert.match(assignments.get('manualExpectedRoute').value, /Reply оператора/);
ok('ручной fixture локален, а реальные отправки и получатели выключены placeholders');

const switchNode = node('Новый / известный / ответ?');
assert.equal(switchNode.type, 'n8n-nodes-base.switch');
assert.equal(switchNode.parameters.mode, 'expression');
assert.equal(switchNode.parameters.numberOutputs, 5);
const routeExpression = switchNode.parameters.output.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '');
const route = new Function('$json', `"use strict"; return (${routeExpression});`);
const base = {
  source: 'telegram',
  sendEnabled: true,
  senderIsBot: false,
  chatType: 'private',
  allowedPrivateChatIds: '100001, 100002',
  operatorGroupChatId: '-100900',
  chatId: '100001',
  isStartCommand: false,
  replyToMessageId: '',
};
const fixtures = [
  {name: 'manual preview при выключенной отправке', input: {...base, source: 'manual', sendEnabled: false}, output: 0},
  {name: 'выключенная production-отправка', input: {...base, sendEnabled: false}, output: 4},
  {name: 'сообщение бота или self-update', input: {...base, senderIsBot: true}, output: 4},
  {name: 'private chat вне allowlist', input: {...base, chatId: '777777'}, output: 4},
  {name: 'новый пользователь через /start', input: {...base, isStartCommand: true}, output: 1},
  {name: 'известный private пользователь', input: {...base}, output: 2},
  {name: 'Reply оператора в разрешённой группе', input: {...base, chatType: 'supergroup', chatId: '-100900', replyToMessageId: '912'}, output: 3},
  {name: 'сообщение группы без Reply', input: {...base, chatType: 'group', chatId: '-100900'}, output: 4},
  {name: 'Reply из чужой группы', input: {...base, chatType: 'supergroup', chatId: '-100901', replyToMessageId: '912'}, output: 4},
];
for (const fixture of fixtures) assert.equal(route(fixture.input), fixture.output, fixture.name);
ok(`${fixtures.length} routing fixtures покрывают preview, allowlist, bot/self, new/known user и group Reply`);

const routeBranches = workflow.connections['Новый / известный / ответ?'].main;
assert.equal(routeBranches.length, 5);
assert.deepEqual(routeBranches[0], []);
assert.equal(routeBranches[1][0].node, 'Отправить в группу');
assert.equal(routeBranches[2][0].node, 'Отправить в группу');
assert.equal(routeBranches[3][0].node, 'Поиск chat_id отправителя');
assert.deepEqual(routeBranches[4], []);
ok('manual/rejected маршруты ничего не вызывают, а private и operator Reply разделены');

const messages = node('Новое сообщение');
const users = node('Новый/старый пользователь');
const lookup = node('Поиск chat_id отправителя');
assert.equal(messages.type, 'n8n-nodes-base.googleSheets');
assert.equal(messages.parameters.operation, 'append');
assert.equal(messages.parameters.sheetName.value, 'messages');
assert.deepEqual(Object.keys(messages.parameters.columns.value), [
  'user_chat_id',
  'user_message_id',
  'group_message_id',
  'text',
  'received_at',
  'route',
]);
assert.equal(users.parameters.operation, 'appendOrUpdate');
assert.equal(users.parameters.sheetName.value, 'users');
assert.deepEqual(users.parameters.columns.matchingColumns, ['chat_id']);
assert.equal(lookup.parameters.operation, 'read');
assert.equal(lookup.parameters.filtersUI.values[0].lookupColumn, 'group_message_id');
assert.equal(lookup.parameters.options.returnFirstMatch, true);
ok('messages хранит связь group_message_id, users обновляется по chat_id, lookup возвращает одну строку');

const sendNodes = workflow.nodes.filter(({type}) => type === 'n8n-nodes-base.telegram');
assert.equal(sendNodes.length, 2);
for (const sendNode of sendNodes) {
  assert.equal(sendNode.typeVersion, 1.2);
  assert.equal(sendNode.parameters.operation, 'sendMessage');
  assert.equal(sendNode.parameters.additionalFields.appendAttribution, false);
  assert.equal(sendNode.parameters.additionalFields.disable_web_page_preview, true);
  assert.equal(sendNode.credentials.telegramApi.id, 'REPLACE_WITH_TELEGRAM_CREDENTIAL_ID');
}
const gate = node('Отправка разрешена?');
assert.equal(gate.type, 'n8n-nodes-base.if');
assert.equal(gate.parameters.conditions.combinator, 'and');
assert.equal(gate.parameters.conditions.conditions.length, 2);
assert.match(JSON.stringify(gate.parameters), /sendEnabled/);
assert.match(JSON.stringify(gate.parameters), /allowedPrivateChatIds/);
assert.equal(workflow.connections['Отправка разрешена?'].main[0][0].node, 'Отправка ответного сообщения');
ok('ответ пользователю защищён повторной проверкой sendEnabled и allowlist');

const serialized = JSON.stringify(workflow);
assert.ok(!/(bot[0-9]{6,}:[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._~+/-]{16,}|sk-[A-Za-z0-9]{16,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/.test(serialized));
for (const workflowNode of workflow.nodes) {
  for (const credential of Object.values(workflowNode.credentials ?? {})) {
    assert.match(credential.id, /^REPLACE_WITH_[A-Z0-9_]+$/);
  }
}
assert.equal(new Set(workflow.nodes.map(({id}) => id)).size, workflow.nodes.length);
ok('JSON не содержит secrets, реальных chat ID или повторяющихся node IDs');

console.log(`1..${assertionCount}`);
