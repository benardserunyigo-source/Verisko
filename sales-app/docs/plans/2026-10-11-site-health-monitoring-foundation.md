# Site Health Monitoring: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the monitoring backend: database tables, the incident engine, and four Edge Functions that turn box reports and recorder alert emails into incidents and SMS alerts. No Operations screen, no real SMS provider, and no box agent yet.

**Architecture:** One pure incident engine decides what changes. Thin handlers authenticate a key, validate the payload, load a site's state through a repository, call the engine, save the result, and send SMS through a sender interface. The handlers run unchanged in Node tests (against an in-memory fake repository) and on Supabase (against the real one). Each Edge Function is deployed as a self-contained bundle through the Supabase connector.

**Tech Stack:** Node 24 ES modules tested with `node:test` and no new dependencies. Deno on Supabase Edge Functions importing the same `.mjs` files. Supabase Postgres in project `cepernltrzrmupgegcib` (`verisko-sales`, currently empty). No Supabase command-line tool is installed, so deployment uses the Supabase connector tools.

**Spec:** `sales-app/docs/specs/2026-10-11-site-health-monitoring-design.md`. This plan implements spec build step 1 and the deployable backend parts of steps 2 to 4. The later plans are listed at the end.

**Ground rules**

- Work from `/Users/ben/Verisko/sales-app` unless a step says otherwise. Run tests with `node --test tests/monitoring-<name>.test.js`.
- Standing project rule: commit means commit **and** `git push origin main`. Every task ends that way. Stage only the files the task names, because the repo has many unrelated untracked files and an unrelated edit to `.gitignore`.
- Every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- No app assets change in this plan, so the `?v=` cache version is not bumped. The only deployed-site change is one line in `_redirects` (Task 0).
- Never paste a raw access key into chat, a commit, or a file inside the repo. Raw keys live only in `~/.verisko-monitoring/`.

## File structure

| File | Responsibility |
|---|---|
| `monitoring/supabase/functions/_shared/rules.mjs` | Default alert rules and constants. Merges database overrides. |
| `monitoring/supabase/functions/_shared/incident-engine.mjs` | Pure decisions: statuses, faults, recoveries, heartbeats, the watcher. |
| `monitoring/supabase/functions/_shared/sms-text.mjs` | Turns a notification into one short SMS. |
| `monitoring/supabase/functions/_shared/keys.mjs` | Generates and hashes access keys, reads the bearer token. |
| `monitoring/supabase/functions/_shared/validate.mjs` | Payload checks and the box clock rule. |
| `monitoring/supabase/functions/_shared/http.mjs`, `auth.mjs` | JSON responses and key checking. |
| `monitoring/supabase/functions/_shared/sms.mjs`, `notify.mjs` | SMS sender interface (console sender for now) and the dispatcher that texts and records who was told. |
| `monitoring/supabase/functions/_shared/handlers/ingest.mjs` | Box reports and recorder emails. |
| `monitoring/supabase/functions/_shared/handlers/watch.mjs` | Minute-by-minute watcher. |
| `monitoring/supabase/functions/_shared/handlers/sites.mjs` | Read summaries, acknowledge, fix. |
| `monitoring/supabase/functions/_shared/repo.mjs` | The real database access, on supabase-js. |
| `monitoring/supabase/functions/*/index.ts` | Four thin Edge Function entry points. |
| `monitoring/supabase/migrations/20261012000000_monitoring_tables.sql` | The tables. |
| `monitoring/scripts/*.mjs` | Deploy bundle builder, key maker, smoke-test replay. |
| `tests/helpers/fake-repo.mjs`, `tests/helpers/harness.mjs` | In-memory database and shared handler test setup. |
| `tests/monitoring-*.test.js` | Eight test files, 102 tests in all. |

---

### Task 0: Keep the monitoring files off the public site

The app is published straight from this folder, so any static file under `monitoring/` would be readable on the live site. Do this first, before any monitoring file is pushed.

**Files:**
- Modify: `_redirects`

- [ ] **Step 1: Add the rule**

Add this line to `_redirects` directly above the final `/* /index.html 200` line (the `!` forces the rule even when a real file exists):

```
/monitoring/* /index.html 200!
```

The file should now read:

```
/api/data /.netlify/functions/data 200
/api/receipt /.netlify/functions/receipt 200
/api/export /.netlify/functions/export 200
/api/auth /.netlify/functions/auth 200
/monitoring/* /index.html 200!
/* /index.html 200
```

- [ ] **Step 2: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/_redirects
git commit -m "sales-app: serve the app shell for /monitoring/* so monitoring files are never public

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 3: Confirm routing still works**

Wait about a minute for Netlify to deploy, then run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://verisko-sales-2026.netlify.app/api/data
```

Expected: `401` (the API still answers and asks for sign-in). A `404`, or a `200` with HTML, means the new line broke routing: run `git revert HEAD && git push origin main` and stop. The check that the folder is really hidden happens in Task 13, once a file exists to hide.

### Task 1: Alert rules

**Files:**
- Create: `monitoring/supabase/functions/_shared/rules.mjs`
- Test: `tests/monitoring-rules.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/monitoring-rules.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES, normalizeRules, EMAIL_FAULT_KINDS } from "../monitoring/supabase/functions/_shared/rules.mjs";

test("defaults match the spec table", () => {
  assert.deepEqual(DEFAULT_RULES.camera_offline, { waitMinutes: 5, severity: "high", sms: true, autoExpireHours: 24 });
  assert.deepEqual(DEFAULT_RULES.recorder_offline, { waitMinutes: 5, severity: "high", sms: true, autoExpireHours: null });
  assert.equal(DEFAULT_RULES.disk_full.waitMinutes, 0);
  assert.equal(DEFAULT_RULES.disk_error.waitMinutes, 0);
  assert.equal(DEFAULT_RULES.site_silent.waitMinutes, 15);
  assert.deepEqual(DEFAULT_RULES.ip_conflict, { waitMinutes: 0, severity: "medium", sms: false, autoExpireHours: null });
});

test("normalizeRules with no rows returns the defaults as a copy", () => {
  const r = normalizeRules([]);
  assert.deepEqual(r, DEFAULT_RULES);
  r.camera_offline.waitMinutes = 99;
  assert.equal(DEFAULT_RULES.camera_offline.waitMinutes, 5);
});

test("database rows override defaults kind by kind and unknown kinds are ignored", () => {
  const r = normalizeRules([
    { kind: "camera_offline", wait_minutes: 10, severity: "high", sms: false, auto_expire_hours: 12 },
    { kind: "made_up_kind", wait_minutes: 1, severity: "low", sms: true, auto_expire_hours: null },
  ]);
  assert.deepEqual(r.camera_offline, { waitMinutes: 10, severity: "high", sms: false, autoExpireHours: 12 });
  assert.equal(r.made_up_kind, undefined);
  assert.equal(r.disk_full.waitMinutes, 0);
});

test("a null auto_expire_hours row clears the default expiry", () => {
  const r = normalizeRules([{ kind: "camera_offline", wait_minutes: 5, severity: "high", sms: true, auto_expire_hours: null }]);
  assert.equal(r.camera_offline.autoExpireHours, null);
});

