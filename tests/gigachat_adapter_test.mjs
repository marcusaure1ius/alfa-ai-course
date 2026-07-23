import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const readJson=(relative)=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const workflow=readJson('workflows/adapters/llm-gigachat.json');
const fixtures=readJson('tests/fixtures/gigachat/contracts.json');
const compose=fs.readFileSync(path.join(root,'docker-compose.yml'),'utf8');
const guide=fs.readFileSync(path.join(root,'docs/llm-providers.md'),'utf8');
let assertionCount=0;const ok=(name)=>console.log(`ok ${++assertionCount} - ${name}`);

function executeCode(nodeName,input,{lookups={}}={}){
  const node=workflow.nodes.find((candidate)=>candidate.name===nodeName);assert.ok(node,`missing node ${nodeName}`);
  const script=new vm.Script(`(function(){${node.parameters.jsCode}\n})()`);
  const result=script.runInNewContext({
    $input:{first:()=>({json:structuredClone(input)})},
    $:(name)=>{const value=lookups[name];return {first:()=>({json:structuredClone(value)}),isExecuted:value!==undefined};},
    crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000015'},
  });
  assert.ok(Array.isArray(result)&&result.length===1&&result[0]?.json,`${nodeName} must return one item`);
  return structuredClone(result[0].json);
}

function assertSubset(actual,expected,label){
  if(expected&&typeof expected==='object'&&!Array.isArray(expected)){assert.ok(actual&&typeof actual==='object',`${label}: expected object`);for(const [key,value] of Object.entries(expected))assertSubset(actual[key],value,`${label}.${key}`);return;}
  assert.deepEqual(actual,expected,label);
}

assert.equal(workflow.active,false);assert.deepEqual(workflow.pinData,{});
assert.equal(workflow.settings.saveDataErrorExecution,'none');assert.equal(workflow.settings.saveDataSuccessExecution,'none');assert.equal(workflow.settings.saveManualExecutions,false);
assert.ok(workflow.nodes.some((node)=>node.type==='n8n-nodes-base.stickyNote'));
assert.ok(!JSON.stringify(workflow).includes('$getWorkflowStaticData'));
ok('adapter is inactive, persists no execution payload, and uses no shared token state');

const profileNode=workflow.nodes.find((node)=>node.name==='GigaChat Provider Profile');
const profileValues=Object.fromEntries(profileNode.parameters.assignments.assignments.map(({name,value})=>[name,value]));
assert.equal(profileValues.profileOAuthUrl,'https://ngw.devices.sberbank.ru:9443/api/v2/oauth');
assert.equal(profileValues.profileApiBaseUrl,'https://api.giga.chat/v1');
assert.equal(profileValues.profileScope,'GIGACHAT_API_PERS');assert.equal(profileValues.profileRefreshSkewMs,60000);
const baseProfile={...profileValues};
ok('profile defaults use the official OAuth endpoint, unified API base, PERS scope, and early refresh skew');

for(const fixture of fixtures.validation){
  const output=executeCode('Validate GigaChat Contract',{...fixture.input,...baseProfile,...fixture.profile});
  assertSubset(output,fixture.expected,fixture.name);
}
assert.ok(fixtures.validation.length>=10);
ok(`${fixtures.validation.length} gateway, allowlist, scope, capability, and local-schema fixtures pass`);

const oauthNodes=workflow.nodes.filter((node)=>node.name.includes('OAuth Token')&&node.type==='n8n-nodes-base.httpRequest');
assert.equal(oauthNodes.length,2);
for(const node of oauthNodes){
  assert.equal(node.parameters.url,'={{ $json.profileOAuthUrl }}');assert.equal(node.parameters.contentType,'form-urlencoded');
  assert.equal(node.parameters.bodyParameters.parameters[0].name,'scope');
  assert.ok(node.parameters.headerParameters.parameters.some(({name,value})=>name==='RqUID'&&value==='={{ $json.oauthRqUid }}'));
  assert.equal(node.credentials.httpHeaderAuth.id,'REPLACE_WITH_GIGACHAT_AUTH_CREDENTIAL_ID');assert.equal(node.onError,'continueRegularOutput');assert.equal(node.retryOnFail,undefined);
}
const chatNodes=workflow.nodes.filter((node)=>node.name.includes('GigaChat Completion')&&node.type==='n8n-nodes-base.httpRequest');
assert.equal(chatNodes.length,2);
for(const node of chatNodes){
  assert.equal(node.credentials,undefined);assert.equal(node.parameters.url,"={{ $json.profileApiBaseUrl + '/chat/completions' }}");
  assert.ok(node.parameters.headerParameters.parameters.some(({name,value})=>name==='Authorization'&&value==="={{ 'Bearer ' + $json.accessToken }}"));
  assert.equal(node.parameters.options.response.response.neverError,true);assert.equal(node.retryOnFail,undefined);
}
ok('two bounded OAuth exchanges use one credential reference and two chat attempts use only execution-local Bearer data');

