import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const readJson=(relative)=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const workflow=readJson('workflows/business/daily-executive-digest.json');
const telegramWorkflow=readJson('workflows/core/send-telegram-message.json');
const fixtures=readJson('tests/fixtures/executive-digest/contracts.json');
let assertionCount=0;const ok=(name)=>console.log(`ok ${++assertionCount} - ${name}`);

function executeCode(workflowJson,nodeName,input,{lookups={},staticData={}}={}){
  const node=workflowJson.nodes.find((candidate)=>candidate.name===nodeName);assert.ok(node,`missing node ${nodeName}`);
  const script=new vm.Script(`(function(){${node.parameters.jsCode}\n})()`);
  const result=script.runInNewContext({
    $input:{first:()=>({json:structuredClone(input)})},
    $getWorkflowStaticData:(scope)=>{assert.equal(scope,'global');return staticData;},
    $:(name)=>{const value=lookups[name];return {first:()=>({json:structuredClone(value)}),isExecuted:value!==undefined};},
    crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'},
  });
  assert.ok(Array.isArray(result)&&result.length===1&&result[0]?.json,`${nodeName} must return one item`);
  return structuredClone(result[0].json);
}

function assertSubset(actual,expected,label){
  if(expected&&typeof expected==='object'&&!Array.isArray(expected)){assert.ok(actual&&typeof actual==='object',`${label}: expected object`);for(const [key,value] of Object.entries(expected))assertSubset(actual[key],value,`${label}.${key}`);return;}
  assert.deepEqual(actual,expected,label);
}

assert.equal(workflow.active,false);
assert.equal(workflow.settings.timezone,'Europe/Moscow');
assert.equal(workflow.pinData&&Object.keys(workflow.pinData).length,0);
assert.ok(workflow.nodes.some((node)=>node.type==='n8n-nodes-base.stickyNote'));
const schedule=workflow.nodes.find((node)=>node.name==='Daily at 09:00 Moscow');
assert.equal(schedule.parameters.rule.interval[0].field,'days');
assert.equal(schedule.parameters.rule.interval[0].triggerAtHour,9);
const profile=workflow.nodes.find((node)=>node.name==='Digest Profile and Source Defaults');
const profileValues=Object.fromEntries(profile.parameters.assignments.assignments.map(({name,value})=>[name,value]));
assert.equal(profileValues.profileTimezone,'Europe/Moscow');assert.equal(profileValues.profileTestMode,true);assert.equal(profileValues.profileDraftOnly,true);assert.equal(profileValues.profileSourceConfigured,false);
ok('inactive workflow is pinned to Europe/Moscow 09:00 with safe source and delivery defaults');

const calls=workflow.nodes.filter((node)=>node.type==='n8n-nodes-base.executeWorkflow');
assert.deepEqual(calls.map((node)=>node.parameters.workflowId),['coreGenericLlmGatewayV1','coreSendTelegramMessageV1','coreWorkflowErrorV1','coreBusinessEventLogV1']);
assert.ok(calls.every((node)=>node.parameters.options.waitForSubWorkflow===true));
assert.equal(workflow.connections['Telegram Delivery Succeeded?'].main[1][0].node,'Prepare Shared Error Contract');
assert.equal(workflow.connections['Summary Valid?'].main[1][0].node,'Prepare Shared Error Contract');
ok('LLM, Telegram, errors, and event logging use shared workflows with explicit failure branches');

const baseProfile={profileTimezone:'Europe/Moscow',profileDigestHour:9,profileTestMode:true,profileDraftOnly:true,profileOwnerChatId:'123450099',profileModel:'fixture-model',profileSourceName:'fixture-store',profileSourceConfigured:false,profileSourceComplete:false,profileEventsJson:'[]',correlationId:'digest-test-001'};
for(const fixture of fixtures.aggregation){
  const output=executeCode(workflow,'Aggregate Documented Business Events',{...baseProfile,...fixture.input,...fixture.profile});
  assertSubset(output,fixture.expected,fixture.name);
}
assert.ok(fixtures.aggregation.length>=10);
ok(`${fixtures.aggregation.length} window, coverage, schema, boundary, duplicate, and failure fixtures pass`);

