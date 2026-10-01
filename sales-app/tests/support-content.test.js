import test from "node:test";
import assert from "node:assert/strict";
import "../support-content.js";

const S = globalThis.VeriskoSupport;

test("the library has 13 videos in 5 parts, numbered in order, each with a Loom id", () => {
  assert.equal(S.VIDEOS.length, 13);
  assert.deepEqual(S.VIDEOS.map((v) => v.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual([...new Set(S.VIDEOS.map((v) => v.part))], [1, 2, 3, 4, 5]);
  assert.equal(new Set(S.VIDEOS.map((v) => v.id)).size, 13, "ids are unique");
  S.VIDEOS.forEach((v) => assert.match(v.loom, /^[0-9a-f]{32}$/));
  assert.equal(S.watchUrl(S.VIDEOS[0]), "https://www.loom.com/share/95873acd1c0a4bc0bafa59193781a4dd");
  assert.match(S.embedUrl(S.VIDEOS[0]), /^https:\/\/www\.loom\.com\/embed\/95873acd1c0a4bc0bafa59193781a4dd\?/);
});

test("progress counts watched videos and points at the first unwatched one", () => {
  const p0 = S.progress({});
  assert.equal(p0.done, 0); assert.equal(p0.next.id, "v1"); assert.equal(p0.complete, false);
  const p = S.progress({ v1: "2026-10-01T08:00:00Z", v2: "2026-10-01T09:00:00Z", v4: "2026-10-02T07:00:00Z", junk: "x" });
  assert.equal(p.done, 3); assert.equal(p.next.id, "v3"); assert.equal(p.last, "2026-10-02T07:00:00Z");
  const all = Object.fromEntries(S.VIDEOS.map((v) => [v.id, "T"]));
  assert.equal(S.progress(all).complete, true); assert.equal(S.progress(all).next, null);
});

test("team progress lists sales and team leads, least progress first", () => {
  const users = [{ id: "a", name: "Ab", role: "sales" }, { id: "b", name: "Bea", role: "sales" }, { id: "l", name: "Lead", role: "teamlead" }, { id: "o", name: "Ops", role: "operations" }];
  const t = S.teamProgress(users, { a: { v1: "T", v2: "T" }, l: { v1: "T" } });
  assert.deepEqual(t.map((r) => [r.name, r.done]), [["Bea", 0], ["Lead", 1], ["Ab", 2]]);
});

test("help answers are filtered by role and use the app's commission amounts", () => {
  const sales = S.faq({ who: "sales", perQualified: "UGX 3,000", perDeposit: "UGX 120,000" });
  assert.ok(sales.some((x) => /UGX 3,000/.test(x.a) && /UGX 120,000/.test(x.a)));
  assert.ok(!sales.some((x) => x.who === "lead"));
  assert.ok(S.faq({ who: "lead" }).some((x) => /approve or disqualify/.test(x.q)));
});
