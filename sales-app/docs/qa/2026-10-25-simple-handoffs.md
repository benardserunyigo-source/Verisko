# Simple Operations handoffs — v164

Owner authorized the two audit fixes, simpler visit/quote/material steps, full journey retest and live release.

Changes:
- Job summary offers materials planning only after an approved receipt for that job. Pending money points to Admin review.
- Recording an app draft as sent explicitly links its saved ID; projected stage becomes Sent. Genuine external quotes remain supported. An older empty quote link can be linked explicitly to a saved quote, with ownership/version/retry/client/payment-attribution guards; an existing link cannot be replaced.
- Finish visit offers Confirm site assessment. Its date/time come from this staff member’s latest finished session on the same contact. Confirmation remains explicit and awards visit pay once; Sales cannot use office assessment actions. Manual completion remains available when no timed session exists. Request filter stays With me after confirmation.
- Create quote groups existing inputs into Site and cameras, Check job costs, Review price and payment. Extra costs and add-ons are collapsed; validation opens any hidden invalid control. Existing prices, cost inputs, saved contracts, permissions and approvals stay unchanged.
- A new materials plan suggests the saved quote camera quantity and cable allowance. Camera type and buying source require review. Existing saved plans/orders/stock holds are never replaced by suggestions. Assignment keeps using the same materials IDs.

Verification:
- Full suite: 672 passed, 0 failed, including five new behavioral regressions for approval eligibility, draft source linking/retry, legacy link correction, material quantities and saved visit time.
- Actual 390px isolated UI on4484: Sales saves/sends contact once; Operations takes/confirms visit, starts/finishes sampleGPS, confirms assessment with saved read-only finish time, saves grouped quote, records it as sent with automatic saved quote number, records pending deposit; summary shows Waiting for Admin and no materials prompt. After fictional Admin approval, material plan shows four cameras and200m cable without retyping quantities; user chooses camera type/source and saves.
- Same fresh contact/job continued through real HTTP handlers: stock allocation,50m-only buying, installer offer/acceptance,22synthetic photos/four camera checks, staff handover, time finish, submission, return receipt/retry, technical approval and joint client signature. Result:1contact/visit/quote/materialplan/installation/receipt;20m usable cable; quote Handed over. This continuation is handler-level, not claimed as another complete UI walkthrough. Existing suite covers client-plan options, money approval, commissions and correction paths.
- New source starts quote materials with IDs quote-cameras/quote-cable; fresh end-to-end checks use those exact IDs without copying the list. Earlier demo records remain unchanged.
- Phone320/390px visual/overflow and live exact-source verification recorded in CHECKPOINT. Real Android/TalkBack/locked-screen acceptance remains a separate handset trial. No production client, financial, stock or privilege writes.

Evidence: output/audits/new-hire-journey-20261025/{fixed-server.mjs,fixed-prepare.mjs,fixed-finish.mjs,fixed-closed-state.json,03-fixed-quote.png}; release readback will be saved alongside this evidence. Unrelated root AGENTS.md and .gitignore changes preserved.

Live release verified: source b4423f5208482452b67ab1f4b485c160982ba437, Netlify 6adeb5336a4eac40362d55ef ready. 38 raw-exact assets plus the known application-anchor rewrite, 10 private API JSON401 responses. Live phone sample preview uses v164; authenticated production writes were not used for QA.
