# Warehouse stock on the same paid job

Owner requested reuse of warehouse materials, buying only the shortage, automatic stock updates and a simple phone UI.

## Implementation and limits

- Authoritative per-client/job/material holds in the private inventory record. Paid job and exact item/unit are resolved server-side; quantity/case/inventory versions and active assignment guard changes. Projection feeds ready queue, shared data and installer offer sources. No repeated client/material entry and no fake purchase/arrival rows.
- Physical stock and free stock are separate. Free stock subtracts both explicit warehouse holds and unissued supplier arrivals already belonging to another job. Issuing consumes the commitment and physical stock once. Usable returned stock becomes free only after Operations receives it. Damaged returns stay separate.
- Plan identity/minimum and order ceilings include warehouse quantities. All-stock jobs can be assigned without a buying request. Mixed jobs order/receive only the shortfall. Explicitly released unissued holds become free again. Existing purchased jobs without an opening count keep their prior issue flow.
- Shared conditional lease across inventory/ready/installer writers; live authorization/context rechecked after acquisition; every protected write checks lease ownership/expiry. Lost requests retain existing replay protection. A crashed writer may cause temporary busy errors until its2-minute lease expires. GET is read-only and does not hold a lease. No changes to customer prices/payments, package budgets or pay policies.
- Unavailable/orphaned source holds stay held for manual review. Cancellation/reassignment is not an automatic stock release. No physical Android acceptance claimed.

## Behavioral coverage

New tests use actual coordinated inventory, ready, shared-data and installer handlers and fictional stores. Cover mixed stock/buying through installation approval/returns; two jobs competing; explicit release/reuse; unknown counts; invalid/stale/forged quantities/identity; private roles; lost payment qualification; all-stock readiness; already-ordered limits; order/allocation concurrency; supplier receipts held for the right job; another installation blocked from issuing reserved stock; retry idempotency; counted shortage blocking; expired-lock fencing and error release; and prior no-global-count purchased-job compatibility. Existing journey and role tests also run in the full suite.

## Phone checks

Isolated server: output/audits/warehouse-use-20261025/server.mjs on4442. One DEMO-001 job needs4cameras/200mcable; stock starts2/80. Real UI saved holds2/80, requested buying, order forms capped at2/120 and used saved supplier prices. Received2/120; job became Materials ready with Assign installer. Readback: one plan/job, true purchase/receipt totals2/120 only, physical4/200, all held, zero free. Reload preserved it. Changed camera hold2→1, free stock1 and job missing1; restored2, ready again. Inventory showed200mcable held/free0. At320px fixed long action label to Save amount; modal and page no overflow.390px phone layout and console checked.

All writes and sample prices were fictional and isolated. Live role preview and exact release verification recorded in the checkpoint after deployment.

Runtime check: these are synchronous endpoints with no background export. Netlify documents a60-second synchronous limit at https://docs.netlify.com/build/functions/configuration/ (checked25October2026); the2-minute lease exceeds that limit, with guarded ownership/expiry checks on writes.
