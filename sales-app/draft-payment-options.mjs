// Public sample prices only. No private budgets, client data or quote writes.
const example = Object.freeze({cameras:4, cash:4700000, upfront:2000000, monthly12:260000, monthly24:150000});
export function draftPaymentOptions(role) {
  if (!['operations','admin'].includes(role)) return [];
  return [
    {id:'cash',title:'Pay in full',upfront:example.cash,monthly:0,months:0,owns:true},
    {id:'12months',title:'Own it in 12 months',upfront:example.upfront,monthly:example.monthly12,months:12,owns:true},
    {id:'24months',title:'Own it in 24 months',upfront:example.upfront,monthly:example.monthly24,months:24,owns:true},
    {id:'rental',title:'Rent the system',upfront:example.upfront,monthly:example.monthly12,months:12,owns:false}
  ].map(p=>({...p,total:p.upfront+p.monthly*p.months,draft:true}));
}
const money=n=>'UGX '+n.toLocaleString('en-UG');
export function draftComparisonHtml(role) {
  const rows=draftPaymentOptions(role);
  if (!rows.length) return '<p role="alert">Operations or Admin access needed.</p>';
  return `<div class="draft-plans">
    <aside class="draft-plans-notice"><strong>Draft only · Do not send to a client</strong><p>These are sample prices for review. Current customer prices stay the same.</p></aside>
    <section class="card draft-plans-scope"><h2>Same 4-camera job. Four ways to pay.</h2><p>Simple installation · 8-channel recorder · 200 metres of cable.</p><p>5MP is the planned camera type. The camera price, mini PC and support costs still need checking.</p><p class="helper">Hard drive, backup battery and extra work are not in this example. Without a hard drive, footage is not saved.</p></section>
    <section class="card draft-plan-quick"><h2>Compare at a glance</h2><table><caption>All amounts in UGX · Draft only</caption><thead><tr><th scope="col">Plan</th><th scope="col">At start</th><th scope="col">Monthly</th><th scope="col">Total</th></tr></thead><tbody>${rows.map((p,i)=>`<tr><th scope="row">${['Cash','12 months','24 months','Rent*'][i]}</th><td>${p.upfront.toLocaleString('en-UG')}</td><td>${p.monthly?p.monthly.toLocaleString('en-UG'):'0'}</td><td>${p.total.toLocaleString('en-UG')}</td></tr>`).join('')}</tbody></table><p class="helper">*Rent total shows the first 12 months only. Rent keeps going and does not buy the system.</p></section>
    <section class="draft-plans-grid" aria-label="Four draft payment options explained">${rows.map((p,i)=>`<article class="card draft-plan" aria-labelledby="draft-plan-${p.id}">
      <p class="draft-plan-label">Option ${'ABCD'[i]} · Draft</p><h2 id="draft-plan-${p.id}">${p.title}</h2>
      <dl><div><dt>${p.owns?'Pay at the start':'Setup fee at the start'}</dt><dd>${money(p.upfront)}</dd></div>
      <div><dt>Monthly payment</dt><dd>${p.monthly?money(p.monthly):'None'}</dd></div>
      <div><dt>${p.owns?'Number of monthly payments':'Rental keeps going'}</dt><dd>${p.owns?(p.months||'None'):'While you rent'}</dd></div>
      <div class="draft-plan-total"><dt>${p.owns?'Total paid':'Paid in the first 12 months'}</dt><dd>${money(p.total)}</dd></div>
      <div><dt>Who owns the equipment?</dt><dd>${p.owns?(p.months?'You, after the last payment':'You, after full payment'):'Verisko'}</dd></div></dl>
      <p class="helper">${p.id==='cash'?'One payment. No monthly bills.':p.owns?'Pay the start amount, then one payment each month from month 1. The start amount is part of the total.':'The setup fee is not refundable. Monthly rent does not buy the equipment. This total is a 12-month example, not a lifetime total.'}</p>
    </article>`).join('')}</section>
    <details class="card draft-plan-review"><summary>What still needs checking?</summary><p>Profit is not confirmed. We must check the final camera, mini PC, delivery and support costs before we can confirm at least 26% profit before tax.</p><p>The earlier estimate allowed 3% for payment fees, 2% per month on money we borrow, and missed-payment costs. These are estimates, not confirmed fees.</p><p>The 12-month plan allowed 3% for missed later payments; the 24-month plan allowed 6%. Rental allowed 3% of monthly rent. Rental support and costs after year one still need review. Tax, where due, also needs checking.</p><p>No plan is selected, saved or sent from this page. This example does not change any signed job or current quote.</p></details>
  </div>`;
}
