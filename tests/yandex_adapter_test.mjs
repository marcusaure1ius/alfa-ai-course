import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const readJson=(relative)=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const workflow=readJson('workflows/adapters/llm-yandex.json');
const diagnostic=readJson('workflows/diagnostics/yandex-llm-connection-test.json');
const fixtures=readJson('tests/fixtures/yandex/contracts.json');
const guide=fs.readFileSync(path.join(root,'docs/llm-providers.md'),'utf8');
let assertionCount=0;const ok=(name)=>console.log(`ok ${++assertionCount} - ${name}`);

function executeCode(sourceWorkflow,nodeName,input,{lookups={}}={}){
  const node=sourceWorkflow.nodes.find((candidate)=>candidate.name===nodeName);assert.ok(node,`missing node ${nodeName}`);
  const script=new vm.Script(`(function(){${node.parameters.jsCode}\n})()`);
  const result=script.runInNewContext({
    $input:{first:()=>({json:structuredClone(input)})},
    $:(name)=>{const value=lookups[name];return {first:()=>({json:structuredClone(value)}),isExecuted:value!==undefined};},
    crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000014'},
  });
  assert.ok(Array.isArray(result)&&result.length===1&&result[0]?.json,`${nodeName} must return one item`);
  return structuredClone(result[0].json);
}

function assertSubset(actual,expected,label){
  if(expected&&typeof expected==='object'&&!Array.isArray(expected)){assert.ok(actual&&typeof actual==='object',`${label}: expected object`);for(const [key,value] of Object.entries(expected))assertSubset(actual[key],value,`${label}.${key}`);return;}
  assert.deepEqual(actual,expected,label);
}

for(const exported of [workflow,diagnostic]){
  assert.equal(exported.active,false);assert.deepEqual(exported.pinData,{});
  assert.equal(exported.settings.saveDataErrorExecution,'none');assert.equal(exported.settings.saveDataSuccessExecution,'none');assert.equal(exported.settings.saveManualExecutions,false);
  assert.ok(exported.nodes.some((node)=>node.type==='n8n-nodes-base.stickyNote'));
}
ok('adapter and diagnostic are inactive and persist no execution payload');

const folderId='b1g1234567890abcdefg';assert.equal(folderId.length,20);
const model=`gpt://${folderId}/yandexgpt/latest`;
const baseProfile={profileBaseUrl:'https://ai.api.cloud.yandex.net/v1',profileFolderId:folderId,profileTimeoutMs:120000};
for(const fixture of fixtures.validation){
  const input={model,...fixture.input,...baseProfile,...fixture.profile};
  const output=executeCode(workflow,'Validate Yandex Contract',input);
  assertSubset(output,fixture.expected,fixture.name);
}
assert.ok(fixtures.validation.length>=12);
ok(`${fixtures.validation.length} input, folder, model, capability, and schema fixtures pass`);

const chatNode=workflow.nodes.find((node)=>node.name==='Yandex Chat Completion');
assert.equal(chatNode.parameters.url,"={{ $json.profileBaseUrl + '/chat/completions' }}");
assert.equal(chatNode.credentials.httpHeaderAuth.id,'REPLACE_WITH_YANDEX_AI_STUDIO_CREDENTIAL_ID');
assert.ok(chatNode.parameters.headerParameters.parameters.some(({name,value})=>name==='OpenAI-Project'&&value==='={{ $json.profileFolderId }}'));
assert.equal(chatNode.parameters.options.response.response.neverError,true);assert.equal(chatNode.retryOnFail,undefined);
assert.ok(!chatNode.parameters.body.includes('response_format'));
ok('chat request uses the official endpoint, project header, credential reference, and no implicit retry/native schema mode');

const schema={type:'object',properties:{status:{type:'string',enum:['ok','attention']}},required:['status'],additionalProperties:false};
for(const fixture of fixtures.completion){
  const request=executeCode(workflow,'Validate Yandex Contract',{...baseProfile,provider:'yandex',model,messages:[{role:'user',content:'Тест'}],output:fixture.mode==='json'?{mode:'json',schema}:{mode:'text',schema:null}});
  const output=executeCode(workflow,'Normalize Yandex Result',fixture.response,{lookups:{'Validate Yandex Contract':request}});
  assertSubset(output,fixture.expected,fixture.name);
  assert.ok(!JSON.stringify(output).includes('credential rejected'),`${fixture.name}: raw auth body escaped`);
  assert.ok(!JSON.stringify(output).includes('scope detail'),`${fixture.name}: raw permission body escaped`);
}
assert.ok(fixtures.completion.length>=10);
ok(`${fixtures.completion.length} success, structured-output, auth, model, rate, timeout, and malformed-response fixtures pass`);

