// Verisko Uganda Operations — import leads from a spreadsheet (pure, tested).
//
// The Admin uploads an Excel/CSV call list (from Instagram, Google search…).
// Each row becomes a lead for the Team lead / Operations to call, or updates
// an existing lead matched by phone number (else business name). Imported
// leads never earn commission (`imported: true`).
(function (root) {
  "use strict";

  // Header synonyms, matched after lower-casing and dropping punctuation.
  var COLUMNS = {
    business: ["business", "business name", "client", "client name", "company", "company name", "name", "shop", "account", "page", "instagram page", "organisation", "organization"],
    contact: ["contact", "contact name", "contact person", "owner", "manager", "person"],
    phone: ["phone", "phone number", "phone no", "mobile", "mobile number", "tel", "telephone", "contact number", "whatsapp", "whatsapp number", "number"],
    phone2: ["phone 2", "other phone", "alternative phone", "second phone", "alt phone"],
    email: ["email", "email address", "e mail"],
    location: ["location", "address", "area", "place", "town", "city", "district"],
    vertical: ["vertical", "category", "type", "business type", "industry", "sector"],
    source: ["source", "lead source", "found on", "channel", "from"],
    notes: ["notes", "note", "comments", "comment", "remarks", "description"],
    assignedTo: ["assigned to", "assign to", "owner email", "rep", "sales rep", "salesperson", "assigned"],
    website: ["website", "link", "url", "instagram", "instagram link", "profile", "google maps", "maps link"]
  };
  var TEMPLATE = ["Business name", "Contact name", "Phone", "Location", "Category", "Source", "Notes", "Assigned to"];
  // Same list as the prospect form (app.js VERTICALS).
  var VERTICALS = ["Pharmacy", "Clinic", "Hospital", "Mobile money", "Retail shop", "Supermarket", "School", "Office", "Warehouse", "Residence", "Other"];

  function key(h) { return String(h == null ? "" : h).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }

  // Map each field to a column index from the header row.
  function mapHeaders(header) {
    var map = {};
    var keys = (header || []).map(key);
    Object.keys(COLUMNS).forEach(function (field) {
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] && COLUMNS[field].indexOf(keys[i]) >= 0 && !Object.keys(map).some(function (f) { return map[f] === i; })) { map[field] = i; return; }
      }
    });
    return map;
  }

  // Ugandan numbers to "+256 7XX XXX XXX"; anything else is kept tidy as typed.
  function normalizePhone(v) {
    var raw = clean(v);
    if (!raw) return "";
    var d = raw.replace(/[^\d+]/g, "");
    if (/^\d+(\.\d+)?e\+?\d+$/i.test(raw)) d = String(Math.round(Number(raw)));   // 2.56772E+11 from Excel
    var digits = d.replace(/\D/g, "");
    var local = "";
    if (/^2567\d{8}$/.test(digits)) local = digits.slice(3);
    else if (/^07\d{8}$/.test(digits)) local = digits.slice(1);
    else if (/^7\d{8}$/.test(digits)) local = digits;
    if (local) return "+256 " + local.slice(0, 3) + " " + local.slice(3, 6) + " " + local.slice(6);
    return d.charAt(0) === "+" ? "+" + digits : raw;
  }
  // Comparable phone: the last 9 digits.
  function phoneKey(v) { var d = String(v || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; }
  function nameKey(v) { return key(v); }

  function guessVertical(v) {
    var k = key(v);
    if (!k) return "";
    for (var i = 0; i < VERTICALS.length; i++) if (key(VERTICALS[i]) === k) return VERTICALS[i];
    if (/pharm|drug|chemist/.test(k)) return "Pharmacy";
    if (/hospital/.test(k)) return "Hospital";
    if (/clinic|medical|dental|health/.test(k)) return "Clinic";
    if (/mobile money|momo|forex|agent|bureau/.test(k)) return "Mobile money";
    if (/supermarket|mart|grocer/.test(k)) return "Supermarket";
    if (/school|academy|college|nursery/.test(k)) return "School";
    if (/office|company|firm|bank|sacco/.test(k)) return "Office";
    if (/warehouse|store house|depot|factory/.test(k)) return "Warehouse";
    if (/home|house|residen|apartment|estate/.test(k)) return "Residence";
    if (/shop|store|boutique|retail|hardware|salon|restaurant|bar|hotel|cafe/.test(k)) return "Retail shop";
    return "Other";
  }

  function guessSource(v) {
    var k = key(v);
    if (!k) return "";
    if (/insta|^ig$/.test(k)) return "Instagram";
    if (/google|search|maps/.test(k)) return "Google search";
    if (/facebook|^fb$/.test(k)) return "Facebook";
    if (/referr/.test(k)) return "Referral";
    if (/website|web/.test(k)) return "Website enquiry";
    return clean(v);
  }

  // rows: array of arrays, the first non-empty row is the header.
  // Returns { map, leads: [{row, business, contact, phone, ...}], skipped: [{row, reason}] }.
  function parseRows(rows) {
    // Keep spreadsheet row numbers (1-based) so skipped rows are easy to find.
    rows = (rows || []).map(function (r, i) { return { cells: r, row: i + 1 }; })
      .filter(function (x) { return x.cells && x.cells.some(function (c) { return clean(c); }); });
    if (!rows.length) return { map: {}, leads: [], skipped: [], error: "The file is empty." };
    var map = mapHeaders(rows[0].cells);
    if (map.business === undefined && map.phone === undefined) {
      return { map: map, leads: [], skipped: [], error: "Couldn't find a Business name or Phone column. Use the template's headings in the first row." };
    }
    var leads = [], skipped = [], seen = {};
    rows.slice(1).forEach(function (x) {
      var r = x.cells, row = x.row;
      var get = function (f) { return map[f] === undefined ? "" : clean(r[map[f]]); };
      var lead = {
        row: row, business: get("business"), contact: get("contact"), phone: normalizePhone(get("phone")), phone2: normalizePhone(get("phone2")),
        email: get("email"), location: get("location"), vertical: guessVertical(get("vertical")), source: guessSource(get("source")),
        notes: [get("notes"), get("website")].filter(Boolean).join(" · "), assignedTo: get("assignedTo")
      };
      if (!lead.business && lead.contact) lead.business = lead.contact;
      if (!lead.business && !lead.phone) { skipped.push({ row: row, reason: "No business name or phone" }); return; }
      if (!lead.phone && !lead.phone2) { skipped.push({ row: row, reason: "No phone number — nothing to call" }); return; }
      if (!lead.phone) { lead.phone = lead.phone2; lead.phone2 = ""; }
      if (!lead.business) lead.business = lead.phone;
      var dup = phoneKey(lead.phone) || nameKey(lead.business);
      if (seen[dup]) { skipped.push({ row: row, reason: "Same phone as row " + seen[dup] }); return; }
      seen[dup] = row;
      leads.push(lead);
    });
    return { map: map, leads: leads, skipped: skipped };
  }

  // Pair each lead with an existing prospect (same phone, else same name).
  function plan(leads, prospects) {
    var byPhone = {}, byName = {};
    (prospects || []).forEach(function (p) {
      [p.phone, p.phone2].forEach(function (ph) { var k = phoneKey(ph); if (k && !byPhone[k]) byPhone[k] = p; });
      var n = nameKey(p.business); if (n && !byName[n]) byName[n] = p;
    });
    return (leads || []).map(function (l) {
      var match = byPhone[phoneKey(l.phone)] || (l.phone2 && byPhone[phoneKey(l.phone2)]) || byName[nameKey(l.business)] || null;
      return { lead: l, match: match };
    });
  }

  // Fill in a matched prospect from the sheet: only non-empty cells, never
  // its stage, owner, history or commission status. Returns changed fields.
  function applyUpdate(p, l) {
    var changed = [];
    ["business", "contact", "phone", "phone2", "email", "location", "vertical", "source"].forEach(function (f) {
      var v = l[f];
      if (v && v !== (p[f] || "")) { p[f] = v; changed.push(f); }
    });
    if (l.notes && String(p.notes || "").indexOf(l.notes) === -1) { p.notes = p.notes ? p.notes + "\n" + l.notes : l.notes; changed.push("notes"); }
    return changed;
  }

  // Resolve an "Assigned to" cell (email or name) against the team list.
  function findUser(users, v) {
    var k = key(v);
    if (!k) return null;
    return (users || []).find(function (u) { return key(u.email) === k || key(u.name) === k; }) ||
      (users || []).find(function (u) { return key(u.name).split(" ")[0] === k; }) || null;
  }

  var api = { COLUMNS: COLUMNS, TEMPLATE: TEMPLATE, mapHeaders: mapHeaders, normalizePhone: normalizePhone, phoneKey: phoneKey,
    guessVertical: guessVertical, guessSource: guessSource, parseRows: parseRows, plan: plan, applyUpdate: applyUpdate, findUser: findUser };
  root.VeriskoLeadImport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
