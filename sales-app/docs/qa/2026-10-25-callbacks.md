# Completed-job callbacks — v165

Approved scope: Operations records callbacks on existing completed installations, assigns a technician, self or any active staff account, records expenses and requires proof of the fix. No pricing, warranty or account changes.

Implemented Jobs → Callbacks for all active staff roles. Operations/Admin manage all; others receive only assigned callback records, without installation data or office costs. New callback selects an existing completed job and copies the same source/contact IDs, business and site context. Types are simple choices. States: Assigned → In progress → Waiting for review → Closed; Operations can ask for a fix/reopen with a reason or change the assigned person/date. Fix report requires a finished-work photo, test confirmation and explicit costs/no-cost confirmation. Fresh proof is required after a return/reassignment/reopen. Each cost requires amount, date, description and a saved receipt. Costs can be cancelled with a reason, with history preserved.

Cost scope: this is a callback cost log. It does not create a payment or a second cash-book entry, approve expenses, change historical job totals, or consume warehouse stock. Normal cash controls remain separate. Callback saves require a connection; no offline queue or actual handset acceptance claim.

Validation:
- Four new behavior tests exercise all five staff roles, self/other assignments, inactive/unassigned/anonymous rejection, completed-job requirement, private photos, mandatory repair proof/tests/cost checks, Operations-only review/close/reopen, fresh proof, receipt-backed costs, cancellation, stale versions and retry-once costs.
- Existing navigation test updated to include assigned callbacks while keeping installer default Jobs entry on installations and denying office pages.
- Actual isolated Operations4490/Installer4491 phone UI: selected completed DEMO Simple Journey once, assigned installer, started callback, uploaded labelled sample repair/receipt photos, saved20K transport cost, sent repair, Operations viewed proof and closed. Reopen/reason paths exercised by behavior tests.
- Readback: one closed callback, two photos, one20K expense, original source job/contact IDs retained. Original installation and sign-off not rewritten.
- Reload retained record/cost;320px document width equals scroll width;390px screenshot visually checked. Uploads have keyboard-focusable buttons. All changes use existing four primary navigation groups.
- Evidence output/audits/callbacks-20261025/{final-state.json,closed-phone.png}; fictional local storage only.

Release: pending final full-suite and exact Netlify source/assets/API readback. Existing v164 remains live until verified.
