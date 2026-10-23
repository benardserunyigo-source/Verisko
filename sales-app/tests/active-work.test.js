import test from 'node:test';import assert from 'node:assert/strict';
import {activeWork} from '../netlify/functions/lib/active-work.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
import {journeyFixture} from './helpers/journey-fixture.mjs';
import {contactToPaid,planAndAssign} from './helpers/journey-steps.mjs';
const start='2026-10-23T07:00:00Z',now=Date.parse('2026-10-23T08:00:00Z'),position={lat:.3,lng:32.5,accuracy:10};
test('Operations projection combines only open client and installer sessions with minimal fields',async()=>{
 const visits=new FieldMemoryStore(),install=new FieldMemoryStore();await visits.setJSON('people/a',{sessions:[{id:'a',userId:'sales',name:'Sales',role:'sales',contactId:'c',business:'Old name',start:{at:start,position}},{id:'b',userId:'lead',name:'Lead',role:'teamlead',contactId:'c',business:'Saved name',start:{at:start,position},finish:{at:start}}]});
 await install.setJSON('jobs/j',{id:'j',business:'TEST Pharmacy',status:'In progress',installerPay:'PRIVATE PAY',evidence:['PRIVATE PHOTO'],workLog:[{id:'log',by:'installer',name:'Installer',start:{capturedAt:start,receivedAt:start,location:position}},{id:'done',by:'finished',start:{capturedAt:start,location:position},finish:{capturedAt:start}}]});
 const d=await activeWork({visitStore:visits,installationStore:install,prospects:[{id:'c',business:'TEST Shop'}],users:[{id:'sales',name:'Current name'}],now});assert.equal(d.rows.length,2);assert.deepEqual(d.counts,{people:2,visits:1,installations:1});assert.equal(d.rows[0].client,'TEST Shop');assert.equal(d.rows[0].name,'Current name');assert.equal(d.rows[0].elapsedSeconds,3600);assert.deepEqual(d.rows[0].startLocation,position);assert.ok(!JSON.stringify(d).includes('PRIVATE'));assert.ok(d.rows.every(r=>!r.needsFinish));
});
test('multiple jobs for one installer count one person and flag missing finish honestly',async()=>{
 const visits=new FieldMemoryStore(),install=new FieldMemoryStore();for(const [id,status]of [['one','Completed'],['two','In progress']])await install.setJSON('jobs/'+id,{id,status,business:'TEST Site',workLog:[{id,by:'one-person',start:{capturedAt:'2026-10-22T07:00:00Z',location:{lat:'invalid'}}}]});
 const d=await activeWork({visitStore:visits,installationStore:install,now});assert.deepEqual(d.counts,{people:1,visits:0,installations:2});assert.ok(d.rows.every(r=>r.needsFinish&&r.startLocation===null));
});
test('only Operations and Admin can fetch the active team dashboard',async()=>{
 const f=await journeyFixture();for(const role of ['sales','teamlead','installer','other-sales'])assert.equal((await f.api('work',role,null,'?dashboard=1')).status,403);assert.equal((await f.api('work','unknown',null,'?dashboard=1')).status,401);for(const role of ['operations','admin']){const d=await f.ok('work',role,null,'?dashboard=1');assert.deepEqual(d.rows,[]);assert.deepEqual(d.counts,{people:0,visits:0,installations:0});}
});
test('real visit and installation commands enter and leave the same Operations dashboard',async()=>{
 const f=await journeyFixture();f.setTime(start);await contactToPaid(f);await planAndAssign(f);
 for(const role of ['sales','teamlead'])await f.ok('work',role,{action:'start',contactId:'journey-client',requestId:'start-active-'+role,position:{...position,at:start}});
 const begun=await f.installCmd('installer','workStart',{location:position,capturedAt:start});assert.equal(begun.status,200,begun.error);f.setTime(new Date(now).toISOString());let d=await f.ok('work','operations',null,'?dashboard=1');assert.deepEqual(d.counts,{people:3,visits:2,installations:1});assert.deepEqual(d.rows.map(r=>r.role).sort(),['installer','sales','teamlead']);assert.ok(d.rows.every(r=>r.client==='TEST Journey Shop'&&r.elapsedSeconds===3600));
 await f.ok('work','sales',{action:'finish',contactId:'journey-client',sessionId:'start-active-sales',requestId:'end-active-sales',position:{...position,at:new Date(now).toISOString()}});assert.equal((await f.installCmd('installer','workFinish',{location:position,capturedAt:new Date(now).toISOString()})).status,200);d=await f.ok('work','operations',null,'?dashboard=1');assert.deepEqual(d.counts,{people:1,visits:1,installations:0});assert.equal(d.rows[0].role,'teamlead');assert.equal((await f.raw()).prospects.length,1);
});
