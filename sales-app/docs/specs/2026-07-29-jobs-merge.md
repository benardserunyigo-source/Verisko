# Jobs — merging Quotes and Installations into one lifecycle

**Owner:** Operations Director (+ Owner/Technical). Sales have no access.
**Status:** Design agreed 2026-07-29. Supersedes the split between the Quote
Calculator (`quotes[]`) and the Installations module (`installations[]`).

## Problem

A quote and an installation are the same real-world job at two stages of one
lifecycle, but the app modelled them as two separate records that both priced
the work:

- **Installations** carried a manual `Quote (UGX)` field (`app.js`, the install
  form) and a status list starting at `Quoted`.
- **Quotes** built the same price properly with the rubric (`computeQuote`) and
  had its own status list starting at `Draft`.

Result: the same job is priced twice (once by hand, once by rubric) and started
twice ("Draft" quote, then "Quoted" installation) — two cards, two forms, two
status pipelines for one thing. This is contradictory by design.

## Decision

Collapse `quotes[]` and `installations[]` into a **single record, `jobs[]`,
with one status pipeline that begins with the quote and ends at handover.** The
rubric-priced total is the job's contract value; there is no separate manual
quote step except for genuinely custom jobs.

Named **"Jobs"** on screen.

## Data model

One shared array `jobs[]` in the app-data blob, replacing `quotes[]` and
`installations[]`.

```
job = {
  id, ref,                         // ref = "J-2026-0001"
  prospectId,                      // link to the prospect (or "" for walk-in)
  business, contact, phone, location,   // only populated for walk-in/standalone

  stage,                           // see pipeline below

  // Pricing — the "quote". Drives computeQuote(job) -> value.
  rubric{ q1..q5 }, cameraCount, addons{}, zone, discountPct,
  finalPrice,                      // manual UGX; ONLY used when custom or admin override (see Pricing)

  // Delivery — only meaningful once stage is Accepted or later.
  scheduledDate, scheduledTime, technicianId,
  materials[],                     // {id, name, qty, unitCost}
  checklist{},                     // {cameras, tested, remote, trained, credentials}
  notes,

  createdBy, createdByEmail, createdAt
}
```

`technicians[]` is unchanged and stays as-is.

### Value resolution (single source of truth)

`jobValue(job)` returns the contract value used everywhere (cards, pipeline,
Payments & float):

- If the rubric can price it (2/4/6/8 cameras and not overridden):
  `jobValue = computeQuote(job).cash`.
- If custom (12+ cameras, `computeQuote(job).custom === true`) **or** an admin
  set a manual override: `jobValue = Number(job.finalPrice) || 0`.

The old always-present manual `Quote (UGX)` box is removed. Manual pricing
survives only for the custom case the rubric already flags for Ben's approval,
and for legacy/standalone jobs (via migration).

## Pipeline (`stage`)

`JOB_STAGES = ["Draft", "Sent", "Accepted", "Scheduled", "In progress",
"Installed", "Handed over", "Rejected", "Cancelled"]`

- **Draft** — being priced (the quote is under construction).
- **Sent** — quote given to the customer.
- **Accepted** — customer said yes; it is now a live job.
- **Scheduled** — date + technician assigned.
- **In progress** — installing.
- **Installed** — hardware done, testing.
- **Handed over** — complete (gated by the completion checklist).
- **Rejected** — customer declined the quote (off-ramp; folds in the old
  "Expired").
- **Cancelled** — fell through after acceptance (off-ramp).

"Open pipeline" = jobs in Draft/Sent/Accepted/Scheduled/In progress/Installed
(i.e. not Handed over, Rejected or Cancelled). "Won" = Accepted onward.

### Stage gating

- **Handed over** requires a complete checklist (unchanged rule from the
  installations module; `checklistComplete` blocks the save with the exact
  missing items).
- No other forced transitions — Operations move the stage manually, as today.

## UI

### One screen: "Jobs"

- Replaces the separate **Quotes** and **Installs** entries in the *More* menu
  with a single **Jobs** entry (ops/admin only). `MORE_VIEWS` and
  `moreViewsForRole()` list `jobs` in place of `quotes` + `installs`.
- **Pipeline summary** card: open-pipeline value and won/in-progress value.
- **Stage filter** (All + each stage).
- **Job cards**: client, ref, camera count + tier, value, stage chip. The card
  reads as a quote in early stages and a live install later — same card.
- **Technicians** roster card stays on this screen (unchanged).

### One form (progressive disclosure by stage)

Order top to bottom:

1. **Client** — the shared `renderClientBlock` picker (linked prospect shows the
   read-only "from the sales record" card; walk-in enters fields).
