import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const readJson=(relative)=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const workflow=readJson('workflows/business/lead-handler.json');
const approvalWorkflow=readJson('workflows/core/request-human-approval.json');
const leadWorkflow=readJson('workflows/core/crm-generic-lead-upsert.json');
const taskWorkflow=readJson('workflows/core/crm-generic-task-create.json');
const telegramWorkflow=readJson('workflows/core/send-telegram-message.json');
const fixtures=readJson('tests/fixtures/lead-handler/contracts.json');
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
assert.equal(workflow.settings.saveDataSuccessExecution,'all');
assert.equal(workflow.pinData&&Object.keys(workflow.pinData).length,0);
assert.ok(workflow.nodes.some((node)=>node.type==='n8n-nodes-base.stickyNote'));
const webhook=workflow.nodes.find((node)=>node.name==='Authenticated Lead Webhook');
assert.equal(webhook.parameters.authentication,'headerAuth');
assert.equal(webhook.parameters.httpMethod,'POST');
assert.ok(webhook.credentials.httpHeaderAuth.id.startsWith('REPLACE_WITH_'));
const profile=workflow.nodes.find((node)=>node.name==='Lead Handler Profile');
const profileValues=Object.fromEntries(profile.parameters.assignments.assignments.map(({name,value})=>[name,value]));
assert.equal(profileValues.profileTestMode,true);assert.equal(profileValues.profileDraftOnly,true);
ok('inactive Header Auth webhook has credential-only authentication and fail-closed profile defaults');

const calls=workflow.nodes.filter((node)=>node.type==='n8n-nodes-base.executeWorkflow');
assert.deepEqual(calls.map((node)=>node.parameters.workflowId),[
  'coreGenericLlmGatewayV1','coreHumanApprovalV1','coreSendTelegramMessageV1','coreHumanApprovalV1',
  'coreGenericCrmLeadUpsertV1','coreGenericCrmTaskCreateV1','coreSendTelegramMessageV1','coreWorkflowErrorV1','coreBusinessEventLogV1',
]);
assert.ok(calls.every((node)=>node.parameters.options.waitForSubWorkflow===true));
ok('LLM, approval, CRM, Telegram, error, and event operations use shared workflows');

const baseProfile={profileTestMode:true,profileDraftOnly:true,profileOwnerRef:'owner-001',profileOwnerChatId:'123450099',profileResponsibleRef:'42',profileModel:'fixture-model'};
for(const fixture of fixtures.intake){
  const output=executeCode(workflow,'Validate Normalize and Deduplicate',{...fixture.input,...baseProfile,...fixture.profile});
  assertSubset(output,fixture.expected,fixture.name);
}
assert.ok(fixtures.intake.length>=10);
ok(`${fixtures.intake.length} webhook, profile, phone/email, and schema fixtures pass`);

const productionState={};
const production={...baseProfile,profileTestMode:false,profileDraftOnly:false,eventId:'event-replay-0001',idempotencyKey:'lead-replay-0001',lead:{email:'replay@example.org'}};
const first=executeCode(workflow,'Validate Normalize and Deduplicate',production,{staticData:productionState});
const replay=executeCode(workflow,'Validate Normalize and Deduplicate',production,{staticData:productionState});
assert.equal(first.accepted,true);assert.equal(replay.accepted,false);assert.equal(replay.error.code,'DUPLICATE_EVENT');
assert.deepEqual(Array.from(productionState.leadHandlerEvents),['event-replay-0001']);
ok('production event replay is rejected before LLM or mutation');

const intake=executeCode(workflow,'Validate Normalize and Deduplicate',{...baseProfile,eventId:'event-flow-0001',idempotencyKey:'lead-flow-0001',lead:{name:'Мария',email:'maria@example.org',phone:'+7 999 000-11-22',message:'Нужна CRM, свяжитесь завтра'}});
const llmRequest=executeCode(workflow,'Build Minimized LLM Request',intake);
assert.equal(llmRequest.capabilities.tools,false);assert.equal(llmRequest.output.mode,'json');
assert.match(llmRequest.messages[1].content,/BEGIN_UNTRUSTED_LEAD_MESSAGE/);
assert.ok(!JSON.stringify(llmRequest).includes('maria@example.org'));assert.ok(!JSON.stringify(llmRequest).includes('+79990001122'));assert.ok(!JSON.stringify(llmRequest).includes('Мария'));
ok('LLM request receives only bounded untrusted message text and no contact identity');

for(const fixture of fixtures.llm){
  const output=executeCode(workflow,'Validate Conservative Extraction',fixture.input,{lookups:{'Validate Normalize and Deduplicate':intake}});
  assertSubset(output,fixture.expected,fixture.name);
}
ok(`${fixtures.llm.length} nullable extraction fixtures reject invention and malformed output`);

const extracted=executeCode(workflow,'Validate Conservative Extraction',fixtures.llm[0].input,{lookups:{'Validate Normalize and Deduplicate':intake}});
const approvalRequest=executeCode(workflow,'Prepare Mutation Approval',extracted);
const pendingApproval=executeCode(approvalWorkflow,'Evaluate Approval Contract',approvalRequest);
assert.equal(pendingApproval.status,'pending');assert.equal(pendingApproval.allowAction,false);assert.equal(extracted.testMode,true);
ok('intake can only request pending approval and cannot mutate CRM');

