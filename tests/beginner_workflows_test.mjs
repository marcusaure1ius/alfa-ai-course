import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const catalog = readJson('tests/fixtures/workflow-catalog.json');
const demos = catalog.demos.map((demo) => ({...demo, workflowJson: readJson(demo.workflow)}));
const helper = readJson('workflows/helpers/beginner-yandex-prompt.json');
const stickyType = 'n8n-nodes-base.stickyNote';
const codeTypes = new Set([
  'n8n-nodes-base.code',
  'n8n-nodes-base.function',
  'n8n-nodes-base.functionItem',
]);
const directOutboundTypes = new Set([
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.telegram',
  'n8n-nodes-base.emailSend',
]);

let assertionCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

assert.equal(demos.length, 5);
assert.deepEqual(demos.map(({lesson}) => lesson), [1, 2, 3, 4, 5]);
ok('каталог содержит пять уроков в понятном порядке');

for (const {lesson, workflowJson: workflow} of demos) {
  const executable = workflow.nodes.filter(({type}) => type !== stickyType);
  const notes = workflow.nodes.filter(({type}) => type === stickyType);
  const mainBranches = Object.values(workflow.connections)
    .flatMap((connection) => connection.main ?? [])
    .filter(Array.isArray);

  assert.equal(workflow.active, false, `${workflow.id}: workflow должен быть выключен`);
  assert.match(workflow.name, new RegExp(`Урок ${lesson}`), `${workflow.id}: номер урока`);
  assert.ok(executable.length <= 12, `${workflow.id}: не больше 12 исполняемых блоков`);
  assert.ok(executable.length >= 4, `${workflow.id}: сценарий не должен быть пустым`);
  assert.ok(notes.length >= 2, `${workflow.id}: нужны две обучающие заметки`);
  assert.ok(notes.some(({parameters}) => /^# .+/m.test(parameters.content ?? '')
    && /1\./.test(parameters.content ?? '')), `${workflow.id}: заметка со стартом и первым действием`);
  assert.ok(workflow.nodes.every(({type}) => !codeTypes.has(type)), `${workflow.id}: Code/Function nodes запрещены`);
  assert.ok(!JSON.stringify(workflow).includes('"jsCode"'), `${workflow.id}: встроенный jsCode запрещён`);
  assert.ok(executable.some(({type}) => type === 'n8n-nodes-base.manualTrigger'), `${workflow.id}: ручной тест`);
  assert.ok(executable.some(({type}) => type === 'n8n-nodes-base.set'), `${workflow.id}: визуальный Edit Fields`);
  assert.ok(executable.some(({type}) => type === 'n8n-nodes-base.executeWorkflow'), `${workflow.id}: вызов служебного workflow`);
  assert.ok(executable.every(({name}) => /[А-Яа-яЁё]/.test(name)), `${workflow.id}: русские названия блоков`);
  assert.ok(mainBranches.every((branch) => branch.length <= 3), `${workflow.id}: не больше трёх веток из блока`);
  assert.ok(executable.every(({type}) => !directOutboundTypes.has(type)), `${workflow.id}: нет прямой опасной отправки`);
  assert.ok(executable
    .filter(({type}) => type === 'n8n-nodes-base.executeWorkflow')
    .some(({parameters}) => parameters.workflowId === 'helperBeginnerYandexPromptV1'), `${workflow.id}: общий простой LLM helper`);
}
ok('пять business workflows проходят beginner UX gate: 4–12 блоков, русские подписи, заметки и ноль JavaScript nodes');

const realTriggerTypes = new Map([
  ['businessTelegramAssistantV1', 'n8n-nodes-base.telegramTrigger'],
  ['businessEmailAssistantV1', 'n8n-nodes-base.emailReadImap'],
  ['businessGuardedLeadHandlerV1', 'n8n-nodes-base.webhook'],
  ['businessDailyExecutiveDigestV1', 'n8n-nodes-base.scheduleTrigger'],
  ['businessRfEmailTelegramTriageV1', 'n8n-nodes-base.emailReadImap'],
]);
for (const {workflowJson: workflow} of demos) {
  assert.ok(workflow.nodes.some(({type}) => type === realTriggerTypes.get(workflow.id)), `${workflow.id}: реальный trigger рядом с ручным примером`);
}
ok('каждый урок показывает ручной пример и соответствующий реальный trigger');

for (const id of ['businessDailyExecutiveDigestV1', 'businessRfEmailTelegramTriageV1']) {
  const workflow = demos.find(({workflowJson}) => workflowJson.id === id).workflowJson;
  const assignments = workflow.nodes
    .filter(({type}) => type === 'n8n-nodes-base.set')
    .flatMap(({parameters}) => parameters.assignments?.assignments ?? []);
  const values = Object.fromEntries(assignments.map(({name, value}) => [name, value]));
  assert.equal(values.testMode, true, `${id}: testMode`);
  assert.equal(values.draftOnly, true, `${id}: draftOnly`);
  assert.ok(workflow.nodes.some(({type, parameters}) => type === 'n8n-nodes-base.executeWorkflow'
    && parameters.workflowId === 'coreSendTelegramMessageV1'), `${id}: безопасный Telegram gateway`);
}
ok('Telegram-доставка остаётся preview-only через общий безопасный gateway');

const emailWorkflows = demos
  .map(({workflowJson}) => workflowJson)
  .filter((workflow) => workflow.nodes.some(({type}) => type === 'n8n-nodes-base.emailReadImap'));
for (const workflow of emailWorkflows) {
  const trigger = workflow.nodes.find(({type}) => type === 'n8n-nodes-base.emailReadImap');
  assert.equal(trigger.parameters.downloadAttachments, false, `${workflow.id}: вложения не загружаются`);
}
ok('почтовые уроки не загружают вложения и не отправляют письма');

const helperExecutable = helper.nodes.filter(({type}) => type !== stickyType);
assert.equal(helper.active, false);
assert.ok(helperExecutable.length <= 4);
assert.ok(helper.nodes.every(({type}) => !codeTypes.has(type)));
assert.ok(!JSON.stringify(helper).includes('"jsCode"'));
assert.ok(helperExecutable.some(({type}) => type === 'n8n-nodes-base.set'));
assert.ok(helperExecutable.some(({type, parameters}) => type === 'n8n-nodes-base.executeWorkflow'
  && parameters.workflowId === 'adapterYandexAiStudioLlmV1'));
ok('служебный beginner helper тоже визуальный и не содержит JavaScript nodes');

console.log(`1..${assertionCount}`);
