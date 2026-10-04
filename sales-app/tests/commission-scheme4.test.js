import test from "node:test";
import assert from "node:assert/strict";
import "../commission.js";

const C = globalThis.VeriskoCommission;
// Kampala = UTC+3. Pay week 3 Oct 12:00 → 10 Oct 12:00 Kampala = 09:00 UTC.
const week = C.payWeek(new Date("2026-10-06T10:00:00Z"));
const P = (id, email, extra) => ({ id, business: "Biz " + id, createdBy: email.split("@")[0], createdByEmail: email, ...extra });

test("a visit Operations marks real pays 10,000, once per client, in the week it was marked", () => {
  const ps = [P("a", "ab@x"), P("b", "ab@x"), P("c", "ab@x")];
  const appts = [
    { id: "1", prospectId: "a", visitResult: "real", visitResultAt: "2026-10-05T08:00:00Z" },
    { id: "2", prospectId: "a", visitResult: "real", visitResultAt: "2026-10-07T08:00:00Z" },   // same client again
    { id: "3", prospectId: "b", visitResult: "not_real", visitResultAt: "2026-10-05T08:00:00Z" },
    { id: "4", prospectId: "c", visitResult: "real", visitResultAt: "2026-10-10T09:30:00Z" }    // after Saturday noon → next week
  ];
  const e = C.earnings4(ps, appts, [], [], week, {});
  assert.equal(e.reps[0].visits.length, 1);
  assert.equal(e.reps[0].visitAmount, 10000);
  assert.equal(e.total, 10000);
});

test("a deposit pays 100,000 only once it is approved, in the week of approval", () => {
  const p = P("a", "ab@x");
  const pending = [{ id: "t", direction: "in", amount: 500000, status: "pending", prospectId: "a", recordedAt: "2026-10-05T08:00:00Z" }];
  assert.equal(C.earnings4([p], [], [], pending, week, {}).total, 0, "a pending deposit earns nothing");
  const approved = [{ ...pending[0], status: "approved", approvedAt: "2026-10-08T08:00:00Z" }];
  assert.equal(C.earnings4([p], [], [], approved, week, {}).total, 100000);
  const approvedLater = [{ ...pending[0], status: "approved", approvedAt: "2026-10-12T08:00:00Z" }];
  assert.equal(C.earnings4([p], [], [], approvedLater, week, {}).total, 0, "approved next week → paid next week");
  const dateOnly = [{ ...pending[0], status: "approved", reviewedAt: "2026-10-08" }];
  assert.equal(C.earnings4([p], [], [], dateOnly, week, {}).total, 100000, "older approvals carry only a date");
});

test("qualified prospects no longer pay; imported leads pay nothing", () => {
  const ps = [P("a", "ab@x", { qualStatus: "approved", qualApprovedAt: "2026-10-05T08:00:00Z" }), P("i", "ab@x", { imported: true })];
  const appts = [{ id: "1", prospectId: "i", visitResult: "real", visitResultAt: "2026-10-05T08:00:00Z" }];
  assert.equal(C.earnings4(ps, appts, [], [], week, {}).total, 0);
});

test("rates come from settings", () => {
  const ps = [P("a", "ab@x")];
  const appts = [{ id: "1", prospectId: "a", visitResult: "real", visitResultAt: "2026-10-05T08:00:00Z" }];
  assert.equal(C.earnings4(ps, appts, [], [], week, { perVisit: 15000 }).total, 15000);
});

test("weekPay keeps the old rule for weeks before the scheme started", () => {
  const ps = [P("a", "ab@x", { qualStatus: "approved", qualApprovedAt: "2026-09-29T08:00:00Z" })];
  const old = C.payWeek(new Date("2026-09-30T10:00:00Z"));
  const opts = { schemeStart: "2026-10-03T09:00:00Z", perQualified: 2500 };
  assert.equal(C.weekPay({ prospects: ps }, old, opts).scheme, 3);
  assert.equal(C.weekPay({ prospects: ps }, old, opts).total, 2500);
  assert.equal(C.weekPay({ prospects: ps }, week, opts).scheme, 4);
  assert.equal(C.weekPay({ prospects: ps }, week, opts).total, 0);
});

test("confirmed bookings: once per client, dated by the first office call, dropped if marked not real", () => {
  const ps = [P("a", "ab@x"), P("b", "ab@x"), P("c", "ab@x"), P("d", "other@x")];
  const appts = [
    { id: "1", prospectId: "a", callConfirmedAt: "2026-10-05T08:00:00Z" },
    { id: "2", prospectId: "a", callConfirmedAt: "2026-10-06T08:00:00Z" },
    { id: "3", prospectId: "b", callConfirmedAt: "2026-10-06T08:00:00Z", visitResult: "not_real" },
    { id: "4", prospectId: "c" },                                            // booked, never called
    { id: "5", prospectId: "d", callConfirmedAt: "2026-10-06T08:00:00Z" }
  ];
  assert.equal(C.confirmedBookings(ps, appts, week, "ab@x").length, 1);
  assert.equal(C.earnings4(ps, appts, [], [], week, { email: "ab@x" }).reps[0].bookings, 1);
});

