# Build checkpoint

## Agent setup: 23 October 2026

Canonical chat: VERISKO | Portal Build Agent (`01a083ec-bd5c-7e21-b0ac-35ba82c4446c`). Skill installed at `/Users/ben/.codex/skills/verisko-portal-build/`. WORKFLOW.md contains authority, business invariants, ownership and release gates; QUEUE.md contains remaining work.

## Existing evidence

Latest repository commit at setup: `283ab23` (clock verification), preceded by `a990bfd` (field Start/Finish persistence) and `34397b8` (Operations active-work dashboard). The app's latest functional release is v127 according to existing QA records; this setup does not independently reverify production.

`../CLOCK-IN-OUT-TEST.md` records 489 passing tests and isolated browser/server verification. `../ACTIVE-WORK-TEST.md` records Sales, Team Lead and Installer lifecycle checks. These use fictional accounts and sample GPS. They do not establish actual Android locked-screen or real staff-device acceptance.

Setup preserves unrelated `.gitignore` edits and untracked business files. No production client, account or financial record was changed.

## Setup validation

On 23 October 2026 the installed skill passed `quick_validate.py`. The new private-input-safe runner `node sales-app/tools/verify-portal.mjs` ran the full existing suite: **489 tests passed, zero failed**. No application behavior changed during agent setup.

Hourly thread heartbeat `verisko-portal-build-agent` was created ACTIVE for this canonical chat. It advances only ready approved work and stays quiet when there is nothing actionable or an unchanged device/decision blocker. Local scheduled work requires this machine and the desktop app to remain running. This is the only Verisko portal build schedule found/created; no unrelated schedules were changed.

## Continue here

Start with the highest-priority ready item in QUEUE.md. Update this checkpoint with new evidence rather than changing historical verification claims. Record any schedule identifier after its successful creation. A skill is reusable instructions; the project chat is the owner, and a heartbeat is the scheduled runner, not an always-on server.

## Full journey audit: 24 October 2026, Uganda time

Completed the approved journey and role-access audit. Added owner/Admin visit rescheduling with a reason, same appointment ID and protected Sales progress. Completed visits remain fixed. Full suite: **492 passed**, including stale-save recovery, once-only visit pay and denied cross-role installation/payment/stock commands.

Phone QA used fictional Sales, Operations and Installer accounts, local real HTTP handlers and 390 × 844 viewports. Sales saved/submitted one existing contact without re-entry; Operations changed the visit time and Sales read the updated time. Installer job/checks/materials screens fit the phone width. Evidence and coverage map: `../qa/2026-10-24-full-journey-audit.md`.

Release v128, source commit `4d7d1e2239b83b331ad14ca94d7d75a34a13b4a9`, reached Netlify ready. Deployed app and ready-queue module hashes matched local files; HTML references v128 (Netlify adds a hosting comment). Unauthenticated data/queue/installer/voice/client-work APIs returned JSON 401. The public fictional Operations preview loaded without console errors. Readback: `output/audits/full-app-20261024/release-readback.json` from the repository root. No real staff/customer/financial records were changed. Android handset pilot and real authenticated cross-device checks remain pending.

## Fresh full browser journey: 24 October 2026

User requested a full end-to-end run. Re-ran all 492 automated tests successfully, then completed a new empty-workspace browser journey across Sales, Team Lead, Operations, Admin and Installer through actual app forms. Created a priced quote, approved first payment, planned/ordered/received materials, offered/accepted work, dispatched stock, saved four cameras' checks and 22 uploaded images, finished time/handover, submitted, received 20 metres of leftover cable and approved. Reload retained Completed; Sales saw Installation approved and UGX 115,000 accrued once. Independent local HTTP readback confirmed one of each linked record and denied unrelated-account visibility.

One discrepancy is open: source Job records stage stayed Sent after technical installation completion. Added the bounded reconciliation task to QUEUE.md. Do not claim unconditional full-app acceptance from the green suite. Details: `../qa/2026-10-24-browser-end-to-end.md`; fictional evidence: `output/audits/browser-e2e-20261024/verified-records.json` from repo root. Production and actual Android limits remain unchanged. No app-code changes or deployment were made for this test.

## Job-record approval sync fix: 24 October 2026

User authorized correcting Job records after installation approval. Implemented server-derived Installed on the existing source job, canonical status in save responses, safe entry/background refresh of Job records, and reuse of the existing chosen quote's first payment and approved installation date. No new funding approval or agreement dates are invented. Handed over/cancelled/rejected stages are preserved.

Full suite: **496 passed**. Browser tested a submitted fictional installation, approved it, returned directly to Job records, filtered Installed and reloaded. Stage changed from Sent to Installed; exact full-job comparison showed all other fields unchanged and the payment record stayed identical. One job and one payment remained. Evidence: `../qa/2026-10-24-job-approval-sync.md`. Released v129: `f8cddec27bdfdf8c447dd51f224da6fc852df0a8` reached Netlify ready. Production app.js matched the tested local hash, HTML referenced v129 and the three affected API routes returned JSON 401 without authentication. Public Operations preview opened correctly. No real staff/customer/payment records were changed. Android acceptance remains pending.

## Android pilot direct download: 24 October 2026

Owner requested a link for phones. Added the existing 0.3.0 pilot APK at `/downloads/verisko-field-0.3.0-pilot.apk`, its checksum and explicit APK response headers. Local SHA-256 matches the original CI artifact: `1d5d4f6dce42175894699a94a8735fc4e4b1aa6a3830fc15815c5c5c75cea8d5`. No app behavior or permissions changed. Release `a8b9be229d2b9831b3904a400126084101535adc` reached Netlify ready. Live HTTPS GET returned 200, 1,203,702 bytes, correct APK content type and attachment header; SHA-256 exactly matched the original artifact. APK ZIP integrity passed. A local TOML parser check could not run on system Python (no tomllib); Netlify parsed the configuration and the live headers verified it. No app behavior changed, so the full application suite was not repeated. This is pilot distribution, not physical-device acceptance or a Play Store release.

## Accessibility, simple use and client sign-off: 24 October 2026

Owner requested a fresh whole-app audit through client sign-off. Added a server-checked client acceptance record on the original job after approved technical work, five final client checks, care/test references and server attribution. Preserved original acceptance on stale saves and kept its evidence office-only while Sales/Team Lead see final progress. No price, payment, warranty or tracking policy change.

Fixed demonstrated sign-in keyboard escape, unnamed note fields/dialog, radio arrow navigation, low text contrast, missing input/focus boundaries and Installer photo-button overflow at 320px. Added explicit job editing/direct linked-installation navigation, removed duplicate installer/material entry for linked jobs and collapsed old/manual tools and locked quote detail. Ordinary Draft quotes are not blocked by hidden handover fields.

Full suite: **501 passed**. Real-handler contact→client-handover case and local browser sign-off/reload, Sales progress, keyboard/error focus and 320px/390px checks passed. One of each client/quote/deposit/installation remains; 22 photo records, correct stock returns and unchanged quote/payment verified. Evidence: `../qa/2026-10-24-accessibility-and-client-handover.md` and `output/audits/accessibility-handover-20261024/`. Actual Android/TalkBack/media-content acceptance remains pending. v130 release pending exact-commit deployment readback.
