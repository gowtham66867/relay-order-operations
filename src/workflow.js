import {requireThat, getOrder, validateIntent, makePlan, decide, stamp, record, Problem} from './domain.js';

const TERMINAL = new Set(['COMPLETED','CANCELLED','SUPERSEDED','FAILED']);
export function workflowOf(item) {
  return item.workflow || ({pending:'AWAITING_CUSTOMER_ACCEPTANCE',approved:'COMPLETED',dismissed:'CANCELLED',superseded:'SUPERSEDED',failed:'FAILED'}[item.status]) || 'RECEIVED';
}
export function receive(state,input) {
  const duplicate=state.messages.find(m=>m.id===input.id);
  if(duplicate){requireThat(duplicate.orderId===input.orderId && duplicate.text===input.text,'Message ID already belongs to different content',409);return {duplicate:true,caseId:duplicate.caseId};}
  const order=getOrder(state,input.orderId);
  const item={id:crypto.randomUUID(),orderId:order.id,messageId:input.id,createdAt:stamp(),status:'processing',workflow:'RECEIVED',baseVersion:order.version,proposalVersion:0,mode:input.mode,intent:{evidence:[input.text],summary:'Interpreting customer request'},plan:{flags:[],choices:[],exposure:0},turns:[],acceptance:null,execution:null};
  state.messages.push({id:input.id,orderId:input.orderId,text:input.text,at:stamp(),caseId:item.id,source:input.source||'operator_intake'});
  // A newer request makes all older unfinished proposals unsafe, even while clarification is pending.
  for(const previous of state.cases.filter(c=>c.orderId===order.id&&!TERMINAL.has(workflowOf(c)))){
    previous.status='superseded';previous.workflow='SUPERSEDED';previous.supersededBy=item.id;previous.acceptance=null;
    record(state,'proposal.superseded',`${order.id}: ${previous.id} superseded by message ${input.id}.`);
  }
  state.cases.push(item);record(state,'message.received',`${input.id} persisted before interpretation; ${order.id}.`);
  return {duplicate:false,caseId:item.id};
}
export function caseFor(state,id) {const item=state.cases.find(c=>c.id===id);requireThat(item,'Case not found',404);return item;}

