# Site Health Monitoring: Sites Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Operations and the Owner a Sites screen in the sales app: one list that shows which customer sites are healthy, a sheet for each site with its devices and problems, Acknowledge and Fixed buttons, and forms to add a site, edit it, pause it, and issue its box key.

**Architecture:** The screen is vanilla JavaScript in two small files, loaded before `app.js`. `site-health.js` is pure (status, ordering, wording, HTML strings) and is tested in Node. `sites-screen.js` does the network and the page and is tested with a fake page. The browser calls one Netlify function, `/api/sites`, which checks the signed-in role (Operations or Owner only) and forwards the call to the Supabase monitoring functions with the one Netlify setting `MONITOR_API_KEY`. A fifth Edge Function, `site-admin`, creates and edits sites and issues box keys. Before any of that, the two review follow-ups the spec ties to this step are fixed: reads page past the 1,000-row database limit, and the real and fake repositories build their answers with the same functions so their shapes cannot drift.

**Tech Stack:** Node 24 ES modules and `node:test`, no new dependencies. Supabase Edge Functions (Deno) importing the same `.mjs` files. Netlify Functions and Blobs for the gateway. Plain browser JavaScript with no build step, in the existing `app.js` style.

**Spec:** `sales-app/docs/specs/2026-10-11-site-health-monitoring-design.md`, sections 5, 8 and 10 (build step 3), and the "before the Sites screen" item in section 13. Foundation plan: `sales-app/docs/plans/2026-10-11-site-health-monitoring-foundation.md` (already deployed).

**Ground rules**

- Work from `/Users/ben/Verisko/sales-app` unless a step says otherwise. Run one file with `node --test tests/<name>.test.js` and everything with `npm test`.
- Baseline before Task 1: `npm test` passes **218** tests. Each task says the total it should reach.
- Standing project rule: commit means commit **and** `git push origin main`. Every task ends that way. Stage only the files the task names, because the repo has many unrelated untracked files and an unrelated edit to `.gitignore`.
- Every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Never paste a raw access key into chat, a commit, a log, or a file inside the repo. The raw API key lives only in `~/.verisko-monitoring/api-*.key`. Commands in this plan read it into a shell variable and never print it.
- Alerts and contacts are unchanged: texts still go to Operations only. The screen never shows phone numbers.
- Change `?v=` once, in Task 8, to 74, on every asset reference in `index.html`. The service worker needs no change, because it reads the file list from `index.html`.

## Screens

Everything below is the layout the code in Tasks 6 to 8 produces. Colours follow the app's existing chips: red, amber, green, grey. Status is never shown by colour alone: each chip also has a symbol and words.

**The list** (More menu on a phone, sidebar item on a computer; Operations and Owner only). Worst sites first, then by site code.

```
Site monitoring
Sites                                              [ + Add site ]
Which customer sites are healthy right now. Red ones need a call.

┌────────┬────────┬────────┬──────────────┐
│   2    │   1    │   14   │      3       │
│ Need   │ Being  │ All    │ Waiting or   │
│attention│handled│ good   │ paused       │
└────────┴────────┴────────┴──────────────┘
[ Search sites                                   ]

┃ Mukasa Pharmacy                  [! Needs attention]
┃ VS-0001
┃ Area         Ntinda
┃ Reports by   Site box and Recorder email
┃ Box          reported 2 min ago
┃ Problem      Camera 3 offline since 2 h ago
┃ Kato Supermarket                 [◔ Someone is on it]
┃ ...
  Wandegeya Salon                  [✓ All good]
  Old Kampala Shop                 [◷ Waiting for first report]
  Bugolobi Clinic                  [⏸ Paused]

Reports we could not read   (only when there are some)
  12 Oct 08:05   VS-0001 · Weekly report

Updated 1 min ago · Refresh
```

It refreshes by itself every 60 seconds while it is open and the page is visible. If the network or the monitoring service fails, the last list stays on screen under a plain message with a Try again button. The last list is also saved in the browser, so the screen opens instantly next time.

**A site** (tap a card). A sheet, wide on a computer, full width on a phone.

```
Mukasa Pharmacy
VS-0001 · Ntinda   [! Needs attention]

Box key       issued 10 Oct, 11:00
Job           J-2026-0007
Care plan     Yes

Devices
  Recorder        [✓ OK]    1 h ago
  Camera 3        [! Down]  2 h ago

Problems
  Camera 3 offline                         [! Open]
    Since    12 Oct, 12:00
    Status   Not yet acknowledged
    [ I am on it ]  [ Mark fixed ]

Recent reports
  12 Oct, 13:58   box · camera

[ Close ] [ Edit ] [ Replace box key ] [ Pause ]
```

**Add or edit a site.** Client name, area, how it reports (site box, recorder email, or both), care plan, and a linked job chosen from the app's own jobs. The server generates the site code (VS-0001, VS-0002 and on). New sites always start active.

**Box key.** Shown once, with a Copy button and a warning that older keys stop working. It is not stored in the browser or anywhere else.

## Decisions made while planning

These came from reading the code and the spec. Say so before Task 1 if any is wrong.

| Decision | Why |
|---|---|
| One new Edge Function, `site-admin`, for create, edit and box keys. | `sites-read` and `incident-update` stay read-and-acknowledge only, so a bug in the admin code cannot touch them. |
| The browser never holds the monitoring key. `/api/sites` forwards with `MONITOR_API_KEY`. | This is the one Netlify setting the spec allows. Its blast radius is limited to what the api key can do: read sites, acknowledge, fix, edit sites, issue box keys. It cannot post box or email reports, run the watcher, or use the watch key. |
| Only Operations and the Owner can use `/api/sites`. Sales and Team lead get 403. | Spec section 8 and the step 3 test. The nav item is also hidden and `render()` redirects anyone else to Today. |
| Acknowledge and Fixed record the signed-in person's email, taken on the server, never from the browser. | A person cannot claim to be someone else. |
| Box keys are issued from the screen and replace the old key. Replacing asks first. | Matches the spec ("generates its key") and gives a safe way to rotate a lost key. |
| No notification badge on the nav item, and no screen for alert contacts. | Not in spec section 8. Contacts stay in SQL until the SMS plan. |
| Statuses: red when any problem is open and unclaimed, amber when every problem is acknowledged, grey "waiting" for a box site that never reported, green otherwise, grey for paused and closed. | Red means someone must act. Amber means someone already is. |

## File structure

| File | Change | Responsibility |
|---|---|---|
| `monitoring/supabase/functions/_shared/summary.mjs` | create | Builds the summary and site-detail answers. Both repositories use it. |
| `monitoring/supabase/functions/_shared/paging.mjs` | create | `fetchAll` pages past 1,000 rows. `dbError` keeps code and details. |
| `monitoring/supabase/functions/_shared/repo.mjs` | replace | Real database access: paging, shared shapes, `createSite`, `updateSite`, `replaceBoxKey`. |
| `monitoring/supabase/functions/_shared/validate.mjs` | replace | Adds `validateSiteFields`. |
| `monitoring/supabase/functions/_shared/http.mjs` | replace | `json()` accepts extra headers. |
| `monitoring/supabase/functions/_shared/handlers/site-admin.mjs` | create | create_site, update_site, issue_box_key. |
| `monitoring/supabase/functions/site-admin/index.ts` | create | Edge Function entry point. |
| `monitoring/scripts/make-deploy-payload.mjs` | modify | Knows the fifth function. |
| `netlify/functions/sites.mjs` | create | The `/api/sites` gateway. |
| `_redirects` | modify | Routes `/api/sites`. |
| `site-health.js` | create | Status, ordering, wording and HTML. Pure. |
| `sites-screen.js` | create | Network and page behaviour. |
| `app.js`, `index.html`, `app.css` | modify | Wire it in, bump `?v=74`. |
| `tests/helpers/fake-repo.mjs`, `harness.mjs`, `stub-db.mjs` | replace, replace, create | Fake database now uses the shared shapes. `stub-db` stands in for supabase-js to test the real repository. |
| `tests/monitoring-summary.test.js`, `-paging`, `-repo`, `-site-admin` | create, create, replace, create | Backend tests. |
| `tests/sites-gateway.test.js`, `site-health.test.js`, `sites-screen.test.js`, `sites-wiring.test.js` | create | Screen tests. |
| `monitoring/README.md`, spec section 14 | modify | Documentation. |

---

### Task 1: Shared answer shapes and paging

Both repositories must return identical answers, and reads must not stop at 1,000 rows. This task adds the two small pure modules everything else builds on.

**Files:**
- Create: `monitoring/supabase/functions/_shared/summary.mjs`
- Create: `monitoring/supabase/functions/_shared/paging.mjs`
- Create: `tests/helpers/stub-db.mjs`
- Create: `tests/monitoring-summary.test.js`
- Create: `tests/monitoring-paging.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/monitoring-summary.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { buildSummary, buildSiteDetail, shapeIncident, shapeSite, shapeDevice, shapeUnknown } from "../monitoring/supabase/functions/_shared/summary.mjs";

const site = (id, code, extra = {}) => ({ id, code, name: `Client ${code}`, area: "Ntinda", feeds: ["box"], status: "active", boxLastSeenAt: null, carePlan: false, jobRef: null, ...extra });
const dev = (id, siteId, kind, label) => ({ id, siteId, kind, label, channel: null });
const inc = (id, siteId, openedAt, extra = {}) => ({ id, siteId, deviceId: null, kind: "disk_full", state: "open", source: "email", openedAt, lastSeenAt: openedAt, ...extra });

test("every shape has a fixed set of keys, filled with null when missing", () => {
  assert.deepEqual(Object.keys(shapeSite({ id: "s", code: "VS-0001", name: "n", feeds: [], status: "active" })),
    ["id", "code", "name", "area", "feeds", "status", "boxLastSeenAt", "carePlan", "jobRef", "boxKeyIssuedAt"]);
  const i = shapeIncident({ id: "i", siteId: "s", kind: "disk_full", state: "open", source: "email", openedAt: "2026-10-12T10:00:00Z" });
  assert.deepEqual(Object.keys(i), ["id", "siteId", "deviceId", "kind", "state", "source", "openedAt", "lastSeenAt", "notifiedAt", "repeatCount", "areaGroup", "acknowledgedBy", "acknowledgedAt", "fixedAt", "fixedBy", "fixedReason"]);
  assert.equal(i.deviceId, null);
  assert.equal(i.repeatCount, 1);
  assert.deepEqual(shapeDevice({ id: "d", kind: "camera", label: "C1" }, undefined), { id: "d", kind: "camera", label: "C1", channel: null, state: "unknown", since: null, lastEventAt: null });
});

test("sites are listed in natural code order, not text order", () => {
  const out = buildSummary({ sites: [site("a", "VS-0010"), site("b", "VS-0002"), site("c", "VS-10000")], devices: [], incidents: [], boxKeys: [], unknown: [] });
  assert.deepEqual(out.sites.map((s) => s.code), ["VS-0002", "VS-0010", "VS-10000"]);
});

test("devices are ordered box, recorder, then cameras in natural order", () => {
  const out = buildSummary({
    sites: [site("s", "VS-0001")],
    devices: [dev("1", "s", "camera", "Camera 10"), dev("2", "s", "camera", "Camera 2"), dev("3", "s", "recorder", "Recorder"), dev("4", "s", "box", "Box")],
    deviceStates: { 2: { state: "down", since: "2026-10-12T10:00:00Z", lastEventAt: "2026-10-12T10:05:00Z" } },
    incidents: [], boxKeys: [], unknown: [],
  });
  assert.deepEqual(out.sites[0].devices.map((d) => d.label), ["Box", "Recorder", "Camera 2", "Camera 10"]);
  assert.equal(out.sites[0].devices[2].state, "down");
  assert.equal(out.sites[0].devices[3].state, "unknown");
});

test("incidents are newest first and only belong to their own site", () => {
  const out = buildSummary({
    sites: [site("s", "VS-0001"), site("t", "VS-0002")], devices: [],
    incidents: [inc("old", "s", "2026-10-12T08:00:00Z"), inc("new", "s", "2026-10-12T09:00:00Z"), inc("other", "t", "2026-10-12T07:00:00Z")],
    boxKeys: [], unknown: [],
  });
  assert.deepEqual(out.sites[0].incidents.map((i) => i.id), ["new", "old"]);
  assert.deepEqual(out.sites[1].incidents.map((i) => i.id), ["other"]);
});

test("the box key date is the latest live key for that site", () => {
  const out = buildSummary({
    sites: [site("s", "VS-0001"), site("t", "VS-0002")], devices: [], incidents: [], unknown: [],
    boxKeys: [{ siteId: "s", createdAt: "2026-10-01T00:00:00Z" }, { siteId: "s", createdAt: "2026-10-05T00:00:00Z" }],
  });
  assert.equal(out.sites[0].boxKeyIssuedAt, "2026-10-05T00:00:00Z");
  assert.equal(out.sites[1].boxKeyIssuedAt, null);
});

test("unreadable emails are flattened, newest first, and capped at twenty", () => {
  const unknown = Array.from({ length: 25 }, (_, i) => ({ id: i, siteId: null, observedAt: "x", receivedAt: new Date(Date.UTC(2026, 9, 12, 10, i)).toISOString(), raw: { subject: `Mail ${i}`, excerpt: "body", siteCode: "VS-0001" } }));
  const out = buildSummary({ sites: [], devices: [], incidents: [], boxKeys: [], unknown });
  assert.equal(out.unknown.length, 20);
  assert.equal(out.unknown[0].subject, "Mail 24");
  assert.deepEqual(Object.keys(out.unknown[0]), ["id", "siteId", "observedAt", "receivedAt", "siteCode", "subject", "excerpt"]);
  assert.deepEqual(shapeUnknown({ id: 1 }), { id: 1, siteId: null, observedAt: undefined, receivedAt: undefined, siteCode: "", subject: "", excerpt: "" });
});

test("site detail keeps fixed incidents, newest first, and the latest fifty of each list", () => {
  const incidents = Array.from({ length: 60 }, (_, i) => inc(`i${i}`, "s", new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), { state: i % 2 ? "fixed" : "open" }));
  const events = Array.from({ length: 60 }, (_, i) => ({ id: i, deviceId: null, source: "box", kind: "camera_offline", observedAt: "x", receivedAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() }));
  const out = buildSiteDetail({ site: site("s", "VS-0001"), devices: [], deviceStates: {}, incidents, events, boxKeyIssuedAt: "2026-10-02T00:00:00Z" });
  assert.equal(out.incidents.length, 50);
  assert.equal(out.incidents[0].id, "i59");
  assert.ok(out.incidents.some((i) => i.state === "fixed"));
  assert.equal(out.events.length, 50);
  assert.equal(out.events[0].id, 59);
  assert.equal(out.site.boxKeyIssuedAt, "2026-10-02T00:00:00Z");
});
```

Create `tests/monitoring-paging.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { fetchAll, dbError } from "../monitoring/supabase/functions/_shared/paging.mjs";

// A query that behaves like PostgREST: .range(from, to) returns that slice of a table.
const tableQuery = (rows, log = []) => () => ({
  range(from, to) { log.push([from, to]); return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); },
});

test("fetchAll keeps asking until a short page comes back", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
  const log = [];
  const got = await fetchAll(tableQuery(rows, log), 2);
  assert.deepEqual(got, rows);
  assert.deepEqual(log, [[0, 1], [2, 3], [4, 5]]);
});

test("a table that is an exact multiple of the page size costs one extra, empty request", async () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ id: i }));
  const log = [];
  assert.equal((await fetchAll(tableQuery(rows, log), 2)).length, 4);
  assert.equal(log.length, 3);
});

test("an empty table gives an empty list after one request", async () => {
  const log = [];
  assert.deepEqual(await fetchAll(tableQuery([], log), 1000), []);
  assert.equal(log.length, 1);
});

test("1,500 rows come back whole with the default page size", async () => {
  const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
  assert.equal((await fetchAll(tableQuery(rows))).length, 1500);
});

test("a database error stops paging and keeps its code and details", async () => {
  const query = () => ({ range: () => Promise.resolve({ data: null, error: { message: "boom", code: "57014", details: "timeout" } }) });
  await assert.rejects(() => fetchAll(query, 2), /boom \[57014\] timeout/);
  assert.equal(dbError({ message: "x" }).message, "x [no code]");
});
```

- [ ] **Step 2: Run them and see them fail**

```bash
node --test tests/monitoring-summary.test.js tests/monitoring-paging.test.js
```

Expected: both files fail with `ERR_MODULE_NOT_FOUND` for `summary.mjs` and `paging.mjs`.

- [ ] **Step 3: Write the shared shapes**

Create `monitoring/supabase/functions/_shared/summary.mjs`:

