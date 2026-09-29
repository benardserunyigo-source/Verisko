import test from "node:test";
import assert from "node:assert/strict";
import "../closed-sales.js";

const C = globalThis.VeriskoClosedSales;
const P = (id, extra = {}) => ({ id, business: id.toUpperCase(), ...extra });
const J = (id, prospectId, stage, createdAt = "2026-09-28") => ({ id, prospectId, stage, createdAt });

test("a Draft or Sent quote leaves the prospect open", () => {
  const ps = [P("a"), P("b")];
  const ch = C.reconcile(ps, [J("j1", "a", "Draft"), J("j2", "b", "Sent")], "2026-09-28");
  assert.deepEqual(ch, []);
  assert.equal(ps[0].closedSale, undefined);
});

test("an accepted quote closes the sale automatically", () => {
  const ps = [P("a")];
  const ch = C.reconcile(ps, [J("j1", "a", "Accepted")], "2026-09-28");
  assert.equal(ch.length, 1);
  assert.equal(ps[0].closedSale, true);
  assert.equal(ps[0].closedAuto, true);
  assert.equal(ps[0].closedBy, "Quote accepted");
  assert.equal(ps[0].closedAt, "2026-09-28");
});

test("later delivery stages also count as accepted", () => {
  for (const stage of ["Scheduled", "In progress", "Installed", "Handed over"]) {
    const ps = [P("a")];
    C.reconcile(ps, [J("j1", "a", stage)], "2026-09-28");
    assert.equal(ps[0].closedSale, true, stage);
  }
});

test("a rejected or cancelled quote re-opens the prospect", () => {
  const ps = [P("a")];
  C.reconcile(ps, [J("j1", "a", "Accepted")], "2026-09-28");
  const ch = C.reconcile(ps, [J("j1", "a", "Rejected")], "2026-09-29");
  assert.equal(ch.length, 1);
  assert.equal(ps[0].closedSale, false);
  assert.equal(ps[0].closedBy, "");
  assert.equal(ps[0].closedAt, "");
});

test("a prospect closed by hand only to unlock quoting goes back to open", () => {
  const ps = [P("pharmacy", { closedSale: true, closedBy: "Ben", closedAt: "2026-09-27" })];
  const ch = C.reconcile(ps, [J("j1", "pharmacy", "Sent")], "2026-09-28");
  assert.deepEqual(ch.map((c) => [c.id, c.to]), [["pharmacy", false]]);
  assert.equal(ps[0].closedSale, false);
});

test("a closed prospect with no job at all is left alone", () => {
  const ps = [P("legacy", { closedSale: true, closedBy: "Ben", closedAt: "2026-08-01" })];
  assert.deepEqual(C.reconcile(ps, [], "2026-09-28"), []);
  assert.equal(ps[0].closedSale, true);
  assert.equal(ps[0].closedBy, "Ben");
});

test("one accepted job among several closes the sale; quoteFor prefers it", () => {
  const jobs = [J("j1", "a", "Rejected", "2026-09-20"), J("j2", "a", "Accepted", "2026-09-21"), J("j3", "a", "Draft", "2026-09-25")];
  const ps = [P("a")];
  C.reconcile(ps, jobs, "2026-09-28");
  assert.equal(ps[0].closedSale, true);
  assert.equal(C.quoteFor("a", jobs).id, "j2");
  assert.equal(C.quoteFor("a", [J("x", "a", "Draft", "2026-09-01"), J("y", "a", "Sent", "2026-09-05")]).id, "y");
  assert.equal(C.quoteFor("zzz", jobs), null);
});

test("running twice is a no-op", () => {
  const ps = [P("a")];
  const jobs = [J("j1", "a", "Accepted")];
  C.reconcile(ps, jobs, "2026-09-28");
  assert.deepEqual(C.reconcile(ps, jobs, "2026-09-28"), []);
});
