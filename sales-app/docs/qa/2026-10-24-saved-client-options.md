# Saved payment options to client quote links

Operations: open the same job in Draft payment options, save the costs/terms, then tap **Client quote link**. Review the saved options and equipment, tick the check, create the link and copy/share on WhatsApp. There is no second entry of amounts or client details. Unsaved editor changes are not shared.

Client: one phone page shows cash, 12 months, 24 months and rental (only the plans Operations checked). Deposits, monthly amounts, duration, total and ownership match the saved draft. Rental total is explicitly the first 12 months; rent continues and does not buy the equipment. The client picks a plan, enters a name and ticks Yes. The saved reply is visible on the same job, its payment-plan dialog and summary. It records a choice; agreement/payment/funding approval remain separate. Existing job financial totals stay as saved pending Operations review.

## Validation

- New real-handler regression tests cover all four package sizes and all four exact canonical offers; selected subsets, role denial, privacy, stale versions, explicit staff check, evidence, saved/current cost and chosen margin target, expired Sales prices, published-offer mismatch, existing agreements, changed client, tampered amounts, one-time/idempotent client choices, expiry, revoke and frozen issued snapshots.
- Existing legacy client-link suite remains in the complete suite.
- Isolated phone browser used actual Operations dialog, public page, handlers, draft storage and summary renderer, fictional job `saved-job`, no real records. Rental choice and 12-month choice checked in separate freshly reset fictional runs. A reload kept the choice, exact amounts and ownership. Operations saw the same reply; source workspace remained byte-for-byte unchanged.
- 320/390px checked with no horizontal overflow or console warnings/errors. The phone review exposed oversized checkboxes from a broad dialog input rule. Scoped compact checkbox styling fixed it. A new quote fragment opened in the same tab now reloads the token/page.
- No supplier/client messages, real price publication, payments, account changes or physical Android acceptance.

Evidence: `output/audits/saved-client-links-20261024/`: source-check.json, Operations review/reply phone PNGs, client options and both confirmation PNGs. Fictional examples: 12-month deposit UGX2m + UGX260k x12, total UGX5.12m; rental same first-year amounts with Verisko ownership. These are QA inputs, not newly approved customer prices.

Release verification recorded in CHECKPOINT.md after deployment.
