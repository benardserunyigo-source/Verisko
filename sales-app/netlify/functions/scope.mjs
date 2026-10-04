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
const COMMISSION_KEYS = ["commissionPerSale", "commissionPerQualified", "commissionTarget", "commissionRule", "payScheme", "schemeStart", "perVisit", "floatAmount", "floatMinBookings", "floatGraceDays", "floatStart"];
// Office-call and site-visit checks on a booking — written only by Operations/admin.
export const VISIT_CHECK_FIELDS = ["callConfirmedAt", "callConfirmedBy", "callConfirmedByEmail", "visitResult", "visitResultAt", "visitResultBy", "visitResultByEmail", "visitResultReason", "visitResultNote"];
const LEAD_QUAL_FIELDS = ["qualStatus", "qualApprovedBy", "qualApprovedAt", "qualNote", "qualReason", "qualDecidedAt", "qualSeen"];
const QUAL_STATUSES = ["", "pending", "approved", "query", "disqualified"];
// The planned next follow-up. Whoever changes it stamps followUpPlannedAt, so
// a phone holding an older copy can't overwrite a newer plan.
const PLAN_FIELDS = ["followUp", "nextAction", "followUpPlannedBy", "followUpPlannedByEmail", "followUpPlannedAt"];
const followKey = (f) => [f && f.at, lc(f && f.byEmail), f && f.note].join("|");

const jobStub = (j) => ({ id: j.id, ref: j.ref, prospectId: j.prospectId, stage: j.stage, createdAt: j.createdAt });
// Client money in that isn't sent back — what earns deposit commission.
const isClientDeposit = (t) => !!t && t.direction === "in" && t.status !== "query";
const depositStub = (t) => ({ id: t.id, direction: "in", status: t.status, amount: t.amount, date: t.date, createdAt: t.createdAt, recordedAt: t.recordedAt || "", reviewedAt: t.reviewedAt || "", approvedAt: t.approvedAt || "", prospectId: t.prospectId || "", installId: t.installId || "" });
const commissionConfig = (data) => {
  const cfg = data.config && typeof data.config === "object" ? data.config : {};
  const out = {};
  COMMISSION_KEYS.forEach((k) => { if (cfg[k] !== undefined) out[k] = cfg[k]; });
  return out;
};

// Training progress (Support centre): { [userId]: { [videoId]: isoTime } }.
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const userFor = (data, email) => arr(data.users).find((u) => lc(u.email) === lc(email)) || null;
function cleanWatched(w) {
  const out = {};
  Object.keys(obj(w)).slice(0, 60).forEach((k) => {
    const v = w[k];
    if (/^[a-z0-9-]{1,20}$/.test(k) && typeof v === "string" && v.length <= 40) out[k] = v;
  });
  return out;
}
// Everyone may change only their own entry; everyone else's stays as stored.
export function mergeTraining(stored, incoming, userId) {
  const out = { ...obj(stored) };
  if (!userId) return out;
  const mine = obj(incoming)[userId];
  if (mine === undefined) return out;
  const clean = cleanWatched(mine);
  if (Object.keys(clean).length) out[userId] = clean; else delete out[userId];
  return out;
}

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
  const me = userFor(data, email);
  const training = me && obj(data.training)[me.id] ? { [me.id]: obj(data.training)[me.id] } : {};
  return { prospects, appointments, users, transactions, jobs, technicians: [], quotes: [], installations: [], config: commissionConfig(data), training };
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
  return { prospects: arr(data.prospects), appointments: arr(data.appointments), users, transactions, jobs, technicians: [], quotes: [], installations: [], config: commissionConfig(data), training: obj(data.training) };
}

// A rep (or a Team lead on their own prospect) may only ask for qualification
// or withdraw the ask; approving, disqualifying and the lead's notes are kept
// exactly as stored. Approved stays approved; a disqualified lead stays
// disqualified (and Lost) until the Team lead or Operations re-open it. The
// rep may only mark the reason as read (qualSeen).
export function guardRepQual(p, prev) {
  const w = prev || {};
  const ws = w.qualStatus || "", ps = p.qualStatus || "";
  const keepLead = { qualApprovedBy: w.qualApprovedBy || "", qualApprovedAt: w.qualApprovedAt || "", qualNote: w.qualNote || "", qualReason: w.qualReason || "", qualDecidedAt: w.qualDecidedAt || "" };
  if (ws === "disqualified") {
    return { ...p, ...keepLead, qualStatus: ws, qualRequestedAt: w.qualRequestedAt || "", stage: w.stage || p.stage, qualSeen: !!(p.qualSeen || w.qualSeen) };
  }
  if (ws !== "approved" && (ps === "" || ps === "pending")) {
    return { ...p, ...keepLead, qualStatus: ps, qualRequestedAt: ps === "pending" ? (p.qualRequestedAt || w.qualRequestedAt || "") : "" };
  }
  return { ...p, ...keepLead, qualStatus: ws, qualRequestedAt: w.qualRequestedAt || "" };
}

