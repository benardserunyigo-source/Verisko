import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,token} from './helpers/client-plan-fixture.mjs';
import {planSchedule,projectClientPlans,loadClientPlans} from '../netlify/functions/lib/client-plan-job.mjs';
import {validateQuotes} from '../netlify/functions/lib/quote-guard.mjs';
import {createDataHandler} from '../netlify/functions/data.mjs';
import {FieldMemoryStore} from './helpers/field-fixture.mjs';
import {buildJobSummaries} from '../job-summary.mjs';
import '../job-finance.js';import '../quote-pdf.js';
const approve=(f,extra={})=>f.api({action:'approve',jobId:'saved-job',choiceAt:'2026-10-24T18:00:00Z',startDate:'2027-01-31',checked:true,...extra});
async function chosen(id='12months',cameras=4){const f=await fixture(cameras);await f.api(f.create());const r=await f.api({action:'choose',jobId:'saved-job',token,plan:id,name:'DEMO Client',confirmed:true},'');assert.equal(r.status,200,r.error);return f;}
test('Operations approves every saved plan and camera size, with exact totals, deposit and calendar dates on the same job',async()=>{
 for(const count of [4,6,8,12])for(const id of ['cash','12months','24months','rental']){
 const f=await chosen(id,count),before=structuredClone(f.workspace),r=await approve(f,{total:1,monthly:1,offer:{owns:true}});assert.equal(r.status,200,r.error);
 const records=await loadClientPlans(f.store),d=projectClientPlans(f.workspace,records),j=d.jobs[0],a=j.clientPlanApproval;
 const publicReply=await f.api({action:'view',jobId:'saved-job',token},'');assert.equal(publicReply.status,200);for(const secret of ['costReview','sourceJob','financials','costOfDoingBusiness','PRIVATE','tokenHash'])assert.ok(!JSON.stringify(publicReply).includes(secret));
 assert.equal(d.jobs.length,1);assert.equal(j.id,f.job.id);assert.equal(j.prospectId,f.job.prospectId);assert.equal(j.quotedTotal,a.offer.total);assert.equal(j.paymentPlan,id);assert.equal(j.quoteSnapshot.cash,a.offer.total);assert.equal(j.paymentSchedule[0].amount,a.offer.upfront);assert.equal(j.paymentSchedule[0].due,'2027-01-31');assert.equal(j.paymentSchedule.length,a.offer.months+1);assert.equal(j.paymentSchedule.reduce((n,x)=>n+x.amount,0),a.offer.total);
 if(a.offer.months){assert.equal(j.paymentSchedule[1].due,'2027-02-28');assert.equal(j.paymentSchedule[2].due,'2027-03-31');assert.equal(j.paymentSchedule[1].amount,a.offer.monthly);}
 assert.equal(a.offer.owns,id!=='rental');assert.equal(j.fundingConfirmed,false);assert.deepEqual(d.transactions,before.transactions);assert.deepEqual(f.workspace,before);
 assert.deepEqual(projectClientPlans(d,records),d);assert.equal((await approve(f)).item.approval.approvedAt,r.item.approval.approvedAt);assert.equal((await approve(f,{startDate:'2027-02-01'})).status,409);
 const model=globalThis.VeriskoQuote.buildQuoteModel(j,{},j.quoteSnapshot,{value:j.quotedTotal});assert.equal(model.total,a.offer.total);assert.equal(model.plans.length,1);assert.deepEqual(model.plans[0].rows.map(x=>x.amount),j.paymentSchedule.map(x=>x.amount));assert.equal(model.items.reduce((n,x)=>n+(x.amount||0),0),a.offer.total);assert.doesNotMatch(model.terms.join(' '),/60%|40%|30%/);
 }
});
test('approval is Operations/Admin only, checked, current, valid date, once and guarded by current costs',async()=>{
 const f=await chosen();for(const role of ['sales','teamlead','installer','']){const r=await f.api({action:'approve',jobId:'saved-job',choiceAt:'2026-10-24T18:00:00Z',startDate:'2027-01-31',checked:true},role);assert.equal(r.status,role?403:401);}
 for(const extra of [{checked:false},{choiceAt:'changed'},{startDate:''},{startDate:'2027-02-30'},{startDate:'2027-99-99'}])assert.ok((await approve(f,extra)).status>=400);
 const draft=await f.drafts.get('jobs/saved-job');draft.budget.packages[4].direct=20000000;await f.drafts.setJSON('jobs/saved-job',draft);assert.equal((await approve(f)).status,409);assert.equal((await f.store.get('jobs/saved-job')).approval,undefined);
 const g=await chosen();g.job.cameraCount=6;assert.equal((await approve(g)).status,409);
 const h=await chosen();h.time('2026-11-02T18:00:00Z');assert.equal((await approve(h)).status,409);
 const k=await fixture();await k.api(k.create());assert.equal((await approve(k)).status,409);
});
test('approved totals survive stale edits and technical progress without approving funding or receipts',async()=>{
 const f=await chosen();await approve(f);const records=await loadClientPlans(f.store),d=projectClientPlans(f.workspace,records),j=d.jobs[0];
 const stale={...f.job};const restored=validateQuotes([j],[stale],false,'ops@test.invalid')[0];assert.equal(restored.quotedTotal,j.quotedTotal);assert.deepEqual(restored.paymentSchedule,j.paymentSchedule);assert.deepEqual(restored.clientPlanApproval,j.clientPlanApproval);
 assert.throws(()=>validateQuotes([j],[{...j,prospectId:'another-client'}],true,'owner@test.invalid'),/same client/);
 assert.throws(()=>validateQuotes([j],[{...j,cameraCount:6}],true,'owner@test.invalid'),/approved/);
 assert.throws(()=>validateQuotes([j],[{...j,stage:'Accepted',scheduledDate:'2027-01-31',fundingConfirmed:true}],false,'ops@test.invalid'),/Owner/);
 const accepted=validateQuotes([j],[{...j,stage:'Accepted',scheduledDate:'2027-01-31',fundingConfirmed:true}],true,'owner@test.invalid')[0];assert.equal(accepted.fundingConfirmed,true);assert.deepEqual(accepted.paymentSchedule,j.paymentSchedule);
 const moved=validateQuotes([accepted],[{...accepted,stage:'Installed'}],false,'ops@test.invalid')[0];assert.equal(moved.quotedTotal,j.quotedTotal);assert.deepEqual(moved.paymentSchedule,j.paymentSchedule);
 assert.equal(validateQuotes([j],[],false,'ops@test.invalid').length,1);
 await f.api({action:'revoke',jobId:'saved-job'});assert.equal((await f.api({action:'view',jobId:'saved-job',token},'')).status,410);assert.equal(projectClientPlans(f.workspace,await loadClientPlans(f.store)).jobs[0].quotedTotal,j.quotedTotal);assert.equal((await f.api(f.create())).status,409);
 const missing=projectClientPlans({...f.workspace,jobs:[]},records);assert.equal(missing.jobs[0].id,j.id);assert.equal(missing.jobs[0].quotedTotal,j.quotedTotal);
 const forged={...f.job,clientPlanApproval:j.clientPlanApproval};const cleaned=validateQuotes([f.job],[forged],false,'ops@test.invalid')[0];assert.equal(cleaned.clientPlanApproval,undefined);
});
test('actual shared data and old Job records receive approval and keep existing receipts, balance and role privacy',async()=>{
 const f=await chosen(),roles=['admin','operations','sales','teamlead','installer'];f.workspace.users=roles.map(role=>({id:role,role,name:'DEMO '+role,email:role+'@test.invalid'}));f.workspace.prospects[0].createdByEmail='sales@test.invalid';f.workspace.transactions=[{id:'earlier',installId:'saved-job',prospectId:'client-a',direction:'in',status:'approved',amount:500000,date:'2026-10-24'}];
 const stores=new Map([['verisko-client-plans',f.store]]),storeFor=o=>{const name=typeof o==='string'?o:o.name;if(!stores.has(name))stores.set(name,new FieldMemoryStore());return stores.get(name);};await storeFor('verisko-sales').setJSON('app-data',f.workspace);
 const api=createDataHandler({storeFor,identifyRequest:async req=>{const me=f.workspace.users.find(u=>u.id===req.headers.get('authorization'));return me?{me,email:me.email}:{error:'Sign in',status:401};}});
 const call=async(role,body)=>{const r=await api(new Request('https://test.local/api/data',{method:body?'POST':'GET',headers:{authorization:role},...(body?{body:JSON.stringify({data:body})}:{})}));return {status:r.status,...await r.json()};};
 const stale=(await call('operations')).data;await approve(f);let office=(await call('operations')).data,j=office.jobs[0];assert.equal(j.quotedTotal,5120000);assert.equal(j.paymentSchedule[0].amount,2000000);assert.equal(j.stage,'Sent');
 const finance=globalThis.VeriskoJobFinance.review(j,office.transactions,'2027-02-01',office.jobs);assert.equal(finance.paid,500000);assert.equal(finance.outstanding,4620000);assert.equal(finance.rows[0].balance,1500000);
 const summary=buildJobSummaries({user:{role:'operations'},data:office,clientPlans:(await f.api(null)).items})[0];assert.equal(summary.balance,finance.outstanding);assert.equal(summary.schedule[0].due,'2027-01-31');
 const saved=await call('operations',stale);assert.equal(saved.status,200,saved.error);office=(await call('operations')).data;assert.equal(office.jobs[0].quotedTotal,5120000);assert.equal(office.jobs[0].paymentSchedule.length,13);assert.deepEqual(office.transactions,f.workspace.transactions);
 for(const role of ['sales','teamlead','installer']){const r=await call(role);assert.equal(r.status,200);assert.ok(!JSON.stringify(r).includes('clientPlanApproval'));assert.ok(!JSON.stringify(r).includes('costOfDoingBusiness'));}
});
test('calendar dates clamp month end without drift, including leap years',()=>{const offer={months:3,upfront:2000000,monthly:260000,owns:true};assert.deepEqual(planSchedule(offer,'2028-01-31').map(r=>r.due),['2028-01-31','2028-02-29','2028-03-31','2028-04-30']);});

