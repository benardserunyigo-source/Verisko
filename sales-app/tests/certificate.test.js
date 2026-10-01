import test from "node:test";
import assert from "node:assert/strict";
import "../support-content.js";
import "../certificate.js";

const S = globalThis.VeriskoSupport, C = globalThis.VeriskoCertificate;
const allPassed = (extra) => Object.assign(Object.fromEntries(S.VIDEOS.flatMap((v, i) => [[v.id, "2026-10-01T08:00:00Z"], ["q-" + v.id, "3/3 2026-10-01T09:" + String(10 + i).padStart(2, "0") + ":00.000Z"]])), extra || {});

test("no certificate until every quiz is passed", () => {
  const t = allPassed(); t["q-v13"] = "2/3 2026-10-01T09:30:00.000Z";
  assert.equal(C.buildModel({ id: "u1", name: "Bea" }, t, S), null);
  assert.equal(C.buildModel({ id: "u1", name: "Bea" }, {}, S), null);
});

test("the certificate carries the name, Kampala date and a stable number", () => {
  const m = C.buildModel({ id: "u-bea", name: "  Beatrice   Nansubuga " }, allPassed(), S);
  assert.equal(m.name, "Beatrice Nansubuga");
  assert.equal(m.videos, 13);
  assert.equal(m.completedAt, "2026-10-01T09:22:00.000Z", "the last quiz passed");
  assert.equal(m.date, "1 October 2026");
  assert.match(m.number, /^VFS-20261001-[0-9A-Z]{5}$/);
  assert.equal(C.buildModel({ id: "u-bea", name: "B" }, allPassed(), S).number, m.number, "same person, same number");
  assert.notEqual(C.buildModel({ id: "u-ab", name: "B" }, allPassed(), S).number, m.number);
  assert.equal(C.fileName(m), "Verisko-Certificate-Beatrice-Nansubuga.pdf");
  assert.match(C.shareText(m), /all 13 videos/);
});

test("the completion stamp saved on the 13th pass wins over later retakes", () => {
  const m = C.buildModel({ id: "u", name: "Bea" }, allPassed({ cert: "2026-09-30T22:30:00.000Z" }), S);
  assert.equal(m.completedAt, "2026-09-30T22:30:00.000Z");
  assert.equal(m.date, "1 October 2026", "22:30 UTC is already 1 October in Kampala");
});
