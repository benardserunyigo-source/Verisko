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
