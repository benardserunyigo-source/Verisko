// Verisko Sales Visit Planner — shared data API backed by Netlify Blobs.
//
// Every request must carry a session (Authorization: Bearer <token>): either a
// Supabase email session, verified with Supabase, or a staff phone + PIN
// session issued by /api/auth (pin-auth.mjs). The caller must be on the team
// allow-list (the `users` list). The very first sign-in on
// an empty workspace bootstraps the owner. Non-admins cannot alter the team
// list. Both Supabase values below are public (publishable) and safe to ship.
import { getStore } from "@netlify/blobs";
import { AUTH_STORE, STAFF_STORE, identify, protectPinUsers, displayPhone, idOverdue } from "./pin-auth.mjs";
import { supabaseUser } from "./auth.mjs";
import { scopeForSales, mergeSalesWrite, scopeForTeamLead, mergeTeamLeadWrite, guardRepQual, ownsProspect, keepFollowUps, keepNewerPlan, keepImported, mergeTraining, guardVisitChecks } from "./scope.mjs";

const STORE = "verisko-sales";
const KEY = "app-data";
// `jobs` is the merged quote+installation record. `quotes`/`installations` are
// kept (normally empty) so a mid-transition client still holding them isn't
// rejected; they're deprecated and folded into `jobs` client-side on load.
const EMPTY = { prospects: [], appointments: [], users: [], transactions: [], jobs: [], technicians: [], quotes: [], installations: [], config: {}, training: {} };

