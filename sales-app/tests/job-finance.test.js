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
