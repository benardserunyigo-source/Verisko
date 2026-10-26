# Callback costs to Cash flow

Record each cost once on the existing callback. The same amount, date, job and private receipt project into one pending cash entry. Admin reviews that entry. Callback detail shows the current approval, without duplicating the cost or changing client prices.

Automated verification: 682 tests passed, zero failed. Five added tests cover canonical projection and separate equal costs, immutable source details, duplicate/stale-save protection, legacy manual reconciliation, reasoned cancellation, real data-handler Admin-only approval and private receipt access. Sales receives no ledger. Assigned Installer receives only their own callback and its cost status.

Actual local app UI used fictional DEMO Simple Journey and real HTTP handlers at ports4494/4495. Operations opened the20K callback expense with original receipt; Admin viewed that receipt and approved. All cash entries showed100K funding minus20K expense =80K, one expense only. Returning to the callback showed Approved. Reload retained one Open in Cash flow button.390px screenshots inspected;320px document width equalled viewport width. Source receipt replacement is unavailable in the cash editor.

Screenshots: output/audits/callback-cash-20261025/operations-approved.png and admin-approved.png. Isolated demo only; no production financial/client/account writes. Live deployment evidence is recorded in CHECKPOINT.md after release. Actual Android/TalkBack acceptance remains separate.
