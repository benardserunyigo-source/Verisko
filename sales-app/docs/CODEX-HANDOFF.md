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
  (auto-deploys on push to `main`). Current asset version: **v=44**.

## 2. Tech stack (deliberately minimal — keep it that way)

- **Frontend:** one vanilla-JS IIFE in `app.js` (~2,840 lines), `app.css`,
  `index.html`. **No framework, no build step, no bundler, no npm runtime deps.**
  Everything ships as static files.
- **Backend:** two Netlify Functions (ES modules):
  - `netlify/functions/data.mjs` — shared data API (`/api/data`), backed by
    **Netlify Blobs** (store `verisko-sales`, key `app-data`).
  - `netlify/functions/receipt.mjs` — receipt/photo upload+fetch (`/api/receipt`),
    Netlify Blobs store `verisko-receipts`.
- **Auth:** Supabase **email OTP magic-link**. The Supabase **publishable** key
  in `data.mjs` is public and safe to ship. **Never commit the `sb_secret_`
  service key.** Auth flow: Supabase verifies the token; the verified email must
  be on the `users` allow-list; the first sign-in on an empty workspace
  bootstraps the owner.
- `netlify.toml` — redirects (`/api/*`), security headers incl.
  **`Permissions-Policy: … geolocation=(self)`** (required for the GPS pin).

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
  config{}         // commissionPerSale, commissionTarget (pettyLimit is vestigial/unused)
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
- **sales** — prospects + site visits + a personal dashboard only. Never sees
  cash flow, jobs, or settings.

Gate helpers in `app.js`: `isAdmin()`, `canCashflow()`, `canReviewProspects()`,
`canInstalls()` (ops+admin). Nav: 4 primary tabs (Today, Dashboard, Prospects,
Visits) + a **"More"** sheet holding ops/admin extras (Jobs, Cash flow, Settings).

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
  **closed-sale → commission** flow (ops marks `closedSale`; the rep earns
  `commissionPerSale`, default UGX 80,000).
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
- **Settings (admin):** team roster, receipt-policy note, JSON backup/restore,
  danger zone.

## 7. How to run & test locally (the app is auth-gated)

There's **no automated test suite**. Verification is `node --check` + a
browser-driven smoke test. Because sign-in needs a Supabase OTP, bypass it by
seeding `localStorage` and using the offline boot path (`settings.auth` +
`settings.user` present → the app opens straight in).

```bash
cd /Users/ben/Verisko/sales-app
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
- **Pure-logic testing:** `app.js` is one IIFE, so functions are private. To unit
  test `computeQuote` / `jobValue` / `migrateToJobs` / `availableForOut`, extract
  the source slice with `new Function(...)` in a throwaway Node script (there are
  prior examples of this pattern; grep the git history for `qtest`/`jobtest`).
- **Geolocation:** stub `navigator.geolocation.getCurrentPosition` in the console
  to simulate grant (`ok({coords:{latitude,longitude,accuracy}})`) or deny
  (`err({code:1})`).

**Deploy check after push:**
```bash
git push origin main
# then poll until the new version is live:
curl -s "https://verisko-sales-2026.netlify.app/index.html?cb=$RANDOM" | grep -o 'app.js?v=[0-9]*'
```

## 8. Current status (all live at v=44, verified this session)

Working and smoke-tested: all 7 views render with no console errors; Sales is
correctly restricted to the 4 primary tabs; the Jobs merge, the required GPS
pin, and the expense-proof + float math all pass end-to-end.

## 9. Known limitations & suggested next steps

- **No test harness.** Highest-value first task: add a small Node test file for
  the pure functions (`computeQuote`, `jobValue`, `migrateToJobs`,
  `availableForOut`, `needsProof`) so regressions are caught without a browser.
- **Jobs Phase 2 (deferred):** branded PDF quote + WhatsApp share; deeper
  quote-lifecycle automation. See `docs/specs/2026-07-29-jobs-merge.md`.
- **Dead data:** `config.pettyLimit` is vestigial (proof is no longer
  amount-based). Safe to remove from `defaultConfig()` and the `data.mjs` config
  merge.
- **Deprecated arrays:** once all clients are on v≥42, drop `quotes`/
  `installations` from `data.mjs` `EMPTY`/`clean` and remove `migrateToJobs`.
- **Minor:** the cash-flow summary's "awaiting review" chip counts sent-back
  (`query`) entries as pending; consider excluding them.
- **Not stress-tested:** large-dataset performance, deep offline edge cases, and
  full accessibility pass.
- **Send-back reason sheet** works via the UI but is fiddly to drive
  programmatically — worth a manual pass if you touch it.

## 10. Reference docs (in `sales-app/docs/`)

- `specs/2026-07-27-operations-cashflow.md` — cash-flow module spec.
- `specs/2026-07-28-installations.md` — original installations spec.
- `specs/2026-07-29-jobs-merge.md` — the Quotes+Installations→Jobs merge (design).
- `plans/2026-07-29-jobs-merge-plan.md` — the merge implementation plan.
- `README.md`, `APP_PLAN.md` — older overviews (may predate the Jobs merge).

## 11. Your first move

Read `app.js` top-to-bottom once (it's one file, ~2,840 lines, sectioned by
comment banners). Then run the local smoke test in §7 as each role. Confirm you
can reproduce the current behavior before changing anything. When you ship,
follow the golden rules in §3 — especially bump `?v=N` and push to `main`.
