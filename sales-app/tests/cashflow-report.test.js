import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../cashflow-report.js", import.meta.url), "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(source, context);
const { cashflowPeriod, shiftCashflowAnchor, inCashflowPeriod, buildCashflowPeriod } = context.VeriskoCashflowReport;

test("builds a Monday-to-Sunday weekly period", () => {
  assert.deepEqual({ ...cashflowPeriod("2026-08-05", "week") }, { mode: "week", start: "2026-08-03", end: "2026-08-09" });
  assert.equal(inCashflowPeriod("2026-08-03", cashflowPeriod("2026-08-05", "week")), true);
  assert.equal(inCashflowPeriod("2026-08-10", cashflowPeriod("2026-08-05", "week")), false);
});

test("builds calendar-month periods including leap years", () => {
  assert.deepEqual({ ...cashflowPeriod("2028-02-14", "month") }, { mode: "month", start: "2028-02-01", end: "2028-02-29" });
});

test("moves to the previous or next week and month", () => {
  assert.equal(shiftCashflowAnchor("2026-08-05", "week", -1), "2026-07-29");
  assert.equal(shiftCashflowAnchor("2026-01-15", "month", -1), "2025-12-01");
  assert.equal(shiftCashflowAnchor("2026-12-15", "month", 1), "2027-01-01");
});

test("totals approved entries and separates pending values for the period", () => {
  const report = buildCashflowPeriod([
    { date: "2026-08-01", direction: "in", amount: 500000, status: "approved" },
    { date: "2026-08-02", direction: "out", amount: 125000, status: "approved" },
    { date: "2026-08-03", direction: "out", amount: 20000, status: "pending" },
    { date: "2026-08-04", direction: "out", amount: 90000, status: "query" },
    { date: "2026-07-31", direction: "in", amount: 999999, status: "approved" }
  ], "2026-08-12", "month");
  assert.deepEqual({ received: report.received, used: report.used, net: report.net, pendingOut: report.pendingOut }, { received: 500000, used: 125000, net: 375000, pendingOut: 20000 });
});

test("returns zero totals for an empty period and ignores invalid records", () => {
  const report = buildCashflowPeriod([{ date: "bad", direction: "in", amount: 4, status: "approved" }], "2026-08-03", "week");
  assert.equal(report.received, 0);
  assert.equal(report.used, 0);
  assert.equal(report.net, 0);
});