test("email feeds may only raise these fault kinds", () => {
  assert.deepEqual(EMAIL_FAULT_KINDS, ["camera_offline", "disk_full", "disk_error", "ip_conflict"]);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/monitoring-rules.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `rules.mjs`.

- [ ] **Step 3: Write the implementation**

Create `monitoring/supabase/functions/_shared/rules.mjs`:

```javascript
// Alert rules and shared constants for site health monitoring.
// Rows in the alert_rules table override these defaults, kind by kind.

export const DEFAULT_RULES = {
  camera_offline:   { waitMinutes: 5,  severity: "high",   sms: true,  autoExpireHours: 24 },
  recorder_offline: { waitMinutes: 5,  severity: "high",   sms: true,  autoExpireHours: null },
  disk_full:        { waitMinutes: 0,  severity: "high",   sms: true,  autoExpireHours: null },
  disk_error:       { waitMinutes: 0,  severity: "high",   sms: true,  autoExpireHours: null },
  site_silent:      { waitMinutes: 15, severity: "high",   sms: true,  autoExpireHours: null },
  ip_conflict:      { waitMinutes: 0,  severity: "medium", sms: false, autoExpireHours: null },
};

export const REPEAT_SMS_MINUTES = 60;          // at most one reminder SMS per open incident per hour
export const AREA_GROUP_WINDOW_MINUTES = 10;   // silent sites this close together may share one outage
export const AREA_GROUP_MIN_SITES = 2;         // sites needed in one area to call it a likely power cut
export const EMAIL_FAULT_KINDS = ["camera_offline", "disk_full", "disk_error", "ip_conflict"];

// rows: alert_rules table rows [{ kind, wait_minutes, severity, sms, auto_expire_hours }]
export function normalizeRules(rows) {
  const out = {};
  for (const [kind, rule] of Object.entries(DEFAULT_RULES)) out[kind] = { ...rule };
  for (const r of rows || []) {
    const base = out[r.kind];
    if (!base) continue;
    out[r.kind] = {
      waitMinutes: Number.isFinite(r.wait_minutes) ? r.wait_minutes : base.waitMinutes,
      severity: r.severity || base.severity,
      sms: typeof r.sms === "boolean" ? r.sms : base.sms,
      autoExpireHours: r.auto_expire_hours === undefined ? base.autoExpireHours : r.auto_expire_hours,
    };
  }
  return out;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --test tests/monitoring-rules.test.js`
Expected: `ℹ pass 5` and `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/functions/_shared/rules.mjs sales-app/tests/monitoring-rules.test.js
git commit -m "sales-app: monitoring alert rules and defaults

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: Incident engine

**Files:**
- Create: `monitoring/supabase/functions/_shared/incident-engine.mjs`
- Test: `tests/monitoring-engine.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/monitoring-engine.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES } from "../monitoring/supabase/functions/_shared/rules.mjs";
import {
  applyStatus, applyHeartbeat, applyFault, applyRecovery, evaluateWatch, incidentRef,
} from "../monitoring/supabase/functions/_shared/incident-engine.mjs";

const rules = DEFAULT_RULES;
const T0 = Date.parse("2026-10-12T10:00:00Z");
const at = (min) => new Date(T0 + min * 60000).toISOString();
const now = (min) => T0 + min * 60000;
const state = (extra = {}) => ({ siteId: "S1", deviceStates: {}, incidents: [], ...extra });
const cam = (ok, min) => ({ deviceId: "C3", deviceKind: "camera", ok, observedAt: at(min) });

// ---------- box status ----------
test("a first ok report creates ok state and no incident", () => {
  const r = applyStatus(state(), cam(true, 0), rules, now(0));
  assert.equal(r.deviceState.state, "ok");
  assert.equal(r.changed, true);
  assert.deepEqual(r.ops, []);
});

test("a camera down for less than the wait opens nothing", () => {
  const s = state({ deviceStates: { C3: { state: "down", since: at(0), lastEventAt: at(0) } } });
  const r = applyStatus(s, cam(false, 4), rules, now(4));
  assert.deepEqual(r.ops, []);
  assert.equal(r.changed, false);
  assert.equal(r.deviceState.since, at(0));
});

test("a camera down for the full wait opens one incident and one SMS notification", () => {
  const s = state({ deviceStates: { C3: { state: "down", since: at(0), lastEventAt: at(4) } } });
  const r = applyStatus(s, cam(false, 5), rules, now(5));
  assert.equal(r.ops.length, 1);
  assert.equal(r.ops[0].op, "open");
  assert.equal(r.ops[0].kind, "camera_offline");
  assert.equal(r.ops[0].source, "box");
  assert.equal(r.ops[0].openedAt, at(0), "incident opens at the time the fault began");
  assert.equal(r.ops[0].ref, incidentRef("S1", "C3", "camera_offline"));
  assert.equal(r.notifications[0].type, "opened");
});

test("a camera still down with an open incident opens no second incident", () => {
  const inc = { id: "I1", deviceId: "C3", kind: "camera_offline", state: "open", source: "box", openedAt: at(0), lastSeenAt: at(5), notifiedAt: at(5) };
  const s = state({ deviceStates: { C3: { state: "down", since: at(0), lastEventAt: at(6) } }, incidents: [inc] });
  const r = applyStatus(s, cam(false, 7), rules, now(7));
  assert.deepEqual(r.ops, []);
  assert.deepEqual(r.notifications, []);
});

test("a reminder is sent after an hour but not to an acknowledged incident", () => {
  const base = { id: "I1", deviceId: "C3", kind: "camera_offline", source: "box", openedAt: at(0), lastSeenAt: at(5), notifiedAt: at(5) };
  const ds = { C3: { state: "down", since: at(0), lastEventAt: at(64) } };
  const open = applyStatus(state({ deviceStates: ds, incidents: [{ ...base, state: "open" }] }), cam(false, 65), rules, now(65));
  assert.equal(open.notifications[0].type, "reminder");
  assert.equal(open.ops[0].op, "repeat");
  const ack = applyStatus(state({ deviceStates: ds, incidents: [{ ...base, state: "acknowledged" }] }), cam(false, 65), rules, now(65));
  assert.deepEqual(ack.notifications, []);
});

test("a camera that comes back fixes its incident and sends a fixed notification", () => {
  const inc = { id: "I1", deviceId: "C3", kind: "camera_offline", state: "open", source: "box", openedAt: at(0), lastSeenAt: at(9), notifiedAt: at(5) };
  const s = state({ deviceStates: { C3: { state: "down", since: at(0), lastEventAt: at(9) } }, incidents: [inc] });
  const r = applyStatus(s, cam(true, 10), rules, now(10));
  assert.equal(r.ops[0].op, "fix");
  assert.equal(r.ops[0].reason, "recovered");
  assert.equal(r.notifications[0].type, "fixed");
  assert.equal(r.deviceState.state, "ok");
  assert.equal(r.changed, true);
});

test("no fixed SMS if the opening SMS never went out", () => {
  const inc = { id: "I1", deviceId: "C3", kind: "camera_offline", state: "open", source: "box", openedAt: at(0), lastSeenAt: at(9), notifiedAt: null };
  const s = state({ deviceStates: { C3: { state: "down", since: at(0), lastEventAt: at(9) } }, incidents: [inc] });
  assert.deepEqual(applyStatus(s, cam(true, 10), rules, now(10)).notifications, []);
});

test("a report older than the device's current since is stale and changes nothing", () => {
  const s = state({ deviceStates: { C3: { state: "ok", since: at(10), lastEventAt: at(12) } } });
  const r = applyStatus(s, cam(false, 5), rules, now(13));
  assert.equal(r.stale, true);
  assert.equal(r.deviceState, null);
  assert.deepEqual(r.ops, []);
});

test("a recorder uses its own rule and incident kind", () => {
  const s = state({ deviceStates: { R1: { state: "down", since: at(0), lastEventAt: at(5) } } });
  const r = applyStatus(s, { deviceId: "R1", deviceKind: "recorder", ok: false, observedAt: at(5) }, rules, now(5));
  assert.equal(r.ops[0].kind, "recorder_offline");
});

test("a rule with sms off opens an incident but sends no notification", () => {
  const quiet = { ...rules, camera_offline: { ...rules.camera_offline, sms: false } };
  const s = state({ deviceStates: { C3: { state: "down", since: at(0), lastEventAt: at(4) } } });
  const r = applyStatus(s, cam(false, 5), quiet, now(5));
  assert.equal(r.ops[0].op, "open");
  assert.deepEqual(r.notifications, []);
});

// ---------- heartbeat ----------
test("a heartbeat fixes an open site_silent incident", () => {
  const inc = { id: "I9", deviceId: "B1", kind: "site_silent", state: "open", source: "watch", openedAt: at(0), notifiedAt: at(16) };
  const r = applyHeartbeat(state({ incidents: [inc] }), rules, now(30));
  assert.equal(r.boxLastSeenAt, at(30));
  assert.equal(r.ops[0].op, "fix");
  assert.equal(r.notifications[0].type, "fixed");
});

test("a heartbeat with nothing silent only updates last seen", () => {
  const r = applyHeartbeat(state(), rules, now(1));
  assert.deepEqual(r.ops, []);
  assert.deepEqual(r.notifications, []);
});

// ---------- email faults ----------
const fault = (kind, min, deviceId = null) => ({ faultKind: kind, deviceId, observedAt: at(min) });

test("an email disk_full fault opens an incident straight away", () => {
  const r = applyFault(state(), fault("disk_full", 0, "R1"), rules, now(0));
  assert.equal(r.ops[0].op, "open");
  assert.equal(r.ops[0].source, "email");
  assert.equal(r.notifications[0].type, "opened");
});

test("an email camera_offline fault marks the camera down and opens an incident without waiting", () => {
  const r = applyFault(state(), fault("camera_offline", 0, "C3"), rules, now(0));
  assert.equal(r.deviceState.state, "down");
  assert.equal(r.ops[0].kind, "camera_offline");
});

test("a repeated email fault updates one incident and counts the repeat", () => {
  const inc = { id: "I1", deviceId: "C3", kind: "camera_offline", state: "open", source: "email", openedAt: at(0), lastSeenAt: at(0), notifiedAt: at(1) };
  const r = applyFault(state({ incidents: [inc] }), fault("camera_offline", 10, "C3"), rules, now(10));
  assert.equal(r.ops.length, 1);
  assert.deepEqual(r.ops[0], { op: "repeat", incidentId: "I1", lastSeenAt: at(10), count: true });
  assert.deepEqual(r.notifications, []);
});

test("ip_conflict opens an incident but never sends SMS", () => {
  const r = applyFault(state(), fault("ip_conflict", 0), rules, now(0));
  assert.equal(r.ops[0].op, "open");
  assert.deepEqual(r.notifications, []);
});

test("unknown and site_silent fault kinds are ignored", () => {
  assert.deepEqual(applyFault(state(), fault("site_silent", 0), rules, now(0)).ops, []);
  assert.deepEqual(applyFault(state(), fault("nonsense", 0), rules, now(0)).ops, []);
});

test("an email recovery fixes the matching incident", () => {
  const inc = { id: "I1", deviceId: "C3", kind: "camera_offline", state: "open", source: "email", openedAt: at(0), lastSeenAt: at(0), notifiedAt: at(1) };
  const r = applyRecovery(state({ incidents: [inc] }), fault("camera_offline", 8, "C3"), rules, now(8));
  assert.equal(r.ops[0].op, "fix");
  assert.equal(r.deviceState.state, "ok");
  assert.equal(r.notifications[0].type, "fixed");
});

test("an email recovery with no open incident does nothing", () => {
  assert.deepEqual(applyRecovery(state(), fault("disk_full", 8, "R1"), rules, now(8)).ops, []);
});

// ---------- watcher ----------
const site = (id, area, lastSeenMin, extra = {}) => ({ id, area, feeds: ["box"], status: "active", boxLastSeenAt: lastSeenMin == null ? null : at(lastSeenMin), boxDeviceId: `B-${id}`, ...extra });

test("watch opens site_silent after the wait and not before", () => {
  const early = evaluateWatch({ sites: [site("S1", "Ntinda", 0)], incidents: [] }, rules, now(14));
  assert.deepEqual(early.ops, []);
  const due = evaluateWatch({ sites: [site("S1", "Ntinda", 0)], incidents: [] }, rules, now(15));
  assert.equal(due.ops[0].op, "open");
  assert.equal(due.ops[0].kind, "site_silent");
  assert.equal(due.ops[0].openedAt, at(0));
  assert.equal(due.notifications[0].type, "opened");
});

test("watch ignores email-only sites, paused sites and boxes that never reported", () => {
  const snap = { sites: [
    site("S1", "A", 0, { feeds: ["email"] }),
    site("S2", "A", 0, { status: "paused" }),
    site("S3", "A", null),
  ], incidents: [] };
  assert.deepEqual(evaluateWatch(snap, rules, now(60)).ops, []);
});

test("watch does not open a second silent incident for a site already silent", () => {
  const inc = { id: "I1", siteId: "S1", kind: "site_silent", state: "open", source: "watch", openedAt: at(0), lastSeenAt: at(0) };
  assert.deepEqual(evaluateWatch({ sites: [site("S1", "A", 0)], incidents: [inc] }, rules, now(60)).ops, []);
});

test("two silent sites in one area within ten minutes become one area outage and one SMS", () => {
  const snap = { sites: [site("S1", "Ntinda", 0), site("S2", "Ntinda", 3)], incidents: [] };
  const r = evaluateWatch(snap, rules, now(20));
  const opens = r.ops.filter((o) => o.op === "open");
  assert.equal(opens.length, 2);
  assert.ok(opens.every((o) => o.areaGroup && o.areaGroup.startsWith("ntinda|")));
  assert.equal(r.notifications.length, 1);
  assert.equal(r.notifications[0].type, "area_outage");
  assert.deepEqual(r.notifications[0].siteIds.sort(), ["S1", "S2"]);
});

test("silent sites in different areas get their own SMS", () => {
  const snap = { sites: [site("S1", "Ntinda", 0), site("S2", "Kololo", 0)], incidents: [] };
  const r = evaluateWatch(snap, rules, now(20));
  assert.equal(r.notifications.length, 2);
  assert.ok(r.notifications.every((n) => n.type === "opened"));
});

test("silent sites more than ten minutes apart in one area are not grouped", () => {
  const snap = { sites: [site("S1", "Ntinda", 0), site("S2", "Ntinda", 12)], incidents: [] };
  const r = evaluateWatch(snap, rules, now(40));
  assert.ok(r.notifications.every((n) => n.type === "opened"));
});

test("a site going silent joins an existing silent incident nearby and groups both", () => {
  const existing = { id: "I1", siteId: "S1", kind: "site_silent", state: "open", source: "watch", openedAt: at(0), lastSeenAt: at(0), notifiedAt: at(16), areaGroup: null };
  const snap = { sites: [site("S1", "Ntinda", 0), site("S2", "Ntinda", 4)], incidents: [existing] };
  const r = evaluateWatch(snap, rules, now(20));
  assert.ok(r.ops.some((o) => o.op === "group" && o.incidentId === "I1"));
  assert.equal(r.notifications[0].type, "area_outage");
  assert.deepEqual(r.notifications[0].incidentIds, ["I1"]);
});

test("sites with no area never group", () => {
  const snap = { sites: [site("S1", "", 0), site("S2", "", 0)], incidents: [] };
  assert.ok(evaluateWatch(snap, rules, now(20)).notifications.every((n) => n.type === "opened"));
});

test("watch expires stale email incidents silently and leaves box incidents alone", () => {
  const old = { id: "I1", siteId: "S1", kind: "camera_offline", state: "open", source: "email", openedAt: at(0), lastSeenAt: at(0) };
  const box = { id: "I2", siteId: "S1", kind: "camera_offline", state: "open", source: "box", openedAt: at(0), lastSeenAt: at(0) };
  const disk = { id: "I3", siteId: "S1", kind: "disk_full", state: "open", source: "email", openedAt: at(0), lastSeenAt: at(0) };
  const r = evaluateWatch({ sites: [], incidents: [old, box, disk] }, rules, now(24 * 60));
  assert.deepEqual(r.ops, [{ op: "fix", incidentId: "I1", fixedAt: at(24 * 60), reason: "expired" }]);
  assert.deepEqual(r.notifications, []);
});

test("an email incident that repeated recently does not expire", () => {
  const inc = { id: "I1", siteId: "S1", kind: "camera_offline", state: "open", source: "email", openedAt: at(0), lastSeenAt: at(23 * 60) };
  assert.deepEqual(evaluateWatch({ sites: [], incidents: [inc] }, rules, now(24 * 60)).ops, []);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/monitoring-engine.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `incident-engine.mjs`.

- [ ] **Step 3: Write the implementation**

Create `monitoring/supabase/functions/_shared/incident-engine.mjs`:

```javascript
// Incident engine: pure functions, no database, no network, no clock of its own.
// Every function takes the current state of a site (or of all sites for the watcher),
// the rules, and `now` in epoch milliseconds, and returns what should change.
//
// state = {
//   siteId,
//   deviceStates: { [deviceId]: { state: "ok"|"down", since: iso, lastEventAt: iso } },
//   incidents: [ { id, deviceId, kind, state: "open"|"acknowledged"|"fixed", source,
//                  openedAt, lastSeenAt, notifiedAt, repeatCount, areaGroup } ],
// }
// ops:           { op: "open"|"repeat"|"fix"|"group", ... }   (written by the caller)
// notifications: { type: "opened"|"reminder"|"fixed"|"area_outage", ... }

import { REPEAT_SMS_MINUTES, AREA_GROUP_WINDOW_MINUTES, AREA_GROUP_MIN_SITES } from "./rules.mjs";

const MIN = 60000;
const ms = (iso) => Date.parse(iso);
const lc = (v) => String(v || "").trim().toLowerCase();
const later = (a, b) => (!a ? b : !b ? a : ms(a) >= ms(b) ? a : b);
const STATUS_KIND = { camera: "camera_offline", recorder: "recorder_offline" };

export const incidentRef = (siteId, deviceId, kind) => [siteId, deviceId || "", kind].join("|");

function activeIncident(state, deviceId, kind) {
  return (state.incidents || []).find(
    (i) => i.kind === kind && (i.deviceId || null) === (deviceId || null) && i.state !== "fixed"
  ) || null;
}

function reminderDue(inc, rule, nowMs) {
  return !!rule && rule.sms && inc.state === "open" && !!inc.notifiedAt &&
    nowMs - ms(inc.notifiedAt) >= REPEAT_SMS_MINUTES * MIN;
}

const emptyResult = () => ({ deviceState: null, changed: false, stale: false, ops: [], notifications: [] });

function nextDeviceState(prev, deviceId, nextState, observedAt) {
  const changed = !prev || prev.state !== nextState;
  return {
    changed,
    deviceState: changed
      ? { deviceId, state: nextState, since: observedAt, lastEventAt: observedAt }
      : { deviceId, state: nextState, since: prev.since, lastEventAt: later(prev.lastEventAt, observedAt) },
  };
}

// A box reported one device. ev = { deviceId, deviceKind: "camera"|"recorder", ok, observedAt }
export function applyStatus(state, ev, rules, nowMs) {
  const out = emptyResult();
  const prev = (state.deviceStates || {})[ev.deviceId] || null;
  if (prev && ms(ev.observedAt) < ms(prev.since)) { out.stale = true; return out; }

  const next = nextDeviceState(prev, ev.deviceId, ev.ok ? "ok" : "down", ev.observedAt);
  out.deviceState = next.deviceState;
  out.changed = next.changed;

  const kind = STATUS_KIND[ev.deviceKind];
  const rule = kind ? rules[kind] : null;
  if (!rule) return out;
  const existing = activeIncident(state, ev.deviceId, kind);

  if (!ev.ok) {
    const downMinutes = (ms(ev.observedAt) - ms(out.deviceState.since)) / MIN;
    if (downMinutes < rule.waitMinutes) return out;
    if (!existing) {
      const ref = incidentRef(state.siteId, ev.deviceId, kind);
      out.ops.push({ op: "open", ref, siteId: state.siteId, deviceId: ev.deviceId, kind, source: "box",
        openedAt: out.deviceState.since, lastSeenAt: ev.observedAt });
      if (rule.sms) out.notifications.push({ type: "opened", ref, siteId: state.siteId, deviceId: ev.deviceId, kind, since: out.deviceState.since });
    } else if (reminderDue(existing, rule, nowMs)) {
      out.ops.push({ op: "repeat", incidentId: existing.id, lastSeenAt: ev.observedAt, count: false });
      out.notifications.push({ type: "reminder", incidentId: existing.id, siteId: state.siteId, deviceId: ev.deviceId, kind, since: existing.openedAt });
    }
  } else if (existing) {
    out.ops.push({ op: "fix", incidentId: existing.id, fixedAt: ev.observedAt, reason: "recovered" });
    if (rule.sms && existing.notifiedAt) {
      out.notifications.push({ type: "fixed", incidentId: existing.id, siteId: state.siteId, deviceId: ev.deviceId, kind, since: existing.openedAt });
    }
  }
  return out;
}

// Any accepted box post proves the box is alive. Clears an open "site silent" incident.
export function applyHeartbeat(state, rules, nowMs) {
  const nowIso = new Date(nowMs).toISOString();
  const out = { boxLastSeenAt: nowIso, ops: [], notifications: [] };
  const existing = (state.incidents || []).find((i) => i.kind === "site_silent" && i.state !== "fixed");
  if (existing) {
    out.ops.push({ op: "fix", incidentId: existing.id, fixedAt: nowIso, reason: "recovered" });
    if (rules.site_silent.sms && existing.notifiedAt) {
      out.notifications.push({ type: "fixed", incidentId: existing.id, siteId: state.siteId, deviceId: existing.deviceId || null, kind: "site_silent", since: existing.openedAt });
    }
  }
  return out;
}

// A recorder emailed a fault. ev = { faultKind, deviceId|null, observedAt }
export function applyFault(state, ev, rules, nowMs) {
  const out = emptyResult();
  const rule = rules[ev.faultKind];
  if (!rule || ev.faultKind === "site_silent") return out;
  const deviceId = ev.deviceId || null;

  if (ev.faultKind === "camera_offline" && deviceId) {
    const prev = (state.deviceStates || {})[deviceId] || null;
    if (prev && ms(ev.observedAt) < ms(prev.since)) out.stale = true;
    else {
      const next = nextDeviceState(prev, deviceId, "down", ev.observedAt);
      out.deviceState = next.deviceState;
      out.changed = next.changed;
    }
  }

  const existing = activeIncident(state, deviceId, ev.faultKind);
  if (!existing) {
    const ref = incidentRef(state.siteId, deviceId, ev.faultKind);
    out.ops.push({ op: "open", ref, siteId: state.siteId, deviceId, kind: ev.faultKind, source: "email",
      openedAt: ev.observedAt, lastSeenAt: ev.observedAt });
    if (rule.sms) out.notifications.push({ type: "opened", ref, siteId: state.siteId, deviceId, kind: ev.faultKind, since: ev.observedAt });
  } else {
    out.ops.push({ op: "repeat", incidentId: existing.id, lastSeenAt: ev.observedAt, count: true });
    if (reminderDue(existing, rule, nowMs)) {
      out.notifications.push({ type: "reminder", incidentId: existing.id, siteId: state.siteId, deviceId, kind: ev.faultKind, since: existing.openedAt });
    }
  }
  return out;
}

// A recorder emailed that a fault cleared (only if the recorder model sends such emails).
export function applyRecovery(state, ev, rules, nowMs) {
  const out = emptyResult();
  const rule = rules[ev.faultKind];
  if (!rule || ev.faultKind === "site_silent") return out;
  const deviceId = ev.deviceId || null;

  if (ev.faultKind === "camera_offline" && deviceId) {
    const prev = (state.deviceStates || {})[deviceId] || null;
    if (prev && ms(ev.observedAt) < ms(prev.since)) out.stale = true;
    else {
      const next = nextDeviceState(prev, deviceId, "ok", ev.observedAt);
      out.deviceState = next.deviceState;
      out.changed = next.changed;
    }
  }
  const existing = activeIncident(state, deviceId, ev.faultKind);
  if (existing) {
    out.ops.push({ op: "fix", incidentId: existing.id, fixedAt: ev.observedAt, reason: "recovered" });
    if (rule.sms && existing.notifiedAt) {
      out.notifications.push({ type: "fixed", incidentId: existing.id, siteId: state.siteId, deviceId, kind: ev.faultKind, since: existing.openedAt });
    }
  }
  return out;
}

// The minute-by-minute watcher. Looks across all sites.
// snap = { sites: [{ id, area, feeds, status, boxLastSeenAt, boxDeviceId }],
//          incidents: [ every non-fixed incident, with siteId ] }
export function evaluateWatch(snap, rules, nowMs) {
  const ops = [];
  const notifications = [];
  const sites = snap.sites || [];
  const incidents = snap.incidents || [];
  const siteById = Object.fromEntries(sites.map((s) => [s.id, s]));

  // 1. Email incidents that stopped repeating expire on their own, silently.
  for (const inc of incidents) {
    const rule = rules[inc.kind];
    if (inc.source !== "email" || !rule || rule.autoExpireHours == null) continue;
    if (nowMs - ms(inc.lastSeenAt || inc.openedAt) >= rule.autoExpireHours * 60 * MIN) {
      ops.push({ op: "fix", incidentId: inc.id, fixedAt: new Date(nowMs).toISOString(), reason: "expired" });
    }
  }

  // 2. Boxes that went quiet.
  const rule = rules.site_silent;
  const activeSilent = incidents.filter((i) => i.kind === "site_silent" && i.state !== "fixed");
  const alreadySilent = new Set(activeSilent.map((i) => i.siteId));
  const fresh = [];
  for (const s of sites) {
    if (s.status !== "active" || !(s.feeds || []).includes("box") || !s.boxLastSeenAt) continue;
    if (alreadySilent.has(s.id)) continue;
    if (nowMs - ms(s.boxLastSeenAt) < rule.waitMinutes * MIN) continue;
    fresh.push({ site: s, openedAt: s.boxLastSeenAt });
  }

  // 3. Several quiet sites in one area close together are one likely power cut.
  const entries = [
    ...activeSilent.map((i) => ({ siteId: i.siteId, area: (siteById[i.siteId] || {}).area, openedAt: i.openedAt, incidentId: i.id, areaGroup: i.areaGroup || null })),
    ...fresh.map((f) => ({ siteId: f.site.id, area: f.site.area, openedAt: f.openedAt, incidentId: null, areaGroup: null })),
  ];
  const groups = new Map();
  const groupedIncidents = new Set();
  const opens = [];
  for (const f of fresh) {
    const ref = incidentRef(f.site.id, f.site.boxDeviceId, "site_silent");
    const peers = lc(f.site.area)
      ? entries.filter((e) => lc(e.area) === lc(f.site.area) &&
          Math.abs(ms(e.openedAt) - ms(f.openedAt)) <= AREA_GROUP_WINDOW_MINUTES * MIN)
      : [];
    const peerSites = [...new Set(peers.map((e) => e.siteId))];
    let areaGroup = null;
    if (peerSites.length >= AREA_GROUP_MIN_SITES) {
      const earliest = peers.map((e) => e.openedAt).sort((a, b) => ms(a) - ms(b))[0];
      areaGroup = `${lc(f.site.area)}|${earliest}`;
      if (!groups.has(areaGroup)) groups.set(areaGroup, { area: f.site.area, since: earliest, siteIds: new Set(), refs: [], incidentIds: new Set() });
      const g = groups.get(areaGroup);
      peerSites.forEach((id) => g.siteIds.add(id));
      g.refs.push(ref);
      for (const e of peers) {
        if (!e.incidentId) continue;
        g.incidentIds.add(e.incidentId);
        if (!e.areaGroup && !groupedIncidents.has(e.incidentId)) {
          groupedIncidents.add(e.incidentId);
          ops.push({ op: "group", incidentId: e.incidentId, areaGroup });
        }
      }
    } else if (rule.sms) {
      notifications.push({ type: "opened", ref, siteId: f.site.id, deviceId: f.site.boxDeviceId || null, kind: "site_silent", since: f.openedAt });
    }
    opens.push({ op: "open", ref, siteId: f.site.id, deviceId: f.site.boxDeviceId || null, kind: "site_silent", source: "watch",
      openedAt: f.openedAt, lastSeenAt: f.openedAt, areaGroup });
  }
  ops.push(...opens);
  for (const [areaGroup, g] of groups) {
    notifications.push({ type: "area_outage", area: g.area, areaGroup, since: g.since,
      siteIds: [...g.siteIds], refs: g.refs, incidentIds: [...g.incidentIds] });
  }
  return { ops, notifications };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --test tests/monitoring-engine.test.js`
Expected: `ℹ pass 29` and `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/functions/_shared/incident-engine.mjs sales-app/tests/monitoring-engine.test.js
git commit -m "sales-app: monitoring incident engine (status, fault, recovery, heartbeat, watcher)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 3: SMS text, access keys and payload checks

**Files:**
- Create: `monitoring/supabase/functions/_shared/sms-text.mjs`, `keys.mjs`, `validate.mjs`
- Test: `tests/monitoring-support.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/monitoring-support.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { formatSms, kampalaTime } from "../monitoring/supabase/functions/_shared/sms-text.mjs";
import { generateKey, hashKey, bearerToken } from "../monitoring/supabase/functions/_shared/keys.mjs";
import { clampObservedAt, validateBoxPayload, validateEmailPayload } from "../monitoring/supabase/functions/_shared/validate.mjs";

// ---------- sms text ----------
const site = { code: "VS-0007", name: "Mukasa Pharmacy" };
test("Kampala time is UTC plus three", () => assert.equal(kampalaTime("2026-10-12T11:05:00Z"), "14:05"));

test("opened SMS names the site, the device and the time", () => {
  const t = formatSms({ type: "opened", kind: "camera_offline", since: "2026-10-12T11:05:00Z" }, { site, device: { label: "Camera 3" } });
  assert.equal(t, "VERISKO VS-0007 Mukasa Pharmacy: Camera 3 offline since 14:05. Open Sites.");
});
test("reminder and fixed SMS are marked clearly", () => {
  assert.match(formatSms({ type: "reminder", kind: "disk_full", since: "2026-10-12T11:05:00Z" }, { site }), /^STILL OPEN\. VERISKO VS-0007/);
  assert.equal(formatSms({ type: "fixed", kind: "recorder_offline", since: "x" }, { site }), "FIXED. VERISKO VS-0007 Mukasa Pharmacy: recorder offline.");
});
test("area outage SMS lists the site codes", () => {
  const t = formatSms({ type: "area_outage", area: "Ntinda", since: "2026-10-12T11:05:00Z" }, { sites: [{ code: "VS-0001" }, { code: "VS-0002" }] });
  assert.equal(t, "VERISKO likely power cut in Ntinda: 2 sites silent (VS-0001, VS-0002) since 14:05. Open Sites.");
});
test("long client names are shortened and no SMS passes 160 characters", () => {
  const t = formatSms({ type: "opened", kind: "site_silent", since: "2026-10-12T11:05:00Z" }, { site: { code: "VS-0001", name: "A very long business name that keeps going and going and going" } });
  assert.ok(t.length <= 160);
  assert.ok(t.includes("VS-0001 A very long business.:"));
});
test("an unknown notification type is an error", () => assert.throws(() => formatSms({ type: "nope" }, { site })));

// ---------- keys ----------
test("keys carry their kind, are unique, and hash to 64 hex characters", async () => {
  const a = generateKey("box"), b = generateKey("box");
  assert.match(a, /^vsk_box_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  const h = await hashKey(a);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await hashKey(a));
});
test("bearerToken reads the Authorization header", () => {
  const req = (h) => new Request("http://x", { headers: h });
  assert.equal(bearerToken(req({ authorization: "Bearer abc" })), "abc");
  assert.equal(bearerToken(req({ authorization: "bearer abc" })), "abc");
  assert.equal(bearerToken(req({})), null);
  assert.equal(bearerToken(req({ authorization: "Basic abc" })), null);
});

// ---------- clock rule ----------
const NOW = Date.parse("2026-10-12T10:00:00Z");
test("a live box time within five minutes is kept", () => assert.equal(clampObservedAt("2026-10-12T10:03:00Z", NOW, false), "2026-10-12T10:03:00.000Z"));
test("a live box time more than five minutes off becomes server time", () => {
  assert.equal(clampObservedAt("2026-10-12T12:00:00Z", NOW, false), "2026-10-12T10:00:00.000Z");
  assert.equal(clampObservedAt("2026-10-12T08:00:00Z", NOW, false), "2026-10-12T10:00:00.000Z");
});
test("a replayed time is kept but never in the future", () => {
  assert.equal(clampObservedAt("2026-10-12T08:00:00Z", NOW, true), "2026-10-12T08:00:00.000Z");
  assert.equal(clampObservedAt("2026-10-12T12:00:00Z", NOW, true), "2026-10-12T10:00:00.000Z");
});
test("a missing or broken time becomes server time", () => {
  assert.equal(clampObservedAt(null, NOW, false), "2026-10-12T10:00:00.000Z");
  assert.equal(clampObservedAt("not a date", NOW, true), "2026-10-12T10:00:00.000Z");
});

// ---------- box payload ----------
const box = (over) => ({ type: "box", checks: [{ kind: "camera", label: "Camera 3", ok: true }], ...over });
test("a good box payload is accepted and cleaned", () => {
  const v = validateBoxPayload(box({ replay: true, checks: [{ kind: "camera", label: "  Camera 3 ", ok: false, channel: 3 }] }));
  assert.equal(v.ok, true);
  assert.deepEqual(v.value.checks, [{ kind: "camera", label: "Camera 3", ok: false, channel: 3 }]);
  assert.equal(v.value.replay, true);
});
test("bad box payloads are refused with a reason", () => {
  assert.equal(validateBoxPayload(null).ok, false);
  assert.equal(validateBoxPayload(box({ type: "email" })).ok, false);
  assert.equal(validateBoxPayload(box({ checks: [] })).ok, false);
  assert.equal(validateBoxPayload(box({ checks: [{ kind: "toaster", label: "x", ok: true }] })).ok, false);
  assert.equal(validateBoxPayload(box({ checks: [{ kind: "camera", label: "", ok: true }] })).ok, false);
  assert.equal(validateBoxPayload(box({ checks: [{ kind: "camera", label: "C", ok: "yes" }] })).ok, false);
  assert.equal(validateBoxPayload(box({ checks: [{ kind: "camera", label: "C", ok: true }, { kind: "camera", label: "c", ok: false }] })).ok, false);
  assert.equal(validateBoxPayload(box({ checks: Array.from({ length: 65 }, (_, i) => ({ kind: "camera", label: `C${i}`, ok: true })) })).ok, false);
});

// ---------- email payload ----------
const mail = (over) => ({ type: "email", message_id: "m1", class: "fault", fault_kind: "camera_offline", site_code: "vs-0001", ...over });
test("a good email payload is accepted and the site code is normalised", () => {
  const v = validateEmailPayload(mail({ device_label: "Camera 3", subject: "Alarm" }));
  assert.equal(v.ok, true);
  assert.equal(v.value.siteCode, "VS-0001");
  assert.equal(v.value.faultKind, "camera_offline");
});
test("an unknown email needs no fault kind or site code", () => {
  assert.equal(validateEmailPayload({ type: "email", message_id: "m2", class: "unknown", subject: "hello" }).ok, true);
});
test("bad email payloads are refused with a reason", () => {
  assert.equal(validateEmailPayload(mail({ message_id: "" })).ok, false);
  assert.equal(validateEmailPayload(mail({ class: "weird" })).ok, false);
  assert.equal(validateEmailPayload(mail({ fault_kind: "site_silent" })).ok, false);
  assert.equal(validateEmailPayload(mail({ fault_kind: "recorder_offline" })).ok, false);
  assert.equal(validateEmailPayload(mail({ site_code: "BAD-1" })).ok, false);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/monitoring-support.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `sms-text.mjs`.

- [ ] **Step 3: Write the three implementations**

Create `monitoring/supabase/functions/_shared/sms-text.mjs`:

```javascript
// Turns a notification from the engine into one short SMS (kept under 160 characters).

const WHAT = {
  camera_offline: (device) => `${(device && device.label) || "camera"} offline`,
  recorder_offline: () => "recorder offline",
  disk_full: () => "recorder disk full",
  disk_error: () => "recorder disk error",
  site_silent: () => "no report from the site box",
  ip_conflict: () => "recorder address conflict",
};

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kampala", hour: "2-digit", minute: "2-digit", hour12: false,
});

export const kampalaTime = (iso) => timeFormat.format(new Date(iso));
const short = (text, n) => (String(text || "").length > n ? String(text).slice(0, n - 1).trimEnd() + "." : String(text || ""));
const cap = (text) => (text.length > 160 ? text.slice(0, 157) + "..." : text);

// ctx = { site: {code, name}, device: {label}|null, sites: [{code, name}] }
export function formatSms(n, ctx) {
  if (n.type === "area_outage") {
    const codes = (ctx.sites || []).map((s) => s.code).join(", ");
    return cap(`VERISKO likely power cut in ${n.area}: ${(ctx.sites || []).length} sites silent (${codes}) since ${kampalaTime(n.since)}. Open Sites.`);
  }
  const who = `${ctx.site.code} ${short(ctx.site.name, 22)}`;
  const what = (WHAT[n.kind] || (() => n.kind))(ctx.device);
  if (n.type === "opened") return cap(`VERISKO ${who}: ${what} since ${kampalaTime(n.since)}. Open Sites.`);
  if (n.type === "reminder") return cap(`STILL OPEN. VERISKO ${who}: ${what} since ${kampalaTime(n.since)}.`);
  if (n.type === "fixed") return cap(`FIXED. VERISKO ${who}: ${what}.`);
  throw new Error(`unknown notification type ${n.type}`);
}
```

Create `monitoring/supabase/functions/_shared/keys.mjs`:

```javascript
// Access keys for boxes, the email script, the app's API calls and the watcher.
// Only a SHA-256 hash of a key is ever stored. Works in Node 20+ and Deno.

const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function generateKey(kind) {
  return `vsk_${kind}_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export async function hashKey(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bearerToken(request) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "");
  return match ? match[1] : null;
}
```

Create `monitoring/supabase/functions/_shared/validate.mjs`:

```javascript
// Payload checks for the two feeds, and the clock rule for observed times.
import { EMAIL_FAULT_KINDS } from "./rules.mjs";

export const LIMITS = { maxChecks: 64, maxLabel: 60, maxMessageId: 300, maxSubject: 300, maxExcerpt: 2000, clockSkewMinutes: 5 };
const MIN = 60000;
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Live box posts: if the box clock is more than five minutes off, use the server time.
// Replayed (queued) posts keep their original time but can never be in the future.
export function clampObservedAt(observedAt, nowMs, replay) {
  const t = Date.parse(observedAt);
  if (!Number.isFinite(t)) return new Date(nowMs).toISOString();
  if (replay) return new Date(Math.min(t, nowMs)).toISOString();
  return Math.abs(t - nowMs) > LIMITS.clockSkewMinutes * MIN ? new Date(nowMs).toISOString() : new Date(t).toISOString();
}

export function validateBoxPayload(body) {
  if (!isObj(body) || body.type !== "box") return { ok: false, error: "type must be box" };
  if (!Array.isArray(body.checks) || body.checks.length === 0) return { ok: false, error: "checks must be a non-empty list" };
  if (body.checks.length > LIMITS.maxChecks) return { ok: false, error: "too many checks" };
  const seen = new Set();
  const checks = [];
  for (const c of body.checks) {
    if (!isObj(c)) return { ok: false, error: "each check must be an object" };
    if (c.kind !== "camera" && c.kind !== "recorder") return { ok: false, error: "check kind must be camera or recorder" };
    const label = text(c.label, LIMITS.maxLabel);
    if (!label) return { ok: false, error: "each check needs a label" };
    if (typeof c.ok !== "boolean") return { ok: false, error: "check ok must be true or false" };
    const key = `${c.kind}:${label.toLowerCase()}`;
    if (seen.has(key)) return { ok: false, error: `duplicate check ${label}` };
    seen.add(key);
    const channel = Number.isInteger(c.channel) && c.channel > 0 ? c.channel : null;
    checks.push({ kind: c.kind, label, ok: c.ok, channel });
  }
  return { ok: true, value: { observedAt: typeof body.observed_at === "string" ? body.observed_at : null, replay: body.replay === true, checks } };
}

export function validateEmailPayload(body) {
  if (!isObj(body) || body.type !== "email") return { ok: false, error: "type must be email" };
  const messageId = text(body.message_id, LIMITS.maxMessageId);
  if (!messageId) return { ok: false, error: "message_id is required" };
  const cls = body.class;
  if (cls !== "fault" && cls !== "recovery" && cls !== "unknown") return { ok: false, error: "class must be fault, recovery or unknown" };
  const faultKind = text(body.fault_kind, 40);
  if (cls !== "unknown" && !EMAIL_FAULT_KINDS.includes(faultKind)) return { ok: false, error: "fault_kind is not one an email may raise" };
  const siteCode = text(body.site_code, 20).toUpperCase();
  if (siteCode && !/^VS-\d{4,}$/.test(siteCode)) return { ok: false, error: "site_code must look like VS-0001" };
  return { ok: true, value: {
    messageId, cls, faultKind: cls === "unknown" ? "" : faultKind, siteCode,
    deviceLabel: text(body.device_label, LIMITS.maxLabel),
    observedAt: typeof body.observed_at === "string" ? body.observed_at : null,
    subject: text(body.subject, LIMITS.maxSubject), excerpt: text(body.excerpt, LIMITS.maxExcerpt),
  } };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --test tests/monitoring-support.test.js`
Expected: `ℹ pass 17` and `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/functions/_shared/sms-text.mjs sales-app/monitoring/supabase/functions/_shared/keys.mjs sales-app/monitoring/supabase/functions/_shared/validate.mjs sales-app/tests/monitoring-support.test.js
git commit -m "sales-app: monitoring SMS text, access keys and payload validation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 4: Fake repository for tests

The handlers talk to the database only through a repository object. This in-memory version follows the same contract as the real one (Task 9), so the handler tests run whole flows without a database.

**Files:**
- Create: `tests/helpers/fake-repo.mjs`

- [ ] **Step 1: Write the fake repository**

Create `tests/helpers/fake-repo.mjs`:

```javascript
// In-memory stand-in for the Supabase repo. It follows the same contract as
// monitoring/supabase/functions/_shared/repo.mjs, so handler tests exercise real flows.

export function makeFakeRepo({ now = () => new Date() } = {}) {
  const db = { sites: [], devices: [], keys: [], events: [], deviceStates: {}, incidents: [], contacts: [], rules: [] };
  let seq = 0;
  const id = (p) => `${p}-${++seq}`;
  const iso = () => now().toISOString();
  const active = (i) => i.state !== "fixed";

  const repo = {
    db,
    addSite(s) { const site = { id: id("S"), code: `VS-${String(db.sites.length + 1).padStart(4, "0")}`, name: "Test Pharmacy", area: "Ntinda", feeds: ["box"], status: "active", boxLastSeenAt: null, ...s }; db.sites.push(site); return site; },
    addKey(k) { db.keys.push({ revokedAt: null, ...k }); },
    addContact(c) { db.contacts.push({ active: true, ...c }); },

    async findKey(hash) { const k = db.keys.find((x) => x.keyHash === hash); return k ? { id: k.id, kind: k.kind, siteId: k.siteId || null, revokedAt: k.revokedAt } : null; },
    async loadRules() { return db.rules; },
    async getSite(siteId) { return db.sites.find((s) => s.id === siteId) || null; },
    async getSiteByCode(code) { return db.sites.find((s) => s.code === code) || null; },
    async loadSiteState(siteId) {
      const ids = new Set(db.devices.filter((d) => d.siteId === siteId).map((d) => d.id));
      const deviceStates = {};
      for (const [k, v] of Object.entries(db.deviceStates)) if (ids.has(k)) deviceStates[k] = { ...v };
      return { siteId, deviceStates, incidents: db.incidents.filter((i) => i.siteId === siteId && active(i)).map((i) => ({ ...i })) };
    },
    async ensureDevice({ siteId, kind, label, channel = null }) {
      let d = db.devices.find((x) => x.siteId === siteId && x.kind === kind && x.label.toLowerCase() === label.toLowerCase());
      if (!d) { d = { id: id("D"), siteId, kind, label, channel }; db.devices.push(d); }
      return { id: d.id, kind: d.kind, label: d.label };
    },
    async hasEvent(dedupeKey) { return db.events.some((e) => e.dedupeKey === dedupeKey); },
    async save({ siteId, events, deviceStates, ops, boxSeenAt }) {
      for (const e of events || []) if (!db.events.some((x) => x.dedupeKey === e.dedupeKey)) db.events.push({ id: id("E"), receivedAt: iso(), ...e });
      for (const s of deviceStates || []) db.deviceStates[s.deviceId] = { state: s.state, since: s.since, lastEventAt: s.lastEventAt };
      const created = {};
      for (const o of ops || []) {
        if (o.op === "open") {
          const dup = db.incidents.find((i) => i.siteId === o.siteId && (i.deviceId || null) === (o.deviceId || null) && i.kind === o.kind && active(i));
          if (dup) { created[o.ref] = dup.id; continue; }
          const inc = { id: id("I"), siteId: o.siteId, deviceId: o.deviceId || null, kind: o.kind, state: "open", source: o.source,
            openedAt: o.openedAt, lastSeenAt: o.lastSeenAt, notifiedAt: null, repeatCount: 1, areaGroup: o.areaGroup || null, createdAt: iso() };
          db.incidents.push(inc); created[o.ref] = inc.id;
        } else if (o.op === "repeat") {
          const inc = db.incidents.find((i) => i.id === o.incidentId);
          if (inc) { inc.lastSeenAt = o.lastSeenAt; if (o.count) inc.repeatCount += 1; }
        } else if (o.op === "fix") {
          const inc = db.incidents.find((i) => i.id === o.incidentId);
          if (inc && active(inc)) { inc.state = "fixed"; inc.fixedAt = o.fixedAt; inc.fixedReason = o.reason; }
        } else if (o.op === "group") {
          const inc = db.incidents.find((i) => i.id === o.incidentId);
          if (inc) inc.areaGroup = o.areaGroup;
        }
      }
      if (boxSeenAt && siteId) { const s = db.sites.find((x) => x.id === siteId); if (s) s.boxLastSeenAt = boxSeenAt; }
      return { created };
    },
    async markNotified(ids, nowIso) { for (const i of db.incidents) if (ids.includes(i.id)) i.notifiedAt = nowIso; },
    async listContacts() { return db.contacts.filter((c) => c.active); },
    async describe({ siteIds, deviceIds }) {
      const sites = {}, devices = {};
      for (const s of db.sites) if (siteIds.includes(s.id)) sites[s.id] = { code: s.code, name: s.name, area: s.area };
      for (const d of db.devices) if (deviceIds.includes(d.id)) devices[d.id] = { label: d.label };
      return { sites, devices };
    },
    async listWatchSnapshot() {
      return {
        sites: db.sites.map((s) => ({ ...s, boxDeviceId: (db.devices.find((d) => d.siteId === s.id && d.kind === "box") || {}).id || null })),
        incidents: db.incidents.filter(active).map((i) => ({ ...i })),
      };
    },
    async listUnnotified(sinceIso) {
      return db.incidents.filter((i) => i.state === "open" && !i.notifiedAt && i.createdAt >= sinceIso).map((i) => ({ ...i }));
    },
    async listSummary() {
      return {
        sites: db.sites.map((s) => ({
          ...s,
          devices: db.devices.filter((d) => d.siteId === s.id).map((d) => ({ ...d, ...(db.deviceStates[d.id] || { state: "unknown" }) })),
          incidents: db.incidents.filter((i) => i.siteId === s.id && active(i)).map((i) => ({ ...i })),
        })),
        unknown: db.events.filter((e) => e.kind === "unknown").slice(-20),
      };
    },
    async getSiteDetail(siteId) {
      const site = db.sites.find((s) => s.id === siteId);
      if (!site) return null;
      return { site, devices: db.devices.filter((d) => d.siteId === siteId).map((d) => ({ ...d, ...(db.deviceStates[d.id] || { state: "unknown" }) })),
        incidents: db.incidents.filter((i) => i.siteId === siteId).slice(-50), events: db.events.filter((e) => e.siteId === siteId).slice(-50) };
    },
    async setIncidentState({ incidentId, action, by, nowIso }) {
      const inc = db.incidents.find((i) => i.id === incidentId);
      if (!inc) return null;
      if (action === "acknowledge" && inc.state === "open") { inc.state = "acknowledged"; inc.acknowledgedBy = by; inc.acknowledgedAt = nowIso; return { changed: true, state: inc.state }; }
      if (action === "fix" && inc.state !== "fixed") { inc.state = "fixed"; inc.fixedBy = by; inc.fixedAt = nowIso; inc.fixedReason = "manual"; return { changed: true, state: inc.state }; }
      return { changed: false, state: inc.state };
    },
  };
  return repo;
}
```

- [ ] **Step 2: Check it loads and behaves**

Run:

```bash
node -e "import('./tests/helpers/fake-repo.mjs').then(async ({ makeFakeRepo }) => { const r = makeFakeRepo(); const s = r.addSite({}); console.log(s.code, (await r.getSiteByCode('VS-0001')).name); })"
```

Expected output: `VS-0001 Test Pharmacy`

- [ ] **Step 3: Commit**

```bash
cd /Users/ben/Verisko
git add sales-app/tests/helpers/fake-repo.mjs
git commit -m "sales-app: in-memory fake repository for monitoring handler tests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 5: Ingest handler

Accepts a box report or a recorder email, runs the engine, saves, and sends SMS.

**Files:**
- Create: `monitoring/supabase/functions/_shared/http.mjs`, `auth.mjs`, `sms.mjs`, `notify.mjs`, `handlers/ingest.mjs`
- Create: `tests/helpers/harness.mjs`
- Test: `tests/monitoring-ingest.test.js`

- [ ] **Step 1: Write the test harness and the failing test**

Create `tests/helpers/harness.mjs`:

```javascript
// Shared setup for handler tests: a fake repo, a controllable clock, a recording SMS sender,
// and helpers that call the real handlers with real Request objects.
import { makeFakeRepo } from "./fake-repo.mjs";
import { generateKey, hashKey } from "../../monitoring/supabase/functions/_shared/keys.mjs";
import { handleIngest } from "../../monitoring/supabase/functions/_shared/handlers/ingest.mjs";
import { handleWatch } from "../../monitoring/supabase/functions/_shared/handlers/watch.mjs";
import { handleSitesRead, handleIncidentUpdate } from "../../monitoring/supabase/functions/_shared/handlers/sites.mjs";

export const T0 = Date.parse("2026-10-12T10:00:00Z");

export async function makeHarness({ contacts = [{ name: "Abraham", phone: "+256700000001" }] } = {}) {
  const clock = { t: T0 };
  const at = () => new Date(clock.t).toISOString();
  const repo = makeFakeRepo({ now: () => new Date(clock.t) });
  const sent = [];
  const sms = { fail: false, async send(phones, text) { if (sms.fail) throw new Error("provider down"); sent.push({ phones, text }); } };
  const deps = { repo, sms, now: () => new Date(clock.t) };
  contacts.forEach((c) => repo.addContact(c));

  const keys = {};
  for (const kind of ["box", "email", "api", "watch"]) {
    keys[kind] = generateKey(kind);
  }
  const site = repo.addSite({ name: "Mukasa Pharmacy", area: "Ntinda" });
  repo.addKey({ id: "K-box", kind: "box", siteId: site.id, keyHash: await hashKey(keys.box) });
  repo.addKey({ id: "K-email", kind: "email", siteId: null, keyHash: await hashKey(keys.email) });
  repo.addKey({ id: "K-api", kind: "api", siteId: null, keyHash: await hashKey(keys.api) });
  repo.addKey({ id: "K-watch", kind: "watch", siteId: null, keyHash: await hashKey(keys.watch) });

  const call = (handler, key, body, method = "POST") =>
    handler(new Request("http://test/fn", { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) }), deps);

  const h = {
    clock, repo, sent, sms, deps, keys, site, at,
    advance(min) { clock.t += min * 60000; },
    ingest: (key, body) => call(handleIngest, key, body),
    watch: (key = keys.watch) => call(handleWatch, key, {}),
    sitesRead: (key, body) => call(handleSitesRead, key, body),
    incidentUpdate: (key, body) => call(handleIncidentUpdate, key, body),
    // a box report at the current clock time
    boxReport: (checks, extra = {}) => call(handleIngest, keys.box, { type: "box", observed_at: at(), checks, ...extra }),
    // a recorder alert email
    email: (over) => call(handleIngest, keys.email, { type: "email", message_id: `m-${Math.random()}`, observed_at: at(), class: "fault", fault_kind: "camera_offline", site_code: site.code, device_label: "Camera 3", subject: "Alarm", ...over }),
    incidents: () => repo.db.incidents,
  };
  return h;
}

export const cam3 = (ok) => [{ kind: "camera", label: "Camera 3", ok }, { kind: "recorder", label: "Recorder", ok: true }];
```

Create `tests/monitoring-ingest.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { makeHarness, cam3 } from "./helpers/harness.mjs";

const body = async (res) => res.json();

// ---------- access ----------
test("ingest refuses a missing key, a wrong key, a revoked key and a GET", async () => {
  const h = await makeHarness();
  assert.equal((await h.ingest(null, { type: "box" })).status, 401);
  assert.equal((await h.ingest("vsk_box_wrong", { type: "box" })).status, 401);
  h.repo.db.keys.find((k) => k.id === "K-box").revokedAt = h.at();
  assert.equal((await h.boxReport(cam3(true))).status, 401);
  const get = await (await import("../monitoring/supabase/functions/_shared/handlers/ingest.mjs")).handleIngest(new Request("http://x", { method: "GET" }), h.deps);
  assert.equal(get.status, 405);
});

test("api and watch keys cannot post to ingest", async () => {
  const h = await makeHarness();
  assert.equal((await h.ingest(h.keys.api, { type: "box", checks: cam3(true) })).status, 403);
  assert.equal((await h.ingest(h.keys.watch, { type: "box", checks: cam3(true) })).status, 403);
});

test("a box key cannot post an email payload and an email key cannot post a box payload", async () => {
  const h = await makeHarness();
  assert.equal((await h.ingest(h.keys.box, { type: "email", message_id: "m", class: "unknown" })).status, 400);
  assert.equal((await h.ingest(h.keys.email, { type: "box", checks: cam3(true) })).status, 400);
});

test("a malformed body is a 400, not a crash", async () => {
  const h = await makeHarness();
  const res = await (await import("../monitoring/supabase/functions/_shared/handlers/ingest.mjs")).handleIngest(
    new Request("http://x", { method: "POST", headers: { authorization: `Bearer ${h.keys.box}` }, body: "{not json" }), h.deps);
  assert.equal(res.status, 400);
});

// ---------- box flow ----------
test("a first all-ok box report creates devices, records last seen, and sends nothing", async () => {
  const h = await makeHarness();
  const res = await h.boxReport(cam3(true));
  assert.equal(res.status, 200);
  assert.equal(h.site.boxLastSeenAt, h.at());
  assert.equal(h.repo.db.devices.filter((d) => d.siteId === h.site.id).length, 3); // box, camera, recorder
  assert.equal(h.incidents().length, 0);
  assert.equal(h.sent.length, 0);
});

test("a camera that stays down for five minutes opens one incident and sends one SMS", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true));
  for (let m = 1; m <= 6; m++) { h.advance(1); await h.boxReport(cam3(false)); }
  assert.equal(h.incidents().length, 1);
  assert.equal(h.incidents()[0].kind, "camera_offline");
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].text, "VERISKO VS-0001 Mukasa Pharmacy: Camera 3 offline since 13:01. Open Sites.");
  assert.deepEqual(h.sent[0].phones, ["+256700000001"]);
  assert.ok(h.incidents()[0].notifiedAt, "incident records that the SMS went out");
});

