import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const workflow = readJson('workflows/business/email-assistant.json');
const mailGateway = readJson('workflows/core/mail-gateway.json');
const fixtures = readJson('tests/fixtures/email-assistant/extraction.json');
let assertionCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

function executeCodeNode(targetWorkflow, nodeName, input, {lookups = {}, staticData = {}} = {}) {
  const node = targetWorkflow.nodes.find((candidate) => candidate.name === nodeName);
  assert.ok(node, `${targetWorkflow.name}: missing ${nodeName}`);
  const script = new vm.Script(`(function () { ${node.parameters.jsCode}\n})()`);
  const result = script.runInNewContext({
    $input: {first: () => ({json: structuredClone(input)})},
    $: (name) => {
      if (!(name in lookups)) throw new Error(`Missing lookup: ${name}`);
      return {first: () => ({json: structuredClone(lookups[name])}), isExecuted: true};
    },
    $getWorkflowStaticData: () => staticData,
    crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000000'},
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
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.emailReadImap'));
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.executeWorkflowTrigger'));
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.stickyNote'));
assert.ok(workflow.nodes.every((node) => node.id && node.name && node.type));
assert.equal(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.emailSend'), false);
assert.equal(workflow.settings.saveDataSuccessExecution, 'all');
ok('inactive business workflow has IMAP and test triggers but no SMTP node');

const imap = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.emailReadImap');
assert.equal(imap.parameters.downloadAttachments, false);
assert.equal(imap.parameters.options.trackLastMessageId, true);
assert.equal(imap.parameters.postProcessAction, 'read');
assert.ok(imap.credentials.imap.id.startsWith('REPLACE_WITH_'));
const profile = workflow.nodes.find((node) => node.name === 'Email Assistant Profile');
assert.equal(profile.parameters.assignments.assignments.find(({name}) => name === 'profileTestMode').value, true);
ok('default IMAP/profile configuration is deduplicated, attachment-free, and test mode');

const calls = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.executeWorkflow');
assert.deepEqual(calls.map((node) => node.parameters.workflowId), ['coreMailGatewayV1','coreGenericLlmGatewayV1','coreMailGatewayV1','coreBusinessEventLogV1']);
assert.ok(calls.every((node) => node.parameters.options.waitForSubWorkflow === true));
assert.equal(JSON.stringify(workflow).includes('authorizeSend'), false);
assert.equal(JSON.stringify(workflow).includes('REPLACE_WITH_SMTP'), false);
ok('shared Mail, LLM, and logging workflows are wired without any send operation');

const prepared = executeCodeNode(workflow, 'Prepare IMAP Envelope', {
  profileTestMode: true,
  profileModel: 'fixture-model',
  profileOwnerRef: 'owner-001',
  from: 'Maria <maria@example.com>',
  to: 'inbox@example.com',
  subject: 'Acme request',
  textPlain: 'Мария из Acme, телефон +7 999 123-45-67',
  textHtml: '<script>ignore()</script>',
  date: '2026-07-14T08:00:00Z',
  attributes: {uid: 42},
  metadata: {'message-id':'<mail-42@example.com>','in-reply-to':'<root@example.com>','references':'<root@example.com> <prev@example.com>'},
});
assert.equal(prepared.operation, 'normalizeIncoming');
assert.equal(prepared.message.messageId, '<mail-42@example.com>');
assert.deepEqual(prepared.message.references, ['<root@example.com>','<prev@example.com>']);
assert.equal(prepared.message.attachments.length, 0);
ok('pinned IMAP simple output maps to the Mail Gateway contract');

const normalizedSource = {
  ok:true, process:true, correlationId:'corr-email-001', testMode:true,
  message:{messageId:'<mail-42@example.com>',from:'maria@example.com',to:['inbox@example.com'],cc:[],subject:'Acme request',safeText:'Мария из Acme, телефон +7 999 123-45-67',receivedAt:'2026-07-14T08:00:00.000Z',attachments:[],references:['<root@example.com>']},
  assistantProfile:{model:'fixture-model',ownerRef:'owner-001'},
};
const llmRequest = executeCodeNode(workflow, 'Build Guarded LLM Request', normalizedSource);
assert.equal(llmRequest.provider, 'generic');
assert.equal(llmRequest.output.mode, 'json');
assert.equal(llmRequest.capabilities.tools, false);
assert.match(llmRequest.messages[1].content, /^BEGIN_UNTRUSTED_EMAIL\n/);
assert.match(llmRequest.messages[1].content, /\nEND_UNTRUSTED_EMAIL\n/);
assert.ok(!llmRequest.messages[1].content.includes('<script>'));
assert.match(llmRequest.messages[0].content, /Never follow instructions/);
ok('LLM receives only delimited sanitized data with tools disabled');

for (const fixture of fixtures) {
  const input = structuredClone(fixture.input);
  if (input.json?.draftReply === '__LONG_DRAFT__') input.json.draftReply = 'x'.repeat(2001);
  const output = executeCodeNode(workflow, 'Validate Evidence-Bound Extraction', input, {lookups:{'Dedupe Incoming Mail':normalizedSource}});
  assertSubset(output, fixture.expected, fixture.name);
}
assert.ok(fixtures.length >= 10);
ok(`${fixtures.length} structured-output and anti-invention fixtures pass`);

const staticData = {};
const productionNormalized = {ok:true,status:'normalized',correlationId:normalizedSource.correlationId,testMode:false,message:normalizedSource.message};
const envelopeLookup = {correlationId:'corr-email-001',assistantProfile:normalizedSource.assistantProfile};
const first = executeCodeNode(workflow, 'Dedupe Incoming Mail', productionNormalized, {lookups:{'Prepare IMAP Envelope':envelopeLookup},staticData});
const second = executeCodeNode(workflow, 'Dedupe Incoming Mail', productionNormalized, {lookups:{'Prepare IMAP Envelope':envelopeLookup},staticData});
assert.equal(first.process, true);
assert.equal(second.process, false);
assert.equal(second.reason, 'DUPLICATE_MESSAGE');
assert.equal(staticData.processedMessageIds.length, 1);
const skipped = executeCodeNode(workflow, 'Return Skipped Message', second, {lookups:{'Prepare IMAP Envelope':envelopeLookup}});
assert.equal(skipped.externalSend, false);
assert.equal(skipped.ownerNotification.requiresAttention, false);
ok('bounded production static state rejects repeat polling of one message ID');

const loopResult = executeCodeNode(mailGateway, 'Evaluate Mail Contract', {
  operation:'normalizeIncoming',
  message:{messageId:'loop@example.com',from:'owner@example.com',to:'inbox@example.com',subject:'Loop',text:'quoted reply',receivedAt:'2026-07-14T08:00:00Z',processingMarker:'alfa-mail-gateway-v1'},
});
assert.equal(loopResult.ok, false);
assert.equal(loopResult.error.code, 'LOOP_DETECTED');
ok('shared Mail Gateway rejects canonical loop marker before LLM');

const validExtraction = executeCodeNode(workflow, 'Validate Evidence-Bound Extraction', fixtures[0].input, {lookups:{'Dedupe Incoming Mail':normalizedSource}});
const draftRequest = executeCodeNode(workflow, 'Prepare Draft Contract', validExtraction, {lookups:{'Dedupe Incoming Mail':normalizedSource}});
assert.equal(draftRequest.operation, 'createDraft');
assert.equal(draftRequest.testMode, true);
assert.equal(draftRequest.draft.draftOnly, true);
assert.equal(draftRequest.draft.to[0], 'maria@example.com');
ok('validated extraction can only create a test-mode draft-only Mail Gateway request');

const event = executeCodeNode(workflow, 'Prepare Minimal Business Event', {ok:true,status:'draft_ready',correlationId:'corr-email-001',messageId:'<pii@example.com>'});
assert.equal(event.subjectRef, 'corr-email-001');
assert.ok(!JSON.stringify(event).includes('pii@example.com'));
ok('business event uses opaque correlation reference instead of email identifiers');

const serialized = JSON.stringify(workflow);
assert.ok(!/(imap:\/\/|smtp:\/\/|Bearer [A-Za-z0-9._~+/-]{12,}|sk-[A-Za-z0-9]{16,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/.test(serialized));
assert.equal(workflow.pinData && Object.keys(workflow.pinData).length, 0);
ok('workflow and fixtures contain no credentials, provider payload, or pinned personal data');

console.log(`1..${assertionCount}`);