test('two Operations approvals cannot replace each other and later jobs retain independent terms',async()=>{
 const f=await chosen(),results=await Promise.all([approve(f,{startDate:'2027-01-31'}),approve(f,{startDate:'2027-02-01'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const record=await f.store.get('jobs/saved-job');assert.equal(record.approval.approvedBy,'test');
 const other={...f.job,id:'another-job',quotedTotal:1200000},workspace={...f.workspace,jobs:[f.job,other]},projected=projectClientPlans(workspace,[record]);assert.equal(projected.jobs.length,2);assert.equal(projected.jobs[0].quotedTotal,5120000);assert.equal(projected.jobs[1].quotedTotal,1200000);
 const moved=projectClientPlans({...f.workspace,jobs:[{...f.job,prospectId:'another-client'}]},[record]);assert.equal(moved.jobs[0].clientPlanApproval,undefined);
});

test('approval refresh keeps unrelated unsaved work and stops when the account changes',async()=>{
 const fs=await import('node:fs/promises'),vm=await import('node:vm'),app=await fs.readFile(new URL('../app.js',import.meta.url),'utf8'),start=app.indexOf('onApproved:async function(){')+'onApproved:'.length,end=app.indexOf(',onShared:',start),source=app.slice(start,end);
 for(const changed of [false,true]){const job={id:'same',stage:'Draft',notes:'Unsaved site note',cameraCount:6},other={id:'other',notes:'Unsaved other job'},canonical={id:'same',stage:'Sent',cameraCount:4,quotedTotal:5120000,paymentSchedule:[{amount:2000000}],clientPlanApproval:{id:'approval'},fundingConfirmed:false},stored=new Map();let renders=0;const context={localUnsynced:true,userId:'ops',generation:1,sessionGeneration:1,settings:{user:{id:'ops'}},id:'same',state:{jobs:[job,other],prospects:[{note:'Unsaved follow-up'}],transactions:[{id:'old'}]},job:()=>job,readyApi:async()=>{if(changed)context.settings.user.id='other';return {data:{jobs:[canonical]}};},localStorage:{setItem:(k,v)=>stored.set(k,v)},STORAGE_KEY:'test',render:()=>renders++,loadShared:()=>{throw Error('Do not replace the whole workspace');},toast:()=>{}};
 const callback=vm.runInNewContext('('+source+')',context);await callback();assert.equal(context.state.prospects[0].note,'Unsaved follow-up');assert.equal(context.state.jobs[1],other);assert.equal(job.notes,'Unsaved site note');assert.equal(context.localUnsynced,true);assert.equal(renders,changed?0:1);assert.equal(job.cameraCount,changed?6:4);assert.equal(job.quotedTotal,changed?undefined:5120000);assert.equal(stored.size,changed?0:1);}
});

test('plan approval preserves Owner cost checks and includes the known direct cost of this job',async()=>{
 for(const reason of ['owner','direct']){const f=await fixture();if(reason==='owner')f.job.quoteSnapshot.needsApproval=true;else f.job.quoteSnapshot.direct=20000000;await f.api(f.create());await f.api({action:'choose',jobId:'saved-job',token,plan:'12months',name:'DEMO Client',confirmed:true},'');const result=await approve(f);assert.equal(result.status,409);assert.match(result.error,reason==='owner'?/Owner/:/profit target/);assert.equal((await f.store.get('jobs/saved-job')).approval,undefined);}
});

test('already completed linked jobs allow unrelated cash saves without repeating acceptance, but still guard new acceptance and date changes',async()=>{
 const f=await chosen();await approve(f);const d=projectClientPlans(f.workspace,await loadClientPlans(f.store)),j=d.jobs[0];
 const completed={...j,stage:'Installed',scheduledDate:''};
 const saved=validateQuotes([completed],[{...completed}],false,'ops@test.invalid')[0];
 assert.equal(saved.stage,'Installed');assert.equal(saved.fundingConfirmed,false);assert.deepEqual(saved.paymentSchedule,j.paymentSchedule);assert.equal(saved.quotedTotal,j.quotedTotal);
 assert.throws(()=>validateQuotes([j],[{...j,stage:'Accepted'}],false,'ops@test.invalid'),/installation date/);
 assert.throws(()=>validateQuotes([completed],[{...completed,scheduledDate:'2027-01-31'}],false,'ops@test.invalid'),/Owner/);
 assert.throws(()=>validateQuotes([completed],[{...completed,cameraCount:6}],false,'ops@test.invalid'),/approved/);
});