const complete=executeCode(workflow,'Aggregate Documented Business Events',{...baseProfile,...fixtures.aggregation[0].input});
const llmRequest=executeCode(workflow,'Build Minimized Digest Prompt',complete);
assert.equal(llmRequest.capabilities.tools,false);assert.equal(llmRequest.output.mode,'json');assert.equal(llmRequest.temperature,0);
const prompt=llmRequest.messages[1].content;
assert.deepEqual(Object.keys(JSON.parse(prompt)).sort(),['metrics','sourceStatus','window']);
assert.ok(!prompt.includes('lead-001'));assert.ok(!prompt.includes('person-redacted'));assert.ok(!prompt.includes('CRM_TIMEOUT'));
ok('LLM receives only deterministic aggregate metrics, window, and coverage status');

const summary=executeCode(workflow,'Validate LLM Digest',{ok:true,json:{headline:'Итоги дня',summary:'Есть задачи, требующие внимания.',attentionRequired:true}},{lookups:{'Aggregate Documented Business Events':complete}});
assert.equal(summary.ok,true);assert.equal(summary.summary.attentionRequired,true);
const invented=executeCode(workflow,'Validate LLM Digest',{ok:true,json:{headline:'Итоги',summary:'Текст',attentionRequired:false,revenue:1000}},{lookups:{'Aggregate Documented Business Events':complete}});
assert.equal(invented.ok,false);assert.equal(invented.error.code,'LLM_OUTPUT_INVALID');
ok('strict LLM output accepts three bounded fields and rejects extra invented fields');

const telegramContract=executeCode(workflow,'Prepare Complete Digest Telegram Contract',summary);
assert.deepEqual(Object.keys(telegramContract).sort(),['chatId','contractVersion','correlationId','draftOnly','format','idempotencyKey','testMode','text']);
assert.match(telegramContract.text,/Лиды: 2; ошибки: 1/);
const senderPreview=executeCode(telegramWorkflow,'Validate Telegram Send Contract',{...telegramContract,profileAllowedChatIds:'123450099',profileTestMode:true,profileDraftOnly:true});
assert.equal(senderPreview.ok,true);assert.equal(senderPreview.status,'preview');
ok('complete digest satisfies the shared Telegram contract and remains preview-only by default');

const missing=executeCode(workflow,'Aggregate Documented Business Events',{...baseProfile,...fixtures.aggregation[4].input});
const missingNotice=executeCode(workflow,'Prepare Coverage Alert Telegram Contract',missing);
assert.match(missingNotice.text,/данные недоступны/);assert.match(missingNotice.text,/Лиды: н\/д; ошибки: н\/д/);assert.match(missingNotice.text,/Нули не считаются подтверждёнными/);
const partial=executeCode(workflow,'Aggregate Documented Business Events',{...baseProfile,...fixtures.aggregation[5].input});
const partialNotice=executeCode(workflow,'Prepare Coverage Alert Telegram Contract',partial);
assert.match(partialNotice.text,/данные частичные/);assert.match(partialNotice.text,/Лиды: 1/);
ok('missing data is rendered as н/д while partial coverage is visibly labelled with observed counts');

const event=executeCode(workflow,'Prepare Minimal Digest Event',{ok:true,correlationId:'digest-log-001',sourceStatus:'complete'});
assert.deepEqual(Object.keys(event).sort(),['contractVersion','correlationId','eventType','metadata','outcome','subjectRef','testMode']);
assert.equal(event.eventType,'executive.digest.processed');assert.equal(event.metadata.channel,'telegram');
ok('business event output is minimal and uses the documented logger schema');

const serialized=JSON.stringify(workflow)+JSON.stringify(fixtures);
assert.ok(!/(Bearer [A-Za-z0-9._~+/-]{12,}|sk-[A-Za-z0-9]{16,}|bot[0-9]{6,}:[A-Za-z0-9_-]{20,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/.test(serialized));
ok('workflow and fixtures contain no credential value, token, or private key');

console.log(`1..${assertionCount}`);
