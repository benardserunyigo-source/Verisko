# New Operations hire: journey and funnel audit

25 October 2026. Current app source: v163 / bd8d469. Audit only: no app implementation, commercial change or release in this run.

## Decision

The client journey is connected and can finish without creating a second contact or copying the installer materials list. It is not yet as easy as it should be for an untrained Operations hire. The biggest gap is next-step guidance: the screen can send staff to materials while the required payment is still awaiting approval. Quote and visit completion also need clearer handoffs.

Do not describe the portal as fully field-accepted. A real Android/operator trial is still outstanding.

## The funnel

These are checkpoints for one fictional audit job, not real business conversion figures.

| Step | Owner | Audit result | Same record? |
| --- | --- | --- | --- |
| Contact saved | Sales | 1 saved through the phone UI; name, phone and area entered once | Yes |
| Ready for visit | Sales | One-tap send; Operations sees saved details and salesperson | Yes |
| Visit taken and confirmed | Operations / Team Lead | Operations takes ownership and confirms date/time | Yes |
| Visit completed | Visit owner | Sample GPS start/finish saved; separate Mark visit done action | Yes, but two completion actions |
| Quote | Operations | 1 quote created from visit; client and site autofill | Yes, with sent-status caveat below |
| Deposit approved | Admin | 1 receipt approved; Sales earns 15K visit + 100K commission once | Yes |
| Materials ready | Operations | 4 cameras + 150m cable held; only 50m cable ordered/arrived | Yes |
| Installer assigned | Operations / Installer | Phone offer reuses client/materials; installer accepts | Yes |
| Work checked and approved | Installer / Operations | 4 cameras, 22 sample images, finished time; 20m usable cable returned | Yes |
| Client sign-off | Assigned supervisor + client | Joint acceptance; linked job becomes Handed over | Yes |
| Money still due | Operations / Admin | Final summary keeps UGX 3.17m client balance and UGX 350K crew balance | Yes; installation acceptance is not financial settlement |

Fresh fictional IDs: contact `vmvol6s705yd4l`, quote `vmvol9g3po7p56`, installation `materials-5ccc934fd0e38a639176f63b`. Final counts: 1 contact, 1 appointment, 1 quote, 1 materials plan, 1 installation and 1 client receipt. Stock available: 20m cable. No extra Sales commission or duplicate stock return.

## Findings and actions

| Priority | Finding | Evidence / effect | Recommended change |
| --- | --- | --- | --- |
| High | Main next step can require an approval that has not happened | Fresh quote with UGX 2.11m pending: Jobs → Open job summary promotes **Plan materials on the same client**. It opens **No paid jobs yet**. The server correctly blocks premature materials work; the guidance is wrong. | Show **Waiting for Admin to approve payment** first. Do not promote materials until the same job is eligible. Keep permission/approval rules unchanged. |
| High | Recording quote sent can lose the saved-quote association | After saving the default Draft, **Record quote sent** offers a blank optional reference rather than the saved quote. Saving gives queue **Quote sent**, but the quote stays Draft and `quoteSent.sourceId` is empty. Attempting to link that quote after moving it to Sent returns 409, already recorded. Later material/installation links still use the existing quote ID; no duplicate job was created. | When an app draft exists, guide staff to finish/share that quote and confirm sending with its ID. Keep genuine external quotes supported. Provide a guarded correction path for a blank association; do not silently change historical terms. |
| Medium | Two different visit completion actions | **Finish visit** records time, but staff must close the timer and choose **Mark visit done**, entering finish date/time again. Pay/assessment approval and work timing are intentionally separate; the current UI makes this distinction easy to miss. | After timer finish, offer **Confirm site assessment done** using the recorded time as the default. Keep explicit confirmation and the existing pay gate. |
| Medium | Quote form is too dense for a new hire | **Create quote** opens **New job**, with client, job costs, evidence, margin, financing, many add-ons, zone, stage and notes in one form. Helper still refers to Prospects while navigation says Contacts. | Use a short quote flow: Scope → Costs → Client price → Review/share. Keep advanced costs and rare add-ons below a clear expansion. Use **Create quote**, **Contact** and **Job details** consistently. |
| Medium | Known quote quantities are not proposed in material planning | Source review: `materials-ui.mjs` starts a new plan with a blank item row. Quote already has camera count and a 50m-per-camera cable allowance. Assignment then correctly reuses the saved materials list. | Offer a reviewable starter list from the saved quote. Do not assume camera shape/model or accessory quantities; let Operations confirm them once. Never overwrite existing orders, allocations or actual surveyed cable needs. |
| Medium | Two audiences still see too much installation history before the next action | Current completed phone UI has accepted-job, technical approval, joint sign-off, work-time, handover and disabled checks sections. The data is correct, but new staff must scan a long page. | One compact status area: Checks approved / Client signed / Money left. Keep photos, work rules and history behind short detail buttons. Label 8/8 as installation progress so it is not read as all money settled. |

No newly demonstrated missing client, duplicate payment, duplicate commission or duplicate usable-return movement was found. The two high findings above are handoff/data-association risks; the observed materials gate did not allow an unauthorized purchase or stock issue.

## Verification and limits

- New phone UI walkthrough on isolated ports 4480/4481: Sales contact/send; Operations take/confirm, visit timer, complete, quote save, sent status, pending payment, job summary, materials readiness and installer offer. Client/site details and staff phone reused.
- Remaining stages on that same fresh job exercised through real HTTP handlers in `advance.mjs` / `finish.mjs`, then read in the actual Operations and Sales app. These automated steps are not represented as a second complete UI walkthrough. The immediately preceding same-job warehouse demo already exercised installer checks/photo file uploads, Operations approval and joint sign-off in the actual UI; its evidence remains separate.
- Full suite rerun for this requested audit: **667 passed, 0 failed**. Includes ownership/return, saved client plans and approval, payment retry/commission, warehouse concurrency, installer decline/corrections, cable exceptions, client fixes/unavailable/signature permissions and role boundaries.
- Fresh handler checks: installer cannot approve; Operations cannot technically approve before stock receipt; replaying the same warehouse receipt keeps one return; unrelated Sales/Installer see no client/job; Sales/Team Lead stock API denied; client signature hidden from installer. Sales actual screen shows Client signed off and UGX 115K earned.
- Jobs summary at 320px has no horizontal overflow. Main inspected layout is 390×720. Physical Android, weak-network recovery, TalkBack, large-font usability and unaided staff completion remain unverified here.
- All data, GPS, signatures and photos fictional. No live clients, stock, money, access, messages or production configuration changed. Fresh quote-sent status was logged as a demo action; no WhatsApp message was sent or delivery claimed.
- The second local role origin initially failed the origin check; corrected only the test proxy to preserve the same-origin request context. This was a harness problem, not a production defect.

Evidence: `/Users/ben/Verisko/output/audits/new-hire-journey-20261025/` contains server, isolated helper scripts, pending/material/final snapshots, access assertions, test counters and phone screenshots. Actual audit session: http://127.0.0.1:4481/ . Previous paid-installer/client-signoff session remains unchanged at http://127.0.0.1:4476/ .

## Order of work

1. Fix the two demonstrated next-step/quote-association problems with regression tests.
2. Join the visit timer to the assessment confirmation visually, without automatically awarding pay.
3. Shorten quote/material/installation screens around the next task, preserving current prices, roles and approvals.
4. Have one real Operations hire complete a fictional job on an Android phone without coaching. Record where they stop or ask for help before calling it ready for an untrained hire.
