import test from 'node:test';import assert from 'node:assert/strict';
import {projectReady} from '../netlify/functions/lib/ready-progress.mjs';
import '../commission.js';import '../sales-pay-policy.js';
const visit={id:'ready-visit-contact',date:'2026-10-22',time:'10:00',confirmedAt:'2026-10-22T07:00:00Z',byName:'Ops',byEmail:'ops@test'};
const base=()=>({prospects:[{id:'contact',business:'TEST',leadOnly:true,createdBy:'Test Sales',createdByEmail:'sales@test',stage:'New prospect'}],appointments:[],transactions:[],jobs:[],users:[{email:'sales@test',role:'sales',name:'Test Sales'}]});
const c={contactId:'contact',visit};
test('confirmation creates one linked visit without re-entering the contact; no visit pay before completion',()=>{
 const b=base(),d=projectReady(b,[c]),again=projectReady(d,[c]);assert.equal(d.prospects.length,1);assert.equal(d.prospects[0].leadOnly,false);assert.equal(d.prospects[0].createdByEmail,'sales@test');assert.equal(d.appointments[0].status,'Confirmed');assert.equal(again.appointments.length,1);assert.equal(b.appointments.length,0);assert.equal(globalThis.VeriskoSalesPay.calculate(d,globalThis.VeriskoSalesPay.period('2026-10-22T10:00:00Z')).total,0);
});
test('completion feeds existing pay once and projection restores visit fields after a stale save',()=>{
 const completed={...c,visit:{...visit,doneAt:'2026-10-22T12:00:00+03:00',doneByName:'Lead',doneByEmail:'lead@test'}},d=projectReady(base(),[completed]);d.appointments[0].visitResult='';d.appointments[0].date='2020-01-01';const restored=projectReady(d,[completed]);assert.equal(restored.appointments[0].date,'2026-10-22');assert.equal(restored.appointments[0].visitResult,'real');assert.equal(globalThis.VeriskoSalesPay.calculate(restored,globalThis.VeriskoSalesPay.period('2026-10-22T10:00:00Z')).total,15000);assert.equal(projectReady(restored,[completed]).appointments.length,1);
});
test('quote progress does not downgrade accepted jobs or create payment commission',()=>{
 const b=base();b.prospects[0].stage='Won';const d=projectReady(b,[{...c,quoteSent:{at:'2026-10-22T12:00:00+03:00'}}]);assert.equal(d.prospects[0].stage,'Won');assert.equal(d.prospects[0].readyProgress,'Quote sent');assert.equal(d.transactions.length,0);
});
test('first-payment approval adds 100,000 once; pending, queried and later instalments do not add it again',()=>{
 const week=globalThis.VeriskoSalesPay.period('2026-10-22T12:00:00Z'),payment={id:'first',direction:'in',prospectId:'contact',amount:2000000,date:'2026-10-21',recordedAt:'2026-10-21T10:00:00Z',status:'pending'},pc={...c,firstPayment:payment};let d=projectReady(base(),[pc]);assert.equal(globalThis.VeriskoSalesPay.calculate(d,week).total,0);
 pc.firstPayment={...payment,status:'query'};assert.equal(globalThis.VeriskoSalesPay.calculate(projectReady(base(),[pc]),week).total,0);
 pc.firstPayment={...payment,status:'approved',approvedAt:'2026-10-22T12:00:00Z'};d=projectReady(base(),[pc]);assert.equal(globalThis.VeriskoSalesPay.calculate(d,week).total,100000);d=projectReady(d,[pc]);assert.equal(d.transactions.length,1);assert.equal(globalThis.VeriskoSalesPay.calculate(d,week).total,100000);
 d.transactions.push({...payment,id:'second',amount:300000,status:'approved',approvedAt:'2026-10-23T12:00:00Z'});assert.equal(globalThis.VeriskoSalesPay.calculate(d,week).total,100000);assert.equal(globalThis.VeriskoSalesPay.calculate(d,globalThis.VeriskoSalesPay.period('2026-10-29T12:00:00Z')).total,0);
 d.transactions[0].status='pending';d.transactions[0].approvedAt='';d=projectReady(d,[pc]);assert.equal(d.transactions.find(t=>t.id==='first').status,'approved');d.prospects[0].imported=true;assert.equal(globalThis.VeriskoSalesPay.calculate(d,week).total,0);
});
test('office-created contacts cannot create Sales payment commission through the new workflow',()=>{
 const d=projectReady(base(),[{...c,firstPayment:{id:'office-payment',direction:'in',prospectId:'contact',amount:2000000,status:'approved',approvedAt:'2026-10-22T12:00:00Z',commissionEligible:false}}]);assert.equal(d.prospects[0].salesCommissionEligible,false);const noVisit=projectReady(base(),[{contactId:'contact',firstPayment:{...d.transactions[0],commissionEligible:false}}]);assert.equal(noVisit.prospects[0].salesCommissionEligible,false);d.transactions.push({id:'later-instalment',direction:'in',prospectId:'contact',amount:300000,status:'approved',approvedAt:'2026-10-23T12:00:00Z'});assert.equal(globalThis.VeriskoSalesPay.calculate(d,globalThis.VeriskoSalesPay.period('2026-10-22T12:00:00Z')).total,0);
});
test('the existing first payment is linked only to the saved quote selected for the same client',()=>{
 const b=base();b.jobs=[{id:'chosen',prospectId:'contact'},{id:'other',prospectId:'contact'},{id:'foreign',prospectId:'someone-else'}];
 const payment={id:'payment',amount:2000000,direction:'in',status:'approved'},c={contactId:'contact',quoteSent:{sourceId:'chosen'},firstPayment:payment};
 const d=projectReady(b,[c]);assert.deepEqual(d.transactions,[{...payment,readyCaseId:'contact',prospectId:'contact',installId:'chosen'}]);assert.equal(projectReady(d,[c]).transactions.length,1);
 assert.equal(projectReady(b,[{...c,quoteSent:{sourceId:'foreign'}}]).transactions[0].installId,undefined);
 assert.equal(projectReady(b,[{...c,quoteSent:{}}]).transactions[0].installId,undefined);
 assert.equal(projectReady(b,[{...c,firstPayment:{...payment,installId:'other'}}]).transactions[0].installId,'other');
});

