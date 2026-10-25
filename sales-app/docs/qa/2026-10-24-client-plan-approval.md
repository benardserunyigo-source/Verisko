# Operations approval of a chosen plan

Open the same job’s **Client payment plan**. Review the chosen amounts and ownership. Check **First payment date**; the job’s planned date is filled in when available. Expand **Check payment dates** if needed, tick the review check and tap **Approve this plan**. No amounts or client details are typed again.

One canonical private approval holds the chosen offer, source scope, original job, approval time/person, cost review and dated schedule. Shared workspace and workflow readers project that approval onto the existing job ID. This follows the existing private-ledger projection approach; a stale whole-workspace save cannot undo the approval. Approved plan/job commercial fields and dates are locked; the next lifecycle/funding actions retain their existing guards. Local refresh merges approved fields without erasing unrelated unsaved contact/job work.

Plan approval is separate from receipts, commission, funding, installation acceptance and client handover. Existing receipts are reconciled against the new total and schedule once. Rental schedule/total covers the first12months, rent continues and Verisko owns the system. Deactivating the public link preserves the agreement. No new invoice ID, contact or cash entry is created.

## Evidence

- Behavioral tests cover4/6/8/12camera jobs and all4plans, exact canonical totals/deposits/ownership/schedules, Jan31/leap-year clamping, earlier receipts and balance, actual shared-data reads/writes, stale/forged workspace edits, commercial identity lock, private fields, unauthorized roles, missing choice/check, expired/changed reply, low-margin/target failure, idempotency/concurrent approvals, unchanged unrelated jobs, revoked links preserving agreement, funding/technical progress and local unsaved-work/account-change preservation.
- Isolated real handlers and Operations modal at4436: 12month choice, planned31Oct2026 prefilled. Date edit to1Nov recalculated all dates; reset31Oct, tick/approve. Agreement5.12m, deposit2m due31Oct,260k monthly starting30Nov then31Dec. Prior approved500k unchanged; balance4.62m. Reopened approval, summary and actual Job records summary renderer matched.
- 320/390px UI checked, no horizontal overflow. Actual Android device acceptance remains separate.
- Evidence `output/audits/client-plan-approval-20261024/`: review-phone.png, approved-phone.png, summary-phone.png, record-phone.png and readback.json.

Full suite:626 tests pass.

No production client, receipt, financing, privilege or price-list updates, messages or commercial approvals were made during QA. Release evidence follows in CHECKPOINT.md.
