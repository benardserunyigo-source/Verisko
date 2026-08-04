import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../cashflow-report.js", import.meta.url), "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(source, context);
const { buildCashflowReport, cashflowYears } = context.VeriskoCashflowReport;

test("groups approved money in and out into all twelve months", () => {
  const report = buildCashflowReport([
    { date: "2026-01-04", direction: "in", amount: 500000, status: "approved" },
    { date: "2026-01-05", direction: "out", amount: 125000, status: "approved" },
    { date: "2026-12-31", direction: "out", amount: 50000, status: "approved" }
  ], 2026);
  assert.equal(report.months.length, 12);
  assert.deepEqual({ ...report.months[0] }, { index: 0, name: "January", received: 500000, used: 125000, net: 375000, pendingIn: 0, pendingOut: 0 });
  assert.equal(report.months[11].used, 50000);
  assert.deepEqual({ received: report.received, used: report.used, net: report.net }, { received: 500000, used: 175000, net: 325000 });
});

test("excludes sent-back entries and separates pending values", () => {
  const report = buildCashflowReport([
    { date: "2026-03-01", direction: "in", amount: 300000, status: "pending" },
    { date: "2026-03-02", direction: "out", amount: 80000, status: "pending" },
    { date: "2026-03-03", direction: "out", amount: 90000, status: "query" }
  ], 2026);
  assert.equal(report.received, 0);
  assert.equal(report.used, 0);
  assert.equal(report.pendingIn, 300000);
  assert.equal(report.pendingOut, 80000);
});

test("keeps years separate and ignores invalid dates and amounts", () => {
  const txs = [
    { date: "2025-06-10", direction: "in", amount: 100, status: "approved" },
    { date: "2026-06-10", direction: "in", amount: 200, status: "approved" },
    { date: "bad", direction: "out", amount: 50, status: "approved" },
    { date: "2026-13-10", direction: "out", amount: 50, status: "approved" },
    { date: "2026-06-11", direction: "out", amount: -5, status: "approved" }
  ];
  assert.equal(buildCashflowReport(txs, 2026).received, 200);
  assert.deepEqual(Array.from(cashflowYears(txs, 2026)), [2026, 2025]);
});

test("always includes the current year when there are no entries", () => {
  const report = buildCashflowReport([], 2026);
  assert.equal(report.months.every((m) => m.received === 0 && m.used === 0 && m.net === 0), true);
  assert.deepEqual(Array.from(cashflowYears([], 2026)), [2026]);
});
