import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone, displayPhone, phoneEmail, pinProblem, ninProblem, legalNameProblem, newPinRecord, pinMatches,
  recordFailure, isLocked, startReset, resetCodeMatches, signToken, verifyToken, protectPinUsers, MAX_FAILED
} from "../netlify/functions/pin-auth.mjs";

test("phone numbers normalise to country-code digits", () => {
  assert.equal(normalizePhone("0772 460125"), "256772460125");
  assert.equal(normalizePhone("+256 772 460 125"), "256772460125");
  assert.equal(normalizePhone("772460125"), "256772460125");
  assert.equal(normalizePhone("+254 112 676265"), "254112676265");
  assert.equal(normalizePhone("12345"), "");
  assert.equal(displayPhone("256772460125"), "+256 772 460 125");
  assert.equal(phoneEmail("256772460125"), "256772460125@staff.verisko");
});

test("PINs: exactly 4 digits, not obvious", () => {
  assert.equal(pinProblem("4829"), "");
  ["123", "12345", "abcd", "1111", "1234", "4321", "0123", "9876"].forEach((p) => assert.notEqual(pinProblem(p), "", p));
});

test("NIN and legal name checks", () => {
  assert.equal(ninProblem("CM90012345ABCD"), "");
  assert.equal(ninProblem("cf 9001 2345 abcd"), "");
  assert.notEqual(ninProblem("CX90012345ABCD"), "");
  assert.notEqual(ninProblem("CM9001"), "");
  assert.equal(legalNameProblem("Beatrice Nansubuga"), "");
  assert.notEqual(legalNameProblem("Bea"), "");
});

test("PIN hashing, lockout after 5 wrong tries", () => {
  const rec = newPinRecord("4829");
  assert.ok(pinMatches("4829", rec));
  assert.ok(!pinMatches("4828", rec));
  assert.ok(!rec.hash.includes("4829"));
  let r = rec, now = 1_000_000;
  for (let i = 0; i < MAX_FAILED - 1; i++) r = recordFailure(r, now);
  assert.equal(isLocked(r, now), false);
  r = recordFailure(r, now);
  assert.equal(isLocked(r, now), true);
  assert.equal(isLocked(r, now + 16 * 60 * 1000), false, "unlocks after 15 minutes");
});

test("a PIN reset gives a one-time code, clears the PIN and signs out every session", () => {
  const rec = newPinRecord("4829");
  const { code, rec: next } = startReset(rec, 1000);
  assert.match(code, /^\d{6}$/);
  assert.equal(next.v, rec.v + 1);
  assert.ok(!pinMatches("4829", next));
  assert.ok(resetCodeMatches(code, next, 2000));
  assert.ok(!resetCodeMatches(code, next, 1000 + 49 * 3600 * 1000), "expires after 48 hours");
});

test("session tokens are signed and expire", () => {
  const t = signToken("secret-1", { uid: "u1", v: 2, exp: 5000 });
  assert.deepEqual(verifyToken("secret-1", t, 4000), { uid: "u1", v: 2, exp: 5000 });
  assert.equal(verifyToken("secret-1", t, 6000), null, "expired");
  assert.equal(verifyToken("secret-2", t, 4000), null, "wrong key");
  const [h, body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "admin", v: 2, exp: 5000 })).toString("base64url");
  assert.equal(verifyToken("secret-1", [h, forged, sig].join("."), 4000), null, "tampered payload");
});

test("a device can't add, remove or rename PIN accounts — only change their role", () => {
  const stored = [{ id: "o", email: "ben@x", role: "admin" }, { id: "p1", name: "Bea N", email: "256@staff.verisko", phone: "+256", role: "sales", authMethod: "pin" }];
  const out = protectPinUsers(stored, [{ id: "o", email: "ben@x", role: "admin" }, { id: "fake", email: "1@staff.verisko", role: "admin", authMethod: "pin" }]);
  assert.deepEqual(out.map((u) => u.id), ["o", "p1"], "removed one comes back, invented one is dropped");
  const out2 = protectPinUsers(stored, [stored[0], { ...stored[1], name: "Hacker", phone: "+1", role: "teamlead" }]);
  assert.equal(out2[1].name, "Bea N"); assert.equal(out2[1].phone, "+256"); assert.equal(out2[1].role, "teamlead");
  assert.equal(protectPinUsers(stored, [stored[0], { ...stored[1], role: "admin" }])[1].role, "sales", "never admin");
});

import { newInviteCode, cleanInviteCode, canInviteRole, inviteProblem, idOverdue } from "../netlify/functions/pin-auth.mjs";

test("invite codes: 8 characters without look-alikes", () => {
  const c = newInviteCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(cleanInviteCode(" ab-cd 23ef "), "ABCD23EF");
});

test("who can invite whom", () => {
  assert.ok(canInviteRole("teamlead", "sales"));
  assert.ok(!canInviteRole("teamlead", "teamlead"));
  assert.ok(canInviteRole("operations", "teamlead"));
  assert.ok(!canInviteRole("operations", "operations"));
  assert.ok(canInviteRole("admin", "operations"));
  assert.ok(!canInviteRole("admin", "admin"));
  assert.ok(!canInviteRole("sales", "sales"));
});

test("an invite works once, for 7 days, for its phone number only", () => {
  const inv = { phone: "256772460125", exp: 2000 };
  assert.equal(inviteProblem(inv, 1000, "256772460125"), "");
  assert.match(inviteProblem(inv, 1000, "256700000000"), /phone number/);
  assert.match(inviteProblem(inv, 3000), /expired/);
  assert.match(inviteProblem({ ...inv, usedAt: "x" }, 1000), /already used/);
  assert.match(inviteProblem(null, 1000), /isn't right/);
});

test("the National ID is overdue only after its deadline, and only while missing", () => {
  const me = { authMethod: "pin", idStatus: "needed", idDueAt: new Date(5000).toISOString() };
  assert.equal(idOverdue(me, 4000), false);
  assert.equal(idOverdue(me, 6000), true);
  assert.equal(idOverdue({ ...me, idStatus: "submitted" }, 6000), false);
  assert.equal(idOverdue({ ...me, idStatus: "redo" }, 6000), true);
  assert.equal(idOverdue({ role: "admin", email: "x" }, 6000), false);
});
