import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../pricing.js';
import '../quote-pdf.js';
import { guardCrewApprovals } from '../netlify/functions/crew-approval.mjs';
const P = globalThis.VeriskoPricing, PDF = globalThis.VeriskoQuote;
const q = (cameraCount, extras = {}, context = {}) => P.compute({ cameraCount, ...extras }, context);

test('Sales catalogue exposes only package prices, scope and installments', () => {
  const list = P.publicPackages();
  assert.deepEqual(list.map(p=>p.cameras),[4,6,8,12]);
  assert.deepEqual(list.map(p=>p.price),[4920000,6280000,7620000,10830000]);
  for(const row of list) {
    assert.deepEqual(Object.keys(row).sort(),['cameras','name','payments','price','recorderChannels'].sort());
    assert.equal(row.payments.reduce((s,n)=>s+n,0),row.price);
  }
  assert.doesNotMatch(JSON.stringify(list),/cost|profit|margin|fee|direct|overhead/i);
  const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const start=app.indexOf('  function renderPackagePrices()'),end=app.indexOf('  async function renderApplications()',start);
  const ctx=vm.createContext({window:{VeriskoPricing:P},content:{innerHTML:''},setHead(){},esc:s=>s,money:n=>'UGX '+n.toLocaleString('en-US')});
  vm.runInContext(app.slice(start,end),ctx);ctx.renderPackagePrices();
  assert.match(ctx.content.innerHTML,/6,280,000/);assert.match(ctx.content.innerHTML,/10,830,000/);
  assert.doesNotMatch(ctx.content.innerHTML,/Cost of doing business|net profit|26%|margin/i);
});

test('four approved packages reconcile to the cost workbook and exceed 26%', () => {
  const controls = [[4,4920000,1284093.1872947305],[6,6280000,1633984.3163887504],[8,7620000,1985335.44548277],[12,10830000,2820732.607897452]];
  for (const [count, price, profit] of controls) {
    const r = q(count);
    assert.equal(r.cash, price); assert.ok(Math.abs(r.netProfit - profit) < .01);
    assert.equal(r.cash, r.costOfDoingBusiness + r.netProfit);
    assert.ok(r.margin > .26); assert.equal(r.financed, r.cash);
    assert.equal(r.payments.reduce((a,b) => a+b,0), price);
    r.payments.forEach(p => assert.equal(p % 10000, 0));
    assert.equal(r.recorderChannels, count <= 8 ? 8 : 16);
    assert.equal(r.cableMetres, count * 50); assert.equal(r.crew, count >= 6 ? 400000 : 350000);
    assert.deepEqual(r.errors, []);
  }
});

test('two installation types use measured costs once, not an arbitrary complex surcharge', () => {
  const empty={extraMaterialsCost:'',extraCrewCost:'',extraAccessTravelCost:''};
  assert.deepEqual(q(6,{installationType:'Simple',...empty}).errors,[]);
  assert.ok(q(6,{installationType:'Complex',...empty}).errors.length);
  const r=q(6,{installationType:'Complex',extraCost:999999,extraMaterialsCost:200000,extraCrewCost:0,extraAccessTravelCost:100000});
  assert.equal(r.tier,'Complex');assert.equal(r.extraCost,300000);
  assert.equal(r.cash,6760000);assert.ok(r.margin>=.26);assert.deepEqual(r.errors,[]);
  assert.equal(r.needsApproval,false);
  assert.equal(q(6,{installationType:'Complex',extraMaterialsCost:0,extraCrewCost:0,extraAccessTravelCost:0}).cash,6280000);
  assert.equal(q(6,{}, {tier:'Standard'}).tier,'Simple');
  assert.equal(q(6,{}, {tier:'Very Complex'}).tier,'Complex');
});