test("Monday float: judged on the pay week that ended the Saturday before", () => {
  const monday = C.mondayOf(new Date("2026-10-13T10:00:00Z"));               // Tue 13 Oct → Mon 12 Oct
  assert.equal(monday.toISOString(), "2026-10-11T21:00:00.000Z");
  const w = C.floatWeekFor(monday);
  assert.equal(w.start.toISOString(), "2026-10-03T09:00:00.000Z");
  assert.equal(w.end.toISOString(), "2026-10-10T09:00:00.000Z");
});

test("Monday float: 2 confirmed bookings earn 50,000; fewer earn nothing; it comes back the week after", () => {
  const user = { email: "ab@x", created: "2026-09-21" };
  const ps = [P("a", "ab@x"), P("b", "ab@x"), P("c", "ab@x")];
  const one = [{ id: "1", prospectId: "a", callConfirmedAt: "2026-10-05T08:00:00Z" }];
  const two = one.concat([{ id: "2", prospectId: "b", callConfirmedAt: "2026-10-09T08:00:00Z" }]);
  const mon12 = C.mondayOf(new Date("2026-10-12T08:00:00Z"));
  assert.equal(C.floatFor(user, ps, one, mon12, {}).amount, 0);
  assert.match(C.floatFor(user, ps, one, mon12, {}).reason, /only 1 of 2/);
  assert.equal(C.floatFor(user, ps, two, mon12, {}).amount, 50000);
  const nextWeek = two.concat([
    { id: "3", prospectId: "c", callConfirmedAt: "2026-10-14T08:00:00Z" },
    { id: "4", prospectId: "a", callConfirmedAt: "2026-10-15T08:00:00Z" }     // a already counted earlier → still once
  ]);
  const mon19 = C.mondayOf(new Date("2026-10-19T08:00:00Z"));
  assert.equal(C.floatFor(user, ps, nextWeek, mon19, {}).bookings.length, 1);
  assert.equal(C.floatFor(user, ps, nextWeek, mon19, {}).amount, 0);
});

test("Monday float: new reps get it for their first 2 weeks; nothing before the start date", () => {
  const fresh = { email: "new@x", created: "2026-10-05" };
  const mon12 = C.mondayOf(new Date("2026-10-12T08:00:00Z"));
  const mon19 = C.mondayOf(new Date("2026-10-19T08:00:00Z"));
  assert.equal(C.floatFor(fresh, [], [], mon12, {}).amount, 50000);
  assert.equal(C.floatFor(fresh, [], [], mon12, {}).inGrace, true);
  assert.equal(C.floatFor(fresh, [], [], mon19, {}).amount, 0, "grace over after 14 days");
  const before = C.floatFor(fresh, [], [], mon12, { floatStart: "2026-10-19" });
  assert.equal(before.amount, 0);
  assert.equal(before.active, false);
  assert.equal(C.floatFor({ email: "x@x" }, [], [], mon12, { floatAmount: 30000, floatMinBookings: 0 }).amount, 30000);
});

test("each pay week decides the Monday float right after it ends", () => {
  for (const at of ["2026-10-04T03:00:00Z", "2026-10-05T10:00:00Z", "2026-10-10T08:59:00Z", "2026-10-10T09:00:00Z"]) {
    const w = C.payWeek(new Date(at));
    const mon = C.floatMondayFor(w);
    assert.equal(C.floatWeekFor(mon).end.toISOString(), w.end.toISOString(), at);
  }
  assert.equal(C.floatMondayFor(C.payWeek(new Date("2026-10-04T03:00:00Z"))).toISOString(), "2026-10-11T21:00:00.000Z", "Sunday 4 Oct's week decides Monday 12 Oct");
});

test("a period that straddles the switch adds old-rule pay before it and new-rule pay after it", () => {
  const ps = [P("a", "ab@x", { qualStatus: "approved", qualApprovedAt: "2026-10-02T08:00:00Z" }), P("b", "ab@x")];
  const appts = [{ id: "1", prospectId: "b", visitResult: "real", visitResultAt: "2026-10-05T08:00:00Z" }];
  const month = { start: new Date("2026-09-30T21:00:00Z"), end: new Date("2026-10-06T00:00:00Z") };
  const e = C.weekPay({ prospects: ps, appointments: appts }, month, { schemeStart: "2026-10-03T09:00:00Z", perQualified: 2500, perVisit: 10000 });
  assert.equal(e.total, 12500);
  assert.equal(e.reps.length, 1);
});
