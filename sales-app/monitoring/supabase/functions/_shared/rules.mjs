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