```javascript
// The answers the Operations app receives. Both repositories (the real one on Supabase
// and the in-memory one used by tests) build their answers with these functions, so
// their shapes and their ordering cannot drift apart.
//
// Everything here takes plain camelCase objects. Turning database rows into those
// objects is the real repository's job.

const DEVICE_ORDER = { box: 0, recorder: 1, camera: 2 };
const time = (iso) => Date.parse(iso || "") || 0;
const newestFirst = (field) => (a, b) => time(b[field]) - time(a[field]);
const naturally = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });

export function shapeSite(s, boxKeyIssuedAt = null) {
  return {
    id: s.id, code: s.code, name: s.name, area: s.area || "", feeds: s.feeds || [], status: s.status,
    boxLastSeenAt: s.boxLastSeenAt || null, carePlan: !!s.carePlan, jobRef: s.jobRef || null,
    boxKeyIssuedAt: boxKeyIssuedAt || null,
  };
}

export function shapeIncident(i) {
  return {
    id: i.id, siteId: i.siteId, deviceId: i.deviceId || null, kind: i.kind, state: i.state, source: i.source,
    openedAt: i.openedAt, lastSeenAt: i.lastSeenAt || null, notifiedAt: i.notifiedAt || null,
    repeatCount: i.repeatCount || 1, areaGroup: i.areaGroup || null,
    acknowledgedBy: i.acknowledgedBy || null, acknowledgedAt: i.acknowledgedAt || null,
    fixedAt: i.fixedAt || null, fixedBy: i.fixedBy || null, fixedReason: i.fixedReason || null,
  };
}

export function shapeDevice(d, st) {
  return {
    id: d.id, kind: d.kind, label: d.label, channel: d.channel == null ? null : d.channel,
    state: (st && st.state) || "unknown", since: (st && st.since) || null, lastEventAt: (st && st.lastEventAt) || null,
  };
}

export function shapeEvent(e) {
  return { id: e.id, deviceId: e.deviceId || null, source: e.source, kind: e.kind, observedAt: e.observedAt, receivedAt: e.receivedAt };
}

// An email nobody could read. `raw` is whatever the email script sent, so every field is optional.
export function shapeUnknown(e) {
  const raw = e.raw || {};
  return {
    id: e.id, siteId: e.siteId || null, observedAt: e.observedAt, receivedAt: e.receivedAt,
    siteCode: raw.siteCode || "", subject: raw.subject || "", excerpt: raw.excerpt || "",
  };
}

const sortDevices = (a, b) => (DEVICE_ORDER[a.kind] - DEVICE_ORDER[b.kind]) || naturally(a.label, b.label);

function latestKeyBySite(boxKeys) {
  const out = {};
  for (const k of boxKeys || []) if (!out[k.siteId] || time(k.createdAt) > time(out[k.siteId])) out[k.siteId] = k.createdAt;
  return out;
}

// sites, devices, incidents (live ones only), boxKeys (live ones only), unknown (newest first or not).
export function buildSummary({ sites, devices, deviceStates, incidents, boxKeys, unknown }) {
  const keyBy = latestKeyBySite(boxKeys);
  const states = deviceStates || {};
  return {
    sites: [...(sites || [])].sort((a, b) => naturally(a.code, b.code)).map((s) => ({
      ...shapeSite(s, keyBy[s.id]),
      devices: (devices || []).filter((d) => d.siteId === s.id).map((d) => shapeDevice(d, states[d.id])).sort(sortDevices),
      incidents: (incidents || []).filter((i) => i.siteId === s.id).map(shapeIncident).sort(newestFirst("openedAt")),
    })),
    unknown: [...(unknown || [])].sort(newestFirst("receivedAt")).slice(0, 20).map(shapeUnknown),
  };
}

// One site in full: every incident (open or fixed) and the most recent events.
export function buildSiteDetail({ site, devices, deviceStates, incidents, events, boxKeyIssuedAt }) {
  const states = deviceStates || {};
  return {
    site: shapeSite(site, boxKeyIssuedAt),
    devices: (devices || []).map((d) => shapeDevice(d, states[d.id])).sort(sortDevices),
    incidents: [...(incidents || [])].map(shapeIncident).sort(newestFirst("openedAt")).slice(0, 50),
    events: [...(events || [])].map(shapeEvent).sort(newestFirst("receivedAt")).slice(0, 50),
  };
}
```

- [ ] **Step 4: Write the paging helper**

Create `monitoring/supabase/functions/_shared/paging.mjs`:

```javascript
// PostgREST answers at most 1,000 rows per request and does not say when it stopped early.
// fetchAll asks page by page until a short page comes back, so nothing is silently cut off.

export const dbError = (error) =>
  new Error(`${error.message} [${error.code || "no code"}] ${error.details || ""}`.trim());

// makeQuery() must return a fresh query that has a stable, unique ORDER BY, because paging
// over an unordered query can skip or repeat rows.
export async function fetchAll(makeQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const res = await makeQuery().range(from, from + pageSize - 1);
    if (res.error) throw dbError(res.error);
    const page = res.data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
```

- [ ] **Step 5: Write the stub database used by later tasks**

Create `tests/helpers/stub-db.mjs`:

```javascript
// A stand-in for the supabase-js client that records every call and answers from a function.
//   const { db, calls } = makeStubDb((call) => ({ data: [...] }));
// `call` is { table, ops: [[method, ...args], ...] } in the order the code chained them.
// Awaiting a query (or an rpc) resolves to whatever the function returns: { data, error, count }.
export function makeStubDb(respond) {
  const calls = [];
  const chain = (call) => {
    const builder = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === "then") return (resolve, reject) => Promise.resolve(respond(call)).then(resolve, reject);
        return (...args) => { call.ops.push([prop, ...args]); return builder; };
      },
    });
    return builder;
  };
  const db = {
    from(table) { const call = { table, ops: [] }; calls.push(call); return chain(call); },
    rpc(name, args) { const call = { table: `rpc:${name}`, ops: [["rpc", args]] }; calls.push(call); return chain(call); },
  };
  return { db, calls };
}

export const has = (call, method, ...args) =>
  call.ops.some((op) => op[0] === method && args.every((a, i) => JSON.stringify(op[i + 1]) === JSON.stringify(a)));

// Applies a .range(from, to) op to a list of rows, like PostgREST does.
export function page(call, rows) {
  const r = call.ops.find((op) => op[0] === "range");
  return { data: r ? rows.slice(r[1], r[2] + 1) : rows };
}
```

- [ ] **Step 6: Run the tests and see them pass**

```bash
node --test tests/monitoring-summary.test.js tests/monitoring-paging.test.js
npm test
```

Expected: 12 new tests pass. `npm test`: 230 pass, 0 fail.

- [ ] **Step 7: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/functions/_shared/summary.mjs sales-app/monitoring/supabase/functions/_shared/paging.mjs sales-app/tests/helpers/stub-db.mjs sales-app/tests/monitoring-summary.test.js sales-app/tests/monitoring-paging.test.js
git commit -m "sales-app: monitoring summary shapes and paging helper

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
cd sales-app
```

---

### Task 2: Real and fake repositories use the shared shapes

Rewires `repo.mjs` and the fake repository onto Task 1, pages every list read, and adds the three site-admin operations. A contract test feeds the same data to both repositories and requires identical summaries.

**Files:**
- Replace: `monitoring/supabase/functions/_shared/repo.mjs`
- Replace: `tests/helpers/fake-repo.mjs`
- Replace: `tests/monitoring-repo.test.js`

- [ ] **Step 1: Replace the repository tests**

Replace the whole of `tests/monitoring-repo.test.js` with the following. It keeps the two existing tests (malformed id, error details) and adds the contract, paging and site-admin tests:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../monitoring/supabase/functions/_shared/repo.mjs";
import { makeFakeRepo } from "./helpers/fake-repo.mjs";
import { makeStubDb, has, page } from "./helpers/stub-db.mjs";

const SITE = "11111111-1111-4111-8111-111111111111";
const CAMERA = "22222222-2222-4222-8222-222222222222";
const RECORDER = "33333333-3333-4333-8333-333333333333";
const INCIDENT = "44444444-4444-4444-8444-444444444444";

test("a malformed id is simply not found and never reaches the database", async () => {
  const db = new Proxy({}, { get() { throw new Error("the database must not be touched"); } });
  const repo = makeRepo(db);
  assert.equal(await repo.getSiteDetail("not-a-uuid"), null);
  assert.equal(await repo.getSiteDetail(undefined), null);
  assert.equal(await repo.setIncidentState({ incidentId: "nope", action: "fix", by: "a", nowIso: "2026-10-12T10:00:00Z" }), null);
  assert.equal(await repo.updateSite("nope", { area: "x" }), null);
});

test("database errors keep their code and details so the logs can say what failed", async () => {
  const db = { from: () => ({ select: async () => ({ error: { message: "permission denied", code: "42501", details: "no grant" } }) }) };
  await assert.rejects(() => makeRepo(db).loadRules(), /permission denied \[42501\] no grant/);
});

// ---------- the summary contract: real and fake repositories must agree ----------
const EXPECTED = {
  sites: [{
    id: SITE, code: "VS-0001", name: "Mukasa Pharmacy", area: "Ntinda", feeds: ["box", "email"], status: "active",
    boxLastSeenAt: "2026-10-12T10:00:00.000Z", carePlan: true, jobRef: "J-2026-0007", boxKeyIssuedAt: "2026-10-10T08:00:00.000Z",
    devices: [
      { id: RECORDER, kind: "recorder", label: "Recorder", channel: null, state: "ok", since: "2026-10-12T09:00:00.000Z", lastEventAt: "2026-10-12T10:00:00.000Z" },
      { id: CAMERA, kind: "camera", label: "Camera 3", channel: 3, state: "down", since: "2026-10-12T09:30:00.000Z", lastEventAt: "2026-10-12T10:00:00.000Z" },
    ],
    incidents: [{
      id: INCIDENT, siteId: SITE, deviceId: CAMERA, kind: "camera_offline", state: "acknowledged", source: "box",
      openedAt: "2026-10-12T09:30:00.000Z", lastSeenAt: "2026-10-12T10:00:00.000Z", notifiedAt: "2026-10-12T09:36:00.000Z",
      repeatCount: 1, areaGroup: null, acknowledgedBy: "abraham@verisko.com", acknowledgedAt: "2026-10-12T09:40:00.000Z",
      fixedAt: null, fixedBy: null, fixedReason: null,
    }],
  }],
  unknown: [{ id: "9", siteId: null, observedAt: "2026-10-12T08:00:00.000Z", receivedAt: "2026-10-12T08:05:00.000Z", siteCode: "VS-0001", subject: "Weekly report", excerpt: "all fine" }],
};

test("the real repository, fed database rows, returns exactly the contract summary", async () => {
  const { db } = makeStubDb((call) => {
    if (call.table === "sites") return page(call, [{ id: SITE, code: "VS-0001", client_name: "Mukasa Pharmacy", area: "Ntinda", feeds: ["box", "email"], status: "active", box_last_seen_at: "2026-10-12T10:00:00.000Z", care_plan: true, job_ref: "J-2026-0007" }]);
    if (call.table === "devices") return page(call, [{ id: CAMERA, site_id: SITE, kind: "camera", label: "Camera 3", channel: 3 }, { id: RECORDER, site_id: SITE, kind: "recorder", label: "Recorder", channel: null }]);
    if (call.table === "device_state") return page(call, [
      { device_id: CAMERA, state: "down", since: "2026-10-12T09:30:00.000Z", last_event_at: "2026-10-12T10:00:00.000Z" },
      { device_id: RECORDER, state: "ok", since: "2026-10-12T09:00:00.000Z", last_event_at: "2026-10-12T10:00:00.000Z" }]);
    if (call.table === "incidents") return page(call, [{ id: INCIDENT, site_id: SITE, device_id: CAMERA, kind: "camera_offline", state: "acknowledged", source: "box", opened_at: "2026-10-12T09:30:00.000Z", last_seen_at: "2026-10-12T10:00:00.000Z", notified_at: "2026-10-12T09:36:00.000Z", repeat_count: 1, area_group: null, acknowledged_by: "abraham@verisko.com", acknowledged_at: "2026-10-12T09:40:00.000Z", fixed_at: null, fixed_by: null, fixed_reason: null }]);
    if (call.table === "access_keys") return page(call, [{ id: "k", site_id: SITE, created_at: "2026-10-10T08:00:00.000Z" }]);
    if (call.table === "events") return { data: [{ id: "9", site_id: null, observed_at: "2026-10-12T08:00:00.000Z", received_at: "2026-10-12T08:05:00.000Z", raw: { siteCode: "VS-0001", subject: "Weekly report", excerpt: "all fine" } }] };
    throw new Error(`unexpected table ${call.table}`);
  });
  assert.deepEqual(await makeRepo(db).listSummary(), EXPECTED);
});

test("the fake repository, given the same data, returns exactly the same summary", async () => {
  const repo = makeFakeRepo();
  const site = repo.addSite({ id: SITE, code: "VS-0001", name: "Mukasa Pharmacy", area: "Ntinda", feeds: ["box", "email"], boxLastSeenAt: "2026-10-12T10:00:00.000Z", carePlan: true, jobRef: "J-2026-0007" });
  repo.db.devices.push({ id: CAMERA, siteId: site.id, kind: "camera", label: "Camera 3", channel: 3 }, { id: RECORDER, siteId: site.id, kind: "recorder", label: "Recorder", channel: null });
  repo.db.deviceStates[CAMERA] = { state: "down", since: "2026-10-12T09:30:00.000Z", lastEventAt: "2026-10-12T10:00:00.000Z" };
  repo.db.deviceStates[RECORDER] = { state: "ok", since: "2026-10-12T09:00:00.000Z", lastEventAt: "2026-10-12T10:00:00.000Z" };
  repo.db.incidents.push({ id: INCIDENT, siteId: site.id, deviceId: CAMERA, kind: "camera_offline", state: "acknowledged", source: "box", openedAt: "2026-10-12T09:30:00.000Z", lastSeenAt: "2026-10-12T10:00:00.000Z", notifiedAt: "2026-10-12T09:36:00.000Z", repeatCount: 1, areaGroup: null, acknowledgedBy: "abraham@verisko.com", acknowledgedAt: "2026-10-12T09:40:00.000Z" });
  repo.addKey({ id: "k", kind: "box", siteId: site.id, keyHash: "h", createdAt: "2026-10-10T08:00:00.000Z" });
  repo.db.events.push({ id: "9", siteId: null, deviceId: null, source: "email", kind: "unknown", observedAt: "2026-10-12T08:00:00.000Z", receivedAt: "2026-10-12T08:05:00.000Z", dedupeKey: "e", raw: { siteCode: "VS-0001", subject: "Weekly report", excerpt: "all fine" } });
  assert.deepEqual(await repo.listSummary(), EXPECTED);
});

test("more than 1,000 sites are all returned, because the reads page through results", async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `s${String(i).padStart(4, "0")}`, code: `VS-${String(i + 1).padStart(4, "0")}`, client_name: "C", area: "", feeds: ["box"], status: "active", box_last_seen_at: null, care_plan: false, job_ref: null }));
  const { db, calls } = makeStubDb((call) => (call.table === "sites" ? page(call, rows) : call.table === "events" ? { data: [] } : page(call, [])));
  const out = await makeRepo(db).listSummary();
  assert.equal(out.sites.length, 1001);
  const siteCalls = calls.filter((c) => c.table === "sites");
  assert.equal(siteCalls.length, 2, "one full page, then one more");
  assert.ok(siteCalls.every((c) => has(c, "order", "id")), "every paged query has a stable order");
  const snapshot = await makeRepo(db).listWatchSnapshot();
  assert.equal(snapshot.sites.length, 1001);
});

// ---------- site administration ----------
test("createSite writes the right columns and returns the site with its generated code", async () => {
  const { db, calls } = makeStubDb(() => ({ data: { id: SITE, code: "VS-0001", client_name: "Kato Supermarket", area: "Kololo", feeds: ["email"], status: "active", box_last_seen_at: null, care_plan: true, job_ref: null } }));
  const site = await makeRepo(db).createSite({ clientName: "Kato Supermarket", area: "Kololo", feeds: ["email"], carePlan: true, jobRef: "" });
  assert.deepEqual(calls[0].ops[0], ["insert", { client_name: "Kato Supermarket", area: "Kololo", feeds: ["email"], care_plan: true, job_ref: null }]);
  assert.equal(site.code, "VS-0001");
  assert.equal(site.name, "Kato Supermarket");
  assert.equal(site.carePlan, true);
});

test("updateSite sends only the fields it was given, renamed to columns", async () => {
  const { db, calls } = makeStubDb(() => ({ data: [{ id: SITE, code: "VS-0001", client_name: "Kato", area: "New area", feeds: ["box"], status: "paused", box_last_seen_at: null, care_plan: false, job_ref: null }] }));
  const site = await makeRepo(db).updateSite(SITE, { area: "New area", status: "paused" });
  assert.deepEqual(calls[0].ops[0], ["update", { area: "New area", status: "paused" }]);
  assert.ok(has(calls[0], "eq", "id", SITE));
  assert.equal(site.status, "paused");
});

test("updateSite returns null when no row matched", async () => {
  const { db } = makeStubDb(() => ({ data: [] }));
  assert.equal(await makeRepo(db).updateSite(SITE, { area: "x" }), null);
});

test("replaceBoxKey revokes the live key before inserting the new one", async () => {
  const { db, calls } = makeStubDb(() => ({ data: null }));
  await makeRepo(db).replaceBoxKey(SITE, "hash123", "2026-10-12T10:00:00.000Z");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].ops[0], ["update", { revoked_at: "2026-10-12T10:00:00.000Z" }]);
  assert.ok(has(calls[0], "eq", "kind", "box") && has(calls[0], "eq", "site_id", SITE) && has(calls[0], "is", "revoked_at", null));
  assert.deepEqual(calls[1].ops[0], ["insert", { kind: "box", site_id: SITE, key_hash: "hash123", note: "issued from the Sites screen" }]);
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/monitoring-repo.test.js
```