test("a camera down for less than five minutes raises nothing", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true));
  for (let m = 1; m <= 4; m++) { h.advance(1); await h.boxReport(cam3(false)); }
  assert.equal(h.incidents().length, 0);
  assert.equal(h.sent.length, 0);
});

test("recovery fixes the incident and sends a FIXED SMS", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true));
  for (let m = 1; m <= 6; m++) { h.advance(1); await h.boxReport(cam3(false)); }
  h.advance(1);
  const res = await h.boxReport(cam3(true));
  assert.equal((await body(res)).fixed, 1);
  assert.equal(h.incidents()[0].state, "fixed");
  assert.equal(h.incidents()[0].fixedReason, "recovered");
  assert.equal(h.sent.length, 2);
  assert.match(h.sent[1].text, /^FIXED\. VERISKO VS-0001/);
});

test("the same report sent twice does not duplicate incidents, events or SMS", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true));
  for (let m = 1; m <= 6; m++) { h.advance(1); await h.boxReport(cam3(false)); }
  const events = h.repo.db.events.length;
  await h.boxReport(cam3(false)); // same minute again (a retry)
  assert.equal(h.incidents().length, 1);
  assert.equal(h.sent.length, 1);
  assert.equal(h.repo.db.events.length, events);
});

test("a box clock hours ahead is replaced by server time", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true), { observed_at: "2026-10-12T20:00:00Z" });
  const cam = h.repo.db.devices.find((d) => d.label === "Camera 3");
  assert.equal(h.repo.db.deviceStates[cam.id].since, h.at());
});

