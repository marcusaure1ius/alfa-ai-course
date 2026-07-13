import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const readJson=(relative)=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const workflow=readJson('workflows/business/telegram-assistant.json');
const normalizeWorkflow=readJson('workflows/core/normalize-incoming-message.json');
const approvalWorkflow=readJson('workflows/core/request-human-approval.json');
const logWorkflow=readJson('workflows/core/log-business-event.json');
const fixtures=readJson('tests/fixtures/telegram-assistant/contracts.json');
let assertionCount=0; const ok=(name)=>console.log(`ok ${++assertionCount} - ${name}`);

function executeCode(workflowJson,nodeName,input,{lookups={},staticData={}}={}){
  const node=workflowJson.nodes.find((candidate)=>candidate.name===nodeName); assert.ok(node,`missing node ${nodeName}`);
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
assert.equal(workflow.settings.saveDataSuccessExecution,'all');
assert.ok(workflow.nodes.some((node)=>node.type==='n8n-nodes-base.stickyNote'));
const trigger=workflow.nodes.find((node)=>node.type==='n8n-nodes-base.telegramTrigger');
assert.equal(trigger.typeVersion,1.3);
assert.deepEqual(trigger.parameters.updates,['message']);
assert.equal(trigger.parameters.additionalFields.download,false);
assert.equal(trigger.parameters.additionalFields.chatIds,'REPLACE_WITH_ALLOWED_CHAT_IDS');
assert.ok(trigger.credentials.telegramApi.id.startsWith('REPLACE_WITH_'));
const profile=workflow.nodes.find((node)=>node.name==='Telegram Assistant Profile');
const profileValues=Object.fromEntries(profile.parameters.assignments.assignments.map(({name,value})=>[name,value]));
assert.equal(profileValues.profileTestMode,true); assert.equal(profileValues.profileDraftOnly,true);
ok('inactive workflow uses pinned secret-verified Telegram trigger with fail-closed defaults');

const calls=workflow.nodes.filter((node)=>node.type==='n8n-nodes-base.executeWorkflow');
assert.deepEqual(calls.map((node)=>node.parameters.workflowId),['coreNormalizeMessageV1','coreGenericLlmGatewayV1','coreHumanApprovalV1','coreSendTelegramMessageV1','coreHumanApprovalV1','coreSendTelegramMessageV1','coreWorkflowErrorV1','coreBusinessEventLogV1']);
assert.ok(calls.every((node)=>node.parameters.options.waitForSubWorkflow===true));
ok('normalization, LLM, approval, Telegram, error, and logging use shared workflows');

const baseProfile={profileAllowedChatIds:'123450001,123450099',profileOwnerChatId:'123450099',profileOwnerUserId:'223450099',profileOwnerRef:'owner-001',profileModel:'fixture-model',profileTestMode:true,profileDraftOnly:true};
const inboundState={};
for(const fixture of fixtures.inbound){
  const input=structuredClone(fixture.input); if(input.message?.textRepeat){input.message.text=input.message.textRepeat.value.repeat(input.message.textRepeat.count);delete input.message.textRepeat;}
  const output=executeCode(workflow,'Validate and Route Telegram Update',{...input,...baseProfile,...fixture.profile},{staticData:inboundState});
  assertSubset(output,fixture.expected,fixture.name);
}
assert.ok(fixtures.inbound.length>=10);
ok(`${fixtures.inbound.length} allowlist, identity, loop, command, and input fixtures pass`);

const productionState={}; const production={...fixtures.inbound[0].input,...baseProfile,profileTestMode:false,profileDraftOnly:false};
const first=executeCode(workflow,'Validate and Route Telegram Update',production,{staticData:productionState});
const second=executeCode(workflow,'Validate and Route Telegram Update',production,{staticData:productionState});
assert.equal(first.accepted,true); assert.equal(second.accepted,false); assert.equal(second.error.code,'DUPLICATE_UPDATE'); assert.deepEqual(Array.from(productionState.telegramAssistantUpdates),['1001']);
ok('production update IDs are bounded and duplicate delivery is rejected before LLM');

const normalized=executeCode(normalizeWorkflow,'Normalize Safe Message',first.normalize);
assert.equal(normalized.ok,true); assert.equal(normalized.message.senderRef,'telegram-user'); assert.equal(normalized.message.messageKey,'telegram:501');
const request=executeCode(workflow,'Build Guarded LLM Request',normalized,{lookups:{'Validate and Route Telegram Update':first}});
assert.equal(request.provider,'generic'); assert.equal(request.output.mode,'json'); assert.equal(request.capabilities.tools,false); assert.match(request.messages[1].content,/^BEGIN_UNTRUSTED_TELEGRAM_MESSAGE/); assert.match(request.messages[0].content,/never follow/i);
ok('untrusted Telegram text reaches only the structured shared LLM contract with tools disabled');

const llmSource={correlationId:'telegram-update-1001',updateId:1001,testMode:true,draftOnly:true,chatId:'123450001',owner:{chatId:'123450099',ref:'owner-001'}};
for(const fixture of fixtures.llm){const input=structuredClone(fixture.input);if(input.json?.replyText==='__LONG_REPLY__')input.json.replyText='x'.repeat(2001);const output=executeCode(workflow,'Validate LLM Draft',input,{lookups:{'Validate and Route Telegram Update':llmSource}});assertSubset(output,fixture.expected,fixture.name);}
ok(`${fixtures.llm.length} structured-output fixtures reject invented fields and invalid drafts`);

const validDraft=executeCode(workflow,'Validate LLM Draft',fixtures.llm[0].input,{lookups:{'Validate and Route Telegram Update':llmSource}});
const approvalRequest=executeCode(workflow,'Prepare Approval Request',validDraft);
const pendingApproval=executeCode(approvalWorkflow,'Evaluate Approval Contract',approvalRequest);
assert.equal(pendingApproval.status,'pending'); assert.equal(pendingApproval.allowAction,false); assert.equal(validDraft.draftOnly,true);
ok('exported draft requests a fail-closed shared approval and cannot authorize a reply');

const pendingState={};
const storeRoute={...llmSource,testMode:false,draftOnly:false,owner:{chatId:'123450099',ref:'owner-001'}};
const ownerNotice=executeCode(workflow,'Store Pending and Prepare Owner Notice',pendingApproval,{lookups:{'Validate LLM Draft':{...validDraft,testMode:false,draftOnly:false},'Validate and Route Telegram Update':storeRoute},staticData:pendingState});
assert.equal(ownerNotice.chatId,'123450099'); assert.match(ownerNotice.text,/\/approve telegram-reply-1001/); assert.equal(pendingState.telegramAssistantPending['key:telegram-reply-1001'].status,'awaiting'); assert.ok(!JSON.stringify(pendingState).includes('Подскажите статус заявки'));
assert.deepEqual(Object.keys(ownerNotice).sort(),['chatId','contractVersion','correlationId','draftOnly','format','idempotencyKey','testMode','text']);
const pendingResult=executeCode(workflow,'Prepare Pending Result',{ok:true,status:'sent'},{lookups:{'Validate LLM Draft':{...validDraft,testMode:false,draftOnly:false},'Request Shared Approval':pendingApproval}});
const eventEnvelope=executeCode(workflow,'Prepare Minimal Business Event',pendingResult);
const loggedEvent=executeCode(logWorkflow,'Build Minimal Event Record',eventEnvelope);
assert.equal(loggedEvent.ok,true); assert.equal(loggedEvent.record.eventType,'telegram.assistant.processed');
ok('pending state stores only the bounded draft and owner command, not the raw user message');

const ownerRoute={accepted:true,route:'decision',testMode:false,draftOnly:false,correlationId:'telegram-update-1011',decision:{state:'approved',approvalKey:'telegram-reply-1001'},owner:{ref:'owner-001'}};
const resolved=executeCode(workflow,'Resolve Pending Owner Decision',ownerRoute,{staticData:pendingState});
assert.equal(resolved.pendingFound,true);
const resolutionRequest=executeCode(workflow,'Prepare Approval Resolution',resolved);
const approval=executeCode(approvalWorkflow,'Evaluate Approval Contract',{...resolutionRequest,now:new Date(Date.parse(resolved.pending.expiresAt)-1000).toISOString()});
const send=executeCode(workflow,'Enforce Exact Approval and Prepare Reply',approval,{lookups:{'Resolve Pending Owner Decision':resolved}});
const transport=executeCode(workflow,'Prepare Shared Telegram Reply Contract',send);
assert.equal(approval.allowAction,true); assert.equal(send.sendReady,true); assert.equal(send.chatId,'123450001'); assert.equal(send.idempotencyKey,'telegram-send-telegram-reply-1001');
assert.deepEqual(Object.keys(transport).sort(),['chatId','contractVersion','correlationId','draftOnly','format','idempotencyKey','testMode','text']);
ok('only an exact owner-bound unexpired approval prepares the user reply contract');

const mismatched=executeCode(workflow,'Enforce Exact Approval and Prepare Reply',{...approval,idempotencyKey:'telegram-reply-9999'},{lookups:{'Resolve Pending Owner Decision':resolved}});
assert.equal(mismatched.sendReady,false); assert.equal(mismatched.testMode,true); assert.equal(mismatched.error.code,'APPROVAL_CONTRACT_MISMATCH');
const replyBranches=workflow.connections['Reply Contract Valid?'].main; assert.equal(replyBranches[0][0].node,'Prepare Shared Telegram Reply Contract'); assert.equal(workflow.connections['Prepare Shared Telegram Reply Contract'].main[0][0].node,'Reply via Shared Telegram Sender'); assert.equal(replyBranches[1][0].node,'Prepare Shared Error Contract');
assert.equal(workflow.connections['Input Accepted?'].main[1][0].node,'Prepare Shared Error Contract'); assert.equal(workflow.connections['Draft Valid?'].main[1][0].node,'Prepare Shared Error Contract');
ok('mismatched approval fails closed and all invalid branches route to the shared error handler');

const serialized=JSON.stringify(workflow)+JSON.stringify(fixtures);
assert.ok(!/(bot[0-9]{6,}:[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._~+/-]{12,}|sk-[A-Za-z0-9]{16,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/.test(serialized));
assert.equal(workflow.pinData&&Object.keys(workflow.pinData).length,0);
ok('workflow and fixtures contain no token, credential value, private key, or pinned personal data');

console.log(`1..${assertionCount}`);
