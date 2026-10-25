import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createDraftCostScenario,mountDraftPaymentEditor} from '../draft-payment-editor.mjs';
import {draftComparisonHtml,draftPaymentOptions} from '../draft-payment-options.mjs';
const pricing={policy:{contingency:.1,callbacks:200000,acquisition:50000,overhead:200000,processing:.03,monthly:.02},packages:{4:{direct:2200000}}};
test('editing one draft cost updates every plan, flags one below 26%, and never mutates saved inputs or prices',()=>{
 const original=structuredClone(pricing),prices=draftPaymentOptions('operations'),scenario=createDraftCostScenario('operations',pricing),before=scenario.read();
 const after=scenario.update('direct','2,630,000');assert.equal(after.estimate.rows.filter(r=>r.belowFloor).length,1);assert.equal(after.estimate.rows[0].belowFloor,true);
 after.estimate.rows.forEach((r,i)=>{assert.ok(r.cost>before.estimate.rows[i].cost);assert.ok(r.profit<before.estimate.rows[i].profit);assert.equal(r.cost+r.profit,prices[i].total);});
 assert.deepEqual(pricing,original);assert.deepEqual(draftPaymentOptions('operations'),prices);
 assert.deepEqual(scenario.reset(),before);
});
test('care and business costs replace their existing allowances once; rates stay fixed',()=>{
 const s=createDraftCostScenario('admin',pricing);s.update('care','250000');const r=s.update('business','300000');
 assert.equal(r.budget.policy.callbacks,250000);assert.equal(r.budget.policy.acquisition+r.budget.policy.overhead,300000);
 assert.equal(r.estimate.rows[0].base,2970000);assert.equal(r.estimate.processing,.03);assert.equal(r.estimate.monthly,.02);
 s.update('care','0');assert.equal(s.update('business','0').estimate.rows[0].base,2420000);
});
test('blank, negative, fractional, unsafe and malformed values hide profit instead of showing zero or stale results',()=>{
 for(const value of ['', ' ', '-1','1.5','1e6','2,63,000','NaN','Infinity','9007199254740992','<script>']){
  const s=createDraftCostScenario('operations',pricing),r=s.update('direct',value);assert.equal(r.estimate,null);assert.equal(r.budget,null);assert.ok(r.errors.direct);
  const html=draftComparisonHtml('operations',{preview:true,scenario:r.budget,costError:true});assert.match(html,/Cost and profit unavailable/);assert.match(html,/Check the cost fields above/);assert.doesNotMatch(html,/Connect and refresh|35.94%/);
  assert.ok(s.update('direct','2630000').estimate);
 }
 for(const key of ['direct','care','business']){const s=createDraftCostScenario('operations',pricing);assert.equal(s.update(key,'').estimate,null);}
 assert.equal(createDraftCostScenario('operations',pricing).update('direct','0').estimate,null);
});
test('new sessions reset draft scenarios; unsupported keys, stopped editors and other roles cannot change a scenario',()=>{
 const a=createDraftCostScenario('operations',pricing),b=createDraftCostScenario('operations',pricing);a.update('direct','2630000');assert.notDeepEqual(a.read().estimate,b.read().estimate);
 const original=b.read();assert.deepEqual(b.update('__proto__','1'),original);assert.deepEqual(b.update('processing','0'),original);
 a.stop();assert.equal(a.read().estimate,null);assert.equal(a.update('direct','1').available,false);
 for(const role of ['sales','teamlead','installer',undefined]){const s=createDraftCostScenario(role,pricing,{preview:true});assert.equal(s.read().available,false);const host={innerHTML:''};mountDraftPaymentEditor({host,user:{role},pricing});assert.match(host.innerHTML,/access needed/);assert.doesNotMatch(host.innerHTML,/<input/);}
});
test('missing budget does not get substituted; preview edits stay fictional and separate from real inputs',()=>{
 const s=createDraftCostScenario('operations',{});assert.equal(s.read().available,false);assert.equal(s.update('direct','1').estimate,null);
 const p=createDraftCostScenario('operations',{}, {preview:true});assert.ok(p.read().estimate);assert.equal(p.update('direct','2630000').estimate.rows[0].belowFloor,true);
 const html=draftComparisonHtml('operations',{preview:true,scenario:p.read().budget});assert.match(html,/Fictional preview/);assert.match(html,/25.87%/);
});
test('editor has no network or storage writes, and preview exception is scoped to local calculator controls',()=>{
 const code=fs.readFileSync(new URL('../draft-payment-editor.mjs',import.meta.url),'utf8');assert.doesNotMatch(code,/fetch\(|localStorage|sessionStorage|indexedDB|quoteSnapshot|private-budget/);
 const preview=fs.readFileSync(new URL('../role-preview.js',import.meta.url),'utf8');assert.match(preview,/var allowed='[^']*\[data-draft-reset\]/);assert.match(preview,/el\.matches\('\[data-draft-job\],\[data-draft-cost\]/);
});

test('acknowledged saved costs become the reset baseline without changing the company budget',()=>{
 const original=structuredClone(pricing),s=createDraftCostScenario('operations',pricing);s.update('direct','2630000');const saved=structuredClone(s.read().budget);s.accept(saved);s.update('care','300000');const reset=s.reset();assert.equal(reset.budget.packages[4].direct,2630000);assert.equal(reset.budget.policy.callbacks,200000);assert.deepEqual(pricing,original);
});

test('each camera package edits and resets only its own costs, keeping terms fixed',()=>{
 for(const cameras of [4,6,8,12]){
  const pricing={policy:{contingency:.1,callbacks:200000,acquisition:50000,overhead:200000,processing:.03,monthly:.02},packages:{[cameras]:{direct:cameras*500000}}},original=structuredClone(pricing),s=createDraftCostScenario('operations',pricing,{cameras});
  assert.equal(s.read().fields.direct,String(cameras*500000));const changed=s.update('direct',String(cameras*1000000));assert.equal(changed.estimate.rows.length,4);assert.equal(changed.estimate.rows.every(r=>r.belowFloor),true);s.accept(changed.budget);s.update('direct','1');assert.equal(s.reset().fields.direct,String(cameras*1000000));assert.deepEqual(pricing,original);
 }
 assert.equal(createDraftCostScenario('operations',pricing,{cameras:12}).read().available,false);
});

test('payment edits update profits, reset to acknowledged terms, and do not change other job scenarios',()=>{
 for(const cameras of [4,6,8,12]){
  const budget={...pricing,packages:{[cameras]:{direct:2200000*cameras/4}}},a=createDraftCostScenario('operations',budget,{cameras}),b=createDraftCostScenario('operations',budget,{cameras}),start=a.read();
  a.updatePayment('12months','upfront','0');const lower=a.updatePayment('12months','monthly','10000');assert.equal(lower.estimate.rows[1].belowFloor,true);assert.ok(lower.estimate.rows[1].financing>start.estimate.rows[1].financing);assert.equal(lower.options[1].total,120000);assert.deepEqual(b.read(),start);
  a.accept(lower.budget,lower.options);a.updatePayment('12months','monthly','999999');assert.ok(a.read().paymentErrors['12months-monthly']);assert.equal(a.read().estimate,null);assert.equal(a.reset().options[1].monthly,10000);assert.equal(a.read().options[1].upfront,0);
  assert.deepEqual(a.updatePayment('fake','upfront','1'),a.read());
 }
});
test('blank and malformed payment fields hide totals and profit until fixed',()=>{
 for(const value of ['', ' ', '-10000','1.5','1e6','5,00,000','1000','5000','Infinity','9007199254740992']){
  const s=createDraftCostScenario('operations',pricing),r=s.updatePayment('12months','monthly',value);assert.equal(r.estimate,null);assert.equal(r.options,null);assert.ok(r.paymentErrors['12months-monthly']);
  const html=draftComparisonHtml('operations',{pricing,scenario:r.budget,planError:true});assert.match(html,/Check the draft payment amounts/);assert.doesNotMatch(html,/35.94%|5,120,000/);assert.ok(s.updatePayment('12months','monthly','260000').estimate);
 }
});