const jsonRequest=executeCode(workflow,'Validate Yandex Contract',{...baseProfile,provider:'yandex',model,messages:[{role:'user',content:'Тест'}],output:{mode:'json',schema}});
assert.match(jsonRequest.messages[0].content,/Return only valid JSON matching this schema/);
assert.equal(jsonRequest.messages[1].content,'Тест');
ok('JSON mode adds a bounded local contract and validates the normalized result without enabling provider-native schema');

const profile=executeCode(diagnostic,'Validate Yandex Connection Profile',{baseUrl:baseProfile.profileBaseUrl,folderId,model});
assert.equal(profile.valid,true);
const discovered=executeCode(diagnostic,'Normalize Yandex Model Discovery',{statusCode:200,body:{object:'list',data:[{id:model},{id:`gpt://${folderId}/qwen3/latest`}]}},{lookups:{'Validate Yandex Connection Profile':profile}});
assert.equal(discovered.ready,true);assert.equal(discovered.modelDiscovery,'available');assert.equal(discovered.modelCount,2);
const missing=executeCode(diagnostic,'Normalize Yandex Model Discovery',{statusCode:200,body:{object:'list',data:[{id:`gpt://${folderId}/other/latest`}]}},{lookups:{'Validate Yandex Connection Profile':profile}});
assert.equal(missing.result.error.code,'MODEL_NOT_FOUND');assert.equal(missing.ready,false);
const discoveryAuth=executeCode(diagnostic,'Normalize Yandex Model Discovery',{statusCode:403,body:{message:'private scope detail'}},{lookups:{'Validate Yandex Connection Profile':profile}});
assert.equal(discoveryAuth.result.error.code,'AUTH_FAILED');assert.ok(!JSON.stringify(discoveryAuth).includes('private scope detail'));
ok('connection diagnostic validates configuration, model listing, selected model, and redacted permission failure before completion');

const connection=executeCode(diagnostic,'Safe Yandex Connection Report',{statusCode:200,body:{choices:[{message:{content:'connection-ok'}}]}},{lookups:{'Normalize Yandex Model Discovery':discovered}});
assert.deepEqual(connection,{ok:true,provider:'yandex',model,modelDiscovery:'available',completionShape:'valid',error:null,warnings:[]});
const connectionAuth=executeCode(diagnostic,'Safe Yandex Connection Report',{statusCode:401,body:{message:'do not expose'}},{lookups:{'Normalize Yandex Model Discovery':discovered}});
assert.equal(connectionAuth.error.code,'AUTH_FAILED');assert.ok(!JSON.stringify(connectionAuth).includes('do not expose'));
ok('minimal completion produces a safe positive report and representative auth error');

const requests=[...workflow.nodes,...diagnostic.nodes].filter((node)=>node.type==='n8n-nodes-base.httpRequest');
assert.equal(requests.length,3);
for(const node of requests){
  assert.equal(node.credentials.httpHeaderAuth.id,'REPLACE_WITH_YANDEX_AI_STUDIO_CREDENTIAL_ID');
  assert.equal(node.retryOnFail,undefined);
}
const discoveryNode=diagnostic.nodes.find((node)=>node.name==='Discover Yandex Models');
const minimalNode=diagnostic.nodes.find((node)=>node.name==='Minimal Yandex Completion');
assert.ok(discoveryNode.parameters.headerParameters.parameters.some(({name})=>name==='x-project'));
assert.ok(minimalNode.parameters.headerParameters.parameters.some(({name})=>name==='OpenAI-Project'));
const serialized=JSON.stringify(workflow)+JSON.stringify(diagnostic)+JSON.stringify(fixtures);
assert.ok(!/(Api-Key [A-Za-z0-9._~+/-]{12,}|Bearer [A-Za-z0-9._~+/-]{12,}|api[_-]?key"\s*:\s*"[^<]|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/i.test(serialized));
assert.ok(!/allowUnauthorizedCerts|rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/.test(serialized));
ok('all HTTP requests use one credential reference; exports and fixtures contain no key, token, private key, or TLS bypass');

assert.match(guide,/## Yandex AI Studio/);assert.match(guide,/Проверено: 2026-07-14/);
assert.match(guide,/yc\.ai\.foundationModels\.execute/);assert.match(guide,/yc\.ai\.models\.viewer/);
assert.match(guide,/OpenAI-Project/);assert.match(guide,/### Ротация Yandex API key/);
assert.match(guide,/x-project/);
assert.match(guide,/aistudio\.yandex\.ru\/docs\/ru\/ai-studio\/operations\/generation\/completions-basic/);
ok('dated guide records official endpoints, project header, least-privilege scopes, rotation, and troubleshooting');

console.log(`1..${assertionCount}`);
