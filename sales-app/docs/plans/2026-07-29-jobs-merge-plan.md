# Jobs Merge — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. This project has
> no test framework; verification is `node --check`, extracted-function unit
> harnesses (in the scratchpad) for pure logic, and browser-driven QA on a
> seeded local workspace (`python3 -m http.server` + the Browser pane, seeding
> `localStorage` keys `verisko_sales_settings_v1` / `verisko_sales_app_v1`).

**Goal:** Merge `quotes[]` and `installations[]` into a single `jobs[]` record
with one Draft→Handed-over pipeline, one "Jobs" screen, and one adaptive form —
removing the double-pricing contradiction.

**Architecture:** One record; the rubric price (`computeQuote`) is the job's
value via `jobValue(job)`, with manual `finalPrice` only for custom (12+ cam) or
admin override. One form reveals delivery fields at stage Accepted+ and the
checklist at Handed over. A load-time migration folds old quotes/installations
into jobs, reusing installation ids so `installId` payment links keep resolving.

**Tech Stack:** Vanilla-JS IIFE (`app.js`), `app.css`, `index.html`, Netlify
Function `data.mjs` (Netlify Blobs), Supabase email-OTP auth.

**Spec:** `sales-app/docs/specs/2026-07-29-jobs-merge.md`

---

### Task 1: Constants, `jobValue`, and migration (pure logic)

**Files:**
- Modify: `sales-app/app.js` (constants near line 24–81; helpers near the quote
  engine ~line 84; seed ~line 168; loaders ~line 195, ~2128, ~2637)

- [ ] **Step 1: Add `JOB_STAGES` constant**

Near `INSTALL_STATUSES`/`QUOTE_STATUSES`, add:

```js
var JOB_STAGES = ["Draft", "Sent", "Accepted", "Scheduled", "In progress", "Installed", "Handed over", "Rejected", "Cancelled"];
// Delivery fields (schedule/technician/materials) unlock at Accepted or later.
var JOB_DELIVERY_STAGES = ["Accepted", "Scheduled", "In progress", "Installed", "Handed over"];
function jobIsDelivery(stage) { return JOB_DELIVERY_STAGES.indexOf(stage) >= 0; }
```

Keep `INSTALL_STATUSES`, `QUOTE_STATUSES`, `INSTALL_CHECKLIST` for now (migration
maps from them; remove `INSTALL_STATUSES`/`QUOTE_STATUSES` in Task 6 once unused).

- [ ] **Step 2: Add `jobValue(job)` after `computeQuote`**

```js
// Single source of truth for a job's contract value. Rubric-priced normally;
// a manual finalPrice only for custom (12+ cam) or an admin override.
function jobValue(job) {
  if (!job) return 0;
  var r = computeQuote(job);
  if (r.custom || job.priceOverride) return Math.max(0, Math.round(Number(job.finalPrice) || 0));
  return r.cash;
}
```

- [ ] **Step 3: Add `migrateToJobs(data)` (idempotent)**

