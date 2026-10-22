import test from 'node:test';import assert from 'node:assert/strict';
import {createDemoTransport,DEMO_JOB_ID,demoActors} from '../installer-demo.mjs';
import {TESTS} from '../installer-model.mjs';
const now='2026-10-22T12:00:00Z',image='data:image/jpeg;base64,/9j/2Q==';let sequence=0;
function fixture(ownerId='test-owner'){
 let data;const transport=createDemoTransport({ownerId,image,load:async()=>structuredClone(data),save:async value=>{data=structuredClone(value);},now:()=>now});
 const read=role=>transport.fetcher(role)('/api/installer').then(r=>r.json());
 const send=async(role,action,values={},extra={})=>{const r=await transport.fetcher(role)('/api/installer',{body:JSON.stringify({jobId:DEMO_JOB_ID,command:{requestId:'demo-request-'+(++sequence),action,data:values,...extra}})});const result=await r.json();if(!r.ok)throw new Error(result.error);return result.job;};
 return {transport,read,send};
}
test('demo starts unassigned and Operations assigns a fictional installer without creating staff',async()=>{
 const f=fixture(),ops=await f.read('operations');assert.equal(ops.jobs[0].business,'DEMO · Kampala Shop');assert.deepEqual(ops.jobs[0].assignees,[]);assert.equal((await f.read('installer')).jobs.length,0);
 const installer=demoActors('test-owner')[1];await f.send('operations','plan',{assignees:[installer.id],scheduledDate:'2026-10-23',instructions:'Demo instructions'},{baseVersion:0});assert.equal((await f.read('installer')).jobs.length,1);
 await assert.rejects(()=>f.send('installer','plan',{assignees:[],scheduledDate:'2026-10-23'},{baseVersion:1}),/Supervisor/);
});
test('full demo uses the real evidence gates, then installer submission and Operations approval',async()=>{
 const f=fixture('demo-flow'),installer=demoActors('demo-flow')[1];let j=await f.send('operations','plan',{assignees:[installer.id],scheduledDate:'2026-10-23',instructions:'DEMO'},{baseVersion:0});
 await assert.rejects(()=>f.send('installer','submit'),/photos|checks/);
 for(const camera of j.cameras){
  for(const kind of ['route','mount','fixings','entry','view'])j=await f.send('installer','evidence',{id:'demo-photo-'+(++sequence),kind,image},{cameraId:camera.id});
  j=await f.send('installer','cable',{route:'Demo continuous route',joins:'no'},{cameraId:camera.id,baseVersion:0});
  j=await f.send('installer','mount',{fixings:true,secured:true,stability:true},{cameraId:camera.id,baseVersion:0});
  j=await f.send('installer','tests',Object.fromEntries(TESTS.map(key=>[key,{result:'pass'}])),{cameraId:camera.id,baseVersion:0});
 }
 j=await f.send('installer','evidence',{id:'demo-handover',kind:'demo',image});
 j=await f.send('installer','handover',{demonstration:'Demo live view and playback',issues:'None',acknowledged:true,customerName:'Demo customer'},{baseVersion:0});
 await f.send('installer','workStart',{capturedAt:now,location:{lat:0,lng:0,accuracy:10}});await f.send('installer','workFinish',{capturedAt:now,location:{lat:0,lng:0,accuracy:10}});
 j=await f.send('installer','submit');assert.equal(j.status,'Submitted');await assert.rejects(()=>f.send('installer','complete',{comment:'Done'}),/Supervisor/);
 j=await f.send('operations','complete',{comment:'Demo technical review complete'});assert.equal(j.status,'Completed');assert.equal(j.evidence.length,12);
});
test('demo transport is isolated, restricted to one demo job, and resets only its own data',async()=>{
 const a=fixture('owner-a'),b=fixture('owner-b');await a.read('operations');await b.read('operations');assert.notEqual((await a.transport.snapshot()).job.createdBy,(await b.transport.snapshot()).job.createdBy);
 const result=await a.transport.fetcher('operations')('/api/data');assert.equal(result.status,400);
 const wrong=await a.transport.fetcher('operations')('/api/installer',{body:JSON.stringify({jobId:'a-real-job',command:{action:'complete'}})});assert.equal(wrong.status,400);
 await a.transport.reset();assert.deepEqual((await a.transport.snapshot()).job.assignees,[]);assert.equal((await b.transport.snapshot()).job.id,DEMO_JOB_ID);
});
