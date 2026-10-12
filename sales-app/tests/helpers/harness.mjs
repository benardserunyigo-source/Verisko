// Shared setup for handler tests: a fake repo, a controllable clock, a recording SMS sender,
// and helpers that call the real handlers with real Request objects.
import { makeFakeRepo } from "./fake-repo.mjs";
import { generateKey, hashKey } from "../../monitoring/supabase/functions/_shared/keys.mjs";
import { handleIngest } from "../../monitoring/supabase/functions/_shared/handlers/ingest.mjs";
import { handleWatch } from "../../monitoring/supabase/functions/_shared/handlers/watch.mjs";
import { handleSitesRead, handleIncidentUpdate } from "../../monitoring/supabase/functions/_shared/handlers/sites.mjs";

export const T0 = Date.parse("2026-10-12T10:00:00Z");

export async function makeHarness({ contacts = [{ name: "Abraham", phone: "+256700000001" }] } = {}) {
  const clock = { t: T0 };
  const at = () => new Date(clock.t).toISOString();
  const repo = makeFakeRepo({ now: () => new Date(clock.t) });
  const sent = [];
  const sms = { fail: false, async send(phones, text) { if (sms.fail) throw new Error("provider down"); sent.push({ phones, text }); } };
  const deps = { repo, sms, now: () => new Date(clock.t) };
  contacts.forEach((c) => repo.addContact(c));

  const keys = {};
  for (const kind of ["box", "email", "api", "watch"]) {
    keys[kind] = generateKey(kind);
  }
  const site = repo.addSite({ name: "Mukasa Pharmacy", area: "Ntinda" });
  repo.addKey({ id: "K-box", kind: "box", siteId: site.id, keyHash: await hashKey(keys.box) });
  repo.addKey({ id: "K-email", kind: "email", siteId: null, keyHash: await hashKey(keys.email) });
  repo.addKey({ id: "K-api", kind: "api", siteId: null, keyHash: await hashKey(keys.api) });
  repo.addKey({ id: "K-watch", kind: "watch", siteId: null, keyHash: await hashKey(keys.watch) });

  const call = (handler, key, body, method = "POST") =>
    handler(new Request("http://test/fn", { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body) }), deps);

  const h = {
    clock, repo, sent, sms, deps, keys, site, at,
    advance(min) { clock.t += min * 60000; },
    ingest: (key, body) => call(handleIngest, key, body),
    watch: (key = keys.watch) => call(handleWatch, key, {}),
    sitesRead: (key, body) => call(handleSitesRead, key, body),
    incidentUpdate: (key, body) => call(handleIncidentUpdate, key, body),
    // a box report at the current clock time
    boxReport: (checks, extra = {}) => call(handleIngest, keys.box, { type: "box", observed_at: at(), checks, ...extra }),
    // a recorder alert email
    email: (over) => call(handleIngest, keys.email, { type: "email", message_id: `m-${Math.random()}`, observed_at: at(), class: "fault", fault_kind: "camera_offline", site_code: site.code, device_label: "Camera 3", subject: "Alarm", ...over }),
    incidents: () => repo.db.incidents,
  };
  return h;
}

export const cam3 = (ok) => [{ kind: "camera", label: "Camera 3", ok }, { kind: "recorder", label: "Recorder", ok: true }];
