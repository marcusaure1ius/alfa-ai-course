import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const catalog = readJson('tests/fixtures/workflow-catalog.json');
const demos = catalog.demos.map((demo) => ({...demo, workflowJson: readJson(demo.workflow)}));
const stickyType = 'n8n-nodes-base.stickyNote';
const codeTypes = new Set([
  'n8n-nodes-base.code',
  'n8n-nodes-base.function',
  'n8n-nodes-base.functionItem',
]);
const directOutboundTypes = new Set([
  'n8n-nodes-base.telegram',
  'n8n-nodes-base.emailSend',
]);

let assertionCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

assert.equal(demos.length, 10);
assert.deepEqual(demos.map(({lesson}) => lesson), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
ok('каталог содержит десять уроков в понятном порядке');

const providerProfiles = new Map([
  ['businessTelegramAssistantV1', {
    url: 'https://ai.api.cloud.yandex.net/v1/chat/completions',
    credential: 'REPLACE_WITH_YANDEX_AI_STUDIO_CREDENTIAL_ID',
  }],
  ['businessEmailAssistantV1', {
    url: 'https://ai.api.cloud.yandex.net/v1/chat/completions',
    credential: 'REPLACE_WITH_YANDEX_AI_STUDIO_CREDENTIAL_ID',
  }],
  ['businessGuardedLeadHandlerV1', {
    url: 'https://ai.api.cloud.yandex.net/v1/chat/completions',
    credential: 'REPLACE_WITH_YANDEX_AI_STUDIO_CREDENTIAL_ID',
  }],
  ['businessDailyExecutiveDigestV1', {
    url: 'https://ai.api.cloud.yandex.net/v1/chat/completions',
    credential: 'REPLACE_WITH_YANDEX_AI_STUDIO_CREDENTIAL_ID',
  }],
  ['businessRfEmailTelegramTriageV1', {
    url: 'https://ai.api.cloud.yandex.net/v1/chat/completions',
    credential: 'REPLACE_WITH_YANDEX_AI_STUDIO_CREDENTIAL_ID',
  }],
  ['businessPolzaTextToImageV1', {
    url: 'https://polza.ai/api/v2/images/generations',
    credential: 'REPLACE_WITH_POLZA_AI_CREDENTIAL_ID',
  }],
  ['businessPolzaImageEditV1', {
    url: 'https://polza.ai/api/v1/media',
    credential: 'REPLACE_WITH_POLZA_AI_CREDENTIAL_ID',
  }],
  ['businessTelegramLeadIntakeV1', {
    url: 'https://polza.ai/api/v1/chat/completions',
    credential: 'REPLACE_WITH_POLZA_AI_CREDENTIAL_ID',
  }],
  ['businessTelegramPersonalAgentV1', {
    url: 'https://polza.ai/api/v1/chat/completions',
    credential: 'REPLACE_WITH_POLZA_AI_CREDENTIAL_ID',
  }],
  ['businessAccountingDocumentReviewV1', {
    url: 'https://polza.ai/api/v1/chat/completions',
    credential: 'REPLACE_WITH_POLZA_AI_CREDENTIAL_ID',
  }],
]);

for (const {lesson, workflowJson: workflow} of demos) {
  const executable = workflow.nodes.filter(({type}) => type !== stickyType);
  const notes = workflow.nodes.filter(({type}) => type === stickyType);
  const mainBranches = Object.values(workflow.connections)
    .flatMap((connection) => connection.main ?? [])
    .filter(Array.isArray);

  assert.equal(workflow.active, false, `${workflow.id}: workflow должен быть выключен`);
  assert.match(workflow.name, new RegExp(`Урок ${lesson}`), `${workflow.id}: номер урока`);
  assert.ok(executable.length <= 10, `${workflow.id}: не больше 10 исполняемых блоков`);
  assert.ok(executable.length >= 4, `${workflow.id}: сценарий не должен быть пустым`);
  assert.ok(notes.length >= 2, `${workflow.id}: нужны две обучающие заметки`);
  assert.ok(notes.some(({parameters}) => /^# .+/m.test(parameters.content ?? '')
    && /1\./.test(parameters.content ?? '')), `${workflow.id}: заметка со стартом и первым действием`);
  assert.ok(workflow.nodes.every(({type}) => !codeTypes.has(type)), `${workflow.id}: Code/Function nodes запрещены`);
  assert.ok(!JSON.stringify(workflow).includes('"jsCode"'), `${workflow.id}: встроенный jsCode запрещён`);
  assert.ok(executable.some(({type}) => type === 'n8n-nodes-base.manualTrigger'), `${workflow.id}: ручной тест`);
  assert.ok(executable.some(({type}) => type === 'n8n-nodes-base.set'), `${workflow.id}: визуальный Edit Fields`);
  assert.ok(executable.every(({type}) => type !== 'n8n-nodes-base.executeWorkflow'), `${workflow.id}: служебные sub-workflow запрещены`);
  assert.ok(executable.every(({name}) => /[А-Яа-яЁё]/.test(name)), `${workflow.id}: русские названия блоков`);
  assert.ok(mainBranches.every((branch) => branch.length <= 3), `${workflow.id}: не больше трёх веток из блока`);
  assert.ok(executable.every(({type}) => !directOutboundTypes.has(type)), `${workflow.id}: нет прямой опасной отправки`);
  const llmNodes = executable.filter(({type}) => type === 'n8n-nodes-base.httpRequest');
  assert.equal(llmNodes.length, 1, `${workflow.id}: один визуальный LLM HTTP node`);
  const provider = providerProfiles.get(workflow.id);
  assert.ok(provider, `${workflow.id}: описан профиль провайдера`);
  assert.equal(llmNodes[0].parameters.url, provider.url, `${workflow.id}: фиксированный endpoint`);
  assert.equal(llmNodes[0].parameters.authentication, 'genericCredentialType', `${workflow.id}: credential-only auth`);
  assert.equal(llmNodes[0].credentials?.httpHeaderAuth?.id, provider.credential, `${workflow.id}: placeholder credential`);
}
ok('десять standalone-уроков проходят beginner UX gate: 4–10 блоков, русские подписи, заметки, ноль Code nodes и ноль sub-workflows');

const realTriggerTypes = new Map([
  ['businessTelegramAssistantV1', 'n8n-nodes-base.telegramTrigger'],
  ['businessEmailAssistantV1', 'n8n-nodes-base.emailReadImap'],
  ['businessGuardedLeadHandlerV1', 'n8n-nodes-base.webhook'],
  ['businessDailyExecutiveDigestV1', 'n8n-nodes-base.scheduleTrigger'],
  ['businessRfEmailTelegramTriageV1', 'n8n-nodes-base.emailReadImap'],
  ['businessPolzaTextToImageV1', 'n8n-nodes-base.webhook'],
  ['businessPolzaImageEditV1', 'n8n-nodes-base.webhook'],
  ['businessTelegramLeadIntakeV1', 'n8n-nodes-base.telegramTrigger'],
  ['businessTelegramPersonalAgentV1', 'n8n-nodes-base.telegramTrigger'],
  ['businessAccountingDocumentReviewV1', 'n8n-nodes-base.webhook'],
]);
for (const {workflowJson: workflow} of demos) {
  assert.ok(workflow.nodes.some(({type}) => type === realTriggerTypes.get(workflow.id)), `${workflow.id}: реальный trigger рядом с ручным примером`);
}
ok('каждый урок показывает ручной пример и соответствующий реальный trigger');

for (const id of ['businessDailyExecutiveDigestV1', 'businessRfEmailTelegramTriageV1']) {
  const workflow = demos.find(({workflowJson}) => workflowJson.id === id).workflowJson;
  assert.ok(workflow.nodes.some(({type, name}) => type === 'n8n-nodes-base.set'
    && /Telegram preview/.test(name)), `${id}: понятный preview в последнем блоке`);
  assert.ok(workflow.nodes.every(({type}) => type !== 'n8n-nodes-base.telegram'), `${id}: Telegram API не вызывается`);
}
ok('два Telegram-сценария заканчиваются локальным preview без API отправки');

const emailWorkflows = demos
  .map(({workflowJson}) => workflowJson)
  .filter((workflow) => workflow.nodes.some(({type}) => type === 'n8n-nodes-base.emailReadImap'));
for (const workflow of emailWorkflows) {
  const trigger = workflow.nodes.find(({type}) => type === 'n8n-nodes-base.emailReadImap');
  assert.equal(trigger.parameters.downloadAttachments, false, `${workflow.id}: вложения не загружаются`);
}
ok('почтовые уроки не загружают вложения и не отправляют письма');

for (const id of ['businessTelegramLeadIntakeV1', 'businessTelegramPersonalAgentV1']) {
  const workflow = demos.find(({workflowJson}) => workflowJson.id === id).workflowJson;
  const trigger = workflow.nodes.find(({type}) => type === 'n8n-nodes-base.telegramTrigger');
  assert.equal(trigger.parameters.additionalFields.download, false, `${id}: Telegram-вложения не загружаются`);
  assert.match(trigger.parameters.additionalFields.chatIds, /^REPLACE_WITH_/, `${id}: доступ ограничивается явным chat ID`);
  assert.ok(workflow.nodes.every(({type}) => type !== 'n8n-nodes-base.telegram'), `${id}: нет автоматического ответа в Telegram`);
}
ok('новые Telegram-уроки требуют allowlist chat ID и заканчиваются локальным preview');

const accounting = demos.find(({workflowJson}) => workflowJson.id === 'businessAccountingDocumentReviewV1').workflowJson;
assert.match(JSON.stringify(accounting), /бухгалтером|бухгалтерской/i);
assert.match(JSON.stringify(accounting), /не записывается|не переносите/i);
assert.ok(accounting.nodes.every(({type}) => ![
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.mySql',
  'n8n-nodes-base.googleSheets',
].includes(type)));
ok('бухгалтерский урок требует ручной сверки и не меняет учётные системы');

console.log(`1..${assertionCount}`);