test("a replayed report keeps its original time", async () => {
  const h = await makeHarness();
  h.advance(60);
  await h.boxReport(cam3(true), { observed_at: "2026-10-12T10:00:00Z", replay: true });
  const cam = h.repo.db.devices.find((d) => d.label === "Camera 3");
  assert.equal(h.repo.db.deviceStates[cam.id].since, "2026-10-12T10:00:00.000Z");
});

test("a paused site stores state but raises nothing", async () => {
  const h = await makeHarness();
  h.site.status = "paused";
  await h.boxReport(cam3(true));
  for (let m = 1; m <= 6; m++) { h.advance(1); await h.boxReport(cam3(false)); }
  assert.equal(h.incidents().length, 0);
  assert.equal(h.sent.length, 0);
  assert.equal(Object.keys(h.repo.db.deviceStates).length > 0, true);
});

test("a closed site is refused", async () => {
  const h = await makeHarness();
  h.site.status = "closed";
  assert.equal((await h.boxReport(cam3(true))).status, 403);
});

test("with no SMS contacts configured the incident still opens and stays unnotified", async () => {
  const h = await makeHarness({ contacts: [] });
  await h.boxReport(cam3(true));
  for (let m = 1; m <= 6; m++) { h.advance(1); await h.boxReport(cam3(false)); }
  assert.equal(h.incidents().length, 1);
  assert.equal(h.incidents()[0].notifiedAt, null);
});

test("an SMS provider failure does not fail ingestion and leaves the incident unnotified", async () => {
  const h = await makeHarness();
  h.sms.fail = true;
  await h.boxReport(cam3(true));
  let res;
  for (let m = 1; m <= 6; m++) { h.advance(1); res = await h.boxReport(cam3(false)); }
  assert.equal(res.status, 200);
  assert.equal(h.incidents().length, 1);
  assert.equal(h.incidents()[0].notifiedAt, null);
});

test("an hour later an open unacknowledged incident sends one reminder", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true));
  for (let m = 1; m <= 6; m++) { h.advance(1); await h.boxReport(cam3(false)); }
  h.advance(30); await h.boxReport(cam3(false));
  assert.equal(h.sent.length, 1);
  h.advance(31); await h.boxReport(cam3(false));
  assert.equal(h.sent.length, 2);
  assert.match(h.sent[1].text, /^STILL OPEN\./);
});

// ---------- email flow ----------
test("a camera-offline email opens an incident and sends an SMS", async () => {
  const h = await makeHarness();
  const res = await h.email({});
  assert.equal(res.status, 200);
  assert.equal(h.incidents().length, 1);
  assert.equal(h.incidents()[0].source, "email");
  assert.match(h.sent[0].text, /Camera 3 offline/);
});

test("the same email twice (same message id) is ignored", async () => {
  const h = await makeHarness();
  await h.email({ message_id: "same" });
  const second = await body(await h.email({ message_id: "same" }));
  assert.equal(second.duplicate, true);
  assert.equal(h.incidents().length, 1);
  assert.equal(h.sent.length, 1);
});

test("a second email for the same fault repeats the incident instead of opening another", async () => {
  const h = await makeHarness();
  await h.email({});
  h.advance(10);
  await h.email({});
  assert.equal(h.incidents().length, 1);
  assert.equal(h.incidents()[0].repeatCount, 2);
  assert.equal(h.sent.length, 1);
});

test("disk faults attach to the recorder device without a label", async () => {
  const h = await makeHarness();
  await h.email({ fault_kind: "disk_full", device_label: "" });
  const inc = h.incidents()[0];
  assert.equal(inc.kind, "disk_full");
  assert.equal(h.repo.db.devices.find((d) => d.id === inc.deviceId).label, "Recorder");
});

test("ip_conflict opens an incident but sends no SMS", async () => {
  const h = await makeHarness();
  await h.email({ fault_kind: "ip_conflict", device_label: "" });
  assert.equal(h.incidents().length, 1);
  assert.equal(h.sent.length, 0);
});

