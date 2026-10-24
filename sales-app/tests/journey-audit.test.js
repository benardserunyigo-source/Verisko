import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyFixture} from './helpers/journey-fixture.mjs';
import {contactToPaid,planAndAssign,finish} from './helpers/journey-steps.mjs';

const good=r=>{assert.equal(r.status,200,r.error);return r;};
async function booked(){
 const f=await journeyFixture();f.setTime('2026-10-24T08:00:00Z');
 good(await f.save('sales',d=>d.prospects.push({id:'journey-client',business:'TEST Audit Shop',phone:'0772111222',location:'TEST Kampala',createdBy:'TEST sales',createdByEmail:'sales@test.invalid',leadOnly:true})));
 good(await f.readyCmd('sales','request'));good(await f.readyCmd('teamlead','take'));
 good(await f.readyCmd('teamlead','confirm_visit',{date:f.day(),time:'10:00'}));return f;
}
test('owner changes a confirmed visit time on the same client and appointment; Sales sees the reason and no pay is added',async()=>{
 const f=await booked(),before=(await f.workspace('sales')).appointments[0];
 const requestId='audit-reschedule-once';
 const r=good(await f.readyCmd('teamlead','reschedule_visit',{date:'2026-10-25',time:'14:30',note:'TEST Client asked for Sunday.',requestId}));
 const version=r.item.version;good(await f.readyCmd('teamlead','reschedule_visit',{requestId,baseVersion:version-1}));
 good(await f.save('sales',d=>{d.appointments[0].date=before.date;d.appointments[0].time=before.time;}));
 for(const role of ['sales','teamlead','operations','admin']){
  const d=await f.workspace(role);assert.equal(d.prospects.length,1);assert.equal(d.appointments.length,1);
  assert.equal(d.appointments[0].id,before.id);assert.equal(d.appointments[0].date,'2026-10-25');assert.equal(d.appointments[0].time,'14:30');
  const item=(await f.ok('ready',role)).items[0];assert.equal(item.history.filter(e=>e.type==='visit_rescheduled').length,1);
  assert.equal(item.history.at(-1).note,'TEST Client asked for Sunday.');assert.equal(item.history.at(-1).time,'14:30');
 }
 assert.equal(globalThis.VeriskoSalesPay.calculate(await f.workspace('sales'),globalThis.VeriskoSalesPay.period(f.now()),'sales@test.invalid').total,0);
 f.setTime('2026-10-25T13:00:00Z');
 const doneId='audit-completed-once';good(await f.readyCmd('teamlead','complete_visit',{date:f.day(),requestId:doneId}));
 good(await f.readyCmd('teamlead','complete_visit',{requestId:doneId}));
 const done=await f.workspace('sales');assert.equal(done.appointments.length,1);assert.equal(done.appointments[0].id,before.id);
 assert.equal(globalThis.VeriskoSalesPay.calculate(done,globalThis.VeriskoSalesPay.period(f.now()),'sales@test.invalid').total,15000);
});
test('only owner or Admin can change the visit time, with a reason and valid new future time; completed visits stay fixed',async()=>{
 const f=await booked(),change={date:'2026-10-25',time:'14:30',note:'TEST Client request'};
 for(const role of ['sales','other-sales','operations','installer'])assert.notEqual((await f.readyCmd(role,'reschedule_visit',change)).status,200);
 for(const extra of [{note:''},{date:'2026-02-30'},{date:'2026-10-23'},{time:'25:00'},{date:f.day(),time:'10:00'}])assert.equal((await f.readyCmd('teamlead','reschedule_visit',{...change,...extra})).status,400);
 good(await f.readyCmd('admin','reschedule_visit',change));
 good(await f.readyCmd('teamlead','complete_visit',{date:f.day()}));
 assert.equal((await f.readyCmd('teamlead','reschedule_visit',change)).status,409);
});
test('each role is denied commands outside its part of the same paid installation',async()=>{
 const f=await journeyFixture();await contactToPaid(f);const id=await planAndAssign(f);
 for(const role of ['sales','teamlead','installer','other-installer']){
  assert.notEqual((await f.readyCmd(role,'receive_material',{sourceId:'journey-quote',itemId:'cable',quantity:1,date:f.day()})).status,200);
  for(const [action,data] of [['materialIssue',{itemId:'cable',quantity:1}],['materialReceive',{itemId:'cable',good:1,damaged:0}],['installerPayment',{amount:1000,installerId:'installer'}],['complete',{comment:'FORGED'}]]){
   assert.ok([403,404].includes((await f.installCmd(role,action,data,{baseVersion:0})).status),role+' must not '+action);
  }
 }
 await finish(f);
 const raw=await f.raw();assert.equal(raw.prospects.length,1);assert.equal((await f.ok('installer','operations')).jobs[0].id,id);
 assert.equal((await f.ok('installer','installer')).jobs[0].status,'Completed');
 assert.equal((await f.ok('installer','other-installer')).jobs.length,0);
 assert.equal((await f.workspace('sales')).prospects[0].readyProgress,'Installation approved');
});
