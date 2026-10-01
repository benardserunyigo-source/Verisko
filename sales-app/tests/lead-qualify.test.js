import test from "node:test";
import assert from "node:assert/strict";
import "../lead-qualify.js";

const Q = globalThis.VeriskoQualify;
const good = { decides: "I decide", needs: "Theft, Watch staff", places: "Gate, Front door, Inside", pay: "Pay in 3 parts", when: "This month" };

test("5 questions, all answerable by tapping", () => {
  assert.equal(Q.QUESTIONS.length, 5);
  Q.QUESTIONS.forEach((q) => assert.ok(q.options.length >= 3, q.key));
});

test("a lead with all 5 good answers looks qualified", () => {
  assert.deepEqual(Q.verdict(good), { answered: 5, total: 5, ready: true, missing: [], stoppers: [] });
});

test("missing answers are listed by short name", () => {
  const v = Q.verdict({ decides: "I decide", needs: "", places: "Gate" });
  assert.equal(v.answered, 2); assert.equal(v.ready, false);
  assert.deepEqual(v.missing, ["What they want", "How they pay", "When"]);
});

test("stoppers: someone else decides, can't pay now, just looking", () => {
  const v = Q.verdict({ ...good, decides: "Someone else decides", pay: "Can't pay now", when: "Just looking" });
  assert.equal(v.answered, 5); assert.equal(v.ready, false);
  assert.deepEqual(v.stoppers, ["Meet the person who decides", "They can't pay now", "They're just looking"]);
});

test("places suggest a camera count and package", () => {
  assert.equal(Q.cameraEstimate({ places: "Gate" }).packageLabel, "2-camera");
  assert.deepEqual(Q.cameraEstimate(good), { places: 3, cameras: 3, packageLabel: "4-camera" });
  assert.equal(Q.cameraEstimate({ places: "Gate, Front door, Inside, Back, Parking, Counter or till, Store room" }).packageLabel, "custom (more than 6)");
  assert.equal(Q.cameraEstimate({}), null);
});

test("summary lines for the Team lead's queue", () => {
  const s = Q.summary(good);
  assert.deepEqual(s[1], { label: "What they want", value: "Theft, Watch staff" });
  assert.equal(s.length, 5);
});