test("a recovery email fixes the incident", async () => {
  const h = await makeHarness();
  await h.email({});
  h.advance(8);
  await h.email({ class: "recovery" });
  assert.equal(h.incidents()[0].state, "fixed");
  assert.match(h.sent[1].text, /^FIXED\./);
});

test("an email for an unknown site code is stored as unknown and raises nothing", async () => {
  const h = await makeHarness();
  const res = await body(await h.email({ site_code: "VS-9999" }));
  assert.equal(res.unknown, true);
  assert.equal(res.matched, false);
  assert.equal(h.incidents().length, 0);
  assert.equal(h.repo.db.events.filter((e) => e.kind === "unknown").length, 1);
});

test("an email the script could not read is stored as unknown", async () => {
  const h = await makeHarness();
  await h.email({ class: "unknown", fault_kind: undefined, subject: "Weekly report" });
  assert.equal(h.repo.db.events.filter((e) => e.kind === "unknown").length, 1);
  assert.equal(h.incidents().length, 0);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/monitoring-ingest.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for a file under `handlers/` (the harness imports all three handlers).

- [ ] **Step 3: Write the implementation**

Create `monitoring/supabase/functions/_shared/http.mjs`:

```javascript
export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
```

Create `monitoring/supabase/functions/_shared/auth.mjs`:

```javascript
import { bearerToken, hashKey } from "./keys.mjs";
import { json } from "./http.mjs";

// Returns { key } when the bearer token is a live key of one of the allowed kinds,
// otherwise { response } holding the error to return.
export async function authenticate(request, repo, allowedKinds) {
  const token = bearerToken(request);
  if (!token) return { response: json(401, { error: "missing key" }) };
  const key = await repo.findKey(await hashKey(token));
  if (!key || key.revokedAt) return { response: json(401, { error: "bad key" }) };
  if (!allowedKinds.includes(key.kind)) return { response: json(403, { error: "this key cannot do that" }) };
  return { key };
}
```

Create `monitoring/supabase/functions/_shared/sms.mjs`:

```javascript
// SMS sender interface: { send(phones: string[], text: string): Promise<void> }.
// Phase 1 ships a console sender. A real provider replaces it at build step 4 without
// touching any other file.
export function consoleSms(log = console.log) {
  return { async send(phones, text) { log(`[sms] to ${phones.join(",")}: ${text}`); } };
}
```

Create `monitoring/supabase/functions/_shared/notify.mjs`:

```javascript
// Sends the SMS for a list of engine notifications and records who was told.
import { formatSms } from "./sms-text.mjs";

const unique = (list) => [...new Set(list.filter(Boolean))];

// notifications: engine output. created: { [ref]: incidentId } returned by repo.save.
export async function dispatchNotifications({ repo, sms, notifications, created, nowIso }) {
  if (!notifications.length) return { sent: 0 };
  const contacts = await repo.listContacts();
  if (!contacts.length) return { sent: 0 };
  const phones = contacts.map((c) => c.phone);
  const siteIds = unique(notifications.flatMap((n) => (n.siteIds ? n.siteIds : [n.siteId])));
  const deviceIds = unique(notifications.map((n) => n.deviceId));
  const info = await repo.describe({ siteIds, deviceIds });
  const toMark = [];
  let sent = 0;
  for (const n of notifications) {
    const ctx = {
      site: info.sites[n.siteId] || { code: "VS-????", name: "unknown site" },
      device: n.deviceId ? info.devices[n.deviceId] || null : null,
      sites: (n.siteIds || []).map((id) => info.sites[id]).filter(Boolean),
    };
    try {
      await sms.send(phones, formatSms(n, ctx));
      sent += 1;
    } catch (err) {
      continue; // leave notified_at empty so the watcher retries
    }
    if (n.type === "opened") toMark.push(n.incidentId || (created || {})[n.ref]);
    if (n.type === "reminder") toMark.push(n.incidentId);
    if (n.type === "area_outage") toMark.push(...(n.incidentIds || []), ...(n.refs || []).map((r) => (created || {})[r]));
  }
  const ids = unique(toMark);
  if (ids.length) await repo.markNotified(ids, nowIso);
  return { sent };
}
```

Create `monitoring/supabase/functions/_shared/handlers/ingest.mjs`:

```javascript
// POST /ingest. Accepts a box report or a recorder alert email, runs the engine,
// stores the result, and sends any SMS. Everything it needs comes in through `deps`,
// so it runs the same in tests (fake repo) and on Supabase (real repo).
//
// deps = { repo, sms, now: () => Date }

import { authenticate } from "../auth.mjs";
import { json } from "../http.mjs";
import { normalizeRules } from "../rules.mjs";
import { clampObservedAt, validateBoxPayload, validateEmailPayload } from "../validate.mjs";
import { applyStatus, applyHeartbeat, applyFault, applyRecovery } from "../incident-engine.mjs";
import { dispatchNotifications } from "../notify.mjs";

export async function handleIngest(request, deps) {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  const auth = await authenticate(request, deps.repo, ["box", "email"]);
  if (auth.response) return auth.response;
  let body;
  try { body = await request.json(); } catch (err) { return json(400, { error: "invalid JSON" }); }
  const rules = normalizeRules(await deps.repo.loadRules());
  return auth.key.kind === "box"
    ? ingestBox(auth.key, body, rules, deps)
    : ingestEmail(body, rules, deps);
}

const count = (ops, op) => ops.filter((o) => o.op === op).length;

async function finish({ deps, siteId, site, events, deviceStates, ops, notifications, boxSeenAt, nowIso }) {
  if (site && site.status === "paused") { ops = []; notifications = []; } // paused sites keep history, raise nothing
  const saved = await deps.repo.save({ siteId, events, deviceStates, ops, boxSeenAt });
  const sms = await dispatchNotifications({ repo: deps.repo, sms: deps.sms, notifications, created: saved.created, nowIso });
  return json(200, { ok: true, opened: count(ops, "open"), fixed: count(ops, "fix"), sms: sms.sent });
}

async function ingestBox(key, body, rules, deps) {
  const v = validateBoxPayload(body);
  if (!v.ok) return json(400, { error: v.error });
  const site = await deps.repo.getSite(key.siteId);
  if (!site || site.status === "closed") return json(403, { error: "site is not active" });
  const nowMs = deps.now().getTime();
  const nowIso = new Date(nowMs).toISOString();
  const observedAt = clampObservedAt(v.value.observedAt, nowMs, v.value.replay);
  const state = await deps.repo.loadSiteState(site.id);

  await deps.repo.ensureDevice({ siteId: site.id, kind: "box", label: "Box" });
  const events = [], deviceStates = [], ops = [], notifications = [];
  for (const c of v.value.checks) {
    const device = await deps.repo.ensureDevice({ siteId: site.id, kind: c.kind, label: c.label, channel: c.channel });
    const r = applyStatus(state, { deviceId: device.id, deviceKind: c.kind, ok: c.ok, observedAt }, rules, nowMs);
    if (r.stale) continue;
    deviceStates.push(r.deviceState);
    if (r.changed) {
      events.push({ siteId: site.id, deviceId: device.id, source: "box", kind: `${c.kind}_${c.ok ? "online" : "offline"}`,
        observedAt, dedupeKey: `box:${site.id}:${device.id}:${observedAt}:${c.ok}`, raw: c });
    }
    ops.push(...r.ops);
    notifications.push(...r.notifications);
  }
  const hb = applyHeartbeat(state, rules, nowMs);
  ops.push(...hb.ops);
  notifications.push(...hb.notifications);
  return finish({ deps, siteId: site.id, site, events, deviceStates, ops, notifications, boxSeenAt: hb.boxLastSeenAt, nowIso });
}

async function ingestEmail(body, rules, deps) {
  const v = validateEmailPayload(body);
  if (!v.ok) return json(400, { error: v.error });
  const m = v.value;
  const nowMs = deps.now().getTime();
  const nowIso = new Date(nowMs).toISOString();
  const dedupeKey = `email:${m.messageId}`;
  if (await deps.repo.hasEvent(dedupeKey)) return json(200, { ok: true, duplicate: true });
  const observedAt = clampObservedAt(m.observedAt, nowMs, true);
  const site = m.siteCode ? await deps.repo.getSiteByCode(m.siteCode) : null;

  if (!site || site.status === "closed" || m.cls === "unknown") {
    await deps.repo.save({ siteId: site ? site.id : null, deviceStates: [], ops: [], boxSeenAt: null, events: [
      { siteId: site ? site.id : null, deviceId: null, source: "email", kind: "unknown", observedAt, dedupeKey,
        raw: { siteCode: m.siteCode, subject: m.subject, excerpt: m.excerpt, class: m.cls, faultKind: m.faultKind } },
    ] });
    return json(200, { ok: true, unknown: true, matched: !!site });
  }

  const state = await deps.repo.loadSiteState(site.id);
  let device = null;
  if (m.deviceLabel) {
    device = await deps.repo.ensureDevice({ siteId: site.id, kind: m.faultKind === "camera_offline" ? "camera" : "recorder", label: m.deviceLabel });
  } else if (m.faultKind !== "camera_offline") {
    device = await deps.repo.ensureDevice({ siteId: site.id, kind: "recorder", label: "Recorder" });
  }
  const ev = { faultKind: m.faultKind, deviceId: device ? device.id : null, observedAt };
  const r = m.cls === "fault" ? applyFault(state, ev, rules, nowMs) : applyRecovery(state, ev, rules, nowMs);
  const events = [{ siteId: site.id, deviceId: ev.deviceId, source: "email", kind: m.cls === "fault" ? m.faultKind : `${m.faultKind}_cleared`,
    observedAt, dedupeKey, raw: { subject: m.subject, excerpt: m.excerpt } }];
  return finish({ deps, siteId: site.id, site, events, deviceStates: r.deviceState ? [r.deviceState] : [], ops: r.ops, notifications: r.notifications, boxSeenAt: null, nowIso });
}
```

The harness also imports the watch and sites handlers, so create temporary stubs until Tasks 6 and 7 replace them:

```bash
cd /Users/ben/Verisko/sales-app/monitoring/supabase/functions/_shared/handlers
printf 'export async function handleWatch() { throw new Error("not built yet"); }\n' > watch.mjs
printf 'export async function handleSitesRead() { throw new Error("not built yet"); }\nexport async function handleIncidentUpdate() { throw new Error("not built yet"); }\n' > sites.mjs
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --test tests/monitoring-ingest.test.js`
Expected: `ℹ pass 24` and `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/functions/_shared sales-app/tests/helpers/harness.mjs sales-app/tests/monitoring-ingest.test.js
git commit -m "sales-app: monitoring ingest handler (box reports and recorder emails)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 6: Watch handler

Finds quiet boxes, expires stale email incidents, groups area outages, and retries SMS that never went out.

**Files:**
- Modify (replace the stub): `monitoring/supabase/functions/_shared/handlers/watch.mjs`
- Test: `tests/monitoring-watch.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/monitoring-watch.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { makeHarness, cam3 } from "./helpers/harness.mjs";

const body = async (res) => res.json();

test("watch needs the watch key", async () => {
  const h = await makeHarness();
  assert.equal((await h.watch(null)).status, 401);
  assert.equal((await h.watch(h.keys.api)).status, 403);
  assert.equal((await h.watch(h.keys.box)).status, 403);
});

test("a box silent for fifteen minutes opens one site_silent incident and one SMS, not two", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true));
  h.advance(14); await h.watch();
  assert.equal(h.incidents().length, 0);
  h.advance(1); const res = await body(await h.watch());
  assert.equal(res.opened, 1);
  assert.equal(h.incidents()[0].kind, "site_silent");
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /no report from the site box since 13:00/);
  h.advance(1); await h.watch();
  assert.equal(h.incidents().length, 1);
  assert.equal(h.sent.length, 1);
});

test("when the silent box reports again the incident is fixed and a FIXED SMS goes out", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true));
  h.advance(16); await h.watch();
  h.advance(5); await h.boxReport(cam3(true));
  assert.equal(h.incidents()[0].state, "fixed");
  assert.match(h.sent[1].text, /^FIXED\./);
});

test("a site that never reported is never called silent", async () => {
  const h = await makeHarness();
  h.advance(600); await h.watch();
  assert.equal(h.incidents().length, 0);
});

test("two sites in one area going silent together send one power-cut SMS", async () => {
  const h = await makeHarness();
  const two = h.repo.addSite({ name: "Kato Supermarket", area: "Ntinda" });
  h.repo.db.sites.find((s) => s.id === h.site.id).boxLastSeenAt = h.at();
  h.repo.db.devices.push({ id: "DB1", siteId: h.site.id, kind: "box", label: "Box" });
  two.boxLastSeenAt = h.at();
  h.repo.db.devices.push({ id: "DB2", siteId: two.id, kind: "box", label: "Box" });
  h.advance(16); await h.watch();
  assert.equal(h.incidents().length, 2);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /^VERISKO likely power cut in Ntinda: 2 sites silent \(VS-0001, VS-0002\)/);
  assert.ok(h.incidents().every((i) => i.notifiedAt), "both incidents are marked notified");
  assert.ok(h.incidents().every((i) => i.areaGroup));
});

test("SMS that failed is retried by the next watch and sent once the provider is back", async () => {
  const h = await makeHarness();
  h.sms.fail = true;
  await h.boxReport(cam3(true));
  for (let m = 1; m <= 6; m++) { h.advance(1); await h.boxReport(cam3(false)); }
  assert.equal(h.incidents()[0].notifiedAt, null);
  h.sms.fail = false;
  h.advance(1);
  const res = await body(await h.watch());
  assert.equal(res.sms, 1);
  assert.ok(h.incidents()[0].notifiedAt);
  h.advance(1); await h.watch();
  assert.equal(h.sent.length, 1, "retried once, not repeatedly");
});

test("unsent alerts older than two hours are not retried", async () => {
  const h = await makeHarness({ contacts: [] });
  h.site.feeds = ["email"]; // email-only, so a quiet box cannot raise its own alert here
  await h.email({});
  assert.equal(h.incidents()[0].notifiedAt, null);
  h.repo.addContact({ name: "Abraham", phone: "+256700000001" });
  h.advance(180); await h.watch();
  assert.equal(h.sent.length, 0);
});

test("unsent alerts inside two hours are retried once contacts exist", async () => {
  const h = await makeHarness({ contacts: [] });
  h.site.feeds = ["email"];
  await h.email({});
  h.repo.addContact({ name: "Abraham", phone: "+256700000001" });
  h.advance(30); await h.watch();
  assert.equal(h.sent.length, 1);
  assert.ok(h.incidents()[0].notifiedAt);
});

