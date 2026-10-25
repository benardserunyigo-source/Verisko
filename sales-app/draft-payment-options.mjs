// Public sample prices only. No private budgets, client data or quote writes.
export const DRAFT_CAMERA_COUNTS=Object.freeze([4,6,8,12]);
const example = Object.freeze({cameras:4, cash:4700000, upfront:2000000, monthly12:260000, monthly24:150000});
export function draftPaymentOptions(role, {cameras=4,options}={}) {
  if (!['operations','admin'].includes(role)||!DRAFT_CAMERA_COUNTS.includes(cameras)) return [];
  // Internal sample terms only: scale the existing four-camera example, round up to 10k.
  // Editing costs never raises these draft comparison prices or a real customer quote.
  const scale=n=>Math.ceil(n*cameras/4/10000)*10000;
  const defaults=[
    {id:'cash',title:'Pay in full',upfront:scale(example.cash),monthly:0,months:0,owns:true},
    {id:'12months',title:'Own it in 12 months',upfront:scale(example.upfront),monthly:scale(example.monthly12),months:12,owns:true},
    {id:'24months',title:'Own it in 24 months',upfront:scale(example.upfront),monthly:scale(example.monthly24),months:24,owns:true},
    {id:'rental',title:'Rent the system',upfront:scale(example.upfront),monthly:scale(example.monthly12),months:12,owns:false}
  ];
  if(options!==undefined){
    if(!Array.isArray(options)||options.length!==4||new Set(options.map(p=>p?.id)).size!==4)return [];
    for(const row of defaults){
      const supplied=options.find(p=>p?.id===row.id);
      if(!supplied)return [];
      if(!['upfront','monthly'].every(k=>Number.isSafeInteger(supplied[k])&&supplied[k]>=0&&supplied[k]%10000===0))return [];
      if(row.months?supplied.monthly===0:supplied.monthly!==0||supplied.upfront===0)return [];
      if(supplied.months!==undefined&&supplied.months!==row.months||supplied.owns!==undefined&&supplied.owns!==row.owns)return [];
      row.upfront=supplied.upfront;row.monthly=supplied.monthly;
      if(!Number.isSafeInteger(row.upfront+row.monthly*row.months)||supplied.total!==undefined&&supplied.total!==row.upfront+row.monthly*row.months)return [];
    }
  }
  return defaults.map(p=>({...p,total:p.upfront+p.monthly*p.months,draft:true}));
}
const money=n=>'UGX '+n.toLocaleString('en-UG');
// Inputs come from the existing authenticated office pricing response, never assets/storage.
export function draftCostBudget(role, pricing, {preview=false,cameras=4}={}) {
  if (!['operations','admin'].includes(role)||!DRAFT_CAMERA_COUNTS.includes(cameras)) return null;
  // Fictional preview values only; never substitute these for an unavailable real budget.
  if(preview)pricing={policy:{contingency:.1,callbacks:200000,acquisition:50000,overhead:200000,processing:.03,monthly:.02},packages:{[cameras]:{direct:2200000*cameras/4}}};
  const p=pricing?.policy, direct=pricing?.packages?.[cameras]?.direct;
  const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  if(!p||!valid(direct)||direct<=0||!['contingency','callbacks','acquisition','overhead','processing','monthly'].every(k=>valid(p[k]))||p.processing>=1||p.monthly>=1)return null;
  const base=direct*(1+p.contingency)+p.callbacks+p.acquisition+p.overhead;
  if(!Number.isFinite(base))return null;
  return {policy:Object.fromEntries(['contingency','callbacks','acquisition','overhead','processing','monthly'].map(k=>[k,p[k]])),packages:{[cameras]:{direct}}};
}
export function draftCostEstimate(role, pricing, {preview=false,cameras=4,options}={}) {
  const budget=draftCostBudget(role,pricing,{preview,cameras});
  if(!budget)return null;
  const p=budget.policy,direct=budget.packages[cameras].direct;
  const base=direct*(1+p.contingency)+p.callbacks+p.acquisition+p.overhead;
  const plans=draftPaymentOptions(role,{cameras,options});
  if(plans.length!==4)return null;
  const rows=plans.map(row=>{
    const paymentFees=row.total*p.processing;
    const loss=(row.total-row.upfront)*(row.id==='24months' ? .06 : row.months ? .03 : 0);
    // Procurement one month before the start payment. Reserve losses at installation;
    // charge interest only while cash is negative, including interest already incurred.
    let financing=0;
    if(row.months){
      financing=base*p.monthly;
      let debt=base+financing+loss-row.upfront*(1-p.processing);
      for(let month=1;month<=row.months;month++){
        const interest=Math.max(0,debt)*p.monthly;
        financing+=interest;debt+=interest-row.monthly*(1-p.processing);
      }
    }
    const rawCost=base+paymentFees+loss+financing,cost=Math.round(rawCost),profit=row.total-cost,margin=(row.total-rawCost)/row.total;
    return {id:row.id,base:Math.round(base),paymentFees:Math.round(paymentFees),loss:Math.round(loss),financing:Math.round(financing),cost,profit,margin,belowFloor:margin<.26};
  });
  return rows.every(r=>Number.isSafeInteger(r.cost)&&Number.isFinite(r.margin))?{preview,rows,processing:p.processing,monthly:p.monthly}:null;
}
const marginLabel=r=>r.belowFloor&&Number((r.margin*100).toFixed(2))>=26?'<26%':(r.margin*100).toFixed(2)+'%';
function costLines(r){return `<div class="draft-plan-cost"><dt>Estimated cost of doing the job</dt><dd>${money(r.cost)}</dd></div><div><dt>Estimated profit before tax</dt><dd>${money(r.profit)}</dd></div><div><dt>Margin before tax</dt><dd>${marginLabel(r).replace('<','&lt;')}</dd></div>`;}
export function draftComparisonHtml(role, {pricing,preview=false,cameras=4,scenario,costError=false,options,planError=false}={}) {
  const rows=draftPaymentOptions(role,{cameras,options:planError?undefined:options});
  if (!rows.length) return '<p role="alert">Operations or Admin access needed.</p>';
  const estimate=planError?null:scenario!==undefined?draftCostEstimate(role,scenario,{cameras,options}):draftCostEstimate(role,pricing,{preview,cameras,options});
  return `<div class="draft-plans">
    <aside class="draft-plans-notice"><strong>Draft only · Do not send to a client</strong><p>These are sample prices for review. Current customer prices stay the same. You can edit these amounts in the draft.${cameras===4?'':' Larger-job sample prices start from the four-camera draft amount per camera, rounded up to UGX 10,000. Edited amounts stay on this job only. They are not approved quotes.'}</p></aside>
    <section class="card draft-plans-scope"><h2>Same ${cameras}-camera job. Four ways to pay.</h2><p>Example setup · ${cameras<=8?8:16}-channel recorder · ${cameras*50} metres of cable. Check extra work in this job’s costs.</p><p>5MP is the planned camera type. The camera price, mini PC and support costs still need checking.</p><p class="helper">Hard drive, backup battery and extra work are not in this example. Without a hard drive, footage is not saved.</p></section>
    <section class="card draft-plan-quick draft-plan-comparison"><h2>Compare at a glance</h2>${planError?'<p role="status">Check the draft payment amounts above. Totals are unavailable until they are valid.</p>':`<table><caption>All amounts in UGX · Draft only</caption><thead><tr><th scope="col">Plan</th><th scope="col">At start</th><th scope="col">Monthly</th><th scope="col">Total</th></tr></thead><tbody>${rows.map((p,i)=>`<tr><th scope="row">${['Cash','12 months','24 months','Rent*'][i]}</th><td>${p.upfront.toLocaleString('en-UG')}</td><td>${p.monthly?p.monthly.toLocaleString('en-UG'):'0'}</td><td>${p.total.toLocaleString('en-UG')}</td></tr>`).join('')}</tbody></table><p class="helper">*Rent total shows the first 12 months only. Rent keeps going and does not buy the system.</p>`}</section>
    <section class="card draft-plan-quick draft-profit"><h2>Our estimated return</h2><p class="helper">${preview?'Preview figures are made up. Sign in as Operations or Admin to see the saved job budget.':'Based on this job’s draft costs. These are estimates, not final costs or confirmed profit.'}</p>${estimate?`<table><caption>All amounts in UGX · Before tax${preview?' · Fictional preview':''}</caption><thead><tr><th scope="col">Plan</th><th scope="col">Job cost</th><th scope="col">Profit</th><th scope="col">Margin</th></tr></thead><tbody>${estimate.rows.map((r,i)=>`<tr class="${r.belowFloor?'draft-margin-low':''}"><th scope="row">${['Cash','12 months','24 months','Rent*'][i]}</th><td>${r.cost.toLocaleString('en-UG')}</td><td>${r.profit.toLocaleString('en-UG')}</td><td>${marginLabel(r).replace('<','&lt;')}</td></tr>`).join('')}</tbody></table><p class="helper">Job cost includes the job budget, payment fees, missed-payment allowance and financing.</p>${estimate.rows.filter(r=>r.belowFloor).map(r=>`<p class="draft-margin-warning"><strong>${rows.find(p=>p.id===r.id).title}: Below 26%. Review before quoting.</strong></p>`).join('')}<p class="helper">${estimate.rows.some(r=>r.belowFloor)?'Highlighted plans are below the target. Prices have not been changed.':'All four estimates reach 26%. Final costs still need checking.'}</p><p class="helper">*Rent covers 12 paid months. It can fall below the target if payments stop early. Support after year one is not priced here.</p>`:(planError?'<p role="status">Cost and profit unavailable. Check the draft payment amounts above.</p>':costError?'<p role="status">Cost and profit unavailable. Check the cost fields above. No zero-cost estimate has been used.</p>':'<p role="status">Cost and profit unavailable. Connect and refresh to load the private job budget. No zero-cost estimate has been used.</p>')}</section>
    <section class="draft-plans-grid" aria-label="Four draft payment options explained">${planError?'<p role="status">Check draft payment amounts to see all four plans.</p>':rows.map((p,i)=>`<article class="card draft-plan" aria-labelledby="draft-plan-${p.id}">
      <p class="draft-plan-label">Option ${'ABCD'[i]} · Draft</p><h2 id="draft-plan-${p.id}">${p.title}</h2>
      <dl><div><dt>${p.owns?'Pay at the start':'Setup fee at the start'}</dt><dd>${money(p.upfront)}</dd></div>
      <div><dt>Monthly payment</dt><dd>${p.monthly?money(p.monthly):'None'}</dd></div>
      <div><dt>${p.owns?'Number of monthly payments':'Rental keeps going'}</dt><dd>${p.owns?(p.months||'None'):'While you rent'}</dd></div>
      <div class="draft-plan-total"><dt>${p.owns?'Total paid':'Paid in the first 12 months'}</dt><dd>${money(p.total)}</dd></div>
      <div><dt>Who owns the equipment?</dt><dd>${p.owns?(p.months?'You, after the last payment':'You, after full payment'):'Verisko'}</dd></div>${estimate?costLines(estimate.rows[i]):''}</dl>
      ${estimate?`<p class="${estimate.rows[i].belowFloor?'draft-margin-warning':'helper'}"><strong>${estimate.rows[i].belowFloor?'Below 26%. Review before quoting.':'Meets 26% in this estimate only.'}</strong></p>`:''}
      <p class="helper">${p.id==='cash'?'One payment. No monthly bills.':p.owns?'Pay the start amount, then one payment each month from month 1. The start amount is part of the total.':'The setup fee is not refundable. Monthly rent does not buy the equipment. This total is a 12-month example, not a lifetime total.'}</p>
    </article>`).join('')}</section>
    <details class="card draft-plan-review"><summary>What still needs checking?</summary><p>Profit is not confirmed. We must check the final camera, mini PC, delivery and support costs before we can confirm at least 26% profit before tax.</p><p>${estimate?`This estimate allows ${(estimate.processing*100).toFixed(1)}% for payment fees and ${(estimate.monthly*100).toFixed(1)}% each month on money we borrow. A loan is assumed for one month before the start payment on monthly plans. Cash assumes full payment before we buy the goods.`:costError?'Payment fees and financing use the saved budget once the cost fields are valid.':'Payment fees and financing need the private budget.'} Costs include the saved allowance for callbacks, monitoring and support. No separate mini PC price has been added; its fit within that allowance still needs checking.</p><p>The 12-month plan allowed 3% for missed later payments; the 24-month plan allowed 6%. Rental allowed 3% of monthly rent. Rental support and costs after year one still need review. Tax, where due, also needs checking.</p><p>Estimated profit is total paid minus estimated job cost. Margin is that profit divided by total paid. It is not a final accounting profit. No customer plan is selected or sent from this page. Saving draft costs does not accept a payment plan. This example does not change any signed job or current quote.</p></details>
  </div>`;
}