test('extra crew needs Owner approval tied to the package and amount', () => {
  const input={installationType:'Complex',extraMaterialsCost:0,extraCrewCost:100000,extraAccessTravelCost:0};
  const r=q(6,input);assert.equal(r.crew,500000);assert.equal(r.needsApproval,true);
  assert.equal(q(6,{...input,crewApprovalKey:r.crewApprovalKeyRequired}).needsApproval,false);
  assert.equal(q(8,{...input,crewApprovalKey:r.crewApprovalKeyRequired}).needsApproval,true);
  const job={id:'test',pricingVersion:P.VERSION,cameraCount:6,extraCrewCost:100000,stage:'Draft',crewApprovalKey:'6:100000',quoteSnapshot:{needsApproval:false}};
  const ops=guardCrewApprovals([], [job],false,'ops@test')[0];
  assert.equal(ops.crewApprovalKey,'');assert.equal(ops.quoteSnapshot.needsApproval,true);
  assert.throws(()=>guardCrewApprovals([], [{...job,stage:'Sent'}],false,'ops@test'),/Owner approval/);
  const owner=guardCrewApprovals([], [job],true,'owner@test','2026-10-18T20:00:00Z')[0];
  assert.equal(owner.crewApprovedBy,'owner@test');assert.equal(owner.quoteSnapshot.needsApproval,false);
  const reused=guardCrewApprovals([owner],[{...owner,stage:'Sent',crewApprovedBy:'fake@test'}],false,'ops@test')[0];
  assert.equal(reused.crewApprovedBy,'owner@test');
  assert.throws(()=>guardCrewApprovals([owner],[{...owner,stage:'Sent',extraCrewCost:200000}],false,'ops@test'),/Owner approval/);
});

test('all storage options, higher site costs and travel preserve the job margin', () => {
  for (const count of [4,6,8,12]) for (const storage of ['hdd2tb','hdd4tb','hdd6tb']) {
    const r = q(count, { addons: { [storage]: true }, extraCost: 280000 }, { tier: 'Complex', zone: { surcharge: 50000 }, lines: [{ key:'pole', label:'Pole', qty:1, price:130000, total:130000 }] });
    assert.deepEqual(r.errors, []); assert.ok(r.margin >= .26);
    assert.equal(r.base+r.lines.reduce((s,l)=>s+l.total,0)+r.zone.surcharge, r.cash);
    assert.ok(r.cash > q(count).cash);
  }
  assert.ok(q(6, { directCost: 7000000 }).margin >= .26);
});

test('unconfirmed extra costs, conflicting drives, discounts and overrides cannot pass', () => {
  assert.ok(q(6, {}, { tier:'Complex' }).errors.length);
  assert.ok(q(6, {}, { lines:[{ key:'tv32', label:'TV', qty:1, total:550000 }] }).errors.length);
  assert.ok(q(6, { addons:{ hdd2tb:true,hdd4tb:true } }).errors.length);
  assert.ok(q(6, { discountPct:5 }).errors.some(e=>e.includes('26%')));
  assert.ok(q(6, { priceOverride:true, finalPrice:5000000 }).errors.some(e=>e.includes('26%')));
  assert.ok(q(6, { priceOverride:true, finalPrice:6501000 }).errors.some(e=>e.includes('10,000')));
  assert.ok(q(2).custom);
});

test('customer model retains item and payment structure without internal cost/profit', () => {
  for (const count of [4,6,8,12]) for (const override of [false,true]) {
    const job = { cameraCount:count, priceOverride:override, finalPrice:override?16000000:0, ref:'TEST', notes:'' };
    const r = q(count, { ...job, addons:{ hdd2tb:true } });
    const m = PDF.buildQuoteModel(job, { business:'TEST CLIENT' }, r, { value:r.cash, date:'2026-10-18' });
    assert.equal(m.items.reduce((s,l)=>s+l.amount,0),m.total);
    assert.equal(m.plans.length,2);
    m.plans.forEach(plan=>{assert.equal(plan.rows.reduce((s,l)=>s+l.amount,0),m.total);plan.rows.forEach(row=>assert.equal(row.amount%10000,0));});
    assert.doesNotMatch(JSON.stringify(m), /costOfDoingBusiness|netProfit|minimumPrice|margin26|profit margin/i);
    assert.match(m.plans[1].note,/financing included/);
  }
});

test('existing unversioned jobs keep original prices; saved new quotes keep their snapshot', () => {
  const app = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
  const pure = app.slice(app.indexOf('  var QUOTE_RUBRIC'),app.indexOf('  // Fold legacy quotes[]'));
  const ctx = vm.createContext({ window:{ VeriskoPricing:P } });vm.runInContext(pure,ctx);
  assert.equal(ctx.computeQuote({cameraCount:4,zone:'1'}).cash,2200000);
  const fresh = ctx.computeQuote({cameraCount:4,zone:'1',pricingVersion:P.VERSION});
  assert.equal(fresh.cash,4920000);
  const saved = {...fresh, cash:5100000};
  assert.equal(ctx.computeQuote({cameraCount:4,pricingVersion:P.VERSION,quoteSnapshot:saved}).cash,5100000);
});
