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
