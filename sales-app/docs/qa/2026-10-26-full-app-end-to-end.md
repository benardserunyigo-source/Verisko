# Full app end-to-end audit —26 October2026

## Scope and outcome
Fresh owner-requested full journey and complete automated suite. Used isolated in-memory fictional records; no live financial, client, account, stock or media writes. Current business and role rules preserved.

700 automated tests passed,0failed. Additional fresh real-handler integration completed one Sales contact through shared visit queue, quote, approved client payment, mixed warehouse/procurement, installer acceptance, GPS start/finish records, camera tests/photos, leftover receipt, technical approval, client-requested fixes, fresh repair evidence, technical re-approval, assigned-supervisor/client acceptance and callback return/rework/close. Final money and stock were checked after repeated reads.

## Issues reproduced and fixed
1. Office summary could claim no money tasks while saved due Sales earnings or a supplier order had no linked payment. It now points to existing Funds & team pay sources. Future payroll is not flagged early, duplicate source rows countonce, recorded pending entries use the approval queue, changed earnings trigger Admin review. These reminders do not add cash or assert that a supplier was paid.
2. A signed-off installer job displayed Waiting26hours. It now shows its scheduled date without a waiting timer. Active waiting queues retain their timer.
3. Admin's Client visit times button overflowed a320px phone screen. The shared shift banner now wraps its buttons. Verified320px content equals viewport for allfive role screens.

## Coverage
| Area | Evidence |
| --- | --- |
| Phone/PIN, role scoping, private media, forged/stale writes | Complete existing authentication/access/server suite; five fictional signed-in role UI sessions. Local sign-in is a QA adapter, not live PIN-provider acceptance. |
| Sales and shared visit queue | Fresh real handlers: one contact, reasoned ownership returns, confirmed/completed visit, ongoing interactions and one quote. Sales UI shows Client signed off with no internal costs. |
| Quotes, four payment options,30-day prices, approved plans | Existing pricing, draft, saved-offer, expiry, link/reply/approval and finance projection tests, including4/6/8/12camera packages and26–50% margin validation. No pricing changed. |
| Voice notes and location/offline | Existing voice upload/playback access, source-link privacy, field shift/start/pause/resume/finish/offline-retry tests. Fresh voice source shared on same client. Actual handset audio/GPS/background acceptance remains pending. |
| Inventory and procurement | Fresh job uses4warehouse cameras and150m cable; only50m bought and received. Assignment waits for arrivals.20m usable cable returned, no duplicate site issue/warehouse receipt. Concurrent holds/stock tests pass. |
| Installation and handover | Same job accepted; all checks/photos, start/finish, material report/return and technical approval. Client asks for fix; new proof and re-approval required before joint sign-off. Installer cannot sign for the client. |
| Callback | Same completed job, assigned installer, fixed proof, returned with reason, fresh recording check proof,20K receipt cost, office review and closure. |
| Money and pay | Initial and final client receipts total5.28m; crew350K, callback20K, supplier50K and weekly Sales115K recorded and approved once. Client/crew balances0. First-payment commission remains100K once within115K earned pay. |
| Final summary | One contact, one source quote, one material plan and one installation. Six cash rows. Approved5.28m in minus535K out =4.745m cash. Job costs420K are a subset of office535K, not added again.20m cable free stock, callbackClosed, zero job or office tasks. |
| Phone UI | Actual app Sales, Operations, Installer, Team Lead and Admin sessions. No consoleerrors observed.320/390px checks; Sales previousweek115K+Approved payout; Installer350Kpaid/0left; Operations client0balance/crew0balance/no tasks. |

## Evidence
- Reproducible integration: output/audits/full-app-20261026/run.mjs
- Readback and stages: result.json; final-state.json; isolated source stores: stores.json in same folder.
- Phone screenshot: output/audits/full-app-20261026/final-job-phone.png.
- Full suite: node sales-app/tools/verify-portal.mjs,700pass/0fail.

## Acceptance boundary
These are server-handler and browser viewport tests. No actual WhatsApp was sent, bank transfer made, real client agreement accepted or staff privilege changed. Physical Android locked-screen tracking, OEM battery restrictions, real recording/playback, notifications, larger system text and TalkBack require the existing handset pilot. Do not claim full physical-device acceptance.

Routine release verification follows: exact source deployment, changed assets, private API denial and live preview.

## Verified live release
v170 source35cdfbf718915fbed476a6f18c8efd4689bd0f19, readydeploy6adf61ed888c66d3c7d02525.42assets compared tosource (knownapplyanchoronlynormalization),11privateAPIJSON401. LiveOperationsreadonlypreview Jobs summary loaded with no consoleerrors. Evidenceoutput/audits/full-app-20261026/release-readback.json. Real authenticated production records were not changed for QA.
