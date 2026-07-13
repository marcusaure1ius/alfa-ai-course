import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const json=(file)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const text=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const matrix=json('tests/fixtures/llm/provider-matrix.json');
const diagnostic=json('workflows/diagnostics/generic-llm-connection-test.json');
const yandexDiagnostic=json('workflows/diagnostics/yandex-llm-connection-test.json');
const workflows={
  generic:json('workflows/core/llm-gateway.json'),
  yandex:json('workflows/adapters/llm-yandex.json'),
  gigachat:json('workflows/adapters/llm-gigachat.json'),
};
let count=0;const ok=(name)=>console.log(`ok ${++count} - ${name}`);

function run(workflow,nodeName,input,lookups={}){
  const node=workflow.nodes.find((candidate)=>candidate.name===nodeName);
  assert.ok(node,`missing ${nodeName}`);
  const script=new vm.Script(`(function(){${node.parameters.jsCode}\n})()`);
  const result=script.runInNewContext({
    $input:{first:()=>({json:structuredClone(input)})},
    $:(name)=>({first:()=>({json:structuredClone(lookups[name])}),isExecuted:lookups[name]!==undefined}),
    crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000016'},
  });
  assert.ok(Array.isArray(result)&&result.length===1&&result[0]?.json,`${nodeName} must return one item`);
  return structuredClone(result[0].json);
}

const schema={type:'object',properties:{status:{type:'string',enum:['ok','attention']}},required:['status'],additionalProperties:false};
const folder='b1g1234567890abcdefg';
const adapters={
  generic:{validate:'Validate Contract',normalize:'Normalize Safe Result',profile:{provider:'generic',model:'manual-model',profileBaseUrl:'https://api.example.invalid/v1',profileTimeoutMs:120000}},
  yandex:{validate:'Validate Yandex Contract',normalize:'Normalize Yandex Result',profile:{provider:'yandex',model:`gpt://${folder}/yandexgpt/latest`,profileBaseUrl:'https://ai.api.cloud.yandex.net/v1',profileFolderId:folder,profileTimeoutMs:120000}},
  gigachat:{validate:'Validate GigaChat Contract',normalize:'Normalize Retried Chat Result',profile:{provider:'gigachat',model:'GigaChat-2-Pro',profileOAuthUrl:'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',profileApiBaseUrl:'https://gigachat.devices.sberbank.ru/api/v1',profileScope:'GIGACHAT_API_PERS',profileTimeoutMs:120000,profileRefreshSkewMs:60000}},
};

