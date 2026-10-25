# Inventory and 30-day material checks

Approved scope: simple Operations/Admin inventory, editable material unit costs, supplier quotes and independent30-day stock/price checks, reusing current job records. Customer quotes stay unchanged.

- Private `verisko-inventory/current` catalogue/count/price/quote record with version/CAS and request replay checks. One identity per normalized name/unit; historical records and template names appear without seeding a live store. New items join the shared job picker;5MP cameras and sets supported in assignment.
- Warehouse stock starts unknown. A physical count anchors existing arrival/issue/usable-return totals; later movement deltas update stock. No imported stock is treated as known zero. Negative balances warn. Damaged returns are separate. No new reservation/stock-allocation policy is introduced; paid-job buying readiness retains its existing gates.
- Stock check and item cost check each due after30days. Quotes need re-check after30days before adoption. Manual price saves confirm today's review. Costs retain currency and optional supplier/evidence; no invented freight/FX assumptions or automatic customer price updates.
- Actual order form reuses matching-country supplier/cost/currency/evidence; stored unit cost remains on that order even if inventory price changes. All existing receipt and material IDs remain intact.
- API denies Sales/Team Lead/Installer/unknown/unsigned roles; same-origin/content-type/size/identity/quantity/HTTPS/version/duplicate-save checks. Preview writes disabled.

## Isolated phone acceptance

Actual modules and handlers, in-memory fictional stores, server `output/audits/inventory-20261025/server.mjs` on4438. No real stock, supplier communications, prices, payments or privileges changed.

At390px: searched cable; saw overdue count/price separately; updated900→1200UGX; counted135m; added quote1100UGX with HTTPS evidence; reviewed/adopted it. Same paid job order prefilled supplier/1100/currency, saved20m order;10m arrival changed warehouse135→145 automatically. Reload preserved both checks, supplier quote and stock. Earlier900 order remained unchanged. Reopened revised form confirmed evidence link prefilled. Added a new cable-tester item with sets; existing job picker reused it and automatically selected sets.

At320px: cost/order/add-item/materials forms and picker without page or dialog overflow. Buttons46px high. Count and quote forms have short labels and cancel/error states. Screenshot item-phone.png plus fictional readback under output/audits/inventory-20261025/. No physical Android acceptance claimed.

Full suite and exact release readback recorded in build checkpoint once verified.
