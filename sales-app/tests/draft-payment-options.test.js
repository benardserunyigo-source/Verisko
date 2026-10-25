import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {draftPaymentOptions,draftComparisonHtml,draftCostEstimate} from '../draft-payment-options.mjs';
import {journeyFixture} from './helpers/journey-fixture.mjs';
const sampleBudget={policy:{contingency:.1,callbacks:200000,acquisition:50000,overhead:200000,processing:.03,monthly:.02},packages:{4:{direct:2200000}}};
test('four draft plans reconcile their upfront, monthly and total in 10k increments',()=>{
 const rows=draftPaymentOptions('operations');assert.equal(rows.length,4);
 assert.deepEqual(rows.map(p=>p.total),[4700000,5120000,5600000,5120000]);
 for(const p of rows){assert.equal(p.total,p.upfront+p.monthly*p.months);assert.ok(p.draft);for(const v of [p.upfront,p.monthly,p.total])assert.equal(v%10000,0);}
 assert.equal(rows[3].owns,false);assert.equal(rows[3].months,12);
});
test('estimated costs reconcile once with fees, reserves and compounded negative-cash financing',()=>{
 const estimate=draftCostEstimate('operations',sampleBudget),base=2870000;
 assert.equal(estimate.rows.length,4);
 for(const [i,p] of draftPaymentOptions('operations').entries()){
  const r=estimate.rows[i],loss=(p.total-p.upfront)*(i===2?.06:p.months?.03:0);
  let cash=-base,interest=0;
  if(p.months){interest=-cash*.02;cash-=interest;cash+=p.upfront*.97-loss;for(let n=0;n<p.months;n++){const charge=Math.max(0,-cash)*.02;interest+=charge;cash+=p.monthly*.97-charge;}}
  assert.equal(r.base,base);assert.equal(r.cost,Math.round(base+p.total*.03+loss+interest));assert.equal(r.cost+r.profit,p.total);assert.equal(r.belowFloor,r.margin<.26);
 }
 assert.equal(estimate.rows[0].financing,0);assert.equal(estimate.rows[0].loss,0);
 assert.equal(estimate.rows[1].cost,estimate.rows[3].cost);
 assert.deepEqual(sampleBudget.packages,{4:{direct:2200000}});
});
test('margin floor uses unrounded margin; a one-shilling shortfall is flagged and never changes a price',()=>{
 const exact={policy:{contingency:0,callbacks:0,acquisition:0,overhead:0,processing:0,monthly:0},packages:{4:{direct:3478000}}};
 assert.equal(draftCostEstimate('operations',exact).rows[0].belowFloor,false);
 const low=structuredClone(exact);low.packages[4].direct++;
 const r=draftCostEstimate('operations',low).rows[0];assert.equal(r.belowFloor,true);
 const html=draftComparisonHtml('operations',{pricing:low});assert.match(html,/Pay in full: Below 26%/);assert.match(html,/&lt;26%/);assert.match(html,/Prices have not been changed/);
 assert.equal(draftPaymentOptions('operations')[0].total,4700000);
});
test('unavailable or invalid private costs fail closed, not zero or fictional profit',()=>{
 for(const input of [undefined,{}, {policy:sampleBudget.policy}, {...sampleBudget,packages:{4:{direct:NaN}}}, {...sampleBudget,policy:{...sampleBudget.policy,processing:1}}, {...sampleBudget,policy:{...sampleBudget.policy,callbacks:''}}, {...sampleBudget,policy:{...sampleBudget.policy,monthly:Infinity}}]){
  assert.equal(draftCostEstimate('operations',input),null);assert.match(draftComparisonHtml('operations',{pricing:input}),/Cost and profit unavailable/);
 }
 for(const role of ['sales','teamlead','installer',undefined]){assert.equal(draftCostEstimate(role,sampleBudget),null);assert.doesNotMatch(draftComparisonHtml(role,{pricing:sampleBudget}),/Estimated profit/);}
 const html=draftComparisonHtml('operations',{preview:true});assert.match(html,/Preview figures are made up/);assert.match(html,/Fictional preview/);assert.equal(draftCostEstimate('operations',undefined),null);
});
test('real handlers supply private cost inputs only to office roles and GET never mutates records',async()=>{
 const f=await journeyFixture(),before=await f.raw();
 for(const role of ['sales','teamlead','installer']){const response=await f.ok('data',role);assert.equal(response.pricing,undefined);assert.equal(draftCostEstimate(role,response.pricing),null);}
 for(const role of ['operations','admin']){const response=await f.ok('data',role);const pricing={policy:response.pricing.policy,packages:response.pricing.packages};for(const cameras of [4,6,8,12]){assert.ok(response.pricing?.packages?.[cameras]);assert.equal(draftCostEstimate(role,pricing,{cameras}).rows.length,4);}}
 assert.equal((await f.api('data','unsigned')).status,401);assert.deepEqual(await f.raw(),before);
});
test('draft review is office-only and cannot alter current customer prices or quote rules',()=>{
 const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../navigation.js',import.meta.url),'utf8'),context);
 for(const role of ['admin','operations']){assert.equal(context.VeriskoNavigation.allowed(role,'draftplans'),true);assert.equal(draftPaymentOptions(role).length,4);}
 for(const role of ['sales','teamlead','installer',undefined,'supervisor']){assert.equal(context.VeriskoNavigation.allowed(role,'draftplans'),false);assert.deepEqual(draftPaymentOptions(role),[]);assert.match(draftComparisonHtml(role),/access needed/);}
 const pricing=fs.readFileSync(new URL('../price-catalogue.js',import.meta.url),'utf8');vm.runInContext(pricing,context);
 assert.deepEqual(Array.from(context.VeriskoPriceCatalogue.catalogue,p=>p.price),[5280000,6740000,8180000,11640000]);
 const before=JSON.stringify(context.VeriskoPriceCatalogue);draftComparisonHtml('operations');assert.equal(JSON.stringify(context.VeriskoPriceCatalogue),before);
 const code=fs.readFileSync(new URL('../draft-payment-options.mjs',import.meta.url),'utf8');assert.doesNotMatch(code,/fetch\(|localStorage|sessionStorage|VeriskoPricing|VeriskoPriceCatalogue|private-budget|quoteSnapshot/);
});
test('rental is not an ownership plan or misleading lifetime total; costs and profit stay unconfirmed',()=>{
 const html=draftComparisonHtml('admin');assert.match(html,/Do not send to a client/);assert.match(html,/Paid in the first 12 months/);assert.match(html,/not refundable/);assert.match(html,/Monthly rent does not buy/);assert.match(html,/Profit is not confirmed/);assert.match(html,/26%/);assert.match(html,/camera price, mini PC and support costs still need checking/);assert.doesNotMatch(html,/<button|<input|<form|<a /);
});

test('4, 6, 8 and 12-camera draft comparisons keep the four-camera terms and round larger samples to 10k',()=>{
 const original=structuredClone(sampleBudget);
 for(const cameras of [4,6,8,12]){
  const plans=draftPaymentOptions('operations',{cameras});assert.equal(plans.length,4);
  assert.equal(plans[0].total,Math.ceil(4700000*cameras/4/10000)*10000);
  for(const p of plans){assert.equal(p.total,p.upfront+p.months*p.monthly);for(const n of [p.upfront,p.monthly,p.total])assert.equal(n%10000,0);}
  const pricing={policy:sampleBudget.policy,packages:{[cameras]:{direct:2200000*cameras/4}}};
  const estimate=draftCostEstimate('operations',pricing,{cameras});assert.equal(estimate.rows.length,4);estimate.rows.forEach((r,i)=>assert.equal(r.cost+r.profit,plans[i].total));
  const html=draftComparisonHtml('operations',{pricing,cameras});assert.match(html,new RegExp('Same '+cameras+'-camera job'));assert.match(html,new RegExp((cameras<=8?8:16)+'-channel recorder'));assert.match(html,new RegExp(cameras*50+' metres of cable'));if(cameras>4)assert.match(html,/Larger-job sample prices/);
  const exact={policy:{contingency:0,callbacks:0,acquisition:0,overhead:0,processing:0,monthly:0},packages:{[cameras]:{direct:plans[0].total*.74}}};assert.equal(draftCostEstimate('operations',exact,{cameras}).rows[0].belowFloor,false);exact.packages[cameras].direct++;assert.equal(draftCostEstimate('operations',exact,{cameras}).rows[0].belowFloor,true);
 }
 for(const cameras of [0,5,7,9,16,NaN,'6']){assert.deepEqual(draftPaymentOptions('operations',{cameras}),[]);assert.equal(draftCostEstimate('operations',sampleBudget,{cameras,preview:true}),null);}
 assert.deepEqual(sampleBudget,original);assert.equal(draftCostEstimate('operations',sampleBudget,{cameras:6}),null);
});
