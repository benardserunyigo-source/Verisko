import test from "node:test";
import assert from "node:assert/strict";
import "../lead-import.js";
import "../booking.js";

const B = globalThis.VeriskoBooking;
const good = { business: "Samaries Boutique", contact: "Samaries", decides: "Yes, they decide", phone: "0772 566 787",
  area: "Mukono Town", landmark: "Opposite Total", placeType: "Shop", places: "Gate, Counter or till", when: "Tomorrow morning" };
const ctx = { today: "2026-10-05", geo: { lat: 0.35, lng: 32.75 }, prospects: [] };   // Monday

test("a complete booking passes and the phone is formatted", () => {
  const r = B.check(good, ctx);
  assert.equal(r.ok, true, r.errors.join(" "));
  assert.equal(r.phone, "+256 772 566 787");
  assert.deepEqual(r.slot, { date: "2026-10-06", time: "09:00", later: false });
});

test("each missing answer gives one plain message", () => {
  const r = B.check({}, { today: "2026-10-05" });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 8);
  assert.ok(r.errors.some((e) => /location/.test(e)));
});

test("someone who doesn't decide can't be booked", () => {
  const r = B.check({ ...good, decides: "No, someone else decides" }, ctx);
  assert.ok(r.errors.some((e) => /owner first/.test(e)));
});

test("phone must be a Ugandan mobile; duplicates are refused", () => {
  assert.ok(B.check({ ...good, phone: "074081002" }, ctx).errors.some((e) => /Check the phone/.test(e)), "a digit short");
  assert.equal(B.check({ ...good, phone: "+256772566787" }, ctx).ok, true);
  const dup = B.check(good, { ...ctx, prospects: [{ business: "Old Samaries", phone: "+256 772 566 787" }] });
  assert.ok(dup.errors.some((e) => /Already with Verisko: Old Samaries/.test(e)));
});

test("when: tomorrow skips Sunday, later dates, pick a day can't be in the past", () => {
  assert.equal(B.slot("Tomorrow afternoon", "2026-10-10").date, "2026-10-12", "Saturday → Monday, not Sunday");
  assert.equal(B.slot("Tomorrow afternoon", "2026-10-10").time, "14:00");
  assert.deepEqual(B.slot("Later: in 2 weeks", "2026-10-05"), { date: "2026-10-19", time: "10:00", later: true });
  assert.equal(B.slot("Pick a day", "2026-10-05", "2026-10-04", "10:00"), null);
  assert.deepEqual(B.slot("Pick a day", "2026-10-05", "2026-10-07", "15:30"), { date: "2026-10-07", time: "15:30", later: false });
});

test("build makes the prospect and its site visit", () => {
  const r = B.check(good, ctx);
  const b = B.build({ ...good, notes: " Blue gate " }, { today: ctx.today, slot: r.slot, phone: r.phone, director: "Ops Co-owner", nowIso: "T" });
  assert.equal(b.prospect.location, "Opposite Total, Mukono Town");
  assert.equal(b.prospect.vertical, "Retail shop");
  assert.equal(b.prospect.stage, "Appointment proposed");
  assert.equal(b.prospect.quickBooked, true);
  assert.equal(b.prospect.notes, "Blue gate");
  assert.equal(b.prospect.followUp, "2026-10-06");
  assert.deepEqual([b.visit.date, b.visit.time, b.visit.director, b.visit.status], ["2026-10-06", "09:00", "Ops Co-owner", "Proposed"]);
  assert.equal(B.cameras("Gate"), 2);
  assert.equal(B.cameras("Gate, Inside, Parking"), 3);
});

test("a later visit is followed up 3 days before", () => {
  const s = B.slot("Later: in 1 month", "2026-10-05");
  const b = B.build(good, { slot: s, phone: "+256 772 566 787" });
  assert.equal(b.prospect.followUp, "2026-11-01");
  assert.match(b.prospect.nextAction, /Call to confirm/);
});
