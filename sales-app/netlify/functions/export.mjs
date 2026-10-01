// Verisko Uganda Operations — read-only data export for spreadsheets.
//
// GET /api/export?key=<export key>&table=<name>            -> CSV (default)
// GET /api/export?key=<export key>&table=<name>&format=json -> JSON rows
// GET /api/export?key=<export key>                          -> JSON of every table
// GET /api/export?key=<export key>&photo=<id>               -> the stored photo (JPEG)
//
// Tables: prospects, visits, followups, jobs, transactions, users, technicians.
//
// Auth: the Owner generates the export key in Settings → "Live data export";
// it is stored as `config.exportKey` in the shared data blob and never shown to
// Sales or Operations accounts. Anyone holding the key can READ everything, so
// treat it like a password and rotate it from Settings if it leaks. Nothing here
// can write.
import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

const DATA_STORE = "verisko-sales";
const DATA_KEY = "app-data";
const RECEIPTS = "verisko-receipts";
const MIN_KEY_LENGTH = 16;

export default async (request) => {
  const url = new URL(request.url);
  const given = url.searchParams.get("key") || "";
  try {
    if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
    const data = (await getStore(DATA_STORE).get(DATA_KEY, { type: "json" })) || {};
    const expected = String((data.config && data.config.exportKey) || "");
    if (!keyMatches(given, expected)) return json({ ok: false, error: "bad_key" }, 401);

    const photo = url.searchParams.get("photo") || "";
    if (photo) return servePhoto(photo);

    // App problems reported from people's phones (newest first). Not part of
    // "all", so the spreadsheet never shows it.
    if ((url.searchParams.get("table") || "").toLowerCase() === "diagnostics") {
      const diag = getStore("verisko-diag");
      const { blobs } = await diag.list({ prefix: "err/" });
      const keys = (blobs || []).map((b) => b.key).sort().reverse().slice(0, 100);
      const rows = [];
      for (const k of keys) { const r = await diag.get(k, { type: "json" }); if (r) rows.push(r); }
      return json({ ok: true, table: "diagnostics", rows }, 200);
    }

    const base = `${url.origin}/api/export?key=${encodeURIComponent(given)}`;
    const tables = buildTables(data, base);
    const table = (url.searchParams.get("table") || "").toLowerCase();
    const format = (url.searchParams.get("format") || (table ? "csv" : "json")).toLowerCase();

    if (!table || table === "all") return json({ ok: true, exportedAt: new Date().toISOString(), tables }, 200);
    if (!tables[table]) return json({ ok: false, error: "unknown_table", tables: Object.keys(tables) }, 404);
    if (format === "json") return json({ ok: true, table, rows: tables[table] }, 200);
    return new Response(toCsv(tables[table], TABLE_COLUMNS[table]), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `inline; filename="verisko-${table}.csv"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e.message || "Export error." }, 500);
  }
};

function keyMatches(given, expected) {
  if (!given || !expected || expected.length < MIN_KEY_LENGTH) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function servePhoto(id) {
  const dataUrl = await getStore(RECEIPTS).get(id, { type: "text" });
  const m = dataUrl && /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(dataUrl);
  if (!m) return json({ ok: false, error: "not_found" }, 404);
  return new Response(Buffer.from(m[2], "base64"), {
    status: 200,
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" }
  });
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}

/* ----------------------------- Flattening ---------------------------------- */
// Base columns per table, in order. Extra flat fields on a record are appended
// after these. Emitting them even for an empty table means a spreadsheet's
// IMPORTDATA always gets a header row instead of an "empty content" error.
export const TABLE_COLUMNS = {
  prospects: ["id", "business", "type", "contact", "phone", "location", "source", "spoke_to_decision_maker", "existing_cameras", "budget", "stage", "next_action", "follow_up_date", "security_concern", "areas_to_cover", "notes", "created", "created_by", "created_by_email", "review_status", "reviewed_by", "reviewed_at", "review_note", "closed_sale", "closed_by", "closed_at", "first_payment_at", "commission_qualified", "gps_lat", "gps_lng", "gps_accuracy_m", "gps_captured_at", "gps_map_link", "photo_link", "follow_ups_count", "last_follow_up_at", "last_follow_up_note"],
  visits: ["id", "prospect_id", "business", "contact", "phone", "location", "date", "time", "operations_owner", "status", "purpose", "directions"],
  followups: ["prospect_id", "business", "n", "at", "by", "by_email", "note", "gps_lat", "gps_lng", "gps_accuracy_m", "gps_captured_at", "gps_map_link"],
  jobs: ["id", "ref", "stage", "prospect_id", "business", "created_at", "created_by", "created_by_email", "final_price", "materials_count", "materials_total", "materials"],
  transactions: ["id", "date", "direction", "amount", "category", "method", "prospect_id", "business", "job_id", "note", "preapproved", "status", "created_by", "created_by_email", "created_at", "reviewed_by", "reviewed_at", "review_note", "receipt_link"],
  users: ["id", "name", "email", "role", "created"],
  technicians: ["id", "name", "phone", "skills", "active", "created_at"]
};

// Each table has a preferred column order; any other flat field on a record is
// appended automatically so new app fields show up without a code change.

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const yes = (v) => (v ? "yes" : "no");

function geoCols(geo, prefix) {
  const g = geo && typeof geo === "object" ? geo : {};
  const lat = g.lat ?? g.latitude, lng = g.lng ?? g.lon ?? g.longitude;
  const has = typeof lat === "number" && typeof lng === "number";
  return {
    [prefix + "lat"]: has ? lat : "",
    [prefix + "lng"]: has ? lng : "",
    [prefix + "accuracy_m"]: has && g.accuracy != null ? Math.round(g.accuracy) : "",
    [prefix + "captured_at"]: g.at || g.capturedAt || "",
    [prefix + "map_link"]: has ? `https://maps.google.com/?q=${lat},${lng}` : ""
  };
}

export function buildTables(data, photoBase) {
  const prospects = arr(data.prospects), appointments = arr(data.appointments), jobs = arr(data.jobs);
  const transactions = arr(data.transactions), users = arr(data.users), technicians = arr(data.technicians);
  const byId = Object.fromEntries(prospects.map((p) => [p.id, p]));
  // Deposit commission: a client counts once their first deposit (money in,
  // pending or approved, not sent back) is recorded — via the job or directly.
  const jobsByProspect = {};
  jobs.forEach((j) => { if (j.prospectId) (jobsByProspect[j.prospectId] = jobsByProspect[j.prospectId] || []).push(j.id); });
  const firstPayment = (p) => {
    const jobIds = jobsByProspect[p.id] || [];
    const dates = transactions.filter((t) => t.direction === "in" && t.status !== "query" && Number(t.amount) > 0 &&
      (t.prospectId === p.id || (t.installId && jobIds.includes(t.installId))))
      .map((t) => t.date || t.createdAt || "").filter(Boolean).sort();
    return dates[0] || "";
  };
  const photoLink = (id) => (id && photoBase ? `${photoBase}&photo=${encodeURIComponent(id)}` : "");

  const prospectRows = prospects.map((p) => {
    const fu = arr(p.followUps);
    const last = fu[fu.length - 1] || {};
    return withExtras({
      id: p.id, business: p.business, type: p.vertical, contact: p.contact, phone: p.phone, location: p.location,
      source: p.source, spoke_to_decision_maker: p.decisionMaker, existing_cameras: p.existing, budget: p.budget,
      stage: p.stage, next_action: p.nextAction, follow_up_date: p.followUp, security_concern: p.concern,
      areas_to_cover: p.areas, notes: p.notes, created: p.created, created_by: p.createdBy, created_by_email: p.createdByEmail,
      review_status: p.reviewStatus, reviewed_by: p.reviewedBy, reviewed_at: p.reviewedAt, review_note: p.reviewNote,
      closed_sale: yes(p.closedSale), closed_by: p.closedBy, closed_at: p.closedAt,
      first_payment_at: firstPayment(p), commission_qualified: yes(firstPayment(p)),
      ...geoCols(p.geo, "gps_"),
      photo_link: photoLink(p.photoId), follow_ups_count: fu.length, last_follow_up_at: last.at || "", last_follow_up_note: last.note || ""
    }, p, ["id", "business", "vertical", "contact", "phone", "location", "source", "decisionMaker", "existing", "budget", "stage", "nextAction", "followUp", "concern", "areas", "notes", "created", "createdBy", "createdByEmail", "reviewStatus", "reviewedBy", "reviewedAt", "reviewNote", "closedSale", "closedBy", "closedAt", "geo", "photoId", "followUps"]);
  });

  const visitRows = appointments.map((a) => {
    const p = byId[a.prospectId] || {};
    return withExtras({
      id: a.id, prospect_id: a.prospectId, business: p.business || "", contact: p.contact || "", phone: p.phone || "", location: p.location || "",
      date: a.date, time: a.time, operations_owner: a.director, status: a.status, purpose: a.purpose, directions: a.directions
    }, a, ["id", "prospectId", "date", "time", "director", "status", "purpose", "directions"]);
  });

  const followupRows = [];
  prospects.forEach((p) => arr(p.followUps).forEach((f, i) => {
    followupRows.push({ prospect_id: p.id, business: p.business || "", n: i + 1, at: f.at, by: f.by, by_email: f.byEmail, note: f.note, ...geoCols(f.geo, "gps_") });
  }));

  const jobRows = jobs.map((j) => {
    const mats = arr(j.materials);
    const p = byId[j.prospectId] || {};
    return withExtras({
      id: j.id, ref: j.ref, stage: j.stage, prospect_id: j.prospectId, business: p.business || j.client || j.business || "",
      created_at: j.createdAt, created_by: j.createdBy, created_by_email: j.createdByEmail,
      final_price: j.finalPrice, materials_count: mats.length,
      materials_total: mats.reduce((s, m) => s + (Number(m.qty) || 0) * (Number(m.unitCost) || 0), 0),
      materials: mats.map((m) => `${m.name || ""} x${m.qty || 0} @ ${m.unitCost || 0}`).join("; ")
    }, j, ["id", "ref", "stage", "prospectId", "createdAt", "createdBy", "createdByEmail", "finalPrice", "materials"]);
  });

  const txRows = transactions.map((t) => {
    const p = byId[t.prospectId] || {};
    return withExtras({
      id: t.id, date: t.date, direction: t.direction, amount: t.amount, category: t.category, method: t.method,
      prospect_id: t.prospectId, business: p.business || "", job_id: t.installId, note: t.note, preapproved: yes(t.preapproved),
      status: t.status, created_by: t.createdBy, created_by_email: t.createdByEmail, created_at: t.createdAt,
      reviewed_by: t.reviewedBy, reviewed_at: t.reviewedAt, review_note: t.reviewNote, receipt_link: photoLink(t.proofId)
    }, t, ["id", "date", "direction", "amount", "category", "method", "prospectId", "installId", "note", "preapproved", "status", "createdBy", "createdByEmail", "createdAt", "reviewedBy", "reviewedAt", "reviewNote", "proofId"]);
  });

  const userRows = users.map((u) => withExtras({ id: u.id, name: u.name, email: u.email, role: u.role, created: u.created }, u, ["id", "name", "email", "role", "created"]));
  const techRows = technicians.map((t) => withExtras({ id: t.id, name: t.name, phone: t.phone, skills: t.skills, active: yes(t.active !== false), created_at: t.createdAt }, t, ["id", "name", "phone", "skills", "active", "createdAt"]));

  return { prospects: prospectRows, visits: visitRows, followups: followupRows, jobs: jobRows, transactions: txRows, users: userRows, technicians: techRows };
}

// Append any record field not already mapped, as a snake_case column.
function withExtras(row, record, mapped) {
  const out = {};
  for (const k of Object.keys(row)) out[k] = str(row[k]);
  const skip = new Set(mapped);
  for (const k of Object.keys(record || {})) {
    if (skip.has(k)) continue;
    out[k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())] = str(record[k]);
  }
  return out;
}

export function toCsv(rows, baseColumns) {
  const cols = (baseColumns || []).slice();
  const seen = new Set(cols);
  rows.forEach((r) => Object.keys(r).forEach((k) => { if (!seen.has(k)) { seen.add(k); cols.push(k); } }));
  if (!cols.length) return "";
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise formula injection when opened in a spreadsheet.
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return /[",\r\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
  };
  return [cols.join(",")].concat(rows.map((r) => cols.map((c) => cell(r[c])).join(","))).join("\r\n") + "\r\n";
}
