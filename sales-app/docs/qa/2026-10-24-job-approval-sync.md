# Job records follows installation approval

Released v129, source commit `f8cddec27bdfdf8c447dd51f224da6fc852df0a8`. Checked 24 October 2026.

## Change

Job records now derives Installed from the linked installation's saved technical approval. The existing job is reused. Opening Job records refreshes server progress; the visible page also refreshes safely at the existing 30-second interval. Local unsent changes, open forms and account changes are protected.

Pending, submitted or partly approved installations do not finish the job. Only the exact source quote is updated, and a conflicting client reference is excluded. Handed over, Cancelled and Rejected stages stay intact. This records technical completion; it does not record a new funding approval, transfer money, change customer terms or automatically perform client handover.

The job card also reuses the approved installation date and the existing first payment. That payment is linked only to the quote explicitly chosen in this client's queue, without making another cash entry or allocating the same deposit to multiple jobs. Unknown/external quote references are not guessed.

## Tests

Full suite: **496 passed, zero failed**. Added behavior checks cover:

- Sent becomes Installed after the full contact-to-approved-installation journey; Sales and office roles read consistent progress.
- A stale office save returns and retains Installed immediately; Sales cannot roll it back. Duplicate clients, jobs and payments are not created.
- Every other job field, including quoted price, payment schedule and funding state, remains exactly unchanged after approval.
- Partial approvals, foreign client references, unlinked installations and later/cancelled stages are handled safely.
- The first payment is linked only to the explicitly selected quote and remains one payment. Existing explicit payment links are preserved.
- New commercial acceptance still uses the existing Owner funding checks. Completed jobs keep their existing price protection.

## Browser reproduction

Used fictional Operations and the real local HTTP handlers. A submitted installation was prepared through the existing full-journey helper using `finish(..., {approve:false})`. Job records first showed Sent. Operations then approved through the real installation form and returned directly to Job records: Installed appeared without a page reload, along with the saved installation date, UGX 2,000,000 paid and the correct balance. The Installed filter included the job. Reloading retained the same result.

Independent HTTP readback compared the entire job against a private before snapshot: the only job field changed was stage. The payment record was identical. There was still one job and one payment. A 390-pixel viewport had no horizontal overflow.

Evidence: `/Users/ben/Verisko/output/audits/job-approval-sync-20261024/` (`readback.json`, `job-records-installed.jpg`, `job-records-phone.jpg`). The browser login fixture does not test production PIN verification; prepared evidence and GPS are synthetic. No real staff/customer/payment record was changed. Actual Android acceptance remains separate.

## Release readback

Netlify reported ready for the exact source commit. Production HTML referenced v129 and the deployed app.js hash matched the tested local file. Data, ready-leads and installer APIs returned JSON 401 without authentication. The public fictional Operations preview opened correctly. This is deployment verification, not a production staff-account or actual Android acceptance test.