export default async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  try {
    // 1) Load data and identify the caller (email or staff PIN session).
    const store = getStore(STORE);
    const data = (await store.get(KEY, { type: "json" })) || EMPTY;
    const users = Array.isArray(data.users) ? data.users : [];
    const who = await identify(request, data, { authStore: getStore(AUTH_STORE), now: Date.now(), supabaseUser });
    if (who.error) return json({ ok: false, error: who.error }, who.status, headers);
    const email = who.email;

    // 2) Check the allow-list.
    const bootstrap = users.length === 0;                              // brand-new workspace
    const me = who.me;
    // Staff who haven't added their National ID within 5 days can only do
    // that (via /api/auth submitId) until they have.
    if (idOverdue(me, Date.now())) return json({ ok: false, error: "id_overdue" }, 403, headers);
    if (!me && !bootstrap) return json({ ok: false, error: "not_authorized" }, 403, headers);
    const isAdmin = bootstrap || (me && me.role === "admin");
    const isTeamLead = !bootstrap && !!me && me.role === "teamlead";
    const isSales = !bootstrap && !!me && me.role !== "admin" && me.role !== "operations" && me.role !== "teamlead";

    if (request.method === "GET") {
      // A salesperson only ever receives their own records (scope.mjs).
      if (isSales) return json({ ok: true, data: { ...EMPTY, ...scopeForSales(data, email) } }, 200, headers);
      if (isTeamLead) return json({ ok: true, data: { ...EMPTY, ...scopeForTeamLead(data, email) } }, 200, headers);
      const out = { ...EMPTY, ...data };
      // Owner/Operations: staff sign-ups waiting for approval (no ID photos —
      // those are fetched one at a time from /api/auth).
      if (isAdmin || (me && me.role === "operations")) out.signups = await pendingSignups();
      // The spreadsheet export key is Owner/Technical-only: never send it to
      // Sales or Operations devices.
      if (!isAdmin && out.config && typeof out.config === "object") {
        const { exportKey, ...rest } = out.config;
        out.config = rest;
      }
      return json({ ok: true, data: out }, 200, headers);
    }

    if (request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      if (!payload || !payload.data) throw new Error("Missing application data.");
      const incoming = payload.data;
      const storedTx = Array.isArray(data.transactions) ? data.transactions : [];
      const storedProspects = Array.isArray(data.prospects) ? data.prospects : [];
      const storedAppointments = Array.isArray(data.appointments) ? data.appointments : [];
      const storedJobs = Array.isArray(data.jobs) ? data.jobs : [];
      const storedTechs = Array.isArray(data.technicians) ? data.technicians : [];
      const storedConfig = data.config && typeof data.config === "object" && !Array.isArray(data.config) ? data.config : {};
      const clean = {
        prospects: Array.isArray(incoming.prospects) ? incoming.prospects : [],
        appointments: Array.isArray(incoming.appointments) ? incoming.appointments : [],
        users: Array.isArray(incoming.users) ? incoming.users : [],
        transactions: Array.isArray(incoming.transactions) ? incoming.transactions : [],
        jobs: Array.isArray(incoming.jobs) ? incoming.jobs : [],
        technicians: Array.isArray(incoming.technicians) ? incoming.technicians : [],
        // Deprecated — carried through (normally empty) until every client migrates.
        quotes: Array.isArray(incoming.quotes) ? incoming.quotes : [],
        installations: Array.isArray(incoming.installations) ? incoming.installations : [],
        config: incoming.config && typeof incoming.config === "object" && !Array.isArray(incoming.config) ? incoming.config : {},
        // Support centre: each person can only record their own videos watched.
        training: mergeTraining(data.training, incoming.training, me && me.id)
      };
      const canCash = isAdmin || (me && me.role === "operations");
      const canReview = isAdmin || (me && me.role === "operations"); // prospect audit

      // A Sales device only holds its own records: merge them into the stored
      // workspace and keep every other rep's prospects and visits as stored.
      if (isSales || isTeamLead) {
        const merged = isTeamLead ? mergeTeamLeadWrite(data, clean, email) : mergeSalesWrite(data, clean, email);
        clean.prospects = merged.prospects;
        clean.appointments = merged.appointments;
        if (isTeamLead) clean.transactions = merged.transactions;
        clean.quotes = Array.isArray(data.quotes) ? data.quotes : [];
        clean.installations = Array.isArray(data.installations) ? data.installations : [];
      }

      // Every role: call notes are never lost (append-only) and a phone with
      // an older copy can't overwrite a newer follow-up plan.
      clean.prospects = keepNewerPlan(storedProspects, keepFollowUps(storedProspects, clean.prospects));
      // Only the Admin can un-mark an imported (no-commission) lead.
      if (!isAdmin) clean.prospects = keepImported(storedProspects, clean.prospects);

      // Prospect audit (Sales roles only): can't self-approve, and can't delete
      // an approved prospect or a site visit tied to one — that would erase the
      // audit trail. Operations/admins are unrestricted.
      if (!canReview) {
        const prevById = Object.fromEntries(storedProspects.map((p) => [p.id, p]));
        if (JSON.stringify(clean.prospects) !== JSON.stringify(storedProspects)) {
          clean.prospects = clean.prospects.map((p) => {
            const prev = prevById[p.id];
            // Reps only ask for qualification; the Team lead decides.
            if (p && ownsProspect(prev || p, email)) p = guardRepQual(p, prev);
            // Sales can't self-approve.
            if (p && p.reviewStatus === "approved" && (!prev || prev.reviewStatus !== "approved")) {
              return prev || { ...p, reviewStatus: "pending", reviewedBy: "", reviewedAt: "", reviewNote: "" };
            }
            // Closed sales follow accepted quotes and are written only by
            // Operations/admin devices: a Sales device can neither close nor
            // re-open a sale, so keep whatever the server already holds.
            if (p) {
              const keep = prev
                ? { closedSale: !!prev.closedSale, closedAuto: !!prev.closedAuto, closedBy: prev.closedBy || "", closedAt: prev.closedAt || "" }
                : { closedSale: false, closedAuto: false, closedBy: "", closedAt: "" };
              if (!!p.closedSale !== keep.closedSale || !!p.closedAuto !== keep.closedAuto || (p.closedBy || "") !== keep.closedBy || (p.closedAt || "") !== keep.closedAt) {
                return { ...p, ...keep };
              }
            }
            return p;
          });
        }
        // Restore any approved prospect the caller tried to remove.
        const keptIds = new Set(clean.prospects.map((p) => p.id));
        storedProspects.forEach((prev) => {
          if (prev.reviewStatus === "approved" && !keptIds.has(prev.id)) clean.prospects.push(prev);
        });
        // Restore site visits tied to a still-approved prospect if removed.
        const approvedIds = new Set(clean.prospects.filter((p) => p.reviewStatus === "approved").map((p) => p.id));
        const keptApptIds = new Set(clean.appointments.map((a) => a.id));
        storedAppointments.forEach((prev) => {
          if (approvedIds.has(prev.prospectId) && !keptApptIds.has(prev.id)) clean.appointments.push(prev);
        });
      }

      // Pay scheme 4: only Operations/admin confirm a booking by phone or mark
      // a site visit real / not real — those earn the rep pay.
      if (!canReview) clean.appointments = guardVisitChecks(storedAppointments, clean.appointments);

      // Team roster: admins manage everyone. Operations manage only the
      // non-admin roster (Sales/Operations) — never the Owner or Technical
      // accounts, and can never grant admin. Sales can't change it at all.
      if (!isAdmin && JSON.stringify(clean.users) !== JSON.stringify(users)) {
        clean.users = canReview ? sanitizeRoster(users, clean.users) : users;
      }
      // Staff PIN accounts are managed through /api/auth (approve, remove):
      // a device can only change their role.
      clean.users = protectPinUsers(users, clean.users);
      // Workspace config: Operations may set commission fields; the petty-cash
      // limit stays admin-only; Sales can't change any of it.
      if (!isAdmin && JSON.stringify(clean.config) !== JSON.stringify(storedConfig)) {
        clean.config = canReview ? { ...clean.config, pettyLimit: storedConfig.pettyLimit, exportKey: storedConfig.exportKey } : storedConfig;
      }
      // An admin device that never received the export key (stale cache) must
      // not wipe it; only an explicit value (or empty string) replaces it.
      if (isAdmin && storedConfig.exportKey && clean.config.exportKey === undefined) {
        clean.config = { ...clean.config, exportKey: storedConfig.exportKey };
      }
      // Jobs (quote→installation lifecycle) & technicians are Operations/admin
      // only — Sales can't touch them.
      if (!canReview) {
        if (JSON.stringify(clean.jobs) !== JSON.stringify(storedJobs)) clean.jobs = storedJobs;
        if (JSON.stringify(clean.technicians) !== JSON.stringify(storedTechs)) clean.technicians = storedTechs;
      }

      // Cash flow: Sales cannot touch transactions; only admins may approve.
      // (A Team lead's new deposits were already vetted by mergeTeamLeadWrite.)
      if (!isTeamLead && JSON.stringify(clean.transactions) !== JSON.stringify(storedTx)) {
        if (!canCash) {
          clean.transactions = storedTx; // Sales roles cannot write cash entries at all
        } else if (!isAdmin) {
          const prevById = Object.fromEntries(storedTx.map((t) => [t.id, t]));
          clean.transactions = clean.transactions.map((t) => {
            const prev = prevById[t.id];
            // Operations cannot approve — revert any new/changed approval to its prior state (pending).
            if (t && t.status === "approved" && (!prev || prev.status !== "approved")) {
              return prev || { ...t, status: "pending", reviewedBy: "", reviewedAt: "", reviewNote: "", approvedAt: "" };
            }
            // The approval time decides which week deposit commission is paid in.
            if (t && (t.approvedAt || "") !== ((prev && prev.approvedAt) || "")) return { ...t, approvedAt: (prev && prev.approvedAt) || "" };
            return t;
          });
        }
      }

      await store.setJSON(KEY, clean);
      return json({ ok: true }, 200, headers);
    }

    return json({ ok: false, error: "method_not_allowed" }, 405, headers);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error.message || "Storage error." }, 500, headers);
  }
};

