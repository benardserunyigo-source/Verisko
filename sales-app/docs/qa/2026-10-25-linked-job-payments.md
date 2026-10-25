# Later payments keep the job · 25 October 2026

The actual app walkthrough found that Payments in a job summary opened general cash flow, losing the job link. Operations then had to ask Admin to link the receipt.

The summary now opens the existing job-payment form directly, with client name, quote number and hidden saved job ID. The shared receipt form, pending status, Admin approval, expense-proof rules and commission policy are unchanged. Summaries without a saved source still open general cash flow. Missing local jobs prompt refresh rather than inventing a link.

Regression checks cover the rendered action, callback wiring and real-handler pending receipt → Admin approval → reload. One contact/job/receipt remains; Sales commission is not paid twice. The 390px actual app created a100K sample receipt from TEST-Q-001's summary with its link filled in, Admin approved without changing attribution, and the same summary showed2.1m received and3.18m balance.320px form had no horizontal overflow. Fictional memory stores only, no production money or client mutations.

Evidence: output/audits/linked-job-payments-20261025/{server.mjs,linked-receipt-phone.png,readback.mjs,readback.json}.654 tests passed. Actual handset acceptance remains separate.
