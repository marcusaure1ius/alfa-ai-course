import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const fixtures = readJson('tests/fixtures/polza-beginner/contracts.json');
let assertionCount = 0;
const ok = (name) => console.log(`ok ${++assertionCount} - ${name}`);

function expressionSource(value, label) {
  assert.equal(typeof value, 'string', `${label}: expression must be a string`);
  const match = value.match(/^=\{\{\s*([\s\S]*?)\s*\}\}$/);
  assert.ok(match, `${label}: unsupported n8n expression shape`);
  return match[1];
}

function evaluate(value, input, label) {
  if (typeof value !== 'string' || !value.startsWith('={{')) return structuredClone(value);
  const script = new vm.Script(`(${expressionSource(value, label)})`);
  return structuredClone(script.runInNewContext({$json: structuredClone(input)}));
}

function assignments(workflow, nodeName, input) {
  const node = workflow.nodes.find(({name}) => name === nodeName);
  assert.ok(node, `${workflow.id}: missing ${nodeName}`);
  assert.equal(node.type, 'n8n-nodes-base.set', `${workflow.id}: ${nodeName} must be Edit Fields`);
  return Object.fromEntries(node.parameters.assignments.assignments.map((assignment) => [
    assignment.name,
    evaluate(assignment.value, input, `${workflow.id}/${nodeName}/${assignment.name}`),
  ]));
}

function requestBody(node, configured, label) {
  const value = evaluate(node.parameters.body, configured, label);
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function assertSubset(actual, expected, label) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    assert.ok(actual && typeof actual === 'object' && !Array.isArray(actual), `${label}: expected object`);
    for (const [key, value] of Object.entries(expected)) assertSubset(actual[key], value, `${label}.${key}`);
    return;
  }
  assert.deepEqual(actual, expected, label);
}

const workflows = fixtures.cases.map((fixture) => ({
  fixture,
  workflow: readJson(fixture.workflow),
}));
assert.equal(workflows.length, 5);
assert.deepEqual(workflows.map(({workflow}) => workflow.id), fixtures.cases.map(({id}) => id));
ok('fixture suite covers the five Polza.ai beginner workflows by stable ID');

