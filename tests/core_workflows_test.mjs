import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const definitions = [
  ['approval', 'request-human-approval.json', 'Evaluate Approval Contract'],
  ['normalization', 'normalize-incoming-message.json', 'Normalize Safe Message'],
  ['logging', 'log-business-event.json', 'Build Minimal Event Record'],
  ['errors', 'handle-workflow-error.json', 'Normalize Error Safely'],
];

let assertionCount = 0;
const codeLogs = new WeakMap();
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function executeCodeNode(workflow, nodeName, input) {
  const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
  assert.ok(node, `${workflow.name}: missing ${nodeName}`);
  const script = new vm.Script(`(function () { ${node.parameters.jsCode}\n})()`);
  const logs = [];
  const result = script.runInNewContext({
    $input: {first: () => ({json: structuredClone(input)})},
    crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000000'},
    console: {log: (...values) => logs.push(values.join(' '))},
  });
  assert.ok(Array.isArray(result) && result.length === 1 && result[0]?.json);
  const output = structuredClone(result[0].json);
  codeLogs.set(output, logs);
  return output;
}

function assertSubset(actual, expected, label) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    assert.ok(actual && typeof actual === 'object', `${label}: expected object`);
    for (const [key, value] of Object.entries(expected)) {
      assertSubset(actual[key], value, `${label}.${key}`);
    }
    return;
  }
  assert.deepEqual(actual, expected, label);
}

const workflows = new Map();
for (const [fixtureName, fileName, codeNodeName] of definitions) {
  const workflow = readJson(`workflows/core/${fileName}`);
  workflows.set(fixtureName, {workflow, codeNodeName});
  assert.equal(workflow.active, false, `${fileName}: inactive after import`);
  assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.stickyNote'), `${fileName}: Sticky Note`);
  assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.executeWorkflowTrigger'), `${fileName}: sub-workflow trigger`);
  assert.ok(workflow.nodes.every((node) => node.id && node.name && node.type), `${fileName}: complete nodes`);
}
ok('all workflow exports are inactive reusable workflows with Sticky Notes');

const serialized = JSON.stringify([...workflows.values()].map(({workflow}) => workflow));
assert.ok(!/(sk-[A-Za-z0-9]{16,}|Bearer [A-Za-z0-9._~+/-]{12,}|person@example\.test|\+70000000000)/.test(serialized));
assert.ok(!serialized.includes('n8n-nodes-base.httpRequest'));
assert.ok(!serialized.includes('credentials'));
ok('workflow exports contain no credentials, fixture PII, or provider calls');

let fixtureCount = 0;
const results = new Map();
for (const [fixtureName, {workflow, codeNodeName}] of workflows) {
  const fixtures = readJson(`tests/fixtures/core-workflows/${fixtureName}.json`);
  assert.ok(Array.isArray(fixtures) && fixtures.length > 0, `${fixtureName}: fixtures`);
  for (const fixture of fixtures) {
    const output = executeCodeNode(workflow, codeNodeName, fixture.input);
    assertSubset(output, fixture.expected, `${fixtureName}: ${fixture.name}`);
    results.set(`${fixtureName}:${fixture.name}`, output);
    fixtureCount += 1;
  }
}
assert.ok(fixtureCount >= 10, `expected at least 10 fixtures, got ${fixtureCount}`);
ok(`${fixtureCount} contract fixtures execute the JavaScript embedded in workflow JSON`);

for (const [key, output] of results) {
  if (key.startsWith('approval:') && output.status !== 'approved') assert.equal(output.allowAction, false, key);
}
assert.equal(results.get('approval:explicit approval allows action').allowAction, true);
ok('approval remains fail-closed except for one explicit unexpired decision');

const preview = results.get('logging:previews minimal event by default');
const emitted = results.get('logging:emits event only with explicit production mode');
assert.deepEqual(Object.keys(preview.record.metadata), ['workflowKey']);
assert.equal(results.get('logging:rejects PII metadata key').record, undefined);
assert.deepEqual(codeLogs.get(preview), []);
assert.equal(codeLogs.get(emitted).length, 1);
assert.ok(codeLogs.get(emitted)[0].startsWith('{"businessEvent":'));
assert.equal(workflows.get('logging').workflow.settings.saveDataSuccessExecution, 'none');
ok('business event output is minimal and PII fields are rejected');

const recursive = results.get('errors:prevents recursive invocation by depth');
assert.equal(recursive.recursionPrevented, true);
assert.equal(recursive.handled, false);
assert.equal(results.get('errors:redacts bearer and token values').error.message, 'Bearer [REDACTED] token=[REDACTED]');
ok('error handler preserves correlation context, redacts secrets, and stops recursion');

const normalized = results.get('normalization:normalizes a minimal message');
assert.equal(normalized.message.messageKey, 'telegram:msg-1');
assert.equal(results.get('normalization:rejects raw provider payload').message, undefined);
ok('message normalization produces a stable key and rejects raw payloads');

console.log(`1..${assertionCount}`);
