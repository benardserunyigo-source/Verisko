import '../../../commission.js';
import '../../../sales-pay-policy.js';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex').slice(0,32);
const fail=m=>{throw Object.assign(new Error(m),{status:409});};
const amount=n=>Number.isSafeInteger(n)&&n>0&&n<=1e10;
export function salesPaySources(data,weekStart){const P=globalThis.VeriskoSalesPay,week=P.period(weekStart+'T12:00:00+03:00');if(week.start<new Date(P.POLICY.effectiveFrom+'T00:00:00+03:00'))return [];return P.calculate(data,week).reps.filter(r=>r.total>0).map(r=>({key:'sales-'+hash(r.email+'|'+week.start.toISOString()),kind:'sales',email:r.email,name:r.name,week:new Date(+week.start+10800000).toISOString().slice(0,10),payday:new Date(+week.payday+10800000).toISOString().slice(0,10),amount:r.total,label:r.name+' · Monday '+new Date(+week.payday+10800000).toISOString().slice(0,10)}));}
export function materialPaySources(cases=[]){return cases.flatMap(c=>(c.materialPlans||[]).flatMap(p=>p.items.flatMap(i=>(i.orders||[]).map((o,n)=>({key:'material-'+hash([c.id,p.sourceId,i.id,n].join('|')),kind:'material',sourceId:p.sourceId,contactId:c.contactId||c.id,label:i.name+' · '+o.supplier,amount:o.unitCost?Math.round(o.quantity*o.unitCost*(o.currency==='USD'?4300:1)):0,quoteLink:o.link||'',quantity:o.quantity,unit:i.unit})) )));}
export function guardFundRequests(stored=[],incoming=[],actor,at=new Date().toISOString()){
 if(!['admin','operations'].includes(actor?.role))return stored;
 const by=new Map(stored.map(r=>[r.id,r])),out=stored.map(r=>({...r})),seen=new Set();
 for(const r of incoming||[]){if(!/^[\w-]{1,100}$/.test(r?.id||'')||seen.has(r.id))fail('Keep one fund request ID.');seen.add(r.id);const old=by.get(r.id);
 if(!old){if(!amount(r.amount)||String(r.reason||'').trim().length<3)fail('Add the amount and reason for the funds.');out.push({id:r.id,amount:r.amount,reason:String(r.reason).trim().slice(0,500),sourceId:r.sourceId||'',status:'requested',by:actor.id,byName:actor.name,at});continue;}
 if(r.status===old.status)continue;
 if(actor.role!=='admin')fail('Admin must review the fund request.');
 if(old.status!=='requested'||!['approved','rejected'].includes(r.status))fail('This fund request was already reviewed.');
 if(r.status==='rejected'&&!String(r.reviewNote||'').trim())fail('Give a reason for sending back the fund request.');
 Object.assign(out.find(x=>x.id===r.id),{status:r.status,reviewNote:String(r.reviewNote||'').slice(0,500),reviewedBy:actor.id,reviewedAt:at});
 }return out;
}
export function guardOperationsCash(stored,incoming,{data,cases=[],fundRequests=[],actor,today}){
 const by=new Map(stored.map(t=>[t.id,t])),keys=new Set();
 for(const t of incoming){const old=by.get(t.id);if(old?.financeKey&&!t.financeKey)fail('Keep the payment linked to its source.');if(!t.financeKey)continue;if(keys.has(t.financeKey))fail('This payment is already in Cash flow.');keys.add(t.financeKey);
 const prior=stored.find(x=>x.financeKey===t.financeKey);if(prior&&prior.id!==t.id)fail('Open the existing payment instead of adding it again.');
 if(!['pending','approved','query','void'].includes(t.status))fail('Choose a valid payment status.');if(old?.status==='approved'&&t.status==='void'&&!String(t.cashVoidReason||'').trim())fail('Add a reason before cancelling an approved payment.');
 if(old){for(const k of ['financeKey','financeKind','salesPayEmail','payWeek','installId','direction','amount','category','fundRequestId'])if(t[k]!==old[k])fail('Keep the original linked payment details.');continue;}
 if(t.financeKind==='sales'){const src=salesPaySources(data,t.payWeek).find(s=>s.key===t.financeKey);if(!src||t.direction!=='out'||t.salesPayEmail!==src.email||t.amount!==src.amount||t.category!=='Sales pay'||t.payWeek!==src.week)fail('Refresh Sales pay and use its exact amount.');if(today<src.payday)fail('This Sales pay is not due until Monday.');}
 else if(t.financeKind==='material'){const src=materialPaySources(cases).find(s=>s.key===t.financeKey);if(!src||t.installId!==src.sourceId||t.direction!=='out'||t.category!=='Materials payment'||!amount(t.amount))fail('Choose an existing supplier order and its actual payment.');}
 else if(t.financeKind==='fund'){const src=fundRequests.find(r=>r.id===t.fundRequestId&&r.status==='approved');if(!src||t.financeKey!=='fund-'+src.id||t.amount!==src.amount||t.direction!=='in'||t.category!=='Owner funding')fail('Use the approved fund request and amount.');if(!String(t.reference||'').trim())fail('Add the transfer reference for funds received.');}
 else fail('Unknown payment source.');
 if(t.financeKind==='fund'&&stored.some(s=>s.id!==t.id&&s.direction==='in'&&s.reference&&s.reference===t.reference))fail('This transfer reference is already recorded. Open its existing cash entry.');
 if(stored.some(s=>!s.financeKey&&s.direction===t.direction&&s.amount===t.amount&&s.date===t.date&&((t.financeKind==='material'&&s.installId===t.installId&&/material|equipment|cable/i.test(s.category||''))||(t.financeKind==='sales'&&/sales|commission/i.test(s.category||'')&&(!s.salesPayEmail||s.salesPayEmail===t.salesPayEmail))||(t.financeKind==='fund'&&s.reference&&s.reference===t.reference))))fail('A matching cash entry already exists. Ask Admin to check it before recording this payment.');
 }
 for(const old of stored)if(old.financeKey&&!incoming.some(t=>t.id===old.id))incoming.push(old);
 return incoming;
}
export const ownSalesPay=(tx,email)=>(tx||[]).filter(t=>t.financeKind==='sales'&&t.salesPayEmail===String(email||'').toLowerCase()).map(t=>({id:t.id,amount:t.amount,date:t.date,week:t.payWeek,status:t.status}));

export function operationsMoneyView(data,cases,now=Date.now()){const sales=[];for(let n=0;n<54;n++){const w=globalThis.VeriskoSalesPay.period(now,-n);if(w.start<new Date('2026-10-19T00:00:00+03:00'))break;sales.push(...salesPaySources(data,new Date(+w.start+10800000).toISOString().slice(0,10)));}return {sales,materials:materialPaySources(cases).map(s=>{const job=(data.jobs||[]).find(j=>j.id===s.sourceId),client=(data.prospects||[]).find(p=>p.id===(job?.prospectId||s.contactId));return {...s,label:(client?.business||job?.ref||'Saved job')+' · '+s.label};})};}
