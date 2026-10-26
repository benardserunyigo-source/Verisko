# Cash flow end-to-end check — 26 October2026

## Result
Found and fixed one real handoff bug: a regular expense returned by Admin stayed in Sent back after Operations corrected and saved it. Linked payments already returned to Pending correctly. All corrected expenses now return to review using the original entry ID. No extra cost is created. Approval limits, proof requirements and locks on approved entries remain unchanged.

## Fresh real-handler test
Two new regressions run against in-memory stores and the real data handlers. The complete client journey starts with one Sales contact and completed visit, quote, first approved client payment, materials and completed installation. It then checks:

- Admin-approved500K fund request creates no cash until a linked receipt is recorded; Operations cannot approve incoming money.
- Completed visit plus first payment earns115K weekly Sales pay once. Admin approves this payout because it exceeds100K.
- Saved supplier order links to one150K actual payment. Admin sends it back with a reason; Operations corrects the same entry; Admin approves.
- One350K installer source payment and one20K callback cost project into Cash flow. Operations can approve the receipt-backed20K;350K requires Admin.
- Another1m client receipt is approved without repeating the100K first-payment commission.
- Repeated reads retain seven unique entries:3.5m approved in,635K approved out,2.865m approved balance; office funds and source logs are not re-added. Shared Sales pay remains once at office level.
- A second supplier cash entry with the same source is rejected. Sales sees only their payout; other Sales, Team Lead and Installer cannot see office cash sources.
- A regular25K expense returned, corrected, resubmitted and approved remains one record. Operations cannot edit its approved amount or status.

## Phone UI
Actual isolated Operations4514/Admin4515,390px viewport: Admin returns25K travel cost with a route/reason request. Operations opens the reason, corrects the category and note, saves. Admin refreshes and sees the same25K in Needs your review; approval removes it from the queue. Operations reopens the page and sees310K approved balance in both Cash flow and Operations summary. Six ledger rows remain; only one25K expense. Existing150K material and20K callback costs remain pending, not deducted from approved balance. Evidence: output/audits/cashflow-e2e-20261026/readback.json and corrected-approved-phone.png.

## Validation and boundaries
Complete portal suite:699passed,0failed. Existing boundary tests cover99,999/100,000/100,001 UGX, receipt denial, source immutability, cancelled/legacy records, stale saves, private media and role denial. All writes were fictional in-memory QA; no production records, transfers, privileges or customer terms changed. Browser phone sizing is not a physical Android acceptance trial. Live source/deploy/API verification follows release.

## Verified release
Backend-only source111cf4b2e36989ceb987afaeeda78bf9b0bfc58c deployedready6adf5e98a06cc3dfad5deaf5. Existingv169frontend unchanged.42assets verified, knownapplyanchoronlynormalization,11privateAPIJSON401. Evidenceoutput/audits/cashflow-e2e-20261026/release-readback.json. Real authenticated production cash records were not modified to test approval.
