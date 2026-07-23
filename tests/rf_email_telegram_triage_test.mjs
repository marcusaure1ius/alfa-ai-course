import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const workflow = readJson('workflows/business/rf-email-telegram-triage.json');
const fixtures = readJson('tests/fixtures/rf-email-telegram-triage/contracts.json');
let assertionCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

function executeCodeNode(nodeName, input, {lookups = {}, staticData = {}} = {}) {
  const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
  assert.ok(node, `missing node ${nodeName}`);
  const script = new vm.Script(`(function () { ${node.parameters.jsCode}\n})()`);
  const result = script.runInNewContext({
    $input: {first: () => ({json: structuredClone(input)})},
    $: (name) => ({
      first: () => ({json: structuredClone(lookups[name])}),
      isExecuted: lookups[name] !== undefined,
    }),
    $getWorkflowStaticData: () => staticData,
    crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000040'},
  });
  assert.ok(Array.isArray(result) && result.length === 1 && result[0]?.json);
  return structuredClone(result[0].json);
}

function assertSubset(actual, expected, label) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    assert.ok(actual && typeof actual === 'object', `${label}: expected object`);
    for (const [key, value] of Object.entries(expected)) assertSubset(actual[key], value, `${label}.${key}`);
    return;
  }
  assert.deepEqual(actual, expected, label);
}

assert.equal(workflow.active, false);
assert.equal(workflow.settings.timezone, 'Europe/Moscow');
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.emailReadImap'));
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.executeWorkflowTrigger'));
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.stickyNote'));
assert.ok(workflow.nodes.every((node) => !['n8n-nodes-base.telegram', 'n8n-nodes-base.emailSend', 'n8n-nodes-base.httpRequest'].includes(node.type)));
ok('workflow is inactive, Moscow-oriented, testable, and has no direct outbound node');

const imap = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.emailReadImap');
assert.equal(imap.parameters.downloadAttachments, false);
assert.equal(imap.parameters.format, 'simple');
assert.equal(imap.parameters.postProcessAction, 'read');
assert.equal(imap.parameters.options.trackLastMessageId, true);
assert.match(imap.credentials.imap.id, /^REPLACE_WITH_/);
const profile = workflow.nodes.find((node) => node.name === 'RF Triage Profile');
const profileValues = Object.fromEntries(profile.parameters.assignments.assignments.map(({name, value}) => [name, value]));
assert.equal(profileValues.profileTestMode, true);
assert.equal(profileValues.profileDraftOnly, true);
assert.equal(profileValues.profileLlmProvider, 'yandex');
assert.equal(profileValues.profileNotifyMinPriority, 'high');
assert.equal(profileValues.profileMaxLlmTextChars, 6000);
ok('IMAP and profile defaults are attachment-free, preview-only, and bounded');

const calls = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.executeWorkflow');
assert.deepEqual(calls.map((node) => node.parameters.workflowId), [
  'coreMailGatewayV1',
  "={{ ({generic:'coreGenericLlmGatewayV1',yandex:'adapterYandexAiStudioLlmV1',gigachat:'adapterGigaChatLlmV1'})[$('RF Triage Profile').first().json.profileLlmProvider] }}",
  'coreSendTelegramMessageV1',
  'coreBusinessEventLogV1',
]);
assert.ok(calls.every((node) => node.parameters.options.waitForSubWorkflow === true));
assert.ok(!calls[1].parameters.workflowId.includes('$json'));
ok('Mail, LLM, Telegram, and logging behavior stays behind shared contracts');

const prepared = executeCodeNode('Prepare IMAP Envelope', {
  ...profileValues,
  from: 'Мария <maria@example.com>',
  to: 'owner@example.test',
  subject: 'Срочный запрос',
  textPlain: 'Нужно обсудить заказ.',
  textHtml: '<script>do not forward</script>',
  date: '2026-07-23T06:00:00Z',
  attributes: {uid: 40},
  metadata: {'message-id': '<rf-triage-40@example.test>'},
});
assert.equal(prepared.operation, 'normalizeIncoming');
assert.equal(prepared.message.messageId, '<rf-triage-40@example.test>');
assert.deepEqual(prepared.message.attachments, []);
assert.equal(prepared.triageProfile.llmProvider, 'yandex');
assert.equal(prepared.triageProfile.maxLlmTextChars, 6000);
ok('IMAP simple payload maps to the shared Mail Gateway without binary attachments');

