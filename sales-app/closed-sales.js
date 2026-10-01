// Verisko Uganda Operations — closed sales follow the client's decision.
//
// A prospect is a closed sale when one of its jobs (quotes) has been accepted
// (stage Accepted or any later delivery stage), or when a client deposit has
// been recorded for it (money in, not sent back). If every linked job is back in
// Draft/Sent, or Rejected/Cancelled, the prospect is open again. Prospects
// with no job at all are left exactly as they are (legacy manual closes).
(function (root) {
  "use strict";

  var DEFAULT_WON = ["Accepted", "Scheduled", "In progress", "Installed", "Handed over"];

  // Mutates prospects in place. Returns [{ id, business, from, to }] for every
  // prospect whose closed state changed, so the caller can decide to save.
  function reconcile(prospects, jobs, today, wonStages, txs) {
    var won = wonStages && wonStages.length ? wonStages : DEFAULT_WON;
    var byProspect = {};
    (jobs || []).forEach(function (j) {
      if (!j || !j.prospectId) return;
      (byProspect[j.prospectId] = byProspect[j.prospectId] || []).push(j);
    });
    var paid = {};
    var jobOwner = {};
    (jobs || []).forEach(function (j) { if (j && j.prospectId) jobOwner[j.id] = j.prospectId; });
    (txs || []).forEach(function (t) {
      if (!t || t.direction !== "in" || t.status === "query" || !(Number(t.amount) > 0)) return;
      var pid = t.prospectId || (t.installId && jobOwner[t.installId]);
      if (pid) paid[pid] = true;
    });
    var changes = [];
    (prospects || []).forEach(function (p) {
      if (!p || !p.id) return;
      var linked = byProspect[p.id] || [];
      if (!linked.length && !paid[p.id]) return;
      var accepted = paid[p.id] || linked.some(function (j) { return won.indexOf(j.stage) >= 0; });
      if (accepted && !p.closedSale) {
        p.closedSale = true; p.closedAuto = true; p.closedBy = paid[p.id] && !linked.some(function (j) { return won.indexOf(j.stage) >= 0; }) ? "Client deposit" : "Quote accepted"; p.closedAt = today || "";
        changes.push({ id: p.id, business: p.business || "", from: false, to: true });
      } else if (!accepted && p.closedSale) {
        p.closedSale = false; p.closedAuto = false; p.closedBy = ""; p.closedAt = "";
        changes.push({ id: p.id, business: p.business || "", from: true, to: false });
      }
    });
    return changes;
  }

  // The job that best represents a prospect's quote: an accepted one first,
  // otherwise the most recently created.
  function quoteFor(prospectId, jobs, wonStages) {
    var won = wonStages && wonStages.length ? wonStages : DEFAULT_WON;
    var linked = (jobs || []).filter(function (j) { return j && j.prospectId === prospectId; });
    if (!linked.length) return null;
    var acc = linked.filter(function (j) { return won.indexOf(j.stage) >= 0; });
    var pool = acc.length ? acc : linked;
    return pool.slice().sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); })[0];
  }

  root.VeriskoClosedSales = { reconcile: reconcile, quoteFor: quoteFor, DEFAULT_WON: DEFAULT_WON };
}(typeof window !== "undefined" ? window : globalThis));
