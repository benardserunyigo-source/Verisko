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


  /* ------------------------------------------------------------------------
   * Pay scheme 4 (from 3 Oct 2026). Pays only for proof:
   *   • Site visit carried out — config.perVisit (UGX 10,000), once per client,
   *     when Operations was on site and the client let us assess it for a
   *     quote, whatever they decide (appointment.visitResult = "real",
   *     visitResultAt = when). Paid in the pay week of visitResultAt.
   *   • Client deposit — config.commissionPerSale (UGX 100,000), once per
   *     client, only when the first deposit is APPROVED (money landed);
   *     counted in the week of approvedAt (or reviewedAt).
   *   • Monday float — config.floatAmount (UGX 50,000) for transport and
   *     food, paid each Monday to a Sales rep who had at least
   *     config.floatMinBookings (2) call-confirmed site bookings in the pay
   *     week that ended the Saturday before, or who is in their first
   *     config.floatGraceDays (14) days. A booking counts once the office
   *     called the customer and confirmed (appointment.callConfirmedAt), and
   *     stops counting if Operations marks that the visit didn't happen ("not_real").
   * Weeks that started before config.schemeStart keep the old rule (2,500 per
   * approved qualified prospect + 100,000 per recorded deposit) so past pay
   * history never changes.
   * --------------------------------------------------------------------- */
  var SCHEME4 = { perVisit: 10000, perDeposit: 100000, floatAmount: 50000, floatMinBookings: 2, floatGraceDays: 14 };
  var DAY_MS = 24 * 3600 * 1000;

  function approvalTime(t) { return eventTime(t.approvedAt) || eventTime(t.reviewedAt) || null; }
  function firstApprovedDeposit(p, jobs, txs) {
    var best = null, bestAt = null;
    depositsFor(p, jobs, txs).forEach(function (t) {
      if (t.status !== "approved") return;
      var at = approvalTime(t) || depositTime(t);
      if (at && (!bestAt || at < bestAt)) { best = t; bestAt = at; }
    });
    return best ? { tx: best, at: bestAt } : null;
  }
  // The first visit Operations carried out for this client (one pay per client).
  function firstRealVisit(p, appts) {
    var best = null, bestAt = null;
    (appts || []).forEach(function (a) {
      if (!a || a.prospectId !== p.id || a.visitResult !== "real") return;
      var at = eventTime(a.visitResultAt);
      if (at && (!bestAt || at < bestAt)) { best = a; bestAt = at; }
    });
    return best ? { appt: best, at: bestAt } : null;
  }
  // Call-confirmed bookings for one prospect owner in a period: one per
  // client, dated by the first confirmation, not counted once marked not real.
  function confirmedBookings(prospects, appts, period, email) {
    var owner = {};
    (prospects || []).forEach(function (p) { if (p && p.id && !p.imported) owner[p.id] = lc(p.createdByEmail); });
    var first = {};
    (appts || []).forEach(function (a) {
      if (!a || !owner[a.prospectId] || (email && owner[a.prospectId] !== lc(email))) return;
      if (a.visitResult === "not_real") return;
      var at = eventTime(a.callConfirmedAt);
      if (!at) return;
      if (!first[a.prospectId] || at < first[a.prospectId].at) first[a.prospectId] = { at: at, appt: a };
    });
    return Object.keys(first).filter(function (id) { return inPeriod(first[id].at, period); })
      .map(function (id) { return { prospectId: id, at: first[id].at, apptId: first[id].appt.id }; });
  }

  // Kampala Monday 00:00 of the week holding `now` (shift whole weeks).
  function mondayOf(now, shift) {
    var n = now instanceof Date ? now : new Date(now || Date.now());
    var local = new Date(n.getTime() + EAT_OFFSET_MS);
    var back = (local.getUTCDay() + 6) % 7;                     // days since Monday
    var mid = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back) - EAT_OFFSET_MS;
    return new Date(mid + (Number(shift) || 0) * WEEK_MS);
  }
  // The pay week a Monday float is judged on: the one ending the Saturday
  // before that Monday (Saturday noon to Saturday noon).
  function floatWeekFor(monday) { return payWeek(new Date(monday.getTime() - 2 * DAY_MS + 1), 0); }
  // The Monday whose float a pay week decides (the Monday after it ends).
  function floatMondayFor(week) { return mondayOf(new Date(week.end.getTime() + 2 * DAY_MS), 0); }

  // Monday float for one rep. user: { email, created (YYYY-MM-DD), role }.
  // opts: { floatAmount, floatMinBookings, floatGraceDays, floatStart }.
  function floatFor(user, prospects, appts, monday, opts) {
    opts = opts || {};
    var amount = num(opts.floatAmount, SCHEME4.floatAmount);
    var min = num(opts.floatMinBookings, SCHEME4.floatMinBookings);
    var grace = opts.floatGraceDays === 0 ? 0 : num(opts.floatGraceDays, SCHEME4.floatGraceDays);
    var start = eventTime(opts.floatStart);
    var week = floatWeekFor(monday);
    var bookings = confirmedBookings(prospects, appts, week, user && user.email);
    var joined = eventTime(user && user.created);
    var inGrace = !!joined && grace > 0 && monday.getTime() - joined.getTime() < grace * DAY_MS;
    var active = !start || monday >= start;
    var earned = active && (inGrace || bookings.length >= min);
    return {
      monday: monday, week: week, bookings: bookings, needed: min, inGrace: inGrace, active: active,
      earned: earned, amount: earned ? amount : 0, fullAmount: amount,
      reason: !active ? "starts " + label(start) : inGrace ? "first " + Math.round(grace / 7) + " weeks" : earned ? bookings.length + " confirmed bookings" : "only " + bookings.length + " of " + min + " confirmed bookings"
    };
  }
  function num(v, d) { var n = Number(v); return v !== undefined && v !== null && v !== "" && n >= 0 && !isNaN(n) ? n : d; }

  // Is `period` on scheme 4? opts.schemeStart (ISO) — weeks that START on or
  // after it. No schemeStart = scheme 4 always.
  function isScheme4(period, opts) {
    var s = eventTime(opts && opts.schemeStart);
    return !s || period.start.getTime() >= s.getTime() - 1000;
  }

  // Scheme 4 earnings in `period`, per rep (Saturday-noon pay).
  // opts: { email, perVisit, perDeposit, users }.
  function earnings4(prospects, appts, jobs, txs, period, opts) {
    opts = opts || {};
    var perV = num(opts.perVisit, SCHEME4.perVisit), perD = Number(opts.perDeposit) > 0 ? Number(opts.perDeposit) : SCHEME4.perDeposit;
    var names = {};
    (opts.users || []).forEach(function (u) { if (u && u.email) names[lc(u.email)] = u.name; });
    var reps = {};
    function rep(p) {
      var k = lc(p.createdByEmail);
      if (!reps[k]) reps[k] = { email: k, name: names[k] || p.createdBy || k, visits: [], deposits: [], qualified: [], pendingQual: 0, bookings: 0 };
      return reps[k];
    }
    (prospects || []).forEach(function (p) {
      if (!p || !p.createdByEmail || p.imported) return;
      if (opts.email && lc(p.createdByEmail) !== lc(opts.email)) return;
      var v = firstRealVisit(p, appts);
      if (v && inPeriod(v.at, period)) rep(p).visits.push({ id: p.id, business: p.business, at: v.at });
      var d = firstApprovedDeposit(p, jobs, txs);
      if (d && inPeriod(d.at, period)) rep(p).deposits.push({ id: p.id, business: p.business, at: d.at, amount: Number(d.tx.amount) || 0 });
    });
    confirmedBookings(prospects, appts, period, opts.email).forEach(function (b) {
      var p = (prospects || []).find(function (x) { return x.id === b.prospectId; });
      if (p) rep(p).bookings++;
    });
    var list = Object.keys(reps).map(function (k) {
      var r = reps[k];
      r.visitAmount = r.visits.length * perV;
      r.depositAmount = r.deposits.length * perD;
      r.qualAmount = 0;
      r.total = r.visitAmount + r.depositAmount;
      return r;
    }).sort(function (a, b) { return b.total - a.total || a.name.localeCompare(b.name); });
    return { scheme: 4, reps: list, total: list.reduce(function (s, r) { return s + r.total; }, 0), perVisit: perV, perDeposit: perD };
  }

  // One entry point for any week: scheme 4 from schemeStart, the old rule
  // before it. data: { prospects, appointments, jobs, transactions }.
  function weekPay(data, period, opts) {
    data = data || {};
    // A period that straddles the switch (e.g. month to date): old rule up to
    // schemeStart, scheme 4 after it, added together per rep.
    var sw = eventTime(opts && opts.schemeStart);
    if (sw && period.start < sw && period.end > sw) {
      var a = weekPay(data, { start: period.start, end: sw }, opts), b = weekPay(data, { start: sw, end: period.end }, opts);
      var by = {};
      a.reps.concat(b.reps).forEach(function (r) {
        var m = by[r.email];
        if (!m) { by[r.email] = Object.assign({}, r, { visits: (r.visits || []).slice(), deposits: r.deposits.slice(), qualified: (r.qualified || []).slice() }); return; }
        m.visits = m.visits.concat(r.visits || []); m.deposits = m.deposits.concat(r.deposits); m.qualified = m.qualified.concat(r.qualified || []);
        m.visitAmount = (m.visitAmount || 0) + (r.visitAmount || 0); m.depositAmount = (m.depositAmount || 0) + (r.depositAmount || 0);
        m.qualAmount = (m.qualAmount || 0) + (r.qualAmount || 0); m.bookings = (m.bookings || 0) + (r.bookings || 0); m.total += r.total;
      });
      var reps = Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return y.total - x.total || x.name.localeCompare(y.name); });
      return { scheme: 4, mixed: true, reps: reps, total: a.total + b.total, perVisit: b.perVisit, perDeposit: b.perDeposit };
    }
    if (isScheme4(period, opts)) return earnings4(data.prospects, data.appointments, data.jobs, data.transactions, period, opts);
    var e = earnings(data.prospects, data.jobs, data.transactions, period, opts);
    e.scheme = 3;
    e.reps.forEach(function (r) { r.visits = []; r.visitAmount = 0; r.bookings = 0; });
    return e;
  }

  root.VeriskoCommission = {
    payWeek: payWeek, eventTime: eventTime, label: label, inPeriod: inPeriod,
    isQualStage: isQualStage, isDeposit: isDeposit, depositsFor: depositsFor, firstDeposit: firstDeposit,
    earnings: earnings, qualificationRequest: qualificationRequest,
    QUAL_STAGES: QUAL_STAGES, DEFAULTS: DEFAULTS,
    SCHEME4: SCHEME4, earnings4: earnings4, weekPay: weekPay, isScheme4: isScheme4, floatFor: floatFor, floatWeekFor: floatWeekFor, floatMondayFor: floatMondayFor,
    mondayOf: mondayOf, confirmedBookings: confirmedBookings, firstRealVisit: firstRealVisit, firstApprovedDeposit: firstApprovedDeposit
  };
}(typeof window !== "undefined" ? window : globalThis));
