# Verisko Uganda Operations — Handoff for Codex

You are taking over an in-production web app. This document is everything you
need to work on it safely. Read it fully before touching code.

## 1. What this is

**Verisko Uganda Operations** is a mobile-first (≈94% of use is on phones) PWA
for a Ugandan CCTV / security-installation company. It runs the field team's
whole workflow: prospects → site visits → jobs (quote → install → handover) →
cash-flow reconciliation, with role-based access and an audit trail.

- **Local code:** `/Users/ben/Verisko/sales-app/` (only this folder is the app;
  other files at the repo root are unrelated — do **not** touch them).
- **Live URL:** https://verisko-sales-2026.netlify.app/
- **Repo:** git at `/Users/ben/Verisko`, branch **`main`**. Hosted on Netlify
  (auto-deploys on push to `main`; Netlify site name `verisko-sales-2026`,
  base directory `sales-app`). Current asset version: **v=62**.
- **Where the data lives:** one JSON document in Netlify Blobs (store
  `verisko-sales`, key `app-data`) plus one blob per photo (store
  `verisko-receipts`). Nothing lives in Supabase except the login accounts.
  The Owner can read all of it any time through the **live data export**
  (§6a) or the **Verisko Live Data** Google Sheet in Verisko OS →
  01 Leads & Quotes.

## 2. Tech stack (deliberately minimal — keep it that way)

- **Frontend:** one vanilla-JS IIFE in `app.js` (~2,900 lines), `app.css`,
  `index.html`, plus two small pure modules loaded before it:
  `cashflow-report.js` (period maths), `quote-pdf.js` (quotation model,
  PDF drawing, share text), `closed-sales.js` (closed sale follows the
  accepted quote or a recorded deposit) and `commission.js` (weekly pay
  week + both commission types). **No framework, no build step, no bundler, no npm
  runtime deps.** The one vendored library is `vendor/jspdf.umd.min.js`
  (jsPDF 2.5.2, MIT), loaded on demand by `loadJsPdf()` the first time Jobs
  opens — never on the login or Today screens.
- **Backend:** three Netlify Functions (ES modules):
  - `netlify/functions/data.mjs` — shared data API (`/api/data`), backed by
    **Netlify Blobs** (store `verisko-sales`, key `app-data`).
  - `netlify/functions/receipt.mjs` — photo upload+fetch (`/api/receipt`),
    Netlify Blobs store `verisko-receipts`. Any signed-in team member may
    upload (Sales attach business photos, Ops/admin attach receipts).
  - `netlify/functions/export.mjs` — read-only CSV/JSON export (`/api/export`)
    for spreadsheets, gated by the Owner's export key (§6a). Pure helpers
    `buildTables` / `toCsv` are named exports so they can be unit-tested.
- **Auth:** Supabase **email OTP magic-link**. The Supabase **publishable** key
  in `data.mjs` is public and safe to ship. **Never commit the `sb_secret_`
  service key.** Auth flow: Supabase verifies the token; the verified email must
  be on the `users` allow-list; the first sign-in on an empty workspace
  bootstraps the owner.
- `netlify.toml` — security headers incl.
  **`Permissions-Policy: … geolocation=(self)`** (required for the GPS pin).
  **Routes live in `_redirects`**, which overrides the `[[redirects]]` in
  `netlify.toml`: a new `/api/*` route must be added to `_redirects` or the
  catch-all `/* /index.html` swallows it.

## 3. Golden rules (the user enforces these)

1. **Always push live.** "Commit" means commit **and** `git push origin main`.
   Never leave work only local. Netlify deploys automatically.
2. **Bump the cache version on every asset change.** In `index.html`, both
   `app.css?v=N` and `app.js?v=N` must be incremented together (currently 44).
   Skipping this ships stale JS to users' cached PWAs.