```js
// Fold legacy quotes[] + installations[] into jobs[] once. Installation ids are
// reused as job ids so existing installId payment links keep resolving.
function migrateToJobs(data) {
  if (Array.isArray(data.jobs)) return data;
  var jobs = [];
  var instStage = { "Quoted": "Accepted", "Scheduled": "Scheduled", "In progress": "In progress", "Installed": "Installed", "Handed over": "Handed over", "Cancelled": "Cancelled" };
  var quoteStage = { "Draft": "Draft", "Sent": "Sent", "Accepted": "Accepted", "Rejected": "Rejected", "Expired": "Rejected" };
  (data.installations || []).forEach(function (i) {
    jobs.push({
      id: i.id, prospectId: i.prospectId || "",
      business: i.business || "", contact: i.contact || "", phone: i.phone || "", location: i.location || "",
      stage: instStage[i.status] || "Accepted",
      rubric: {}, cameraCount: 0, addons: {}, zone: "1", discountPct: 0,
      finalPrice: Number(i.quote) || 0, priceOverride: (Number(i.quote) || 0) > 0,
      scheduledDate: i.scheduledDate || "", scheduledTime: i.scheduledTime || "",
      technicianId: i.technicianId || "", materials: i.materials || [], checklist: i.checklist || {},
      notes: i.siteNotes || "", createdBy: i.createdBy || "", createdByEmail: i.createdByEmail || "", createdAt: i.createdAt || ""
    });
  });
  (data.quotes || []).forEach(function (q) {
    jobs.push({
      id: q.id, prospectId: q.prospectId || "",
      business: q.business || "", contact: q.contact || "", phone: q.phone || "", location: q.location || "",
      stage: quoteStage[q.status] || "Draft",
      rubric: q.rubric || {}, cameraCount: q.cameraCount || 0, addons: q.addons || {}, zone: q.zone || "1", discountPct: q.discountPct || 0,
      finalPrice: 0, priceOverride: false,
      scheduledDate: "", scheduledTime: "", technicianId: "", materials: [], checklist: {},
      notes: q.notes || "", createdBy: q.createdBy || "", createdByEmail: q.createdByEmail || "", createdAt: q.createdAt || ""
    });
  });
  // Re-number refs J-YYYY-NNNN by createdAt order.
  jobs.sort(function (a, b) { return (a.createdAt || "").localeCompare(b.createdAt || ""); });
  var yr = String((data.jobs && data.jobs[0] && data.jobs[0].createdAt || "2026")).slice(0, 4);
  jobs.forEach(function (j, k) { j.ref = "J-" + yr + "-" + ("000" + (k + 1)).slice(-4); });
  data.jobs = jobs;
  data.quotes = []; data.installations = [];
  return data;
}
```

- [ ] **Step 4: Wire migration + seed**

- Seed (~line 168): replace `quotes: []` and `technicians: []` block so it has
  `jobs: []` and keep `technicians: []`; drop `installations`/`quotes` seed keys.
- `loadData` (~line 195): after parsing, `state = migrateToJobs(state); if (!state.jobs) state.jobs = [];`
- `loadShared` (~2128): build state then `migrateToJobs(state)`; ensure `jobs`
  read from `result.data.jobs`. Include `jobs: result.data.jobs || []` in the
  state assignment, then call `migrateToJobs(state)` to fold any legacy arrays
  the server still holds.
- Import (~2637): same — assign `jobs`, then `migrateToJobs(state)`.

- [ ] **Step 5: Unit-test the pure logic** (scratchpad harness)

Extract `computeQuote` + `jobValue` + `migrateToJobs` via `new Function` (as in
the existing qtest). Assert:
- `jobValue` for a 4-cam Standard job = `computeQuote(job).cash`.
- `jobValue` for a 12+ cam job = `finalPrice`.
- `migrateToJobs`: 1 installation (status "Installed", quote 3,000,000) + 1 quote
  (status "Sent") → 2 jobs; installation keeps its `id`; stages map to
  "Installed"/"Sent"; refs are `J-…-0001`/`0002` and unique; legacy arrays
  emptied; second call is a no-op (jobs already present).

Run: `node <scratchpad>/jobtest.mjs` — Expected: all pass.

- [ ] **Step 6: `node --check` + commit**

```bash
node --check sales-app/app.js && echo OK
git add sales-app/app.js && git commit -m "sales-app: jobs data model — JOB_STAGES, jobValue, migrateToJobs"
```

---

### Task 2: Server (`data.mjs`) — jobs replaces quotes+installations

**Files:**
- Modify: `sales-app/netlify/functions/data.mjs`

- [ ] **Step 1: `EMPTY` gains `jobs`**

```js
const EMPTY = { prospects: [], appointments: [], users: [], transactions: [], jobs: [], technicians: [], quotes: [], installations: [], config: {} };
```