const pendingState={};
const ownerNotice=executeCode(workflow,'Store Pending and Notify Owner',pendingApproval,{lookups:{'Validate Conservative Extraction':extracted},staticData:pendingState});
assert.equal(ownerNotice.chatId,'123450099');assert.equal(ownerNotice.draftOnly,true);
assert.deepEqual(Object.keys(ownerNotice).sort(),['chatId','contractVersion','correlationId','draftOnly','format','idempotencyKey','testMode','text']);
const senderPreview=executeCode(telegramWorkflow,'Validate Telegram Send Contract',{...ownerNotice,profileAllowedChatIds:'123450099',profileTestMode:true,profileDraftOnly:true});
assert.equal(senderPreview.ok,true);assert.equal(senderPreview.status,'preview');
assert.ok(pendingState.leadHandlerPending[extracted.approvalKey]);
const pendingResult=executeCode(workflow,'Return Pending Approval',senderPreview,{lookups:{'Store Pending and Notify Owner':ownerNotice,'Validate Conservative Extraction':extracted}});
assert.equal(pendingResult.approvalKey,extracted.approvalKey);
ok('pending state and exact Telegram contract preserve approval key without leaking extra sender fields');

const resolveInput={...baseProfile,phase:'resolve',approvalKey:extracted.approvalKey,decision:{state:'approved',approverRef:'owner-001'},now:new Date(Date.parse(pendingApproval.request.expiresAt)-1000).toISOString()};
const resolved=executeCode(workflow,'Validate Normalize and Deduplicate',resolveInput,{staticData:pendingState});
const resolution=executeCode(workflow,'Prepare Approval Resolution',resolved);
const approved=executeCode(approvalWorkflow,'Evaluate Approval Contract',resolution);
assert.equal(approved.allowAction,true);
const expiredState=structuredClone(pendingState);
expiredState.leadHandlerPending[extracted.approvalKey].expiresAt='2000-01-01T00:00:00.000Z';
const backdated=executeCode(workflow,'Validate Normalize and Deduplicate',{...resolveInput,profileTestMode:false,profileDraftOnly:false,now:'1999-01-01T00:00:00.000Z'},{staticData:expiredState});
assert.equal(backdated.now,undefined);
const expiredResolution=executeCode(workflow,'Prepare Approval Resolution',backdated);
const expiredApproval=executeCode(approvalWorkflow,'Evaluate Approval Contract',expiredResolution);
assert.equal(expiredApproval.status,'expired');assert.equal(expiredApproval.allowAction,false);
const preparedLead=executeCode(workflow,'Prepare Approved Lead Upsert',approved,{lookups:{'Validate Normalize and Deduplicate':resolved}});
assert.equal(preparedLead.testMode,true);assert.equal(preparedLead.lead.provenance.notes,'user');assert.ok(!('approved' in preparedLead.lead));
ok('exact owner approval works in tests while production ignores caller time and enforces real expiry');

const genericProfile={profileBaseUrl:'https://crm.example.invalid/v1',profileTimeoutMs:30000};
const leadPreview=executeCode(leadWorkflow,'Prepare Lead Upsert',{...preparedLead,...genericProfile});
assert.equal(leadPreview.ok,true);assert.equal(leadPreview.mutate,false);
const leadResult=executeCode(leadWorkflow,'Return Lead Preview',leadPreview);
const taskRequest=executeCode(workflow,'Prepare Approved CRM Task',leadResult,{lookups:{'Prepare Approved Lead Upsert':preparedLead,'Validate Normalize and Deduplicate':resolved}});
const taskPreview=executeCode(taskWorkflow,'Prepare Task Create',{...taskRequest,...genericProfile});
assert.equal(taskPreview.ok,true);assert.equal(taskPreview.mutate,false);assert.equal(taskRequest.task.relatedLeadRef,'webhook:lead-flow-0001');
ok('approved test-mode path satisfies generic lead and task contracts without HTTP mutation');

const mismatch=executeCode(workflow,'Prepare Approved Lead Upsert',{...approved,idempotencyKey:'lead-approval-other'},{lookups:{'Validate Normalize and Deduplicate':resolved}});
assert.equal(mismatch.ok,false);assert.equal(mismatch.error.code,'APPROVAL_CONTRACT_MISMATCH');
const partial=executeCode(workflow,'Expose Partial Failure',{ok:false,error:{code:'CRM_UNAVAILABLE'}},{lookups:{'Prepare Approved Lead Upsert':{...preparedLead,testMode:false},'Upsert Lead via CRM':{ok:true,mutated:true,crmId:'77'}}});
assert.equal(partial.status,'partial_failure');assert.equal(partial.reconciliationRequired,true);assert.equal(partial.error.retryable,false);
const restored=executeCode(workflow,'Return Safe Business Result',{ok:true},{lookups:{'Return Safe Error':{ok:false,status:'failed',mutated:false,error:{code:'SAFE'}}}});
assert.equal(restored.error.code,'SAFE');
ok('approval mismatch fails closed and post-lead task failure requires reconciliation');

assert.equal(workflow.connections['Input Accepted?'].main[1][0].node,'Prepare Shared Error Contract');
assert.equal(workflow.connections['Extraction Valid?'].main[1][0].node,'Prepare Shared Error Contract');
assert.equal(workflow.connections['Lead Upsert Succeeded?'].main[1][0].node,'Prepare Shared Error Contract');
assert.equal(workflow.connections['Task Create Succeeded?'].main[1][0].node,'Expose Partial Failure');
assert.equal(workflow.connections['Log via Shared Workflow'].main[0][0].node,'Return Safe Business Result');
ok('invalid, provider, CRM, and partial-failure branches are explicit');

const serialized=JSON.stringify(workflow)+JSON.stringify(fixtures);
assert.ok(!/(Bearer [A-Za-z0-9._~+/-]{12,}|sk-[A-Za-z0-9]{16,}|bot[0-9]{6,}:[A-Za-z0-9_-]{20,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)/.test(serialized));
ok('workflow and fixtures contain no credential value, token, private key, or real personal data');

console.log(`1..${assertionCount}`);
