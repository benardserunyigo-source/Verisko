import test from "node:test";
import assert from "node:assert/strict";
import { makeHarness, cam3 } from "./helpers/harness.mjs";

const body = async (res) => res.json();

async function withOpenIncident() {
  const h = await makeHarness();
  await h.email({});
  return { h, incident: h.incidents()[0] };
}

test("only the api key can read sites", async () => {
  const h = await makeHarness();
  assert.equal((await h.sitesRead(null, { action: "summary" })).status, 401);
  assert.equal((await h.sitesRead(h.keys.box, { action: "summary" })).status, 403);
  assert.equal((await h.sitesRead(h.keys.email, { action: "summary" })).status, 403);
  assert.equal((await h.sitesRead(h.keys.api, { action: "summary" })).status, 200);
});

test("summary lists sites with their devices, open incidents and unreadable emails", async () => {
  const { h } = await withOpenIncident();
  await h.email({ class: "unknown", fault_kind: undefined, subject: "Weekly report" });
  const res = await body(await h.sitesRead(h.keys.api, { action: "summary" }));
  assert.equal(res.sites.length, 1);
  assert.equal(res.sites[0].code, "VS-0001");
  assert.equal(res.sites[0].incidents.length, 1);
  assert.equal(res.unknown.length, 1);
});

test("detail returns one site and 404s for an unknown id", async () => {
  const { h } = await withOpenIncident();
  const ok = await body(await h.sitesRead(h.keys.api, { action: "detail", siteId: h.site.id }));
  assert.equal(ok.site.code, "VS-0001");
  assert.ok(ok.events.length >= 1);
  assert.equal((await h.sitesRead(h.keys.api, { action: "detail", siteId: "nope" })).status, 404);
  assert.equal((await h.sitesRead(h.keys.api, { action: "detail" })).status, 400);
  assert.equal((await h.sitesRead(h.keys.api, { action: "dance" })).status, 400);
});

test("acknowledge moves an open incident to acknowledged and records who", async () => {
  const { h, incident } = await withOpenIncident();
  const res = await body(await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "acknowledge", by: "abraham@verisko.com" }));
  assert.deepEqual({ changed: res.changed, state: res.state }, { changed: true, state: "acknowledged" });
  assert.equal(incident.acknowledgedBy, "abraham@verisko.com");
});

test("acknowledging twice changes nothing the second time", async () => {
  const { h, incident } = await withOpenIncident();
  await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "acknowledge", by: "a@v.com" });
  const again = await body(await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "acknowledge", by: "a@v.com" }));
  assert.equal(again.changed, false);
});

test("fix closes an incident as manual and a later email opens a fresh one", async () => {
  const { h, incident } = await withOpenIncident();
  const res = await body(await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "fix", by: "a@v.com" }));
  assert.equal(res.state, "fixed");
  assert.equal(incident.fixedReason, "manual");
  assert.equal(h.sent.length, 1, "no SMS for a manual fix");
  h.advance(5);
  await h.email({});
  assert.equal(h.incidents().length, 2);
});

test("a repeat email after acknowledge keeps the incident acknowledged and sends no reminder", async () => {
  const { h, incident } = await withOpenIncident();
  await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "acknowledge", by: "a@v.com" });
  h.advance(90);
  await h.email({});
  assert.equal(incident.state, "acknowledged");
  assert.equal(h.sent.length, 1);
});

test("incident updates are validated", async () => {
  const { h, incident } = await withOpenIncident();
  assert.equal((await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "delete", by: "a" })).status, 400);
  assert.equal((await h.incidentUpdate(h.keys.api, { action: "fix", by: "a" })).status, 400);
  assert.equal((await h.incidentUpdate(h.keys.api, { incidentId: incident.id, action: "fix" })).status, 400);
  assert.equal((await h.incidentUpdate(h.keys.api, { incidentId: "missing", action: "fix", by: "a" })).status, 404);
  assert.equal((await h.incidentUpdate(h.keys.box, { incidentId: incident.id, action: "fix", by: "a" })).status, 403);
});