(Keep `quotes`/`installations` in EMPTY so a mid-transition client that still
holds them isn't rejected; they are deprecated and normally empty.)

- [ ] **Step 2: `clean` + stored + non-reviewer revert**

Add `const storedJobs = Array.isArray(data.jobs) ? data.jobs : [];`, add
`jobs: Array.isArray(incoming.jobs) ? incoming.jobs : []` to `clean`, and in the
`if (!canReview)` block replace the installations/technicians/quotes rule with:

```js
if (JSON.stringify(clean.jobs) !== JSON.stringify(storedJobs)) clean.jobs = storedJobs;
if (JSON.stringify(clean.technicians) !== JSON.stringify(storedTechs)) clean.technicians = storedTechs;
```

Keep passing `quotes`/`installations` through in `clean` (as arrays) so old data
survives until the client migrates and writes them empty.

- [ ] **Step 3: verify + commit**

```bash
node --check sales-app/netlify/functions/data.mjs && echo OK
git add sales-app/netlify/functions/data.mjs && git commit -m "sales-app: server stores jobs[]; ops/admin-only, non-reviewer reverts"
```

---

### Task 3: Unified `renderJobs` + `jobCard` (the one screen)

**Files:**
- Modify: `sales-app/app.js` — merge `renderQuotes`+`renderInstalls` into
  `renderJobs`; merge `quoteCard`+`installCard` into `jobCard`; add
  `jobStageChip`; rename `installFilter`/`quoteFilter` → `jobFilter`.

- [ ] **Step 1: `jobStageChip(stage)`**

```js
function jobStageChip(s) {
  if (s === "Handed over" || s === "Installed") return chip(s, "green", "✓");
  if (s === "In progress") return chip(s, "cyan", "★");
  if (s === "Accepted") return chip(s, "green", "✓");
  if (s === "Scheduled") return chip(s, "amber", "◔");
  if (s === "Sent") return chip(s, "cyan", "→");
  if (s === "Rejected" || s === "Cancelled") return chip(s, "red", "✕");
  return chip(s || "Draft", "grey", "•"); // Draft
}
```

- [ ] **Step 2: `renderJobs()`** — one screen with pipeline summary (open-pipeline
value = sum of `jobValue` for stages not in {Handed over, Rejected, Cancelled};
won value = sum for Accepted+), a `jobFilter` stage select (All + `JOB_STAGES`),
job cards sorted by stage then recency, and the existing `technicianRosterCard()`.
`setHead("Operations", "Jobs", "Quote, schedule and run CCTV jobs — one place from quote to handover.", "New job", true)`.

- [ ] **Step 3: `jobCard(job)`** — merges both cards: client (`jobClient`), ref,
`custom ? "12+ cam" : cameras+"-cam"` + tier, `jobStageChip(stage)`,
`money(jobValue(job))` (or "Custom — Ben quotes" if custom & no finalPrice),
technician + schedule when in a delivery stage, and paid/balance lines
(`paidForJob`, `jobValue`) reusing the installCard payment lines. `data-edit="job"`.

- [ ] **Step 4: `jobValue` in `jobPaymentsSection`** — replace `Number(job.quote)`
with `jobValue(job)` (line ~1012 and ~1019/1022).

- [ ] **Step 5: `node --check` + commit**

```bash
node --check sales-app/app.js && echo OK
git add sales-app/app.js && git commit -m "sales-app: unified Jobs screen (renderJobs, jobCard, jobStageChip)"
```

---

### Task 4: Unified job form + `saveJob`

**Files:**
- Modify: `sales-app/app.js` — replace the `type === "installation"` and
  `type === "quote"` branches in `openForm` with one `type === "job"` branch;
  merge `saveQuote`+`saveInstallation` into `saveJob`; update form listeners.

- [ ] **Step 1: `openForm` "job" branch** — in order: title (`ref` or "New job");
`renderClientBlock(id, presetProspect, source)`; **pricing** (5 rubric selects,
camera segmented, add-ons, zone, admin-only discount, `#quoteTier`, `#quoteGov`,
`#quoteSummary`); a **Final price (UGX)** field `f_finalPrice` shown when the
computed result is custom or `source.priceOverride` (admin-only to edit);
**stage** select (`JOB_STAGES`); **delivery** block wrapped in
`<div id="deliveryFields"` hidden unless `jobIsDelivery(source.stage)`>` —
schedule (date/time), technician select, materials editor; **checklist** wrapped
in `#chkField` hidden unless `source.stage === "Handed over"`; **payments**
(`jobPaymentsSection` when `id` and delivery stage); **notes**; delete (where
allowed). Reuse `readQuoteInputs`, `quoteSummaryHtml`, `recalcQuoteForm`,
`materialRow`, `collectMaterials`, `collectChecklist`.

- [ ] **Step 2: post-render wiring** — in `openForm` tail, `if (type === "job") { recalcQuoteForm(); updateMatTotal(); }`.

- [ ] **Step 3: form listeners** — the `input`/`change` handlers already recalc on
`.quote-input` for `editing.type === "quote"`; change those checks to
`editing.type === "job"`. The `f_clientPick` change already uses `editing.type`.
Add a `change` handler: when `f_stage` changes, toggle `#deliveryFields.hidden = !jobIsDelivery(value)` and `#chkField.hidden = value !== "Handed over"`. The
`cameraCount` seg handler already recalcs for quotes → change to job; also on
recalc, show/hide `f_finalPrice` wrapper when custom.

- [ ] **Step 4: `saveJob(data)`** — merges both saves:
  - Resolve client via `data.prospectId`/manual (as `saveQuote`).
  - `inputs = readQuoteInputs()`; `r = computeQuote(inputs)`.
  - Governance: block non-admin when `r.needsApproval` or `r.discountPct > 5`.
  - `stage = JOB_STAGES.indexOf(data.stage) >= 0 ? data.stage : "Draft"`.
  - If `stage === "Handed over"` and checklist incomplete → block with missing
    items (reuse `checklistComplete` + the installations error text).
  - Price: `priceOverride = r.custom || (isAdmin() && finalPrice entered)`;
    store `finalPrice` when override/custom.
  - Build the job object (client fields empty when linked), `materials`,
    `checklist`, `notes`. On create, `ref: newJobRef()` (max-based, see below),
    `createdBy/By Email/At`. Push/replace in `state.jobs`. `saveData` + `render`.
  - `newJobRef()`: `"J-" + year + "-" + (max existing number + 1)` padded — derive
    the max from existing `state.jobs` refs, not `length` (delete-safe).

- [ ] **Step 5: `node --check` + commit**

```bash
node --check sales-app/app.js && echo OK
git add sales-app/app.js && git commit -m "sales-app: unified job form + saveJob (progressive disclosure, governance, checklist gate)"
```

---

### Task 5: Nav, routing, dispatch, and prospect → job

**Files:**
- Modify: `sales-app/app.js` (dispatch/gates/primaryAction/submit/listeners,
  `MORE_VIEWS`, `moreViewsForRole`, `data-make-install` → job) and
  `sales-app/index.html` (one "Jobs" nav button; bump `?v=`).

- [ ] **Step 1: index.html** — replace the two `data-view="quotes"` and
`data-view="installs"` buttons with one `data-view="jobs"` button (label "Jobs",
box/briefcase icon). Bump `app.css`/`app.js` `?v=41` → `?v=42`.

- [ ] **Step 2: constants & role** — `MORE_VIEWS = ["jobs", "cashflow", "settings"]`;
`moreViewsForRole()` pushes `"jobs"` (not quotes/installs) when `canInstalls()`.

- [ ] **Step 3: `render()` dispatch** — replace the `quotes`/`installs` branches
with `else if (view === "jobs") renderJobs();`; update the redirect gates
(`if (view === "jobs" && !canInstalls()) view = "today";`) and the `applyRole`
gate list (`cashflow`/`jobs`).

- [ ] **Step 4: primaryAction + submit + filter** — `primaryAction`: `else if (view === "jobs") openForm("job");` (remove quotes/installs). Submit routing:
`if (type === "job") { saveJob(data); return; }` (remove quote/installation
routing). Content `change`: `if (e.target.id === "jobFilter") { jobFilter = e.target.value; renderJobs(); }` (remove quoteFilter/installFilter).

- [ ] **Step 5: prospect → job** — the closed-sale prospect button
(`data-make-install`, ~line 1613) and its two handlers (~1813, ~2690) call
`openForm("job", null, id)`. Update the button label to "Create job from this
sale". `data-new="quote"`/`data-new="installation"` empty-state attrs become
`data-new="job"`.

- [ ] **Step 6: `node --check` + commit**

```bash
node --check sales-app/app.js && echo OK
git add sales-app/app.js sales-app/index.html && git commit -m "sales-app: one Jobs nav/route; prospect closes into a job; v=42"
```

---

### Task 6: Remove dead code + CSS

**Files:**
- Modify: `sales-app/app.js` (delete unused), `sales-app/app.css` (stage chips)

- [ ] **Step 1: delete dead functions/vars** — `renderQuotes`, `quoteCard`,
`saveQuote`, `newQuoteRef`, `quoteTierChip`? (keep — used by recalc), `renderInstalls`, `installCard`, `saveInstallation`, `installStatusChip`,
`quoteStatusChip`, `installFilter`, `quoteFilter`, and `INSTALL_STATUSES`/
`QUOTE_STATUSES` if now unreferenced. Grep each name to confirm zero remaining
references before deleting.

- [ ] **Step 2: CSS** — reuse existing `.quote-*`/`.pay-*` styles; add any missing
stage-chip tone only if a chip tone is unstyled. No new file.

- [ ] **Step 3: `node --check` + grep clean + commit**

```bash
node --check sales-app/app.js && echo OK
grep -n 'renderQuotes\|renderInstalls\|saveQuote\|saveInstallation\|installFilter\|quoteFilter\|"installation"\|"quote"' sales-app/app.js   # expect none (except JOB migration mapping strings)
git add -A sales-app && git commit -m "sales-app: remove superseded quotes/installations code"
```

---

### Task 7: Browser QA + push live

- [ ] **Step 1: boot clean** — serve locally, seed an admin workspace with legacy
`quotes`+`installations` (no `jobs`), reload, confirm **no console errors** and
that migration produced one `jobs[]` (installation kept its id; refs unique).

- [ ] **Step 2: drive the merged flow** — as admin then operations:
  - Jobs screen renders; More menu shows one "Jobs" (no Quotes/Installs).
  - New job → client picker + rubric pricing; live total correct; Save at Draft.
  - Move stage to Accepted → delivery fields (schedule/technician/materials)
    appear; earlier they were hidden.
  - Set 12+ cameras → Final price field appears; value uses it.
  - Governance: Very Complex/discount>5% disables Save for operations.
  - Stage Handed over with incomplete checklist → blocked with missing items.
  - A migrated installation opens as a job with its old price and payments intact
    (record a client payment → balance uses `jobValue`).

- [ ] **Step 3: push + confirm live** — commit any fixes; `git push origin main`;
poll `https://verisko-sales-2026.netlify.app/index.html` for `app.js?v=42`;
confirm the live bundle contains `renderJobs` and not `renderInstalls`.

- [ ] **Step 4: update memory** — record the Quotes+Installations → Jobs merge in
`verisko-cashflow.md` and bump the "Currently at v=42" line.

---

## Self-review notes

- **Spec coverage:** one record (T1), one pipeline `JOB_STAGES` (T1/T4), value
  resolution `jobValue` (T1/T3/T4), one form with progressive disclosure (T4),
  one screen + nav (T3/T5), governance + checklist carried over (T4), payments
  by job id unchanged (T3/T4), migration reusing installation ids (T1), server
  jobs-only enforcement (T2), dead-code removal (T6), QA + migration verify (T7).
- **Payment continuity:** `installId` field name is kept; installation ids become
  job ids in migration, so links resolve without a transactions migration.
- **Ref safety:** `newJobRef()` derives from max existing number (delete-safe),
  matching the fix noted for the quote ref during QA.
