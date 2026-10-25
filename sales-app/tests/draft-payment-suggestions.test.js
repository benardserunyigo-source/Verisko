import test from 'node:test';import assert from 'node:assert/strict';
import {draftPaymentSuggestion,DRAFT_SUGGESTION_TARGET} from '../draft-payment-suggestions.mjs';
import {draftCostEstimate,draftPaymentOptions} from '../draft-payment-options.mjs';
import {createDraftCostScenario} from '../draft-payment-editor.mjs';
const policy={contingency:.1,callbacks:200000,acquisition:50000,overhead:200000,processing:.03,monthly:.02};
test('each plan and package gets a verified 10k-step suggestion; deposits and other options stay unchanged',()=>{
 for(const cameras of [4,6,8,12])for(const planId of ['cash','12months','24months','rental']){
  const budget={policy:{...policy},packages:{[cameras]:{direct:2200000*cameras/4}}};
  const options=draftPaymentOptions('operations',{cameras}).map(({id,upfront,monthly})=>({id,upfront:id===planId?10000:upfront,monthly:id===planId&&id!=='cash'?10000:monthly}));
  const original=structuredClone({budget,options}),s=draftPaymentSuggestion('operations',budget,{cameras,options,planId});
  assert.equal(s.available,true);assert.ok(s.margin>=DRAFT_SUGGESTION_TARGET);assert.equal(s.upfront%10000,0);assert.equal(s.monthly%10000,0);
  const proposed=options.map(p=>p.id===planId?{id:p.id,upfront:s.upfront,monthly:s.monthly}:p),row=draftCostEstimate('operations',budget,{cameras,options:proposed}).rows.find(r=>r.id===planId);
  assert.equal(row.belowFloor,false);assert.equal(row.profit,s.profit);assert.equal(row.margin,s.margin);assert.equal(row.cost+s.profit,s.total);
  if(planId==='cash')assert.equal(s.monthly,0);else assert.equal(s.upfront,10000);
  const prior=proposed.map(p=>p.id===planId?{...p,[planId==='cash'?'upfront':'monthly']:(planId==='cash'?s.upfront:s.monthly)-10000}:p);
  assert.ok(draftCostEstimate('operations',budget,{cameras,options:prior}).rows.find(r=>r.id===planId).margin<DRAFT_SUGGESTION_TARGET);
  assert.deepEqual({budget,options},original);
 }
});
test('healthy, invalid and unauthorized cases do not offer a misleading suggestion',()=>{
 const budget={policy,packages:{4:{direct:2200000}}};
 for(const role of ['sales','teamlead','installer','unknown'])assert.equal(draftPaymentSuggestion(role,budget,{planId:'cash'}),null);
 assert.equal(draftPaymentSuggestion('operations',budget,{planId:'cash'}),null);
 assert.equal(draftPaymentSuggestion('operations',budget,{planId:'unknown'}),null);
 assert.equal(draftPaymentSuggestion('operations',{}, {planId:'cash'}),null);
 assert.equal(draftPaymentSuggestion('operations',budget,{options:[],planId:'cash'}),null);
 const expensive={policy:{...policy,processing:.8},packages:budget.packages};
 assert.equal(draftPaymentSuggestion('operations',expensive,{planId:'cash'}).available,false);
});
test('review and apply is local; reset restores saved terms and only acknowledged save becomes the new baseline',()=>{
 const budget={policy,packages:{4:{direct:2200000}}},s=createDraftCostScenario('operations',budget);
 s.updatePayment('12months','upfront','1500000');const low=s.updatePayment('12months','monthly','200000');
 assert.equal(low.options[1].monthly,200000);assert.equal(low.estimate.rows[1].belowFloor,true);const suggestion=low.suggestions['12months'];assert.equal(suggestion.available,true);
 const applied=s.applySuggestion('12months');assert.equal(applied.options[1].monthly,suggestion.monthly);assert.equal(applied.options[1].upfront,1500000);assert.equal(applied.estimate.rows[1].belowFloor,false);
 for(const i of [0,2,3])assert.deepEqual(applied.options[i],low.options[i]);assert.equal(s.reset().options[1].monthly,260000);
 s.updatePayment('12months','upfront','1500000');s.updatePayment('12months','monthly','200000');const chosen=s.applySuggestion('12months');s.accept(chosen.budget,chosen.options);s.updatePayment('12months','monthly','10000');assert.deepEqual(s.reset().options,chosen.options);
 s.update('care','');assert.deepEqual(s.read().suggestions,{});assert.equal(s.applySuggestion('12months').estimate,null);
});

test('Operations selects up to 50% for each plan including rental; suggestions respect the selected target',()=>{
 const budget={policy,packages:{4:{direct:2200000}}};for(const id of ['cash','12months','24months','rental']){
 const s=createDraftCostScenario('operations',budget),before=s.read();const raised=s.updateTarget(id,'50');assert.equal(raised.options.find(p=>p.id===id).targetMargin,.5);assert.equal(raised.estimate.rows.find(p=>p.id===id).belowTarget,true);const applied=s.applySuggestion(id);assert.ok(applied.estimate.rows.find(p=>p.id===id).margin>=.5);s.accept(applied.budget,applied.options);assert.equal(s.reset().options.find(p=>p.id===id).targetMargin,.5);assert.equal(s.updateTarget(id,'100').estimate,null);assert.ok(s.reset().estimate);for(const row of before.options.filter(p=>p.id!==id))assert.deepEqual(s.read().options.find(p=>p.id===row.id),row);
 }
});
