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

for(const role of ['sales','teamlead','installer'])test(role+' Start appears, Finish removes, and both locations and exact time survive reload',async()=>{
 const f=await journeyFixture();f.setTime(start);await contactToPaid(f);await planAndAssign(f);
 const begin={lat:.3476,lng:32.5825,accuracy:9},end={lat:.3487,lng:32.5836,accuracy:14},id='persist-start-'+role,finishId='persist-finish-'+role;
 const startIt=()=>role==='installer'?f.installCmd(role,'workStart',{location:begin,capturedAt:start},{requestId:id}):f.api('work',role,{action:'start',contactId:'journey-client',requestId:id,position:{...begin,at:start}});
 assert.equal((await startIt()).status,200);assert.equal((await startIt()).status,200);
 const at='2026-10-23T07:37:19Z';f.setTime(at);const dashboard=await f.ok('work','operations',null,'?dashboard=1');assert.equal(dashboard.rows.length,1);const row=dashboard.rows[0];assert.equal(row.personId,role);assert.equal(row.client,'TEST Journey Shop');assert.equal(row.startedAt,new Date(start).toISOString());assert.deepEqual(row.startLocation,begin);assert.equal(row.elapsedSeconds,2239);assert.deepEqual(dashboard.counts,{people:1,visits:role==='installer'?0:1,installations:role==='installer'?1:0});
 const finishIt=()=>role==='installer'?f.installCmd(role,'workFinish',{location:end,capturedAt:at},{requestId:finishId}):f.api('work',role,{action:'finish',contactId:'journey-client',sessionId:id,requestId:finishId,position:{...end,at}});
 assert.equal((await finishIt()).status,200);assert.equal((await finishIt()).status,200);assert.deepEqual((await f.ok('work','operations',null,'?dashboard=1')).rows,[]);
 let record;if(role==='installer'){const jobs=(await f.ok('installer',role)).jobs;record=jobs[0].workLog.find(l=>l.id===id);assert.equal(jobs[0].workLog.length,1);assert.deepEqual(record.start.location,begin);assert.deepEqual(record.finish.location,end);assert.equal((Date.parse(record.finish.capturedAt)-Date.parse(record.start.capturedAt))/1000,2239);assert.equal(record.finish.capturedAt,at.replace('Z','.000Z'));}
 else{const history=await f.ok('work',role,null,'?contactId=journey-client');assert.equal(history.current,null);assert.equal(history.sessions.length,1);record=history.sessions[0];assert.equal(record.durationSeconds,2239);assert.deepEqual(Object.fromEntries(['lat','lng','accuracy'].map(k=>[k,record.start.position[k]])),begin);assert.equal(record.finish.position.lat,end.lat);assert.equal(record.finish.position.lng,end.lng);assert.equal(record.finish.position.accuracy,end.accuracy);assert.equal(record.finish.at,at.replace('Z','.000Z'));}
 assert.equal((await f.raw()).prospects.length,1);assert.ok(record);
});
