# Saved job draft costs

Operations/Admin can open a saved four-camera job from Job summaries → Draft costs & profit, or More → Draft payment options → choose job. Edit three costs, compare four plans, tap Save draft costs. Reopen later; Use saved costs discards local edits back to the last acknowledged save. Saved by/time uses Uganda time. This comparison still uses the existing four-camera draft terms only.

A separate private Netlify Blobs record stores the job/client identity, budget assumptions, draft option snapshot and four estimates. No customer quote, receipt, finance approval, company budget or commercial price is written. Other roles cannot read or save this endpoint. Optimistic versions plus conditional writes prevent lost updates; retries are idempotent. Changed client identity/package blocks access to an old draft.

## Evidence

- Full suite: 577 passing. Added save/reopen, other-role/unsigned denial, concurrent saves, idempotent retries, changed identity/package, invalid costs, unavailable budget, router and reset-baseline coverage.
- Isolated real-handler browser QA with fictional jobs: saved direct costs 2,630,000; reload retained all three fields and four estimates. Cash 25.87% flagged; remaining margins 26.17%, 27.76%, 26.17%. Reset after care edits restored saved values. Second job used its own unsaved baseline; returning to first reopened its saved costs.
- Two browser sessions: stale save rejected with edits retained; Reload saved draft recovered current saved values. Source job records, including customer price, unchanged. No console errors or horizontal overflow at 390px.
- Evidence: output/audits/saved-draft-costs-20261024/, including server.mjs, tests.log, browser-readback.json and saved-costs-phone.png. Test storage is isolated and fictional.

Release verified: source a9b95e032571336285a188bc9e34f1fcea093290; Netlify 6add50c41852fc13c5f46653 ready. Twelve asset hashes match; eight private APIs return JSON401 unsigned. Live preview shows job picker, 48px select, disabled Save and no overflow at 390px. Isolated fixture at 320px has no overflow. Authenticated production saves and physical Android acceptance are not claimed. Public preview remains fictional with Save disabled.
