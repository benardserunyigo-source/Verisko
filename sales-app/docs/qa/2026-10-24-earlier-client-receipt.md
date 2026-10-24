# Earlier client receipts in Job records

Owner request: include the earlier approved client payment in older Job records and match the new summary.

## Change

Shared read-only receipt attribution in job-finance.js now serves Job records cards, edit payment history/balance, installment aging/funding totals and Job summaries. A client-only receipt is counted only when exactly one saved job belongs to that client. Explicit job links remain authoritative; several saved jobs leave the client money unassigned with a warning. Receipt IDs are deduplicated. Only approved positive incoming amounts reduce balances; expenses and pending/query/rejected/void receipts do not. No ledger, price, schedule, approval or role policy is rewritten.

## Verification

543 automated tests passed, including same Kato values/dates, no record mutation, multiple jobs (including Draft), explicit links, duplicate IDs, wrong client/job, negative directions and non-approved states. Existing summary real-handler journey and access tests pass.

In the existing isolated4406 fictional Operations session, after reload: Job records funding overview and Kato card show UGX2,000,000 paid and UGX3,280,000 due on UGX5,280,000 total. Edit payment panel shows the original single approved2m receipt. Installments show110k24Oct,1.58m23Nov,1.59m23Dec; Job summaries shows the same.320px check found no horizontal page overflow.390px screenshot in `output/audits/earlier-client-receipt-20261024/job-record-payments-phone.png`. Independent safe API readback exactly matches the previous demo snapshot, including original receipt ID, price/schedule, installer payments and accepted client handover. No real records or demo records changed. Physical Android acceptance is not implied.

## Release

Frontend v138 prepared. Source deployment/readback to follow in checkpoint.
