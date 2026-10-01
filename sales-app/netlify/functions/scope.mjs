// Verisko Uganda Operations — what a Sales account may see and change.
//
// A salesperson only ever receives their own prospects (createdByEmail), the
// site visits for those prospects, and the minimum needed to show their own
// dashboard: the stage of jobs for their clients and the client payments that
// earn commission. No other rep's records, no team emails, no cash book.
// Operations and admin accounts are not scoped.

const lc = (v) => String(v || "").toLowerCase();
const arr = (v) => (Array.isArray(v) ? v : []);

export function ownsProspect(p, email) {
  return !!p && !!email && lc(p.createdByEmail) === lc(email);
}

// GET payload for a Sales account.
export function scopeForSales(data, email) {
  const prospects = arr(data.prospects).filter((p) => ownsProspect(p, email));
  const myIds = new Set(prospects.map((p) => p.id));
  const appointments = arr(data.appointments).filter((a) => myIds.has(a.prospectId));
  const jobs = arr(data.jobs).filter((j) => myIds.has(j.prospectId))
    .map((j) => ({ id: j.id, ref: j.ref, prospectId: j.prospectId, stage: j.stage, createdAt: j.createdAt }));
  const jobIds = new Set(jobs.map((j) => j.id));
  // Approved client payments for their own clients — this is what turns a
  // closed sale into earned commission on their dashboard.
  const transactions = arr(data.transactions)
    .filter((t) => t && t.direction === "in" && t.status === "approved" && (myIds.has(t.prospectId) || (t.installId && jobIds.has(t.installId))))
    .map((t) => ({ id: t.id, direction: "in", status: "approved", amount: t.amount, date: t.date, createdAt: t.createdAt, prospectId: t.prospectId || "", installId: t.installId || "" }));
  // Themselves in full; Operations/admin by name only (visit owner list).
  const users = arr(data.users)
    .filter((u) => lc(u.email) === lc(email) || u.role === "operations" || u.role === "admin")
    .map((u) => (lc(u.email) === lc(email) ? u : { id: u.id, name: u.name, role: u.role }));
  const cfg = data.config && typeof data.config === "object" ? data.config : {};
  const config = {};
  ["commissionPerSale", "commissionTarget", "commissionRule"].forEach((k) => { if (cfg[k] !== undefined) config[k] = cfg[k]; });
  return { prospects, appointments, users, transactions, jobs, technicians: [], quotes: [], installations: [], config };
}

// Merge a Sales account's POST into the stored workspace: their own records
// come from the device, everyone else's stay exactly as stored. A record the
// device sends that belongs to someone else is ignored; a brand-new prospect is
// stamped as theirs. Further Sales guards (no self-approval, no closing, no
// deleting approved records) still run afterwards in data.mjs.
export function mergeSalesWrite(stored, incoming, email) {
  const storedProspects = arr(stored.prospects);
  const storedById = new Map(storedProspects.map((p) => [p.id, p]));
  const incomingMine = [];
  arr(incoming.prospects).forEach((p) => {
    if (!p || !p.id) return;
    const prev = storedById.get(p.id);
    if (prev && !ownsProspect(prev, email)) return;              // someone else's — ignore
    incomingMine.push(prev ? p : { ...p, createdByEmail: lc(email) }); // new ⇒ theirs
  });
  const prospects = storedProspects.filter((p) => !ownsProspect(p, email)).concat(incomingMine);

  const myIds = new Set(incomingMine.map((p) => p.id));
  storedProspects.forEach((p) => { if (ownsProspect(p, email)) myIds.add(p.id); });
  const storedAppts = arr(stored.appointments);
  const storedApptById = new Map(storedAppts.map((a) => [a.id, a]));
  const apptMine = arr(incoming.appointments).filter((a) => {
    if (!a || !a.id || !myIds.has(a.prospectId)) return false;
    const prev = storedApptById.get(a.id);
    return !prev || myIds.has(prev.prospectId);
  });
  const appointments = storedAppts.filter((a) => !myIds.has(a.prospectId)).concat(apptMine);
  return { prospects, appointments };
}