Expected: the two original tests pass. The new tests fail: the real repository has no `createSite`, `updateSite` or `replaceBoxKey`, and its summary does not yet match the shared shapes or page past 1,000 rows.

- [ ] **Step 3: Replace the real repository**

Replace the whole of `monitoring/supabase/functions/_shared/repo.mjs`:

```javascript
// The real repository: every database read and write the handlers need, on top of a
// supabase-js client created with the service role. It follows the same contract as the
// fake repository in tests/helpers/fake-repo.mjs, and both build the Operations app's
// answers with summary.mjs.
//
// Write order inside save() matters: incidents first, events last. An email is recognised
// as already processed by its event row, so if a write fails midway the retry still
// reaches the incident step.

import { fetchAll, dbError } from "./paging.mjs";
import { buildSummary, buildSiteDetail } from "./summary.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const must = (res) => { if (res.error) throw dbError(res.error); return res.data; };

const SITE_COLS = "id,code,client_name,area,feeds,status,box_last_seen_at,care_plan,job_ref";
const toSite = (r) => r && ({
  id: r.id, code: r.code, name: r.client_name, area: r.area, feeds: r.feeds || [], status: r.status,
  boxLastSeenAt: r.box_last_seen_at, carePlan: !!r.care_plan, jobRef: r.job_ref,
});
const toIncident = (r) => ({
  id: r.id, siteId: r.site_id, deviceId: r.device_id, kind: r.kind, state: r.state, source: r.source,
  openedAt: r.opened_at, lastSeenAt: r.last_seen_at, notifiedAt: r.notified_at, repeatCount: r.repeat_count, areaGroup: r.area_group,
  acknowledgedBy: r.acknowledged_by, acknowledgedAt: r.acknowledged_at, fixedAt: r.fixed_at, fixedBy: r.fixed_by, fixedReason: r.fixed_reason,
});
const toDevice = (r) => ({ id: r.id, siteId: r.site_id, kind: r.kind, label: r.label, channel: r.channel });
const toEvent = (r) => ({
  id: r.id, siteId: r.site_id, deviceId: r.device_id, source: r.source, kind: r.kind,
  observedAt: r.observed_at, receivedAt: r.received_at, raw: r.raw,
});
const stateMap = (rows) => {
  const out = {};
  for (const s of rows) out[s.device_id] = { state: s.state, since: s.since, lastEventAt: s.last_event_at };
  return out;
};
const SITE_PATCH_COLUMNS = { clientName: "client_name", area: "area", feeds: "feeds", carePlan: "care_plan", jobRef: "job_ref", status: "status" };

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
      return { siteId, deviceStates: stateMap(states), incidents: incidents.map(toIncident) };
    },

    async ensureDevice({ siteId, kind, label, channel = null }) {
      const find = async () => must(await db.from("devices").select("id,kind,label").eq("site_id", siteId).eq("kind", kind).eq("label_key", label.toLowerCase()).maybeSingle());
      let d = await find();
      if (d) return d;
      const ins = await db.from("devices").insert({ site_id: siteId, kind, label, channel }).select("id,kind,label").single();
      if (ins.error) {
        if (ins.error.code === "23505") { d = await find(); if (d) return d; } // another request created it first
        throw dbError(ins.error);
      }
      return ins.data;
    },

    async hasEvent(dedupeKey) {
      const res = await db.from("events").select("id", { count: "exact", head: true }).eq("dedupe_key", dedupeKey);
      if (res.error) throw dbError(res.error);
      return (res.count || 0) > 0;
    },

    async save({ siteId, events, deviceStates, ops, boxSeenAt }) {
      const created = {};
      for (const o of ops || []) {
        if (o.op === "open") {
          const ins = await db.from("incidents").insert({
            site_id: o.siteId, device_id: o.deviceId || null, kind: o.kind, source: o.source,
            opened_at: o.openedAt, last_seen_at: o.lastSeenAt, area_group: o.areaGroup || null,
          }).select("id").single();
          if (!ins.error) { created[o.ref] = ins.data.id; continue; }
          if (ins.error.code !== "23505") throw dbError(ins.error);
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
      const sites = (await fetchAll(() => db.from("sites").select(SITE_COLS).order("id"))).map(toSite);
      const boxes = await fetchAll(() => db.from("devices").select("id,site_id").eq("kind", "box").order("id"));
      const boxBySite = Object.fromEntries(boxes.map((b) => [b.site_id, b.id]));
      const incidents = (await fetchAll(() => db.from("incidents").select("*").neq("state", "fixed").order("id"))).map(toIncident);
      return { sites: sites.map((s) => ({ ...s, boxDeviceId: boxBySite[s.id] || null })), incidents };
    },

    async listUnnotified(sinceIso) {
      return must(await db.from("incidents").select("*").eq("state", "open").is("notified_at", null).gte("created_at", sinceIso)).map(toIncident);
    },

    async listSummary() {
      const [sites, devices, states, incidents, keys] = await Promise.all([
        fetchAll(() => db.from("sites").select(SITE_COLS).order("id")),
        fetchAll(() => db.from("devices").select("id,site_id,kind,label,channel").order("id")),
        fetchAll(() => db.from("device_state").select("device_id,state,since,last_event_at").order("device_id")),
        fetchAll(() => db.from("incidents").select("*").neq("state", "fixed").order("id")),
        fetchAll(() => db.from("access_keys").select("id,site_id,created_at").eq("kind", "box").is("revoked_at", null).order("id")),
      ]);
      const unknown = must(await db.from("events").select("id,site_id,observed_at,received_at,raw").eq("kind", "unknown").order("received_at", { ascending: false }).limit(20));
      return buildSummary({
        sites: sites.map(toSite), devices: devices.map(toDevice), deviceStates: stateMap(states), incidents: incidents.map(toIncident),
        boxKeys: keys.map((k) => ({ siteId: k.site_id, createdAt: k.created_at })), unknown: unknown.map(toEvent),
      });
    },

    async getSiteDetail(siteId) {
      if (!UUID.test(siteId)) return null; // a malformed id is simply not found, not a database error
      const site = must(await db.from("sites").select(SITE_COLS).eq("id", siteId).maybeSingle());
      if (!site) return null;
      const devices = must(await db.from("devices").select("id,site_id,kind,label,channel").eq("site_id", siteId));
      const ids = devices.map((d) => d.id);
      const states = ids.length ? must(await db.from("device_state").select("device_id,state,since,last_event_at").in("device_id", ids)) : [];
      const incidents = must(await db.from("incidents").select("*").eq("site_id", siteId).order("opened_at", { ascending: false }).limit(50));
      const events = must(await db.from("events").select("id,site_id,device_id,source,kind,observed_at,received_at,raw").eq("site_id", siteId).order("received_at", { ascending: false }).limit(50));
      const keys = must(await db.from("access_keys").select("created_at").eq("kind", "box").eq("site_id", siteId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1));
      return buildSiteDetail({
        site: toSite(site), devices: devices.map(toDevice), deviceStates: stateMap(states), incidents: incidents.map(toIncident),
        events: events.map(toEvent), boxKeyIssuedAt: keys.length ? keys[0].created_at : null,
      });
    },

    async setIncidentState({ incidentId, action, by, nowIso }) {
      if (!UUID.test(incidentId)) return null;
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

    // ---- site administration (called by the site-admin function) ----
    async createSite({ clientName, area, feeds, carePlan, jobRef }) {
      const row = must(await db.from("sites").insert({
        client_name: clientName, area, feeds, care_plan: carePlan, job_ref: jobRef || null,
      }).select(SITE_COLS).single());
      return toSite(row);
    },

    // patch uses the app's field names (clientName, area, feeds, carePlan, jobRef, status).
    async updateSite(siteId, patch) {
      if (!UUID.test(siteId)) return null;
      const row = {};
      for (const [key, column] of Object.entries(SITE_PATCH_COLUMNS)) if (key in patch) row[column] = key === "jobRef" ? (patch[key] || null) : patch[key];
      if (!Object.keys(row).length) return this.getSite(siteId);
      const rows = must(await db.from("sites").update(row).eq("id", siteId).select(SITE_COLS));
      return rows.length ? toSite(rows[0]) : null;
    },

    // A new box key replaces any live one: the old key stops working at once.
    async replaceBoxKey(siteId, keyHash, nowIso) {
      must(await db.from("access_keys").update({ revoked_at: nowIso }).eq("kind", "box").eq("site_id", siteId).is("revoked_at", null));
      must(await db.from("access_keys").insert({ kind: "box", site_id: siteId, key_hash: keyHash, note: "issued from the Sites screen" }));
    },
  };
}
```

- [ ] **Step 4: Replace the fake repository**

Replace the whole of `tests/helpers/fake-repo.mjs`:

```javascript
// In-memory stand-in for the Supabase repo. It follows the same contract as
// monitoring/supabase/functions/_shared/repo.mjs, so handler tests exercise real flows.
// Summary and detail answers are built with the same functions as the real repository.
import { buildSummary, buildSiteDetail } from "../../monitoring/supabase/functions/_shared/summary.mjs";

const SITE_FIELDS = ["clientName", "area", "feeds", "carePlan", "jobRef", "status"];

export function makeFakeRepo({ now = () => new Date() } = {}) {
  const db = { sites: [], devices: [], keys: [], events: [], deviceStates: {}, incidents: [], contacts: [], rules: [] };
  let seq = 0;
  const id = (p) => `${p}-${++seq}`;
  const iso = () => now().toISOString();
  const active = (i) => i.state !== "fixed";

  const repo = {
    db,
    addSite(s) { const site = { id: id("S"), code: `VS-${String(db.sites.length + 1).padStart(4, "0")}`, name: "Test Pharmacy", area: "Ntinda", feeds: ["box"], status: "active", boxLastSeenAt: null, carePlan: false, jobRef: null, ...s }; db.sites.push(site); return site; },
    addKey(k) { db.keys.push({ revokedAt: null, createdAt: iso(), ...k }); },
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
      return buildSummary({
        sites: db.sites, devices: db.devices, deviceStates: db.deviceStates, incidents: db.incidents.filter(active),
        boxKeys: db.keys.filter((k) => k.kind === "box" && !k.revokedAt).map((k) => ({ siteId: k.siteId, createdAt: k.createdAt })),
        unknown: db.events.filter((e) => e.kind === "unknown"),
      });
    },
    async getSiteDetail(siteId) {
      const site = db.sites.find((s) => s.id === siteId);
      if (!site) return null;
      const live = db.keys.filter((k) => k.kind === "box" && k.siteId === siteId && !k.revokedAt).map((k) => k.createdAt).sort();
      return buildSiteDetail({
        site, devices: db.devices.filter((d) => d.siteId === siteId), deviceStates: db.deviceStates,
        incidents: db.incidents.filter((i) => i.siteId === siteId), events: db.events.filter((e) => e.siteId === siteId),
        boxKeyIssuedAt: live.length ? live[live.length - 1] : null,
      });
    },
    async setIncidentState({ incidentId, action, by, nowIso }) {
      const inc = db.incidents.find((i) => i.id === incidentId);
      if (!inc) return null;
      if (action === "acknowledge" && inc.state === "open") { inc.state = "acknowledged"; inc.acknowledgedBy = by; inc.acknowledgedAt = nowIso; return { changed: true, state: inc.state }; }
      if (action === "fix" && inc.state !== "fixed") { inc.state = "fixed"; inc.fixedBy = by; inc.fixedAt = nowIso; inc.fixedReason = "manual"; return { changed: true, state: inc.state }; }
      return { changed: false, state: inc.state };
    },

    // ---- site administration ----
    async createSite({ clientName, area, feeds, carePlan, jobRef }) {
      return repo.addSite({ name: clientName, area, feeds, carePlan, jobRef });
    },
    async updateSite(siteId, patch) {
      const site = db.sites.find((s) => s.id === siteId);
      if (!site) return null;
      for (const key of SITE_FIELDS) if (key in patch) site[key === "clientName" ? "name" : key] = patch[key];
      return site;
    },
    async replaceBoxKey(siteId, keyHash, nowIso) {
      for (const k of db.keys) if (k.kind === "box" && k.siteId === siteId && !k.revokedAt) k.revokedAt = nowIso;
      db.keys.push({ id: id("K"), kind: "box", siteId, keyHash, revokedAt: null, createdAt: nowIso });
    },
  };
  return repo;
}
```

- [ ] **Step 5: Run the monitoring tests**

```bash
node --test tests/monitoring-*.test.js
npm test
```

Expected: `tests/monitoring-repo.test.js` has 9 tests, all passing; every other monitoring file still passes. `npm test`: 237 pass, 0 fail.

If an older test now fails on a missing or renamed field, the fake and the real repository disagree with the old shape. Fix the repository, not the test, unless the old test asserted something the spec no longer wants.

- [ ] **Step 6: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/functions/_shared/repo.mjs sales-app/tests/helpers/fake-repo.mjs sales-app/tests/monitoring-repo.test.js
git commit -m "sales-app: monitoring repositories share answer shapes and page past 1,000 rows

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
cd sales-app
```

---

### Task 3: The site-admin function

Creates sites, edits them, pauses them and issues box keys. Accepts only the api key.

**Files:**
- Replace: `monitoring/supabase/functions/_shared/validate.mjs`
- Replace: `monitoring/supabase/functions/_shared/http.mjs`
- Create: `monitoring/supabase/functions/_shared/handlers/site-admin.mjs`
- Create: `monitoring/supabase/functions/site-admin/index.ts`
- Modify: `monitoring/scripts/make-deploy-payload.mjs`
- Replace: `tests/helpers/harness.mjs`
- Create: `tests/monitoring-site-admin.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/monitoring-site-admin.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { makeHarness } from "./helpers/harness.mjs";
import { validateSiteFields } from "../monitoring/supabase/functions/_shared/validate.mjs";
import { hashKey } from "../monitoring/supabase/functions/_shared/keys.mjs";

const body = async (res) => res.json();
const NEW_SITE = { action: "create_site", clientName: "Kato Supermarket", area: "Kololo", feeds: ["box", "email"], carePlan: true, jobRef: "J-2026-0007" };

// ---------- the field checks ----------
test("a new site needs a name and at least one feed, and tidies what it is given", () => {
  const v = validateSiteFields({ clientName: "  Kato  ", feeds: ["email", "box", "box"], area: " Kololo " });
  assert.deepEqual(v.value, { clientName: "Kato", area: "Kololo", feeds: ["box", "email"], carePlan: false, jobRef: null });
  assert.equal(validateSiteFields({ feeds: ["box"] }).ok, false);
  assert.equal(validateSiteFields({ clientName: "x", feeds: [] }).ok, false);
  assert.equal(validateSiteFields({ clientName: "x", feeds: ["sms"] }).ok, false);
  assert.equal(validateSiteFields({ clientName: "x", feeds: ["box"], carePlan: "yes" }).ok, false);
  assert.equal(validateSiteFields(null).ok, false);
});

test("an edit checks and returns only the fields that were sent", () => {
  assert.deepEqual(validateSiteFields({ area: "Ntinda" }, { partial: true }).value, { area: "Ntinda" });
  assert.deepEqual(validateSiteFields({ status: "paused", jobRef: "" }, { partial: true }).value, { status: "paused", jobRef: null });
  assert.equal(validateSiteFields({ status: "deleted" }, { partial: true }).ok, false);
  assert.equal(validateSiteFields({ clientName: "   " }, { partial: true }).ok, false);
  assert.equal(validateSiteFields({ feeds: [] }, { partial: true }).ok, false);
  assert.deepEqual(validateSiteFields({}, { partial: true }).value, {});
});

test("names and references are cut to their limits", () => {
  const v = validateSiteFields({ clientName: "n".repeat(500), feeds: ["box"], area: "a".repeat(500), jobRef: "j".repeat(500) });
  assert.equal(v.value.clientName.length, 120);
  assert.equal(v.value.area.length, 80);
  assert.equal(v.value.jobRef.length, 40);
});

// ---------- the handler ----------
test("only the api key may use site-admin", async () => {
  const h = await makeHarness();
  assert.equal((await h.siteAdmin(null, NEW_SITE)).status, 401);
  assert.equal((await h.siteAdmin(h.keys.box, NEW_SITE)).status, 403);
  assert.equal((await h.siteAdmin(h.keys.email, NEW_SITE)).status, 403);
  assert.equal((await h.siteAdmin(h.keys.watch, NEW_SITE)).status, 403);
  assert.equal((await h.siteAdmin(h.keys.api, NEW_SITE)).status, 200);
});

test("create_site makes an active site with the next code and answers with it", async () => {
  const h = await makeHarness();
  const res = await h.siteAdmin(h.keys.api, NEW_SITE);
  const out = await body(res);
  assert.equal(out.ok, true);
  assert.equal(out.site.code, "VS-0002");
  assert.equal(out.site.name, "Kato Supermarket");
  assert.equal(out.site.status, "active");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(h.repo.db.sites.length, 2);
});

test("a status sent with a new site is ignored: new sites always start active", async () => {
  const h = await makeHarness();
  const out = await body(await h.siteAdmin(h.keys.api, { ...NEW_SITE, status: "closed" }));
  assert.equal(out.site.status, "active");
});

test("create_site refuses bad fields with a reason", async () => {
  const h = await makeHarness();
  const res = await h.siteAdmin(h.keys.api, { ...NEW_SITE, feeds: [] });
  assert.equal(res.status, 400);
  assert.match((await body(res)).error, /at least one feed/);
});

