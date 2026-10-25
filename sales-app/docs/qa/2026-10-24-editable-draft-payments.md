# Editable saved draft payment amounts

Operations/Admin opens the same 4/6/8/12-camera job under More → Draft payment options, or Job summary → Draft costs & profit. Job costs are under a short expandable section. Pay in full has one total; 12/24-month plans have deposit and monthly payment; Rent has setup fee and monthly rent. Each option shows live total, estimated profit and margin. A red text warning flags unrounded margin below 26%. Save draft stores costs and all four payment options together. Use saved draft restores both to the last acknowledged save.

Payment amounts must be whole UGX 10,000 steps. Cash must be positive with no monthly payment; the other plans allow zero deposit but require positive monthly payment. Plan lengths, ownership and rental-first-year semantics remain fixed. Invalid input hides stale totals/profits and disables Save. Estimates still include the existing contingency/care, fees, missed-payment allowance and negative-cash financing. Changing deposit affects borrowing; changing total affects fees/profit. No automatic price increase or plan approval.

The existing private draft store keeps canonical server-validated plans/results, version and saved by/time. Costs and plans share one conditional version save, with idempotent retries. Missing options on an older cost-only save preserve existing saved terms. Older default drafts remain compatible; changed job/client count remains blocked. Other roles cannot read or save. No source quote, client agreement, receipt, commission, budget or customer catalogue/calculator/PDF/client link is changed.

## Evidence

- Full suite: 590 passing. Custom plan arithmetic checked independently, plan metadata/IDs/increments/unsafe inputs validated, custom terms saved/reopened across all package sizes, legacy cost-only saves preserve terms, retries/stale writes and role denial covered.
- Isolated actual UI/backend at 390px: edited all four options on a fictional four-camera job, including below-floor 12-month/rental choices; saved and reopened identical costs/payment fields, comparison/profit tables and saved timestamp. Edited care saved with the same terms. Six/eight/twelve-camera jobs also saved and reopened custom zero-deposit/monthly terms. Source records unchanged.
- Invalid UGX5,000 monthly payment disabled Save, hid totals/profits and showed the field error. Use saved draft restored the saved amount. Two sessions: stale save was rejected and retained the edited deposit; Reload saved draft recovered the current monthly amount.
- 320px fields stack in one column, 390px fields align in pairs, tap heights at least48px, no horizontal document overflow or console errors. Local full Operations preview permits fictional edits/reset but Save stays disabled.
- Evidence: output/audits/editable-draft-payments-20261024/ (tests.log, browser-readback.json, store-readback.json, server.mjs and payment-save-phone.png). Fictional data only.

Release verified: v146 source6765d667d54ee6844c78d8fb58e6529095ff71fb; Netlify6add5f151b10ece423006bac ready. Twelve asset hashes match and eight private endpoints return JSON401 unsigned. Live Operations preview updates edited totals/profits/warnings, with Save disabled, no overflow and no console errors. Authenticated production saves and actual Android acceptance are not claimed.