async function pendingSignups() {
  const staff = getStore(STAFF_STORE);
  const { blobs } = await staff.list({ prefix: "staff/" });
  const out = [];
  for (const b of blobs || []) {
    const r = await staff.get(b.key, { type: "json" });
    if (r && r.status === "pending") out.push({ id: r.id, legalName: r.legalName, phone: displayPhone(r.phone), nin: r.nin, signupAt: r.signupAt, hasBack: !!r.idBack });
  }
  return out.sort((a, b) => String(a.signupAt).localeCompare(String(b.signupAt)));
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

// Apply an Operations roster edit while protecting Owner/Technical accounts and
// preventing any grant of admin. Returns the sanitized users list.
function sanitizeRoster(stored, incoming) {
  const inc = Array.isArray(incoming) ? incoming : [];
  const ownerId = stored[0] && stored[0].id;
  const incById = Object.fromEntries(inc.map((u) => [u.id, u]));
  const storedById = Object.fromEntries(stored.map((u) => [u.id, u]));
  const result = [];
  // Owner and all Technical (admin) accounts are kept exactly as stored.
  for (const su of stored) {
    if (su.id === ownerId || su.role === "admin") { result.push(su); continue; }
    const u = incById[su.id];
    if (!u) continue; // Operations removed this non-admin member — allowed.
    const role = u.role === "operations" || u.role === "sales" || u.role === "teamlead" ? u.role : su.role; // never admin
    result.push({ ...su, name: u.name || su.name, role });
  }
  // New members may only be Sales, Team lead or Operations.
  const emails = new Set(result.map((u) => String(u.email || "").toLowerCase()));
  for (const u of inc) {
    if (storedById[u.id]) continue;
    const email = String(u.email || "").toLowerCase();
    if (!email || emails.has(email)) continue;
    const role = u.role === "operations" ? "operations" : u.role === "teamlead" ? "teamlead" : "sales";
    result.push({ id: u.id, name: u.name || "", email, role, created: u.created });
    emails.add(email);
  }
  return result;
}
