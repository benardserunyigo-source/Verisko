import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyFixture} from './helpers/journey-fixture.mjs';
import {contactToPaid,planAndAssign,finish} from './helpers/journey-steps.mjs';

test('full journey approval updates Job records after fresh reads and stale saves, without changing prices, schedules or funding',async()=>{
 const f=await journeyFixture();await contactToPaid(f);
 assert.equal((await f.save('operations',d=>{d.jobs[0].paymentPlan='installments';})).status,200);
 await planAndAssign(f);
 const stale=await f.workspace('operations'),before=structuredClone(stale.jobs[0]);assert.equal(before.stage,'Sent');
 await finish(f);
 for(const role of ['operations','admin','sales','teamlead']){
  const d=await f.workspace(role);assert.equal(d.jobs[0].stage,'Installed');assert.equal(d.prospects[0].readyProgress,'Installation approved');
 }
 const updated=(await f.workspace('operations')).jobs[0];assert.deepEqual(updated,{...before,stage:'Installed'});
 assert.equal(updated.paymentPlan,'installments');assert.notEqual(updated.fundingConfirmed,true);
 const tx=(await f.workspace('operations')).transactions;assert.equal(tx.length,1);assert.equal(tx[0].installId,before.id);assert.equal(tx[0].amount,2000000);
 // Saving an older page must return the canonical stage immediately, too.
 stale.jobs[0].notes='TEST follow-up note';
 const saved=await f.api('data','operations',{data:stale});assert.equal(saved.status,200,saved.error);assert.equal(saved.jobs[0].stage,'Installed');
 assert.deepEqual((await f.workspace('operations')).jobs[0],{...before,notes:'TEST follow-up note',stage:'Installed'});
 assert.equal((await f.raw()).jobs[0].stage,'Installed');
 assert.equal((await f.save('sales',d=>{d.jobs[0].stage='Sent';})).status,200);
 assert.equal((await f.workspace('operations')).jobs[0].stage,'Installed');
 assert.equal((await f.save('operations',d=>{d.jobs[0].cameraCount=12;})).status,400);
 assert.equal((await f.workspace('operations')).jobs.length,1);assert.equal((await f.workspace('sales')).transactions.length,1);
});