2. **Pricing (the quote)** — rubric (5 questions), camera segmented control,
   add-ons, zone, admin-only discount, and the live price + financing summary
   (`quoteSummaryHtml`). Editable while the job is not yet Handed over.
   - For a **custom** result (12+ cameras) or an **admin override**, show a
     **Final price (UGX)** field instead of/in addition to the computed total;
     this is the only manual price entry, and it is the Ben-approval path.
3. **Stage** — the `JOB_STAGES` select.
4. **Delivery** — schedule (date, time), technician, materials. **Hidden until
   stage is Accepted or later** (same hide/reveal pattern as the checklist).
5. **Completion checklist** — shown only at stage **Handed over** (already
   implemented for installations; carried over).
6. **Payments & float** — `jobPaymentsSection`, shown on saved jobs from
   Accepted on.
7. **Notes**, then delete (where allowed).

### Governance (carried over from Quotes)

- Very Complex tier, 12+ cameras, or discount > 5% ⇒ needs admin. Save is
  disabled for non-admins with the governance banner; re-checked on save.
- Applies at the pricing stage of the job.

## Rules / enforcement

- Only Operations + admins (`canInstalls()`) may read/write `jobs`. The server
  (`data.mjs`) reverts any change from a non-reviewer — same pattern as the old
  `installations`/`quotes`/roster rules. `quotes`/`installations` enforcement is
  replaced by a single `jobs` rule.
- Server `EMPTY` and `clean` gain `jobs: []` and drop `quotes` + `installations`
  (migration below keeps old data readable during the transition).

## Payments & float (unchanged behaviour)

- Transactions keep their `installId` field, which now points to a **job id**.
  Because migrated installations reuse their existing ids as job ids, all
  existing `installId` links stay valid — no float logic changes.
- `jobPayments`/`paidForJob`/`pendingInForJob`/`spendForJob` operate on the job
  id exactly as before; `jobValue(job)` supplies the quote figure they compare
  against.

## Migration (on load / server read)

Merge is one-way and idempotent, done client-side in `loadData`/`loadShared`
and mirrored server-side so a POST can't resurrect the old arrays:

1. If `jobs` is absent, build it from the old arrays:
   - Each **installation** → a job. Reuse its `id`. An installation record meant
     the deal was already won, so map status → stage as: `Quoted`→`Accepted`;
     `Scheduled`/`In progress`/`Installed`/`Handed over`/`Cancelled` map 1:1.
     Carry `scheduledDate/Time`, `technicianId`, `materials`, `checklist`,
     `siteNotes`→`notes`, `prospectId`/client fields. Put the old manual `quote`
     into `finalPrice` and mark it a manual/legacy price (no rubric data).
   - Each **quote** → a job. New job `id`. Map quote status → stage
     (`Draft`/`Sent`/`Accepted`/`Rejected`; `Expired`→`Rejected`). Carry
     `rubric`, `cameraCount`, `addons`, `zone`, `discountPct`, `notes`,
     `prospectId`/client fields, and its `ref` (or re-issue as `J-…`).
2. Once `jobs` exists, the old `quotes`/`installations` arrays are ignored and
   dropped on the next save.
3. `ref` collisions: re-number sequentially from the merged set. Job refs use a
   `J-YYYY-NNNN` scheme derived from the max existing number (not array length,
   so future deletes can't collide).

Given the workspace is new, real data volume is expected to be tiny; the
migration is defensive rather than load-bearing.

## Out of scope (later)

- Branded PDF + WhatsApp share of the quote (was Quote Phase 2) — now "share
  this job's quote," unchanged in scope.
- Before/after install photos; technician logins.
- Automatic stage transitions (e.g. auto-Scheduled when a date is set).

## Files touched (anticipated)

- `sales-app/app.js` — merge the two UI modules into one `renderJobs`/job form;
  `jobValue`; `JOB_STAGES`; migration in `loadData`/`loadShared`/import; nav +
  `MORE_VIEWS`/`moreViewsForRole`; `render()` dispatch; primaryAction; submit
  routing; remove the `quotes`/`installs` views and the manual quote field.
- `sales-app/netlify/functions/data.mjs` — `EMPTY`/`clean` gain `jobs`, drop
  `quotes`/`installations`; single non-reviewer revert rule for `jobs`;
  server-side migration guard.
- `sales-app/index.html` — one "Jobs" nav button replaces "Quotes" + "Installs";
  bump `?v=N`.
- `sales-app/app.css` — reuse existing quote/install styles; minor stage-chip
  additions if needed.

## Success criteria

- One "Jobs" screen; no separate Quotes or Installs anywhere.
- A job is priced exactly once (rubric), with manual entry only for custom/admin
  override.
- One status pipeline Draft→Handed over (+ Rejected/Cancelled).
- Existing payments still resolve to their jobs; existing installation/quote
  data appears as jobs after migration.
- Governance, checklist gate, and float behaviour unchanged.
