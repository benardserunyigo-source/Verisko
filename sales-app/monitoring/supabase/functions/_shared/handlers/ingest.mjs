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
