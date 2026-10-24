import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyFixture} from './helpers/journey-fixture.mjs';
import {contactToPaid,planAndAssign,finish} from './helpers/journey-steps.mjs';
import '../client-handover.js';
import {validateQuotes} from '../netlify/functions/lib/quote-guard.mjs';
const H=globalThis.VeriskoHandover;
const date=()=>new Date().toISOString().slice(0,10);
const acceptance=()=>({name:'TEST Client',role:'Client / owner',date:date(),method:'Signed form',reference:'TEST signed handover form H-1',confirmed:true});
const checklist=()=>Object.fromEntries(H.CHECKS.map(k=>[k,true]));
const handover=d=>Object.assign(d.jobs[0],{stage:'Handed over',checklist:checklist(),clientHandover:acceptance(),serviceStartDate:date(),monitoringMiniPcRef:'TEST-MINI-PC',monitoringCommissioned:true,monitoringTestEvidence:'TEST camera-offline and site reporting alert test'});
test('client acceptance needs a named person, valid date, agreement reference and every handover check',()=>{
 const j={clientHandover:acceptance(),checklist:checklist()};assert.deepEqual(H.errors(j,date()),[]);
 for(const [key,value] of Object.entries({name:'',role:'',date:'2026-02-30',method:'unknown',reference:'',confirmed:false}))assert.ok(H.errors({...j,clientHandover:{...j.clientHandover,[key]:value}},date()).length,key);
 assert.ok(H.errors({...j,clientHandover:{...j.clientHandover,date:'2099-01-01'}},date()).length);
 for(const k of H.CHECKS)assert.ok(H.errors({...j,checklist:{...j.checklist,[k]:false}},date()).length,k);
});
test('one client goes from Sales to technical approval to recorded client sign-off, without duplicate records or money changes',async()=>{
 const f=await journeyFixture();await contactToPaid(f);await planAndAssign(f);
 const beforeApproval=await f.save('operations',handover);assert.equal(beforeApproval.status,400);assert.match(beforeApproval.error,/approve.*installation|installation.*approve/);
 await finish(f);
 const before=await f.workspace('operations'),stale=structuredClone(before);
 // UI checklist cannot be bypassed with an otherwise complete API request.
 const missing=await f.save('operations',d=>{handover(d);d.jobs[0].checklist.trained=false;});assert.equal(missing.status,400);assert.match(missing.error,/five.*checks/);
 const noClient=await f.save('operations',d=>{handover(d);delete d.jobs[0].clientHandover;});assert.equal(noClient.status,400);
 const saved=await f.save('operations',d=>{handover(d);d.jobs[0].clientHandover.recordedBy='FORGED';d.jobs[0].clientHandover.recordedAt='2000-01-01';});assert.equal(saved.status,200,saved.error);
 for(const role of ['sales','teamlead','operations','admin']){
  const d=await f.workspace(role);assert.equal(d.jobs[0].stage,'Handed over');assert.equal(d.prospects[0].readyProgress,'Client signed off');if(['sales','teamlead'].includes(role))assert.equal(d.jobs[0].clientHandover,undefined,'acceptance evidence stays office-only');
 }
 const after=await f.workspace('operations');assert.equal(after.jobs[0].clientHandover.recordedBy,'operations@test.invalid');assert.notEqual(after.jobs[0].clientHandover.recordedAt,'2000-01-01');
 assert.deepEqual(after.transactions,before.transactions);assert.deepEqual(after.jobs[0].quoteSnapshot,before.jobs[0].quoteSnapshot);assert.equal(after.jobs[0].quotedTotal,before.jobs[0].quotedTotal);
 assert.equal(after.prospects.length,1);assert.equal(after.jobs.length,1);assert.equal((await f.ok('installer','installer')).jobs[0].status,'Completed');
 const retry=await f.api('data','operations',{data:stale});assert.equal(retry.status,200,retry.error);assert.equal((await f.workspace('operations')).jobs[0].stage,'Handed over');
 assert.deepEqual((await f.workspace('operations')).jobs[0].clientHandover,after.jobs[0].clientHandover);
 const edited=await f.save('operations',d=>{d.jobs[0].clientHandover.name='FORGED';});assert.equal(edited.status,400);
 for(const role of ['sales','teamlead']){await f.save(role,d=>{d.jobs[0].clientHandover=acceptance();d.jobs[0].stage='Installed';});assert.deepEqual((await f.workspace('operations')).jobs[0].clientHandover,after.jobs[0].clientHandover);}
 assert.equal((await f.ok('installer','other-installer')).jobs.length,0);assert.equal((await f.workspace('other-sales')).jobs.length,0);
});

test('client acceptance uses the Uganda date when it is already tomorrow locally',()=>{
 const old={id:'TEST-LEGACY',stage:'Installed',quoteSnapshot:{}};
 const j={...old,stage:'Handed over',checklist:checklist(),clientHandover:{...acceptance(),date:'2026-10-25'}};
 assert.equal(validateQuotes([old],[j],false,'operations@test.invalid','2026-10-24T22:00:00Z')[0].clientHandover.date,'2026-10-25');
 assert.throws(()=>validateQuotes([old],[{...j,clientHandover:{...j.clientHandover,date:'2026-10-26'}}],false,'operations@test.invalid','2026-10-24T22:00:00Z'),/future date/);
});
test('a job without an approved linked installation cannot be signed off by forging its stage',async()=>{
 const f=await journeyFixture();await contactToPaid(f);
 const r=await f.save('operations',d=>{d.jobs[0].stage='Installed';d.jobs[0].scheduledDate=date();});assert.equal(r.status,200,r.error);
 const done=await f.save('operations',handover);assert.equal(done.status,400);assert.match(done.error,/approve.*installation/);
 const raw=await f.workspace('operations');assert.equal(raw.jobs[0].clientHandover,undefined);
 const forged=structuredClone(raw);handover(forged);
 assert.equal((await f.api('data','installer',{data:forged})).status,403);
});
