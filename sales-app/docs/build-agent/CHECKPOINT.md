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
