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
