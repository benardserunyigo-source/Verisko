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
