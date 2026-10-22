import test from 'node:test';import assert from 'node:assert/strict';
import {createJob,applyCommand,installerJobView,payReady,crewPay,readiness} from '../installer-model.mjs';
import {createInstallerHandler} from '../netlify/functions/lib/installer-core.mjs';
const now='2026-10-22T12:00:00Z',ops={id:'ops',name:'Operations',role:'operations'},one={id:'crew-one',name:'One',role:'installer'},two={id:'crew-two',name:'Two',role:'installer'};let seq=0;
const make=()=>createJob({id:'pay-job',business:'TEST',siteStaff:{name:'TEST Staff',phone:'000'},address:'TEST',scope:'TEST',equipment:'2 × 4K bullet camera',locations:['Gate'],scheduledDate:'2026-10-23',assignees:[one.id,two.id]},ops,now,[ops,one,two]);
const command=(payments,baseVersion=0)=>({action:'installerPay',requestId:'pay-request-'+(++seq),baseVersion,data:{payments}});
const rates=()=>[{installerId:one.id,amount:200000,note:'TEST: whole job including transport'},{installerId:two.id,amount:150000,note:'TEST: whole job'}];
const pay=j=>applyCommand(j,command(rates(),j.versions.installerPay||0),ops,now);
test('Operations sets one agreed whole-job amount per installer and total crew pay is clear',()=>{
 let j=make();assert.equal(payReady(j),false);assert.ok(readiness(j).some(x=>x.includes('agreed pay')));
 j=pay(j);assert.equal(payReady(j),true);assert.equal(crewPay(j),350000);assert.equal(j.installerPay[one.id].currency,'UGX');assert.equal(j.installerPay[one.id].by,ops.id);assert.equal(j.payHistory.length,1);
 const retry=command([{installerId:one.id,amount:220000}],1);j=applyCommand(j,retry,ops,now);assert.equal(crewPay(j),370000);assert.equal(j.payHistory[0].payments[one.id].amount,200000);assert.deepEqual(applyCommand(j,retry,ops,now),j);
});
test('invalid, duplicate and unassigned payment amounts are rejected',()=>{
 const j=make();for(const amount of [0,-1,1.5,NaN,Infinity,'200000',100000001])assert.throws(()=>applyCommand(j,command([{installerId:one.id,amount}]),ops,now),/whole UGX/);
 assert.throws(()=>applyCommand(j,command([{installerId:'stranger',amount:1}]),ops,now),/assigned installer/);
 assert.throws(()=>applyCommand(j,command([rates()[0],rates()[0]]),ops,now),/once/);
 assert.throws(()=>applyCommand(j,command([]),ops,now),/Enter the agreed/);
});
test('installers and supervisors cannot set rates; stale updates cannot overwrite newer rates',()=>{
 const j=make();for(const user of [one,{id:'sup',role:'supervisor'}])assert.throws(()=>applyCommand(j,command(rates()),user,now),e=>e.status===403);
 assert.throws(()=>applyCommand(pay(j),command(rates()),ops,now),e=>e.status===409);
 const complete=pay(j);complete.status='Completed';assert.throws(()=>applyCommand(complete,command(rates(),1),ops,now),/read-only/);
});
test('each installer sees only their own amount and amount history; supervisor sees no pay values',()=>{
 const j=pay(make());const a=installerJobView(j,one),b=installerJobView(j,two),s=installerJobView(j,{role:'supervisor'});
 assert.deepEqual(Object.keys(a.installerPay),[one.id]);assert.deepEqual(Object.keys(b.installerPay),[two.id]);assert.deepEqual(Object.keys(a.payHistory[0].payments),[one.id]);assert.equal(a.payReady,true);
 assert.deepEqual(s.installerPay,{});assert.deepEqual(s.payHistory,[]);assert.equal(Object.keys(installerJobView(j,ops).installerPay).length,2);
 assert.equal(readiness(a).some(x=>x.includes('agreed pay')),false);
});
test('new work requires an agreed amount but missing legacy fees do not prevent check-out',()=>{
 let j=make();const mark={capturedAt:now,location:{lat:0,lng:0,accuracy:10}};
 const work=action=>({action,requestId:'work-pay-'+(++seq),data:mark});assert.throws(()=>applyCommand(j,work('workStart'),one,now),/agreed pay/);
 j=pay(j);j=applyCommand(j,work('workStart'),one,now);delete j.installerPay;delete j.payRequired;j=applyCommand(j,work('workFinish'),one,now);assert.ok(j.workLog[0].finish);
});
test('assigning a new installer needs a new fee; historical old rates do not inflate the crew total',()=>{
 let j=pay(make());j.assignees=[one.id,'new-installer'];assert.equal(payReady(j),false);assert.equal(crewPay(j),200000);assert.equal(j.installerPay[two.id].amount,150000);
});
test('all API response paths enforce individual payment privacy',async()=>{
 let stored=pay(make());const store={async get(){return structuredClone(stored);},async getWithMetadata(){return {data:structuredClone(stored),etag:'1'};},async *list(){yield {blobs:[{key:'jobs/pay-job'}]};},async setJSON(k,v){stored=structuredClone(v);return {modified:true};}};
 const handler=createInstallerHandler({store,authorize:async()=>({me:one,users:[ops,one,two]}),now:()=>now});
 for(const query of ['', '?jobId=pay-job']){const b=await(await handler(new Request('https://test/api/installer'+query))).json(),j=b.job||b.jobs[0];assert.equal(j.installerPay[two.id],undefined);assert.equal(j.payHistory[0].payments[two.id],undefined);}
 const r=await handler(new Request('https://test/api/installer',{method:'POST',body:JSON.stringify({jobId:'pay-job',command:{action:'workStart',requestId:'start-price-api',data:{capturedAt:now,location:{lat:0,lng:0,accuracy:10}}}})}));assert.equal(r.status,200);assert.equal((await r.json()).job.installerPay[two.id],undefined);
});
