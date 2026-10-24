import test from 'node:test';
import assert from 'node:assert/strict';
import {journeyFixture,IMAGE} from './helpers/journey-fixture.mjs';
import {contactToPaid,planAndAssign,finish} from './helpers/journey-steps.mjs';
import {clientSignature,makeClientReview,canReviewClient} from '../client-review.mjs';
const H=globalThis.VeriskoHandover;
const date=()=>new Date().toISOString().slice(0,10);
const good=r=>{assert.equal(r.status,200,r.error);return r;};
const accepted=()=>({outcome:'accepted',name:'TEST Client',role:'Client / owner',date:date(),signature:{type:'typed',name:'TEST Client'},clientConfirmed:true,supervisorConfirmed:true,checklist:Object.fromEntries(H.CHECKS.map(k=>[k,true])),care:{serviceStartDate:date(),monitoringMiniPcRef:'TEST-PC',monitoringCommissioned:true,monitoringTestEvidence:'TEST offline alert and site reporting check'}});
async function job(f){return (await f.ok('installer','operations')).jobs[0];}
async function review(f,role,data,extra={}){const j=await job(f);return f.installCmd(role,'clientReview',data,{baseVersion:j.versions.clientReview||0,...extra});}
async function completed({lead=false}={}){
 const f=await journeyFixture();await contactToPaid(f);await planAndAssign(f);
 if(lead){const j=await job(f);good(await f.installCmd('operations','plan',{...j,assignees:j.assignees,supervisorIds:['teamlead']},{baseVersion:j.versions.plan}));}
 await finish(f);return f;
}
test('a client can draw a bounded signature or type their exact name; empty and malformed signatures fail',()=>{
 assert.deepEqual(clientSignature({type:'typed',name:'test CLIENT'},'TEST Client'),{type:'typed',name:'test CLIENT'});
 const signature={type:'drawn',strokes:[Array.from({length:8},(_,i)=>[i/10,.2+i/50])]};assert.equal(clientSignature(signature,'TEST').strokes[0].length,8);
 for(const value of [{},{type:'typed',name:'Another client'},{type:'drawn',strokes:[]},{type:'drawn',strokes:[[[0,0],[2,2]]]},{type:'drawn',strokes:[Array.from({length:600},()=>[0,0])]}])assert.throws(()=>clientSignature(value,'TEST Client'));
});
test('only a named site supervisor can record joint sign-off, including a Team Lead; no installer or Admin bypass',async()=>{
 const f=await completed({lead:true});
 for(const role of ['operations','admin','installer','other-installer','sales'])assert.ok([403,404].includes((await review(f,role,accepted())).status),role);
 const view=(await f.ok('installer','teamlead')).jobs[0];assert.equal(view.handoverSetup.servicePolicyVersion,globalThis.VeriskoCare.VERSION);assert.equal(view.quoteSnapshot,undefined);assert.deepEqual(view.installerPay,{});
 const before=await f.workspace('operations'),stale=structuredClone(before),requestId='joint-client-signoff-repeat';
 const saved=good(await review(f,'teamlead',accepted(),{requestId}));good(await review(f,'teamlead',accepted(),{requestId,baseVersion:0}));
 assert.equal(saved.job.clientReview.by,'teamlead');assert.equal(saved.job.clientReviewHistory.length,1);assert.equal(saved.job.clientReview.signature.type,'typed');
 const after=await f.workspace('operations');assert.equal(after.jobs[0].stage,'Handed over');assert.equal(after.jobs[0].clientHandover.supervisorId,'teamlead');assert.equal(after.jobs[0].clientHandover.clientSignatureRecorded,true);
 assert.deepEqual(after.transactions,before.transactions);assert.deepEqual(after.jobs[0].quoteSnapshot,before.jobs[0].quoteSnapshot);assert.equal(after.jobs[0].quotedTotal,before.jobs[0].quotedTotal);
 for(const role of ['sales','teamlead']){const d=await f.workspace(role);assert.equal(d.prospects[0].readyProgress,'Client signed off');assert.equal(d.jobs[0].clientHandover,undefined);}
 for(const role of ['installer','operations','admin']){const j=(await f.ok('installer',role)).jobs[0];assert.equal(j.clientReview.signature,undefined);assert.equal(j.clientReviewHistory,undefined);}
 good(await f.api('data','operations',{data:stale}));assert.equal((await f.workspace('operations')).jobs[0].stage,'Handed over');
 assert.equal((await review(f,'teamlead',accepted())).status,409);
 assert.equal(after.prospects.length,1);assert.equal(after.jobs.length,1);assert.equal(after.transactions.length,1);assert.equal((await f.ok('installer','other-installer')).jobs.length,0);
});
test('client and site supervisor must both confirm, with all checks, signature, date and actual care references',async()=>{
 const f=await completed();
 for(const extra of [{supervisorConfirmed:false},{clientConfirmed:false},{signature:{type:'typed',name:'Wrong'}},{checklist:{}},{name:''},{date:'2099-01-01'},{care:{}}]){
  const r=await review(f,'operations',{...accepted(),...extra});assert.equal(r.status,400,JSON.stringify(extra));
 }
 assert.equal((await f.workspace('operations')).jobs[0].stage,'Installed');assert.equal((await job(f)).clientReview,undefined);
});
test('client fixes keep the same job open through installer repair, new evidence, technical re-approval and a second client meeting',async()=>{
 const f=await completed(),before=await f.workspace('operations');
 good(await review(f,'operations',{outcome:'fixes',issue:'TEST Gate view needs changing',nextAction:'TEST Installer returns tomorrow; supervisor meets client after review',supervisorConfirmed:true}));
 assert.equal((await job(f)).status,'Needs correction');assert.equal((await f.workspace('sales')).prospects[0].readyProgress,'Client fixes needed');assert.equal((await f.workspace('operations')).jobs[0].stage,'In progress');
 assert.equal((await f.installCmd('installer','submit')).status,400);
 assert.equal((await review(f,'operations',accepted())).status,409);
 let j=await job(f);assert.equal((await f.installCmd('installer','clientFix',{note:'TEST',photos:['photo-demo-site']},{baseVersion:0})).status,400);
 const location={lat:.3,lng:32.5,accuracy:10};f.setTime(new Date(Date.parse(f.now())+60000).toISOString());good(await f.installCmd('installer','workStart',{location,capturedAt:f.now()}));
 good(await f.installCmd('installer','evidence',{id:'TEST-new-client-fix-photo',kind:'demo',image:IMAGE}));good(await f.installCmd('installer','workFinish',{location,capturedAt:f.now()}));
 good(await f.installCmd('installer','clientFix',{note:'TEST Gate camera aimed again and checked',photos:['TEST-new-client-fix-photo']},{baseVersion:0}));
 good(await f.installCmd('installer','submit'));assert.equal((await f.workspace('sales')).prospects[0].readyProgress,'Waiting for installation approval');
 good(await f.installCmd('operations','complete',{comment:'TEST Fresh repair evidence and camera checks reviewed'}));assert.equal((await f.workspace('operations')).jobs[0].stage,'Installed');assert.equal((await f.workspace('sales')).prospects[0].readyProgress,'Client recheck needed');
 good(await review(f,'operations',accepted()));j=await job(f);assert.equal(j.clientReviewHistory.length,2);assert.equal(j.clientReviewHistory[0].outcome,'fixes');assert.equal(j.clientReviewHistory[1].outcome,'accepted');assert.equal(j.clientFix.note,'TEST Gate camera aimed again and checked');
 const after=await f.workspace('operations');assert.equal(after.jobs[0].stage,'Handed over');assert.equal(after.jobs.length,1);assert.deepEqual(after.transactions,before.transactions);
});
test('unavailable client keeps the job open with a reason and next action; no signature is invented',async()=>{
 const f=await completed();
 assert.equal((await review(f,'operations',{outcome:'unavailable',issue:'Away',nextAction:'',supervisorConfirmed:true})).status,400);
 good(await review(f,'operations',{outcome:'unavailable',issue:'TEST Client away',nextAction:'TEST Supervisor to meet client Friday',supervisorConfirmed:true}));
 assert.equal((await job(f)).status,'Completed');assert.equal((await job(f)).clientReview.signature,undefined);assert.equal((await f.workspace('operations')).jobs[0].stage,'Installed');assert.equal((await f.workspace('sales')).prospects[0].readyProgress,'Client sign-off pending');
});
test('client acceptance uses Uganda date, refuses pre-installation dates and requires assignment before retry checks',()=>{
 const user={id:'ops',name:'TEST Ops',role:'operations'},j={status:'Completed',supervisorIds:['ops']},data={...accepted(),date:'2026-10-25',care:{}};
 assert.equal(makeClientReview(j,data,user,'2026-10-24T22:00:00Z').date,'2026-10-25');
 assert.throws(()=>makeClientReview(j,{...data,date:'2026-10-26'},user,'2026-10-24T22:00:00Z'),/future/);
 assert.throws(()=>makeClientReview(j,{...data,care:{serviceStartDate:'2026-10-26'}},user,'2026-10-24T22:00:00Z'),/installation/);
 assert.equal(canReviewClient(j,{id:'other',role:'admin'}),false);
});
test('Operations can assign a supervisor to an already reviewed job without changing crew, money or evidence',async()=>{
 const f=await completed(),before=await job(f);
 assert.equal((await f.installCmd('teamlead','handoverSupervisor',{supervisorId:'teamlead'},{baseVersion:before.versions.plan})).status,404);
 assert.equal((await f.installCmd('operations','handoverSupervisor',{supervisorId:'installer'},{baseVersion:before.versions.plan})).status,400);
 good(await f.installCmd('operations','handoverSupervisor',{supervisorId:'teamlead'},{baseVersion:before.versions.plan}));
 const after=await job(f);assert.ok(after.supervisorIds.includes('teamlead'));for(const k of ['assignees','installerPay','evidence','materials','approval'])assert.deepEqual(after[k],before[k]);
});
test('old job-record forms and forged acceptance cannot bypass the supervisor command',async()=>{
 const f=await completed();const r=await f.save('operations',d=>{Object.assign(d.jobs[0],{stage:'Handed over',checklist:accepted().checklist,clientHandover:{name:'FORGED',recordedAt:'2000-01-01'}});});assert.equal(r.status,400);assert.match(r.error,/assigned site supervisor/);
 assert.equal((await f.workspace('operations')).jobs[0].stage,'Installed');assert.equal((await job(f)).clientReview,undefined);
});