test("a stale email incident expires after 24 hours of silence without any SMS", async () => {
  const h = await makeHarness();
  await h.email({});
  assert.equal(h.sent.length, 1);
  h.advance(24 * 60); const res = await body(await h.watch());
  assert.equal(res.expired, 1);
  assert.equal(h.incidents()[0].state, "fixed");
  assert.equal(h.incidents()[0].fixedReason, "expired");
  assert.equal(h.sent.length, 1);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/monitoring-watch.test.js`
Expected: FAIL. The stub throws `not built yet`, so tests report errors such as `Error: not built yet`.

- [ ] **Step 3: Replace the stub with the implementation**

Overwrite `monitoring/supabase/functions/_shared/handlers/watch.mjs`:

```javascript
// POST /watch, called every minute by the database scheduler.
// Finds quiet boxes, expires stale email incidents, and retries SMS that never went out.

import { authenticate } from "../auth.mjs";
import { json } from "../http.mjs";
import { normalizeRules } from "../rules.mjs";
import { evaluateWatch } from "../incident-engine.mjs";
import { dispatchNotifications } from "../notify.mjs";

const RETRY_WINDOW_HOURS = 2; // unsent alerts older than this are left alone

export async function handleWatch(request, deps) {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  const auth = await authenticate(request, deps.repo, ["watch"]);
  if (auth.response) return auth.response;
  const nowMs = deps.now().getTime();
  const nowIso = new Date(nowMs).toISOString();
  const rules = normalizeRules(await deps.repo.loadRules());

  const snap = await deps.repo.listWatchSnapshot();
  const r = evaluateWatch(snap, rules, nowMs);
  const events = r.ops.filter((o) => o.op === "open").map((o) => ({
    siteId: o.siteId, deviceId: o.deviceId, source: "watch", kind: o.kind, observedAt: o.openedAt,
    dedupeKey: `watch:${o.ref}:${o.openedAt}`, raw: { areaGroup: o.areaGroup || null },
  }));
  const saved = await deps.repo.save({ siteId: null, events, deviceStates: [], ops: r.ops, boxSeenAt: null });
  const first = await dispatchNotifications({ repo: deps.repo, sms: deps.sms, notifications: r.notifications, created: saved.created, nowIso });

  // Retry: incidents that should have been texted but were not (provider down, or no contacts yet).
  const createdIds = new Set(Object.values(saved.created || {}));
  const pending = (await deps.repo.listUnnotified(new Date(nowMs - RETRY_WINDOW_HOURS * 3600000).toISOString()))
    .filter((i) => !createdIds.has(i.id) && rules[i.kind] && rules[i.kind].sms)
    .map((i) => ({ type: "opened", incidentId: i.id, siteId: i.siteId, deviceId: i.deviceId, kind: i.kind, since: i.openedAt }));
  const retry = await dispatchNotifications({ repo: deps.repo, sms: deps.sms, notifications: pending, created: {}, nowIso });

  return json(200, { ok: true, opened: r.ops.filter((o) => o.op === "open").length,
    expired: r.ops.filter((o) => o.op === "fix").length, sms: first.sent + retry.sent });
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --test tests/monitoring-watch.test.js tests/monitoring-ingest.test.js`
Expected: `ℹ pass 33` and `ℹ fail 0` (9 watch plus 24 ingest).

- [ ] **Step 5: Commit**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/functions/_shared/handlers/watch.mjs sales-app/tests/monitoring-watch.test.js
git commit -m "sales-app: monitoring watcher (silent boxes, area outages, expiry, SMS retry)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 7: Sites read and incident update handlers

The two calls the Operations app will make. Both accept only the API key.

**Files:**
- Modify (replace the stub): `monitoring/supabase/functions/_shared/handlers/sites.mjs`
- Test: `tests/monitoring-sites.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/monitoring-sites.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { makeHarness, cam3 } from "./helpers/harness.mjs";

const body = async (res) => res.json();

async function withOpenIncident() {
  const h = await makeHarness();
  await h.email({});
  return { h, incident: h.incidents()[0] };
}

test("only the api key can read sites", async () => {
  const h = await makeHarness();
  assert.equal((await h.sitesRead(null, { action: "summary" })).status, 401);
  assert.equal((await h.sitesRead(h.keys.box, { action: "summary" })).status, 403);
  assert.equal((await h.sitesRead(h.keys.email, { action: "summary" })).status, 403);
  assert.equal((await h.sitesRead(h.keys.api, { action: "summary" })).status, 200);
});

test("summary lists sites with their devices, open incidents and unreadable emails", async () => {
  const { h } = await withOpenIncident();
  await h.email({ class: "unknown", fault_kind: undefined, subject: "Weekly report" });
  const res = await body(await h.sitesRead(h.keys.api, { action: "summary" }));
  assert.equal(res.sites.length, 1);
  assert.equal(res.sites[0].code, "VS-0001");
  assert.equal(res.sites[0].incidents.length, 1);
  assert.equal(res.unknown.length, 1);
});

test("detail returns one site and 404s for an unknown id", async () => {
  const { h } = await withOpenIncident();
  const ok = await body(await h.sitesRead(h.keys.api, { action: "detail", siteId: h.site.id }));
  assert.equal(ok.site.code, "VS-0001");
  assert.ok(ok.events.length >= 1);
  assert.equal((await h.sitesRead(h.keys.api, { action: "detail", siteId: "nope" })).status, 404);
  assert.equal((await h.sitesRead(h.keys.api, { action: "detail" })).status, 400);
  assert.equal((await h.sitesRead(h.keys.api, { action: "dance" })).status, 400);
});

test("acknowledge moves an open incident to acknowledged and records who", async () => {
  const { h, incident } = await withOpenIncident();
  const res = await body(await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "acknowledge", by: "abraham@verisko.com" }));
  assert.deepEqual({ changed: res.changed, state: res.state }, { changed: true, state: "acknowledged" });
  assert.equal(incident.acknowledgedBy, "abraham@verisko.com");
});

test("acknowledging twice changes nothing the second time", async () => {
  const { h, incident } = await withOpenIncident();
  await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "acknowledge", by: "a@v.com" });
  const again = await body(await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "acknowledge", by: "a@v.com" }));
  assert.equal(again.changed, false);
});

test("fix closes an incident as manual and a later email opens a fresh one", async () => {
  const { h, incident } = await withOpenIncident();
  const res = await body(await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "fix", by: "a@v.com" }));
  assert.equal(res.state, "fixed");
  assert.equal(incident.fixedReason, "manual");
  assert.equal(h.sent.length, 1, "no SMS for a manual fix");
  h.advance(5);
  await h.email({});
  assert.equal(h.incidents().length, 2);
});

test("a repeat email after acknowledge keeps the incident acknowledged and sends no reminder", async () => {
  const { h, incident } = await withOpenIncident();
  await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "acknowledge", by: "a@v.com" });
  h.advance(90);
  await h.email({});
  assert.equal(incident.state, "acknowledged");
  assert.equal(h.sent.length, 1);
});

test("incident updates are validated", async () => {
  const { h, incident } = await withOpenIncident();
  assert.equal((await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "delete", by: "a" })).status, 400);
  assert.equal((await h.incidentUpdate(h.keys.api, { action: "fix", by: "a" })).status, 400);
  assert.equal((await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "fix" })).status, 400);
  assert.equal((await h.incidentUpdate(h.keys.api, { incidentId: "missing", action: "fix", by: "a" })).status, 404);
  assert.equal((await h.incidentUpdate(h.keys.box, { incidentId: incident.id, action: "fix", by: "a" })).status, 403);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/monitoring-sites.test.js`
Expected: FAIL with `Error: not built yet` errors from the stub.

- [ ] **Step 3: Replace the stub with the implementation**

Overwrite `monitoring/supabase/functions/_shared/handlers/sites.mjs`:

```javascript
// The two calls the Operations app makes (through its own Netlify function):
//   POST /sites-read       { action: "summary" } or { action: "detail", siteId }
//   POST /incident-update  { incidentId, action: "acknowledge" | "fix", by }
// Both accept only the app's API key.

import { authenticate } from "../auth.mjs";
import { json } from "../http.mjs";

async function readJson(request) {
  try { return await request.json(); } catch (err) { return null; }
}

export async function handleSitesRead(request, deps) {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  const auth = await authenticate(request, deps.repo, ["api"]);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return json(400, { error: "invalid JSON" });
  if (body.action === "summary") return json(200, { ok: true, ...(await deps.repo.listSummary()) });
  if (body.action === "detail") {
    if (typeof body.siteId !== "string" || !body.siteId) return json(400, { error: "siteId is required" });
    const detail = await deps.repo.getSiteDetail(body.siteId);
    return detail ? json(200, { ok: true, ...detail }) : json(404, { error: "no such site" });
  }
  return json(400, { error: "action must be summary or detail" });
}

export async function handleIncidentUpdate(request, deps) {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  const auth = await authenticate(request, deps.repo, ["api"]);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return json(400, { error: "invalid JSON" });
  if (body.action !== "acknowledge" && body.action !== "fix") return json(400, { error: "action must be acknowledge or fix" });
  if (typeof body.incidentId !== "string" || !body.incidentId) return json(400, { error: "incidentId is required" });
  const by = typeof body.by === "string" ? body.by.trim().slice(0, 200) : "";
  if (!by) return json(400, { error: "by is required" });
  const result = await deps.repo.setIncidentState({ incidentId: body.incidentId, action: body.action, by, nowIso: new Date(deps.now().getTime()).toISOString() });
  if (!result) return json(404, { error: "no such incident" });
  return json(200, { ok: true, changed: result.changed, state: result.state });
}
```

- [ ] **Step 4: Run the whole monitoring suite**

Run: `node --test tests/monitoring-*.test.js`
Expected: `ℹ pass 92` and `ℹ fail 0` (5 rules, 29 engine, 17 support, 24 ingest, 9 watch, 8 sites).

- [ ] **Step 5: Commit**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/functions/_shared/handlers/sites.mjs sales-app/tests/monitoring-sites.test.js
git commit -m "sales-app: monitoring sites read and incident update handlers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 8: Database migration

**Files:**
- Create: `monitoring/supabase/migrations/20261012000000_monitoring_tables.sql`
- Test: `tests/monitoring-migration.test.js`

- [ ] **Step 1: Write the failing test**

It checks that the migration seeds the same alert rules as `rules.mjs`, and that every table has row level security on with no policies.

Create `tests/monitoring-migration.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_RULES } from "../monitoring/supabase/functions/_shared/rules.mjs";

const sql = readFileSync(new URL("../monitoring/supabase/migrations/20261012000000_monitoring_tables.sql", import.meta.url), "utf8");

test("the migration seeds exactly the default alert rules", () => {
  const rows = [...sql.matchAll(/\('(\w+)', (\d+), '(\w+)', (true|false), (\d+|null)\)/g)];
  assert.equal(rows.length, Object.keys(DEFAULT_RULES).length);
  for (const [, kind, wait, severity, sms, expire] of rows) {
    assert.deepEqual(
      { waitMinutes: Number(wait), severity, sms: sms === "true", autoExpireHours: expire === "null" ? null : Number(expire) },
      DEFAULT_RULES[kind], `rule ${kind} differs between the migration and rules.mjs`);
  }
});

test("every table in the migration has row level security switched on", () => {
  const tables = [...sql.matchAll(/^create table (\w+)/gm)].map((m) => m[1]).sort();
  const secured = [...sql.matchAll(/^alter table (\w+) enable row level security;/gm)].map((m) => m[1]).sort();
  assert.ok(tables.length >= 8);
  assert.deepEqual(secured, tables);
  assert.ok(!/create policy/i.test(sql), "no policies: only the service role may touch these tables");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/monitoring-migration.test.js`
Expected: FAIL with `ENOENT` for the `.sql` file.

- [ ] **Step 3: Write the migration**

Create `monitoring/supabase/migrations/20261012000000_monitoring_tables.sql`:

```sql
-- Site health monitoring: tables, indexes, default alert rules, row level security.
-- Applied once through the Supabase connector. All access is through Edge Functions
-- using the service role, so every table has RLS on and no policies.

create sequence if not exists site_code_seq start 1;

create table sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('VS-' || lpad(nextval('site_code_seq')::text, 4, '0')),
  job_ref text,
  client_name text not null,
  area text not null default '',
  care_plan boolean not null default false,
  feeds text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  box_last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  kind text not null check (kind in ('camera', 'recorder', 'box')),
  label text not null,
  label_key text generated always as (lower(label)) stored,
  channel int,
  model text,
  created_at timestamptz not null default now(),
  unique (site_id, kind, label_key)
);

create table access_keys (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('box', 'email', 'api', 'watch')),
  site_id uuid references sites (id) on delete cascade,
  key_hash text not null unique,
  note text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((kind = 'box') = (site_id is not null))
);

create table events (
  id bigint generated always as identity primary key,
  site_id uuid references sites (id) on delete cascade,
  device_id uuid references devices (id) on delete set null,
  source text not null check (source in ('box', 'email', 'watch')),
  kind text not null,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique
);
create index events_site_received on events (site_id, received_at desc);
create index events_unknown on events (received_at desc) where kind = 'unknown';

create table device_state (
  device_id uuid primary key references devices (id) on delete cascade,
  state text not null check (state in ('ok', 'down', 'unknown')),
  since timestamptz not null,
  last_event_at timestamptz not null
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  device_id uuid references devices (id) on delete set null,
  kind text not null,
  state text not null default 'open' check (state in ('open', 'acknowledged', 'fixed')),
  source text not null check (source in ('box', 'email', 'watch')),
  opened_at timestamptz not null,
  last_seen_at timestamptz not null,
  repeat_count int not null default 1,
  notified_at timestamptz,
  area_group text,
  acknowledged_by text,
  acknowledged_at timestamptz,
  fixed_by text,
  fixed_at timestamptz,
  fixed_reason text check (fixed_reason in ('recovered', 'manual', 'expired')),
  created_at timestamptz not null default now()
);
-- At most one live incident per site, device and kind, even if two reports arrive at once.
create unique index incidents_one_active
  on incidents (site_id, (coalesce(device_id, '00000000-0000-0000-0000-000000000000'::uuid)), kind)
  where state <> 'fixed';
create index incidents_active_by_site on incidents (site_id) where state <> 'fixed';

create table alert_rules (
  kind text primary key,
  wait_minutes int not null,
  severity text not null check (severity in ('high', 'medium', 'low')),
  sms boolean not null,
  auto_expire_hours int
);
insert into alert_rules (kind, wait_minutes, severity, sms, auto_expire_hours) values
  ('camera_offline', 5, 'high', true, 24),
  ('recorder_offline', 5, 'high', true, null),
  ('disk_full', 0, 'high', true, null),
  ('disk_error', 0, 'high', true, null),
  ('site_silent', 15, 'high', true, null),
  ('ip_conflict', 0, 'medium', false, null);

create table alert_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Counts a repeated report against one incident without a read-then-write race.
create function monitoring_repeat(p_id uuid, p_seen timestamptz, p_count boolean)
returns void language sql as $$
  update incidents
     set last_seen_at = greatest(last_seen_at, p_seen),
         repeat_count = repeat_count + case when p_count then 1 else 0 end
   where id = p_id and state <> 'fixed';
$$;
revoke all on function monitoring_repeat(uuid, timestamptz, boolean) from public, anon, authenticated;

alter table sites enable row level security;
alter table devices enable row level security;
alter table access_keys enable row level security;
alter table events enable row level security;
alter table device_state enable row level security;
alter table incidents enable row level security;
alter table alert_rules enable row level security;
alter table alert_contacts enable row level security;
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --test tests/monitoring-migration.test.js`
Expected: `ℹ pass 2` and `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/migrations sales-app/tests/monitoring-migration.test.js
git commit -m "sales-app: monitoring database migration (tables, indexes, default rules, RLS)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 9: Real repository, function entry points and scripts

The real database access, the four Edge Function entry points, and the three scripts. The scripts have tests. `repo.mjs` has none of its own: it is proven by the live smoke test in Task 12.

**Files:**
- Create: `monitoring/supabase/functions/_shared/repo.mjs`
- Create: `monitoring/supabase/functions/ingest/index.ts`, `watch/index.ts`, `sites-read/index.ts`, `incident-update/index.ts`
- Create: `monitoring/scripts/make-deploy-payload.mjs`, `make-key.mjs`, `replay-fake-events.mjs`
- Test: `tests/monitoring-scripts.test.js`

- [ ] **Step 1: Write the failing test**

It checks the deploy bundles (every import resolves inside the bundle), the key maker (never prints the raw key, refuses bad input), the replay scenario, and runs that scenario end to end through the real handlers.

Create `tests/monitoring-scripts.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join, normalize } from "node:path";
import { buildPayload, FUNCTION_NAMES } from "../monitoring/scripts/make-deploy-payload.mjs";
import { describeKey } from "../monitoring/scripts/make-key.mjs";
import { buildBoxScenario, buildEmailScenario } from "../monitoring/scripts/replay-fake-events.mjs";
import { DEFAULT_RULES } from "../monitoring/supabase/functions/_shared/rules.mjs";
import { hashKey } from "../monitoring/supabase/functions/_shared/keys.mjs";
import { makeHarness, T0 } from "./helpers/harness.mjs";

// ---------- deploy payloads ----------
test("each function payload has its entry point, shared code, and no ../_shared imports", () => {
  for (const name of FUNCTION_NAMES) {
    const p = buildPayload(name);
    assert.equal(p.entrypoint_path, "index.ts");
    assert.equal(p.verify_jwt, false);
    assert.equal(p.files[0].name, "index.ts");
    assert.ok(!p.files[0].content.includes("../_shared/"));
    assert.ok(p.files[0].content.includes("./_shared/"));
    assert.ok(p.files.some((f) => f.name === "_shared/incident-engine.mjs"));
    assert.ok(!p.files.some((f) => f.name.includes("test")), "no test files are deployed");
  }
});

test("every relative import in every payload points at a file inside that payload", () => {
  for (const name of FUNCTION_NAMES) {
    const p = buildPayload(name);
    const names = new Set(p.files.map((f) => f.name));
    for (const f of p.files) {
      for (const [, spec] of f.content.matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
        const target = normalize(join(dirname(f.name), spec)).split("\\").join("/");
        assert.ok(names.has(target), `${name}: ${f.name} imports ${spec}, which is not in the payload`);
      }
    }
  }
});

test("an unknown function name is refused", () => assert.throws(() => buildPayload("nope")));

// ---------- keys ----------
const UUID = "123e4567-e89b-12d3-a456-426614174000";
test("describeKey prints SQL with the hash and never the raw key", async () => {
  const raw = "vsk_box_secretvalue";
  const q = await describeKey("box", UUID, raw);
  assert.ok(q.includes(await hashKey(raw)));
  assert.ok(!q.includes("secretvalue"));
  assert.ok(q.includes(`'${UUID}'`));
  assert.match(await describeKey("api", null, raw), /values \('api', null, '[0-9a-f]{64}'/);
});
test("describeKey refuses bad combinations and injection", async () => {
  await assert.rejects(() => describeKey("box", null, "k"));
  await assert.rejects(() => describeKey("box", "x'); drop table sites;--", "k"));
  await assert.rejects(() => describeKey("api", UUID, "k"));
  await assert.rejects(() => describeKey("root", null, "k"));
});

// ---------- replay scenario ----------
test("the box replay scenario is ordered, in the past, and long enough to open an incident", () => {
  const now = Date.parse("2026-10-12T10:00:00Z");
  const bodies = buildBoxScenario(now);
  const times = bodies.map((b) => Date.parse(b.observed_at));
  assert.deepEqual([...times].sort((a, b) => a - b), times);
  assert.ok(times.every((t) => t <= now));
  assert.ok(bodies.every((b) => b.replay === true));
  assert.equal(bodies[0].checks[0].ok, true);
  const firstDown = bodies.findIndex((b) => !b.checks[0].ok);
  const lastDown = bodies.map((b) => b.checks[0].ok).lastIndexOf(false);
  assert.ok((times[lastDown] - times[firstDown]) / 60000 >= DEFAULT_RULES.camera_offline.waitMinutes);
  assert.equal(bodies[bodies.length - 1].checks[0].ok, true);
});
test("the email replay scenario targets the given site code", () => {
  const [mail] = buildEmailScenario(Date.parse("2026-10-12T10:00:00Z"), "VS-0042");
  assert.equal(mail.site_code, "VS-0042");
  assert.equal(mail.fault_kind, "disk_full");
});

// ---------- the replay scenario, end to end through the real handlers ----------

test("replaying the smoke-test scenario opens one incident, texts once, then fixes and texts again", async () => {
  const h = await makeHarness();
  for (const body of buildBoxScenario(T0)) assert.equal((await h.ingest(h.keys.box, body)).status, 200);
  assert.equal(h.incidents().length, 1);
  assert.equal(h.incidents()[0].kind, "camera_offline");
  assert.equal(h.incidents()[0].state, "fixed");
  assert.equal(h.incidents()[0].fixedReason, "recovered");
  assert.equal(h.sent.length, 2);
  assert.match(h.sent[0].text, /Camera 7 offline/);
  assert.match(h.sent[1].text, /^FIXED\./);
  for (const body of buildEmailScenario(T0, h.site.code)) assert.equal((await h.ingest(h.keys.email, body)).status, 200);
  assert.equal(h.incidents().length, 2);
  assert.equal(h.incidents()[1].kind, "disk_full");
  assert.equal(h.incidents()[1].state, "open");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/monitoring-scripts.test.js`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `make-deploy-payload.mjs`.

