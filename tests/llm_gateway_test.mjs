import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const gateway = JSON.parse(fs.readFileSync(path.join(root, 'workflows/core/llm-gateway.json')));
const diagnostic = JSON.parse(fs.readFileSync(path.join(root, 'workflows/diagnostics/generic-llm-connection-test.json')));
let count = 0;
const ok = (name) => console.log(`ok ${++count} - ${name}`);
for (const workflow of [gateway, diagnostic]) {
  assert.equal(workflow.active, false);
  assert.ok(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.stickyNote'));
  assert.ok(workflow.nodes.every((node) => node.id && node.name && node.type));
}
ok('workflow JSON shape and Sticky Notes');

const serialized = JSON.stringify([gateway, diagnostic]);
assert.ok(!/(sk-[A-Za-z0-9]{16,}|Bearer [A-Za-z0-9._-]{12,})/.test(serialized));
const requests = [...gateway.nodes, ...diagnostic.nodes].filter((node) => node.type === 'n8n-nodes-base.httpRequest');
assert.ok(requests.length >= 3);
assert.ok(requests.every((node) => node.credentials?.httpHeaderAuth?.id === 'REPLACE_WITH_GENERIC_LLM_CREDENTIAL_ID'));
assert.ok(requests.every((node) => node.parameters.options?.response?.response?.neverError === true));
ok('credential references without embedded API key');

assert.ok(diagnostic.nodes.some((node) => node.name === 'Discover Models'));
assert.ok(diagnostic.nodes.some((node) => node.name === 'Manual Model Fallback'));
assert.ok(diagnostic.nodes.some((node) => node.name === 'Minimal Completion'));
ok('model discovery and manual fallback path');

function classify(fixture) {
  const status = fixture.statusCode;
  if (status === 401 || status === 403) return 'AUTH_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404 || (status === 400 && /model/i.test(JSON.stringify(fixture.body)))) return 'MODEL_NOT_FOUND';
  if (status === 0 || status >= 500) return 'PROVIDER_UNAVAILABLE';
  if (status < 200 || status >= 300 || typeof fixture.body?.choices?.[0]?.message?.content !== 'string') return 'INVALID_PROVIDER_RESPONSE';
  return null;
}
const fixtures = fs.readdirSync(path.join(root, 'tests/fixtures/llm')).filter((file) => file !== 'provider-matrix.json').sort();
assert.equal(fixtures.length, 5);
for (const file of fixtures) {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/llm', file)));
  assert.equal(classify(fixture), fixture.expected.code, file);
  assert.equal(classify(fixture) === null, fixture.expected.ok, file);
}
ok('success/auth/model/rate/network fixtures');

for (const code of ['INVALID_REQUEST','CAPABILITY_UNSUPPORTED','AUTH_FAILED','MODEL_NOT_FOUND','RATE_LIMITED','PROVIDER_UNAVAILABLE','INVALID_PROVIDER_RESPONSE','OUTPUT_VALIDATION_FAILED']) assert.ok(serialized.includes(code));
ok('normalized success and error contract markers');
console.log(`1..${count}`);
