# Editable draft cost scenarios — 24 October 2026

Owner requested Operations edit draft costs and see all four profit estimates update, flagging below 26%, with customer pricing unchanged. More → Draft payment options now contains three UGX fields: materials/delivery/crew, care/callbacks, sales/office costs. Existing contingency, payment fee and finance assumptions remain fixed. Care and business inputs replace their old allowances once; they are not added on top.

A scenario is held only in the mounted page. No API writes or browser storage. Use saved costs resets the original authenticated budget; in fictional preview it says Use sample costs. Leaving the page, reloading or signing out discards edits. This is a draft calculator, not an edit to the shared budget or a saved job. No quote prices, plans, PDFs, client links or accepted terms change. Operations/Admin only; real input privacy remains enforced by the existing API. Preview allows only the new local calculator fields/reset, while other writes remain blocked.

Blank, negative, fractional, malformed, infinite or unsafe entries hide cost/profit and show an inline error; explicit zero is permitted for care/business, not direct work. Whole UGX with standard comma grouping is accepted. Focus stays in the same input as results update. A polite status reports low-margin count. Reset restores costs and clears errors. Missing private budget does not get fictional or zero values.

All 569 tests passed. Six new tests cover all-plan recomputation, immutable saved budgets and prices, exact replacement of allowances, invalid/recovered values, reset, isolation between scenarios, stopped/other-role access and preview scope. Existing real-handler private-input role checks continue to pass.

Local real app at 4415, fictional Operations preview: direct cost 2,630,000 makes only Cash below 26% (25.87%); the other margins are 26.17%, 27.76%, 26.17%. Blank input hides estimates; reset restores initial costs. Care and office fields update; Home → More → Draft options restores original sample costs. Focus, editable preview controls and 320/390px bounded layout checked. No real records changed. Evidence: output/audits/draft-cost-editor-20261024/. Physical Android and authenticated production acceptance remain separate.

v142 prepared; release pending.
