# Standard client plan approval and Sales progress

Same fictional DEMO Future School contact `vmvps2dmot6zu3`, quote `vmvptgsua9fqdb` / J-2026-0001. Client chose three months on the real local client page. Operations reviewed and approved the same offer with first payment 1 November: UGX 2,110,000; 1 December UGX 1,580,000; 31 December UGX 1,590,000. Exact total UGX 5,280,000; later dates are 30/60 days, preserving the rounded remainder. No new client, job, receipt or Sales commission.

Found standard links lacked the saved-option approval path. Added equivalent guarded approval, exact schedule support and a required completion date for the two-part alternative. Retained role checks, costs/Owner review, current link, same choice and atomic/idempotent writes. Saved 12/24-month/rental terms remain unchanged. Operations same-job summary receives canonical terms and dates; Sales receives status and first due date only. Pending/query/approved receipt status takes precedence over plan status. Stale/expired unapproved choices are excluded and forged stored plan progress is discarded.

716 tests passed. New regressions cover standard exact totals/day dates/two-part completion date, role denial, stale/review/cost guards, retries, safe same-contact projection and deal-health transitions. Phone-width iframe checks showed Operations approved plan and full outstanding balance; Sales Payment plan approved / On track / waiting first payment. Sales pay remains UGX 15,000 earned this week for the visit, without UGX 100K payment commission. Browser emulation is not physical Android acceptance.

Evidence: output/audits/standard-plan-approval-20261027/ before/after, plan-status, sales and snapshot JSON; operations-phone.png and sales-phone.png cropped from untouched 390px iframe captures. Earlier old fixture receipt projection fields differ after local fixture recovery, but same existing receipt ID, amount and approved status are retained; no new receipt created. Original demo server left intact; recovered same contact/job IDs on local4530/4531 only. No real data, payments or client commitments changed.

Release verification follows in CHECKPOINT.md.