test("update_site works on a real uuid and 404s on an unknown one", async () => {
  const h = await makeHarness();
  const id = "55555555-5555-4555-8555-555555555555";
  h.repo.addSite({ id, name: "Real", area: "Ntinda" });
  const out = await body(await h.siteAdmin(h.keys.api, { action: "update_site", siteId: id, area: "Bugolobi", status: "paused" }));
  assert.equal(out.site.area, "Bugolobi");
  assert.equal(out.site.status, "paused");
  assert.equal(out.site.name, "Real", "fields not sent are untouched");
  assert.equal((await h.siteAdmin(h.keys.api, { action: "update_site", siteId: "66666666-6666-4666-8666-666666666666", area: "x" })).status, 404);
  assert.equal((await h.siteAdmin(h.keys.api, { action: "update_site", siteId: id, status: "deleted" })).status, 400);
});

test("issue_box_key returns a new key once, stores only its hash, and revokes the old key", async () => {
  const h = await makeHarness();
  const id = "77777777-7777-4777-8777-777777777777";
  h.repo.addSite({ id, name: "Box site", feeds: ["box"] });
  const first = await h.siteAdmin(h.keys.api, { action: "issue_box_key", siteId: id });
  const a = await body(first);
  assert.match(a.key, /^vsk_box_[A-Za-z0-9_-]{43}$/);
  assert.equal(first.headers.get("cache-control"), "no-store");
  const stored = h.repo.db.keys.filter((k) => k.kind === "box" && k.siteId === id);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].keyHash, await hashKey(a.key));
  assert.ok(!JSON.stringify(h.repo.db).includes(a.key), "the raw key is not kept anywhere");

  const b = await body(await h.siteAdmin(h.keys.api, { action: "issue_box_key", siteId: id }));
  assert.notEqual(a.key, b.key);
  const live = h.repo.db.keys.filter((k) => k.kind === "box" && k.siteId === id && !k.revokedAt);
  assert.equal(live.length, 1);
  assert.equal(live[0].keyHash, await hashKey(b.key));
  assert.equal((await h.ingest(a.key, { type: "box", checks: [{ kind: "camera", label: "C", ok: true }] })).status, 401, "the old key stopped working");
  assert.equal((await h.ingest(b.key, { type: "box", checks: [{ kind: "camera", label: "C", ok: true }] })).status, 200, "the new key works");
});

test("issue_box_key refuses email-only and closed sites", async () => {
  const h = await makeHarness();
  const a = "88888888-8888-4888-8888-888888888888", c = "99999999-9999-4999-8999-999999999999";
  h.repo.addSite({ id: a, name: "Email only", feeds: ["email"] });
  h.repo.addSite({ id: c, name: "Closed", feeds: ["box"], status: "closed" });
  const noBox = await h.siteAdmin(h.keys.api, { action: "issue_box_key", siteId: a });
  assert.equal(noBox.status, 400);
  assert.match((await body(noBox)).error, /no box feed/);
  assert.match((await body(await h.siteAdmin(h.keys.api, { action: "issue_box_key", siteId: c }))).error, /closed/);
});

