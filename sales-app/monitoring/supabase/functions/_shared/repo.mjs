// The real repository: every database read and write the handlers need, on top of a
// supabase-js client created with the service role. It follows the same contract as the
// fake repository in tests/helpers/fake-repo.mjs.
//
// Write order inside save() matters: incidents first, events last. An email is recognised
// as already processed by its event row, so if a write fails midway the retry still
// reaches the incident step.

const NO_DEVICE = null;
const must = (res) => { if (res.error) throw new Error(res.error.message); return res.data; };

const toSite = (r) => r && ({ id: r.id, code: r.code, name: r.client_name, area: r.area, feeds: r.feeds || [], status: r.status, boxLastSeenAt: r.box_last_seen_at });
const toIncident = (r) => ({
  id: r.id, siteId: r.site_id, deviceId: r.device_id, kind: r.kind, state: r.state, source: r.source,
  openedAt: r.opened_at, lastSeenAt: r.last_seen_at, notifiedAt: r.notified_at, repeatCount: r.repeat_count, areaGroup: r.area_group,
});
const SITE_COLS = "id,code,client_name,area,feeds,status,box_last_seen_at";

export function makeRepo(db) {
  return {
    async findKey(hash) {
      const r = must(await db.from("access_keys").select("id,kind,site_id,revoked_at").eq("key_hash", hash).maybeSingle());
      return r ? { id: r.id, kind: r.kind, siteId: r.site_id, revokedAt: r.revoked_at } : null;
    },

    async loadRules() { return must(await db.from("alert_rules").select("*")); },

    async getSite(id) { return toSite(must(await db.from("sites").select(SITE_COLS).eq("id", id).maybeSingle())); },
    async getSiteByCode(code) { return toSite(must(await db.from("sites").select(SITE_COLS).eq("code", code).maybeSingle())); },

    async loadSiteState(siteId) {
      const devices = must(await db.from("devices").select("id").eq("site_id", siteId));
      const ids = devices.map((d) => d.id);
      const states = ids.length ? must(await db.from("device_state").select("device_id,state,since,last_event_at").in("device_id", ids)) : [];
      const incidents = must(await db.from("incidents").select("*").eq("site_id", siteId).neq("state", "fixed"));
      const deviceStates = {};
      for (const s of states) deviceStates[s.device_id] = { state: s.state, since: s.since, lastEventAt: s.last_event_at };
      return { siteId, deviceStates, incidents: incidents.map(toIncident) };
    },

    async ensureDevice({ siteId, kind, label, channel = null }) {
      const find = async () => must(await db.from("devices").select("id,kind,label").eq("site_id", siteId).eq("kind", kind).eq("label_key", label.toLowerCase()).maybeSingle());
      let d = await find();
      if (d) return d;
      const ins = await db.from("devices").insert({ site_id: siteId, kind, label, channel }).select("id,kind,label").single();
      if (ins.error) {
        if (ins.error.code === "23505") { d = await find(); if (d) return d; } // another request created it first
        throw new Error(ins.error.message);
      }
      return ins.data;
    },

    async hasEvent(dedupeKey) {
      const res = await db.from("events").select("id", { count: "exact", head: true }).eq("dedupe_key", dedupeKey);
      if (res.error) throw new Error(res.error.message);
      return (res.count || 0) > 0;
    },

    async save({ siteId, events, deviceStates, ops, boxSeenAt }) {
      const created = {};
      for (const o of ops || []) {
        if (o.op === "open") {
          const ins = await db.from("incidents").insert({
            site_id: o.siteId, device_id: o.deviceId || NO_DEVICE, kind: o.kind, source: o.source,
            opened_at: o.openedAt, last_seen_at: o.lastSeenAt, area_group: o.areaGroup || null,
          }).select("id").single();
          if (!ins.error) { created[o.ref] = ins.data.id; continue; }
          if (ins.error.code !== "23505") throw new Error(ins.error.message);
          // A live incident already exists for this site, device and kind: use it.
          let q = db.from("incidents").select("id").eq("site_id", o.siteId).eq("kind", o.kind).neq("state", "fixed");
          q = o.deviceId ? q.eq("device_id", o.deviceId) : q.is("device_id", null);
          const existing = must(await q.maybeSingle());
          if (existing) created[o.ref] = existing.id;
        } else if (o.op === "repeat") {
          must(await db.rpc("monitoring_repeat", { p_id: o.incidentId, p_seen: o.lastSeenAt, p_count: !!o.count }));
        } else if (o.op === "fix") {
          must(await db.from("incidents").update({ state: "fixed", fixed_at: o.fixedAt, fixed_reason: o.reason }).eq("id", o.incidentId).neq("state", "fixed"));
        } else if (o.op === "group") {
          must(await db.from("incidents").update({ area_group: o.areaGroup }).eq("id", o.incidentId));
        }
      }
      if (deviceStates && deviceStates.length) {
        must(await db.from("device_state").upsert(
          deviceStates.map((s) => ({ device_id: s.deviceId, state: s.state, since: s.since, last_event_at: s.lastEventAt })),
          { onConflict: "device_id" }));
      }
      if (events && events.length) {
        must(await db.from("events").upsert(
          events.map((e) => ({ site_id: e.siteId, device_id: e.deviceId || null, source: e.source, kind: e.kind, observed_at: e.observedAt, raw: e.raw || {}, dedupe_key: e.dedupeKey })),
          { onConflict: "dedupe_key", ignoreDuplicates: true }));
      }
      if (boxSeenAt && siteId) must(await db.from("sites").update({ box_last_seen_at: boxSeenAt }).eq("id", siteId));
      return { created };
    },

    async markNotified(ids, nowIso) {
      if (ids.length) must(await db.from("incidents").update({ notified_at: nowIso }).in("id", ids));
    },

    async listContacts() { return must(await db.from("alert_contacts").select("name,phone").eq("active", true)); },

    async describe({ siteIds, deviceIds }) {
      const sites = {}, devices = {};
      if (siteIds.length) for (const s of must(await db.from("sites").select("id,code,client_name,area").in("id", siteIds))) sites[s.id] = { code: s.code, name: s.client_name, area: s.area };
      if (deviceIds.length) for (const d of must(await db.from("devices").select("id,label").in("id", deviceIds))) devices[d.id] = { label: d.label };
      return { sites, devices };
    },

    async listWatchSnapshot() {
      const sites = must(await db.from("sites").select(SITE_COLS)).map(toSite);
      const boxes = must(await db.from("devices").select("id,site_id").eq("kind", "box"));
      const boxBySite = Object.fromEntries(boxes.map((b) => [b.site_id, b.id]));
      const incidents = must(await db.from("incidents").select("*").neq("state", "fixed")).map((r) => ({ ...toIncident(r) }));
      return { sites: sites.map((s) => ({ ...s, boxDeviceId: boxBySite[s.id] || null })), incidents };
    },

    async listUnnotified(sinceIso) {
      return must(await db.from("incidents").select("*").eq("state", "open").is("notified_at", null).gte("created_at", sinceIso)).map(toIncident);
    },

    async listSummary() {
      const sites = must(await db.from("sites").select(SITE_COLS + ",care_plan,job_ref").order("code"));
      const devices = must(await db.from("devices").select("id,site_id,kind,label,channel"));
      const states = must(await db.from("device_state").select("device_id,state,since,last_event_at"));
      const incidents = must(await db.from("incidents").select("*").neq("state", "fixed"));
      const unknown = must(await db.from("events").select("id,site_id,observed_at,received_at,raw").eq("kind", "unknown").order("received_at", { ascending: false }).limit(20));
      const stateBy = Object.fromEntries(states.map((s) => [s.device_id, s]));
      return {
        sites: sites.map((s) => ({
          ...toSite(s), carePlan: s.care_plan, jobRef: s.job_ref,
          devices: devices.filter((d) => d.site_id === s.id).map((d) => ({ id: d.id, kind: d.kind, label: d.label, channel: d.channel,
            state: (stateBy[d.id] || {}).state || "unknown", since: (stateBy[d.id] || {}).since || null })),
          incidents: incidents.filter((i) => i.site_id === s.id).map(toIncident),
        })),
        unknown,
      };
    },

    async getSiteDetail(siteId) {
      const site = must(await db.from("sites").select(SITE_COLS + ",care_plan,job_ref").eq("id", siteId).maybeSingle());
      if (!site) return null;
      const devices = must(await db.from("devices").select("id,kind,label,channel").eq("site_id", siteId));
      const ids = devices.map((d) => d.id);
      const states = ids.length ? must(await db.from("device_state").select("device_id,state,since,last_event_at").in("device_id", ids)) : [];
      const stateBy = Object.fromEntries(states.map((s) => [s.device_id, s]));
      const incidents = must(await db.from("incidents").select("*").eq("site_id", siteId).order("opened_at", { ascending: false }).limit(50));
      const events = must(await db.from("events").select("id,device_id,source,kind,observed_at,received_at").eq("site_id", siteId).order("received_at", { ascending: false }).limit(50));
      return {
        site: { ...toSite(site), carePlan: site.care_plan, jobRef: site.job_ref },
        devices: devices.map((d) => ({ ...d, state: (stateBy[d.id] || {}).state || "unknown", since: (stateBy[d.id] || {}).since || null })),
        incidents: incidents.map(toIncident), events,
      };
    },

    async setIncidentState({ incidentId, action, by, nowIso }) {
      const current = must(await db.from("incidents").select("id,state").eq("id", incidentId).maybeSingle());
      if (!current) return null;
      const patch = action === "acknowledge"
        ? { state: "acknowledged", acknowledged_by: by, acknowledged_at: nowIso }
        : { state: "fixed", fixed_by: by, fixed_at: nowIso, fixed_reason: "manual" };
      let q = db.from("incidents").update(patch).eq("id", incidentId);
      q = action === "acknowledge" ? q.eq("state", "open") : q.neq("state", "fixed");
      const changed = must(await q.select("id,state"));
      if (changed.length) return { changed: true, state: changed[0].state };
      return { changed: false, state: current.state };
    },
  };
}
