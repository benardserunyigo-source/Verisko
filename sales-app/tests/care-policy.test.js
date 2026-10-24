import test from 'node:test';
import assert from 'node:assert/strict';
import '../care-policy.js';
import '../quote-pdf.js';
import {pricing,VERSION} from '../netlify/functions/lib/pricing-policy.mjs';
import {validateQuotes} from '../netlify/functions/lib/quote-guard.mjs';
const C=globalThis.VeriskoCare, PDF=globalThis.VeriskoQuote;
const quote=(extra={})=>({id:'care-test-only',stage:'Draft',pricingVersion:VERSION,servicePolicyVersion:C.VERSION,cameraCount:6,zone:'1',addons:{},
  paymentPlan:'installments',costConfirmed:true,costEvidence:'Test reference: existing callback budget covers mini PC and full care commitment',...extra});
const save=(j,stored=[],admin=true)=>validateQuotes(stored,[j],admin,'qa-owner@example.invalid','2026-10-18T20:00:00Z')[0];

test('care is included once in the existing callback budget, with unchanged prices and planned profit',()=>{
  for(const cameraCount of [4,6,8,12]){
    const a=pricing.compute({cameraCount}), b=pricing.compute(quote({cameraCount}));
    assert.equal(b.cash,a.cash);assert.equal(b.costOfDoingBusiness,a.costOfDoingBusiness);assert.equal(b.netProfit,a.netProfit);
    assert.equal(b.fundingRequired-b.direct,pricing.policy.callbacks);
    assert.equal(b.lines.some(l=>/monitor|callback|warranty/i.test(l.label)),false,'no separately charged add-on');
  }
});

test('coverage dates span 12 and 24 calendar months, including leap days',()=>{
  const c=C.schedule(quote({serviceStartDate:'2028-02-29'}));
  assert.equal(c.callbackEnd,'2029-02-28');assert.equal(c.monitoringEnd,'2029-02-28');assert.equal(c.warrantyEnd,'2030-02-28');
  assert.equal(C.addMonths('2026-02-31',12),'');
});

test('customer PDF and share text include the mini PC, privacy and faults-only warranty without new charges',()=>{
  const j=save(quote()),r=j.quoteSnapshot,m=PDF.buildQuoteModel(j,{business:'Test client'},r,{});
  assert.equal(m.total,6740000);assert.equal(m.items.length,1);
  const text=m.terms.join(' ');
  assert.match(text,/12 months of callbacks/);assert.match(text,/on-site mini PC/);assert.match(text,/does not give Verisko access/);
  assert.match(text,/2 years/);assert.match(text,/faulty cameras and faulty installed cables/);assert.match(text,/power-surge damage are excluded/);
  assert.match(PDF.quoteShareText(m),/2-year replacement warranty/);
  assert.doesNotMatch(JSON.stringify(m),/costOfDoingBusiness|netProfit|costEvidence|fundingGap|callback.*170000/);
});

test('handover requires a real date, mini PC reference and recorded alert test, including after acceptance',()=>{
  const accepted=save(quote({stage:'Installed',scheduledDate:'2026-10-18',fundingConfirmed:true}));
  assert.throws(()=>save({...accepted,stage:'Handed over'},[accepted]),/actual installation|mini PC|alert test|handover checks|representative/);
  const ready={...accepted,checklist:{cameras:true,tested:true,remote:true,trained:true,credentials:true},clientHandover:{name:'TEST Client',role:'Client / owner',date:'2026-10-18',method:'Signed form',reference:'TEST form',confirmed:true},stage:'Handed over',serviceStartDate:'2026-10-18',monitoringMiniPcRef:'QA-BOX-1',monitoringCommissioned:true,monitoringTestEvidence:'QA-only offline / reporting test reference'};
  const handed=save(ready,[accepted]);
  assert.equal(handed.careSchedule.monitoringStatus,'Test recorded');
  assert.equal(handed.careSchedule.callbackEnd,'2027-10-18');assert.equal(handed.careSchedule.warrantyEnd,'2028-10-18');
  assert.throws(()=>save({...ready,serviceStartDate:'2026-10-19'},[accepted]),/future/);
  assert.throws(()=>save({...handed,serviceStartDate:'2026-10-17'},[handed],false),/Owner/);
});

test('the software does not mark a site as monitored merely because a package was accepted',()=>{
  const j=save(quote({stage:'Accepted',scheduledDate:'2026-10-18',fundingConfirmed:true}));
  assert.equal(j.careSchedule.monitoringStatus,'Activation test pending');
  assert.equal(j.careSchedule.start,'');
});

test('existing accepted contracts retain their original coverage and quotes require the current terms',()=>{
  const r=pricing.compute({cameraCount:6});
  const old={id:'agreed-old',stage:'Accepted',pricingVersion:VERSION,cameraCount:6,quoteSnapshot:r};
  const retained=save({...old,stage:'Installed'},[old]);
  assert.equal(retained.careSchedule,null);assert.deepEqual(retained.quoteSnapshot,r);
  assert.equal(PDF.buildQuoteModel(retained,{},r,{}).coverageSummary,'');
  assert.throws(()=>save(quote({servicePolicyVersion:''})),/coverage/);
});