test("an unknown action, a malformed site id and a broken body are all refused", async () => {
  const h = await makeHarness();
  assert.equal((await h.siteAdmin(h.keys.api, { action: "delete_everything" })).status, 400);
  assert.equal((await h.siteAdmin(h.keys.api, { action: "issue_box_key", siteId: "nope" })).status, 404);
  assert.equal((await h.siteAdmin(h.keys.api, { action: "issue_box_key" })).status, 404);
  const broken = await (await import("../monitoring/supabase/functions/_shared/handlers/site-admin.mjs")).handleSiteAdmin(
    new Request("http://x", { method: "POST", headers: { authorization: `Bearer ${h.keys.api}` }, body: "{nope" }), h.deps);
  assert.equal(broken.status, 400);
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/monitoring-site-admin.test.js
```

Expected: fails with an import error for `handlers/site-admin.mjs` or `validateSiteFields`.

- [ ] **Step 3: Replace the field checks**

Replace the whole of `monitoring/supabase/functions/_shared/validate.mjs` (the new part is `validateSiteFields` and `SITE_LIMITS` at the end; everything above is unchanged):

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

// ---- site fields, from the Add site / Edit site form ----
const SITE_FEEDS = ["box", "email"];
const SITE_STATUSES = ["active", "paused", "closed"];
export const SITE_LIMITS = { maxName: 120, maxArea: 80, maxJobRef: 40 };

// partial: false for a new site (name and feeds required); true for an edit (only what is sent is checked and returned).
export function validateSiteFields(input, { partial = false } = {}) {
  if (!isObj(input)) return { ok: false, error: "fields are required" };
  const out = {};
  if (!partial || "clientName" in input) {
    const name = text(input.clientName, SITE_LIMITS.maxName);
    if (!name) return { ok: false, error: "the client name is required" };
    out.clientName = name;
  }
  if ("area" in input || !partial) out.area = text(input.area, SITE_LIMITS.maxArea);
  if (!partial || "feeds" in input) {
    if (!Array.isArray(input.feeds) || input.feeds.some((f) => !SITE_FEEDS.includes(f))) return { ok: false, error: "feeds must be box, email or both" };
    const feeds = SITE_FEEDS.filter((f) => input.feeds.includes(f));
    if (!feeds.length) return { ok: false, error: "choose at least one feed: box or email" };
    out.feeds = feeds;
  }
  if ("carePlan" in input || !partial) {
    if ("carePlan" in input && typeof input.carePlan !== "boolean") return { ok: false, error: "carePlan must be true or false" };
    out.carePlan = input.carePlan === true;
  }
  if ("jobRef" in input) out.jobRef = text(input.jobRef, SITE_LIMITS.maxJobRef) || null;
  else if (!partial) out.jobRef = null;
  if ("status" in input) {
    if (!SITE_STATUSES.includes(input.status)) return { ok: false, error: "status must be active, paused or closed" };
    out.status = input.status;
  }
  return { ok: true, value: out };
}
```

- [ ] **Step 4: Let `json()` carry extra headers**

Replace the whole of `monitoring/supabase/functions/_shared/http.mjs`:

```javascript
export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
```

- [ ] **Step 5: Write the handler**

Create `monitoring/supabase/functions/_shared/handlers/site-admin.mjs`:

```javascript
// POST /site-admin. The three things the Operations app can change about a site:
//   { action: "create_site",   clientName, area, feeds, carePlan, jobRef }
//   { action: "update_site",   siteId, ...any of the same fields, and status }
//   { action: "issue_box_key", siteId }   -> { key } shown once, replaces any live key
// Accepts only the app's API key.

import { authenticate } from "../auth.mjs";
import { json } from "../http.mjs";
import { generateKey, hashKey } from "../keys.mjs";
import { validateSiteFields } from "../validate.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "cache-control": "no-store" };

async function readJson(request) {
  try { return await request.json(); } catch (err) { return null; }
}

export async function handleSiteAdmin(request, deps) {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  const auth = await authenticate(request, deps.repo, ["api"]);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body || typeof body !== "object") return json(400, { error: "invalid JSON" });

  if (body.action === "create_site") {
    const v = validateSiteFields(body, { partial: false });
    if (!v.ok) return json(400, { error: v.error });
    const { status, ...fields } = v.value; // a new site is always active
    const site = await deps.repo.createSite(fields);
    return json(200, { ok: true, site }, NO_STORE);
  }

  if (body.action !== "update_site" && body.action !== "issue_box_key") return json(400, { error: "unknown action" });
  if (typeof body.siteId !== "string" || !UUID.test(body.siteId)) return json(404, { error: "no such site" });

  if (body.action === "update_site") {
    const v = validateSiteFields(body, { partial: true });
    if (!v.ok) return json(400, { error: v.error });
    const site = await deps.repo.updateSite(body.siteId, v.value);
    return site ? json(200, { ok: true, site }, NO_STORE) : json(404, { error: "no such site" });
  }

  const site = await deps.repo.getSite(body.siteId);
  if (!site) return json(404, { error: "no such site" });
  if (site.status === "closed") return json(400, { error: "this site is closed" });
  if (!site.feeds.includes("box")) return json(400, { error: "this site has no box feed" });
  const key = generateKey("box");
  await deps.repo.replaceBoxKey(site.id, await hashKey(key), new Date(deps.now().getTime()).toISOString());
  return json(200, { ok: true, key, siteCode: site.code }, NO_STORE);
}
```

- [ ] **Step 6: Write the entry point**

Create `monitoring/supabase/functions/site-admin/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleSiteAdmin } from "../_shared/handlers/site-admin.mjs";
import { makeRepo } from "../_shared/repo.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const deps = { repo: makeRepo(db), now: () => new Date() };
Deno.serve((req: Request) => handleSiteAdmin(req, deps));
```

- [ ] **Step 7: Teach the bundler about the new function**

In `monitoring/scripts/make-deploy-payload.mjs`, change the one line

```javascript
export const FUNCTION_NAMES = ["ingest", "watch", "sites-read", "incident-update"];
```

to

```javascript
export const FUNCTION_NAMES = ["ingest", "watch", "sites-read", "incident-update", "site-admin"];
```

- [ ] **Step 8: Replace the test harness**

Replace the whole of `tests/helpers/harness.mjs` (new: it imports `handleSiteAdmin` and exposes `siteAdmin(key, body)`):

```javascript
// Shared setup for handler tests: a fake repo, a controllable clock, a recording SMS sender,
// and helpers that call the real handlers with real Request objects.
import { makeFakeRepo } from "./fake-repo.mjs";
import { generateKey, hashKey } from "../../monitoring/supabase/functions/_shared/keys.mjs";
import { handleIngest } from "../../monitoring/supabase/functions/_shared/handlers/ingest.mjs";
import { handleWatch } from "../../monitoring/supabase/functions/_shared/handlers/watch.mjs";
import { handleSitesRead, handleIncidentUpdate } from "../../monitoring/supabase/functions/_shared/handlers/sites.mjs";
import { handleSiteAdmin } from "../../monitoring/supabase/functions/_shared/handlers/site-admin.mjs";

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
    siteAdmin: (key, body) => call(handleSiteAdmin, key, body),
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

- [ ] **Step 9: Run the tests and see them pass**

```bash
node --test tests/monitoring-site-admin.test.js tests/monitoring-scripts.test.js
npm test
```

Expected: 11 site-admin tests pass; the existing deploy-bundle tests now also cover `site-admin` and pass. `npm test`: 248 pass, 0 fail.

- [ ] **Step 10: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/supabase/functions/_shared/validate.mjs sales-app/monitoring/supabase/functions/_shared/http.mjs sales-app/monitoring/supabase/functions/_shared/handlers/site-admin.mjs sales-app/monitoring/supabase/functions/site-admin/index.ts sales-app/monitoring/scripts/make-deploy-payload.mjs sales-app/tests/helpers/harness.mjs sales-app/tests/monitoring-site-admin.test.js
git commit -m "sales-app: site-admin function creates sites, edits them and issues box keys

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
cd sales-app
```

---

### Task 4: Deploy the backend and check it live

The repository code changed, so all five functions are redeployed. These steps use the Supabase connector tools and `curl`. Supabase project: `cepernltrzrmupgegcib`. No database migration is needed.

- [ ] **Step 1: Deploy the five functions**

For each name in `ingest`, `watch`, `sites-read`, `incident-update`, `site-admin`:

```bash
cd /Users/ben/Verisko/sales-app
node monitoring/scripts/make-deploy-payload.mjs site-admin > /tmp/deploy-site-admin.json
```

Read the JSON file, then call `deploy_edge_function` with `project_id` `cepernltrzrmupgegcib` and the file's `name`, `entrypoint_path`, `verify_jwt` (false) and `files`, exactly as printed. Repeat with the other four names (change `site-admin` in the command and in the file name).
Expected: each call succeeds. `list_edge_functions` shows all five `ACTIVE`.

- [ ] **Step 2: Each function still rejects a call with no key**

```bash
for f in ingest watch sites-read incident-update site-admin; do
  printf "%s: " $f
  curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://cepernltrzrmupgegcib.supabase.co/functions/v1/$f"
done
```

Expected: `401` for all five. A `500` means a file is missing from a bundle or a column name is wrong: call `query_logs` for the edge function service, fix it in the repo, rerun `npm test`, and redeploy that function.

- [ ] **Step 3: Live round trip with the real api key (the key is never printed)**

```bash
cd /Users/ben/Verisko/sales-app
KEY=$(cat ~/.verisko-monitoring/api-*.key)
BASE=https://cepernltrzrmupgegcib.supabase.co/functions/v1
call() { curl -s -X POST "$BASE/$1" -H "authorization: Bearer $KEY" -H "content-type: application/json" -d "$2"; }

# 1. summary: the new fields are there and the paging works
call sites-read '{"action":"summary"}' | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("ok",d.ok,"sites",d.sites.length,"fields",Object.keys(d.sites[0]||{carePlan:1}).join(","))'

# 2. create a test site and read its id and code
call site-admin '{"action":"create_site","clientName":"TEST Sites screen","area":"Test","feeds":["box","email"],"carePlan":false,"jobRef":""}' > /tmp/test-site.json
node -e 'const d=require("/tmp/test-site.json");console.log("created",d.ok,d.site&&d.site.code,d.site&&d.site.status)'

# 3. issue a box key for it: show only that a key came back, never the key
ID=$(node -e 'console.log(require("/tmp/test-site.json").site.id)')
call site-admin "{\"action\":\"issue_box_key\",\"siteId\":\"$ID\"}" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("key issued",d.ok,"length",(d.key||"").length,"prefix",(d.key||"").slice(0,8))'

# 4. the screen's detail call sees the key date
call sites-read "{\"action\":\"detail\",\"siteId\":\"$ID\"}" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("detail",d.ok,"keyIssued",!!d.site.boxKeyIssuedAt)'
unset KEY
```

Expected, in order: `ok true sites <n> fields id,code,name,area,feeds,status,boxLastSeenAt,carePlan,jobRef,boxKeyIssuedAt,devices,incidents` (sites may be 1 or more), `created true VS-000N active`, `key issued true length 51 prefix vsk_box_`, `detail true keyIssued true`.

- [ ] **Step 4: Remove the test site**

Call `execute_sql` with `project_id` `cepernltrzrmupgegcib` and:

```sql
delete from access_keys where site_id in (select id from sites where client_name = 'TEST Sites screen');
delete from sites where client_name = 'TEST Sites screen';
select count(*) from sites where client_name = 'TEST Sites screen';
```

Expected: the last query returns `0`. Then `rm /tmp/test-site.json`.

If the delete fails on a foreign key, a device or event row was created for the test site. Delete from `events`, `device_state`, `devices` and `incidents` for that `site_id` first.

(No commit: nothing in the repo changed in this task.)

---

### Task 5: The `/api/sites` gateway

One Netlify function that checks who is asking and forwards to the monitoring functions.

**Files:**
- Create: `netlify/functions/sites.mjs`
- Modify: `_redirects`
- Create: `tests/sites-gateway.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/sites-gateway.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import handler, { planCall, canUseSites } from "../netlify/functions/sites.mjs";

const ME = { id: "u1", email: "abraham@verisko.com", role: "operations" };
const req = (body, method = "POST") => new Request("http://x/api/sites", { method, headers: { authorization: "Bearer t", "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });
const identity = (me, email = "abraham@verisko.com") => ({ authStore: {}, now: Date.now(), supabaseUser: async () => email });

function run(body, { me = ME, users, key = "vsk_api_x", fetchImpl } = {}) {
  const calls = [];
  const deps = {
    env: key ? { MONITOR_API_KEY: key } : {},
    data: { users: users || (me ? [me] : []) },
    identity: identity(me, me ? me.email : "stranger@example.com"),
    fetch: fetchImpl || (async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ ok: true, sites: [] }), { status: 200 }); }),
  };
  return handler(req(body), {}, deps).then((res) => ({ res, calls }));
}

test("each action maps to one monitoring function and the signed-in person is recorded", () => {
  assert.deepEqual(planCall({ action: "summary" }, "a@x"), { fn: "sites-read", payload: { action: "summary" } });
  assert.deepEqual(planCall({ action: "detail", siteId: "s1" }, "a@x"), { fn: "sites-read", payload: { action: "detail", siteId: "s1" } });
  assert.deepEqual(planCall({ action: "fix", incidentId: "i1", by: "someone-else" }, "a@x"), { fn: "incident-update", payload: { action: "fix", incidentId: "i1", by: "a@x" } });
  assert.equal(planCall({ action: "acknowledge", incidentId: "i1" }, "a@x").payload.by, "a@x");
  assert.equal(planCall({ action: "issue_box_key", siteId: "s1" }, "a@x").fn, "site-admin");
});

test("update_site forwards only the fields that were sent, and no stray ones", () => {
  const p = planCall({ action: "update_site", siteId: "s1", area: "Ntinda", status: "paused", apiKey: "nope", code: "VS-9999" }, "a@x");
  assert.deepEqual(p.payload, { action: "update_site", siteId: "s1", area: "Ntinda", status: "paused" });
});

test("an unknown action or a missing body is refused", () => {
  assert.equal(planCall({ action: "drop_tables" }, "a@x").error, "unknown_action");
  assert.equal(planCall(null, "a@x").error, "unknown_action");
});

test("only Operations and the Owner may use sites", () => {
  assert.equal(canUseSites([ME], ME), true);
  assert.equal(canUseSites([ME], { role: "admin" }), true);
  assert.equal(canUseSites([ME], { role: "sales" }), false);
  assert.equal(canUseSites([ME], { role: "teamlead" }), false);
  assert.equal(canUseSites([ME], null), false);
  assert.equal(canUseSites([], null), true, "an empty workspace is the Owner's");
});

test("Operations gets through and the call carries the api key to the right function", async () => {
  const { res, calls } = await run({ action: "summary" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/functions\/v1\/sites-read$/);
  assert.equal(calls[0].init.headers.authorization, "Bearer vsk_api_x");
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("a sales person is refused and nothing is forwarded", async () => {
  const sales = { id: "u2", email: "felix@verisko.com", role: "sales" };
  const { res, calls } = await run({ action: "summary" }, { me: sales });
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("someone not on the team is refused", async () => {
  const { res, calls } = await run({ action: "summary" }, { me: null, users: [ME] });
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test("without the monitoring key the screen is told it is not set up", async () => {
  const { res, calls } = await run({ action: "summary" }, { key: "" });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "not_configured");
  assert.equal(calls.length, 0);
});

test("only POST is accepted", async () => {
  const res = await handler(req(null, "GET"), {}, { env: { MONITOR_API_KEY: "k" }, data: { users: [ME] }, identity: identity(ME) });
  assert.equal(res.status, 405);
});

test("a monitoring error is passed on without leaking the key", async () => {
  const { res } = await run({ action: "detail", siteId: "nope" }, { fetchImpl: async () => new Response(JSON.stringify({ error: "no such site" }), { status: 404 }) });
  assert.equal(res.status, 404);
  const text = JSON.stringify(await res.json());
  assert.match(text, /no such site/);
  assert.ok(!text.includes("vsk_api_x"));
});

test("a monitoring outage becomes a 502, not a crash", async () => {
  const { res } = await run({ action: "summary" }, { fetchImpl: async () => new Response("<html>bad gateway</html>", { status: 500 }) });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).ok, false);
});

test("a network failure becomes a clean 500", async () => {
  const { res } = await run({ action: "summary" }, { fetchImpl: async () => { throw new Error("socket hang up"); } });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, "sites_error");
});

test("the redirect for /api/sites sits above the catch-all so the app does not swallow it", async () => {
  const { readFileSync } = await import("node:fs");
  const lines = readFileSync(new URL("../_redirects", import.meta.url), "utf8").split("\n");
  const sites = lines.findIndex((l) => l.startsWith("/api/sites "));
  const catchAll = lines.findIndex((l) => l.startsWith("/* "));
  assert.ok(sites >= 0 && sites < catchAll);
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/sites-gateway.test.js
```

Expected: fails with `ERR_MODULE_NOT_FOUND` for `netlify/functions/sites.mjs`.

- [ ] **Step 3: Write the gateway**

Create `netlify/functions/sites.mjs`:

```javascript
// Verisko Operations — Sites screen gateway.
//
// POST /api/sites { action, … }   (Operations and Owner only)
//   summary        {}                           -> every site with devices and open incidents
//   detail         { siteId }                   -> one site with its recent incidents and events
//   acknowledge    { incidentId }               -> "I'm on it"
//   fix            { incidentId }               -> marked fixed
//   create_site    { clientName, area, feeds, carePlan, jobRef }
//   update_site    { siteId, …fields }          -> edit, pause, resume or close
//   issue_box_key  { siteId }                   -> a new box key, shown once
//
// The browser never sees the monitoring key. This function checks who is asking,
// then forwards the request to the Supabase monitoring functions with MONITOR_API_KEY.
import { getStore } from "@netlify/blobs";
import { AUTH_STORE, identify, idOverdue } from "./pin-auth.mjs";
import { supabaseUser } from "./auth.mjs";

const DATA_STORE = "verisko-sales";
const DATA_KEY = "app-data";
const DEFAULT_BASE = "https://cepernltrzrmupgegcib.supabase.co/functions/v1";

const str = (v) => (typeof v === "string" ? v : "");

// Turns what the browser asked for into the one call to make, or says why not.
// `by` is the signed-in person, recorded on acknowledge and fix.
export function planCall(body, by) {
  const b = body && typeof body === "object" ? body : {};
  switch (b.action) {
    case "summary": return { fn: "sites-read", payload: { action: "summary" } };
    case "detail": return { fn: "sites-read", payload: { action: "detail", siteId: str(b.siteId) } };
    case "acknowledge":
    case "fix": return { fn: "incident-update", payload: { action: b.action, incidentId: str(b.incidentId), by } };
    case "create_site": return { fn: "site-admin", payload: { action: "create_site", clientName: b.clientName, area: b.area, feeds: b.feeds, carePlan: b.carePlan, jobRef: b.jobRef } };
    case "update_site": {
      const payload = { action: "update_site", siteId: str(b.siteId) };
      for (const k of ["clientName", "area", "feeds", "carePlan", "jobRef", "status"]) if (k in b) payload[k] = b[k];
      return { fn: "site-admin", payload };
    }
    case "issue_box_key": return { fn: "site-admin", payload: { action: "issue_box_key", siteId: str(b.siteId) } };
    default: return { error: "unknown_action", status: 400 };
  }
}

// Only Operations and the Owner may use the Sites screen (an empty workspace counts as the Owner).
export function canUseSites(users, me) {
  return users.length === 0 || (!!me && (me.role === "admin" || me.role === "operations"));
}

export default async (request, context, deps = {}) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const send = (b, s) => new Response(JSON.stringify(b), { status: s, headers });
  try {
    if (request.method !== "POST") return send({ ok: false, error: "method_not_allowed" }, 405);
    const env = deps.env || process.env;
    const doFetch = deps.fetch || fetch;
    const data = deps.data || (await getStore(DATA_STORE).get(DATA_KEY, { type: "json" })) || { users: [] };
    const users = Array.isArray(data.users) ? data.users : [];
    const who = await identify(request, data, deps.identity || { authStore: getStore(AUTH_STORE), now: Date.now(), supabaseUser });
    if (who.error) return send({ ok: false, error: who.error }, who.status || 401);
    if (!who.me && users.length > 0) return send({ ok: false, error: "not_authorized" }, 401);
    if (idOverdue(who.me, Date.now())) return send({ ok: false, error: "not_authorized" }, 401);
    if (!canUseSites(users, who.me)) return send({ ok: false, error: "not_authorized" }, 403);

    const key = env.MONITOR_API_KEY;
    if (!key) return send({ ok: false, error: "not_configured" }, 503);
    const body = await request.json().catch(() => null);
    const plan = planCall(body, who.email);
    if (plan.error) return send({ ok: false, error: plan.error }, plan.status);

    const base = String(env.MONITOR_URL || DEFAULT_BASE).replace(/\/+$/, "");
    const res = await doFetch(`${base}/${plan.fn}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(plan.payload),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return send({ ok: false, error: str(out.error) || "monitoring_error" }, res.status === 404 || res.status === 400 ? res.status : 502);
    return send({ ...out, ok: true }, 200);
  } catch (e) {
    console.error(e);
    return send({ ok: false, error: "sites_error" }, 500);
  }
};
```

- [ ] **Step 4: Route it**

In `_redirects`, add this line directly under the `/api/auth` line and above the `/monitoring/*` line (the catch-all at the bottom would otherwise swallow it):

```
/api/sites /.netlify/functions/sites 200
```

The file should now read:

```
/api/data /.netlify/functions/data 200
/api/receipt /.netlify/functions/receipt 200
/api/export /.netlify/functions/export 200
/api/auth /.netlify/functions/auth 200
/api/sites /.netlify/functions/sites 200
/monitoring/* /index.html 200!
/docs/* /index.html 200!
/tests/* /index.html 200!
/netlify/* /index.html 200!
/* /index.html 200
```

- [ ] **Step 5: Run the tests and see them pass**

```bash
node --test tests/sites-gateway.test.js
npm test
```

Expected: 13 gateway tests pass. `npm test`: 261 pass, 0 fail.

- [ ] **Step 6: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/netlify/functions/sites.mjs sales-app/_redirects sales-app/tests/sites-gateway.test.js
git commit -m "sales-app: /api/sites gateway for Operations and the Owner

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
cd sales-app
```

- [ ] **Step 7: Confirm the route answers**

Wait about a minute for Netlify to deploy, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://verisko-sales-2026.netlify.app/api/sites
```

Expected: `401` (signed-out callers are refused). A `200` with HTML means the redirect line is missing or below the catch-all.

---

### Task 6: What the screen shows (`site-health.js`)

Pure functions: status, ordering, wording and HTML. No network, no page.

**Files:**
- Create: `site-health.js`
- Create: `tests/site-health.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/site-health.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import "../site-health.js";

const H = globalThis.VeriskoSiteHealth;
const NOW = Date.parse("2026-10-12T12:00:00Z");
const site = (over = {}) => ({ id: "s1", code: "VS-0001", name: "Mukasa Pharmacy", area: "Ntinda", feeds: ["box"], status: "active", boxLastSeenAt: "2026-10-12T11:58:00Z", carePlan: false, jobRef: null, boxKeyIssuedAt: null, devices: [], incidents: [], ...over });
const inc = (over = {}) => ({ id: "i1", deviceId: null, kind: "camera_offline", state: "open", openedAt: "2026-10-12T10:00:00Z", acknowledgedBy: null, acknowledgedAt: null, fixedAt: null, fixedReason: null, ...over });

test("a healthy site is green, a fresh box site with no report is waiting", () => {
  assert.equal(H.siteStatus(site()).key, "green");
  assert.equal(H.siteStatus(site({ boxLastSeenAt: null })).key, "waiting");
  assert.equal(H.siteStatus(site({ feeds: ["email"], boxLastSeenAt: null })).key, "green", "an email-only site never waits for a box");
});

test("an open problem is red, an acknowledged one is amber, a fixed one counts for nothing", () => {
  assert.equal(H.siteStatus(site({ incidents: [inc()] })).key, "red");
  assert.equal(H.siteStatus(site({ incidents: [inc({ state: "acknowledged" })] })).key, "amber");
  assert.equal(H.siteStatus(site({ incidents: [inc({ state: "fixed" })] })).key, "green");
  assert.equal(H.siteStatus(site({ incidents: [inc({ state: "acknowledged" }), inc({ id: "i2" })] })).key, "red", "any unclaimed problem keeps it red");
});

test("paused and closed sites are grey whatever their incidents say", () => {
  assert.equal(H.siteStatus(site({ status: "paused", incidents: [inc()] })).label, "Paused");
  assert.equal(H.siteStatus(site({ status: "closed" })).label, "Closed");
  assert.equal(H.siteStatus(site({ status: "paused" })).tone, "grey");
});

test("sites list worst first, then by code in natural order", () => {
  const list = [
    site({ id: "a", code: "VS-0010" }), site({ id: "b", code: "VS-0002" }),
    site({ id: "c", code: "VS-0003", incidents: [inc()] }), site({ id: "d", code: "VS-0004", status: "paused" }),
    site({ id: "e", code: "VS-0005", incidents: [inc({ state: "acknowledged" })] }), site({ id: "f", code: "VS-0006", boxLastSeenAt: null }),
  ];
  assert.deepEqual(H.sortSites(list).map((s) => s.id), ["c", "e", "f", "b", "a", "d"]);
  assert.deepEqual(list.map((s) => s.id), ["a", "b", "c", "d", "e", "f"], "the input is not reordered");
});

test("counts add up by status", () => {
  const c = H.countSites([site(), site({ incidents: [inc()] }), site({ status: "paused" }), site({ boxLastSeenAt: null })]);
  assert.deepEqual([c.green, c.red, c.paused, c.waiting, c.total], [1, 1, 1, 1, 4]);
});

test("times read as short plain phrases", () => {
  assert.equal(H.agoText(null, NOW), "never");
  assert.equal(H.agoText("2026-10-12T11:59:50Z", NOW), "just now");
  assert.equal(H.agoText("2026-10-12T11:15:00Z", NOW), "45 min ago");
  assert.equal(H.agoText("2026-10-12T07:00:00Z", NOW), "5 h ago");
  assert.equal(H.agoText("2026-10-08T12:00:00Z", NOW), "4 days ago");
});

test("a card names the problem camera and escapes what clients typed", () => {
  const html = H.siteCardHtml(site({ name: '<img src=x onerror=alert(1)>', devices: [{ id: "d1", label: "Camera 3", kind: "camera" }], incidents: [inc({ deviceId: "d1" })] }), NOW);
  assert.ok(html.includes("Camera 3 offline since 2 h ago"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes('data-site-open="s1"'));
});

test("the list filters by code, name or area and says so when nothing matches", () => {
  const data = { sites: [site(), site({ id: "s2", code: "VS-0002", name: "Kato Supermarket", area: "Kololo" })], unknown: [] };
  const html = H.listHtml(data, NOW, "kolo");
  assert.ok(html.includes("Kato Supermarket") && !html.includes("Mukasa Pharmacy"));
  assert.ok(H.listHtml(data, NOW, "zzz").includes("No sites match."));
});

test("unreadable reports are listed and escaped, and the block disappears when there are none", () => {
  const data = { sites: [], unknown: [{ id: "1", receivedAt: "2026-10-12T08:00:00Z", siteCode: "VS-0001", subject: "<b>hi</b>", excerpt: "" }] };
  const html = H.listHtml(data, NOW, "");
  assert.ok(html.includes("Reports we could not read") && !html.includes("<b>hi</b>"));
  assert.ok(!H.listHtml({ sites: [], unknown: [] }, NOW, "").includes("could not read"));
});

test("the detail sheet offers the right buttons for each problem and site state", () => {
  const detail = { site: site({ boxKeyIssuedAt: "2026-10-10T08:00:00Z" }), devices: [{ id: "d1", kind: "camera", label: "Camera 3", state: "down", since: "2026-10-12T10:00:00Z" }], incidents: [inc({ deviceId: "d1" }), inc({ id: "i2", state: "acknowledged", acknowledgedBy: "abraham@verisko.com", acknowledgedAt: "2026-10-12T10:30:00Z" }), inc({ id: "i3", state: "fixed", fixedAt: "2026-10-11T10:30:00Z", fixedReason: "recovered" })], events: [] };
  const html = H.detailHtml(detail, NOW);
  assert.ok(html.includes('data-incident-ack="i1"') && html.includes('data-incident-fix="i1"'));
  assert.ok(!html.includes('data-incident-ack="i2"'), "an acknowledged problem cannot be acknowledged again");
  assert.ok(html.includes('data-incident-fix="i2"'));
  assert.ok(!html.includes('data-incident-fix="i3"'), "a fixed problem has no buttons");
  assert.ok(html.includes("Replace box key") && html.includes('data-to="paused"') && html.includes("Pause"));
  const paused = H.detailHtml({ ...detail, site: site({ status: "paused" }) }, NOW);
  assert.ok(paused.includes('data-to="active"') && paused.includes("Resume"));
  assert.ok(!H.detailHtml({ ...detail, site: site({ status: "closed" }) }, NOW).includes("data-site-status"));
  assert.ok(!H.detailHtml({ ...detail, site: site({ feeds: ["email"]  }) }, NOW).includes("data-site-key"), "email-only sites have no box key");
});

test("the add-site form starts with the box ticked and lists the jobs to link", () => {
  const html = H.siteFormHtml(null, [{ ref: "J-2026-0007", client: "Kato" }]);
  assert.ok(html.includes("Add site") && html.includes('id="siteFeedBox" checked') && !html.includes('id="siteFeedEmail" checked'));
  assert.ok(html.includes("J-2026-0007 · Kato"));
  const edit = H.siteFormHtml(site({ jobRef: "J-2026-0007", feeds: ["box", "email"], carePlan: true }), [{ ref: "J-2026-0007" }]);
  assert.ok(edit.includes("Edit site") && edit.includes("selected") && edit.includes('id="siteCare" checked'));
});

test("form values become the fields the server wants, and bad ones are caught", () => {
  const f = H.formFields({ name: " Kato ", area: " Kololo ", feedBox: true, feedEmail: true, carePlan: 1, jobRef: "J-1" });
  assert.deepEqual(f, { clientName: "Kato", area: "Kololo", feeds: ["box", "email"], carePlan: true, jobRef: "J-1" });
  assert.match(H.formProblem(H.formFields({ name: "", feedBox: true })), /client name/);
  assert.match(H.formProblem(H.formFields({ name: "x" })), /how the site reports/);
  assert.equal(H.formProblem(f), "");
});

test("the key sheet shows the key once with a warning, escaped", () => {
  const html = H.keyHtml({ siteCode: "VS-0001", key: "vsk_box_abc" });
  assert.ok(html.includes("vsk_box_abc") && html.includes("shown once") && html.includes("siteKeyCopy"));
});

test("a card says how the site reports, and warns when an email-only site cannot show an outage", () => {
  assert.ok(H.siteCardHtml(site({ feeds: ["box", "email"] }), NOW).includes("Site box and Recorder email"));
  const emailOnly = H.siteCardHtml(site({ feeds: ["email"], boxLastSeenAt: null }), NOW);
  assert.ok(emailOnly.includes("Recorder email (cannot detect outages)"));
  assert.ok(!emailOnly.includes('<span class="k">Box</span>'));
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/site-health.test.js
```

Expected: fails at import (`../site-health.js` not found).

- [ ] **Step 3: Write the module**

Create `site-health.js`:

```javascript
// Verisko Operations — what the Sites screen shows, as plain functions.
//
// Takes the answers from /api/sites (see monitoring/supabase/functions/_shared/summary.mjs)
// and works out each site's status, the order to list them in, and the HTML for the cards,
// the site sheet and the forms. No network and no page access here, so node can test it all.
(function (root) {
  "use strict";

  var KIND = {
    camera_offline: "Camera offline", recorder_offline: "Recorder offline", disk_full: "Recorder disk full",
    disk_error: "Recorder disk error", site_silent: "No report from the site box", ip_conflict: "Recorder address conflict",
  };
  var RANK = { red: 0, amber: 1, waiting: 2, green: 3, paused: 4, closed: 5 };
  var TONE = { red: "red", amber: "amber", waiting: "grey", green: "green", paused: "grey", closed: "grey" };
  var GLYPH = { red: "!", amber: "◔", waiting: "◷", green: "✓", paused: "⏸", closed: "✕" };

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function chip(label, tone, glyph) {
    return '<span class="chip ' + tone + '"><span class="g" aria-hidden="true">' + glyph + "</span>" + esc(label) + "</span>";
  }
  function kindLabel(kind) { return KIND[kind] || String(kind || "Problem").replace(/_/g, " "); }
  function hasBox(site) { return (site.feeds || []).indexOf("box") !== -1; }
  function liveIncidents(site) { return (site.incidents || []).filter(function (i) { return i.state !== "fixed"; }); }

  // red: something is wrong and nobody has taken it. amber: someone is on it.
  function siteStatus(site) {
    var key, label;
    var live = liveIncidents(site);
    if (site.status === "closed") { key = "closed"; label = "Closed"; }
    else if (site.status === "paused") { key = "paused"; label = "Paused"; }
    else if (live.some(function (i) { return i.state === "open"; })) { key = "red"; label = "Needs attention"; }
    else if (live.length) { key = "amber"; label = "Someone is on it"; }
    else if (hasBox(site) && !site.boxLastSeenAt) { key = "waiting"; label = "Waiting for first report"; }
    else { key = "green"; label = "All good"; }
    return { key: key, tone: TONE[key], label: label, glyph: GLYPH[key], rank: RANK[key] };
  }

  function sortSites(sites) {
    return sites.slice().sort(function (a, b) {
      return (siteStatus(a).rank - siteStatus(b).rank) || String(a.code).localeCompare(String(b.code), "en", { numeric: true });
    });
  }

  function countSites(sites) {
    var c = { red: 0, amber: 0, waiting: 0, green: 0, paused: 0, closed: 0, total: sites.length };
    sites.forEach(function (s) { c[siteStatus(s).key] += 1; });
    return c;
  }

  function agoText(iso, nowMs) {
    var t = Date.parse(iso || "");
    if (!t) return "never";
    var m = Math.max(0, Math.round((nowMs - t) / 60000));
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 48) return h + " h ago";
    return Math.round(h / 24) + " days ago";
  }

  function when(iso) {
    var t = Date.parse(iso || "");
    if (!t) return "";
    return new Date(t).toLocaleString("en-GB", { timeZone: "Africa/Kampala", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function deviceName(devices, id) {
    var d = (devices || []).filter(function (x) { return x.id === id; })[0];
    return d ? d.label : "";
  }

  function incidentTitle(inc, devices) {
    var base = kindLabel(inc.kind);
    var name = inc.deviceId && (inc.kind === "camera_offline") ? deviceName(devices, inc.deviceId) : "";
    return name ? name + " offline" : base;
  }

  /* --------------------------------- cards ---------------------------------- */
  function summaryBarHtml(counts) {
    function cell(n, label, tone) { return '<div class="sites-count ' + tone + '"><strong>' + n + "</strong><span>" + esc(label) + "</span></div>"; }
    return '<div class="sites-counts">' + cell(counts.red, "Need attention", "red") + cell(counts.amber, "Being handled", "amber") +
      cell(counts.green, "All good", "green") + cell(counts.waiting + counts.paused, "Waiting or paused", "grey") + "</div>";
  }

  function siteCardHtml(site, nowMs) {
    var st = siteStatus(site);
    var lines = "";
    if (site.area) lines += '<div class="item-line"><span class="k">Area</span><span class="v">' + esc(site.area) + "</span></div>";
    lines += '<div class="item-line"><span class="k">Reports by</span><span class="v">' + (site.feeds || []).map(function (f) { return f === "box" ? "Site box" : "Recorder email"; }).join(" and ") +
      (hasBox(site) ? "" : " (cannot detect outages)") + "</span></div>";
    if (hasBox(site)) lines += '<div class="item-line"><span class="k">Box</span><span class="v">' + (site.boxLastSeenAt ? "reported " + esc(agoText(site.boxLastSeenAt, nowMs)) : "no report yet") + "</span></div>";
    liveIncidents(site).slice(0, 3).forEach(function (i) {
      lines += '<div class="item-line"><span class="k">' + (i.state === "open" ? "Problem" : "On it") + '</span><span class="v">' +
        esc(incidentTitle(i, site.devices)) + " since " + esc(agoText(i.openedAt, nowMs)) + "</span></div>";
    });
    return '<article class="item site-card is-' + st.key + '" data-site-open="' + esc(site.id) + '" tabindex="0" role="button" aria-label="' + esc(site.code + " " + site.name + ", " + st.label) + '">' +
      '<div class="item-top"><div><strong>' + esc(site.name) + '</strong><div class="muted">' + esc(site.code) + "</div></div>" + chip(st.label, st.tone, st.glyph) + "</div>" + lines + "</article>";
  }

  function unknownHtml(unknown) {
    if (!unknown || !unknown.length) return "";
    return '<section class="card card-pad"><h3>Reports we could not read</h3><p class="muted">Emails that did not match a site or a known pattern. The newest 20.</p>' +
      unknown.map(function (u) {
        return '<div class="item-line"><span class="k">' + esc(when(u.receivedAt)) + '</span><span class="v">' + esc(u.siteCode || "no site code") + " · " + esc(u.subject || "no subject") + "</span></div>";
      }).join("") + "</section>";
  }

  function listHtml(data, nowMs, filter) {
    var sites = sortSites(data.sites || []);
    var f = String(filter || "").trim().toLowerCase();
    var shown = f ? sites.filter(function (s) { return (s.code + " " + s.name + " " + s.area).toLowerCase().indexOf(f) !== -1; }) : sites;
    return summaryBarHtml(countSites(data.sites || [])) +
      '<div class="toolbar"><input type="search" id="sitesSearch" placeholder="Search sites" value="' + esc(filter || "") + '" aria-label="Search sites"></div>' +
      '<div class="list">' + (shown.length ? shown.map(function (s) { return siteCardHtml(s, nowMs); }).join("") : '<p class="result-note">No sites match.</p>') + "</div>" +
      unknownHtml(data.unknown);
  }

  /* -------------------------------- detail ---------------------------------- */
  function incidentRowHtml(inc, devices, nowMs) {
    var live = inc.state !== "fixed";
    var who = inc.state === "acknowledged" ? "Acknowledged by " + esc(inc.acknowledgedBy || "someone") + " " + esc(agoText(inc.acknowledgedAt, nowMs)) :
      inc.state === "fixed" ? "Fixed " + esc(agoText(inc.fixedAt, nowMs)) + (inc.fixedReason ? " (" + esc(inc.fixedReason) + ")" : "") : "Not yet acknowledged";
    var buttons = live ? '<div class="ask-actions">' +
      (inc.state === "open" ? '<button type="button" class="btn btn-ghost" data-incident-ack="' + esc(inc.id) + '">I am on it</button>' : "") +
      '<button type="button" class="btn btn-primary" data-incident-fix="' + esc(inc.id) + '">Mark fixed</button></div>' : "";
    return '<div class="item"><div class="item-top"><strong>' + esc(incidentTitle(inc, devices)) + "</strong>" +
      chip(inc.state === "open" ? "Open" : inc.state === "acknowledged" ? "Acknowledged" : "Fixed", inc.state === "open" ? "red" : inc.state === "acknowledged" ? "amber" : "green", inc.state === "fixed" ? "✓" : "!") + "</div>" +
      '<div class="item-line"><span class="k">Since</span><span class="v">' + esc(when(inc.openedAt)) + "</span></div>" +
      '<div class="item-line"><span class="k">Status</span><span class="v">' + who + "</span></div>" + buttons + "</div>";
  }

  function detailHtml(detail, nowMs) {
    var site = detail.site, st = siteStatus({ status: site.status, feeds: site.feeds, boxLastSeenAt: site.boxLastSeenAt, incidents: detail.incidents });
    var devices = detail.devices.length ? detail.devices.map(function (d) {
      var tone = d.state === "ok" ? "green" : d.state === "down" ? "red" : "grey";
      return '<div class="item-line"><span class="k">' + esc(d.label) + '</span><span class="v">' + chip(d.state === "ok" ? "OK" : d.state === "down" ? "Down" : "Unknown", tone, d.state === "ok" ? "✓" : d.state === "down" ? "!" : "•") + " " + esc(d.since ? agoText(d.since, nowMs) : "") + "</span></div>";
    }).join("") : '<p class="muted">No devices reported yet.</p>';
    var incidents = detail.incidents.length ? detail.incidents.slice(0, 10).map(function (i) { return incidentRowHtml(i, detail.devices, nowMs); }).join("") : '<p class="muted">No problems recorded.</p>';
    var events = detail.events.slice(0, 10).map(function (e) {
      return '<div class="item-line"><span class="k">' + esc(when(e.receivedAt)) + '</span><span class="v">' + esc(e.source) + " · " + esc(e.kind) + "</span></div>";
    }).join("") || '<p class="muted">Nothing received yet.</p>';
    var box = hasBox(site) ? '<button type="button" class="btn btn-ghost" data-site-key="' + esc(site.id) + '">' + (site.boxKeyIssuedAt ? "Replace box key" : "Issue box key") + "</button>" : "";
    var keyNote = hasBox(site) ? '<div class="item-line"><span class="k">Box key</span><span class="v">' + (site.boxKeyIssuedAt ? "issued " + esc(when(site.boxKeyIssuedAt)) : "not issued") + "</span></div>" : "";
    return '<div class="ask-head"><h2 id="askTitle">' + esc(site.name) + "</h2>" +
      '<p class="ask-body">' + esc(site.code) + (site.area ? " · " + esc(site.area) : "") + " " + chip(st.label, st.tone, st.glyph) + "</p></div>" +
      '<div class="sites-detail">' + keyNote + (site.jobRef ? '<div class="item-line"><span class="k">Job</span><span class="v">' + esc(site.jobRef) + "</span></div>" : "") +
      '<div class="item-line"><span class="k">Care plan</span><span class="v">' + (site.carePlan ? "Yes" : "No") + "</span></div>" +
      "<h3>Devices</h3>" + devices + "<h3>Problems</h3>" + incidents + "<h3>Recent reports</h3>" + events + "</div>" +
      '<div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">Close</button>' +
      '<button type="button" class="btn btn-ghost" data-site-edit="' + esc(site.id) + '">Edit</button>' + box +
      (site.status === "closed" ? "" : '<button type="button" class="btn btn-ghost" data-site-status="' + esc(site.id) + '" data-to="' + (site.status === "paused" ? "active" : "paused") + '">' + (site.status === "paused" ? "Resume" : "Pause") + "</button>") + "</div>";
  }

  /* ---------------------------------- forms --------------------------------- */
  function siteFormHtml(site, jobs) {
    var s = site || { clientName: "", name: "", area: "", feeds: ["box"], carePlan: false, jobRef: "" };
    var name = s.name || s.clientName || "";
    var options = '<option value="">No job linked</option>' + (jobs || []).map(function (j) {
      var ref = j.ref || j.id;
      return '<option value="' + esc(ref) + '"' + (s.jobRef === ref ? " selected" : "") + ">" + esc(ref + (j.client ? " · " + j.client : "")) + "</option>";
    }).join("");
    return '<div class="ask-head"><h2 id="askTitle">' + (site ? "Edit site" : "Add site") + "</h2></div>" +
      '<div class="sites-form"><label>Client name<input id="siteName" maxlength="120" value="' + esc(name) + '"></label>' +
      '<label>Area<input id="siteArea" maxlength="80" value="' + esc(s.area || "") + '"></label>' +
      '<fieldset><legend>How does it report?</legend>' +
      '<label class="check"><input type="checkbox" id="siteFeedBox"' + ((s.feeds || []).indexOf("box") !== -1 ? " checked" : "") + '> Site box</label>' +
      '<label class="check"><input type="checkbox" id="siteFeedEmail"' + ((s.feeds || []).indexOf("email") !== -1 ? " checked" : "") + '> Recorder email</label></fieldset>' +
      '<label class="check"><input type="checkbox" id="siteCare"' + (s.carePlan ? " checked" : "") + '> On a care plan</label>' +
      '<label>Linked job<select id="siteJob">' + options + "</select></label>" +
      '<p class="result-note" id="siteFormNote" role="alert"></p></div>' +
      '<div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">Cancel</button>' +
      '<button type="button" class="btn btn-primary" id="siteSave">' + (site ? "Save" : "Add site") + "</button></div>";
  }

  // The fields a saved form sends. `read` returns the form's values by name.
  function formFields(read) {
    var feeds = [];
    if (read.feedBox) feeds.push("box");
    if (read.feedEmail) feeds.push("email");
    return { clientName: String(read.name || "").trim(), area: String(read.area || "").trim(), feeds: feeds, carePlan: !!read.carePlan, jobRef: String(read.jobRef || "") };
  }
  function formProblem(f) {
    if (!f.clientName) return "Enter the client name.";
    if (!f.feeds.length) return "Choose how the site reports.";
    return "";
  }

  function keyHtml(result) {
    return '<div class="ask-head"><h2 id="askTitle">Box key for ' + esc(result.siteCode) + '</h2><p class="ask-body">Copy this now. It is shown once and cannot be looked up later. Any older key for this site has stopped working.</p></div>' +
      '<div class="sites-key"><code id="siteKeyText">' + esc(result.key) + "</code></div>" +
      '<div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">Done</button><button type="button" class="btn btn-primary" id="siteKeyCopy">Copy key</button></div>';
  }

  var api = {
    esc: esc, kindLabel: kindLabel, siteStatus: siteStatus, sortSites: sortSites, countSites: countSites, agoText: agoText,
    listHtml: listHtml, siteCardHtml: siteCardHtml, detailHtml: detailHtml, siteFormHtml: siteFormHtml,
    formFields: formFields, formProblem: formProblem, keyHtml: keyHtml, incidentTitle: incidentTitle,
  };
  root.VeriskoSiteHealth = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 4: Run the tests and see them pass**

