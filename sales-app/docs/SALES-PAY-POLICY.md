# Current Sales pay

The owner confirmed on 22 October 2026: UGX 15,000 once per completed client site visit; UGX 50,000 once when a rep reaches three distinct completed client visits in a week; UGX 100,000 once when a client's first payment is approved. All amounts are due on Monday. Bookings alone earn no visit amount or weekly bonus. No introductory grace bonus applies.

`sales-pay-policy.js` is the current versioned policy and calculation used by Sales, Team Lead and Operations Dashboard. Weeks run Monday 00:00 through the next Monday 00:00 Uganda time. The first policy week is 19–25 October, due 26 October. The old saved commission configuration and `commission.js` historical rules are deliberately retained; the new dashboard does not rewrite prior work or claim a disbursement occurred. Reconcile any previously unpaid work before the first Monday payout. This release is not a payroll transfer or payment ledger.

Tests cover two/three/four visits, repeat visits, imported office leads, approved vs pending payments, multiple instalments, own-rep scope and Monday boundaries. The role preview uses these current amounts, not the retired UGX 5,000 sample.


## Recorded payouts
Operations opens Funds & team pay to record the existing weekly total once after paying, with a receipt. This does not create another earning or commission. Payouts up to100K can be approved by Operations; higher amounts need Admin. Sales sees their own recorded payout and approval status in My pay for that week. Current implementation records one full payout per person/week; historical earnings before19October2026 require reconciliation under the prior rules. Changes to earned totals after a recorded payout are flagged for Admin review, never silently repaid.