// Follow-up history is append-only for every role: entries already stored are
// never dropped or edited, and new ones from the device are added.
export function keepFollowUps(storedProspects, prospects) {
  const prevById = new Map(arr(storedProspects).map((p) => [p.id, p]));
  return arr(prospects).map((p) => {
    const prev = p && prevById.get(p.id);
    if (!prev || !arr(prev.followUps).length) return p;
    const seen = new Set(arr(prev.followUps).map(followKey));
    const added = arr(p.followUps).filter((f) => f && !seen.has(followKey(f)));
    return { ...p, followUps: arr(prev.followUps).concat(added) };
  });
}

// The newer follow-up plan wins (see PLAN_FIELDS).
export function keepNewerPlan(storedProspects, prospects) {
  const prevById = new Map(arr(storedProspects).map((p) => [p.id, p]));
  return arr(prospects).map((p) => {
    const prev = p && prevById.get(p.id);
    if (!prev || !prev.followUpPlannedAt || String(p.followUpPlannedAt || "") >= String(prev.followUpPlannedAt)) return p;
    const out = { ...p };
    PLAN_FIELDS.forEach((k) => { out[k] = prev[k] === undefined ? "" : prev[k]; });
    return out;
  });
}

// Leads the Admin imported (Instagram / Google search lists) earn no
// commission; only the Admin can change that or their import stamp.
const IMPORT_FIELDS = ["imported", "importedAt", "importedBy", "importBatch"];
export function keepImported(storedProspects, prospects) {
  const prevById = new Map(arr(storedProspects).map((p) => [p.id, p]));
  return arr(prospects).map((p) => {
    const prev = p && prevById.get(p.id);
    if (!prev || !prev.imported) return p;
    const out = { ...p };
    IMPORT_FIELDS.forEach((k) => { out[k] = prev[k] === undefined ? "" : prev[k]; });
    return out;
  });
}

// Merge a Team lead's POST: their own records like a rep. On everyone else's
// prospects: the qualification decision (approve, disqualify with a reason,
// re-open), the planned follow-up, and new call notes they logged themselves.
// New client deposits are appended (always pending, stamped with their
// email). Nothing else changes.
export function mergeTeamLeadWrite(stored, incoming, email) {
  const base = mergeSalesWrite(stored, incoming, email);
  const incById = new Map(arr(incoming.prospects).filter((p) => p && p.id).map((p) => [p.id, p]));
  const prospects = base.prospects.map((p) => {
    if (ownsProspect(p, email)) return p;
    const inc = incById.get(p.id);
    if (!inc) return p;
    const out = { ...p };
    LEAD_QUAL_FIELDS.forEach((k) => { if (inc[k] !== undefined) out[k] = inc[k]; });
    if (!QUAL_STATUSES.includes(out.qualStatus || "")) out.qualStatus = p.qualStatus || "";
    // Disqualifying moves the lead to Lost; re-opening puts it back in play.
    const was = p.qualStatus || "", now = out.qualStatus || "";
    if (now === "disqualified" && was !== "disqualified") out.stage = "Lost";
    else if (was === "disqualified" && now !== "disqualified" && typeof inc.stage === "string" && inc.stage !== "Lost") out.stage = inc.stage;
    if (String(inc.followUpPlannedAt || "") > String(p.followUpPlannedAt || "")) {
      PLAN_FIELDS.forEach((k) => { out[k] = inc[k] === undefined ? "" : inc[k]; });
      out.followUpPlannedByEmail = lc(email);
    }
    const seen = new Set(arr(p.followUps).map(followKey));
    const mine = arr(inc.followUps).filter((f) => f && !seen.has(followKey(f)) && lc(f.byEmail) === lc(email))
      .map((f) => ({ ...f, note: String(f.note || "").slice(0, 1000) }));
    if (mine.length) out.followUps = arr(p.followUps).concat(mine);
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

// Sales and Team lead devices can't mark a booking as office-confirmed or a
// visit as real / not real (those trigger pay): keep exactly what the server
// holds, and blank them on a brand-new booking.
export function guardVisitChecks(storedAppointments, appointments) {
  const prevById = new Map(arr(storedAppointments).map((a) => [a.id, a]));
  return arr(appointments).map((a) => {
    if (!a) return a;
    const prev = prevById.get(a.id) || {};
    const out = { ...a };
    VISIT_CHECK_FIELDS.forEach((k) => {
      if (prev[k] === undefined || prev[k] === "") delete out[k];
      else out[k] = prev[k];
    });
    return out;
  });
}