export function clarificationsFor(text,intent) {
  const questions=[];
  const units=/\b(?:units?|pieces?)\b/i.test(text);
  if(/\b(?:boxes|box|cartons?|packs?)\b/i.test(text)&&!units) questions.push('How many individual units do you want? Packaging size is not established for this order.');
  if(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|asap)\b/i.test(text)&&!intent.delivery) questions.push('What exact delivery date do you want? Please use YYYY-MM-DD. Transport capacity still needs confirmation.');
  const weekday=text.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)?.[1]?.toLowerCase();
  if(weekday&&intent.delivery&&Number.isFinite(Date.parse(intent.delivery))&&['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(intent.delivery).getUTCDay()]!==weekday)questions.push('The weekday and calendar date disagree. Which exact YYYY-MM-DD date should we use?');
  if(/\b(?:maybe|either|or perhaps|not sure)\b/i.test(text)) questions.push('What is the final requested quantity or date? Confirm one option before we plan fulfillment.');
  if(/\b(?:ignore (?:all |previous )?(?:instructions|rules)|system prompt|bypass|without approval|override policy)\b/i.test(text)) questions.push('This message contains operational instructions we cannot execute. Restate only the customer’s order change.');
  if(Array.isArray(intent.ambiguities)) for(const q of intent.ambiguities.slice(0,4))if(typeof q==='string'&&q.trim())questions.push(q.slice(0,300));
  if(!questions.length&&intent.quantity==null&&intent.delivery==null&&intent.requestedPrice==null&&intent.kind!=='cancel')questions.push('What should change: quantity in individual units, an exact delivery date, or a requested unit price?');
  return [...new Set(questions)].slice(0,5);
}
export function applyAnalysis(state,id,intent,text,metadata={}) {
  const item=caseFor(state,id);
  requireThat(['RECEIVED','NEEDS_CLARIFICATION','FAILED'].includes(workflowOf(item)),'A newer request or decision has replaced this analysis',409);
  const order=getOrder(state,item.orderId);
  requireThat(order.version===item.baseVersion,'Order changed during analysis. Submit a new message.',409);
  requireThat(intent&&typeof intent==='object','The interpreter did not return a structured result',502);
  const sourceText=state.messages.filter(m=>m.caseId===id).map(m=>m.text).join('\n');
  requireThat(Array.isArray(intent.evidence)&&intent.evidence.length>0&&intent.evidence.every(q=>typeof q==='string'&&q.trim()&&text.includes(q)),'Evidence must quote the original message exactly',422);
  const previous=item.partialIntent;
  const combined={...intent,evidence:[...new Set([...(previous?.evidence||[]),...intent.evidence])].slice(-5)};
  for(const field of ['quantity','delivery','requestedPrice'])if(combined[field]==null&&previous?.[field]!=null)combined[field]=previous[field];
  const questions=clarificationsFor(text,combined);
  if(previous?.needsUnits&&!/\b(?:units?|pieces?)\b/i.test(text))questions.unshift('Please confirm the total quantity in individual units.');
  item.partialIntent={...combined,needsUnits:(/\b(?:boxes|box|cartons?|packs?)\b/i.test(text)||previous?.needsUnits)&&!/\b(?:units?|pieces?)\b/i.test(text)};
  item.turns ||= [];
  item.turns.push({at:stamp(),text,questions,mode:item.mode,...metadata});
  item.acceptance=null;item.proposalVersion=(item.proposalVersion||0)+1;
  if(questions.length){
    item.status='needs_clarification';item.workflow='NEEDS_CLARIFICATION';item.questions=questions;
    item.intent={quantity:null,delivery:null,requestedPrice:null,evidence:intent.evidence,summary:'Clarification needed before planning'};
    item.plan={flags:[],choices:[],exposure:0};
    record(state,'clarification.requested',`${item.orderId}: ${questions.join(' ')}`);return;
  }
  if(intent.kind==='cancel'){
    requireThat(/\b(cancel|cancellation)\b/i.test(text),'Cancellation is absent from source evidence',422);
    item.intent={kind:'cancel',quantity:null,delivery:null,requestedPrice:null,evidence:intent.evidence,summary:'Customer requests order cancellation'};
    item.plan={quantity:order.quantity,stock:0,shortage:0,exposure:0,flags:[{code:'CANCELLATION',label:'Cancellation needs customer confirmation',detail:`Releases ${order.allocated} reserved units. No refund or external action is performed.`}],choices:[{id:'cancel',label:'Cancel this order and release its allocation',quantity:order.quantity,allocated:0,sku:order.sku,price:order.price,delivery:order.delivery}]};
  }else{
    item.intent=validateIntent(combined,sourceText);item.plan=makePlan(state,order,item.intent);
  }
  item.questions=[];item.workflow='AWAITING_CUSTOMER_ACCEPTANCE';item.status='pending';
  record(state,'proposal.created',`${item.orderId}: proposal v${item.proposalVersion}; ${item.mode}; ${item.plan.flags.length} exceptions.`);
}
export function failAnalysis(state,id,error) {
  const item=caseFor(state,id);
  if(!['RECEIVED','NEEDS_CLARIFICATION'].includes(workflowOf(item)))return;
  item.workflow='FAILED';item.status='failed';item.failure=String(error.message).slice(0,350);
  record(state,'analysis.failed',`${item.orderId}: interpretation failed; order unchanged.`);
}
export function acceptProposal(state,input,actor) {
  const item=caseFor(state,input.caseId),order=getOrder(state,item.orderId);
  requireThat(workflowOf(item)==='AWAITING_CUSTOMER_ACCEPTANCE','This proposal is not awaiting acceptance',409);
  requireThat(input.proposalVersion===(item.proposalVersion||1),'Proposal version changed',409);
  requireThat(order.version===item.baseVersion,'Order changed since analysis',409);
  requireThat(item.plan.choices.some(c=>c.id===input.choiceId),'Choose a feasible option');
  requireThat(typeof input.reference==='string'&&input.reference.trim().length>=5&&input.reference.length<=500,'Record a customer acceptance reference of 5–500 characters');
  requireThat(input.confirmed===true,'Customer acceptance must be explicitly confirmed',422);
  item.acceptance={id:crypto.randomUUID(),at:stamp(),proposalVersion:item.proposalVersion||1,choiceId:input.choiceId,source:'operator_attestation',reference:input.reference,actor};
  item.workflow='AWAITING_OPERATOR_APPROVAL';
  record(state,'customer.acceptance_recorded',`${item.orderId}: operator attested acceptance of proposal v${item.acceptance.proposalVersion}, option ${input.choiceId}. Reference: ${input.reference}`);
}
export function executeProposal(state,input,actor) {
  const item=caseFor(state,input.caseId);
  requireThat(!TERMINAL.has(workflowOf(item)),'Case has already been resolved',409);
  if(input.action==='dismiss'){
    requireThat(!TERMINAL.has(workflowOf(item)),'Case has already been resolved',409);
    item.status='dismissed';item.workflow='CANCELLED';item.acceptance=null;
    record(state,'case.dismissed',`${item.orderId}: operator ${actor} dismissed proposed change.`);return;
  }
  requireThat(input.action==='approve','Unknown decision');
  requireThat(workflowOf(item)==='AWAITING_OPERATOR_APPROVAL'&&item.acceptance,'Record customer acceptance before operator approval',422);
  requireThat(input.proposalVersion===item.acceptance.proposalVersion&&input.choiceId===item.acceptance.choiceId,'Approval must match the accepted proposal version and option',409);
  const order=getOrder(state,item.orderId);
  requireThat(order.version===item.baseVersion,'Order changed since analysis',409);
  item.execution={id:crypto.randomUUID(),idempotencyKey:`${item.id}:v${input.proposalVersion}`,adapter:'local-ledger',startedAt:stamp(),actor,status:'EXECUTING'};
  if(item.intent.kind==='cancel'){
    order.allocated=0;order.status='Cancelled';order.version++;
    item.status='approved';item.applied=item.plan.choices[0];item.resolvedAt=stamp();
    record(state,'order.cancelled',`${order.id}: allocation released; no external refund or message sent.`);
  }else{
    decide(state,{caseId:item.id,action:'approve',choiceId:input.choiceId,customerConfirmed:true});
  }
  // The local ledger and execution record commit in one compare-and-swap. External ERPs require reconciliation.
  item.execution.status='VERIFIED';item.execution.verifiedAt=stamp();item.execution.orderVersion=order.version;item.workflow='COMPLETED';
  record(state,'execution.verified',`${order.id}: local ledger v${order.version}; idempotency ${item.execution.idempotencyKey}.`);
}
export function requireClarifiable(state,id){const item=caseFor(state,id);requireThat(workflowOf(item)==='NEEDS_CLARIFICATION','This case is not awaiting clarification',409);return item;}