for(const [provider,adapter] of Object.entries(adapters)){
  const workflow=workflows[provider];
  const request=(mode='text')=>run(workflow,adapter.validate,{...adapter.profile,messages:[{role:'user',content:'Проверка'}],output:mode==='json'?{mode:'json',schema}:{mode:'text',schema:null}});
  const normalize=(response,contract=request('text'))=>run(workflow,adapter.normalize,response,{[adapter.validate]:contract});
  assert.equal(request().valid,true,`${provider} text request`);
  assert.equal(run(workflow,adapter.validate,{...adapter.profile,messages:[{role:'user',content:'Проверка'}],unknown:true}).result.error.code,'INVALID_REQUEST');
  const success=normalize({statusCode:200,body:{model:adapter.profile.model,choices:[{message:{content:'ok'}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}});
  assert.equal(success.ok,true);assert.equal(success.provider,provider);assert.equal(success.content,'ok');assert.equal(success.usage.totalTokens,2);
  const jsonRequest=request('json');
  const jsonSuccess=normalize({statusCode:200,body:{choices:[{message:{content:'{"status":"ok"}'}}]}},jsonRequest);
  assert.equal(jsonSuccess.ok,true);assert.deepEqual(jsonSuccess.json,{status:'ok'});
  const mismatch=normalize({statusCode:200,body:{choices:[{message:{content:'{"status":"wrong"}'}}]}},jsonRequest);
  assert.equal(mismatch.error.code,'OUTPUT_VALIDATION_FAILED');
  const malformed=normalize({statusCode:200,body:{choices:[{message:{content:'not-json'}}]}},jsonRequest);
  assert.equal(malformed.error.code,'OUTPUT_VALIDATION_FAILED');
  for(const [statusCode,body,code,retryable] of [
    [provider==='gigachat'?401:403,{message:'private credential rejected'},'AUTH_FAILED',false],
    [404,{message:'private model detail'},'MODEL_NOT_FOUND',false],
    [429,{message:'private quota detail'},'RATE_LIMITED',true],
    [503,{message:'private upstream detail'},'PROVIDER_UNAVAILABLE',true],
  ]){
    const output=normalize({statusCode,body});
    assert.equal(output.error.code,code,`${provider} ${code}`);assert.equal(output.error.retryable,retryable);
    assert.ok(!JSON.stringify(output).includes('private'),`${provider} leaked raw provider body`);
  }
}
ok('one fixture contract covers text, JSON schema, auth, model, rate, and availability across all adapters');

for(const workflow of [...Object.values(workflows),diagnostic]){
  assert.equal(workflow.active,false);assert.equal(workflow.settings.saveDataErrorExecution,'none');assert.equal(workflow.settings.saveDataSuccessExecution,'none');assert.equal(workflow.settings.saveManualExecutions,false);
}
ok('all provider workflows are inactive and persist neither successful nor failed execution payloads');

const discovery=run(diagnostic,'Detect Discovery Capability',{statusCode:404,body:{message:'not supported'}});
assert.deepEqual(discovery,{discovery:'unavailable',models:[],warning:'MODEL_DISCOVERY_UNAVAILABLE'});
const fallback=diagnostic.nodes.find((node)=>node.name==='Manual Model Fallback');
const selected=fallback.parameters.assignments.assignments.find((item)=>item.name==='selectedModel');
assert.match(selected.value,/Test Profile - Edit Me/);
const completion=diagnostic.nodes.find((node)=>node.name==='Minimal Completion');assert.match(completion.parameters.body,/selectedModel/);
const report=run(diagnostic,'Safe Connection Report',{statusCode:200,body:{choices:[{message:{content:'connection-ok'}}]}},{'Manual Model Fallback':{selectedModel:'manual-model',discovery:'unavailable',discoveryWarning:'MODEL_DISCOVERY_UNAVAILABLE'}});
assert.equal(report.ok,true);assert.equal(report.model,'manual-model');assert.deepEqual(report.warnings,['MODEL_DISCOVERY_UNAVAILABLE']);
ok('generic diagnostic verifies an explicit manual model even when /models discovery is unavailable');

const yandexProfile=run(yandexDiagnostic,'Validate Yandex Connection Profile',{baseUrl:'https://ai.api.cloud.yandex.net/v1',folderId:folder,model:`gpt://${folder}/yandexgpt/latest`});
const yandexDiscovery=run(yandexDiagnostic,'Normalize Yandex Model Discovery',{statusCode:200,body:{object:'list',data:[{id:`gpt://${folder}/yandexgpt/latest`}]}},{'Validate Yandex Connection Profile':yandexProfile});
assert.equal(yandexDiscovery.ready,true);assert.equal(yandexDiscovery.modelDiscovery,'available');
assert.ok(!workflows.gigachat.nodes.some((node)=>node.type==='n8n-nodes-base.httpRequest'&&/\/models/.test(node.parameters.url??'')));
ok('matrix verifies Yandex model discovery and records GigaChat discovery as unsupported by the default adapter');

assert.equal(matrix.checkedAt,'2026-07-14');assert.equal(matrix.environment.n8n,'2.29.10');assert.equal(matrix.environment.externalCredentialsPresent,false);
assert.deepEqual(Object.keys(matrix.evidenceLabels),['verified_static','mocked_contract','external_unverified','unsupported_default']);
for(const [provider,entry] of Object.entries(matrix.providers)){
  assert.equal(entry.externalAccount,'external_unverified',provider);assert.ok(entry.credentialGaps.length>=4,provider);
}
assert.equal(matrix.liteLlm.decision,'excluded');assert.equal(matrix.liteLlm.adrRequired,false);assert.match(matrix.liteLlm.reason,/measured evidence and a new ADR/);
ok('dated matrix separates static, mocked, external-unverified and unsupported evidence with exact credential gaps');

const docs=text('docs/llm-providers.md')+text('docs/generic-llm-provider.md')+text('docs/research/provider-capabilities.md')+text('docs/architecture.md');
for(const marker of ['Единая проверочная матрица','external_unverified','MODEL_DISCOVERY_UNAVAILABLE','LiteLLM','2026-07-14'])assert.match(docs,new RegExp(marker));
const serialized=Object.values(workflows).map(JSON.stringify).join('')+JSON.stringify(diagnostic)+JSON.stringify(matrix);
assert.ok(!/(Api-Key [A-Za-z0-9._~+/-]{12,}|Basic [A-Za-z0-9+/=]{16,}|Bearer [A-Za-z0-9._~+/-]{12,}|access_token"\s*:\s*"[^<]|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/i.test(serialized));
assert.ok(!/allowUnauthorizedCerts|rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/.test(serialized));
ok('matrix documentation is explicit and exports contain no credential, token, private key, or TLS bypass');

console.log(`1..${count}`);
