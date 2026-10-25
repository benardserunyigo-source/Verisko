import {materialStatus,materialTotals,paidWork} from './materials-core.mjs';
import {materialKey} from '../../../inventory-catalog.mjs';
const round=n=>Math.round(n*100)/100;
const fail=(m,s=409)=>Object.assign(Error(m),{status:s});
const same=(a,c,p,i)=>a.contactId===c&&a.sourceId===p&&a.materialItemId===i;
export function projectWarehouseCase(c,record={}){if(!c)return c;return {...c,materialPlans:(c.materialPlans||[]).map(p=>{const plan={...p,items:p.items.map(i=>{const out={...i};delete out.warehouse;const a=record.allocations?.find(a=>same(a,c.contactId,p.sourceId,i.id));if(a?.quantity>0&&materialKey(a.name,a.unit)===materialKey(i.name,i.unit))out.warehouse=a.quantity;return out;})};plan.status=materialStatus(plan);return plan;})};}
export const projectWarehouseCases=(cases,record)=>cases.map(c=>projectWarehouseCase(c,record));
export function issuedFor(jobs,contactId,sourceId,item){return jobs.filter(j=>j.readyContactId===contactId&&j.materialSourceId===sourceId||j.sourceId===sourceId).reduce((n,j)=>n+(j.materials?.items||[]).filter(m=>m.id===item.id&&materialKey(m.name,m.unit)===materialKey(item.name,item.unit)).reduce((n,m)=>n+(m.issued||0),0),0);}
export function warehouseHolds(record,cases,jobs){const holds=[],seen=new Set();
 for(const c of cases)for(const p of c.materialPlans||[])for(const i of p.items||[]){const a=record.allocations?.find(a=>same(a,c.contactId,p.sourceId,i.id));if(a)seen.add(a);const quantity=round(Math.max(0,materialTotals(i).arrived+(a?.quantity||0)-issuedFor(jobs,c.contactId,p.sourceId,i)));if(quantity>0)holds.push({contactId:c.contactId,sourceId:p.sourceId,materialItemId:i.id,name:i.name,unit:i.unit,quantity,label:p.label||p.sourceId});}
 // Never silently free an orphaned hold if a source record becomes unavailable.
 for(const a of record.allocations||[])if(!seen.has(a)&&a.quantity>0)holds.push({...a,quantity:Math.max(0,a.quantity-issuedFor(jobs,a.contactId,a.sourceId,{id:a.materialItemId,name:a.name,unit:a.unit})),needsCheck:true,label:'Job needs checking'});
 return holds;
}
export function allocateWarehouse(record,body,auth,cases,jobs,view,at){
 const c=cases.find(c=>c.contactId===body.contactId),p=c?.materialPlans?.find(p=>p.sourceId===body.sourceId),i=p?.items.find(i=>i.id===body.materialItemId);
 if(!c||!p||!i)throw fail('Save the materials list on this job first.');if(body.caseVersion!==c.version)throw fail('This job changed. Refresh before using stock.');
 const row=view.items.find(r=>materialKey(r.name,r.unit)===materialKey(i.name,i.unit));if(!row||row.id!==body.itemId)throw fail('Choose the same item and unit as the job.');
 const current=record.allocations?.find(a=>same(a,c.contactId,p.sourceId,i.id)),old=current?.quantity||0,n=Number(body.quantity);
 if(body.quantity===''||body.quantity===null||typeof body.quantity==='boolean'||!Number.isFinite(n)||n<0||n>1000000||Math.abs(n*100-Math.round(n*100))>1e-7||(i.unit!=='m'&&!Number.isInteger(n)))throw fail('Enter a valid warehouse quantity.',400);
 if(jobs.some(j=>(j.readyContactId===c.contactId&&j.materialSourceId===p.sourceId||j.sourceId===p.sourceId)&&(j.assignment&&j.assignment.status!=='declined'||j.materials?.items?.some(m=>m.issued>0)||j.workLog?.length)))throw fail('This job is already with an installer. Use its existing materials list.');
 if(n>old){const prospect=(auth.prospects||[]).find(x=>x.id===c.contactId);if(!prospect||!paidWork(prospect,auth.transactions,auth.jobs,c).some(w=>w.id===p.sourceId))throw fail('Choose a job with an approved client payment.');if(row.stock===null)throw fail('Count this item in the warehouse first.');if(round(n-old)>Math.max(0,row.available))throw fail('There is not enough free stock. Refresh and check the quantity.');}
 if(n+materialTotals(i).ordered>i.planned)throw fail('This exceeds what is still needed. Already ordered items stay on this job.');
 const next={contactId:c.contactId,sourceId:p.sourceId,materialItemId:i.id,stockItemId:row.id,name:i.name,unit:i.unit,quantity:n,by:auth.me.name,at};record.allocations=[next,...(record.allocations||[]).filter(a=>!same(a,c.contactId,p.sourceId,i.id))];return {row,allocation:next};
}
export async function checkWarehouseIssue({cmd,job,store,loadMovements,inventoryView}){if(cmd.action!=='materialIssue'||job.requests?.includes(cmd.requestId))return;const item=job.materials?.items?.find(i=>i.id===cmd.data?.itemId);if(!item)return;const record=await store.get('current',{type:'json'})||{},movements=await loadMovements(),row=inventoryView(record,movements.cases,movements.jobs).items.find(r=>materialKey(r.name,r.unit)===materialKey(item.name,item.unit));if(!row||!row.reserved)return;if(row.stock===null&&!record.allocations?.some(a=>a.stockItemId===row.id&&a.quantity>0))return;
 const own=row.holds.filter(h=>h.materialItemId===item.id&&(h.contactId===job.readyContactId&&h.sourceId===job.materialSourceId||h.sourceId===job.sourceId)).reduce((n,h)=>n+h.quantity,0),allowed=round((row.stock??0)-(row.reserved-own));
 if(row.stock===null||Number(cmd.data.quantity)>Math.max(0,allowed))throw fail('This stock is needed by another job. Check Inventory before sending it.');
}
