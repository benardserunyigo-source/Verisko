# Verisko Portal Build Agent

Owner: this project's canonical chat, **VERISKO | Portal Build Agent** (`01a083ec-bd5c-7e21-b0ac-35ba82c4446c`). The owner requested autonomous implementation on 23 October 2026. Skill: `/Users/ben/.codex/skills/verisko-portal-build/SKILL.md`.

## Mission and authority

Keep one simple phone app covering the client journey from first contact to an approved installation. Complete approved work, diagnose failures, fix demonstrated gaps, test and release routine changes without repeated questions. Use judgment for routine implementation details. Do not make up missing business facts.

Autonomy covers scoped source changes, tests, documentation, commits and releases of approved portal functionality. It does not cover buying, transfers, supplier/client/staff messages, actual account privilege changes, destructive data changes, new tracking policies, or new commercial commitments. Those need a direct instruction. A blocked item must not stop independent ready work.

## The client journey

| Step | Person | Required outcome |
| --- | --- | --- |
| Save contact | Sales | Name/contact, interest and next follow-up; keep prospecting contacts until ready. |
| Send for visit | Sales | Tap Send for site visit on the existing contact; reuse its saved notes and send to shared Operations/Team Lead queue. Returned contacts show a reason and can be sent again. |
| Take ownership | Operations or Team Lead | Take or assign the lead; office ownership returns require a reason. Send back to Sales explicitly when the client is not ready, with a reason; preserve earlier visits and earned pay. Keep a clear owner. |
| Visit and quote | Operations or Team Lead | Confirm visit, mark it done, record quote sent. Sales sees progress and adds ongoing interactions. |
| First payment | Operations or Team Lead records; authorized approver approves | Sales sees approved payment; commission accrues once. Recording is not bank transfer. |
| Materials | Operations | Plan quantities for the same paid job, request buying, record supplier quotes/orders and arrivals. |
| Offer installation | Operations | Materials ready, site staff contact, agreed crew fee and existing materials list. Installer accepts or declines. |
| Do installation | Assigned installer | Start with location, complete checks, add photos, record used/left/damaged/missing stock, finish with location and submit for review. |
| Review and return stock | Operations; assigned Team Lead site reviewer within policy | Approve installation checks or return with reason, confirm warehouse returns, track installer payments and balance. |
| Client handover | Assigned site supervisor and client together | Check the finished system; client signs and accepts, supervisor confirms. Fixes keep the same job open for repair and re-review. Client unavailable also stays open. |

Client IDs link all stages. Never ask staff to re-enter the same contact or copy a materials list. Interactions and authorized voice notes remain on the same client. Sales sees progress, not internal costs.

## Role and design rules

Use `../ACCESS.md` for the exact server access policy. Roles are Admin, Operations, Team Lead, Sales and Installer. Site supervisor is an assignment for Operations/Team Lead, not another role. Admin preview is fictional, view-only and isolated. It is not authentication proof.

Grade 6 English; phone-first; four main navigation buttons; small sub-actions; generous tap targets; clear empty states; predictable choices; no redundant fields. Use the current `../NAVIGATION.md`. Follow one client through all relevant roles when changing a workflow.

## Business invariants

Do not silently recalculate economics from old quotes or historical handoffs. Read the actual pricing model, approved private budget and pricing QA docs before pricing changes. Current owner decisions to preserve:

- Packages: 4, 6, 8 and 12 cameras. Up to 8 cameras use an 8-channel NVR. Hard drive is an add-on. Simple/Complex reflects cabling and crew work.
- USD purchase rate UGX 4,300; freight USD 13/kg standard or 18/kg express includes customs and clearance. Never add those costs twice. Chargeable weight still needs actual shipping evidence.
- Cable allowance 50 m/camera. Base crew cap UGX 350,000, materials separate; six or more cameras adds UGX 50,000 crew bonus.
- Fixed fee tiers UGX 1m for 4, 1.5m for 5–6, 2m above 6, plus UGX 200k income before tax. Financing comes from the fee. The later minimum before-tax margin is 26%; preserve the implemented floor and cost reserves rather than promising every fixed tier will always meet it. Billing rounds in UGX 10,000 increments.
- Standard plan 40% at installation, 30% after 30 days, 30% after 60 days. Legacy Brian contract terms are separate.
- Internal Operations view separates cost of doing business and profit. Customer quote keeps its existing structure without exposing internal profit.
- Twelve months of callbacks and site health monitoring with a mini PC stay within the callback budget. Monitoring does not grant footage access. Two-year camera/cable replacement covers faults only. Do not invent cost inputs or extend the warranty.
- Sales: UGX 15,000 per qualifying completed client visit; UGX 50,000 at three distinct completed client visits that week; UGX 100,000 once on first approved payment; due Monday. Bookings alone do not qualify. Read `../SALES-PAY-POLICY.md` for period/idempotency details. Accrued pay is not a disbursement.

