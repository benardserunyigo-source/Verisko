// In-memory stand-in for the Supabase repo. It follows the same contract as
// monitoring/supabase/functions/_shared/repo.mjs, so handler tests exercise real flows.

export function makeFakeRepo({ now = () => new Date() } = {}) {
  const db = { sites: [], devices: [], keys: [], events: [], deviceStates: {}, incidents: [], contacts: [], rules: [] };
  let seq = 0;
  const id = (p) => `${p}-${++seq}`;
  const iso = () => now().toISOString();
  const active = (i) => i.state !== "fixed";

  const repo = {
    db,
    addSite(s) { const site = { id: id("S"), code: `VS-${String(db.sites.length + 1).padStart(4, "0")}`, name: "Test Pharmacy", area: "Ntinda", feeds: ["box"], status: "active", boxLastSeenAt: null, ...s }; db.sites.push(site); return site; },
    addKey(k) { db.keys.push({ revokedAt: null, ...k }); },
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
      return {
        sites: db.sites.map((s) => ({
          ...s,
          devices: db.devices.filter((d) => d.siteId === s.id).map((d) => ({ ...d, ...(db.deviceStates[d.id] || { state: "unknown" }) })),
          incidents: db.incidents.filter((i) => i.siteId === s.id && active(i)).map((i) => ({ ...i })),
        })),
        unknown: db.events.filter((e) => e.kind === "unknown").slice(-20),
      };
    },
    async getSiteDetail(siteId) {
      const site = db.sites.find((s) => s.id === siteId);
      if (!site) return null;
      return { site, devices: db.devices.filter((d) => d.siteId === siteId).map((d) => ({ ...d, ...(db.deviceStates[d.id] || { state: "unknown" }) })),
        incidents: db.incidents.filter((i) => i.siteId === siteId).slice(-50), events: db.events.filter((e) => e.siteId === siteId).slice(-50) };
    },
    async setIncidentState({ incidentId, action, by, nowIso }) {
      const inc = db.incidents.find((i) => i.id === incidentId);
      if (!inc) return null;
      if (action === "acknowledge" && inc.state === "open") { inc.state = "acknowledged"; inc.acknowledgedBy = by; inc.acknowledgedAt = nowIso; return { changed: true, state: inc.state }; }
      if (action === "fix" && inc.state !== "fixed") { inc.state = "fixed"; inc.fixedBy = by; inc.fixedAt = nowIso; inc.fixedReason = "manual"; return { changed: true, state: inc.state }; }
      return { changed: false, state: inc.state };
    },
  };
  return repo;
}
