// Verisko Uganda Operations — sales commission (pure, tested).
//
// Two kinds of commission, both credited to the rep who created the prospect
// (createdByEmail) and paid weekly, every Saturday at 12:00 noon Kampala time:
//   • Qualified prospect — UGX 2,500 once the Team lead approves it as
//     qualified (qualStatus "approved"); counted when it was approved.
//   • Client deposit — UGX 100,000 once per client, as soon as the client's
//     first deposit is recorded (pending or approved; a sent-back entry does
//     not count); counted when the deposit was recorded.
// Leads the Admin imported from a spreadsheet (imported: true — Instagram,
// Google search…) earn neither.
(function (root) {
  "use strict";

  var EAT_OFFSET_MS = 3 * 3600 * 1000;          // Kampala is UTC+3, no DST
  var WEEK_MS = 7 * 24 * 3600 * 1000;
  var QUAL_STAGES = ["Qualified", "Appointment proposed", "Appointment confirmed"];
  var DEFAULTS = { perQualified: 2500, perDeposit: 100000 };

  function lc(v) { return String(v || "").toLowerCase(); }

  // An ISO timestamp, or a plain YYYY-MM-DD read as midnight in Kampala.
  function eventTime(v) {
    if (!v) return null;
    var s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(Date.parse(s + "T00:00:00Z") - EAT_OFFSET_MS);
    var t = Date.parse(s);
    return isNaN(t) ? null : new Date(t);
  }

  // The pay week containing `now`: from the previous Saturday 12:00 Kampala
  // time (inclusive) to the next one (exclusive), which is also payday.
  // `shift` moves whole weeks (-1 = the week just paid).
  function payWeek(now, shift) {
    var n = now instanceof Date ? now : new Date(now || Date.now());
    var local = new Date(n.getTime() + EAT_OFFSET_MS);              // wall clock in Kampala
    var daysToSat = (6 - local.getUTCDay() + 7) % 7;
    var endLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysToSat, 12, 0, 0);
    var end = endLocal - EAT_OFFSET_MS;
    if (end <= n.getTime()) end += WEEK_MS;
    end += (Number(shift) || 0) * WEEK_MS;
    return { start: new Date(end - WEEK_MS), end: new Date(end), payday: new Date(end) };
  }

  function inPeriod(d, period) { return !!d && d >= period.start && d < period.end; }

  // Kampala wall-clock label, e.g. "Sat 4 Oct, 12:00".
  function label(d, withTime) {
    if (!d) return "";
    var x = new Date(d.getTime() + EAT_OFFSET_MS);
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var s = days[x.getUTCDay()] + " " + x.getUTCDate() + " " + months[x.getUTCMonth()];
    if (withTime) s += ", " + String(x.getUTCHours()).padStart(2, "0") + ":" + String(x.getUTCMinutes()).padStart(2, "0");
    return s;
  }

  function isQualStage(stage) { return QUAL_STAGES.indexOf(stage) >= 0; }

  // A client deposit: money in, linked to the client (directly or through
  // their job), with an amount, and not sent back.
  function isDeposit(t) {
    return !!t && t.direction === "in" && t.status !== "query" && Number(t.amount) > 0;
  }
  function depositsFor(p, jobs, txs) {
    var jobIds = {};
    (jobs || []).forEach(function (j) { if (j && j.prospectId === p.id) jobIds[j.id] = true; });
    return (txs || []).filter(function (t) { return isDeposit(t) && (t.prospectId === p.id || (t.installId && jobIds[t.installId])); });
  }
  function depositTime(t) { return eventTime(t.recordedAt) || eventTime(t.createdAt) || eventTime(t.date); }
  function firstDeposit(p, jobs, txs) {
    var best = null, bestAt = null;
    depositsFor(p, jobs, txs).forEach(function (t) {
      var at = depositTime(t);
      if (at && (!bestAt || at < bestAt)) { best = t; bestAt = at; }
    });
    return best ? { tx: best, at: bestAt } : null;
  }

  // Everything earned in `period`, per rep. opts: { email (one rep only),
  // perQualified, perDeposit, users ([{email,name}] for display names) }.
  function earnings(prospects, jobs, txs, period, opts) {
    opts = opts || {};
    var perQ = Number(opts.perQualified) > 0 ? Number(opts.perQualified) : DEFAULTS.perQualified;
    var perD = Number(opts.perDeposit) > 0 ? Number(opts.perDeposit) : DEFAULTS.perDeposit;
    var names = {};
    (opts.users || []).forEach(function (u) { if (u && u.email) names[lc(u.email)] = u.name; });
    var reps = {};
    function rep(p) {
      var k = lc(p.createdByEmail);
      if (!reps[k]) reps[k] = { email: k, name: names[k] || p.createdBy || k, qualified: [], deposits: [], pendingQual: 0 };
      return reps[k];
    }
    (prospects || []).forEach(function (p) {
      if (!p || !p.createdByEmail || p.imported) return;
      if (opts.email && lc(p.createdByEmail) !== lc(opts.email)) return;
      if (p.qualStatus === "approved" && inPeriod(eventTime(p.qualApprovedAt), period)) rep(p).qualified.push({ id: p.id, business: p.business, at: eventTime(p.qualApprovedAt) });
      if (p.qualStatus === "pending") rep(p).pendingQual++;
      var fd = firstDeposit(p, jobs, txs);
      if (fd && inPeriod(fd.at, period)) rep(p).deposits.push({ id: p.id, business: p.business, at: fd.at, amount: Number(fd.tx.amount) || 0 });
    });
    var list = Object.keys(reps).map(function (k) {
      var r = reps[k];
      r.qualAmount = r.qualified.length * perQ;
      r.depositAmount = r.deposits.length * perD;
      r.total = r.qualAmount + r.depositAmount;
      return r;
    }).sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
    var total = list.reduce(function (s, r) { return s + r.total; }, 0);
    return { reps: list, total: total, perQualified: perQ, perDeposit: perD };
  }

  // Rep-side rule when a prospect is saved: reaching Qualified (or later)
  // asks the Team lead to approve; dropping back cancels a pending request;
  // editing a sent-back one re-submits it. Approved stays approved.
  function qualificationRequest(p, nowIso) {
    if (!p || p.imported) return false;      // no commission → nothing to approve
    var s = p.qualStatus || "";
    if (isQualStage(p.stage)) {
      if (s === "" || s === "query") { p.qualStatus = "pending"; p.qualRequestedAt = nowIso; return true; }
    } else if (s === "pending") {
      p.qualStatus = ""; p.qualRequestedAt = ""; return true;
    }
    return false;
  }

  root.VeriskoCommission = {
    payWeek: payWeek, eventTime: eventTime, label: label, inPeriod: inPeriod,
    isQualStage: isQualStage, isDeposit: isDeposit, depositsFor: depositsFor, firstDeposit: firstDeposit,
    earnings: earnings, qualificationRequest: qualificationRequest,
    QUAL_STAGES: QUAL_STAGES, DEFAULTS: DEFAULTS
  };
}(typeof window !== "undefined" ? window : globalThis));
