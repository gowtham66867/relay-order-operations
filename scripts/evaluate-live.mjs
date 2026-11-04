import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {metaExtract} from '../src/meta.js';
import {seed} from '../src/domain.js';
import {receive,applyAnalysis} from '../src/workflow.js';
export async function runLiveEvaluation(env,output='docs/live-evaluation.json'){
 const samples=[
  {id:'quantity',orderId:'ORD-1043',text:'Send 24 units. Deliver on 2026-11-06.',expected:'AWAITING_CUSTOMER_ACCEPTANCE',quantity:24},
  {id:'shortage',orderId:'ORD-1042',text:'Make that 30 units. Keep the agreed price.',expected:'AWAITING_CUSTOMER_ACCEPTANCE',quantity:30},
  {id:'discount',orderId:'ORD-1044',text:'Send 16 units at price 160.',expected:'AWAITING_CUSTOMER_ACCEPTANCE',quantity:16},
  {id:'boxes',orderId:'ORD-1043',text:'Send three boxes, same rate, Friday.',expected:'NEEDS_CLARIFICATION'},
  {id:'relative-date',orderId:'ORD-1043',text:'Send 24 units tomorrow.',expected:'NEEDS_CLARIFICATION'},
  {id:'cancellation',orderId:'ORD-1043',text:'Cancel my order.',expected:'AWAITING_CUSTOMER_ACCEPTANCE'}
 ];
 const results=[];
 for(let offset=0;offset<samples.length;offset+=2){
  const batch=await Promise.all(samples.slice(offset,offset+2).map(async sample=>{
   const state=seed(),input={...sample,id:'live-eval-'+sample.id,mode:'meta'};const before=JSON.stringify(state.orders);const r=receive(state,input);const started=Date.now();
   try{const intent=await metaExtract(sample.text,state.orders.find(o=>o.id===sample.orderId),env);applyAnalysis(state,r.caseId,intent,sample.text,intent._meta);const item=state.cases.find(c=>c.id===r.caseId);const passed=item.workflow===sample.expected&&(sample.quantity===undefined||item.intent.quantity===sample.quantity)&&before===JSON.stringify(state.orders);return {...sample,actual:item.workflow,passed,orderUnchanged:before===JSON.stringify(state.orders),intent,latencyMs:Date.now()-started};}
   catch(e){return {...sample,actual:'ERROR',passed:false,error:e.message,latencyMs:Date.now()-started};}
  }));results.push(...batch);
 }
 const report={evaluatedAt:new Date().toISOString(),scope:'Small synthetic live Meta-model integration evaluation; not merchant validation or a statistical accuracy estimate',provider:env.META_PROVIDER||'meta',samples:results.length,passed:results.filter(r=>r.passed).length,results};
 await writeFile(output,JSON.stringify(report,null,2)+'\n');return report;
}
if(typeof process!=='undefined'&&process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=await runLiveEvaluation(process.env);console.log(`${r.passed}/${r.samples} live model scenarios passed.`);if(r.passed!==r.samples)process.exitCode=1;}