const request=executeCode('Validate GigaChat Contract',{...baseProfile,provider:'gigachat',model:'GigaChat-2-Pro',messages:[{role:'user',content:'Тест'}]});
const ephemeral=['ephemeral',String(Date.now()),'value'].join('-');
const initialToken=executeCode('Validate Initial OAuth Token',{statusCode:200,body:{access_token:ephemeral,expires_at:Math.floor((Date.now()+30*60*1000)/1000)}},{lookups:{'Validate GigaChat Contract':request}});
assert.equal(initialToken.valid,true);assert.equal(initialToken.accessToken,ephemeral);assert.equal(initialToken.oauthAttempts,1);
const expiringToken=executeCode('Validate Initial OAuth Token',{statusCode:200,body:{access_token:ephemeral,expires_at:Math.floor((Date.now()+30*1000)/1000)}},{lookups:{'Validate GigaChat Contract':request}});
assert.equal(expiringToken.valid,false);assert.equal(expiringToken.refreshNeeded,true);assert.ok(!JSON.stringify(expiringToken).includes(ephemeral));
const oauthFailure=executeCode('Validate Initial OAuth Token',{statusCode:401,body:{access_token:ephemeral,description:'raw credential detail'}},{lookups:{'Validate GigaChat Contract':request}});
assert.equal(oauthFailure.result.error.code,'AUTH_FAILED');assert.ok(!JSON.stringify(oauthFailure).includes(ephemeral));assert.ok(!JSON.stringify(oauthFailure).includes('raw credential detail'));
ok('fresh token stays execution-local while expiring/auth-failed tokens trigger safe refresh or redacted failure');

const jsonSchema={type:'object',properties:{status:{type:'string',enum:['ok','attention']}},required:['status'],additionalProperties:false};
for(const fixture of fixtures.chat){
  const contract=executeCode('Validate GigaChat Contract',{...baseProfile,provider:'gigachat',model:'GigaChat-2-Pro',messages:[{role:'user',content:'Тест'}],output:fixture.mode==='json'?{mode:'json',schema:jsonSchema}:{mode:'text',schema:null}});
  const output=executeCode('Normalize Initial Chat Result',fixture.response,{lookups:{'Validate GigaChat Contract':contract}});
  assertSubset(output,fixture.expected,fixture.name);
  assert.ok(!JSON.stringify(output).includes('credential rejected'),`${fixture.name}: raw provider body escaped`);
}
ok(`${fixtures.chat.length} success, JSON validation, auth, model, rate, service, and malformed-response fixtures pass`);

const first401=executeCode('Normalize Initial Chat Result',{statusCode:401,body:{message:'expired'}},{lookups:{'Validate GigaChat Contract':request}});
assert.equal(first401.refreshAuth,true);assert.ok(!('accessToken' in first401));
const refreshed=executeCode('Validate Refreshed OAuth Token',{statusCode:200,body:{access_token:ephemeral,expires_at:Math.floor((Date.now()+30*60*1000)/1000)}},{lookups:{'Validate GigaChat Contract':request}});
assert.equal(refreshed.valid,true);assert.equal(refreshed.oauthAttempts,2);
const second401=executeCode('Normalize Retried Chat Result',{statusCode:401,body:{message:'still expired'}},{lookups:{'Validate GigaChat Contract':request}});
assert.equal(second401.error.code,'AUTH_FAILED');assert.equal(second401.error.attempts,2);assert.equal(second401.error.retryable,false);
assert.equal(workflow.connections['Refresh After First 401?'].main[0][0].node,'Exchange Refreshed OAuth Token');
assert.equal(workflow.connections['Retry GigaChat Completion Once'].main[0][0].node,'Normalize Retried Chat Result');
assert.equal(workflow.connections['Normalize Retried Chat Result'],undefined);
ok('one 401 causes exactly one refresh and one retry; a second 401 is terminal');

const serialized=JSON.stringify(workflow)+JSON.stringify(fixtures);
assert.ok(!/(Basic [A-Za-z0-9+/=]{16,}|Bearer [A-Za-z0-9._~+/-]{12,}|access_token\"\s*:\s*\"[^<]|client[_-]?secret|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/i.test(serialized));
assert.ok(!/allowUnauthorizedCerts|rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/.test(serialized));
ok('workflow and fixtures contain no authorization value, token, client secret, private key, or TLS bypass');

assert.match(compose,/NODE_EXTRA_CA_CERTS: \/etc\/n8n\/host-ca-bundle\.pem/);
assert.match(compose,/\/etc\/ssl\/certs\/ca-certificates\.crt:\/etc\/n8n\/host-ca-bundle\.pem:ro/);
assert.match(guide,/Обновление GigaChat: 2026-07-23/);assert.match(guide,/developers\.sber\.ru\/docs\/ru\/gigachat\/api\/reference\/rest\/gigachat-api/);
assert.match(guide,/## GigaChat/);assert.match(guide,/### Rotation/);assert.match(guide,/NODE_TLS_REJECT_UNAUTHORIZED=0/);
ok('Ubuntu CA bundle is read-only, and dated setup documents official sources, scopes, rotation, and TLS troubleshooting');

console.log(`1..${assertionCount}`);
