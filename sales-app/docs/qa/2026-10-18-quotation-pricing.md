# Quotation pricing, release 81

Owner requested new 4/6/8/12 camera plans and a minimum 26% profit margin
before income tax after all modeled costs. Operations sees customer total,
**Cost of doing business**, and **Net profit before tax** in the quote form
and saved job card. Customer PDF structure remains package, add-ons, total,
payment options, terms and footer. Internal cost/profit fields never enter the
customer model or share text.

## Cost basis

Source: `/Users/ben/Verisko/outputs/equipment-cost-map-20261017/Verisko Equipment Cost Map - 2026-10-17.xlsx`,
Package Plans, Job Quote and 6 Camera Plan, updated 18 October 2026.

| Cameras | Customer price UGX | Planned cost UGX | Profit before tax UGX |
| --- | ---: | ---: | ---: |
| 4 | 4,920,000 | 3,635,907 | 1,284,093 |
| 6 | 6,280,000 | 4,646,016 | 1,633,984 |
| 8 | 7,620,000 | 5,634,665 | 1,985,335 |
| 12 | 10,830,000 | 8,009,267 | 2,820,733 |

Balanced indoor/outdoor fixed-camera packages. 8CH up to eight cameras; 16CH
for twelve. 50m cable per camera; UGX 350,000 crew plus one UGX 50,000 bonus
at six cameras and above. Optional HDD. Baseline uses the workbook's four-
supplier camera averages, UGX 4,200/USD planning rate and $13/kg freight.
These are planning costs, not newly obtained supplier quotes.

Job expenses include UGX 170,000 callbacks/warranty, 60,000 acquisition,
210,000 overhead and 5% direct-cost contingency. Processing is 3%; financing
uses one month of 2% pre-install funding, two months of 2% on unpaid balances,
and a 3% deferred-payment risk reserve. All included in the price. Customer
totals and payments use UGX 10,000 increments; 40/30/30 final balance reconciles.
No separate UGX 250,000 financing surcharge on new quotes. The older customer
60/40 option remains at the same total in the existing PDF layout.

Starting fees retain the additional UGX 200,000: 1.2m / 1.7m / 2.2m / 2.2m.
The 26% minimum takes priority over the earlier fee ceiling. A small rounding
safeguard keeps rounded installment financing from dropping the margin.

Operations can override the base direct cost and enter extra equipment,
travel/site costs once. HDD costs are added automatically. Selected non-HDD
extras, chargeable travel and Complex+ work require explicit extra costs;
zero is accepted only as the operator's confirmation of no extra cost.
Discounts and manual prices below 26% cannot save or share through the app.
An actual cost overrun or delayed/defaulted installment can still reduce
realized profit; the two totals are budgets, not accounting actuals.

## Existing records and verification

Unversioned existing jobs retain their original prices and PDF terms. New
jobs carry a pricing version and saved quote snapshot, so a future rate-card
change does not silently rewrite an agreed quote. Create a new job to reprice
an old offer under this policy.

240 Node tests passed, including workbook controls, all camera/storage
combinations, extra costs, discounts/overrides, existing-job preservation,
customer item/payment reconciliation and internal-data exclusion. Local
Operations browser smoke: create and save a six-camera synthetic job; verify
both internal lines on form and card; download and render the one-page PDF.
Customer PDF inspected: same branded structure, no internal costs/profit.
No production test job or customer message was created.
