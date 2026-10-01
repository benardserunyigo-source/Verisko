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

test("progress: a video is complete once its quiz is passed; next = first not passed", () => {
  const p0 = S.progress({});
  assert.equal(p0.done, 0); assert.equal(p0.watched, 0); assert.equal(p0.next.id, "v1"); assert.equal(p0.complete, false);
  const p = S.progress({ v1: "2026-10-01T08:00:00Z", "q-v1": "3/3 2026-10-01T08:05:00Z", v2: "2026-10-01T09:00:00Z", "q-v2": "2/3 2026-10-01T09:05:00Z", v4: "2026-10-02T07:00:00Z", junk: "x" });
  assert.equal(p.watched, 3); assert.equal(p.done, 1, "only v1's quiz is passed");
  assert.equal(p.next.id, "v2", "v2's quiz still needs passing");
  assert.equal(p.last, "2026-10-02T07:00:00Z");
  const all = Object.fromEntries(S.VIDEOS.map((v) => [S.quizKey(v.id), "3/3 T"]));
  assert.equal(S.progress(all).complete, true); assert.equal(S.progress(all).next, null);
});

test("every video has a 3-question quiz with distinct options", () => {
  S.VIDEOS.forEach((v) => {
    const qs = S.QUIZZES[v.id];
    assert.equal(qs.length, 3, v.id);
    qs.forEach((x) => {
      const opts = [x.a, ...x.wrong];
      assert.ok(opts.length >= 3 && new Set(opts).size === opts.length, x.q);
      assert.ok(x.why && x.q.length > 5);
    });
  });
});

test("quizzes shuffle options but score by the answer text; all 3 right to pass", () => {
  const q = S.quizFor("v6", () => 0);
  assert.equal(q.length, 3);
  q.forEach((x) => assert.ok(x.options.includes(x.answer)));
  const right = S.QUIZZES.v6.map((x) => x.a);
  assert.deepEqual(S.scoreQuiz("v6", right), { ...S.scoreQuiz("v6", right), score: 3, total: 3, passed: true });
  const twoOfThree = S.scoreQuiz("v6", [right[0], "UGX 1,650,000", right[2]]);
  assert.equal(twoOfThree.score, 2); assert.equal(twoOfThree.passed, false);
  assert.equal(twoOfThree.results[1].correct, false); assert.equal(twoOfThree.results[1].answer, "40% on installation day, 30% after 30 days, 30% after 60 days");
  assert.equal(S.quizValue(3, 3, "2026-10-01T08:00:00.000Z").length <= 40, true, "fits the server's 40-character limit");
  assert.deepEqual(S.quizResult({ "q-v6": "3/3 2026-10-01T08:00:00.000Z" }, "v6"), { score: 3, total: 3, at: "2026-10-01T08:00:00.000Z", passed: true });
  assert.equal(S.quizResult({}, "v6"), null);
});

test("team progress lists sales and team leads, least progress first", () => {
  const users = [{ id: "a", name: "Ab", role: "sales" }, { id: "b", name: "Bea", role: "sales" }, { id: "l", name: "Lead", role: "teamlead" }, { id: "o", name: "Ops", role: "operations" }];
  const t = S.teamProgress(users, { a: { v1: "T", "q-v1": "3/3 T", "q-v2": "3/3 T" }, l: { "q-v1": "3/3 T" } });
  assert.deepEqual(t.map((r) => [r.name, r.done]), [["Bea", 0], ["Lead", 1], ["Ab", 2]]);
  assert.equal(t[2].watched, 1);
});

test("help answers are filtered by role and use the app's commission amounts", () => {
  const sales = S.faq({ who: "sales", perQualified: "UGX 3,000", perDeposit: "UGX 120,000" });
  assert.ok(sales.some((x) => /UGX 3,000/.test(x.a) && /UGX 120,000/.test(x.a)));
  assert.ok(!sales.some((x) => x.who === "lead"));
  assert.ok(S.faq({ who: "lead" }).some((x) => /approve or disqualify/.test(x.q)));
});

test("new certificates: earned after the viewer last dismissed, newest first", () => {
  const done = (cert) => Object.assign(Object.fromEntries(S.VIDEOS.map((v) => ["q-" + v.id, "3/3 T"])), { cert });
  const users = [{ id: "a", name: "Ab", role: "sales" }, { id: "b", name: "Bea", role: "sales" }, { id: "c", name: "Cy", role: "sales" }, { id: "o", name: "Ops", role: "operations" }];
  const training = { a: done("2026-10-01T09:00:00Z"), b: done("2026-10-02T09:00:00Z"), c: { "q-v1": "3/3 T", cert: "2026-10-02T10:00:00Z" }, o: done("2026-10-02T11:00:00Z") };
  assert.deepEqual(S.newCertificates(users, training, "2026-09-30T00:00:00Z").map((x) => x.name), ["Bea", "Ab"], "incomplete and non-field users left out");
  assert.deepEqual(S.newCertificates(users, training, "2026-10-01T12:00:00Z").map((x) => x.name), ["Bea"]);
  assert.deepEqual(S.newCertificates(users, training, "2026-10-03T00:00:00Z"), []);
  assert.deepEqual(S.newCertificates(users, training, "", "2026-11-15T00:00:00Z"), [], "never dismissed: only the last 30 days");
  assert.equal(S.newCertificates(users, training, "", "2026-10-20T00:00:00Z").length, 2);
});
