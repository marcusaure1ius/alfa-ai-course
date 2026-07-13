import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const leadWorkflow = readJson('workflows/core/crm-generic-lead-upsert.json');
const taskWorkflow = readJson('workflows/core/crm-generic-task-create.json');
const bitrixWorkflow = readJson('workflows/adapters/crm-bitrix24.json');
const workflows = [leadWorkflow, taskWorkflow, bitrixWorkflow];
let assertionCount = 0;
let fixtureCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

function executeCodeNode(workflow, nodeName, input, lookups = {}) {
  const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
  assert.ok(node, `${workflow.name}: missing ${nodeName}`);
  const script = new vm.Script(`(function () { ${node.parameters.jsCode}\n})()`);
  const result = script.runInNewContext({
    $input: {first: () => ({json: structuredClone(input)})},
    $: (name) => {
      if (!(name in lookups)) throw new Error(`Missing lookup: ${name}`);
      return {first: () => ({json: structuredClone(lookups[name])})};
    },
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

function runContractFixtures(file, workflow, nodeName, profile) {
  const outputs = new Map();
  for (const fixture of readJson(`tests/fixtures/crm/${file}.json`)) {
    const output = executeCodeNode(workflow, nodeName, {...fixture.input, ...profile});
    assertSubset(output, fixture.expected, `${file}: ${fixture.name}`);
    outputs.set(fixture.name, output);
    fixtureCount += 1;
  }
  return outputs;
}

for (const workflow of workflows) {
  assert.equal(workflow.active, false);
  assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.stickyNote'));
  assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.executeWorkflowTrigger'));
  assert.ok(workflow.nodes.every((node) => node.id && node.name && node.type));
}
ok('three CRM exports are inactive reusable workflows with Sticky Notes');

const serialized = JSON.stringify(workflows);
assert.ok(!serialized.includes('/crm.lead.'));
assert.ok(serialized.includes('/crm.item.list.json'));
assert.ok(serialized.includes('/crm.item.add.json'));
assert.ok(serialized.includes('/crm.item.update.json'));
assert.ok(serialized.includes('/tasks.task.add.json'));
assert.ok(!/(sk-[A-Za-z0-9]{16,}|Bearer [A-Za-z0-9._~+/-]{12,}|\/rest\/\d+\/[A-Za-z0-9]{8,})/.test(serialized));
const httpNodes = workflows.flatMap((workflow) => workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.httpRequest'));
assert.equal(httpNodes.length, 6);
assert.ok(httpNodes.every((node) => node.parameters.genericAuthType === 'oAuth2Api'));
assert.ok(httpNodes.every((node) => node.parameters.options?.response?.response?.neverError === true));
assert.ok(httpNodes.every((node) => node.credentials?.oAuth2Api?.id?.startsWith('REPLACE_WITH_')));
ok('official Bitrix24 paths and credential-only HTTP calls contain no webhook or token');

for (const workflow of workflows) {
  const branches = workflow.connections['Mutation Enabled?'].main;
  assert.ok(branches[0].some(({node}) => workflow.nodes.find((candidate) => candidate.name === node)?.type !== 'n8n-nodes-base.code'));
  assert.ok(branches[1].some(({node}) => /Preview/.test(node)));
}
ok('default test-mode false branch reaches preview and bypasses HTTP mutation');

const genericProfile = {profileBaseUrl: 'https://crm.example.invalid/v1', profileTimeoutMs: 30000};
const bitrixProfile = {profileBaseUrl: 'https://portal.example.invalid/rest', profileTimeoutMs: 30000};
const leadOutputs = runContractFixtures('lead-contract', leadWorkflow, 'Prepare Lead Upsert', genericProfile);
const taskOutputs = runContractFixtures('task-contract', taskWorkflow, 'Prepare Task Create', genericProfile);
const bitrixOutputs = runContractFixtures('bitrix-contract', bitrixWorkflow, 'Prepare Bitrix24 Request', bitrixProfile);
assert.equal('company' in leadOutputs.get('valid preview preserves absent fields').fields, false);
assert.equal(leadOutputs.get('explicit clear is represented as null').fields.company, null);
assert.equal(bitrixOutputs.get('maps lead to universal CRM fields').request.lookupBody.entityTypeId, 1);
ok('absent, empty, explicit clear, provenance, and mapping contracts execute from workflow JSON');

const preparedLead = executeCodeNode(leadWorkflow, 'Prepare Lead Upsert', {
  testMode: false,
  idempotencyKey: 'lookup-lead-0001',
  lead: {externalId: 'ext-lookup', title: 'Approved lead', provenance: {title: 'user'}},
  ...genericProfile,
});
for (const fixture of readJson('tests/fixtures/crm/lead-lookup.json')) {
  const output = executeCodeNode(leadWorkflow, 'Plan Safe Lead Mutation', fixture.response, {'Prepare Lead Upsert': preparedLead});
  assertSubset(output, fixture.expected, `lead-lookup: ${fixture.name}`);
  fixtureCount += 1;
}
ok('generic duplicate lookup chooses zero/one safely and rejects ambiguous or API failures');

const preparedTask = executeCodeNode(taskWorkflow, 'Prepare Task Create', {
  testMode: false,
  idempotencyKey: 'response-task-0001',
  task: {title: 'Approved task', responsibleRef: '42', provenance: {title: 'user', responsibleRef: 'crm'}},
  ...genericProfile,
});
for (const fixture of readJson('tests/fixtures/crm/task-responses.json')) {
  const output = executeCodeNode(taskWorkflow, 'Normalize Task Result', fixture.response, {'Prepare Task Create': preparedTask});
  assertSubset(output, fixture.expected, `task-responses: ${fixture.name}`);
  fixtureCount += 1;
}
ok('generic task output normalizes success, idempotency, auth, rate, and service errors');

const preparedBitrixLead = executeCodeNode(bitrixWorkflow, 'Prepare Bitrix24 Request', {
  testMode: false,
  operation: 'lead.upsert',
  idempotencyKey: 'b24-lookup-0001',
  fields: {title: 'Approved lead'},
  provenance: {title: 'user'},
  ...bitrixProfile,
});
for (const fixture of readJson('tests/fixtures/crm/bitrix-lookup.json')) {
  const output = executeCodeNode(bitrixWorkflow, 'Plan Bitrix24 Lead Mutation', fixture.response, {'Prepare Bitrix24 Request': preparedBitrixLead});
  assertSubset(output, fixture.expected, `bitrix-lookup: ${fixture.name}`);
  assert.ok(!JSON.stringify(output).includes('sensitive provider text'));
  fixtureCount += 1;
}
ok('Bitrix24 upsert updates only one integration-owned lead and redacts provider errors');

const preparedBitrixTask = executeCodeNode(bitrixWorkflow, 'Prepare Bitrix24 Request', {
  testMode: false,
  operation: 'task.create',
  idempotencyKey: 'b24-response-task-0001',
  fields: {title: 'Approved task', responsibleRef: '42'},
  provenance: {title: 'user', responsibleRef: 'crm'},
  ...bitrixProfile,
});
for (const fixture of readJson('tests/fixtures/crm/bitrix-responses.json')) {
  const prepared = fixture.operation === 'lead.upsert' ? preparedBitrixLead : preparedBitrixTask;
  const output = executeCodeNode(bitrixWorkflow, 'Normalize Bitrix24 Result', fixture.response, {
    'Prepare Bitrix24 Request': prepared,
    'Plan Bitrix24 Lead Mutation': {...preparedBitrixLead, action: 'create'},
  });
  assertSubset(output, fixture.expected, `bitrix-responses: ${fixture.name}`);
  assert.ok(!JSON.stringify(output).includes('must not escape'));
  fixtureCount += 1;
}
ok('Bitrix24 task success is traceable and ambiguous outcomes require reconciliation without retry');

assert.ok(fixtureCount >= 10, `expected at least 10 fixtures, got ${fixtureCount}`);
assert.equal(fixtureCount, 39);
assert.equal(taskOutputs.get('production mode enables task mutation').mutate, true);
ok(`${fixtureCount} CRM fixtures cover duplicates, invalid values, test mode, mapping, and API errors`);

console.log(`1..${assertionCount}`);