const normalizedSource = {
  ok: true,
  process: true,
  correlationId: 'rf-triage-corr-001',
  testMode: true,
  message: {
    messageId: '<rf-triage-40@example.test>',
    from: 'Мария <maria@example.com>',
    to: ['owner@example.test'],
    cc: [],
    subject: 'Срочный запрос',
    safeText: `${'A'.repeat(7000)}<script>never</script>`,
    receivedAt: '2026-07-23T06:00:00.000Z',
    attachments: [],
  },
  triageProfile: {
    testMode: true,
    draftOnly: true,
    model: 'fixture-model',
    llmProvider: 'yandex',
    ownerChatId: '123450040',
    notifyMinPriority: 'high',
    maxLlmTextChars: 6000,
  },
};
const request = executeCodeNode('Build Minimized Triage Request', normalizedSource);
assert.equal(request.provider, 'yandex');
assert.equal(request.output.mode, 'json');
assert.equal(request.capabilities.tools, false);
assert.match(request.messages[0].content, /untrusted data/);
const untrustedText = request.messages[1].content;
assert.match(untrustedText, /^BEGIN_UNTRUSTED_EMAIL\n/);
assert.match(untrustedText, /"senderDomain":"example.com"/);
assert.ok(!untrustedText.includes('maria@example.com'));
assert.ok(!untrustedText.includes('<script>never</script>'));
assert.ok(untrustedText.length < 7000);
ok('LLM prompt is delimited, domain-only, tool-free, and capped before provider access');

for (const fixture of fixtures) {
  const source = structuredClone(normalizedSource);
  if (fixture.source?.notifyMinPriority) source.triageProfile.notifyMinPriority = fixture.source.notifyMinPriority;
  const output = executeCodeNode('Validate Triage Result', fixture.input, {lookups: {'Dedupe Incoming Mail': source}});
  assertSubset(output, fixture.expected, fixture.name);
}
assert.ok(fixtures.length >= 10);
ok(`${fixtures.length} local schema, threshold, and fail-closed fixtures pass`);

const valid = executeCodeNode('Validate Triage Result', fixtures[0].input, {lookups: {'Dedupe Incoming Mail': normalizedSource}});
const telegram = executeCodeNode('Prepare Telegram Alert Contract', valid, {lookups: {'Dedupe Incoming Mail': normalizedSource}});
assert.equal(telegram.testMode, true);
assert.equal(telegram.draftOnly, true);
assert.equal(telegram.chatId, '123450040');
assert.match(telegram.text, /m\*\*\*@example\.com/);
assert.ok(!telegram.text.includes('maria@example.com'));
assert.ok(!telegram.text.includes('A'.repeat(100)));
assert.match(telegram.text, /рекомендация LLM/);
ok('Telegram receives a preview contract with masked sender and no raw email body');

const staticData = {};
const normalized = {ok: true, status: 'normalized', correlationId: normalizedSource.correlationId, testMode: false, message: normalizedSource.message};
const envelope = {correlationId: normalizedSource.correlationId, triageProfile: {...normalizedSource.triageProfile, testMode: false}};
const first = executeCodeNode('Dedupe Incoming Mail', normalized, {lookups: {'Prepare IMAP Envelope': envelope}, staticData});
const second = executeCodeNode('Dedupe Incoming Mail', normalized, {lookups: {'Prepare IMAP Envelope': envelope}, staticData});
assert.equal(first.process, true);
assert.equal(second.process, false);
assert.equal(second.reason, 'DUPLICATE_MESSAGE');
assert.equal(staticData.processedMessageIds.length, 1);
ok('bounded production dedupe rejects the same message ID before a second LLM call');

const event = executeCodeNode('Prepare Minimal Triage Event', {
  ok: true,
  status: 'notification_preview',
  correlationId: 'rf-triage-corr-001',
  messageId: '<private@example.test>',
});
assert.equal(event.subjectRef, 'rf-triage-corr-001');
assert.equal(event.metadata.channel, 'telegram');
assert.ok(!JSON.stringify(event).includes('private@example.test'));
ok('business event is opaque and excludes message IDs, content, and addresses');

const serialized = JSON.stringify(workflow) + JSON.stringify(fixtures);
assert.ok(!/(imap:\/\/|smtp:\/\/|Bearer [A-Za-z0-9._~+/-]{12,}|sk-[A-Za-z0-9]{16,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/.test(serialized));
assert.deepEqual(workflow.pinData, {});
ok('workflow and fixtures contain no secret value or pinned production data');

console.log(`1..${assertionCount}`);
