import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const catalog = readJson('tests/fixtures/workflow-catalog.json');
let assertionCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

function listJson(relativeDirectory) {
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.json')) result.push(path.relative(root, absolute));
    }
  };
  visit(path.join(root, relativeDirectory));
  return result.sort();
}

function collectStrings(value, pathParts = [], output = []) {
  if (Array.isArray(value)) value.forEach((item, index) => collectStrings(item, [...pathParts, index], output));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => collectStrings(item, [...pathParts, key], output));
  else if (typeof value === 'string') output.push({path: pathParts, value});
  return output;
}

function profileValues(workflow, nodeName) {
  const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
  assert.ok(node, `${workflow.id}: missing ${nodeName}`);
  return Object.fromEntries((node.parameters?.assignments?.assignments ?? []).map(({name, value}) => [name, value]));
}

function verifyExport(exportPath, requireNoCredentialReferences) {
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const expectedIds = catalog.importOrder.flatMap(({workflows}) => workflows.map(({id}) => id)).sort();
  assert.ok(Array.isArray(exported), 'clean export must be an array');
  assert.deepEqual(exported.map(({id}) => id).sort(), expectedIds, 'clean import/export ID set');
  assert.ok(exported.every((workflow) => workflow.active === false), 'all clean-imported workflows must remain inactive');
  if (requireNoCredentialReferences) {
    assert.ok(exported.every((workflow) => workflow.nodes.every((node) => !node.credentials)), 'sanitized clean-imported workflows must have no credential references');
  } else {
    for (const workflow of exported) {
      for (const node of workflow.nodes) {
        for (const credential of Object.values(node.credentials ?? {})) assert.match(credential.id, /^REPLACE_WITH_[A-Z0-9_]+$/);
      }
    }
  }
  console.log(`verified clean export: ${exported.length} inactive workflows (${requireNoCredentialReferences ? 'no credential references' : 'placeholder references only'})`);
}

if (process.argv[2] === '--verify-export') {
  assert.ok(process.argv[3], '--verify-export requires a JSON path');
  verifyExport(process.argv[3], process.argv[4] === '--require-no-credentials');
  process.exit(0);
}

assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.n8nImage, 'docker.n8n.io/n8nio/n8n:2.29.10');
const entries = catalog.importOrder.flatMap((group, groupIndex) => group.workflows.map((workflow) => ({...workflow, group: group.name, groupIndex})));
assert.equal(entries.length, 18);
assert.deepEqual(entries.map(({path: workflowPath}) => workflowPath).sort(), listJson('workflows'));
ok('catalog covers exactly all 18 workflow JSON files and the pinned n8n image');

