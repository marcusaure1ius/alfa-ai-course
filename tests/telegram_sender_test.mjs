import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const workflow = readJson('workflows/core/send-telegram-message.json');
const fixtures = readJson('tests/fixtures/telegram/contracts.json');
const validationNode = workflow.nodes.find((node) => node.name === 'Validate Telegram Send Contract');
const normalizationNode = workflow.nodes.find((node) => node.name === 'Normalize Telegram Result');
let assertionCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

function executeValidation(fixture, state) {
  const input = structuredClone(fixture.input);
  if (input.textRepeat) {
    input.text = input.textRepeat.value.repeat(input.textRepeat.count);
    delete input.textRepeat;
  }
  Object.assign(input, structuredClone(fixture.profile));
  const script = new vm.Script(`(function () { ${validationNode.parameters.jsCode}\n})()`);
  const result = script.runInNewContext({
    $input: {first: () => ({json: input})},
    $getWorkflowStaticData: (scope) => { assert.equal(scope, 'global'); return state; },
    crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000000'},
  });
  assert.ok(Array.isArray(result) && result.length === 1 && result[0]?.json);
  return structuredClone(result[0].json);
}

function executeNormalization(response, context, state) {
  const script = new vm.Script(`(function () { ${normalizationNode.parameters.jsCode}\n})()`);
  const result = script.runInNewContext({
    $input: {first: () => ({json: structuredClone(response)})},
    $: (name) => { assert.equal(name, 'Validate Telegram Send Contract'); return {first: () => ({json: structuredClone(context)})}; },
    $getWorkflowStaticData: (scope) => { assert.equal(scope, 'global'); return state; },
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
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.executeWorkflowTrigger'));
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.stickyNote'));
assert.equal(workflow.settings.saveDataErrorExecution, 'none');
assert.equal(workflow.settings.saveDataSuccessExecution, 'none');
ok('Telegram sender is reusable, inactive, and does not retain execution payloads');

const profile = workflow.nodes.find((node) => node.name === 'Telegram Safety Profile - Edit Me');
const telegram = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.telegram');
assert.ok(profile && telegram);
assert.equal(profile.parameters.includeOtherFields, true);
assert.equal(profile.parameters.assignments.assignments.find(({name}) => name === 'profileTestMode').value, true);
assert.equal(profile.parameters.assignments.assignments.find(({name}) => name === 'profileDraftOnly').value, true);
assert.equal(telegram.typeVersion, 1.2);
assert.equal(telegram.parameters.resource, 'message');
assert.equal(telegram.parameters.operation, 'sendMessage');
assert.equal(telegram.parameters.additionalFields.disable_web_page_preview, true);
assert.equal(telegram.parameters.additionalFields.appendAttribution, false);
assert.equal(telegram.onError, 'continueRegularOutput');
assert.equal(telegram.retryOnFail, undefined);
assert.equal(telegram.credentials.telegramApi.id, 'REPLACE_WITH_TELEGRAM_CREDENTIAL_ID');
assert.ok(!/(bot[0-9]+:|access[_-]?token|Bearer |api[_-]?key|password)/i.test(JSON.stringify(workflow)));
ok('pinned Telegram node uses only a credential reference and has no automatic retry');

const branches = workflow.connections['External Send Authorized?'].main;
assert.ok(branches[0].some(({node}) => node === 'Send Allowlisted Plain Text'));
assert.ok(branches[1].some(({node}) => node === 'Safe Preview Draft Rejection or Duplicate'));
assert.equal(workflow.connections['Telegram Safety Profile - Edit Me'].main[0][0].node, 'Validate Telegram Send Contract');
assert.equal(workflow.connections['Validate Telegram Send Contract'].main[0][0].node, 'External Send Authorized?');
ok('allowlist and mode validation precede the only Telegram send branch');

const state = {};
for (const fixture of fixtures.validation) {
  const output = executeValidation(fixture, state);
  assertSubset(output, fixture.expected, fixture.name);
  assert.equal('text' in output, false, `${fixture.name}: output must not echo message text`);
  if (output.telegram) assert.equal(output.sendAuthorized, true, `${fixture.name}: transport data only exists for authorized send`);
}
assert.ok(fixtures.validation.length >= 10);
ok(`${fixtures.validation.length} validation, allowlist, mode, length, and duplicate fixtures pass`);

assert.equal(Object.keys(state.telegramSendReservations).length, 1);
assert.equal(state.telegramSendReservations['key:telegram-012'].status, 'reserved');
ok('production idempotency key is reserved before the provider call and duplicate is suppressed');

const authorized = executeValidation({input:{testMode:false,draftOnly:false,idempotencyKey:'normalize-001',chatId:'123450099',text:'Send'},profile:{profileAllowedChatIds:'123450099',profileTestMode:false,profileDraftOnly:false}}, state);
for (const fixture of fixtures.providerResponses) {
  const output = executeNormalization(fixture.response, authorized, state);
  assertSubset(output, fixture.expected, fixture.name);
  assert.equal('description' in output, false, `${fixture.name}: provider description must not escape normalization`);
  assert.equal('text' in output, false, `${fixture.name}: message text must not escape normalization`);
}
ok(`${fixtures.providerResponses.length} Telegram API result classes are normalized without raw payloads`);

assert.equal(state.telegramSendReservations['key:normalize-001'].status, 'reconcile-required');
ok('ambiguous provider outcomes remain reserved and require reconciliation');

console.log(`1..${assertionCount}`);
