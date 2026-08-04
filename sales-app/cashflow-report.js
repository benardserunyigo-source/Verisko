(function (root) {
  "use strict";

  function parseDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!m) return null;
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.toISOString().slice(0, 10) === value ? d : null;
  }

  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; }

  function cashflowPeriod(anchor, mode) {
    var d = parseDate(anchor) || new Date();
    if (mode === "week") {
      var monday = addDays(d, -((d.getUTCDay() + 6) % 7));
      return { mode: "week", start: iso(monday), end: iso(addDays(monday, 6)) };
    }
    var start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    var end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    return { mode: "month", start: iso(start), end: iso(end) };
  }

  function shiftCashflowAnchor(anchor, mode, amount) {
    var d = parseDate(anchor) || new Date();
    if (mode === "week") return iso(addDays(d, Number(amount) * 7));
    return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + Number(amount), 1)));
  }

  function inCashflowPeriod(date, period) {
    return !!parseDate(date) && date >= period.start && date <= period.end;
  }

  function buildCashflowPeriod(transactions, anchor, mode) {
    var period = cashflowPeriod(anchor, mode);
    var report = { mode: period.mode, start: period.start, end: period.end, received: 0, used: 0, net: 0, pendingIn: 0, pendingOut: 0, count: 0 };
    (transactions || []).forEach(function (t) {
      var n = Number(t && t.amount);
      if (!t || !inCashflowPeriod(t.date, period) || !Number.isFinite(n) || n <= 0 || (t.direction !== "in" && t.direction !== "out")) return;
      report.count += 1;
      if (t.status === "approved") {
        if (t.direction === "in") report.received += n;
        else report.used += n;
      } else if (t.status === "pending") {
        if (t.direction === "in") report.pendingIn += n;
        else report.pendingOut += n;
      }
    });
    report.net = report.received - report.used;
    return report;
  }

  root.VeriskoCashflowReport = {
    cashflowPeriod: cashflowPeriod,
    shiftCashflowAnchor: shiftCashflowAnchor,
    inCashflowPeriod: inCashflowPeriod,
    buildCashflowPeriod: buildCashflowPeriod
  };
}(typeof window !== "undefined" ? window : globalThis));