```bash
node --test tests/site-health.test.js
npm test
```

Expected: 14 tests pass. `npm test`: 275 pass, 0 fail.

- [ ] **Step 5: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/site-health.js sales-app/tests/site-health.test.js
git commit -m "sales-app: site-health.js decides how each site looks on the Sites screen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
cd sales-app
```

---

### Task 7: How the screen behaves (`sites-screen.js`)

Loads the list, refreshes it, opens the site sheet, runs the buttons.

**Files:**
- Create: `sites-screen.js`
- Create: `tests/sites-screen.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/sites-screen.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import "../site-health.js";
import "../sites-screen.js";

const SITE = { id: "s1", code: "VS-0001", name: "Mukasa Pharmacy", area: "Ntinda", feeds: ["box"], status: "active", boxLastSeenAt: new Date().toISOString(), carePlan: false, jobRef: null, boxKeyIssuedAt: null, devices: [], incidents: [] };
const INCIDENT = { id: "i1", siteId: "s1", deviceId: null, kind: "camera_offline", state: "open", openedAt: "2026-10-12T10:00:00Z" };

function setup(responder) {
  const calls = [], toasts = [], store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  globalThis.document = { hidden: false };
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, auth: init.headers.Authorization });
    const r = responder(body);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body), { status: r.status || 200 });
  };
  const closeHandlers = [];
  const dialog = {
    open: false, innerHTML: "", classList: { add() {}, remove() {} }, onclick: null,
    showModal() { this.open = true; }, close() { this.open = false; closeHandlers.splice(0).forEach((f) => f()); },
    addEventListener(name, fn) { if (name === "close") closeHandlers.push(fn); },
    querySelector: () => null,
  };
  const content = { innerHTML: "", insertAdjacentHTML(_, h) { this.innerHTML = h + this.innerHTML; }, querySelector: () => null };
  const screen = globalThis.VeriskoSitesScreen.create({
    content, dialog, getToken: async () => "tok123", getJobs: () => [], toast: (m) => toasts.push(m), confirm: async () => true,
  });
  return { screen, calls, toasts, content, dialog, store };
}
const click = (selector, attr) => ({ target: { closest: (s) => (s === selector ? { getAttribute: () => attr } : null) } });
const tick = () => new Promise((r) => setTimeout(r, 0));

test("opening the screen loads the summary with the user's token and draws the sites", async () => {
  const t = setup(() => ({ body: { ok: true, sites: [SITE], unknown: [] } }));
  t.screen.show(); await tick(); t.screen.stop();
  assert.deepEqual(t.calls[0].body, { action: "summary" });
  assert.equal(t.calls[0].url, "/api/sites");
  assert.equal(t.calls[0].auth, "Bearer tok123");
  assert.ok(t.content.innerHTML.includes("Mukasa Pharmacy"));
  assert.ok(t.store.verisko_sites_cache_v1.includes("VS-0001"), "the list is kept for the next visit");
});

