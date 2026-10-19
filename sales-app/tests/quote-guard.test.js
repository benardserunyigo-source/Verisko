import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pricing,VERSION,packages,policy,inputs} from '../netlify/functions/lib/pricing-policy.mjs';
import {validateQuotes,contextFor} from '../netlify/functions/lib/quote-guard.mjs';
import {buildTables} from '../netlify/functions/export.mjs';
import '../quote-pdf.js';
const now='2026-10-18T21:00:00Z';
const base=extra=>({id:'audit-only',stage:'Draft',pricingVersion:VERSION,cameraCount:6,installationType:'Simple',
  addons:{},zone:'1',directCost:'',extraMaterialsCost:'',extraCrewCost:'',extraAccessTravelCost:'',
  costConfirmed:true,costEvidence:'Supplier PI + measured site survey in evidence folder',paymentPlan:'installments',...extra});
const save=(j,stored=[],admin=false,date=now)=>validateQuotes(stored,[j],admin,admin?'owner@test':'ops@test',date)[0];

test('USD rate changes imported costs only and public assets contain no private budget',()=>{
  assert.equal(policy.fx,4300);
  const p=packages[6];
  assert.ok(Math.abs(p.direct-(p.importedUsd*4300+p.local+p.crew+p.pickup))<.01);
  const ctx=vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('../price-catalogue.js',import.meta.url),'utf8'),ctx);
  vm.runInContext(fs.readFileSync(new URL('../pricing.js',import.meta.url),'utf8'),ctx);
  assert.equal(Object.keys(ctx.VeriskoPricing.packages).length,0);
  assert.equal(ctx.VeriskoPricing.publicPackages()[1].price,6740000);
  assert.doesNotMatch(JSON.stringify(ctx.VeriskoPriceCatalogue),/direct|overhead|profit|margin|importedUsd|crew/i);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.VeriskoPriceCatalogue.catalogue)),pricing.publicPackages());
});

test('server replaces manipulated snapshots and rejects version, count and zero-cost bypasses',()=>{
  const valid=save(base({quoteSnapshot:{cash:1,margin:1,costOfDoingBusiness:0},quotedTotal:1}));
  assert.equal(valid.quotedTotal,6740000);
  assert.equal(valid.quoteSnapshot.cash,6740000);
  assert.throws(()=>save(base({pricingVersion:''})),/current pricing/);
  assert.throws(()=>save(base({cameraCount:2})),/4, 6, 8 or 12/);
  assert.throws(()=>save(base({directCost:0})),/greater than zero/);
  assert.throws(()=>save(base({addons:{fake:1}})),/supported/);
  assert.throws(()=>save(base({priceOverride:true,finalPrice:4000000})),/26%/);
});

test('cost reductions and discounts require real Owner approval tied to scope and evidence',()=>{
  const j=base({directCost:3000000});
  j.costApprovalKey=pricing.compute(j,contextFor(j)).approvalKeyRequired;
  const forged=save(j);
  assert.equal(forged.costApprovalKey,'');
  assert.equal(forged.quoteSnapshot.needsApproval,true);
  assert.throws(()=>save({...j,stage:'Sent'}),/Owner approval/);
  const approved=save(j,[],true);
  assert.equal(approved.costApprovedBy,'owner@test');
  assert.equal(save({...approved,stage:'Sent'},[approved]).quoteSnapshot.needsApproval,false);
  assert.throws(()=>save({...approved,stage:'Sent',costEvidence:'different evidence'},[approved]),/Owner approval/);
  assert.throws(()=>save(base({stage:'Sent',discountPct:4})),/Owner approval/);
});

test('evidence is required to issue; expired quotes do not block unrelated saves',()=>{
  assert.throws(()=>save(base({stage:'Sent',costConfirmed:false})),/Confirm supplier/);
  const sent=save(base({stage:'Sent'}));
  const retained=save({...sent,notes:'Phone follow-up'},[sent],false,'2026-11-01T00:00:00Z');
  assert.equal(retained.validUntil,'2026-10-25');
  assert.throws(()=>save({...sent,stage:'Accepted',scheduledDate:'2026-11-02',fundingConfirmed:true},[sent],true,'2026-11-01T00:00:00Z'),/expired/);
  const renewed=save({...sent,renewQuote:true},[sent],false,'2026-11-01T00:00:00Z');
  assert.equal(renewed.quotedAt,'2026-11-01');assert.equal(renewed.validUntil,'2026-11-08');
});