test('return to Sales and resend preserve one completed visit and its original earned pay',()=>{
 const done={...c,state:'returned',visit:{...visit,doneAt:'2026-10-22T12:00:00+03:00',doneByName:'Ops',doneByEmail:'ops@test'}},week=globalThis.VeriskoSalesPay.period('2026-10-22T12:00:00Z');
 const returned=projectReady(base(),[done]);assert.equal(returned.prospects[0].readyProgress,'Needs your follow-up');assert.equal(returned.appointments.length,1);assert.equal(globalThis.VeriskoSalesPay.calculate(returned,week).total,15000);
 const resent=projectReady(returned,[{...done,state:'queued'}]);assert.equal(resent.appointments.length,1);assert.equal(globalThis.VeriskoSalesPay.calculate(resent,week).total,15000);
});

test('an upcoming visit returned to Sales leaves the active schedule until it is confirmed again',()=>{
 const paused={...c,state:'returned',visit:{...visit,onHoldAt:'2026-10-22T08:00:00Z',onHoldReason:'Client not ready'}};
 const d=projectReady(base(),[paused]);assert.equal(d.appointments[0].status,'Cancelled');assert.equal(d.prospects[0].readyProgress,'Needs your follow-up');
 const pending=projectReady(d,[{...paused,state:'queued'}]);assert.equal(pending.appointments[0].status,'Cancelled');
 const confirmed=projectReady(pending,[{...c,state:'assigned'}]);assert.equal(confirmed.appointments.length,1);assert.equal(confirmed.appointments[0].status,'Confirmed');
});