- [ ] **Step 3: Write the three scripts**

Create `monitoring/scripts/make-deploy-payload.mjs`:

```javascript
#!/usr/bin/env node
// Builds the file list for deploying one Edge Function through the Supabase connector.
// The connector wants each function as a self-contained set of files, so the shared code
// in supabase/functions/_shared is copied under the function's own folder and the entry
// point's "../_shared/" imports are rewritten to "./_shared/".
//
// Usage: node monitoring/scripts/make-deploy-payload.mjs ingest > /tmp/deploy-ingest.json

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(here, "..", "supabase", "functions");
export const FUNCTION_NAMES = ["ingest", "watch", "sites-read", "incident-update"];

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

export function buildPayload(name, root = FUNCTIONS) {
  if (!FUNCTION_NAMES.includes(name)) throw new Error(`unknown function ${name}`);
  const entry = readFileSync(join(root, name, "index.ts"), "utf8").replaceAll("../_shared/", "./_shared/");
  const shared = walk(join(root, "_shared")).sort().map((p) => ({
    name: relative(root, p).split("\\").join("/"),
    content: readFileSync(p, "utf8"),
  }));
  return { name, entrypoint_path: "index.ts", verify_jwt: false, files: [{ name: "index.ts", content: entry }, ...shared] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  try { process.stdout.write(JSON.stringify(buildPayload(name), null, 2)); }
  catch (err) { console.error(err.message); console.error(`usage: make-deploy-payload.mjs <${FUNCTION_NAMES.join("|")}>`); process.exit(1); }
}
```

Create `monitoring/scripts/make-key.mjs`:

```javascript
#!/usr/bin/env node
// Creates an access key. The raw key is written to a private file, never printed.
// What is printed is the SQL that stores only the key's hash.
//
//   node monitoring/scripts/make-key.mjs box <site-uuid>
//   node monitoring/scripts/make-key.mjs email
//   node monitoring/scripts/make-key.mjs api
//   node monitoring/scripts/make-key.mjs watch
//   node monitoring/scripts/make-key.mjs vault-sql <path-to-watch-key-file>   (prints the Vault SQL)

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKey, hashKey } from "../supabase/functions/_shared/keys.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["box", "email", "api", "watch"];

export async function describeKey(kind, siteId, rawKey) {
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(", ")}`);
  if (kind === "box" && !UUID.test(siteId || "")) throw new Error("a box key needs the site's uuid");
  if (kind !== "box" && siteId) throw new Error(`a ${kind} key is not tied to a site`);
  const hash = await hashKey(rawKey);
  const site = kind === "box" ? `'${siteId}'` : "null";
  return `insert into access_keys (kind, site_id, key_hash, note) values ('${kind}', ${site}, '${hash}', 'created ${new Date().toISOString().slice(0, 10)}');`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, arg] = process.argv.slice(2);
  try {
    if (kind === "vault-sql") {
      const raw = readFileSync(arg, "utf8").trim();
      console.log(`select vault.create_secret('${raw}', 'monitoring_watch_key');`);
    } else {
      const raw = generateKey(kind);
      const dir = join(homedir(), ".verisko-monitoring");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = join(dir, `${kind}-${Date.now()}.key`);
      writeFileSync(file, raw + "\n", { mode: 0o600 });
      console.error(`raw key saved to ${file} (readable only by you)`);
      console.log(await describeKey(kind, arg, raw));
    }
  } catch (err) { console.error(err.message); process.exit(1); }
}
```

Create `monitoring/scripts/replay-fake-events.mjs`:

```javascript
#!/usr/bin/env node
// Smoke test against a deployed ingest function, using made-up history so it finishes in seconds.
//
//   INGEST_URL=https://<ref>.supabase.co/functions/v1/ingest BOX_KEY=... EMAIL_KEY=... \
//   SITE_CODE=VS-0001 node monitoring/scripts/replay-fake-events.mjs

import { fileURLToPath } from "node:url";

// Twelve minutes of box history, replayed: all ok, then Camera 7 down for seven minutes.
export function buildBoxScenario(nowMs) {
  const at = (minutesAgo) => new Date(nowMs - minutesAgo * 60000).toISOString();
  const report = (minutesAgo, cameraOk) => ({
    type: "box", replay: true, observed_at: at(minutesAgo),
    checks: [{ kind: "camera", label: "Camera 7", ok: cameraOk }, { kind: "recorder", label: "Recorder", ok: true }],
  });
  const bodies = [report(12, true)];
  for (let m = 11; m >= 4; m--) bodies.push(report(m, false)); // down from 11 minutes ago
  bodies.push(report(1, true));                                  // back one minute ago
  return bodies;
}

export function buildEmailScenario(nowMs, siteCode) {
  return [{ type: "email", message_id: `smoke-${nowMs}`, observed_at: new Date(nowMs).toISOString(), class: "fault",
    fault_kind: "disk_full", site_code: siteCode, subject: "SMOKE TEST disk full", excerpt: "smoke test" }];
}

async function post(url, key, body) {
  const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.text() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { INGEST_URL, BOX_KEY, EMAIL_KEY, SITE_CODE } = process.env;
  if (!INGEST_URL || !BOX_KEY || !EMAIL_KEY || !SITE_CODE) { console.error("set INGEST_URL, BOX_KEY, EMAIL_KEY and SITE_CODE"); process.exit(1); }
  const now = Date.now();
  for (const b of buildBoxScenario(now)) console.log("box  ", b.observed_at, b.checks[0].ok ? "ok  " : "down", JSON.stringify(await post(INGEST_URL, BOX_KEY, b)));
  for (const b of buildEmailScenario(now, SITE_CODE)) console.log("email", JSON.stringify(await post(INGEST_URL, EMAIL_KEY, b)));
}
```

- [ ] **Step 4: Write the real repository**

Create `monitoring/supabase/functions/_shared/repo.mjs`:

```javascript
// The real repository: every database read and write the handlers need, on top of a
// supabase-js client created with the service role. It follows the same contract as the
// fake repository in tests/helpers/fake-repo.mjs.
//
// Write order inside save() matters: incidents first, events last. An email is recognised
// as already processed by its event row, so if a write fails midway the retry still
// reaches the incident step.

const NO_DEVICE = null;
const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data; };

const toSite = (r) => r && ({ id: r.id, code: r.code, name: r.client_name, area: r.area, feeds: r.feeds || [], status: r.status, boxLastSeenAt: r.box_last_seen_at });
const toIncident = (r) => ({
  id: r.id, siteId: r.site_id, deviceId: r.device_id, kind: r.kind, state: r.state, source: r.source,
  openedAt: r.opened_at, lastSeenAt: r.last_seen_at, notifiedAt: r.notified_at, repeatCount: r.repeat_count, areaGroup: r.area_group,
});
const SITE_COLS = "id,code,client_name,area,feeds,status,box_last_seen_at";

export function makeRepo(db) {
  return {
    async findKey(hash) {
      const r = must(await db.from("access_keys").select("id,kind,site_id,revoked_at").eq("key_hash", hash).maybeSingle());
      return r ? { id: r.id, kind: r.kind, siteId: r.site_id, revokedAt: r.revoked_at } : null;
    },

    async loadRules() { return must(await db.from("alert_rules").select("*")); },

    async getSite(id) { return toSite(must(await db.from("sites").select(SITE_COLS).eq("id", id).maybeSingle())); },
    async getSiteByCode(code) { return toSite(must(await db.from("sites").select(SITE_COLS).eq("code", code).maybeSingle())); },

    async loadSiteState(siteId) {
      const devices = must(await db.from("devices").select("id").eq("site_id", siteId));
      const ids = devices.map((d) => d.id);
      const states = ids.length ? must(await db.from("device_state").select("device_id,state,since,last_event_at").in("device_id", ids)) : [];
      const incidents = must(await db.from("incidents").select("*").eq("site_id", siteId).neq("state", "fixed"));
      const deviceStates = {};
      for (const s of states) deviceStates[s.device_id] = { state: s.state, since: s.since, lastEventAt: s.last_event_at };
      return { siteId, deviceStates, incidents: incidents.map(toIncident) };
    },

    async ensureDevice({ siteId, kind, label, channel = null }) {
      const find = async () => must(await db.from("devices").select("id,kind,label").eq("site_id", siteId).eq("kind", kind).eq("label_key", label.toLowerCase()).maybeSingle());
      let d = await find();
      if (d) return d;
      const ins = await db.from("devices").insert({ site_id: siteId, kind, label, channel }).select("id,kind,label").single();
      if (ins.error) {
        if (ins.error.code === "23505") { d = await find(); if (d) return d; } // another request created it first
        throw new Error(ins.error.message);
      }
      return ins.data;
    },

    async hasEvent(dedupeKey) {
      const res = await db.from("events").select("id", { count: "exact", head: true }).eq("dedupe_key", dedupeKey);
      if (res.error) throw new Error(res.error.message);
      return (res.count || 0) > 0;
    },

    async save({ siteId, events, deviceStates, ops, boxSeenAt }) {
      const created = {};
      for (const o of ops || []) {
        if (o.op === "open") {
          const ins = await db.from("incidents").insert({
            site_id: o.siteId, device_id: o.deviceId || NO_DEVICE, kind: o.kind, source: o.source,
            opened_at: o.openedAt, last_seen_at: o.lastSeenAt, area_group: o.areaGroup || null,
          }).select("id").single();
          if (!ins.error) { created[o.ref] = ins.data.id; continue; }
          if (ins.error.code !== "23505") throw new Error(ins.error.message);
          // A live incident already exists for this site, device and kind: use it.
          let q = db.from("incidents").select("id").eq("site_id", o.siteId).eq("kind", o.kind).neq("state", "fixed");
          q = o.deviceId ? q.eq("device_id", o.deviceId) : q.is("device_id", null);
          const existing = must(await q.maybeSingle());
          if (existing) created[o.ref] = existing.id;
        } else if (o.op === "repeat") {
          must(await db.rpc("monitoring_repeat", { p_id: o.incidentId, p_seen: o.lastSeenAt, p_count: !!o.count }));
        } else if (o.op === "fix") {
          must(await db.from("incidents").update({ state: "fixed", fixed_at: o.fixedAt, fixed_reason: o.reason }).eq("id", o.incidentId).neq("state", "fixed"));
        } else if (o.op === "group") {
          must(await db.from("incidents").update({ area_group: o.areaGroup }).eq("id", o.incidentId));
        }
      }
      if (deviceStates && deviceStates.length) {
        must(await db.from("device_state").upsert(
          deviceStates.map((s) => ({ device_id: s.deviceId, state: s.state, since: s.since, last_event_at: s.lastEventAt })),
          { onConflict: "device_id" }));
      }
      if (events && events.length) {
        must(await db.from("events").upsert(
          events.map((e) => ({ site_id: e.siteId, device_id: e.deviceId || null, source: e.source, kind: e.kind, observed_at: e.observedAt, raw: e.raw || {}, dedupe_key: e.dedupeKey })),
          { onConflict: "dedupe_key", ignoreDuplicates: true }));
      }
      if (boxSeenAt && siteId) must(await db.from("sites").update({ box_last_seen_at: boxSeenAt }).eq("id", siteId));
      return { created };
    },

    async markNotified(ids, nowIso) {
      if (ids.length) must(await db.from("incidents").update({ notified_at: nowIso }).in("id", ids));
    },

    async listContacts() { return must(await db.from("alert_contacts").select("name,phone").eq("active", true)); },

    async describe({ siteIds, deviceIds }) {
      const sites = {}, devices = {};
      if (siteIds.length) for (const s of must(await db.from("sites").select("id,code,client_name,area").in("id", siteIds))) sites[s.id] = { code: s.code, name: s.client_name, area: s.area };
      if (deviceIds.length) for (const d of must(await db.from("devices").select("id,label").in("id", deviceIds))) devices[d.id] = { label: d.label };
      return { sites, devices };
    },

    async listWatchSnapshot() {
      const sites = must(await db.from("sites").select(SITE_COLS)).map(toSite);
      const boxes = must(await db.from("devices").select("id,site_id").eq("kind", "box"));
      const boxBySite = Object.fromEntries(boxes.map((b) => [b.site_id, b.id]));
      const incidents = must(await db.from("incidents").select("*").neq("state", "fixed")).map((r) => ({ ...toIncident(r) }));
      return { sites: sites.map((s) => ({ ...s, boxDeviceId: boxBySite[s.id] || null })), incidents };
    },

    async listUnnotified(sinceIso) {
      return must(await db.from("incidents").select("*").eq("state", "open").is("notified_at", null).gte("created_at", sinceIso)).map(toIncident);
    },

    async listSummary() {
      const sites = must(await db.from("sites").select(SITE_COLS + ",care_plan,job_ref").order("code"));
      const devices = must(await db.from("devices").select("id,site_id,kind,label,channel"));
      const states = must(await db.from("device_state").select("device_id,state,since,last_event_at"));
      const incidents = must(await db.from("incidents").select("*").neq("state", "fixed"));
      const unknown = must(await db.from("events").select("id,site_id,observed_at,received_at,raw").eq("kind", "unknown").order("received_at", { ascending: false }).limit(20));
      const stateBy = Object.fromEntries(states.map((s) => [s.device_id, s]));
      return {
        sites: sites.map((s) => ({
          ...toSite(s), carePlan: s.care_plan, jobRef: s.job_ref,
          devices: devices.filter((d) => d.site_id === s.id).map((d) => ({ id: d.id, kind: d.kind, label: d.label, channel: d.channel,
            state: (stateBy[d.id] || {}).state || "unknown", since: (stateBy[d.id] || {}).since || null })),
          incidents: incidents.filter((i) => i.site_id === s.id).map(toIncident),
        })),
        unknown,
      };
    },

    async getSiteDetail(siteId) {
      const site = must(await db.from("sites").select(SITE_COLS + ",care_plan,job_ref").eq("id", siteId).maybeSingle());
      if (!site) return null;
      const devices = must(await db.from("devices").select("id,kind,label,channel").eq("site_id", siteId));
      const ids = devices.map((d) => d.id);
      const states = ids.length ? must(await db.from("device_state").select("device_id,state,since,last_event_at").in("device_id", ids)) : [];
      const stateBy = Object.fromEntries(states.map((s) => [s.device_id, s]));
      const incidents = must(await db.from("incidents").select("*").eq("site_id", siteId).order("opened_at", { ascending: false }).limit(50));
      const events = must(await db.from("events").select("id,device_id,source,kind,observed_at,received_at").eq("site_id", siteId).order("received_at", { ascending: false }).limit(50));
      return {
        site: { ...toSite(site), carePlan: site.care_plan, jobRef: site.job_ref },
        devices: devices.map((d) => ({ ...d, state: (stateBy[d.id] || {}).state || "unknown", since: (stateBy[d.id] || {}).since || null })),
        incidents: incidents.map(toIncident), events,
      };
    },

    async setIncidentState({ incidentId, action, by, nowIso }) {
      const current = must(await db.from("incidents").select("id,state").eq("id", incidentId).maybeSingle());
      if (!current) return null;
      const patch = action === "acknowledge"
        ? { state: "acknowledged", acknowledged_by: by, acknowledged_at: nowIso }
        : { state: "fixed", fixed_by: by, fixed_at: nowIso, fixed_reason: "manual" };
      let q = db.from("incidents").update(patch).eq("id", incidentId);
      q = action === "acknowledge" ? q.eq("state", "open") : q.neq("state", "fixed");
      const changed = must(await q.select("id,state"));
      if (changed.length) return { changed: true, state: changed[0].state };
      return { changed: false, state: current.state };
    },
  };
}
```

- [ ] **Step 5: Write the four Edge Function entry points**

Create `monitoring/supabase/functions/ingest/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleIngest } from "../_shared/handlers/ingest.mjs";
import { makeRepo } from "../_shared/repo.mjs";
import { consoleSms } from "../_shared/sms.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const deps = { repo: makeRepo(db), sms: consoleSms(), now: () => new Date() };
Deno.serve((req: Request) => handleIngest(req, deps));
```

Create `monitoring/supabase/functions/watch/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleWatch } from "../_shared/handlers/watch.mjs";
import { makeRepo } from "../_shared/repo.mjs";
import { consoleSms } from "../_shared/sms.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const deps = { repo: makeRepo(db), sms: consoleSms(), now: () => new Date() };
Deno.serve((req: Request) => handleWatch(req, deps));
```

Create `monitoring/supabase/functions/sites-read/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleSitesRead } from "../_shared/handlers/sites.mjs";
import { makeRepo } from "../_shared/repo.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const deps = { repo: makeRepo(db), now: () => new Date() };
Deno.serve((req: Request) => handleSitesRead(req, deps));
```

Create `monitoring/supabase/functions/incident-update/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleIncidentUpdate } from "../_shared/handlers/sites.mjs";
import { makeRepo } from "../_shared/repo.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const deps = { repo: makeRepo(db), now: () => new Date() };
Deno.serve((req: Request) => handleIncidentUpdate(req, deps));
```

- [ ] **Step 6: Run the tests and a syntax check**

Run:

```bash
node --check monitoring/supabase/functions/_shared/repo.mjs && echo "repo syntax ok"
node --test tests/monitoring-*.test.js
```

Expected: `repo syntax ok`, then `ℹ tests 102`, `ℹ pass 102`, `ℹ fail 0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring sales-app/tests/monitoring-scripts.test.js
git commit -m "sales-app: monitoring real repository, Edge Function entry points and deploy scripts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

