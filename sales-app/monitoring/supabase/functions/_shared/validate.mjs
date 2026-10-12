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
