# Cash-book refresh after installer payments — v163

Actual user-requested stock/payment demo found a missing handoff: the job summary loaded the new installer payment, while its cash-book action rendered older main-app state. A page reload was required to see the pending linked expense.

Cash-book entry now fetches the latest authorized shared workspace using the existing guarded loader. It waits for existing queued saves, never overwrites pending phone edits or intervening local changes, checks account/page/session lifecycle and shows a clear stale/offline notice with retry. View-only previews remain fictional. Authentication denial does not show a cached cash ledger.

667 checks passed, including3 new behavioural freshness/pending-save/stale-response tests. Actual390px fictional app: Operations records350K once, opens Today’s cash task without reloading, sees one pending expense, uploads a labelled demo receipt and saves; Admin opens the same job, reviews proof and clicks Approve. Approved out350K, cash2m−350K=1.65m; source installer paid350K/balance0. Reopening preserves1installerpayment and1expense. No approval fixture helper was used.

The earlier part used the actual Operations UI to hold4existing cameras and150m cable, order/receiveonly50m against the200m requirement. Continuation preserves the same contact/job/material/order/payment IDs; copied only fictional checkpoint state between local demo origins. A scoped-roster projection issue in the local fixture was repaired with the original fictional users; no real privileges changed. Sales115K remains once in the original earned week, rather than wrongly comparing across the Uganda Monday boundary.

Evidence and captures: `output/audits/warehouse-cash-demo-20261025/`. Actual Operations final summary4476 and Admin cash book4477 remain open. Tests and browser QA do not establish physical Android tracking or TalkBack acceptance. Exact live release readback is recorded in CHECKPOINT after deployment.
