import { Problem, requireThat, getOrder, demoExtract, ingest, decide, customerDraft, seed, record, available } from '../src/domain.js';
import { metaExtract, inferenceConfig } from '../src/meta.js';
import { WorkspaceStore } from '../src/storage.js';
import { receive, applyAnalysis, failAnalysis, acceptProposal, executeProposal, caseFor, requireClarifiable, workflowOf } from '../src/workflow.js';
import html from '../public/index.html';
import css from '../public/styles.css';
import client from '../public/client.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {async fetch(request,env) {
  const url=new URL(request.url);
  try {
    if(url.pathname==='/') return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self' https://*.chatgpt.com https://chatgpt.com",'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
    if(url.pathname==='/styles.css') return new Response(css,{headers:{'Content-Type':'text/css'}});
    if(url.pathname==='/client.js') return new Response(client,{headers:{'Content-Type':'text/javascript'}});
    if(!url.pathname.startsWith('/api/')) return json({error:'Not found'},404);
    const user=request.headers.get('oai-authenticated-user-id') || (env.LOCAL_DEV==='1'?'local-operator':null);
    requireThat(user,'Sign in to access this workspace.',401);
    requireThat(env.DB,'Database is not connected',503);
    if(request.method!=='GET') {
      requireThat(request.method==='POST','Method not allowed',405);
      const origin=request.headers.get('origin');
      requireThat(!origin || origin===url.origin,'Cross-origin requests are not allowed',403);
      requireThat(request.headers.get('content-type')?.includes('application/json'),'JSON request required',415);
      const raw=await request.text();
      requireThat(raw.length<=20000,'Request too large',413);
      let input; try{input=JSON.parse(raw);}catch{throw new Problem(400,'Invalid JSON');}
      requireThat(input&&typeof input==='object'&&!Array.isArray(input),'JSON object required');
      const store=new WorkspaceStore(env.DB);
      const {state,version}=await store.load(user);
      let result={};
      if(url.pathname==='/api/messages') {
        requireThat(typeof input.id==='string' && /^[\w:.-]{1,100}$/.test(input.id),'Use a message ID of 1-100 letters, digits, dots, dashes or colons');
        requireThat(typeof input.text==='string' && input.text.trim().length>0 && input.text.length<=6000,'Message must contain 1-6,000 characters');
        requireThat(input.mode==='demo' || input.mode==='meta','Choose demo or Meta mode');
        const duplicate=state.messages.find(m=>m.id===input.id);
        if(duplicate) {
          requireThat(duplicate.orderId===input.orderId && duplicate.text===input.text,'Message ID already belongs to different content',409);
          return json({duplicate:true,caseId:duplicate.caseId});
        }
        requireThat(state.messages.length<500,'Demo workspace limit reached. Export the audit and reset the workspace.',422);
        result=receive(state,input);
        await store.save(user,version,state);
        // Intake is durable before the remote model call. Reload before committing the analysis.
        try {
          const order=getOrder(state,input.orderId);
          const intent=input.mode==='meta'?await metaExtract(input.text,order,env):demoExtract(input.text,order);
          const current=await store.load(user);
          applyAnalysis(current.state,result.caseId,intent,input.text,intent._meta||{});
          await store.save(user,current.version,current.state);
          return json(result);
        } catch(error) {
          const current=await store.load(user);failAnalysis(current.state,result.caseId,error);
          await store.save(user,current.version,current.state);throw error;
        }
      } else if(url.pathname==='/api/clarifications') {
        const item=caseFor(state,input.caseId);
        requireThat(typeof input.id==='string'&&/^[\w:.-]{1,100}$/.test(input.id),'Valid clarification message ID required');
        const duplicate=state.messages.find(m=>m.id===input.id);
        if(duplicate){requireThat(duplicate.caseId===item.id&&duplicate.text===input.text,'Message ID already belongs to different content',409);return json({duplicate:true,caseId:item.id});}
        requireClarifiable(state,item.id);
        requireThat(typeof input.text==='string'&&input.text.trim()&&input.text.length<=6000,'Clarification must contain 1–6,000 characters');
        requireThat(state.messages.length<500,'Workspace message limit reached',422);
        state.messages.push({id:input.id,orderId:item.orderId,text:input.text,at:new Date().toISOString(),caseId:item.id,source:'operator_transcribed_customer_reply'});
        item.workflow='RECEIVED';record(state,'clarification.received',`${item.orderId}: reply ${input.id} persisted before interpretation.`);
        await store.save(user,version,state);
        try {
          const order=getOrder(state,item.orderId);
          const intent=item.mode==='meta'?await metaExtract(input.text,order,env):demoExtract(input.text,order);
          const current=await store.load(user);applyAnalysis(current.state,item.id,intent,input.text,intent._meta||{});
          await store.save(user,current.version,current.state);return json({caseId:item.id});
        } catch(error){const current=await store.load(user);failAnalysis(current.state,item.id,error);await store.save(user,current.version,current.state);throw error;}
      } else if(url.pathname==='/api/acceptances') acceptProposal(state,input,user);
      else if(url.pathname==='/api/decisions') executeProposal(state,input,user);
      else if(url.pathname==='/api/reset') {requireThat(input.confirm==='RESET DEMO','Explicit reset confirmation required'); Object.assign(state,seed()); record(state,'workspace.reset','Operator reset synthetic demo data.');}
      else return json({error:'Not found'},404);
      await store.save(user,version,state);
      return json(result);
    }
    const {state,version}=await new WorkspaceStore(env.DB).load(user);
    if(url.pathname==='/api/workspace') return json({...state,version,metaConfigured:inferenceConfig(env).configured,model:inferenceConfig(env).model,provider:inferenceConfig(env).provider,catalog:state.catalog.map(p=>({...p,available:available(state,p.sku)})),cases:state.cases.map(c=>({...c,workflow:workflowOf(c),proposalVersion:c.proposalVersion||1,drafts:Object.fromEntries(c.plan.choices.map(choice=>[choice.id,customerDraft(state,c,choice.id)]))}))});
    if(url.pathname==='/api/export') return json({exportedAt:new Date().toISOString(),...state});
    return json({error:'Not found'},404);
  } catch(error) {
    if(error instanceof Problem) return json({error:error.message},error.status);
    if(error.name==='TimeoutError') return json({error:'Meta request timed out. Retry; no order was changed.'},504);
    console.error('Relay request failed:',error.name);
    return json({error:'Unable to complete this request. No partial change was applied.'},500);
  }
}};
