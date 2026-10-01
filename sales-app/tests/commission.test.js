import test from "node:test";
import assert from "node:assert/strict";
import "../commission.js";

const C = globalThis.VeriskoCommission;
// Kampala = UTC+3, so Saturday 12:00 Kampala = Saturday 09:00 UTC.

test("pay week runs Saturday 12:00 to Saturday 12:00 Kampala time", () => {
  const w = C.payWeek(new Date("2026-09-30T10:00:00Z"));        // Wed 13:00 Kampala
  assert.equal(w.start.toISOString(), "2026-09-26T09:00:00.000Z");
  assert.equal(w.end.toISOString(), "2026-10-03T09:00:00.000Z");
  assert.equal(C.label(w.payday, true), "Sat 3 Oct, 12:00");
});

test("Saturday 11:59 is still this week; 12:00 starts the next", () => {
  assert.equal(C.payWeek(new Date("2026-10-03T08:59:00Z")).end.toISOString(), "2026-10-03T09:00:00.000Z");
  assert.equal(C.payWeek(new Date("2026-10-03T09:00:00Z")).end.toISOString(), "2026-10-10T09:00:00.000Z");
  assert.equal(C.payWeek(new Date("2026-09-30T10:00:00Z"), -1).end.toISOString(), "2026-09-26T09:00:00.000Z");
});

test("a late-Saturday-night UTC instant is Sunday in Kampala", () => {
  const w = C.payWeek(new Date("2026-10-03T22:30:00Z"));        // Sun 01:30 Kampala
  assert.equal(w.end.toISOString(), "2026-10-10T09:00:00.000Z");
});

test("date-only values are midnight in Kampala", () => {
  assert.equal(C.eventTime("2026-10-03").toISOString(), "2026-10-02T21:00:00.000Z");
});

const rep = (email, extra) => ({ id: email + Math.random(), business: "Biz", createdBy: email.split("@")[0], createdByEmail: email, ...extra });
const week = C.payWeek(new Date("2026-09-30T10:00:00Z"));

test("approved qualifications earn 2,500 in the week they were approved", () => {
  const ps = [
    rep("ab@x", { qualStatus: "approved", qualApprovedAt: "2026-09-29T08:00:00Z" }),
    rep("ab@x", { qualStatus: "approved", qualApprovedAt: "2026-09-20T08:00:00Z" }),   // previous week
    rep("ab@x", { qualStatus: "pending" }),
    rep("ab@x", { qualStatus: "query" })
  ];
  const e = C.earnings(ps, [], [], week);
  assert.equal(e.reps.length, 1);
  assert.equal(e.reps[0].qualified.length, 1);
  assert.equal(e.reps[0].qualAmount, 2500);
  assert.equal(e.reps[0].pendingQual, 1);
});

test("first client deposit earns 100,000 once, as soon as it is recorded", () => {
  const p = rep("ab@x", {});
  const jobs = [{ id: "j1", prospectId: p.id }];
  const txs = [
    { id: "t1", direction: "in", amount: 500000, status: "pending", installId: "j1", recordedAt: "2026-09-28T10:00:00Z" },
    { id: "t2", direction: "in", amount: 300000, status: "approved", prospectId: p.id, recordedAt: "2026-09-29T10:00:00Z" }
  ];
  const e = C.earnings([p], jobs, txs, week);
  assert.equal(e.reps[0].deposits.length, 1, "one per client, not per deposit");
  assert.equal(e.reps[0].depositAmount, 100000);
  assert.equal(e.total, 100000);
});

test("sent-back, money-out and unlinked entries never count", () => {
  const p = rep("ab@x", {});
  const txs = [
    { direction: "in", amount: 500000, status: "query", prospectId: p.id, recordedAt: "2026-09-28T10:00:00Z" },
    { direction: "out", amount: 500000, status: "approved", prospectId: p.id, recordedAt: "2026-09-28T10:00:00Z" },
    { direction: "in", amount: 500000, status: "approved", recordedAt: "2026-09-28T10:00:00Z" }
  ];
  assert.equal(C.earnings([p], [], txs, week).total, 0);
});

test("a deposit from an earlier week was already paid", () => {
  const p = rep("ab@x", {});
  const txs = [{ direction: "in", amount: 1, status: "approved", prospectId: p.id, recordedAt: "2026-09-10T10:00:00Z" }, { direction: "in", amount: 1, status: "approved", prospectId: p.id, recordedAt: "2026-09-29T10:00:00Z" }];
  assert.equal(C.earnings([p], [], txs, week).total, 0, "only the first deposit pays, and it fell in an earlier week");
});

test("rates come from settings; one rep can be selected", () => {
  const ps = [rep("ab@x", { qualStatus: "approved", qualApprovedAt: "2026-09-29T08:00:00Z" }), rep("bea@x", { qualStatus: "approved", qualApprovedAt: "2026-09-29T08:00:00Z" })];
  const e = C.earnings(ps, [], [], week, { perQualified: 3000, email: "AB@x", users: [{ email: "ab@x", name: "Ab Okello" }] });
  assert.equal(e.reps.length, 1);
  assert.equal(e.reps[0].name, "Ab Okello");
  assert.equal(e.total, 3000);
});

test("qualification request follows the stage", () => {
  const p = { stage: "Contact attempted", qualStatus: "" };
  assert.equal(C.qualificationRequest(p, "T1"), false);
  p.stage = "Qualified";
  assert.equal(C.qualificationRequest(p, "T1"), true);
  assert.equal(p.qualStatus, "pending");
  p.stage = "Contact attempted";
  C.qualificationRequest(p, "T2");
  assert.equal(p.qualStatus, "", "dropping back cancels a pending request");
  p.stage = "Appointment confirmed"; p.qualStatus = "query";
  C.qualificationRequest(p, "T3");
  assert.equal(p.qualStatus, "pending", "a sent-back one re-submits on the next save");
  p.qualStatus = "approved"; p.stage = "Lost";
  assert.equal(C.qualificationRequest(p, "T4"), false);
  assert.equal(p.qualStatus, "approved", "approved stays approved");
});