test('accepted jobs require funding/date and preserve prices, schedules and audit metadata',()=>{
  assert.throws(()=>save(base({stage:'Accepted',scheduledDate:'2026-10-24',fundingConfirmed:true})),/Owner/);
  const accepted=save(base({stage:'Accepted',scheduledDate:'2026-10-24',fundingConfirmed:true}),[],true);
  assert.deepEqual(accepted.paymentSchedule.map(r=>r.due),['2026-10-24','2026-11-23','2026-12-23']);
  assert.deepEqual(accepted.paymentSchedule.map(r=>r.amount),[2700000,2020000,2020000]);
  const changed=save({...accepted,stage:'Installed',quoteSnapshot:{cash:1},quotedTotal:1,paymentSchedule:[],fundingApprovedBy:'fake'},[accepted]);
  assert.equal(changed.quotedTotal,6740000);
  assert.equal(changed.paymentSchedule.length,3);
  assert.equal(changed.fundingApprovedBy,'owner@test');
  assert.throws(()=>save({...accepted,cameraCount:8},[accepted],true),/locked/);
  assert.equal(validateQuotes([accepted],[],false,'ops@test')[0].id,accepted.id,'accepted records cannot be erased');
});

test('non-HDD add-on costs are required and added once',()=>{
  const j=base({addons:{pole:2},extraMaterialsCost:100000,extraCrewCost:0,extraAccessTravelCost:0});
  assert.throws(()=>save(j),/purchase and fitting cost/);
  const r=save({...j,addonCosts:{pole:120000}}).quoteSnapshot;
  assert.ok(Math.abs(r.direct-packages[6].direct-220000)<.01);
  assert.ok(r.margin>=.30);
});

test('exports use the quoted total and approved receipts, never a zero manual-override field',()=>{
  const j=save(base({finalPrice:0}));
  const table=buildTables({jobs:[j],transactions:[{installId:j.id,direction:'in',status:'approved',amount:2700000},{installId:j.id,direction:'in',status:'pending',amount:500000}]}).jobs[0];
  assert.equal(table.final_price,'6740000');assert.equal(table.quoted_total,'6740000');
  assert.equal(table.approved_receipts,'2700000');assert.equal(table.outstanding,'4040000');
  assert.ok(Number(table.planned_profit_before_tax)>2000000);
});

test('customer quote keeps the original issue date, seven-day validity and selected plan without internal numbers',()=>{
  const j=save(base({stage:'Accepted',scheduledDate:'2026-10-24',fundingConfirmed:true}),[],true);
  const m=globalThis.VeriskoQuote.buildQuoteModel(j,{business:'TEST'},j.quoteSnapshot,{date:'2026-12-01'});
  assert.equal(m.date,'2026-10-18');assert.equal(m.validUntil,'2026-10-25');assert.equal(m.plans.length,1);
  assert.equal(m.items.reduce((s,i)=>s+i.amount,0),m.total);
  assert.match(m.plans[0].rows[1].label,/2026-11-23/);
  assert.doesNotMatch(JSON.stringify(m),/netProfit|costOfDoingBusiness|4300|30% target|overhead|costEvidence/);
});
test('a draft without an installation date still shows its installment amounts',()=>{
  const j=save(base());
  assert.deepEqual(j.paymentSchedule,[]);
  const m=globalThis.VeriskoQuote.buildQuoteModel(j,{},j.quoteSnapshot,{});
  assert.deepEqual(m.plans[0].rows.map(r=>r.amount),[2700000,2020000,2020000]);
});
test('Operations summary follows the selected cash plan',()=>{
  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const start=app.indexOf('  function quoteSummaryHtml('),end=app.indexOf('  function recalcQuoteForm()',start);
  const ctx=vm.createContext({money:n=>String(n),esc:s=>s});
  vm.runInContext(app.slice(start,end),ctx);
  const r=pricing.compute(base({paymentPlan:'cash'}));
  const html=ctx.quoteSummaryHtml(r);
  assert.match(html,/Before installation/);assert.match(html,/4040000/);assert.match(html,/On completion/);
  assert.doesNotMatch(html,/After 30 days/);
});
