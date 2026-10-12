import test from "node:test";
import assert from "node:assert/strict";
import { makeHarness, cam3 } from "./helpers/harness.mjs";

const body = async (res) => res.json();

test("watch needs the watch key", async () => {
  const h = await makeHarness();
  assert.equal((await h.watch(null)).status, 401);
  assert.equal((await h.watch(h.keys.api)).status, 403);
  assert.equal((await h.watch(h.keys.box)).status, 403);
});

test("a box silent for fifteen minutes opens one site_silent incident and one SMS, not two", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true));
  h.advance(14); await h.watch();
  assert.equal(h.incidents().length, 0);
  h.advance(1); const res = await body(await h.watch());
  assert.equal(res.opened, 1);
  assert.equal(h.incidents()[0].kind, "site_silent");
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /no report from the site box since 13:00/);
  h.advance(1); await h.watch();
  assert.equal(h.incidents().length, 1);
  assert.equal(h.sent.length, 1);
});

test("when the silent box reports again the incident is fixed and a FIXED SMS goes out", async () => {
  const h = await makeHarness();
  await h.boxReport(cam3(true));
  h.advance(16); await h.watch();
  h.advance(5); await h.boxReport(cam3(true));
  assert.equal(h.incidents()[0].state, "fixed");
  assert.match(h.sent[1].text, /^FIXED\./);
});

test("a site that never reported is never called silent", async () => {
  const h = await makeHarness();
  h.advance(600); await h.watch();
  assert.equal(h.incidents().length, 0);
});

test("two sites in one area going silent together send one power-cut SMS", async () => {
  const h = await makeHarness();
  const two = h.repo.addSite({ name: "Kato Supermarket", area: "Ntinda" });
  h.repo.db.sites.find((s) => s.id === h.site.id).boxLastSeenAt = h.at();
  h.repo.db.devices.push({ id: "DB1", siteId: h.site.id, kind: "box", label: "Box" });
  two.boxLastSeenAt = h.at();
  h.repo.db.devices.push({ id: "DB2", siteId: two.id, kind: "box", label: "Box" });
  h.advance(16); await h.watch();
  assert.equal(h.incidents().length, 2);
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /^VERISKO likely power cut in Ntinda: 2 sites silent \(VS-0001, VS-0002\)/);
  assert.ok(h.incidents().every((i) => i.notifiedAt), "both incidents are marked notified");
  assert.ok(h.incidents().every((i) => i.areaGroup));
});

test("SMS that failed is retried by the next watch and sent once the provider is back", async () => {
  const h = await makeHarness();
  h.sms.fail = true;
  await h.boxReport(cam3(true));
  for (let m = 1; m <= 6; m++) { h.advance(1); await h.boxReport(cam3(false)); }
  assert.equal(h.incidents()[0].notifiedAt, null);
  h.sms.fail = false;
  h.advance(1);
  const res = await body(await h.watch());
  assert.equal(res.sms, 1);
  assert.ok(h.incidents()[0].notifiedAt);
  h.advance(1); await h.watch();
  assert.equal(h.sent.length, 1, "retried once, not repeatedly");
});

test("unsent alerts older than two hours are not retried", async () => {
  const h = await makeHarness({ contacts: [] });
  h.site.feeds = ["email"]; // email-only, so a quiet box cannot raise its own alert here
  await h.email({});
  assert.equal(h.incidents()[0].notifiedAt, null);
  h.repo.addContact({ name: "Abraham", phone: "+256700000001" });
  h.advance(180); await h.watch();
  assert.equal(h.sent.length, 0);
});

test("unsent alerts inside two hours are retried once contacts exist", async () => {
  const h = await makeHarness({ contacts: [] });
  h.site.feeds = ["email"];
  await h.email({});
  h.repo.addContact({ name: "Abraham", phone: "+256700000001" });
  h.advance(30); await h.watch();
  assert.equal(h.sent.length, 1);
  assert.ok(h.incidents()[0].notifiedAt);
});

test("a stale email incident expires after 24 hours of silence without any SMS", async () => {
  const h = await makeHarness();
  await h.email({});
  assert.equal(h.sent.length, 1);
  h.advance(24 * 60); const res = await body(await h.watch());
  assert.equal(res.expired, 1);
  assert.equal(h.incidents()[0].state, "fixed");
  assert.equal(h.incidents()[0].fixedReason, "expired");
  assert.equal(h.sent.length, 1);
});