### Task 10: Apply the migration, create keys, deploy the functions

These steps use the Supabase connector tools, not shell commands. Supabase project: `cepernltrzrmupgegcib`.

- [ ] **Step 1: Apply the migration**

Call `apply_migration` with `project_id` `cepernltrzrmupgegcib`, `name` `monitoring_tables`, and `query` set to the full contents of `monitoring/supabase/migrations/20261012000000_monitoring_tables.sql`.
Expected: success, no error.

- [ ] **Step 2: Verify the tables and the seeded rules**

Call `list_tables` with `project_id` `cepernltrzrmupgegcib`, `schemas` `["public"]`, `verbose` false.
Expected: exactly these eight tables: `access_keys`, `alert_contacts`, `alert_rules`, `device_state`, `devices`, `events`, `incidents`, `sites`.

Call `execute_sql` with `select kind, wait_minutes, sms, auto_expire_hours from alert_rules order by kind;`
Expected: six rows: `camera_offline 5 true 24`, `disk_error 0 true null`, `disk_full 0 true null`, `ip_conflict 0 false null`, `recorder_offline 5 true null`, `site_silent 15 true null`.

- [ ] **Step 3: Check the security advisor**

Call `get_advisors` with `project_id` `cepernltrzrmupgegcib` and type `security`.
Expected: no `rls_disabled_in_public` finding. Notices that RLS is enabled with no policies are expected and intended, because only the Edge Functions use these tables.

- [ ] **Step 4: Create the api, watch and email keys**

```bash
cd /Users/ben/Verisko
node sales-app/monitoring/scripts/make-key.mjs api
node sales-app/monitoring/scripts/make-key.mjs watch
node sales-app/monitoring/scripts/make-key.mjs email
```

Each command prints `raw key saved to /Users/ben/.verisko-monitoring/<kind>-<number>.key (readable only by you)` on the error stream and one `insert into access_keys ...` statement on the output. Run each printed statement with `execute_sql`. Do not copy any raw key anywhere.

Then call `execute_sql` with `select kind, site_id is null as no_site, revoked_at from access_keys order by kind;`
Expected: three rows: `api true null`, `email true null`, `watch true null`.

- [ ] **Step 5: Deploy the four functions**

For each name in `ingest`, `watch`, `sites-read`, `incident-update`:

```bash
cd /Users/ben/Verisko/sales-app
node monitoring/scripts/make-deploy-payload.mjs ingest > /tmp/deploy-ingest.json
```

Read the JSON file, then call `deploy_edge_function` with `project_id` `cepernltrzrmupgegcib` and the file's `name`, `entrypoint_path`, `verify_jwt` (false: these functions check their own keys) and `files` array, exactly as printed. Repeat with the other three names.
Expected: each call succeeds. `list_edge_functions` then shows all four, status `ACTIVE`.

- [ ] **Step 6: Check each function rejects a call with no key**

```bash
for f in ingest watch sites-read incident-update; do
  printf "%s: " $f
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://cepernltrzrmupgegcib.supabase.co/functions/v1/$f"
done
```

Expected: `401` for all four.

If any returns 500, call `query_logs` for the edge function service and read the error. The usual cause is a missing file in the deploy bundle or a typo in a table or column name in `repo.mjs`. Fix it in the repo, rerun Task 9 tests, redeploy that function.

---

### Task 11: Schedule the watcher and the cleanup

The watcher runs every minute from the database. It calls the `watch` function with the watch key, which is kept in Supabase Vault so it never sits in plain text in a scheduled job.

- [ ] **Step 1: Enable the scheduling extensions**

Call `execute_sql` with:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Expected: success. If either errors, enable `pg_cron` and `pg_net` in the Supabase dashboard under Database, Extensions, then continue.

- [ ] **Step 2: Store the watch key in Vault**

The command below prints one `select vault.create_secret(...)` line. It is the only place a raw key is printed, and it is meant to be run straight away through the connector and not saved or repeated.

```bash
cd /Users/ben/Verisko
node sales-app/monitoring/scripts/make-key.mjs vault-sql ~/.verisko-monitoring/watch-<number>.key
```

Run the printed statement with `execute_sql`. Expected: success, returns one uuid.

- [ ] **Step 3: Create the two scheduled jobs**

Call `execute_sql` with:

```sql
select cron.schedule('monitoring-watch', '* * * * *', $$
  select net.http_post(
    url := 'https://cepernltrzrmupgegcib.supabase.co/functions/v1/watch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'monitoring_watch_key')
    ),
    body := '{}'::jsonb
  );
$$);

select cron.schedule('monitoring-clean', '17 3 * * *', $$
  delete from public.events where received_at < now() - interval '90 days';
$$);
```

Expected: success, two job numbers.

- [ ] **Step 4: Confirm the watcher is being called and answers 200**

Wait two minutes, then call `execute_sql` with:

```sql
select status_code, created from net._http_response order by created desc limit 3;
```

Expected: rows with `status_code` 200, about one minute apart.

Call `execute_sql` with `select jobname, schedule from cron.job order by jobname;`
Expected: `monitoring-clean 17 3 * * *` and `monitoring-watch * * * * *`.

---

### Task 12: Live smoke test

Proves the real database code (`repo.mjs`) works, end to end, with a made-up site. The SMS goes to the console sender, so success is read from the database, not from a phone.

- [ ] **Step 1: Create the test site, its box key, and a test contact**

Call `execute_sql` with:

```sql
insert into sites (client_name, area, feeds) values ('SMOKE TEST', 'Testville', '{box,email}') returning id, code;
insert into alert_contacts (name, phone) values ('Smoke test', '+256000000000');
```

Note the returned `id` and `code` (for example `VS-0001`). Then:

```bash
cd /Users/ben/Verisko
node sales-app/monitoring/scripts/make-key.mjs box <the-site-id>
```

Run the printed statement with `execute_sql`.

- [ ] **Step 2: Run the replay**

```bash
cd /Users/ben/Verisko
ls ~/.verisko-monitoring/
export INGEST_URL=https://cepernltrzrmupgegcib.supabase.co/functions/v1/ingest
export SITE_CODE=<the-site-code>
export BOX_KEY=$(cat ~/.verisko-monitoring/box-<number>.key)
export EMAIL_KEY=$(cat ~/.verisko-monitoring/email-<number>.key)
node sales-app/monitoring/scripts/replay-fake-events.mjs
```

Expected: ten `box` lines and one `email` line, every status `200`. The seventh box line (the sixth consecutive down report) contains `"opened":1` and `"sms":1`. The tenth box line contains `"fixed":1` and `"sms":1`. The email line contains `"opened":1` and `"sms":1`.

- [ ] **Step 3: Check the database matches**

Call `execute_sql` with, using the real site id:

```sql
select kind, state, source, fixed_reason, notified_at is not null as notified
from incidents where site_id = '<the-site-id>' order by opened_at;
```

Expected two rows: `camera_offline | fixed | box | recovered | true` and `disk_full | open | email | null | true`.

```sql
select source || ':' || kind as event from events where site_id = '<the-site-id>' order by observed_at, id;
```

Expected five rows: `box:camera_online`, `box:recorder_online`, `box:camera_offline`, `box:camera_online`, `email:disk_full`.

- [ ] **Step 4: Check retries and wrong keys are handled**

Run the same replay again straight away, within one minute of the first run. Expected: every box line and the email line read `{"ok":true,"opened":0,"fixed":0,"sms":0}`. The repeated box reports are older than the camera's current state, so they are dropped, and the second email only counts as a repeat of the disk fault.

Call `execute_sql` with:

```sql
select kind, state, repeat_count from incidents where site_id = '<the-site-id>' order by opened_at;
```

Expected two rows: `camera_offline | fixed | 1` and `disk_full | open | 2`.

Now check a wrong key is refused:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$INGEST_URL" -H "authorization: Bearer vsk_box_wrong" -H "content-type: application/json" -d '{}'
```

Expected: `401`.

- [ ] **Step 5: Check the watcher raises and clears a silent site**

Call `execute_sql` with `update sites set box_last_seen_at = now() - interval '30 minutes' where code = '<the-site-code>';`

Wait two minutes, then call `execute_sql` with `select kind, state, source, notified_at is not null as notified from incidents where site_id = '<the-site-id>' and kind = 'site_silent';`
Expected: one row: `site_silent | open | watch | true`.

Now send one live box report, which should clear it:

```bash
curl -s -X POST "$INGEST_URL" -H "authorization: Bearer $BOX_KEY" -H "content-type: application/json" -d '{"type":"box","checks":[{"kind":"recorder","label":"Recorder","ok":true}]}'
```

Expected: `{"ok":true,"opened":0,"fixed":1,"sms":1}`.

- [ ] **Step 6: Clean up the test data**

Call `execute_sql` with:

```sql
delete from sites where client_name = 'SMOKE TEST';
delete from alert_contacts where name = 'Smoke test';
```

Then `select count(*) from incidents;`
Expected: `0`. The deletes cascade to the site's devices, events, incidents and its box key. The api, watch and email keys stay: they are the real keys.

---

### Task 13: Documentation and spec update

**Files:**
- Create: `monitoring/README.md`
- Modify: `docs/specs/2026-10-11-site-health-monitoring-design.md`

- [ ] **Step 1: Write the monitoring README**

Create `monitoring/README.md`:

````markdown
# Site health monitoring

Watches the CCTV systems Verisko installs and texts Operations when one stops working.
Design: `docs/specs/2026-10-11-site-health-monitoring-design.md`.

## What is here

| Path | What it is |
|---|---|
| `supabase/migrations/` | The database tables, applied once through the Supabase connector. |
| `supabase/functions/_shared/` | All the logic: rules, incident engine, handlers, database access. Plain JavaScript, no build step. |
| `supabase/functions/<name>/index.ts` | Thin entry points for the four Edge Functions: `ingest`, `watch`, `sites-read`, `incident-update`. |
| `scripts/make-deploy-payload.mjs` | Builds the file list to deploy one function through the Supabase connector. |
| `scripts/make-key.mjs` | Creates an access key. Raw key goes to a private file, only its hash goes in the database. |
| `scripts/replay-fake-events.mjs` | Smoke test against the deployed `ingest` function. |

## Run the tests

```bash
cd sales-app && node --test tests/monitoring-*.test.js
```

The handler tests run against an in-memory fake of the database (`tests/helpers/fake-repo.mjs`).
The real database code is `_shared/repo.mjs`. It is checked by the live smoke test, not by unit tests.

## Keys

Four kinds of key, all stored only as SHA-256 hashes in `access_keys`:

| Kind | Used by | Tied to a site |
|---|---|---|
| `box` | The box agent at one customer site | Yes |
| `email` | The Google Apps Script that reads recorder emails | No |
| `api` | The Operations app's Netlify function | No |
| `watch` | The one-minute database scheduler | No |

Raw keys live in `~/.verisko-monitoring/` on the machine that made them. Never commit one.
To revoke a key, set its `revoked_at` in `access_keys`.

## Deploy

1. Apply `supabase/migrations/*.sql` with the Supabase connector.
2. For each function: `node monitoring/scripts/make-deploy-payload.mjs <name>`, then deploy the printed file list with `verify_jwt` false.
3. Schedule the watcher and cleanup (see the foundation plan, Task 11).

## Known limits

- SMS goes to the console sender until a provider is chosen. Alerts are recorded, but no text is sent.
- Email-only sites cannot raise "site silent", because a recorder that is off sends nothing.
- Devices appear on a box's first report. A mistyped label in the box's config creates a new device.
````

- [ ] **Step 2: Record what changed while planning in the spec**

```bash
cd /Users/ben/Verisko/sales-app
python3 - <<'PYEOF'
p = "docs/specs/2026-10-11-site-health-monitoring-design.md"
s = open(p).read()
old = "`monitoring/engine/`, `monitoring/supabase/` (migrations and functions)"
assert old in s, "section 4 wording not found"
s = s.replace(old, "`monitoring/supabase/` (migrations, functions and the shared engine)")
s += """
## 12. Changes made while planning (11 October 2026)

These refine sections 4 to 6. Where this section disagrees with an earlier one, this section wins.

- Shared code, including the engine, lives in `monitoring/supabase/functions/_shared/`, because each Supabase function is bundled from its own folder.
- Access keys have four kinds: box, email, api and watch. The API key and watch key are ordinary hashed rows in `access_keys`, so nothing is set in the Supabase dashboard. The one Netlify setting holds the raw API key. The raw watch key is kept in Supabase Vault for the scheduler.
- New columns: `sites.box_last_seen_at`, `devices.label_key` (case-insensitive label) and `incidents.created_at`. A partial unique index allows one live incident per site, device and kind.
- Devices are created automatically when a box or an email first mentions them. A mistyped label creates a new device.
- Box reports become events only when a device changes state. An all-ok report only updates the last-seen time. A report older than a device's current state is dropped, not stored.
- A paused site keeps its history and device state but raises no incidents and sends no SMS.
- A manual Fixed tap sends no SMS. Automatic recoveries do.
- If an SMS fails, or no contact exists yet, the incident stays unnotified and the watcher retries for two hours.
- The foundation ships a console SMS sender. Real texts arrive at build step 4.
"""
open(p, "w").write(s)
print("spec updated")
PYEOF
```

Expected output: `spec updated`.

- [ ] **Step 3: Run the whole app test suite**

Run: `npm test`
Expected: every test passes, including the 102 monitoring tests, and none fail.

- [ ] **Step 4: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/README.md sales-app/docs/specs/2026-10-11-site-health-monitoring-design.md
git commit -m "sales-app: monitoring README and spec update

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 5: Confirm the live site hides the monitoring folder**

Wait about a minute for Netlify to deploy, then run:

```bash
curl -s -o /dev/null -w "%{content_type}\n" https://verisko-sales-2026.netlify.app/monitoring/README.md
curl -s -o /dev/null -w "%{content_type}\n" https://verisko-sales-2026.netlify.app/monitoring/supabase/migrations/20261012000000_monitoring_tables.sql
curl -s -o /dev/null -w "%{http_code}\n" https://verisko-sales-2026.netlify.app/api/data
```

Expected: the first two print `text/html; charset=UTF-8` (the app shell, not the file), and the third prints `401`. If either of the first two prints `text/markdown` or `application/sql`, the Task 0 rule is not working: wait another minute, then check `_redirects` is deployed before assuming it failed.

---

## Self-review against the spec

| Spec section | Where it is built |
|---|---|
| 4: incident engine, ingest, watch, sites-read, incident-update | Tasks 2, 5, 6, 7, 9 |
| 4: SMS sender behind an interface | Tasks 3, 5 (console sender now, provider at step 4) |
| 5: data model and indexes, RLS, no public policies | Task 8 |
| 5: API key and access-key hashing | Tasks 3, 9, 10 |
| 6: every rule, repeat handling, reminders, area outage, expiry, out-of-order and clock rules | Tasks 2, 5, 6 with tests |
| 9: keys per site, hashed, revocable; status only; no inbound ports on the box | Tasks 3, 8, 10 |
| 9: privacy of the monitoring files on the public site (added) | Tasks 0, 13 |
| 10: step 1 verification (unit tests, replayed fake events, no hardware) | Tasks 1 to 9 and 12 |

**Not in this plan, by design** (each needs a fact we do not have yet, so each gets its own plan):

| Next plan | Spec step | Waits for |
|---|---|---|
| Email reader script | 2 | Real alert emails from Ronnie's recorder test, to write the patterns, and to learn whether recovery emails exist |
| Sites screen, `/api/sites`, Add site form, the one Netlify setting | 3 | Nothing. Can start as soon as this plan is deployed. |
| Real SMS provider and Operations contacts | 4 | The provider choice and its price |
| Box agent and the silent-site pilot | 5 | The bench test of box hardware and a wiring photo of one finished install |
