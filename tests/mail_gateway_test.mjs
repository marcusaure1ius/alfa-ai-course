import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const workflow = readJson('workflows/core/mail-gateway.json');
const fixtures = readJson('tests/fixtures/mail/contracts.json');
let assertionCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

function executeContract(input) {
  const node = workflow.nodes.find((candidate) => candidate.name === 'Evaluate Mail Contract');
  const script = new vm.Script(`(function () { ${node.parameters.jsCode}\n})()`);
  const evaluated = script.runInNewContext({
    $input: {first: () => ({json: structuredClone(input)})},
    crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000000'},
  });
  assert.ok(Array.isArray(evaluated) && evaluated.length === 1 && evaluated[0]?.json);
  const gate = workflow.nodes.find((candidate) => candidate.name === 'Enforce Fresh Approval');
  const gateScript = new vm.Script(`(function () { ${gate.parameters.jsCode}\n})()`);
  const result = gateScript.runInNewContext({
    $input: {first: () => ({json: structuredClone(evaluated[0].json)})},
    $: (name) => {
      assert.equal(name, 'Called by Business Workflow');
      return {first: () => ({json: structuredClone(input)})};
    },
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
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.stickyNote'));
assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.executeWorkflowTrigger'));
assert.ok(workflow.nodes.every((node) => node.id && node.name && node.type));
ok('mail gateway is an inactive reusable workflow with contract notes');

const smtp = workflow.nodes.find((node) => node.type === 'n8n-nodes-base.emailSend');
assert.ok(smtp);
assert.equal(smtp.parameters.emailFormat, 'text');
assert.equal(smtp.parameters.options.allowUnauthorizedCerts, false);
assert.equal(smtp.credentials.smtp.id, 'REPLACE_WITH_SMTP_CREDENTIAL_ID');
assert.ok(!/(smtp:\/\/|imap:\/\/|Bearer |sk-[A-Za-z0-9]|password|api[_-]?key)/i.test(JSON.stringify(workflow)));
ok('SMTP uses credential placeholder, text-only content, and TLS verification');

const branches = workflow.connections['SMTP Authorized?'].main;
assert.equal(workflow.connections['Evaluate Mail Contract'].main[0][0].node, 'Enforce Fresh Approval');
assert.equal(workflow.connections['Enforce Fresh Approval'].main[0][0].node, 'SMTP Authorized?');
assert.ok(branches[0].some(({node}) => node === 'Send Approved SMTP Email'));
assert.ok(branches[1].some(({node}) => node === 'Safe Preview or Denial'));
ok('fresh-approval gate precedes the only branch that can reach SMTP');

for (const fixture of fixtures) {
  const output = executeContract(fixture.input);
  assertSubset(output, fixture.expected, fixture.name);
  if (output.message) assert.equal('html' in output.message, false, `${fixture.name}: HTML must not escape normalization`);
  if (output.draft) assert.equal('html' in output.draft, false, `${fixture.name}: HTML must not enter draft`);
}
assert.ok(fixtures.length >= 10);
ok(`${fixtures.length} security and format fixtures execute from workflow JSON`);

const longHtml = `<p>${'x'.repeat(13000)}</p>`;
const bounded = executeContract({operation:'normalizeIncoming',message:{messageId:'bounded@example.com',from:'a@example.com',to:'b@example.com',subject:'Bounded',html:longHtml,receivedAt:'2026-07-14T09:00:00Z'}});
assert.equal(bounded.message.safeText.length, 12000);
assert.equal(bounded.message.contentTruncated, true);
ok('HTML-derived text is bounded to 12000 characters');

const authorized = executeContract(fixtures.find(({name}) => name === 'exact production approval authorizes SMTP').input);
const denied = fixtures.filter(({expected}) => expected.sendAuthorized === false).map(({input}) => executeContract(input));
assert.equal(authorized.sendAuthorized, true);
assert.ok(denied.every((output) => output.sendAuthorized === false));
ok('explicit matching approval is the sole fixture that authorizes external send');

console.log(`1..${assertionCount}`);
