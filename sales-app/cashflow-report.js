(function (root) {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function validDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!m) return null;
    var month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    return { year: Number(m[1]), month: month - 1 };
  }

  function amount(t) {
    var n = Number(t && t.amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function cashflowYears(transactions, currentYear) {
    var years = {};
    years[Number(currentYear)] = true;
    (transactions || []).forEach(function (t) {
      var d = validDate(t && t.date);
      if (d) years[d.year] = true;
    });
    return Object.keys(years).map(Number).sort(function (a, b) { return b - a; });
  }

  function buildCashflowReport(transactions, year) {
    year = Number(year);
    var months = MONTHS.map(function (name, index) {
      return { index: index, name: name, received: 0, used: 0, net: 0, pendingIn: 0, pendingOut: 0 };
    });
    var report = { year: year, months: months, received: 0, used: 0, net: 0, pendingIn: 0, pendingOut: 0 };

    (transactions || []).forEach(function (t) {
      var d = validDate(t && t.date);
      var n = amount(t);
      if (!d || d.year !== year || !n || (t.direction !== "in" && t.direction !== "out")) return;
      var m = months[d.month];
      if (t.status === "approved") {
        if (t.direction === "in") { m.received += n; report.received += n; }
        else { m.used += n; report.used += n; }
      } else if (t.status === "pending") {
        if (t.direction === "in") { m.pendingIn += n; report.pendingIn += n; }
        else { m.pendingOut += n; report.pendingOut += n; }
      }
    });
    months.forEach(function (m) { m.net = m.received - m.used; });
    report.net = report.received - report.used;
    return report;
  }

  root.VeriskoCashflowReport = {
    MONTHS: MONTHS,
    buildCashflowReport: buildCashflowReport,
    cashflowYears: cashflowYears
  };
}(typeof window !== "undefined" ? window : globalThis));
