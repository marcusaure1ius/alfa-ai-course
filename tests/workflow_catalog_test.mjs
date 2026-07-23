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
assert.equal(entries.length, 5);
assert.deepEqual(entries.map(({path: workflowPath}) => workflowPath).sort(), listJson('workflows/business'));
ok('lessons-only catalog covers exactly five business workflow JSON files and the pinned n8n image');

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
assert.equal(staticReferenceCount, 0);
ok('all five lessons are standalone: static and dynamic sub-workflow references are absent');

assert.equal(catalog.demos.length, 5);
assert.deepEqual(catalog.demos.map(({lesson}) => lesson), [1, 2, 3, 4, 5]);
for (const demo of catalog.demos) {
  const workflow = readJson(demo.workflow);
  assert.equal(entryById.get(workflow.id).group, 'business', `${demo.key}: business workflow`);
  assert.ok(fs.existsSync(path.join(root, demo.contractTest)), `${demo.key}: beginner contract test`);
}
ok('five beginner lessons map to business workflows and one executable UX contract suite');

const beginnerWorkflowIds = catalog.demos.map(({workflow}) => readJson(workflow).id);
const beginnerWorkflows = beginnerWorkflowIds.map((id) => workflowsById.get(id));
for (const workflow of beginnerWorkflows) {
  const executable = workflow.nodes.filter(({type}) => type !== 'n8n-nodes-base.stickyNote');
  assert.ok(executable.length <= 10, `${workflow.id}: beginner node limit`);
  assert.ok(workflow.nodes.every(({type}) => ![
    'n8n-nodes-base.code',
    'n8n-nodes-base.function',
    'n8n-nodes-base.functionItem',
  ].includes(type)), `${workflow.id}: no Code/Function nodes`);
  assert.ok(workflow.nodes.every(({type}) => ![
    'n8n-nodes-base.telegram',
    'n8n-nodes-base.emailSend',
  ].includes(type)), `${workflow.id}: no direct Telegram/email send node`);
}
ok('five business lessons are inactive standalone visual no-code graphs with at most 10 executable nodes');

for (const testPath of [...catalog.demos.map(({contractTest}) => contractTest), ...catalog.supportingContractTests]) {
  assert.ok(fs.existsSync(path.join(root, testPath)), `missing supporting contract test ${testPath}`);
}
ok('catalog maps beginner UX plus approval, mail, Telegram and CRM safety contracts to executable tests');

console.log(`1..${assertionCount}`);
