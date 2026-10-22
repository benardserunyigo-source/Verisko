import {firstClientPayment} from './ready-payments.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=(v,n=150)=>typeof v==='string'?v.trim().slice(0,n):'';
const sum=rows=>Math.round((rows||[]).reduce((n,x)=>n+x.quantity,0)*100)/100;
export const materialTotals=item=>({ordered:sum(item.orders),arrived:sum(item.receipts)});
export function materialStatus(plan){if(!plan?.items?.length)return 'Not planned';const totals=plan.items.map(materialTotals);if(totals.every((t,i)=>t.arrived>=plan.items[i].planned))return 'All materials arrived';if(totals.some(t=>t.arrived>0))return 'Some materials arrived';if(totals.some(t=>t.ordered>0))return 'Materials ordered';return plan.requestedAt?'Buying requested':'Materials planned';}
export function paidWork(p,transactions=[],jobs=[],c){
 const rows=c?.firstPayment?[...transactions.filter(t=>t.id!==c.firstPayment.id),c.firstPayment]:transactions;
 const linked=jobs.filter(j=>j.prospectId===p.id&&!['Rejected','Cancelled'].includes(j.stage));
 const paid=firstClientPayment(p.id,rows,jobs)?.status==='approved';if(!paid)return [];
 // A client-level deposit covers their selected job; job-linked deposits stay with that job.
 const direct=rows.some(t=>t.direction==='in'&&Number(t.amount)>0&&t.status==='approved'&&t.prospectId===p.id&&!t.installId);
 const priorClientPlan=c?.materialPlans?.some(x=>x.sourceId==='client-'+p.id);
 if(!linked.length||priorClientPlan&&linked.length===1&&direct)return [{id:'client-'+p.id,label:linked[0]?.ref||p.business||'Client order'}];
 const work=linked.filter(j=>direct||rows.some(t=>t.direction==='in'&&Number(t.amount)>0&&t.status==='approved'&&t.installId===j.id)).map(j=>({id:j.id,label:j.ref||j.business||'Client job'}));
 if(priorClientPlan)work.unshift({id:'client-'+p.id,label:'Existing client order'});return work;
}
export function materialsSummary(plans=[]){if(!plans.length)return 'Not planned';const states=plans.map(materialStatus);return states.every(s=>s==='All materials arrived')?'All materials arrived':states.some(s=>s==='Some materials arrived'||s==='All materials arrived')?'Some materials arrived':states.some(s=>s==='Materials ordered')?'Materials ordered':states.some(s=>s==='Buying requested')?'Buying requested':'Materials planned';}
function day(value,at){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value||value>new Date(Date.parse(at)+10800000).toISOString().slice(0,10))throw fail('Choose today or an earlier date.');return value;}
function quantity(value,unit){const q=Number(value);if(!Number.isFinite(q)||q<=0||q>1000000||Math.abs(q*100-Math.round(q*100))>1e-7||(unit!=='m'&&!Number.isInteger(q)))throw fail('Enter a valid quantity. Use whole numbers for pieces, boxes and rolls.');return q;}
export function applyMaterials(c,body,me,p,transactions,jobs,at){
 if(!['admin','operations'].includes(me.role))throw fail('Only Operations can manage materials and buying.',403);
 const work=paidWork(p,transactions,jobs,c).find(w=>w.id===body.sourceId);if(!work)throw fail('Choose a job with an approved client payment.',409);
 const plans=c.materialPlans||[],old=plans.find(x=>x.sourceId===work.id);let plan=old?structuredClone(old):{sourceId:work.id,label:work.label,items:[],createdAt:at};
 if(body.action==='plan_materials'){
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>40)throw fail('Add between 1 and 40 materials.');
  const seen=new Set(),ids=new Set();plan.items=body.items.map(i=>{const id=clean(i.id,100),name=clean(i.name),unit=clean(i.unit,10),source=clean(i.source,10);if(!/^[\w-]{1,100}$/.test(id)||ids.has(id))throw fail('Each material needs its own ID.');ids.add(id);if(name.length<2||!['pcs','m','box','roll'].includes(unit)||!['China','Uganda'].includes(source))throw fail('Choose the item, unit and where to buy it.');const key=[name.toLowerCase(),unit,source].join('|');if(seen.has(key))throw fail('This material is listed twice. Change its quantity instead.');seen.add(key);
   const prior=old?.items.find(x=>x.id===id),totals=prior?materialTotals(prior):{ordered:0,arrived:0},planned=quantity(i.planned,unit);
   if(totals.ordered&&(prior.name!==name||prior.unit!==unit||prior.source!==source))throw fail('Keep an ordered item unchanged. Add a new line for a different item.');if(planned<totals.ordered)throw fail('The planned quantity cannot be below what is ordered.');return {id,name,unit,source,planned,orders:prior?.orders||[],receipts:prior?.receipts||[]};});
  if(old?.items.some(i=>!ids.has(i.id)&&materialTotals(i).ordered))throw fail('Keep items that have already been ordered.');plan.requestedAt=old&&JSON.stringify(old.items)===JSON.stringify(plan.items)?old.requestedAt||'':'';plan.updatedAt=at;
 }else{
  if(!old?.items.length)throw fail('Save the materials plan first.',409);
  if(body.action==='request_procurement'){if(plan.requestedAt)throw fail('Buying has already been requested.',409);plan.requestedAt=at;plan.requestedBy=me.name;}
  else{
   if(!plan.requestedAt)throw fail('Request buying before recording an order or delivery.',409);
   const item=plan.items.find(i=>i.id===body.itemId);if(!item)throw fail('Choose a material.');const q=quantity(body.quantity,item.unit),date=day(body.date,at),totals=materialTotals(item);
   if(body.action==='order_material'){
    if(q>Math.round((item.planned-totals.ordered)*100)/100)throw fail('This order exceeds the planned quantity. Update the plan first.');
    const supplier=clean(body.supplier);if(supplier.length<2)throw fail('Add the supplier name.');const link=clean(body.link,1000);if(link){let url;try{url=new URL(link);}catch{throw fail('Paste a full https link for the quote or evidence.');}if(url.protocol!=='https:'||url.username||url.password)throw fail('Use an https link without login details.');}
    item.orders.push({quantity:q,date,supplier,reference:clean(body.reference,100),link,by:me.name,at});
   }else if(body.action==='receive_material'){
    if(q>Math.round((totals.ordered-totals.arrived)*100)/100)throw fail('This delivery exceeds what is still due.');
    item.receipts.push({quantity:q,date,note:clean(body.note,300),by:me.name,at});
   }else throw fail('Unknown materials action.');
  }
 }
 plan.status=materialStatus(plan);c.materialPlans=[plan,...plans.filter(x=>x.sourceId!==work.id)];return c;
}