3. **Only modify `sales-app/`.** Leave the rest of the repo alone.
4. **Verify before claiming done.** `node --check app.js` for syntax, then a
   browser smoke test (see §7). After pushing, poll the live URL for the new
   `?v=` before saying it's live.
5. Match the existing code style: terse vanilla JS, string-concatenated HTML,
   helper functions, in-app modal sheets (no native `alert/confirm/prompt` —
   they're suppressed in webviews; use `openSheet`/`confirmSheet`).

## 4. Data model (the shared app-data blob)

```
{
  prospects[],     // sales leads + audit (photo, GPS pin, review status, follow-ups, closedSale)
  appointments[],  // site visits (reference a prospect)
  users[],         // team roster; users[0] is the Owner
  transactions[],  // cash-flow entries (money in/out), linked to jobs via installId
  jobs[],          // the quote→install lifecycle (see §6). Replaced old quotes[]+installations[]
  technicians[],   // installer roster (no login)
  config{}         // commissionPerSale, commissionTarget, commissionRule, exportKey (pettyLimit is vestigial/unused)
}
```

- **Client state** lives in `localStorage`: `verisko_sales_app_v1` (data) and
  `verisko_sales_settings_v1` (auth + current user + onboarding). It syncs to the
  server blob via `/api/data` (pull on load, push on save). Offline-safe: writes
  survive locally and re-push on reconnect; receipt photos queue in IndexedDB.
- `quotes[]` / `installations[]` are **deprecated** — folded into `jobs[]` by
  `migrateToJobs()` on load. The server still accepts them (normally empty) for
  transition; they can be dropped once every client is on v≥42.

## 5. Roles & permissions

Three roles, resolved from `settings.user.role`:
- **admin** — the Owner (`users[0]`) and any "Technical" account. Full access;
  the **only** role that can **approve** cash entries and prospects.
- **operations** — records cash in/out, manages jobs/technicians, reviews
  prospects. Cannot self-approve.
- **teamlead** (since v=53) — sees every rep's prospects and visits
  (`scopeForTeamLead`), approves qualified prospects (UGX 2,500 each) and
  records client deposits from a prospect card. No cash book, jobs, settings
  or team emails; can't edit other reps' records (`mergeTeamLeadWrite` keeps
  only the qualification decision — approve, disqualify, re-open — the planned
  follow-up, call notes they logged themselves, and new money-in entries,
  always `pending`, stamped with their email). Operations/admin can assign
  the role.
- **sales** — prospects + site visits + a personal dashboard only. Never sees
  cash flow, jobs, or settings, and **never sees another rep's records**
  (since v=52). The server scopes it (`netlify/functions/scope.mjs`, tested):
  `scopeForSales()` makes a Sales GET return only prospects whose
  `createdByEmail` is theirs, the visits on those prospects, minimal job
  stubs and approved client payments for those clients (for the commission
  dashboard), themselves plus Operations/admin by name only (no emails), and
  only the commission settings. `mergeSalesWrite()` folds a Sales POST back
  into the full workspace: other reps' prospects/visits stay as stored,
  records the device sends that belong to someone else are ignored, and a new
  prospect is stamped with the sender's email. In the app, `visibleProspects()`
  / `visibleAppointments()` filter Today, Prospects, Visits and the visit form
  for Sales too, covering phones with an older full cache. Prospects with an
  empty `createdByEmail` (demo/legacy) are visible to no salesperson.

Gate helpers in `app.js`: `isAdmin()`, `canCashflow()`, `canReviewProspects()`,
`canInstalls()` (ops+admin). Nav: 4 primary tabs (Today, Dashboard, Prospects,
Visits) + a **"More"** sheet holding ops/admin extras (Jobs, Cash flow, Settings).
Every nav button carries an `aria-label` (the visual label alone was not
exposed to screen readers); keep that when adding a tab.

**Server-side enforcement** (`data.mjs`) mirrors the UI — never trust the client:
non-reviewers can't self-approve prospects/transactions; `jobs`/`technicians` are
ops/admin-only (any other change is reverted to stored); the roster is sanitized
so ops can't grant admin or edit Owner/Technical. Add matching server rules for
any new privileged data.

## 6. Key subsystems

- **Prospects + audit:** business photo, **required GPS pin for Sales** (captured
  on-site; `captureGeo()` returns `{geo,error}`; `saveProspect` blocks a
  non-reviewer's new prospect without a pin — optional for reviewers), a review
  queue (approve/send-back) with a nav badge, follow-up log with location, and a
  **closed-sale → commission** flow. Since v=51 nobody marks a sale closed by
  hand: `VeriskoClosedSales.reconcile()` (`closed-sales.js`, tested) sets
  `closedSale`/`closedAuto`/`closedBy="Quote accepted"`/`closedAt` when any of
  the prospect's jobs reaches Accepted or a later delivery stage, and clears
  them when every job is back to Draft/Sent or Rejected/Cancelled. Prospects
  with no job keep whatever they had (legacy manual closes). `syncClosedSales()`
  runs only on Operations/admin devices: at boot on cached data, after every
  successful pull, after `saveJob()` and after a job is deleted. Operations
  start a quote from any prospect (card: **Create quote** / **Open quote**;
  prospect form: *Quote & sale* block), not just closed ones. `data.mjs`
  reverts any Sales-device change to the closed fields in either direction.
  The rep earns
  `commissionPerSale` (UGX 100,000 since 28 Sep 2026) **only once the client's
  first payment is recorded and approved** — `firstPaymentFor(p)` looks for an
  approved money-in transaction linked to the sale's job (`installId`) or to the
  prospect itself; `commissionQualified(p)` = closed + paid. Both dashboards,
  the leaderboard and the prospect form use it, and the export carries
  `first_payment_at` / `commission_qualified`. `normalizeConfig()` bumps any
  workspace still on the old rate to 100,000 once (`config.commissionRule = 2`);
  the next sync from an Operations/admin device pushes it to the server.
- **Site visits (`appointments`):** scheduled surveys referencing a prospect;
  confirming requires a complete handoff.
- **Jobs (the merged lifecycle):** one record from quote to handover.
  - Stages: `JOB_STAGES` = Draft → Sent → Accepted → Scheduled → In progress →
    Installed → Handed over (+ Rejected/Cancelled).
  - **Price = `jobValue(job)`** — the single source of truth: rubric-computed
    (`computeQuote`) normally, or manual `finalPrice` for a custom (12+ camera)
    job or an admin override.
  - Progressive form (`openForm("job")`): pricing always; delivery fields
    (schedule/technician/materials) reveal at **Accepted+** (`jobIsDelivery`);
    completion checklist reveals at **Handed over** and gates it.
  - Governance: Very Complex / 12+ cameras / discount >5% needs admin.
  - Payments post to the cash-flow float via `installId` (kept as the link field;
    it now points to a job id). `newJobRef()` = `J-YYYY-NNNN` from the max
    existing number (delete-safe).
- **Cash flow / reconciliation:**
  - Float math: **Float balance** = approved-in − approved-out;
    **`availableForOut(excludeId)`** = in − out over non-`query` entries
    (pending counts) = "cash on hand incl. pending". Money-out can't exceed it.
  - Approval: admins approve/send-back; ops record but can't self-approve.
  - **Proof rule:** every money-out entry needs a receipt (`needsProof(t) = out
    && !proofId && !preapproved`) to submit **and** approve. The recorder can tick
    **"Already pre-approved by the cash-flow team"** (`preapproved` flag) to waive
    the receipt; admin still gives final approval.
  - Methods: Cash / MTN MoMo / Airtel Money / Bank. Receipt photos are
    offline-queued in IndexedDB and upload on reconnect (`flushUploads`).
- **Dashboard:** role-aware — Sales see personal commission vs target; ops/admin
  see a team console + editable commission config + roster management.
- **Settings (admin):** team roster, live data export (§6a), receipt-policy
  note, JSON backup/restore, danger zone.
- **Quotation PDF + WhatsApp share (Jobs):** every job card and the saved-job
  form carry *Quote PDF* and *Share via WhatsApp*. `quoteModelFor(job)` feeds
  `jobClient()`, `computeQuote()` and `jobValue()` into
  `VeriskoQuote.buildQuoteModel()` (pure, tested), `renderQuotePdf()` draws an
  A4 page with jsPDF (navy header + chevron mark, client block, line items
  that always sum to the total, the 60/40 and 40/30/30 payment boxes, notes,
  terms, footer). `shareQuote()` uses the Web Share API with the PDF attached
  (`navigator.canShare({files})` — Android Chrome, iOS Safari); where files
  can't be shared it saves the PDF and opens `wa.me/<client number>?text=`
  with the summary so the user attaches the file by hand. After a job is
  created in Draft/Sent, or moved to Sent, `offerQuoteShare()` asks
  "Quotation ready — Share / Download / Not now". A custom (12+ camera) job
  refuses until `finalPrice` is set. Sharing calls `markQuoteShared()`: a
  Draft becomes **Sent**, `quoteSharedAt` / `quoteSharedBy` are stamped on
  the job (they flow into the export as extra columns and show on the card),
  and if the job's form is open its Stage select is switched too so a later
  Save can't revert it. Downloading the PDF alone does not change the stage. Company details and the terms wording
  live in `COMPANY` / `TERMS` at the top of `quote-pdf.js`.

## 6b. Commission (since v=53)

Paid weekly, every **Saturday at 12:00 noon Kampala time** (UTC+3). The pay
week runs from one Saturday noon (inclusive) to the next (`payWeek()` in
`commission.js`). Two kinds, both credited to the prospect's `createdByEmail`:
- **Qualified prospect — `config.commissionPerQualified` (UGX 2,500).** When a
  rep's prospect reaches Qualified / Appointment proposed / Appointment
  confirmed, `qualificationRequest()` sets `qualStatus="pending"` (from the
  prospect form or a visit status change). The Team lead (or admin) approves
  (`qualStatus="approved"`, `qualApprovedAt` ISO timestamp → counts in that
  pay week). Since v=54 **Operations** can approve too, and either can
  **Disqualify** (any open, not-approved lead, from its card or the queue):
  a reason picked from `DQ_REASONS` (no answer after several calls, not
  interested in cameras / an installation, no budget, not the decision-maker,
  or **Other**, which requires typed text) → `qualStatus="disqualified"`,
  `qualReason`, optional `qualNote`, `qualDecidedAt`, stage **Lost**, no
  commission. The rep sees a "Disqualified — see why" card + badge until they
  tap Got it (`qualSeen`). Only the Team lead / Operations can **Re-open** it.
  Legacy `"query"` (sent back, pre-v=54) still displays. Reps can only
  ask/withdraw — `guardRepQual()` on the server also keeps a disqualified lead
  disqualified and Lost.
- **Follow-ups (v=54).** One sheet for every role: outcome chips (Answered,
  No answer, Call back later, Not interested, Visited, Messaged, Quoted), call
  notes, and the next follow-up date + action. The Team lead and Operations
  can use it on any rep's prospect. Entries are `followUps[]` `{at, by,
  byEmail, role, outcome, note, geo, next}`; GPS only for a rep on their own
  prospect or a "Visited" outcome. Changing the plan stamps
  `followUpPlannedAt/By/ByEmail`. Server (all roles): `keepFollowUps()` makes
  call notes append-only and `keepNewerPlan()` stops a phone with an older
  copy overwriting a newer plan. Cards show "Calls & notes: N · K unanswered"
  and "planned by …"; 3+ unanswered calls prompts the lead to disqualify.
- **Operations' "Qualified — ready for Operations" list** (Prospects): leads
  the Team lead approved that still have no quote (book the visit / create the
  quote).
- **Client deposit — `config.commissionPerSale` (UGX 100,000), once per
  client.** Counts as soon as the client's first deposit is recorded (money
  in linked to the prospect or its job, status pending or approved, not
  `query`), in the pay week of its `recordedAt`. Team lead or Operations
  record it; the Owner still approves it in Cash flow for the float, but the
  commission doesn't wait for that. A deposit also closes the sale.
Rep dashboard: this week, last week, month to date vs `commissionTarget`.
Team lead / Ops / admin console: pay per rep for any week (‹ Earlier).
`normalizeConfig()` rule 3 adds the 2,500 rate once.

## 6c. Import leads from Excel (Admin only, since v=55)

Settings → "Import leads from Excel" (also a button on Prospects for admin).
The Admin picks an .xlsx/.xls/.csv call list (Instagram, Google search…);
`vendor/xlsx.full.min.js` (SheetJS 0.20.3, Apache-2.0) is lazy-loaded to read
it, and `lead-import.js` (pure, tested) maps headings by synonyms (Business
name/Client/Name, Phone/Mobile/WhatsApp, Contact, Location/Area, Category,
Source, Notes, Assigned to), normalises Ugandan phones to `+256 7XX XXX XXX`,
skips rows with no phone (keeping spreadsheet row numbers) and de-duplicates.
Each row either **updates** the existing prospect with the same phone (else
business name) — only non-empty details, never stage/owner/history/commission
— or becomes a **new lead**: owner chosen in the preview (default the Team
lead; an "Assigned to" cell overrides), `stage "New prospect"`, `nextAction
"First call"`, `followUp` = the chosen first-call date (so it lands on the
owner's Today list), `reviewStatus "approved"` (no GPS/photo audit, and no
re-review when edited), and `imported: true` + `importedAt/By/importBatch`.
**Imported leads earn no commission** (Ben, 1 Oct 2026: they come from
Instagram / Google search) — `commission.js` skips them for both the 2,500
and the 100,000, and they never enter the qualification approval queue; once
marked Qualified they go straight to Operations' "ready" list. Server:
`keepImported()` lets only the Admin change those fields. "Undo…" removes the
last batch's leads nobody has called or moved yet (`config.lastImport`).
The Team lead and Operations work the list with Call + Follow-up (also on
Today cards).

## 6d. Support centre (since v=58)

A **Support** tab for Sales and the Team lead (Operations/admin: in More).
Content lives in `support-content.js` (pure, tested): the 13 Loom videos of
"Verisko Field Sales Training" in 5 parts (~25 min), the "How to use this
page" steps, and role-filtered Quick help answers (commission amounts come
from config). Videos play in-app (Loom embed iframe, with an "Open in Loom"
link as fallback); "Next" swaps the video in place. To change a video, edit
`VIDEOS` and keep its `id` — progress is stored against it.
**Quizzes (v=59):** each video has a 3-question quiz (`QUIZZES` in
`support-content.js`, written from each Loom video's public summary and
chapters — the pricing questions use UGX 1,650,000 / 2,200,000 / 2,700,000,
the 40/30/30 plan and the UGX 250,000 admin fee, so update them if prices
change). Options are shuffled; all 3 right to pass; retries allowed; the
result screen explains every answer. A video counts as **complete** once its
quiz is passed (passing also marks it watched); the best attempt is kept.
Progress: `state.training[userId][videoId] = ISO time` (watched) and
`["q-" + videoId] = "<score>/<total> <ISO time>"` (quiz).
**Certificate (v=60):** when all 13 quizzes are passed, `cert` (ISO time) is
stamped once in the person's training map — that fixes the certificate date.
`certificate.js` (model tested; PDF via jsPDF, A4 landscape: name, course,
Kampala completion date, number `VFS-YYYYMMDD-XXXXX` from the user id) is
offered as a Certificate card (Download / Share) on the Support centre, on the
quiz result after the 13th pass, and — for the Team lead / Operations / admin
— as a Certificate button beside each certified person in Team training.
**Certificate notifications (v=61):** the Team lead, Operations and admin get
a 🎓 card at the top of Today listing everyone who earned a certificate since
they last tapped "Got it" (`newCertificates()` in support-content.js; their
own `training[myId].certseen` stamp, synced; first time = last 30 days), with
a Certificate button per person; the same people are tagged "New" in Team
training. In-app only — the app has no email or push sending yet; it shows
the next time they open the app or refresh. Server
`mergeTraining()` lets each person change only their own entry; Sales GET
only their own, the Team lead gets everyone's (Operations/admin get all
data). The Team lead / Operations / admin see **Team training** (sales +
team leads, least progress first). Sales and Team leads who haven't
finished get a one-line training reminder on Today.

## 6e. Phone, tablet and web layout (v=62)

Usage is ~70% phone, ~30% computer, so the base CSS is the phone layout and
wider screens are layered on with `min-width` media queries (see the "Web +
mobile polish (v=62)" block at the end of app.css):
- **Phone (< 700px):** bottom tab bar (Sales/Team lead: Today, Dashboard,
  Prospects, Visits, Support; Operations/admin: … More), single-column cards,
  forms as bottom sheets. Small selects use 16px text so iPhones don't zoom.
- **Tablet (≥ 700px):** card lists flow into as many 320px+ columns as fit.
- **Sidebar (≥ 860px):** left sidebar that lists **every** screen the role can
  open (no "More" — `isWideLayout()` in `applyRole()`, re-applied when the
  window is resized); dialogs are centred (`position:fixed; inset:0;
  margin:auto` — modal dialogs in the top layer otherwise pin to the top-left)
  and 700px wide for the two-column forms.
- **Computer (≥ 1080px):** content up to 1200px (1400px from 1500px), 4-up
  metric tiles, hover feedback on cards for mouse/trackpad users.
- **Installable:** `manifest.webmanifest` + `icons/` (192, 512, maskable 512,
  apple-touch 180, drawn from logo.svg) — "Add to Home screen" opens it full
  screen like an app.

## 6a. Live data export & the Google Sheet

The Owner's answer to "where is my data and how do I see it without the app".

- **Key:** Settings → *Live data export* → *Generate export key* writes a
  48-hex-char random key to `config.exportKey` and syncs it. `data.mjs` strips
  `exportKey` from every GET for non-admin accounts, refuses non-admin writes
  to it, and keeps the stored key if an admin device pushes a config without
  one (stale cache). *Generate new key…* rotates it; the old key dies at once.
- **Endpoint (`export.mjs`, GET only, no login, `Cache-Control: no-store`):**
  - `/api/export?key=K&table=prospects` → CSV (also `visits`, `followups`,
    `jobs`, `transactions`, `users`, `technicians`).
  - `…&format=json` → `{ok, table, rows}`; no `table` → every table as JSON.
  - `…&photo=<id>` → the stored JPEG (business photo or receipt).
  - Wrong/short/missing key → `401 {"error":"bad_key"}` (constant-time compare,
    minimum 16 chars). Unknown table → 404 with the list of tables.
  - Rows are flattened: joined prospect name/phone on visits, jobs and cash
    entries; GPS as `gps_lat`/`gps_lng`/`gps_map_link`; `photo_link` /
    `receipt_link` URLs; any new flat field on a record is appended
    automatically as a snake_case column. Cells starting with `= + - @` are
    prefixed with `'` so a spreadsheet never executes them.
- **Google Sheet:** *Verisko Live Data* (Drive folder Verisko OS → 01 Leads &
  Quotes; https://docs.google.com/spreadsheets/d/1KYCPXkgqLxKCBIVeB5glVRWNyrEvmt5lsoTZHS7AE1E). Tabs: **Dashboard** (KPI tiles, four charts, visit/job stage
  tables, all formulas), **Setup** (key in C4, feed URL built in C6), one
  formatted tab per table, and **Chart data** (the small COUNTIF/SUMPRODUCT
  tables behind the charts, found by header name with `INDEX/MATCH` so column
  moves don't break them). Each data tab is one
  `IFERROR(IMPORTDATA(Setup!$C$6&"&table=…"),…)`. Google refreshes
  `IMPORTDATA` about hourly and on open; the first open asks "Allow access".
  The workbook is generated by `docs/tools/build-live-data-workbook.py`
  (openpyxl) and uploaded to Drive as .xlsx, which Google converts; there is
  no Sheets editor connector, so a layout change means regenerating and
  re-uploading, then re-pasting the key.
- **Threat model:** the key grants read-everything without login. It is only
  ever on Owner/Technical devices and inside the private Sheet. Rotate it if
  either is lost.

## 7. How to run & test locally (the app is auth-gated)

**Automated tests:** `npm install && npm test` runs `tests/*.test.js` with the
built-in Node runner (currently 45 tests: cash-flow period maths, the export
flattening/CSV, the quotation model/share text, closed-sale rules, Sales and
Team lead data scoping, and commission/pay-week rules). Add a test whenever you touch a pure function. `node_modules`
is git-ignored via `sales-app/.gitignore`.

**Browser smoke test:** because sign-in needs a Supabase OTP, bypass it by
seeding `localStorage` and using the offline boot path (`settings.auth` +
`settings.user` present → the app opens straight in).

```bash
cd /Users/ben/Verisko/sales-app
npm test                                  # pure-function tests
node --check app.js                       # syntax
node --check netlify/functions/data.mjs
python3 -m http.server 8899               # serve statically
# open http://localhost:8899/index.html, then in the console:
```
```js
// Seed an admin workspace to bypass auth:
localStorage.setItem("verisko_sales_settings_v1", JSON.stringify({
  onboarded:true,
  auth:{ access_token:"local", email:"ben@test", expires_at:4102444800 },
  user:{ id:"u1", name:"Ben Owner", email:"ben@test", role:"admin" }
}));
localStorage.setItem("verisko_sales_app_v1", JSON.stringify({
  prospects:[], appointments:[], users:[{id:"u1",name:"Ben Owner",email:"ben@test",role:"admin"}],
  transactions:[], jobs:[], technicians:[], config:{ commissionPerSale:80000, commissionTarget:1600000 }
}));
location.reload();
```
- Change `user.role` to `"sales"` or `"operations"` to test other roles.
- The `/api/data` GET fails locally (no Netlify Functions) → the app falls back
  to the seeded local state, which is exactly what you want for UI testing.
- **Pure-logic testing:** `app.js` is one IIFE, so its functions are private.
  `cashflow-report.js` and `export.mjs` expose pure helpers and have tests; to
  unit test `computeQuote` / `jobValue` / `migrateToJobs` / `availableForOut`,
  either move them into a small module the IIFE also loads, or extract the
  source slice with `new Function(...)` in a throwaway script.
- **Testing the live backend** needs a real session. Sign in as the Owner on
  the live site, generate the export key, then `curl
  "https://verisko-sales-2026.netlify.app/api/export?key=K&table=prospects"`
  shows exactly what Netlify Blobs holds; `…&photo=<photo_id>` proves a photo
  upload landed. Sales-side sync/photo tests need a Sales account signed in on
  a second device.
- **Geolocation:** stub `navigator.geolocation.getCurrentPosition` in the console
  to simulate grant (`ok({coords:{latitude,longitude,accuracy}})`) or deny
  (`err({code:1})`).

**Deploy check after push:**
```bash
git push origin main
# then poll until the new version is live:
curl -s "https://verisko-sales-2026.netlify.app/index.html?cb=$RANDOM" | grep -o 'app.js?v=[0-9]*'
```

## 8. Current status (live at v=62, 1 Oct 2026)

Working and smoke-tested (Sales role, phone viewport, seeded local copy): the
welcome tour, Today, Prospects, Visits and Dashboard render with no console
errors; Sales sees only the 4 primary tabs; add-prospect blocks a missing name
and a missing GPS pin and saves with both; scheduling saves; confirming a visit
for a prospect without contact/phone/location is blocked with a clear message;
data and sign-in survive a reload offline. Owner role: the live-export card
generates, shows and copies a key. Live site: sign-in page clean, `/api/data`,
`/api/receipt` and `/api/export` all answer 401 without credentials, 8/8 unit
tests pass.

Fixed this session: `/api/receipt` POST used to reject Sales accounts, so a
salesperson's business photo sat in the IndexedDB queue forever with "1 photo
waiting to upload" and never reached Netlify. Nav tabs now have accessible
names.

**Not yet verified with a real signed-in session:** end-to-end sync between two
devices, a real photo upload to Blobs, and the export feed with a real key. The
Owner can close this in five minutes (§7, "Testing the live backend").

## 9. Known limitations & suggested next steps

- **No test harness.** Highest-value first task: add a small Node test file for
  the pure functions (`computeQuote`, `jobValue`, `migrateToJobs`,
  `availableForOut`, `needsProof`) so regressions are caught without a browser.
- **Jobs Phase 2:** the branded PDF quote + WhatsApp share shipped in v=48,
  auto-mark Sent on share in v=49. Still open: expiry reminders (quotes are
  valid 30 days; nothing flags an expired one yet). See `docs/specs/2026-07-29-jobs-merge.md`.
- **PDF rendering has no browser test.** `renderQuotePdf` is exercised by
  running jsPDF in Node (copy `vendor/jspdf.umd.min.js` outside the package,
  set `globalThis.self = globalThis`, require it) and rasterising the output;
  the model behind it is unit-tested.
- **Dead data:** `config.pettyLimit` is vestigial (proof is no longer
  amount-based). Safe to remove from `defaultConfig()` and the `data.mjs` config
  merge.
- **Deprecated arrays:** once all clients are on v≥42, drop `quotes`/
  `installations` from `data.mjs` `EMPTY`/`clean` and remove `migrateToJobs`.
- **Minor:** the cash-flow summary's "awaiting review" chip counts sent-back
  (`query`) entries as pending; consider excluding them.
- **Not stress-tested:** large-dataset performance, deep offline edge cases, and
  a full accessibility pass (nav labels are done; forms and cards untested).
- **Export refresh cadence:** `IMPORTDATA` is roughly hourly. If the Owner
  wants minute-level freshness, add a Google Apps Script time trigger in the
  Sheet that fetches `…&format=json` and writes rows, or have `data.mjs` POST
  to an Apps Script web app after each save.
- **Photo upload is now open to every team member.** Photos are only reachable
  through a record the caller may write, plus the export key, but there is no
  per-user quota; add one if abuse ever becomes a concern.
- **Send-back reason sheet** works via the UI but is fiddly to drive
  programmatically — worth a manual pass if you touch it.

## 10. Reference docs (in `sales-app/docs/`)

- `specs/2026-07-27-operations-cashflow.md` — cash-flow module spec.
- `specs/2026-07-28-installations.md` — original installations spec.
- `specs/2026-07-29-jobs-merge.md` — the Quotes+Installations→Jobs merge (design).
- `plans/2026-07-29-jobs-merge-plan.md` — the merge implementation plan.
- `README.md`, `APP_PLAN.md` — older overviews (may predate the Jobs merge).

## 11. Your first move

Read `app.js` top-to-bottom once (it's one file, ~2,900 lines, sectioned by
comment banners). Then run the local smoke test in §7 as each role. Confirm you
can reproduce the current behavior before changing anything. When you ship,
follow the golden rules in §3 — especially bump `?v=N` and push to `main`.
