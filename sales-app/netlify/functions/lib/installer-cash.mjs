// Installer payment is the source; the cash book stores its review/proof only.
// Reads may project a pending expense, never an approval or a second payment.
import {createHash} from 'node:crypto';
const key=(j,p)=>'crew-'+createHash('sha256').update(j.id+'\0'+p.id).digest('hex').slice(0,32);
export async function loadInstallerCash(store){const jobs=[];for await(const page of store.list({prefix:'jobs/',paginate:true}))for(const b of page.blobs){const j=await store.get(b.key,{type:'json'});if(j)jobs.push(j);}return jobs;}
export function installerExpenses(jobs=[]){return jobs.flatMap(j=>(j.installerPayments||[]).map(p=>({id:key(j,p),installerPaymentKey:key(j,p),installerJobId:j.id,installerPaymentId:p.id,installerId:p.installerId,installId:j.sourceId||'',direction:'out',category:'Installer payment',amount:p.amount,date:p.paidOn,method:p.method,reference:p.reference||'',note:p.note||'',createdBy:p.by,createdAt:p.at,status:'pending',installerPaymentVoided:(j.installerPaymentVoids||[]).some(v=>v.paymentId===p.id)})));}
const match=(a,b)=>a.direction==='out'&&a.amount===b.amount&&a.date===b.date&&a.installId===b.installId&&(a.reference&&b.reference?a.reference===b.reference:/installer|labour|labor|crew/i.test(a.category||''));
export function projectInstallerCash(data,jobs){const tx=(data.transactions||[]).map(t=>{const out={...t};delete out.installerCashCandidates;delete out.installerCashReview;return out;});for(const e of installerExpenses(jobs)){
 let found=tx.find(t=>t.installerPaymentKey===e.id||t.id===e.id);
 if(found){Object.assign(found,{installerPaymentKey:e.id,installerJobId:e.installerJobId,installerPaymentId:e.installerPaymentId,installerId:e.installerId,installerPaymentVoided:e.installerPaymentVoided});if(found.installerPaymentKey){delete found.installerCashReview;delete found.installerCashCandidates;}if(e.installerPaymentVoided&&!['approved','void'].includes(found.status))found.status='void';continue;}
 const candidates=tx.filter(t=>!t.installerPaymentKey&&match(t,e));
 if(candidates.length){for(const t of candidates){t.installerCashCandidates=[...(t.installerCashCandidates||[]),e];t.installerCashReview='An installer payment may already be recorded here. Check the job and receipt before adding any expense.';}continue;}
 if(!e.installerPaymentVoided)tx.push({...e,installerCashReview:'From the installer payment record. Add proof and ask Admin to review. Do not enter this payment again.'});
 }return {...data,transactions:tx};}
export function guardInstallerCash(stored,incoming,jobs,actor={}){const expected=new Map(installerExpenses(jobs).map(e=>[e.id,e])),seen=new Set();const fail=m=>{throw Object.assign(new Error(m),{status:409});};
 for(const t of incoming){const k=t.installerPaymentKey|| (expected.has(t.id)?t.id:'');if(!k)continue;const e=expected.get(k);if(!e)fail('Installer payment link is not valid. Refresh the cash book.');if(seen.has(k))fail('This installer payment is already in the cash book.');seen.add(k);
 const prior=stored.find(s=>s.id===t.id),legacy=t.id!==e.id;
 if(prior?.installerPaymentKey&&prior.installerPaymentKey!==k)fail('This cash entry is already linked to another installer payment.');
 if(legacy&&(!prior||!match(prior,e)||!prior.installerPaymentKey&&actor.role!=='admin'))fail('Admin must check and link the earlier expense.');
 for(const f of ['installerPaymentKey','installerJobId','installerPaymentId','installerId','installId','direction','category','amount','date','method','reference'])if(t[f]!==((legacy&&['category','method','reference'].includes(f))?prior[f]:e[f]))fail('Change the payment in the installation record, not in the cash book.');
 if(t.status==='approved'&&!t.proofId&&!t.preapproved&&!stored.some(s=>s.id===t.id&&s.status==='approved'))fail('Add a receipt photo before approving this installer expense.');
 if(t.status==='void'&&stored.some(s=>s.id===t.id&&s.status==='approved')&&!String(t.cashVoidReason||'').trim())fail('Give a reason for cancelling the cash entry.');
 if(t.status==='void'&&!e.installerPaymentVoided)fail('Cancel the incorrect installer payment in the installation first.');
 if(e.installerPaymentVoided&&t.status==='approved'&&!stored.some(s=>s.id===t.id&&s.status==='approved'))fail('This installer payment was cancelled. Review the installation record.');
 if(incoming.some(o=>o.id!==t.id&&!o.installerPaymentKey&&!stored.some(s=>s.id===o.id)&&match(o,e)))fail('A matching installer expense already exists. Review it before adding another.');
 }
 for(const t of incoming)if(!t.installerPaymentKey&&!expected.has(t.id)&&!stored.some(s=>s.id===t.id)&&[...expected.values()].some(e=>match(t,e)))fail('This installer payment already has a cash record. Open it instead.');
 // A stale phone cannot erase a linked payment or its approval/proof.
 for(const t of stored)if(t.installerPaymentKey&&!incoming.some(n=>n.id===t.id))incoming.push(t);
 return incoming;
}
