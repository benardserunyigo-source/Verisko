# Simpler staff workflow —26 October2026

## Approved change
Implemented the owner's simplification recommendations without removing underlying tasks, changing server permissions or changing pricing/pay/approval policy.

- Operations/Admin main buttons: Today, Contacts, Jobs, Money. Stock and fixes sit under Jobs. Payments, Requests & pay and Needs approval sit under Money. Team access stays in existing Admin tools.
- Daily navigation menu: Sales8, Operations14, TeamLead8, Admin15 =45 versus66 previous destinations (31.8% fewer routine menu entries). Existing contextual routes remain authorized exactly as before. This is a menu reduction, not a measured31.8% gain in completion speed.
- Contacts opens the existing role-scoped directory, including progressed clients. Advanced Sales/due-date filters and team summary start collapsed. Contact cards reuse the existing canonical progress helper so a signed-off client is not labelled only Site visit requested.
- Open contact uses the existing job when there is one, offers that contact's jobs when there are several, or opens the same visit/contact record. Sales/TeamLead receive their existing private-safe progress view. An unsent saved contact remains editable with its existing values.
- Job details start with current status, next action, responsible person/role and known date. Missing dates stay explicitly Date not set. Other tasks/details expand below. Office totals are collapsed on the Jobs list and do not push a selected job's next step below the fold.
- Return to this job preserves source selection across materials, stock, quotes, payments, repairs and installations. Visit details focus the same saved contact. Context is account-bound and cleared at sign-out. No new client/material/cash record is created for navigation.
- Approval list includes pending entries from earlier periods. Period cash totals retain their existing rules. An empty filtered list does not suggest adding the same payment again.

## Tests and phone evidence
705 complete portal tests pass, zero fail. Updated navigation expectations cover the approved grouping; new regressions cover daily menu counts/contextual access, re-opening the selected job, multiple quotes for the same contact, Admin/installer next-step ownership and earlier pending cash visibility without changing totals.

Re-ran the fresh real-handler contact-to-closeout/callback/money/stock integration. One contact, one quote, one materials plan and one installation; six once-only cash rows; client0/installer0;20m returned; callbackClosed. No business amounts or private scopes changed.

Actual fictional browser sessions:
- Operations Contacts → same job → Materials → Return to this job: same TEST-Q-001 and client retained, no typing of contact/material identity.
- Active paid job shows one main Plan materials action, Operations owner and explicit unset date; returns from unplanned material page to the same next step.
- Money's three tabs open the intended records/filter. Empty approvals show No payments in this list rather than prompting another payment.
- Sales Open progress and TeamLead Open contact focus that client's existing progress, without costs/payroll/office cash. Admin has the new main navigation and retains its existing tools.
- Operations, Sales, TeamLead, Admin320px layouts have no horizontal overflow; inspected390px next-step screenshot. No errors observed on the inspected role pages.
- Evidence: output/audits/simplicity-20261026/next-step-phone.png; active-demo.mjs/server.mjs. Existing full journey result remains output/audits/full-app-20261026/result.json.

## Boundaries
No real client/financial/account/stock writes or external messages. Physical Android/background tracking/audio/TalkBack acceptance remains the existing separate handset pilot. Hard reload still follows the app's normal home behavior; job context is retained during in-app navigation, not promised as a cross-device session.

Release source/assets/API checks follow the scoped deployment.

## Release verification

Live v171: source `e6bd730a8072c35bfd79a4c4b087e415b6a38c6f`, ready deploy `6adf6ab45140d2f208defa67`. All 42 assets verified (known apply anchor rewrite normalized); 11 private endpoints return JSON 401 without authentication. Live read-only Operations preview has the new menus and job list. Latest loaded local runtime clears job return text and hides its bar on sign-out. No real client or financial records changed.
