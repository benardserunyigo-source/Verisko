import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,32);
export const callbackExpenseKey=(c,e)=>'callback-'+hash(c.id+'\0'+e.id);
export const callbackProofKey=(c,e)=>'callback-proof-'+hash(c.id+'\0'+e.proofId);
export function callbackExpenses(cases=[]){return cases.flatMap(c=>(c.expenses||[]).map(e=>({id:callbackExpenseKey(c,e),callbackExpenseKey:callbackExpenseKey(c,e),callbackId:c.id,callbackExpenseId:e.id,callbackBusiness:c.business,callbackVoided:!!e.voided,callbackReceiptId:e.proofId,installId:c.sourceId||'',direction:'out',category:'Callback expense',amount:e.amount,date:e.date||e.at.slice(0,10),method:'Recorded on callback',reference:callbackExpenseKey(c,e),note:e.note||'',proofId:callbackProofKey(c,e),createdBy:e.by,createdAt:e.at,status:'pending'})));}
const match=(a,b)=>a.direction==='out'&&a.amount===b.amount&&a.date===b.date&&a.installId===b.installId&&/callback|repair|return visit/i.test(a.category||'');
const meta=['callbackExpenseKey','callbackId','callbackExpenseId','callbackBusiness','callbackVoided','callbackReceiptId'];
export function projectCallbackCash(data,cases=[]){const tx=(data.transactions||[]).map(t=>{const x={...t};delete x.callbackCashCandidates;delete x.callbackCashReview;return x;});for(const e of callbackExpenses(cases)){
 const found=tx.find(t=>t.callbackExpenseKey===e.id||t.id===e.id);if(found){for(const f of meta)found[f]=e[f];if(e.callbackVoided&&found.status!=='approved')found.status='void';continue;}
 const legacy=tx.filter(t=>!t.callbackExpenseKey&&!t.installerPaymentKey&&match(t,e));if(legacy.length){for(const t of legacy){t.callbackCashCandidates=[...(t.callbackCashCandidates||[]),e];t.callbackCashReview='This may already be the callback cost. Admin must link the existing entry before another is added.';}continue;}
 if(!e.callbackVoided)tx.push(e);
 }return {...data,transactions:tx};}
export function guardCallbackCash(stored,incoming,cases,actor){const expected=new Map(callbackExpenses(cases).map(e=>[e.id,e])),seen=new Set();const fail=m=>{throw Object.assign(new Error(m),{status:409});};
 for(const t of incoming){const key=t.callbackExpenseKey||(expected.has(t.id)?t.id:'');if(!key)continue;const e=expected.get(key),prior=stored.find(s=>s.id===t.id);if(!e)fail('Callback expense link is not valid.');if(seen.has(key))fail('This callback cost is already in Cash flow.');seen.add(key);const legacy=t.id!==key;
 if(prior?.callbackExpenseKey&&prior.callbackExpenseKey!==key)fail('This entry is linked to a different callback.');
 if(legacy&&(!prior||!match(prior,e)||!prior.callbackExpenseKey&&actor.role!=='admin'))fail('Admin must check and link the earlier cost.');
 for(const f of [...meta,'installId','direction','category','amount','date','method','reference','proofId']){const value=legacy&&['category','method','reference','proofId'].includes(f)?prior[f]||e[f]:e[f];if(t[f]!==value)fail('Change this cost on the callback. Keep the same linked Cash flow entry.');}
 if(!['pending','approved','query','void'].includes(t.status))fail('Choose a valid cash review status.');
 if(t.status==='approved'&&e.callbackVoided&&prior?.status!=='approved')fail('This callback cost was cancelled.');
 if(t.status==='void'&&!e.callbackVoided)fail('Cancel the wrong cost on the callback first.');
 if(t.status==='void'&&prior?.status==='approved'&&!String(t.cashVoidReason||'').trim())fail('Give a reason for cancelling the approved cash entry.');
 if(incoming.some(o=>o.id!==t.id&&!o.callbackExpenseKey&&!stored.some(s=>s.id===o.id)&&match(o,e)))fail('This callback cost already has an entry. Open it instead of entering it again.');
 }
 for(const t of incoming)if(!t.callbackExpenseKey&&!expected.has(t.id)&&!stored.some(s=>s.id===t.id)&&[...expected.values()].some(e=>match(t,e)))fail('Record callback costs on the callback. Its linked entry already exists.');
 for(const t of stored)if(t.callbackExpenseKey&&!incoming.some(n=>n.id===t.id))incoming.push(t);
 return incoming;
}
export function callbackCashStatus(c,transactions=[]){const tx=projectCallbackCash({transactions},[c]).transactions;return {...c,expenses:c.expenses.map(e=>{const k=callbackExpenseKey(c,e),t=tx.find(t=>t.callbackExpenseKey===k||t.id===k);return {...e,cashStatus:t?.status||'needs-link',cashEntryId:t?.id||'',cashReviewNote:t?.reviewNote||''};})};}