test("when monitoring is not switched on the screen says so in plain words", async () => {
  const t = setup(() => ({ status: 503, body: { ok: false, error: "not_configured" } }));
  t.screen.show(); await tick(); t.screen.stop();
  assert.match(t.content.innerHTML, /not switched on yet/);
});

test("offline, the last list stays on screen with a note", async () => {
  let offline = false;
  const t = setup(() => (offline ? new Error("offline") : { body: { ok: true, sites: [SITE], unknown: [] } }));
  t.screen.show(); await tick();
  offline = true;
  await t.screen.refresh();
  t.screen.stop();
  assert.ok(t.content.innerHTML.includes("Mukasa Pharmacy"));
  assert.match(t.content.innerHTML, /You are offline/);
});

test("a second visit shows the saved list straight away, before the network answers", async () => {
  const first = setup(() => ({ body: { ok: true, sites: [SITE], unknown: [] } }));
  first.screen.show(); await tick(); first.screen.stop();
  const saved = first.store.verisko_sites_cache_v1;
  const second = setup(() => new Error("offline"));
  second.store.verisko_sites_cache_v1 = saved;
  const again = globalThis.VeriskoSitesScreen.create({ content: second.content, dialog: second.dialog, getToken: async () => "t", getJobs: () => [], toast() {}, confirm: async () => true });
  again.show(); again.stop();
  assert.ok(second.content.innerHTML.includes("Mukasa Pharmacy"));
});

test("tapping a site opens its sheet with the detail", async () => {
  const t = setup((b) => (b.action === "detail" ? { body: { ok: true, site: SITE, devices: [], incidents: [INCIDENT], events: [] } } : { body: { ok: true, sites: [SITE], unknown: [] } }));
  t.screen.show(); await tick();
  assert.equal(t.screen.onClick(click("[data-site-open]", "s1")), true);
  await tick(); await tick();
  t.screen.stop();
  assert.ok(t.calls.some((c) => c.body.action === "detail" && c.body.siteId === "s1"));
  assert.ok(t.dialog.open);
  assert.ok(t.dialog.innerHTML.includes("data-incident-ack"));
});

test("acknowledging sends the incident id, says so, and reloads the sheet", async () => {
  const t = setup((b) => (b.action === "detail" ? { body: { ok: true, site: SITE, devices: [], incidents: [INCIDENT], events: [] } } : { body: { ok: true, sites: [SITE], unknown: [] } }));
  t.screen.show(); await tick();
  t.screen.onClick(click("[data-site-open]", "s1")); await tick(); await tick();
  const before = t.calls.length;
  await t.dialog.onclick(click("[data-incident-ack]", "i1"));
  t.screen.stop();
  const ack = t.calls.slice(before).find((c) => c.body.action === "acknowledge");
  assert.deepEqual(ack.body, { action: "acknowledge", incidentId: "i1" });
  assert.ok(t.toasts.includes("Acknowledged"));
  assert.ok(t.calls.slice(before).some((c) => c.body.action === "detail"), "the sheet is reloaded");
});

test("a failed action tells the person instead of pretending it worked", async () => {
  const t = setup((b) => (b.action === "fix" ? { status: 502, body: { ok: false, error: "monitoring_error" } } : b.action === "detail" ? { body: { ok: true, site: SITE, devices: [], incidents: [INCIDENT], events: [] } } : { body: { ok: true, sites: [SITE], unknown: [] } }));
  t.screen.show(); await tick();
  t.screen.onClick(click("[data-site-open]", "s1")); await tick(); await tick();
  await t.dialog.onclick(click("[data-incident-fix]", "i1"));
  t.screen.stop();
  assert.ok(t.toasts.some((m) => /Could not reach site monitoring/.test(m)));
  assert.ok(!t.toasts.includes("Marked fixed"));
});

test("issuing a key shows it once and clears it from the page when the sheet closes", async () => {
  const t = setup((b) => (b.action === "issue_box_key" ? { body: { ok: true, key: "vsk_box_SECRET", siteCode: "VS-0001" } } : b.action === "detail" ? { body: { ok: true, site: SITE, devices: [], incidents: [], events: [] } } : { body: { ok: true, sites: [SITE], unknown: [] } }));
  t.screen.show(); await tick();
  t.screen.onClick(click("[data-site-open]", "s1")); await tick(); await tick();
  await t.dialog.onclick(click("[data-site-key]", "s1"));
  assert.ok(t.dialog.innerHTML.includes("vsk_box_SECRET"));
  t.dialog.close();
  t.screen.stop();
  assert.equal(t.dialog.innerHTML, "");
  assert.ok(!t.content.innerHTML.includes("vsk_box_SECRET"));
  assert.ok(!JSON.stringify(t.store).includes("vsk_box_SECRET"), "the key is never saved in the browser");
});

test("replacing an existing key asks first, and cancelling issues nothing", async () => {
  const issued = { ...SITE, boxKeyIssuedAt: "2026-10-10T08:00:00Z" };
  const t = setup((b) => (b.action === "detail" ? { body: { ok: true, site: issued, devices: [], incidents: [], events: [] } } : { body: { ok: true, sites: [issued], unknown: [] } }));
  const asked = [];
  const screen = globalThis.VeriskoSitesScreen.create({ content: t.content, dialog: t.dialog, getToken: async () => "t", getJobs: () => [], toast() {}, confirm: async (o) => { asked.push(o); return false; } });
  screen.show(); await tick();
  screen.onClick(click("[data-site-open]", "s1")); await tick(); await tick();
  await t.dialog.onclick(click("[data-site-key]", "s1"));
  screen.stop();
  assert.equal(asked.length, 1);
  assert.ok(!t.calls.some((c) => c.body.action === "issue_box_key"));
});

test("clicks that are not for this screen are left alone", () => {
  const t = setup(() => ({ body: {} }));
  assert.equal(t.screen.onClick({ target: { closest: () => null } }), false);
  assert.equal(t.screen.onInput({ target: { id: "search" } }), false);
  assert.equal(t.screen.onKey({ key: "Tab", target: {} }), false);
});

test("problem texts cover each failure", () => {
  const p = globalThis.VeriskoSitesScreen.problemText;
  assert.match(p(0, ""), /offline/);
  assert.match(p(401, ""), /sign-in has expired/);
  assert.match(p(403, ""), /Only Operations/);
  assert.match(p(503, "not_configured"), /monitoring key/);
  assert.match(p(502, ""), /Could not reach/);
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/sites-screen.test.js
```

Expected: fails at import (`../sites-screen.js` not found).

- [ ] **Step 3: Write the module**

Create `sites-screen.js`:

```javascript
// Verisko Operations — the Sites screen: loads /api/sites, draws it, and runs its buttons.
// The look of everything comes from site-health.js; this file only talks to the network and the page.
//
//   var screen = VeriskoSitesScreen.create({ content, dialog, getToken, getJobs, getUserEmail, toast, setBusy? });
//   screen.show()   when the Sites view opens (starts the 60 second refresh)
//   screen.stop()   when another view opens
//   screen.onClick(event) / screen.onInput(event) / screen.onKey(event)   return true when they handled it
//   screen.addSite()   the page's "Add site" button
(function (root) {
  "use strict";

  var CACHE_KEY = "verisko_sites_cache_v1";
  var REFRESH_MS = 60000;

  function problemText(status, code) {
    if (status === 0) return "You are offline. Showing the last list.";
    if (status === 401 || code === "session_expired" || code === "not_signed_in") return "Your sign-in has expired. Sign in again to see the sites.";
    if (status === 403) return "Only Operations and the Owner can open Sites.";
    if (status === 503 || code === "not_configured") return "Site monitoring is not switched on yet. The monitoring key still has to be added in Netlify.";
    return "Could not reach site monitoring. Trying again in a minute.";
  }

  function create(deps) {
    var H = root.VeriskoSiteHealth;
    var data = null, loadedAt = 0, problem = "", filter = "", active = false, timer = null, inFlight = false, openSiteId = "", editingId = "";
    var dlg = deps.dialog, content = deps.content;

    try { var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); if (cached && cached.data) { data = cached.data; loadedAt = cached.at || 0; } } catch (e) { /* no cache is fine */ }

    async function call(body) {
      var res;
      try {
        res = await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await deps.getToken()) }, body: JSON.stringify(body) });
      } catch (e) { return { ok: false, status: 0, body: {} }; }
      var out = await res.json().catch(function () { return {}; });
      return { ok: res.ok && out.ok !== false, status: res.status, body: out };
    }

    function render() {
      if (!active) return;
      var banner = problem ? '<p class="result-note" role="alert">' + H.esc(problem) + ' <button type="button" class="btn btn-ghost" data-sites-refresh>Try again</button></p>' : "";
      if (!data) {
        content.innerHTML = banner + (problem ? "" : '<p class="result-note">Loading sites…</p>');
        return;
      }
      var stamp = loadedAt ? '<p class="muted">Updated ' + H.esc(H.agoText(new Date(loadedAt).toISOString(), Date.now())) + ' · <button type="button" class="btn btn-ghost" data-sites-refresh>Refresh</button></p>' : "";
      content.innerHTML = banner + H.listHtml(data, Date.now(), filter) + stamp;
      if (!(data.sites || []).length) content.insertAdjacentHTML("afterbegin", '<p class="result-note">No sites yet. Use Add site to create the first one.</p>');
    }

    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      var r = await call({ action: "summary" });
      inFlight = false;
      if (r.ok) {
        data = { sites: r.body.sites || [], unknown: r.body.unknown || [] };
        loadedAt = Date.now(); problem = "";
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: loadedAt, data: data })); } catch (e) { /* storage may be full or blocked */ }
      } else problem = problemText(r.status, r.body && r.body.error);
      render();
    }

    function show() {
      active = true;
      render();
      refresh();
      clearInterval(timer);
      timer = setInterval(function () { if (!document.hidden && !dlg.open) refresh(); }, REFRESH_MS);
    }
    function stop() { active = false; clearInterval(timer); timer = null; }

    /* ------------------------------- the sheet ------------------------------ */
    function showDialog(html) {
      dlg.innerHTML = html;
      dlg.classList.add("is-wide");
      dlg.onclick = onDialogClick;
      if (!dlg.open) {
        dlg.showModal();
        dlg.addEventListener("close", function () { dlg.onclick = null; dlg.classList.remove("is-wide"); dlg.innerHTML = ""; refresh(); }, { once: true });
      }
    }
    function closeDialog() { if (dlg.open) dlg.close(); }

    async function openDetail(siteId) {
      openSiteId = siteId;
      showDialog('<div class="ask-head"><h2 id="askTitle">Loading…</h2></div><div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">Close</button></div>');
      var r = await call({ action: "detail", siteId: siteId });
      if (!dlg.open) return;
      if (!r.ok) { showDialog('<div class="ask-head"><h2 id="askTitle">Could not open this site</h2><p class="ask-body">' + H.esc(problemText(r.status, r.body && r.body.error)) + '</p></div><div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">Close</button></div>'); return; }
      lastDetail = r.body;
      showDialog(H.detailHtml(r.body, Date.now()));
    }
    var lastDetail = null;

    async function act(body, doneMessage) {
      var r = await call(body);
      if (!r.ok) { deps.toast(problemText(r.status, r.body && r.body.error)); return null; }
      deps.toast(doneMessage);
      return r.body;
    }

    function openForm(site) {
      editingId = site ? site.id : "";
      showDialog(H.siteFormHtml(site, deps.getJobs()));
    }
    function readForm() {
      var q = function (id) { return dlg.querySelector("#" + id); };
      return H.formFields({ name: q("siteName").value, area: q("siteArea").value, feedBox: q("siteFeedBox").checked, feedEmail: q("siteFeedEmail").checked, carePlan: q("siteCare").checked, jobRef: q("siteJob").value });
    }
    async function saveForm() {
      var f = readForm(), note = dlg.querySelector("#siteFormNote"), btn = dlg.querySelector("#siteSave");
      var why = H.formProblem(f);
      if (why) { note.textContent = why; return; }
      btn.disabled = true; note.textContent = "";
      var editing = !!editingId;
      var r = await call(editing ? Object.assign({ action: "update_site", siteId: editingId }, f) : Object.assign({ action: "create_site" }, f));
      btn.disabled = false;
      if (!r.ok) { note.textContent = r.body && r.body.error ? String(r.body.error) : problemText(r.status, ""); return; }
      deps.toast(editing ? "Site saved" : "Added " + r.body.site.code);
      await openDetail(r.body.site.id);
    }

    async function issueKey(siteId) {
      var site = lastDetail && lastDetail.site;
      if (site && site.boxKeyIssuedAt) {
        var ok = await deps.confirm({ title: "Replace the box key?", body: "The box now on site will stop reporting until it is given the new key.", confirmLabel: "Replace key", danger: true });
        if (!ok) { await openDetail(siteId); return; }
      }
      var r = await call({ action: "issue_box_key", siteId: siteId });
      if (!r.ok) { deps.toast(problemText(r.status, r.body && r.body.error)); await openDetail(siteId); return; }
      showDialog(H.keyHtml(r.body));
    }

    async function onDialogClick(e) {
      var t = e.target;
      if (t.closest("#askCancel")) { closeDialog(); return; }
      var ack = t.closest("[data-incident-ack]");
      if (ack) { if (await act({ action: "acknowledge", incidentId: ack.getAttribute("data-incident-ack") }, "Acknowledged")) await openDetail(openSiteId); return; }
      var fix = t.closest("[data-incident-fix]");
      if (fix) { if (await act({ action: "fix", incidentId: fix.getAttribute("data-incident-fix") }, "Marked fixed")) await openDetail(openSiteId); return; }
      var st = t.closest("[data-site-status]");
      if (st) { if (await act({ action: "update_site", siteId: st.getAttribute("data-site-status"), status: st.getAttribute("data-to") }, st.getAttribute("data-to") === "paused" ? "Site paused" : "Site resumed")) await openDetail(openSiteId); return; }
      var ed = t.closest("[data-site-edit]");
      if (ed) { openForm(lastDetail.site); return; }
      var key = t.closest("[data-site-key]");
      if (key) { await issueKey(key.getAttribute("data-site-key")); return; }
      if (t.closest("#siteSave")) { await saveForm(); return; }
      if (t.closest("#siteKeyCopy")) {
        var text = dlg.querySelector("#siteKeyText").textContent;
        try { await navigator.clipboard.writeText(text); deps.toast("Key copied"); } catch (err) { deps.toast("Could not copy. Select the key and copy it by hand."); }
      }
    }

    /* ------------------------------ page events ------------------------------ */
    function onClick(e) {
      var open = e.target.closest("[data-site-open]");
      if (open) { openDetail(open.getAttribute("data-site-open")); return true; }
      if (e.target.closest("[data-sites-refresh]")) { refresh(); return true; }
      return false;
    }
    function onKey(e) {
      if (e.key !== "Enter" && e.key !== " ") return false;
      var open = e.target.closest && e.target.closest("[data-site-open]");
      if (!open) return false;
      e.preventDefault();
      openDetail(open.getAttribute("data-site-open"));
      return true;
    }
    function onInput(e) {
      if (e.target.id !== "sitesSearch") return false;
      filter = e.target.value;
      render();
      var box = content.querySelector("#sitesSearch");
      if (box) { box.focus(); box.setSelectionRange(filter.length, filter.length); }
      return true;
    }
    function addSite() { lastDetail = null; openSiteId = ""; openForm(null); }

    return { show: show, stop: stop, onClick: onClick, onInput: onInput, onKey: onKey, addSite: addSite, refresh: refresh };
  }

  var api = { create: create, problemText: problemText };
  root.VeriskoSitesScreen = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
```

- [ ] **Step 4: Run the tests and see them pass**

```bash
node --test tests/sites-screen.test.js
npm test
```

Expected: 11 tests pass. `npm test`: 286 pass, 0 fail.

- [ ] **Step 5: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/sites-screen.js sales-app/tests/sites-screen.test.js
git commit -m "sales-app: sites-screen.js loads, refreshes and runs the Sites screen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
cd sales-app
```

---

### Task 8: Wire the screen into the app

Adds the nav item, the view, the button, the event hooks, the styles, and bumps `?v=` from 73 to 74. The edits are made by a script that refuses to run if any anchor text is missing or appears more than once, so a changed `app.js` cannot be patched wrongly.

**Files:**
- Modify: `app.js`, `index.html`, `app.css`
- Create: `tests/sites-wiring.test.js`

- [ ] **Step 1: Write the failing wiring test**

Create `tests/sites-wiring.test.js`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const html = read("index.html");
const app = read("app.js");

test("the two Sites scripts load before app.js, and every script carries the same version", () => {
  const scripts = [...html.matchAll(/<script src="([^"]+)\?v=(\d+)"/g)].map((m) => ({ file: m[1], v: m[2] }));
  const order = scripts.map((s) => s.file);
  assert.ok(order.indexOf("site-health.js") >= 0 && order.indexOf("site-health.js") < order.indexOf("sites-screen.js"));
  assert.ok(order.indexOf("sites-screen.js") < order.indexOf("app.js"));
  assert.equal(new Set(scripts.map((s) => s.v)).size, 1, "all assets share one ?v= number");
  assert.ok(Number(scripts[0].v) >= 74, "the version was bumped for this release");
});