test('two assigned supervisors cannot replace each other’s simultaneous client acceptance',async()=>{
 const f=await completed(),j=await job(f);good(await f.installCmd('operations','handoverSupervisor',{supervisorId:'teamlead'},{baseVersion:j.versions.plan}));
 const results=await Promise.all(['operations','teamlead'].map(role=>f.installCmd(role,'clientReview',accepted(),{baseVersion:0})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const saved=await job(f);assert.equal(saved.clientReviewHistory.length,1);assert.equal((await f.workspace('operations')).jobs[0].stage,'Handed over');
});

test('Operations summary separates client handover pending, client fixes and final sign-off',async()=>{
 const f=await completed();const read=async()=>{const r=await f.handlers.installer(new Request('http://local/api/installer?summary=1',{headers:{Authorization:'Bearer operations'}}));assert.equal(r.status,200);return r.json();};
 assert.equal((await read()).handover,1);
 good(await review(f,'operations',{outcome:'fixes',issue:'TEST aim camera',nextAction:'TEST repair and recheck',supervisorConfirmed:true}));
 assert.equal((await read()).handover,0);assert.ok((await read()).corrections>=1);
 const acceptedFixture=await completed();good(await review(acceptedFixture,'operations',accepted()));
 const r=await acceptedFixture.handlers.installer(new Request('http://local/api/installer?summary=1',{headers:{Authorization:'Bearer operations'}}));assert.equal((await r.json()).handover,0);
});
