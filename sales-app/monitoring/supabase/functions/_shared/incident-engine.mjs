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
