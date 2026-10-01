// Verisko Uganda Operations — what a Sales account may see and change.
//
// Roles: "admin" (Owner/Technical) and "operations" see everything.
// "teamlead" sees every prospect and visit (to approve qualifications) and may
// record client deposits, but no cash book, team emails or settings.
// "sales" sees only their own records.
//
// A salesperson only ever receives their own prospects (createdByEmail), the
// site visits for those prospects, and the minimum needed to show their own
// dashboard: the stage of jobs for their clients and the client payments that
// earn commission. No other rep's records, no team emails, no cash book.
// Operations and admin accounts are not scoped.

const lc = (v) => String(v || "").toLowerCase();
const arr = (v) => (Array.isArray(v) ? v : []);
const COMMISSION_KEYS = ["commissionPerSale", "commissionPerQualified", "commissionTarget", "commissionRule"];
const LEAD_QUAL_FIELDS = ["qualStatus", "qualApprovedBy", "qualApprovedAt", "qualNote"];

const jobStub = (j) => ({ id: j.id, ref: j.ref, prospectId: j.prospectId, stage: j.stage, createdAt: j.createdAt });
// Client money in that isn't sent back — what earns deposit commission.
const isClientDeposit = (t) => !!t && t.direction === "in" && t.status !== "query";
const depositStub = (t) => ({ id: t.id, direction: "in", status: t.status, amount: t.amount, date: t.date, createdAt: t.createdAt, recordedAt: t.recordedAt || "", prospectId: t.prospectId || "", installId: t.installId || "" });
const commissionConfig = (data) => {
  const cfg = data.config && typeof data.config === "object" ? data.config : {};
  const out = {};
  COMMISSION_KEYS.forEach((k) => { if (cfg[k] !== undefined) out[k] = cfg[k]; });
  return out;
};

export function ownsProspect(p, email) {
  return !!p && !!email && lc(p.createdByEmail) === lc(email);
}

// GET payload for a Sales account.
export function scopeForSales(data, email) {
  const prospects = arr(data.prospects).filter((p) => ownsProspect(p, email));
  const myIds = new Set(prospects.map((p) => p.id));
  const appointments = arr(data.appointments).filter((a) => myIds.has(a.prospectId));
  const jobs = arr(data.jobs).filter((j) => myIds.has(j.prospectId)).map(jobStub);
  const jobIds = new Set(jobs.map((j) => j.id));
  // Client deposits for their own clients — what earns deposit commission.
  const transactions = arr(data.transactions)
    .filter((t) => isClientDeposit(t) && (myIds.has(t.prospectId) || (t.installId && jobIds.has(t.installId))))
    .map(depositStub);
  // Themselves in full; Operations/admin by name only (visit owner list).
  const users = arr(data.users)
    .filter((u) => lc(u.email) === lc(email) || u.role === "operations" || u.role === "admin")
    .map((u) => (lc(u.email) === lc(email) ? u : { id: u.id, name: u.name, role: u.role }));
  return { prospects, appointments, users, transactions, jobs, technicians: [], quotes: [], installations: [], config: commissionConfig(data) };
}

// GET payload for a Team lead: every prospect and visit, job stubs, client
// deposits, names (no emails except their own), commission settings.
export function scopeForTeamLead(data, email) {
  const jobs = arr(data.jobs).map(jobStub);
  const linkable = new Set(arr(data.prospects).map((p) => p.id));
  const jobIds = new Set(jobs.map((j) => j.id));
  const transactions = arr(data.transactions)
    .filter((t) => isClientDeposit(t) && (linkable.has(t.prospectId) || (t.installId && jobIds.has(t.installId))))
    .map(depositStub);
  const users = arr(data.users).map((u) => (lc(u.email) === lc(email) ? u : { id: u.id, name: u.name, role: u.role }));
  return { prospects: arr(data.prospects), appointments: arr(data.appointments), users, transactions, jobs, technicians: [], quotes: [], installations: [], config: commissionConfig(data) };
}

// A rep (or a Team lead on their own prospect) may only ask for qualification
// or withdraw the ask; approving, sending back and the lead's notes are kept
// exactly as stored. Approved stays approved.
export function guardRepQual(p, prev) {
  const w = prev || {};
  const ws = w.qualStatus || "", ps = p.qualStatus || "";
  const keepLead = { qualApprovedBy: w.qualApprovedBy || "", qualApprovedAt: w.qualApprovedAt || "", qualNote: w.qualNote || "" };
  if (ws !== "approved" && (ps === "" || ps === "pending")) {
    return { ...p, ...keepLead, qualStatus: ps, qualRequestedAt: ps === "pending" ? (p.qualRequestedAt || w.qualRequestedAt || "") : "" };
  }
  return { ...p, ...keepLead, qualStatus: ws, qualRequestedAt: w.qualRequestedAt || "" };
}

// Merge a Team lead's POST: their own records like a rep; on everyone else's
// prospects only the qualification decision; new client deposits appended
// (always pending, stamped with their email). Nothing else changes.
export function mergeTeamLeadWrite(stored, incoming, email) {
  const base = mergeSalesWrite(stored, incoming, email);
  const incById = new Map(arr(incoming.prospects).filter((p) => p && p.id).map((p) => [p.id, p]));
  const prospects = base.prospects.map((p) => {
    if (ownsProspect(p, email)) return p;
    const inc = incById.get(p.id);
    if (!inc) return p;
    const out = { ...p };
    LEAD_QUAL_FIELDS.forEach((k) => { if (inc[k] !== undefined) out[k] = inc[k]; });
    if (!["", "pending", "approved", "query"].includes(out.qualStatus || "")) out.qualStatus = p.qualStatus || "";
    return out;
  });
  const storedTx = arr(stored.transactions);
  const seen = new Set(storedTx.map((t) => t.id));
  const pids = new Set(prospects.map((p) => p.id));
  const jobIds = new Set(arr(stored.jobs).map((j) => j.id));
  const added = arr(incoming.transactions)
    .filter((t) => t && t.id && !seen.has(t.id) && t.direction === "in" && Number(t.amount) > 0 && (pids.has(t.prospectId) || jobIds.has(t.installId)))
    .map((t) => ({
      id: t.id, direction: "in", amount: Math.round(Number(t.amount)), date: t.date || "", category: t.category || "Customer deposit",
      method: t.method || "", prospectId: t.prospectId || "", installId: jobIds.has(t.installId) ? t.installId : "",
      note: String(t.note || "").slice(0, 500), proofId: "", preapproved: false,
      createdBy: t.createdBy || "", createdByEmail: lc(email), createdAt: t.createdAt || "", recordedAt: t.recordedAt || "",
      status: "pending", reviewedBy: "", reviewedAt: "", reviewNote: ""
    }));
  return { prospects, appointments: base.appointments, transactions: storedTx.concat(added) };
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
