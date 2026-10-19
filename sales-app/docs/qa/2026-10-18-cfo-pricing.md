# CFO pricing revision, release 85

User approved the audit recommendations and UGX 4,300 per USD.
Starting package targets are 30% planned pretax margin; 26% is the hard minimum.
Simple base prices excluding HDD and separately applicable VAT:

| Cameras | UGX | Recorder |
| --- | ---: | --- |
| 4 | 5,280,000 | 8CH |
| 6 | 6,740,000 | 8CH |
| 8 | 8,180,000 | 8CH |
| 12 | 11,640,000 | 16CH |

Financing remains included. Rounded 40/30/30 installments reconcile to the total.
Owner confirmed sales commission and visit pay are inside overhead, not added
again. USD costs alone change with FX; local costs are not multiplied by FX.

## Controls

- Private budget in Netlify function-scoped secret configuration; no active
  equipment cost constants in public assets or the new policy source file.
- Server recalculation replaces browser snapshots for unaccepted current quotes.
- No zero/negative direct costs. Downward overrides, extra crew, zero-cost
  discretionary add-ons and price adjustments need recorded Owner approval.
- Cost confirmation and evidence required before sending/acceptance; actual
  non-HDD add-on costs enter once, separate from site costs and automatic HDDs.
- Seven-day validity and explicit renewal of expired unaccepted offers.
- Accepted commercial inputs, prices and payment schedule locked, including
  legacy jobs. Deletion cannot erase an accepted contract through a stale save.
- Installation date and Owner funding confirmation required before accepting a
  financed job. Due dates and approved-receipt aging on the job/Jobs overview.
- CSV exports have actual quoted totals, planned cost/profit, payment schedule,
  approved receipts and outstanding balance, independent of manual finalPrice.
- Sales training directs staff to current package cards; retired admin fee and
  old package suggestions removed. Historical videos carry a pricing notice.
- Customer PDF keeps package/add-on layout, selected plan, issue date, correct
  validity, HDD exclusion and conditional VAT note. No private cost/approval data.
- Service-worker cache bumped to retire older publicly cached cost scripts.

## Verification

256 Node tests passed with the approved private budget loaded locally. Includes
tampered snapshots, version bypasses, zero costs, approvals bound to evidence,
accepted-record preservation, expiry/renewal, costed add-ons, exports, aging,
public-asset allow-list and customer PDF exclusion.

Isolated loopback preview used only synthetic users and an in-memory data store.
Created a six-camera quote, saved through server validation, confirmed funding,
accepted it with an installation date and downloaded the customer PDF. Rendered
one-page PDF inspected after correcting the empty-schedule draft regression.
Price-card screenshot inspected. No production test record or external message.

Not changed here: external marketing website, supplier quotes, actual payroll,
loan rates, tax registration, accounting records and the historical forecast.
Those require evidence/operational reconciliation; software cannot verify them.
