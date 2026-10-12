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
