import test from 'node:test';import assert from 'node:assert/strict';
import {createClientPlanHandler} from '../netlify/functions/lib/client-plan-core.mjs';import {createDraftCostsHandler} from '../netlify/functions/lib/draft-costs-core.mjs';import {FieldMemoryStore} from './helpers/field-fixture.mjs';import {draftPaymentOptions} from '../draft-payment-options.mjs';import {salesDraftOffer} from '../sales-draft-offer.mjs';import {buildJobSummaries,summaryCard} from '../job-summary.mjs';import '../pricing.js';
import {fixture,token} from './helpers/client-plan-fixture.mjs';
test('same saved options become exact client choices on every package size, without private data or money updates',async()=>{
 for(const cameras of [4,6,8,12]){const f=await fixture(cameras),before=structuredClone(f.workspace),review=await f.api({action:'reviewDraft',jobId:'saved-job',draftVersion:1});assert.equal(review.status,200,review.error);assert.equal(review.review.options.filter(p=>p.eligible).length,4);const created=await f.api(f.create());assert.equal(created.status,200,created.error);const viewed=await f.api({action:'view',jobId:'saved-job',token},'');assert.equal(viewed.status,200);const saved=await f.drafts.get('jobs/saved-job');
  for(const p of viewed.offer.options){assert.deepEqual(p.offer,salesDraftOffer(saved.options.find(x=>x.id===p.id),cameras));assert.equal(p.total,p.offer.total);assert.equal(p.rows[0].amount,p.offer.upfront);if(p.offer.months)assert.equal(p.rows[1].amount,p.offer.monthly);assert.doesNotMatch(p.terms.join(' '),/60%|40%|30%|after 60 days/);}
  for(const secret of ['PRIVATE','costEvidence','costOfDoingBusiness','netProfit','targetMargin','eligible','draftVersion','tokenHash','PRIVATE PHONE','budget','financing'])assert.ok(!JSON.stringify(viewed).includes(secret),secret);
  const choice=await f.api({action:'choose',jobId:'saved-job',token,plan:'rental',name:'DEMO Client',confirmed:true},'');assert.equal(choice.status,200);assert.equal(choice.choice.offer.owns,false);assert.match(choice.choice.ownership,/Verisko owns/);assert.equal(choice.choice.totalLabel,'First 12 months');assert.deepEqual(f.workspace,before);
  const items=(await f.api(null,'operations')).items,summary=buildJobSummaries({user:{role:'operations'},data:f.workspace,clientPlans:items});assert.equal(summary[0].clientPlan.choice.plan,'rental');assert.match(summaryCard(summary[0]),/Verisko owns|First 12 months/);
 }
});
test('only offered plans may be selected, once; retries preserve the complete saved terms',async()=>{
 const f=await fixture(),cmd=f.create({optionIds:['12months','rental']});const a=await f.api(cmd),b=await f.api(cmd);assert.equal(a.status,200);assert.equal(a.item.createdAt,b.item.createdAt);assert.equal((await f.api({...cmd,optionIds:['cash']})).status,409);assert.equal((await f.api({action:'choose',jobId:'saved-job',token,plan:'cash',name:'DEMO Client',confirmed:true},'')).status,400);
 const body={action:'choose',jobId:'saved-job',token,plan:'12months',name:'DEMO Client',confirmed:true,offer:{monthly:1},total:1},choice=await f.api(body,'');assert.equal(choice.status,200);assert.equal(choice.choice.offer.monthly,260000);assert.deepEqual((await f.api(body,'')).choice,choice.choice);assert.equal((await f.api({...body,plan:'rental'},'')).status,409);assert.equal((await f.api(f.create({token:'B'.repeat(43)}))).status,409);assert.deepEqual((await f.api({action:'view',jobId:'saved-job',token},'')).choice,choice.choice);
});
test('staff review, cost evidence, saved version, current margins and offered plan checks cannot be bypassed',async()=>{
 const f=await fixture();for(const role of ['sales','teamlead','installer',''])assert.equal((await f.api(f.create(),role)).status,role?403:401);
 for(const extra of [{checked:false},{draftVersion:0},{draftVersion:undefined},{optionIds:[]},{optionIds:['rental','rental']},{optionIds:['free']}])assert.ok((await f.api(f.create(extra))).status>=400);
 f.job.costConfirmed=false;assert.equal((await f.api(f.create())).status,409);f.job.costConfirmed=true;f.job.costEvidence='';assert.equal((await f.api(f.create())).status,409);f.job.costEvidence='PRIVATE COST';
 await f.save();assert.equal((await f.api(f.create())).status,409);assert.equal(f.store.rows.size,0);
 const opts=draftPaymentOptions('operations').map(p=>({...p,targetMargin:.5}));await f.save(opts);const review=await f.api({action:'reviewDraft',jobId:'saved-job',draftVersion:3});assert.equal(review.review.options.every(p=>!p.eligible),true);assert.equal((await f.api(f.create({draftVersion:3}))).status,409);
});
test('agreed, expired-market, mismatched published and changed-client jobs are protected',async()=>{
 const f=await fixture();f.job.stage='Accepted';assert.equal((await f.api(f.create())).status,409);f.job.stage='Draft';f.market({expiresAt:'2026-10-23T00:00:00Z',catalogue:[]});assert.equal((await f.api(f.create())).status,409);
 const p=draftPaymentOptions('operations')[1];f.market({expiresAt:'2026-11-20T00:00:00Z',catalogue:[{cameras:4,offer:{...salesDraftOffer(p),monthly:300000}}],sourceApprovals:{4:{jobId:'saved-job'}}});const review=await f.api({action:'reviewDraft',jobId:'saved-job'});assert.equal(review.review.options.find(p=>p.id==='12months').eligible,false);assert.equal((await f.api(f.create())).status,409);
 f.market(null);f.job.prospectId='other';assert.equal((await f.api(f.create())).status,409);
});
test('issued quote is frozen when the draft changes; expiry, revoke and changed job invalidate links',async()=>{
 const f=await fixture();await f.api(f.create());const first=await f.api({action:'view',jobId:'saved-job',token},'');await f.save(draftPaymentOptions('operations').map(p=>p.id==='12months'?{...p,monthly:300000,total:p.upfront+300000*12}:p));assert.deepEqual((await f.api({action:'view',jobId:'saved-job',token},'')).offer,first.offer);
 f.time('2026-11-01T18:00:00Z');assert.equal((await f.api({action:'view',jobId:'saved-job',token},'')).status,410);f.time('2026-10-24T18:00:00Z');await f.api({action:'revoke',jobId:'saved-job'});assert.equal((await f.api({action:'view',jobId:'saved-job',token},'')).status,410);
 await f.api(f.create({draftVersion:2,token:'B'.repeat(43)}));f.job.cameraCount=6;assert.equal((await f.api({action:'view',jobId:'saved-job',token:'B'.repeat(43)},'')).status,410);
});