test("Sites has a nav button that starts hidden, so only Operations and the Owner ever see it", () => {
  assert.match(html, /data-view="sites"[^>]*hidden/);
});

test("the app limits Sites to Operations and the Owner everywhere a view is chosen", () => {
  assert.ok(app.includes('"cashflow", "sites", "settings"]'), "Sites is a More view");
  assert.ok(app.includes('view === "sites" && !canInstalls()'), "render() sends everyone else back to Today");
  assert.ok(app.includes('v.push("sites")'), "the More menu lists it for those who may open it");
  assert.ok(app.includes('view === "jobs" || view === "sites") && !canInstalls()'), "applyRole() agrees");
});

test("the screen is stopped when another view opens, and the page button adds a site", () => {
  assert.ok(app.includes('if (view !== "sites") sitesScreen.stop();'));
  assert.ok(app.includes('else if (view === "sites") sitesScreen.addSite();'));
  assert.ok(app.includes("if (sitesScreen.onClick(e)) return;"));
});
```

- [ ] **Step 2: Run it and see it fail**

```bash
node --test tests/sites-wiring.test.js
```

Expected: 4 failures (no Sites scripts or nav item yet, `?v=73`).

- [ ] **Step 3: Save and run the patch script**

Create `/tmp/apply-sites-patch.py` (outside the repo) with this content:

```python
#!/usr/bin/env python3
"""Wires the Sites screen into app.js, index.html and app.css. Every edit must match exactly once."""
import re, sys

def edit(path, pairs):
    s = open(path, encoding="utf-8").read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            sys.exit(f"{path}: expected 1 match, found {n} for: {old[:70]!r}")
        s = s.replace(old, new)
    open(path, "w", encoding="utf-8").write(s)

edit("app.js", [
    ('var MORE_VIEWS = ["jobs", "cashflow", "settings"];', 'var MORE_VIEWS = ["jobs", "cashflow", "sites", "settings"];'),
    ('  var content = document.getElementById("viewContent");\n',
     '''  var content = document.getElementById("viewContent");
  var sitesScreen = VeriskoSitesScreen.create({
    content: content,
    dialog: document.getElementById("askDialog"),
    toast: toast,
    confirm: openSheet,
    getToken: async function () {
      if (settings.auth && settings.auth.expires_at && settings.auth.expires_at * 1000 - Date.now() < 60000) await refreshSession();
      return settings.auth ? settings.auth.access_token : "";
    },
    getJobs: function () {
      return (state.jobs || []).filter(function (j) { return j.ref; }).map(function (j) { return { ref: j.ref, client: jobClient(j).business }; });
    }
  });
'''),
    ('    if (view === "jobs" && !canInstalls()) view = "today";      // Jobs is Operations + admin\n',
     '    if (view === "jobs" && !canInstalls()) view = "today";      // Jobs is Operations + admin\n    if (view === "sites" && !canInstalls()) view = "today";     // Sites is Operations + admin\n    if (view !== "sites") sitesScreen.stop();\n'),
    ('    else if (view === "cashflow") renderCashflow();\n    else if (view === "settings") renderSettings();',
     '    else if (view === "cashflow") renderCashflow();\n    else if (view === "sites") renderSites();\n    else if (view === "settings") renderSettings();'),
    ('  // Highlight the current tab — or the More button when the view lives there.',
     '''  function renderSites() {
    setHead("Site monitoring", "Sites", "Which customer sites are healthy right now. Red ones need a call.", "Add site", true);
    sitesScreen.show();
  }
  // Highlight the current tab — or the More button when the view lives there.'''),
    ('    if (canInstalls()) { v.push("jobs"); v.push("cashflow"); }', '    if (canInstalls()) { v.push("jobs"); v.push("cashflow"); v.push("sites"); }'),
    ('    if ((view === "cashflow" || view === "jobs") && !canInstalls()) view = "today";', '    if ((view === "cashflow" || view === "jobs" || view === "sites") && !canInstalls()) view = "today";'),
    ('    else if (view === "visits") openForm("appointment");\n    else openForm("prospect");',
     '    else if (view === "visits") openForm("appointment");\n    else if (view === "sites") sitesScreen.addSite();\n    else openForm("prospect");'),
    ('  content.addEventListener("input", function (e) {\n    if (e.target.id === "search") updateProspectGrid();',
     '  content.addEventListener("keydown", function (e) { sitesScreen.onKey(e); });\n\n  content.addEventListener("input", function (e) {\n    if (sitesScreen.onInput(e)) return;\n    if (e.target.id === "search") updateProspectGrid();'),
    ('  content.addEventListener("click", function (e) {\n    var photo =', '  content.addEventListener("click", function (e) {\n    if (sitesScreen.onClick(e)) return;\n    var photo ='),
])

edit("index.html", [
    ('      <button class="nav-item" type="button" data-view="support" aria-label="Support centre">',
     '''      <button class="nav-item" type="button" data-view="sites" aria-label="Sites" hidden>
        <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.5-6 4 12 2.5-6h5"/></svg>
        <span class="nav-label">Sites</span>
      </button>
      <button class="nav-item" type="button" data-view="support" aria-label="Support centre">'''),
    ('  <script src="certificate.js?v=73"></script>\n', '  <script src="certificate.js?v=73"></script>\n  <script src="site-health.js?v=73"></script>\n  <script src="sites-screen.js?v=73"></script>\n'),
])
s = open("index.html", encoding="utf-8").read()
s = s.replace("?v=73", "?v=74")
open("index.html", "w", encoding="utf-8").write(s)

css = '''
/* Sites screen */
.sites-counts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
.sites-count{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 6px;border-radius:14px;background:var(--fill-2);text-align:center}
.sites-count strong{font-size:22px;line-height:1.1}
.sites-count span{font-size:12px;color:var(--faint);font-weight:550}
.sites-count.red{background:var(--red-bg)} .sites-count.red strong{color:var(--red)}
.sites-count.amber{background:var(--amber-bg)} .sites-count.amber strong{color:var(--amber)}
.sites-count.green{background:var(--green-bg)} .sites-count.green strong{color:var(--green)}
.site-card{cursor:pointer;border-left:4px solid transparent}
.site-card.is-red{border-left-color:var(--red)}
.site-card.is-amber{border-left-color:var(--amber)}
.site-card.is-green{border-left-color:var(--green)}
.site-card:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.sites-detail h3{margin:18px 0 8px;font-size:15px}
.sites-detail .muted,.card .muted,.sites-screen .muted{color:var(--faint);font-size:13px}
.sites-form{display:flex;flex-direction:column;gap:12px}
.sites-form label{display:flex;flex-direction:column;gap:5px;font-size:13.5px;font-weight:550}
.sites-form label.check{flex-direction:row;align-items:center;gap:9px;font-weight:500}
.sites-form fieldset{border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.sites-form legend{font-size:13.5px;font-weight:550;margin-bottom:6px}
.sites-key{padding:14px;border-radius:12px;background:var(--fill-2);word-break:break-all}
.sites-key code{font-size:13px;user-select:all}
@media(max-width:420px){.sites-counts{grid-template-columns:repeat(2,1fr)}}
'''
with open("app.css", "a", encoding="utf-8") as f:
    f.write(css)
print("patched")
```

Then run it from the app folder:

```bash
cd /Users/ben/Verisko/sales-app
git status --short app.js index.html app.css
python3 /tmp/apply-sites-patch.py
node --check app.js && echo "app.js syntax ok"
rm /tmp/apply-sites-patch.py
```

Expected: `git status` prints nothing for those three files before the run (they are clean), then `patched` and `app.js syntax ok`. If the script exits with `expected 1 match, found 0` (or `found 2`), a file has changed since this plan was written. Run `git checkout app.js index.html app.css` to undo any partial edit, find the new text for that anchor in the file, adjust that one pair in the script, and run it again. The script checks every anchor in a file before writing that file.

- [ ] **Step 4: Run all tests**

```bash
node --test tests/sites-wiring.test.js
npm test
```

Expected: 4 wiring tests pass. `npm test`: 290 pass, 0 fail.

- [ ] **Step 5: Look at it**

Optional but quick. Serve the app folder and open it as the Owner, using the localStorage seeding method in `docs/CODEX-HANDOFF.md` section 7 to skip sign-in:

```bash
cd /Users/ben/Verisko/sales-app
python3 -m http.server 8099
```

Open `http://localhost:8099`. A plain static server has no `/api/sites`, so the list shows "Could not reach site monitoring" with a Try again button. Check only these things: no script fails to load (browser console is clean); the Sites item appears under More on a narrow window and in the sidebar on a wide one; the page head reads "Site monitoring / Sites"; the Add site button opens the form with Site box ticked, and Cancel closes it. Full behaviour is checked in Task 9 against the live service. Stop the server with Ctrl-C.

- [ ] **Step 6: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/app.js sales-app/index.html sales-app/app.css sales-app/tests/sites-wiring.test.js
git commit -m "sales-app: Sites screen in the Operations app (?v=74)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
cd sales-app
```

---

### Task 9: Switch it on and check it as each role

This is the one manual step: the Netlify setting. It is Ben's to do, because the key must never pass through chat. Until it is set, the screen shows "Site monitoring is not switched on yet", which is the correct, safe state.

- [ ] **Step 1: Copy the key without showing it**

In a terminal on this Mac:

```bash
cat ~/.verisko-monitoring/api-*.key | pbcopy
```

Nothing prints. The key is now on the clipboard.

- [ ] **Step 2: Add the Netlify setting**

In the Netlify dashboard, open the Verisko sales site (`verisko-sales-2026`), then Site configuration, Environment variables, Add a variable. Name: `MONITOR_API_KEY`. Value: paste. Scopes: Functions only if Netlify offers the choice. Save.

Then clear the clipboard:

```bash
pbcopy < /dev/null
```

- [ ] **Step 3: Redeploy so the function sees the setting**

```bash
cd /Users/ben/Verisko
git commit --allow-empty -m "sales-app: redeploy so /api/sites picks up MONITOR_API_KEY

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

Wait about a minute for the deploy.

- [ ] **Step 4: Check as Operations or the Owner**

Sign in on the live app (`https://verisko-sales-2026.netlify.app`), open More, then Sites.

- The list loads. With no real sites yet it says "No sites yet".
- Tap Add site. Enter "TEST Sites screen", area "Test", tick both Site box and Recorder email, save. The sheet for VS-000N opens showing Box key "not issued".
- Tap Issue box key. A sheet shows a key once, with Copy key. Tap Done.
- Reopen the site. It says Box key "issued ...". Tap Replace box key. A confirmation appears first. Cancel it.
- Tap Pause, then Resume. The chip changes between Paused and Waiting for first report.

- [ ] **Step 5: Check the refusals**

Sign in as a Sales person or Team lead (or ask Abraham to). The Sites item must not appear anywhere. Then, still signed in as that person, run in the browser console:

```javascript
fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + JSON.parse(localStorage.getItem("verisko_sales_settings_v1")).auth.access_token }, body: JSON.stringify({ action: "summary" }) }).then(r => r.status).then(console.log)
```

Expected: `403`.

- [ ] **Step 6: Try a real problem**

Post a fake "recorder disk full" email report for the test site, using the email key from its file (the key is never printed). Use the site code you saw in Step 4 in place of `VS-000N`:

```bash
cd /Users/ben/Verisko/sales-app
KEY=$(cat ~/.verisko-monitoring/email-*.key)
curl -s -X POST https://cepernltrzrmupgegcib.supabase.co/functions/v1/ingest \
  -H "authorization: Bearer $KEY" -H "content-type: application/json" \
  -d "{\"type\":\"email\",\"message_id\":\"sites-screen-test-1\",\"observed_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"class\":\"fault\",\"fault_kind\":\"disk_full\",\"site_code\":\"VS-000N\",\"subject\":\"TEST disk full\",\"excerpt\":\"test\"}"
unset KEY
```

Expected: `{"ok":true,...}`. No real text goes out, because the foundation still uses the console sender. Within 60 seconds (or tap Refresh) the card turns red "Needs attention" with "Recorder disk full since just now". Open it: tap I am on it, the card turns amber "Someone is on it" and shows who. Tap Mark fixed: the card returns to green or waiting.

- [ ] **Step 7: Remove the test site**

Run the SQL from Task 4, Step 4 again to delete `TEST Sites screen`.

(No commit beyond the empty redeploy commit in Step 3.)

---

### Task 10: Documentation

**Files:**
- Modify: `monitoring/README.md`
- Modify: `docs/specs/2026-10-11-site-health-monitoring-design.md`

- [ ] **Step 1: Update the README**

In `monitoring/README.md`:

1. In the table under "What is here", change the row for `supabase/functions/<name>/index.ts` to:

```markdown
| `supabase/functions/<name>/index.ts` | Thin entry points for the five Edge Functions: `ingest`, `watch`, `sites-read`, `incident-update`, `site-admin`. |
```

2. Add these rows to the same table:

```markdown
| `../netlify/functions/sites.mjs` | The `/api/sites` gateway the Sites screen calls. Operations and Owner only. Needs the Netlify setting `MONITOR_API_KEY`. |
| `../site-health.js`, `../sites-screen.js` | The Sites screen (status wording and layout, then network and page behaviour). |
```

3. Replace the two sentences under "Run the tests" that begin "The handler tests run against..." with:

```markdown
The handler tests run against an in-memory fake of the database (`tests/helpers/fake-repo.mjs`).
The real database code is `_shared/repo.mjs`. `tests/monitoring-repo.test.js` checks it against a recording stand-in for supabase-js (`tests/helpers/stub-db.mjs`), including a contract test that the real and fake repositories return identical summaries. The live smoke test still checks it against the real database.
```

4. Under "Deploy", change step 2 to say "For each of the five functions".

5. Under "Keys", add below the table: `The api key is also the Netlify setting MONITOR_API_KEY (Netlify, Site configuration, Environment variables). To rotate it: make a new api key, set it in Netlify, redeploy, then set revoked_at on the old row.`

- [ ] **Step 2: Add spec section 14**

Append to `docs/specs/2026-10-11-site-health-monitoring-design.md`:

```markdown

## 14. Sites screen as built (build step 3)

Plan: `docs/plans/2026-10-12-sites-screen.md`.

- A fifth Edge Function, `site-admin`, creates sites (always active, code generated by the database), edits them (name, area, feeds, care plan, linked job, status) and issues box keys. A new box key revokes the old one. The raw key is returned once and stored nowhere.
- `/api/sites` is the only way the browser reaches monitoring. It allows Operations and the Owner and refuses everyone else with 403. Acknowledge and Fixed record the signed-in person's email, taken on the server.
- The one Netlify setting is `MONITOR_API_KEY`, the api key.
- Status on the list: red when any problem is open and unclaimed, amber when every problem is acknowledged, grey "waiting" for a box site that has never reported, green otherwise, grey for paused and closed. Email-only sites say they cannot detect outages.
- Fixed from section 13: reads now page past 1,000 rows and the real and fake repositories build their answers with the same functions (`_shared/summary.mjs`), checked by a contract test.
- Not built: a notification badge on the nav item, a screen for alert contacts (still SQL until the SMS plan), and editing a site's code.
```

- [ ] **Step 3: Mark the section 13 follow-up as fixed**

In the spec's section 13, replace the whole bullet that begins `- **Before the Sites screen (build step 3):**` with:

```markdown
- **Before the Sites screen (build step 3):** fixed. See section 14.
```

- [ ] **Step 4: Commit and push**

```bash
cd /Users/ben/Verisko
git add sales-app/monitoring/README.md sales-app/docs/specs/2026-10-11-site-health-monitoring-design.md
git commit -m "sales-app: monitoring README and spec describe the Sites screen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main
```

---

## Self-review against the spec

| Spec | Where it is built |
|---|---|
| 8: item in More for admin and operations, hidden from Sales and Team lead | Tasks 5 (403), 8 (nav hidden, `render()` and `applyRole()` redirect) |
| 8: list sorted red, amber, green with code, client, area, feed, last seen, open incidents | Task 6 (`sortSites`, `siteCardHtml`) |
| 8: detail with each device, state and time, recent events | Task 6 (`detailHtml`) |
| 8: Acknowledge and Fixed record who and when | Tasks 5 (email from server), 6, 7 |
| 8: Add site links an existing job, generates the code and, for box sites, the key | Tasks 3 (`create_site`, `issue_box_key`), 6 (form), 7 |
| 8: `?v=` bumped | Task 8 |
| 5: one Netlify setting, limited blast radius | Tasks 5, 9 |
| 4: email-only sites cannot detect outages | Task 6 |
| 7 "Needs a look": unreadable emails listed | Task 6 (`unknownHtml`) |
| 10 step 3: smoke test as admin, operations, sales, teamlead; sales and teamlead refused | Task 5 tests (sales, teamlead, outsider), Task 9 steps 4 and 5 |
| 13: paging and identical shapes before the Sites screen | Tasks 1 and 2 |

**Not in this plan, by design:** the email reader script (waits for Ronnie's real alert emails), real SMS, contacts screen, notification badge, and the box agent. Review follow-ups for those stay in spec section 13.

**Known limits.** The screen needs signal. It shows the last saved list offline but cannot change anything. A manual Fixed on a device that is still down reopens within a minute, so staff should use I am on it for known issues. The 60 second refresh pauses while a sheet is open and resumes when it closes.