for (const {fixture, workflow} of workflows) {
  const requestNode = workflow.nodes.find(({name}) => name === fixture.requestNode);
  assert.ok(requestNode, `${workflow.id}: request node`);
  assert.equal(requestNode.type, 'n8n-nodes-base.httpRequest');
  assert.equal(requestNode.parameters.url, fixture.endpoint);
  assert.equal(requestNode.parameters.authentication, 'genericCredentialType');
  assert.equal(requestNode.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(requestNode.credentials?.httpHeaderAuth?.id, 'REPLACE_WITH_POLZA_AI_CREDENTIAL_ID');
  assert.equal(requestNode.parameters.options.timeout, 600000);
  assert.equal(
    requestNode.parameters.options.response?.response?.responseFormat,
    undefined,
    `${workflow.id}: raw JSON bodies must use response autodetection so n8n resolves the response stream`,
  );
  assert.equal(requestNode.retryOnFail, undefined, `${workflow.id}: implicit paid retry is forbidden`);

  const configured = assignments(workflow, fixture.configureNode, fixture.manualInput);
  const request = requestBody(requestNode, configured, `${workflow.id}/request body`);
  assertSubset(request, fixture.expectedRequest, `${workflow.id}: request`);

  const result = assignments(workflow, fixture.resultNode, fixture.successResponse);
  assertSubset(result, fixture.expectedResult, `${workflow.id}: success result`);

  const fallback = assignments(workflow, fixture.resultNode, {});
  assert.match(String(fallback[fixture.fallbackField]), new RegExp(fixture.fallbackPattern));
}
ok('manual samples produce official endpoint bodies and success/error previews without credentials');

const textToImage = workflows.find(({workflow}) => workflow.id === 'businessPolzaTextToImageV1');
const textConfig = assignments(textToImage.workflow, textToImage.fixture.configureNode, {});
const textRequestNode = textToImage.workflow.nodes.find(({name}) => name === textToImage.fixture.requestNode);
const textRequest = requestBody(textRequestNode, textConfig, 'text-to-image request');
assert.match(textRequest.prompt, /кружки ручной работы/);
assert.equal(textRequest.response_format, 'url');
ok('text-to-image keeps a visible synthetic Russian prompt and requests one URL result');

const imageEdit = workflows.find(({workflow}) => workflow.id === 'businessPolzaImageEditV1');
const editConfig = assignments(imageEdit.workflow, imageEdit.fixture.configureNode, {});
const editRequestNode = imageEdit.workflow.nodes.find(({name}) => name === imageEdit.fixture.requestNode);
const editRequest = requestBody(editRequestNode, editConfig, 'image-to-image request');
assert.equal(editRequest.input.images.length, 1);
assert.deepEqual(editRequest.input.images[0], {type: 'url', data: 'https://placehold.co/1024x1024/png?text=Demo+Product'});
assert.equal(editRequest.input.aspect_ratio, '1:1');
assert.equal(editRequest.input.output_format, 'png');
assert.equal(editRequest.input.strength, undefined);
ok('image-to-image sends exactly one public synthetic URL reference to Nano Banana');

for (const id of ['businessTelegramLeadIntakeV1', 'businessTelegramPersonalAgentV1']) {
  const {fixture, workflow} = workflows.find(({workflow}) => workflow.id === id);
  const configured = assignments(workflow, fixture.configureNode, fixture.manualInput);
  const requestNode = workflow.nodes.find(({name}) => name === fixture.requestNode);
  const request = requestBody(requestNode, configured, `${id}: chat request`);
  assert.equal(request.messages.length, 2);
  assert.equal(request.messages[1].content, fixture.manualInput.message.text);
  const trigger = workflow.nodes.find(({type}) => type === 'n8n-nodes-base.telegramTrigger');
  assert.match(trigger.parameters.additionalFields.chatIds, /^REPLACE_WITH_/);
  assert.equal(trigger.parameters.additionalFields.download, false);
  assert.ok(workflow.nodes.every(({type}) => type !== 'n8n-nodes-base.telegram'));
}
ok('Telegram lead and personal assistant pass the message, require allowlist, and never send automatically');

const accounting = workflows.find(({workflow}) => workflow.id === 'businessAccountingDocumentReviewV1');
const accountingConfig = assignments(accounting.workflow, accounting.fixture.configureNode, accounting.fixture.manualInput);
const accountingRequestNode = accounting.workflow.nodes.find(({name}) => name === accounting.fixture.requestNode);
const accountingRequest = requestBody(accountingRequestNode, accountingConfig, 'accounting request');
assert.equal(accountingRequest.messages.length, 1);
assert.equal(accountingRequest.messages[0].content.length, 2);
assert.equal(accountingRequest.messages[0].content[0].type, 'text');
assert.match(accountingRequest.messages[0].content[0].text, /не делай вывод о действительности документа/i);
assert.deepEqual(accountingRequest.messages[0].content[1], {
  type: 'image_url',
  image_url: {url: accounting.fixture.manualInput.body.documentUrl},
});
const accountingSerialized = JSON.stringify(accounting.workflow);
assert.match(accountingSerialized, /сверьте каждое поле|сверьте с оригиналом/i);
assert.match(accountingSerialized, /не является бухгалтерской, налоговой или юридической проверкой/i);
assert.ok(accounting.workflow.nodes.every(({type}) => ![
  'n8n-nodes-base.googleSheets',
  'n8n-nodes-base.postgres',
  'n8n-nodes-base.mySql',
].includes(type)));
ok('accounting request sends one image URL and remains extraction-only with mandatory human review');

const serialized = workflows.map(({workflow}) => JSON.stringify(workflow)).join('');
assert.ok(!/(Bearer [A-Za-z0-9._~+/-]{12,}|sk-[A-Za-z0-9]{16,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/.test(serialized));
assert.ok(!/allowUnauthorizedCerts|rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/.test(serialized));
ok('Polza lessons contain no secret value, TLS bypass, or hidden credential field');

console.log(`1..${assertionCount}`);
