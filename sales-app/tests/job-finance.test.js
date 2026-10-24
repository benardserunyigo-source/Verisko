import test from 'node:test';
import assert from 'node:assert/strict';
import '../job-finance.js';
const F=globalThis.VeriskoJobFinance;
test('installments cross month boundaries, round to 10k and reconcile to the total',()=>{
  const rows=F.schedule({scheduledDate:'2026-10-31',paymentPlan:'installments'},5280000);
  assert.deepEqual(rows.map(r=>r.due),['2026-10-31','2026-11-30','2026-12-30']);
  assert.equal(rows.reduce((s,r)=>s+r.amount,0),5280000);
  assert.ok(rows.every(r=>r.amount%10000===0));
});
test('aging applies approved receipts oldest-first and excludes pending money',()=>{
  const j={id:'j',stage:'Installed',quotedTotal:6740000,paymentSchedule:F.schedule({scheduledDate:'2026-10-24',paymentPlan:'installments'},6740000)};
  const r=F.review(j,[{installId:'j',direction:'in',status:'approved',amount:2700000},{installId:'j',direction:'in',status:'pending',amount:2020000}], '2026-11-24');
  assert.equal(r.paid,2700000);assert.equal(r.outstanding,4040000);assert.equal(r.overdue,2020000);
  assert.equal(r.rows[0].balance,0);
});
test('cash completion balance is not due before work is installed',()=>{
  const j={id:'j',stage:'Scheduled',quotedTotal:5280000,paymentSchedule:F.schedule({scheduledDate:'2026-10-24',paymentPlan:'cash'},5280000)};
  const tx=[{installId:'j',direction:'in',status:'approved',amount:j.paymentSchedule[0].amount}];
  assert.equal(F.review(j,tx,'2026-10-26').overdue,0);
  assert.ok(F.review({...j,stage:'Installed'},tx,'2026-10-26').overdue>0);
});
test('earlier client payment reconciles the same Kato job and schedule without changing records',()=>{
  const j={id:'kato-job',prospectId:'kato',stage:'Accepted',quotedTotal:5280000,paymentSchedule:F.schedule({scheduledDate:'2026-10-24',paymentPlan:'installments'},5280000)};
  const tx=[{id:'first-payment',prospectId:'kato',direction:'in',status:'approved',amount:2000000}];
  const before=JSON.stringify({j,tx});
  const r=F.review(j,tx,'2026-10-24',[j]);
  assert.equal(r.paid,2000000);assert.equal(r.outstanding,3280000);
  assert.deepEqual(r.rows.map(x=>x.balance),[110000,1580000,1590000]);
  assert.deepEqual(r.rows.map(x=>x.due),['2026-10-24','2026-11-23','2026-12-23']);
  assert.equal(JSON.stringify({j,tx}),before);
});
test('several jobs leave earlier client money unassigned while explicit job receipts count once',()=>{
  const a={id:'a',prospectId:'client',quotedTotal:5000000},b={id:'b',prospectId:'client',stage:'Draft',quotedTotal:5000000};
  const tx=[{id:'early',prospectId:'client',direction:'in',status:'approved',amount:2000000},{id:'linked',installId:'a',prospectId:'client',direction:'in',status:'approved',amount:100000}];
  assert.equal(F.review(a,tx,'2026-10-24',[a,b]).paid,100000);
  assert.equal(F.review(b,tx,'2026-10-24',[a,b]).paid,0);
  assert.equal(F.review(a,tx,'2026-10-24',[a,b]).unassignedClientMoney,2000000);
});
test('receipt selection excludes other clients, other jobs, expenses and non-approved money; deduplicates IDs',()=>{
  const j={id:'a',prospectId:'client',quotedTotal:5000000};
  const earlier={id:'early',prospectId:'client',direction:'in',status:'approved',amount:2000000};
  const tx=[earlier,{...earlier},{id:'other',prospectId:'other',direction:'in',status:'approved',amount:700000},
    {id:'other-job',installId:'b',prospectId:'client',direction:'in',status:'approved',amount:900000},
    {id:'expense',prospectId:'client',direction:'out',status:'approved',amount:300000},
    ...['pending','query','void','rejected'].map(status=>({id:status,prospectId:'client',direction:'in',status,amount:100000}))];
  assert.equal(F.review(j,tx,'2026-10-24',[j]).paid,2000000);
  assert.equal(F.review(j,tx,'2026-10-24').paid,0); // no assumption without complete job list
  assert.equal(F.review({id:'standalone'},tx,'2026-10-24',[{id:'standalone'}]).paid,0);
});