const workflowsById = new Map();
const entryById = new Map();
const secretPattern = /(bot[0-9]{6,}:[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._~+/-]{16,}|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/;
for (const entry of entries) {
  const workflow = readJson(entry.path);
  assert.equal(workflow.id, entry.id, `${entry.path}: catalog ID`);
  assert.match(workflow.id, /^[A-Za-z0-9_-]{1,128}$/);
  assert.ok(!workflowsById.has(workflow.id), `duplicate workflow ID ${workflow.id}`);
  assert.equal(workflow.active, false, `${workflow.id}: active`);
  assert.ok(Array.isArray(workflow.nodes) && workflow.nodes.length > 0, `${workflow.id}: nodes`);
  assert.ok(workflow.connections && typeof workflow.connections === 'object' && !Array.isArray(workflow.connections), `${workflow.id}: connections`);
  assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.stickyNote'), `${workflow.id}: Sticky Note`);
  assert.equal(Object.keys(workflow.pinData ?? {}).length, 0, `${workflow.id}: pinData`);
  assert.equal(new Set(workflow.nodes.map(({id}) => id)).size, workflow.nodes.length, `${workflow.id}: unique node IDs`);
  assert.ok(!secretPattern.test(JSON.stringify(workflow)), `${workflow.id}: embedded secret indicator`);
  for (const node of workflow.nodes) {
    for (const credential of Object.values(node.credentials ?? {})) {
      assert.deepEqual(Object.keys(credential).sort(), ['id', 'name']);
      assert.match(credential.id, /^REPLACE_WITH_[A-Z0-9_]+$/);
    }
  }
  workflowsById.set(workflow.id, workflow);
  entryById.set(workflow.id, entry);
}
ok('workflow schemas, unique IDs, inactive state, Sticky Notes, empty pinData and placeholder-only credentials pass');

const dynamicReferences = new Map(catalog.dynamicReferences.map((reference) => [`${reference.workflowId}\0${reference.node}`, reference]));
let staticReferenceCount = 0;
let dynamicReferenceCount = 0;
for (const [workflowId, workflow] of workflowsById) {
  for (const node of workflow.nodes.filter(({type}) => type === 'n8n-nodes-base.executeWorkflow')) {
    const reference = node.parameters.workflowId;
    assert.equal(node.parameters.options?.waitForSubWorkflow, true, `${workflowId}/${node.name}: synchronous call`);
    if (typeof reference === 'string' && reference.startsWith('={{')) {
      const declared = dynamicReferences.get(`${workflowId}\0${node.name}`);
      assert.ok(declared, `${workflowId}/${node.name}: undeclared dynamic reference`);
      assert.equal(reference, declared.expression);
      dynamicReferenceCount += 1;
    } else {
      assert.ok(workflowsById.has(reference), `${workflowId}/${node.name}: missing workflow ${reference}`);
      assert.ok(entryById.get(reference).groupIndex < entryById.get(workflowId).groupIndex, `${workflowId}/${node.name}: target must be imported earlier`);
      staticReferenceCount += 1;
    }
  }
}
assert.equal(dynamicReferenceCount, catalog.dynamicReferences.length);
assert.equal(staticReferenceCount, 25);
ok('25 static sub-workflow links resolve in import order and the single dynamic source contract is declared');

const allFixtureStrings = [];
for (const demo of catalog.demos) {
  const fixture = readJson(demo.fixture);
  const cases = demo.fixtureGroups.length === 0 ? fixture : demo.fixtureGroups.flatMap((group) => {
    assert.ok(Array.isArray(fixture[group]), `${demo.key}: missing fixture group ${group}`);
    return fixture[group];
  });
  assert.equal(cases.length, demo.expectedCount, `${demo.key}: fixture count`);
  assert.ok(cases.length >= 10, `${demo.key}: minimum fixture count`);
  assert.equal(new Set(cases.map(({name}) => name)).size, cases.length, `${demo.key}: unique fixture names`);
  for (const fixtureCase of cases) {
    assert.equal(typeof fixtureCase.name, 'string');
    assert.ok(fixtureCase.name.length > 0);
    assert.ok(fixtureCase.input && typeof fixtureCase.input === 'object');
    assert.ok(fixtureCase.expected && typeof fixtureCase.expected === 'object' && Object.keys(fixtureCase.expected).length > 0);
  }
  assert.ok(fs.existsSync(path.join(root, demo.contractTest)), `${demo.key}: contract test`);
  allFixtureStrings.push(...collectStrings(fixture));
}
ok('four demos provide 20/13/21/14 named fixtures with inputs and expected outputs');

for (const {value} of allFixtureStrings) {
  for (const email of value.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    assert.ok(catalog.piiPolicy.allowedSyntheticEmailDomains.includes(email[1].toLowerCase()), `non-synthetic email domain: ${email[1]}`);
  }
}
for (const demo of catalog.demos) {
  for (const {path: valuePath, value} of collectStrings(readJson(demo.fixture))) {
    if (valuePath.some((part) => String(part).toLowerCase().includes('phone'))) {
      assert.ok(catalog.piiPolicy.allowedSyntheticPhones.includes(value), `${demo.key}: undeclared phone fixture ${value}`);
    }
  }
}
assert.ok(!secretPattern.test(JSON.stringify(catalog.demos.map(({fixture}) => readJson(fixture)))));
ok('fixture contacts are limited to declared synthetic domains/phone values and no token/private-key pattern is present');

const telegram = workflowsById.get('businessTelegramAssistantV1');
const telegramProfile = profileValues(telegram, 'Telegram Assistant Profile');
assert.equal(telegramProfile.profileTestMode, true);
assert.equal(telegramProfile.profileDraftOnly, true);
const lead = workflowsById.get('businessGuardedLeadHandlerV1');
const leadProfile = profileValues(lead, 'Lead Handler Profile');
assert.equal(leadProfile.profileTestMode, true);
assert.equal(leadProfile.profileDraftOnly, true);
const digest = workflowsById.get('businessDailyExecutiveDigestV1');
const digestProfile = profileValues(digest, 'Digest Profile and Source Defaults');
assert.equal(digestProfile.profileTestMode, true);
assert.equal(digestProfile.profileDraftOnly, true);
const email = workflowsById.get('businessEmailAssistantV1');
assert.equal(profileValues(email, 'Email Assistant Profile').profileTestMode, true);
assert.match(email.name, /Draft Only/);
for (const workflow of [telegram, lead, digest, email]) {
  assert.ok(workflow.nodes.every(({type}) => !['n8n-nodes-base.httpRequest', 'n8n-nodes-base.telegram', 'n8n-nodes-base.emailSend'].includes(type)), `${workflow.id}: direct dangerous outbound node`);
}
ok('four business workflows are inactive and keep dangerous outbound actions behind test/draft shared contracts');

for (const testPath of [...catalog.demos.map(({contractTest}) => contractTest), ...catalog.supportingContractTests]) {
  assert.ok(fs.existsSync(path.join(root, testPath)), `missing supporting contract test ${testPath}`);
}
ok('catalog maps every demo plus approval, mail, Telegram and CRM safety contracts to executable tests');

console.log(`1..${assertionCount}`);