## Location and evidence

Distinguish the shift from the individual job. Sales/Team Lead shifts have consent, reminder checklist, check-in, pause, resume and check-out. Pauses stop route capture and exclude time. Offline check-out says waiting to sync until confirmed. Native Android is needed for locked-screen tracking; the website cannot promise it.

Client visits for Sales/Team Lead/Operations and installer job sessions record start/finish locations and time, not a continuous installation route. Operations' active dashboard shows open work and refreshes; elapsed time and GPS are not proof of productivity. Preserve consent and retention rules. Do not expand surveillance implicitly.

Read `../CLOCK-IN-OUT-TEST.md`, `../ACTIVE-WORK-TEST.md`, `../FIELD-SHIFT-CHECKS.md`, `../VOICE-NOTES-TEST.md`, and `../../../android-field/README.md` when relevant.

## Build loop and release gates

1. Check QUEUE.md, current user direction, Git status and current code. Claim one bounded item; record scope and acceptance criteria. Do not overlap another run or overwrite an active user's edits.
2. Reproduce the gap with fictional data. Implement the smallest coherent fix. Preserve existing IDs, role boundaries, offline queues and idempotency.
3. Run targeted behavioral checks, then `node sales-app/tools/verify-portal.mjs` from the repository root for code changes. UI changes also need phone-sized browser inspection with screenshots; API access changes need positive and negative role tests. No code change means do not rerun the whole suite without a new concern.
4. Review the exact diff for credentials, private budget, real identities/media and unrelated files. Stage explicit paths only. Never `git add .`, reset user changes, force push, or disable checks.
5. For an authorized code release, bump coherent frontend query versions if applicable. New APIs must be routed in both `sales-app/_redirects` and Netlify configuration before SPA fallback. Make a scoped commit. Inspect remote changes before a non-force push; do not include unrelated local commits silently.
6. Verify the Netlify deploy reached ready for the exact source commit, current assets match, and API routes resolve to the intended handlers with proper unauthenticated denial. If credentials or approval are unavailable, preserve the tested changes and record the exact release gap. Never call a push a verified deployment.
7. Update CHECKPOINT.md with commit, tests, screenshots and each verification boundary. Mark completed queue items once with evidence. Report only meaningful progress or a genuine decision/blocker.

## Consolidation

Checked local skills, automation definitions and Verisko chat inventory on 23 October 2026. No separate Verisko build skill or active portal build schedule was found. This existing implementation chat becomes the single managing agent; no duplicate chat is needed. Older **VERISKO | Operations** is business/reference history. Marketing, supplier research, guest-house sourcing and the parked China-direct idea remain outside this build. Nimara's Operations Desk and paused attachment filer are not portal agents; do not modify them.

Historical `../CODEX-HANDOFF.md` predates current releases and contains obsolete test counts/backend assumptions. Use current module docs, code and new evidence instead. Current queue and checkpoint take precedence over old suggested backlog, subject always to the latest direct user instruction.

## 24 October pricing-control update

Operations/Admin can save package prices for30days; Sales receives the active list and expiry, no costs/profit. Expired lists require Operations review, not an automatic invented market adjustment. Saved/agreed client quotes retain their existing commercial lock and quote-validity rules. Operations can select26–50% before-tax quote/draft-option margin, including rental. Ben explicitly chose50% margin maximum for rental instead of100% markup. The26% safety floor remains; draft target edits are not a published price list or a client contract.
