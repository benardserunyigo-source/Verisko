import test from 'node:test';import assert from 'node:assert/strict';
import {journeyFixture} from './helpers/journey-fixture.mjs';
import {contactToPaid,planAndAssign,finish} from './helpers/journey-steps.mjs';
import '../commission.js';import '../sales-pay-policy.js';
const good=r=>{assert.equal(r.status,200,r.error);return r;};
test('full contact-to-approved-installation journey keeps one client, visit, payment, quote, materials plan and installation',async()=>{
 const f=await journeyFixture();await contactToPaid(f);const id=await planAndAssign(f);const completed=await finish(f);assert.equal(completed.id,id);assert.equal(completed.status,'Completed');assert.equal(completed.sourceId,'journey-quote');assert.equal(completed.readyContactId,'journey-client');
 for(let i=0;i<3;i++){const sales=await f.workspace('sales');assert.equal(sales.prospects.length,1);assert.equal(sales.prospects[0].readyProgress,'Installation approved');assert.equal(sales.prospects[0].installationProgress[0].id,id);assert.equal(sales.appointments.length,1);assert.equal(sales.transactions.length,1);assert.equal(sales.jobs.length,1);assert.equal(globalThis.VeriskoSalesPay.calculate(sales,globalThis.VeriskoSalesPay.period(f.now()),'sales@test.invalid').total,115000);}
 good(await f.save('sales',d=>{d.prospects[0].installationProgress=[{stage:'FORGED'}];}));assert.equal((await f.workspace('sales')).prospects[0].installationProgress[0].stage,'Installation approved');assert.equal((await f.raw()).prospects.length,1);assert.equal((await f.ready.get('cases/journey-client')).materialPlans.length,1);assert.equal([...f.install.rows.keys()].filter(k=>k.startsWith('jobs/')).length,1);
});
test('all roles have the right visibility and cannot skip approvals or edit another role’s work',async()=>{
 const f=await journeyFixture();await contactToPaid(f);const id=await planAndAssign(f);await finish(f);
 for(const role of ['sales','teamlead','other-sales','installer','other-installer']){
  const d=await f.ok('data',role),serialized=JSON.stringify(d);assert.ok(!serialized.includes('PRIVATE EXPORT KEY'));assert.ok(!serialized.includes('PRIVATE Supplier'));assert.equal(d.pricing,undefined);
  if(role==='sales')assert.equal(d.data.prospects.length,1);if(role==='other-sales')assert.equal(d.data.prospects.length,0);if(role.includes('installer'))assert.equal(d.data.prospects.length,0);
  assert.equal((await f.api('ready',role,undefined,'?materials=1')).status,403);
 }
 for(const role of ['sales','other-sales'])assert.equal((await f.api('installer',role)).status,403);
 assert.equal((await f.ok('installer','other-installer')).jobs.length,0);assert.equal((await f.api('installer','other-installer',undefined,'?jobId='+id)).status,404);
 const installer=await f.ok('installer','installer');assert.ok(!JSON.stringify(installer).includes('PRIVATE-SUPPLIER'));assert.ok(!JSON.stringify(installer).includes('PRIVATE-QUOTE'));assert.ok(!JSON.stringify(installer).includes('PRIVATE PAYMENT'));assert.equal(installer.jobs[0].installerPay.installer.amount,350000);
 const salesQueue=await f.ok('ready','sales');assert.equal(salesQueue.items[0].installationProgress[0].stage,'Installation approved');assert.equal(salesQueue.items[0].availableQuotes,undefined);assert.ok(!JSON.stringify(salesQueue).includes('PRIVATE'));
 const lead=await f.ok('installer','teamlead');assert.equal(lead.jobs.length,0);assert.equal((await f.api('installer','teamlead',undefined,'?jobId='+id)).status,404);
 const photo=await f.api('installer','other-installer',undefined,'?jobId='+id+'&photo=photo-view-camera-1');assert.equal(photo.status,404);
 for(const role of ['sales','installer','teamlead'])assert.equal((await f.readyCmd(role,'plan_materials',{sourceId:'journey-quote',items:[]})).status,403);
});
test('three completed clients earn the weekly bonus once, with first-payment commission once',async()=>{
 const f=await journeyFixture();await contactToPaid(f);
 for(let n=2;n<=3;n++){
  const id='client-'+n;good(await f.save('sales',d=>d.prospects.push({id,business:'TEST Shop '+n,phone:'077233300'+n,location:'TEST Kampala',createdBy:'TEST sales',createdByEmail:'sales@test.invalid',leadOnly:true})));
  let version=0;for(const [role,action,extra] of [['sales','request',{}],['operations','take',{}],['operations','confirm_visit',{date:f.day(),time:'11:00'}],['operations','complete_visit',{date:f.day()}]]){const r=good(await f.api('ready',role,{contactId:id,baseVersion:version,requestId:'bonus-'+n+'-'+action.replaceAll('_','-'),action,...extra}));version=r.item.version;}
 }
 const d=await f.workspace('sales'),earnings=globalThis.VeriskoSalesPay.calculate(d,globalThis.VeriskoSalesPay.period(f.now()),'sales@test.invalid');assert.equal(earnings.total,195000);assert.equal(earnings.reps[0].bonusAmount,50000);assert.equal(earnings.reps[0].visitAmount,45000);assert.equal(earnings.reps[0].depositAmount,100000);
});
