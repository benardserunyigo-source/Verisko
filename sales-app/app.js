(function () {
  "use strict";

  /* ---------------------------------------------------------------------------
   * Verisko Uganda Operations
   * The Verisko field team: Sales find and qualify prospects and log visits;
   * Operations review prospects, verify closed sales & commission, and run the
   * cash-flow float. Data syncs through the Netlify /api/data function (Supabase
   * auth) with a localStorage fallback, and receipt/business photos through
   * /api/receipt; offline photos queue in IndexedDB until back online.
   * ------------------------------------------------------------------------- */

  var STORAGE_KEY = "verisko_sales_app_v1";
  var SETTINGS_KEY = "verisko_sales_settings_v1";

  // Salesperson-facing prospect stages (Excel `stage` is a free string, so any
  // legacy value coming from the workbook still renders — this is the pick-list).
  var STAGES = ["New prospect", "Contact attempted", "Qualified", "Appointment proposed", "Appointment confirmed", "Lost", "Postponed"];
  var VERTICALS = ["Pharmacy", "Clinic", "Hospital", "Mobile money", "Retail shop", "Supermarket", "School", "Office", "Warehouse", "Residence", "Other"];
  var SOURCES = ["Cold visit", "Walk-in prospecting", "Referral", "Instagram", "Facebook", "Google search", "Website enquiry", "Phone enquiry", "Existing customer", "Other"];
  // Common next actions — offered as tap-or-type suggestions to cut typing.
  // Plain words for the business types (stored values stay the same).
  var VERTICAL_LABELS = { "Residence": "Home", "Retail shop": "Shop", "Mobile money": "Mobile money" };
  var NEXT_ACTIONS = ["Call back", "Book a site visit", "Confirm the visit", "Send a quotation", "Visit the site", "Follow up next week", "Wait for their decision"];
  // A job's full lifecycle — from the quote through to handover. One pipeline
  // (replaces the old separate quote statuses + installation statuses).
  var JOB_STAGES = ["Draft", "Sent", "Accepted", "Scheduled", "In progress", "Installed", "Handed over", "Rejected", "Cancelled"];
  // Delivery fields (schedule/technician/materials) only matter once won.
  var JOB_DELIVERY_STAGES = ["Accepted", "Scheduled", "In progress", "Installed", "Handed over"];
  function jobIsDelivery(stage) { return JOB_DELIVERY_STAGES.indexOf(stage) >= 0; }
  // Completion checklist — all must be ticked before a job can be "Handed over".
  var INSTALL_CHECKLIST = [
    { key: "cameras", label: "All cameras installed & aimed" },
    { key: "tested", label: "Recording & playback tested" },
    { key: "remote", label: "Remote / phone viewing set up" },
    { key: "trained", label: "Client trained on the system" },
    { key: "credentials", label: "Login & warranty handed over" }
  ];
  // Operations/admin extras live behind the bottom-nav "More" sheet.
  var MORE_VIEWS = ["jobs", "cashflow", "settings"];

  /* ---------------------------- Quote calculator ---------------------------- */
  // Site-scoring rubric (answer points drive the site tier).
  var QUOTE_RUBRIC = [
    { key: "q1", q: "How many buildings need cameras?", opts: [["0", "1 building"], ["3", "2–3 buildings"], ["5", "4+ buildings"]] },
    { key: "q2", q: "Longest cable run (camera → NVR)", opts: [["0", "Under 15m"], ["1", "15–30m"], ["2", "30–50m"], ["3", "50–80m"], ["5", "Over 80m"]] },
    { key: "q3", q: "Where does the cable run?", opts: [["0", "Fully interior"], ["2", "Partial exterior"], ["4", "Fully exterior / exposed"]] },
    { key: "q4", q: "Wall type", opts: [["0", "Drywall / wood"], ["2", "Block / brick, unpainted"], ["4", "Painted block"], ["6", "Reinforced concrete"]] },
    { key: "q5", q: "Mounting height", opts: [["0", "Ground / single storey"], ["1", "First floor"], ["3", "Second floor+"], ["4", "Roof / tower"]] }
  ];
  function quoteTier(pts) { return pts <= 5 ? "Simple" : pts <= 10 ? "Standard" : pts <= 18 ? "Complex" : "Very Complex"; }
  // Base pricing matrix (UGX): [cameras][tier]. Very Complex uses a formula; 12+ is a custom quote.
  var QUOTE_MATRIX = {
    2: { Simple: 1650000, Standard: 1850000, Complex: 2050000 },
    4: { Simple: 2200000, Standard: 2500000, Complex: 2700000 },
    6: { Simple: 2700000, Standard: 3050000, Complex: 3350000 },
    8: { Simple: 3250000, Standard: 3600000, Complex: 4000000 }
  };
  var QUOTE_PACKAGE = { 2: "Basic", 4: "Essential", 6: "Standard", 8: "Premium" };
  function basePriceFor(cameras, tier, pts) {
    var m = QUOTE_MATRIX[cameras];
    if (!m) return null; // 12+ / custom → Ben approves
    if (tier === "Very Complex") return m.Complex + 150000 * Math.max(0, pts - 18);
    return m[tier];
  }
  // Add-on rate card. qty: true = count field; surge/hdmi are auto-added in compute.
  var QUOTE_ADDONS = [
    { key: "hdd2tb", label: "Hard drive 2TB", price: 500000 },
    { key: "hdd4tb", label: "Hard drive 4TB", price: 700000 },
    { key: "tv32", label: "32\" LED TV", price: 550000 },
    { key: "tv43", label: "43\" LED TV", price: 850000 },
    { key: "powerpack", label: "Power Pack (UPS + battery)", price: 450000 },
    { key: "lights", label: "Perimeter Light Pack", price: 380000 },
    { key: "router4g", label: "4G Router", price: 250000 },
    { key: "camFixed", label: "Extra camera (outdoor/ceiling)", price: 400000, qty: true },
    { key: "camWide", label: "Extra camera (moving/wide)", price: 500000, qty: true },
    { key: "pole", label: "Metal pole (mounting)", price: 130000, qty: true },
    { key: "welder", label: "Welder site visit", price: 35000 },
    { key: "structural", label: "Structural work bundle", price: 160000 }
  ];
  var QUOTE_ZONES = [
    { key: "1", label: "Zone 1 — Kampala Central", surcharge: 0 },
    { key: "2", label: "Zone 2 — Greater Kampala / Wakiso", surcharge: 0 },
    { key: "3", label: "Zone 3 — Entebbe / Mukono / Matugga", surcharge: 50000 },
    { key: "beyond", label: "Beyond Zone 3 — regional", surcharge: 300000 }
  ];

  // Turn a saved quote's inputs into every derived figure. Pure — easy to test.
  function computeQuote(q) {
    var addons = q.addons || {};
    var pts = QUOTE_RUBRIC.reduce(function (s, r) { return s + (Number(q.rubric && q.rubric[r.key]) || 0); }, 0);
    var tier = quoteTier(pts);
    var cameras = Number(q.cameraCount) || 0;
    var base = basePriceFor(cameras, tier, pts);
    var lines = [];
    QUOTE_ADDONS.forEach(function (a) {
      var v = addons[a.key];
      if (a.qty) { var n = Math.max(0, Math.round(Number(v) || 0)); if (n > 0) lines.push({ key: a.key, label: a.label, qty: n, price: a.price, total: n * a.price }); }
      else if (v) lines.push({ key: a.key, label: a.label, qty: 1, price: a.price, total: a.price });
    });
    if (tier === "Complex" || tier === "Very Complex") lines.push({ key: "surge", label: "Surge protector", qty: 1, price: 80000, total: 80000, auto: true });
    if (addons.tv32 || addons.tv43) lines.push({ key: "hdmi", label: "HDMI 5m cable", qty: 1, price: 40000, total: 40000, auto: true });
    var addonsTotal = lines.reduce(function (s, l) { return s + l.total; }, 0);
    var zone = QUOTE_ZONES.filter(function (z) { return z.key === q.zone; })[0] || QUOTE_ZONES[0];
    var bundle = cameras === 4 && tier === "Standard" && !!addons.hdd2tb && !!addons.tv32 && !!addons.powerpack;
    var bundleDiscount = bundle ? 150000 : 0;
    var subtotal = (base || 0) + addonsTotal + zone.surcharge - bundleDiscount;
    var discountPct = Math.max(0, Math.min(100, Number(q.discountPct) || 0));
    var discountAmount = Math.round(subtotal * discountPct / 100);
    var cash = Math.max(0, subtotal - discountAmount);
    var financed = cash + 250000;
    return {
      pts: pts, tier: tier, cameras: cameras, packageTier: QUOTE_PACKAGE[cameras] || "Custom",
      base: base, custom: base === null, lines: lines, addonsTotal: addonsTotal, zone: zone,
      bundle: bundle, bundleDiscount: bundleDiscount, subtotal: subtotal,
      discountPct: discountPct, discountAmount: discountAmount, cash: cash, financed: financed,
      financingAvailable: cash >= 1500000, needsApproval: tier === "Very Complex" || base === null
    };
  }
  // Single source of truth for a job's contract value. Rubric-priced normally; a
  // manual finalPrice only for custom (12+ cam) or an explicit admin override.
  function jobValue(job) {
    if (!job) return 0;
    var r = computeQuote(job);
    if (r.custom || job.priceOverride) return Math.max(0, Math.round(Number(job.finalPrice) || 0));
    return r.cash;
  }
  // Fold legacy quotes[] + installations[] into a single jobs[] once. Installation
  // ids are reused as job ids so existing installId payment links keep resolving.
  // Idempotent: a no-op once jobs[] exists.
  function migrateToJobs(data) {
    if (!data || Array.isArray(data.jobs)) return data;
    var jobs = [];
    var instStage = { "Quoted": "Accepted", "Scheduled": "Scheduled", "In progress": "In progress", "Installed": "Installed", "Handed over": "Handed over", "Cancelled": "Cancelled" };
    var quoteStage = { "Draft": "Draft", "Sent": "Sent", "Accepted": "Accepted", "Rejected": "Rejected", "Expired": "Rejected" };
    (data.installations || []).forEach(function (i) {
      jobs.push({
        id: i.id, prospectId: i.prospectId || "",
        business: i.business || "", contact: i.contact || "", phone: i.phone || "", location: i.location || "",
        stage: instStage[i.status] || "Accepted",
        rubric: {}, cameraCount: 0, addons: {}, zone: "1", discountPct: 0,
        finalPrice: Number(i.quote) || 0, priceOverride: (Number(i.quote) || 0) > 0,
        scheduledDate: i.scheduledDate || "", scheduledTime: i.scheduledTime || "",
        technicianId: i.technicianId || "", materials: i.materials || [], checklist: i.checklist || {},
        notes: i.siteNotes || "", createdBy: i.createdBy || "", createdByEmail: i.createdByEmail || "", createdAt: i.createdAt || ""
      });
    });
    (data.quotes || []).forEach(function (q) {
      jobs.push({
        id: q.id, prospectId: q.prospectId || "",
        business: q.business || "", contact: q.contact || "", phone: q.phone || "", location: q.location || "",
        stage: quoteStage[q.status] || "Draft",
        rubric: q.rubric || {}, cameraCount: q.cameraCount || 0, addons: q.addons || {}, zone: q.zone || "1", discountPct: q.discountPct || 0,
        finalPrice: 0, priceOverride: false,
        scheduledDate: "", scheduledTime: "", technicianId: "", materials: [], checklist: {},
        notes: q.notes || "", createdBy: q.createdBy || "", createdByEmail: q.createdByEmail || "", createdAt: q.createdAt || ""
      });
    });
    jobs.sort(function (a, b) { return (a.createdAt || "").localeCompare(b.createdAt || ""); });
    var yr = String(today || "2026").slice(0, 4);
    jobs.forEach(function (j, k) { j.ref = "J-" + yr + "-" + ("000" + (k + 1)).slice(-4); });
    data.jobs = jobs;
    data.quotes = []; data.installations = [];
    return data;
  }
  var DECISION = ["Unknown", "Yes", "No"];
  var APPT_STATUSES = ["Proposed", "Confirmed", "Completed", "Rescheduled", "Cancelled", "No-show"];
  var PURPOSES = ["Technical site survey", "Follow-up visit", "Installation planning"];

  var today = new Date().toISOString().slice(0, 10);
  var plusDays = function (n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  var uid = function () { return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]; }); };
  var telHref = function (v) { return "tel:" + String(v || "").replace(/[^\d+]/g, ""); };
  var isOverdue = function (v) { return v && v < today; };
  var isToday = function (v) { return v === today; };
  var isClosed = function (stage) { return /Lost|Postponed/i.test(stage || ""); };
  var dateLabel = function (v) {
    if (!v) return "Not set";
    var d = new Date(v + "T12:00:00");
    if (isNaN(d)) return esc(v);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };
  // For follow-up timestamps (ISO datetime) — shows date + time.
  var dateTimeLabel = function (v) {
    if (!v) return "";
    var d = new Date(v);
    if (isNaN(d)) return esc(v);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };
  var relDay = function (v) {
    if (!v) return "";
    if (v === today) return "Today";
    if (v === plusDays(1)) return "Tomorrow";
    if (v === plusDays(-1)) return "Yesterday";
    return dateLabel(v);
  };

  // Shared workspace config defaults. commissionPerSale = UGX 80,000 per
  // Operations-verified closed sale; commissionTarget = monthly goal.
  function defaultConfig() { return { pettyLimit: 20000, commissionPerSale: 100000, commissionPerQualified: 2500, commissionTarget: 1600000, commissionRule: 3 }; }
  // Commission rule v2 (28 Sep 2026): UGX 100,000 per closed sale, earned once
  // the client's first payment is recorded and approved. Applied once to any
  // workspace still on the old rate; Operations/admin devices push it up.
  function normalizeConfig(cfg) {
    if (!cfg || typeof cfg !== "object") cfg = defaultConfig();
    if (Number(cfg.commissionRule) < 2 || !cfg.commissionRule) { cfg.commissionPerSale = 100000; cfg.commissionRule = 2; }
    // Rule 3 (30 Sep 2026): add UGX 2,500 per Team-lead-approved qualified prospect.
    if (Number(cfg.commissionRule) < 3) { if (!(Number(cfg.commissionPerQualified) > 0)) cfg.commissionPerQualified = 2500; cfg.commissionRule = 3; }
    return cfg;
  }

  /* ------------- Empty starting workspace (no demo data) -------------------- */
  var seed = {
    prospects: [],
    appointments: [],
    users: [],
    transactions: [],
    jobs: [],
    technicians: [],
    training: {},
    config: defaultConfig()
  };

  var state = loadData();
  var settings = loadSettings();
  var view = "today";
  var editing = null;
  var connection = { state: "local", text: "Saved on this device" };

  var content = document.getElementById("viewContent");
  var dialog = document.getElementById("recordDialog");
  var form = document.getElementById("recordForm");
  var formContent = document.getElementById("formContent");
  var formError = document.getElementById("formError");

  /* ------------------------------ Persistence ------------------------------- */
  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(seed));
      if (!data.prospects) data.prospects = [];
      if (!data.appointments) data.appointments = [];
      if (!data.users) data.users = [];
      if (!data.transactions) data.transactions = [];
      migrateToJobs(data);                 // fold any legacy quotes/installations
      if (!data.jobs) data.jobs = [];
      if (!data.technicians) data.technicians = [];
      if (!data.training || typeof data.training !== "object") data.training = {};
      data.config = normalizeConfig(data.config);
      return data;
    } catch (e) { return JSON.parse(JSON.stringify(seed)); }
  }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveData(message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (message) toast(message);
    if (settings.auth) pushShared();
    else setSync("local", "Saved on this device");
  }
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

  /* -------------------------------- Helpers --------------------------------- */
  function prospect(id) { return state.prospects.find(function (p) { return p.id === id; }) || {}; }
  function appointmentFor(id) { return state.appointments.find(function (a) { return a.prospectId === id; }); }
  // Each salesperson works only their own pipeline. The server already sends a
  // Sales account just its own records; this also hides anything left over in
  // an older cached copy on the phone. Operations/admin see everything.
  function isMineProspect(p) {
    if (canReviewProspects() || isTeamLead()) return true;
    var me = ((settings.user || {}).email || "").toLowerCase();
    return !!(p && me && (p.createdByEmail || "").toLowerCase() === me);
  }
  function visibleProspects() { return (state.prospects || []).filter(isMineProspect); }
  function ownProspect(p) { var me = ((settings.user || {}).email || "").toLowerCase(); return !!(p && me && (p.createdByEmail || "").toLowerCase() === me); }
  function visibleAppointments() {
    if (canReviewProspects() || isTeamLead()) return state.appointments || [];
    var ids = {}; visibleProspects().forEach(function (p) { ids[p.id] = true; });
    return (state.appointments || []).filter(function (a) { return ids[a.prospectId]; });
  }

  function toast(message) {
    var el = document.getElementById("toast");
    el.textContent = message; el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.classList.remove("show"); }, 3200);
  }

  // In-app modal sheet (replaces native prompt/confirm — those are silently
  // suppressed inside in-app webviews). Returns a Promise:
  //   • plain confirm → resolves {choice:"",text:""} on OK, null on cancel
  //   • with choices/input → resolves {choice, text} on OK, null on cancel
  // opts: { title, body, choices:[], input:{placeholder,value,confirmWord},
  //         requireValue, confirmLabel, cancelLabel, danger }
  function openSheet(opts) {
    opts = opts || {};
    var dlg = document.getElementById("askDialog");
    return new Promise(function (resolve) {
      var selected = "";
      var choicesHtml = (opts.choices && opts.choices.length)
        ? '<div class="ask-choices" role="group" aria-label="Quick options">' + opts.choices.map(function (c) {
            return '<button type="button" class="ask-chip" data-choice="' + esc(c) + '">' + esc(c) + "</button>";
          }).join("") + "</div>" : "";
      var inputHtml = opts.input
        ? '<textarea class="ask-input" id="askInput" rows="3" placeholder="' + esc(opts.input.placeholder || "") + '">' + esc(opts.input.value || "") + "</textarea>" : "";
      dlg.innerHTML =
        '<div class="ask-head"><h2 id="askTitle">' + esc(opts.title || "") + "</h2>" +
        (opts.body ? '<p class="ask-body">' + esc(opts.body) + "</p>" : "") + "</div>" +
        choicesHtml + inputHtml +
        '<div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">' + esc(opts.cancelLabel || "Cancel") + "</button>" +
        '<button type="button" class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" id="askOk">' + esc(opts.confirmLabel || "Confirm") + "</button></div>";
      var okBtn = dlg.querySelector("#askOk");
      var input = dlg.querySelector("#askInput");
      var result = function () { return { choice: selected, text: input ? input.value.trim() : "" }; };
      var valid = function () {
        if (opts.input && opts.input.confirmWord) return (input.value || "").trim().toUpperCase() === opts.input.confirmWord.toUpperCase();
        var r = result();
        if (opts.requireChoice && !r.choice) return false;
        if (opts.textFor && r.choice === opts.textFor && !r.text) return false;
        if (opts.requireValue) return !!(r.choice || r.text);
        return true;
      };
      var refresh = function () { okBtn.disabled = !valid(); };
      dlg.querySelectorAll(".ask-chip").forEach(function (b) {
        b.addEventListener("click", function () {
          selected = selected === b.dataset.choice ? "" : b.dataset.choice;
          dlg.querySelectorAll(".ask-chip").forEach(function (x) { x.classList.toggle("is-on", x === b && !!selected); });
          refresh();
        });
      });
      if (input) input.addEventListener("input", refresh);
      var done = false;
      var onCancel = function (e) { if (e) e.preventDefault(); finish(null); };
      var onBackdrop = function (e) { if (e.target === dlg) finish(null); };
      function finish(val) {
        if (done) return; done = true;
        dlg.removeEventListener("cancel", onCancel);
        dlg.removeEventListener("click", onBackdrop);
        dlg.close(); resolve(val);
      }
      okBtn.addEventListener("click", function () { if (valid()) finish(result()); });
      dlg.querySelector("#askCancel").addEventListener("click", function () { finish(null); });
      dlg.addEventListener("cancel", onCancel);
      dlg.addEventListener("click", onBackdrop);
      refresh();
      dlg.showModal();
      var first = dlg.querySelector(".ask-chip") || input || okBtn;
      if (first) first.focus();
    });
  }
  // Convenience: a plain yes/no confirmation.
  function confirmSheet(title, body, confirmLabel, danger) {
    return openSheet({ title: title, body: body, confirmLabel: confirmLabel || "Confirm", danger: danger }).then(function (r) { return !!r; });
  }

  function setSync(stateName, text) {
    connection = { state: stateName, text: text };
    var el = document.getElementById("syncState");
    el.setAttribute("data-state", stateName);
    document.getElementById("syncText").textContent = text;
    var status = document.querySelector(".conn-status");
    if (status) { status.setAttribute("data-state", stateName); status.querySelector(".conn-label").textContent = text; }
  }

  // Icon + label chip so status is never communicated by colour alone.
  function chip(label, tone, glyph) {
    return '<span class="chip ' + tone + '">' + (glyph ? '<span class="g" aria-hidden="true">' + glyph + "</span>" : "") + esc(label) + "</span>";
  }
  function stageChip(stage) {
    if (/confirmed/i.test(stage)) return chip(stage, "green", "✓");
    if (/proposed/i.test(stage)) return chip(stage, "amber", "◔");
    if (/qualified/i.test(stage)) return chip(stage, "cyan", "★");
    if (/lost/i.test(stage)) return chip(stage, "red", "✕");
    if (/postponed/i.test(stage)) return chip(stage, "amber", "⏸");
    if (/attempted/i.test(stage)) return chip(stage, "grey", "•");
    return chip(stage || "New prospect", "grey", "•");
  }
  function apptChip(status) {
    if (/confirmed/i.test(status)) return chip(status, "green", "✓");
    if (/completed/i.test(status)) return chip(status, "green", "✓");
    if (/proposed/i.test(status)) return chip(status, "amber", "◔");
    if (/rescheduled/i.test(status)) return chip(status, "amber", "↻");
    if (/cancelled/i.test(status)) return chip(status, "red", "✕");
    if (/no-show/i.test(status)) return chip(status, "red", "✕");
    return chip(status || "Proposed", "grey", "•");
  }
  function followChip(dateVal) {
    if (isOverdue(dateVal)) return chip("Overdue · " + dateLabel(dateVal), "red", "!");
    if (isToday(dateVal)) return chip("Due today", "amber", "◷");
    return chip("Follow up " + relDay(dateVal), "grey", "◷");
  }
  function phoneLink(phone) {
    if (!phone) return '<span class="item-line"><span class="k">Phone</span><span class="v">Not recorded</span></span>';
    return '<a class="telink" href="' + esc(telHref(phone)) + '"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z"/></svg>' + esc(phone) + "</a>";
  }

  function emptyState(icon, title, copy, actionLabel, actionAttr) {
    return '<div class="empty"><div class="icon">' + icon + "</div><strong>" + esc(title) + "</strong><p>" + esc(copy) + "</p>" +
      (actionLabel ? '<button class="btn btn-primary" ' + actionAttr + ">" + esc(actionLabel) + "</button>" : "") + "</div>";
  }
  var ICON_CALENDAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 3v3M16 3v3"/></svg>';
  var ICON_PEOPLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 3-5 5.5-5s4.9 1.8 5.5 5"/></svg>';
  var ICON_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>';

  /* ---------------- Handoff validation (before confirming a visit) ---------- */
  // A visit can only be handed to Operations when the prospect has a contact
  // person, telephone number and location, and the appointment has a date,
  // time and Operations owner.
  function handoffGaps(appt, override) {
    var p = prospect(appt.prospectId);
    var date = override && "date" in override ? override.date : appt.date;
    var time = override && "time" in override ? override.time : appt.time;
    var director = override && "director" in override ? override.director : appt.director;
    var gaps = { prospect: [], appointment: [] };
    if (!p.contact) gaps.prospect.push("contact person");
    if (!p.phone) gaps.prospect.push("telephone number");
    if (!p.location) gaps.prospect.push("location");
    if (!date) gaps.appointment.push("visit date");
    if (!time) gaps.appointment.push("time");
    if (!director) gaps.appointment.push("Operations owner");
    return gaps;
  }
  function hasGaps(g) { return g.prospect.length + g.appointment.length > 0; }
  function listAnd(arr) {
    if (arr.length <= 1) return arr.join("");
    return arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];
  }

  /* -------------------------- Page head + navigation ------------------------ */
  function setHead(eyebrow, title, intro, actionLabel, showAction) {
    document.getElementById("pageEyebrow").textContent = eyebrow;
    document.getElementById("pageTitle").textContent = title;
    document.getElementById("pageIntro").textContent = intro;
    var button = document.getElementById("primaryAction");
    if (showAction === false) { button.hidden = true; return; }
    button.hidden = false;
    button.setAttribute("aria-label", actionLabel);
    button.querySelector(".page-action-label").textContent = actionLabel;
  }

  function render() {
    if (view === "settings" && !isAdmin()) view = "today";      // Settings is admin-only
    if (view === "cashflow" && !canCashflow()) view = "today";  // Cash flow is Operations + admin
    if (view === "jobs" && !canInstalls()) view = "today";      // Jobs is Operations + admin
    updateNavActive();
    updateCashBadge();
    updateProspectBadge();
    if (view === "today") renderToday();
    else if (view === "dashboard") renderDashboard();
    else if (view === "prospects") renderProspects();
    else if (view === "visits") renderVisits();
    else if (view === "jobs") renderJobs();
    else if (view === "cashflow") renderCashflow();
    else if (view === "settings") renderSettings();
    else if (view === "support") renderSupport();
  }
  // Highlight the current tab — or the More button when the view lives there.
  function updateNavActive() {
    var inMore = (MORE_VIEWS.indexOf(view) !== -1 || (view === "support" && supportInMore())) && !!document.querySelector('[data-more]:not([hidden])');
    document.querySelectorAll(".mainnav .nav-item").forEach(function (b) {
      var on = b.dataset.view === view || (b.hasAttribute("data-more") && inMore);
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }

  /* --------------------------------- TODAY ---------------------------------- */
  function renderToday() {
    setHead("Your work today", "Today", "Your priorities, most urgent first.", "Add prospect", true);

    var active = visibleProspects().filter(function (p) { return !isClosed(p.stage); });

    var overdue = active.filter(function (p) { return isOverdue(p.followUp); });
    var dueToday = active.filter(function (p) { return isToday(p.followUp); });
    var seen = {};
    overdue.concat(dueToday).forEach(function (p) { seen[p.id] = true; });

    var toSchedule = active.filter(function (p) {
      return /Qualified/i.test(p.stage) && !appointmentFor(p.id) && !seen[p.id];
    });

    var awaiting = visibleAppointments().filter(function (a) { return /Proposed|Rescheduled/i.test(a.status); })
      .sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
    var confirmed = visibleAppointments().filter(function (a) { return a.status === "Confirmed" && (!a.date || a.date >= today); })
      .sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });

    var sections = "";

    sections += section("Overdue follow-ups", overdue.length, "alert",
      overdue.sort(function (a, b) { return (a.followUp || "").localeCompare(b.followUp || ""); })
        .map(function (p) { return prospectAction(p, "red"); }).join(""),
      overdue.length ? "" : "");

    sections += section("Follow-ups due today", dueToday.length, "",
      dueToday.map(function (p) { return prospectAction(p, "amber"); }).join(""));

    sections += section("Qualified — ready to schedule", toSchedule.length, "",
      toSchedule.map(function (p) { return prospectAction(p, "cyan"); }).join(""));

    sections += section("Proposed — awaiting confirmation", awaiting.length, "",
      awaiting.map(function (a) { return visitAction(a); }).join(""));

    sections += section("Confirmed site visits", confirmed.length, "",
      confirmed.map(function (a) { return handoffCard(a, true); }).join(""));

    var anything = overdue.length + dueToday.length + toSchedule.length + awaiting.length + confirmed.length;
    if (!anything) {
      sections = emptyState(ICON_CALENDAR, "You're all caught up", "No overdue follow-ups, nothing due today, and no visits waiting. Add a prospect to keep the pipeline moving.", "Add prospect", 'data-new="prospect"');
    }

    content.innerHTML = idNotice() + idCheckNotice() + signupNotice() + certNotice() + trainingNudge() + '<div class="stack">' + sections + "</div>";
  }

  function section(title, count, cls, body) {
    if (!count) return "";
    return '<section><h2 class="section-title ' + cls + '">' + esc(title) + '<span class="count">' + count + "</span></h2><div class=\"list\">" + body + "</div></section>";
  }

  // A prospect row on Today with the single most useful next action.
  function prospectAction(p, tone) {
    var canSchedule = /Qualified|Contact attempted|New prospect/i.test(p.stage) && !appointmentFor(p.id);
    var actions = "";
    if (p.phone) actions += '<a class="btn btn-sm btn-cyan" href="' + esc(telHref(p.phone)) + '">Call</a>';
    if (/Qualified/i.test(p.stage) && !appointmentFor(p.id)) {
      actions += '<button class="btn btn-sm btn-ghost" data-schedule="' + p.id + '">Schedule visit</button>';
    }
    if (canReviewProspects() || isTeamLead() || ownProspect(p)) actions += '<button class="btn btn-sm btn-ghost" data-log-followup="' + p.id + '">Follow-up</button>';
    actions += '<button class="btn btn-sm btn-ghost" data-edit="prospect" data-id="' + p.id + '">Open</button>';
    return '<article class="item tone-' + tone + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(p.business) + '</div>' +
      '<div class="item-meta">' + esc(p.vertical) + " · " + esc(p.location || "No location") + "</div></div>" + followChip(p.followUp) + "</div>" +
      '<div class="item-lines"><div class="item-line"><span class="k">Next action</span><span class="v">' + esc(p.nextAction || "Not set") + "</span></div>" +
      '<div class="item-line"><span class="k">Contact</span><span class="v">' + esc(p.contact || "Unknown") + (p.phone ? " · " + esc(p.phone) : "") + "</span></div></div>" +
      '<div class="item-actions">' + actions + "</div></article>";
  }

  // A proposed appointment row on Today with a Confirm action.
  function visitAction(a) {
    var p = prospect(a.prospectId);
    var actions = "";
    if (p.phone) actions += '<a class="btn btn-sm btn-cyan" href="' + esc(telHref(p.phone)) + '">Call</a>';
    actions += '<button class="btn btn-sm btn-primary" data-confirm="' + a.id + '">Confirm visit</button>';
    actions += '<button class="btn btn-sm btn-ghost" data-edit="appointment" data-id="' + a.id + '">Edit</button>';
    return '<article class="item tone-amber">' +
      '<div class="item-top"><div><div class="item-title">' + esc(p.business || "Unknown prospect") + '</div>' +
      '<div class="item-meta"><strong>' + esc(relDay(a.date)) + "</strong> · " + esc(a.time || "no time") + " · " + esc(a.director || "no owner") + "</div></div>" + apptChip(a.status) + "</div>" +
      '<div class="item-lines"><div class="item-line"><span class="k">Contact</span><span class="v">' + esc(p.contact || "Unknown") + "</span></div>" +
      '<div class="item-line"><span class="k">Location</span><span class="v">' + esc(p.location || "Not recorded") + "</span></div></div>" +
      '<div class="item-actions">' + actions + "</div></article>";
  }

  /* ------------------------------- PROSPECTS --------------------------------- */
  function renderProspects() {
    setHead("Your pipeline", "Prospects", "Search and manage your pipeline.", "Add prospect", true);
    // Reviewers get a queue of prospects awaiting audit, pinned at the top.
    var review = "";
    if (canReviewProspects()) {
      var queue = (state.prospects || []).filter(needsReview)
        .sort(function (a, b) { return (a.created || "").localeCompare(b.created || ""); });
      if (queue.length) {
        review = '<section class="review-section"><h2 class="review-head">Prospects to review <span class="review-count">' + queue.length + "</span></h2>" +
          queue.map(prospectReviewCard).join("") + "</section>";
      }
    }
    if (canApproveQual()) {
      var qq = (state.prospects || []).filter(needsQualApproval)
        .sort(function (a, b) { return String(a.qualRequestedAt || "").localeCompare(String(b.qualRequestedAt || "")); });
      if (qq.length) {
        review += '<section class="review-section"><h2 class="review-head">Qualified prospects to approve <span class="review-count">' + qq.length + "</span></h2>" +
          '<p class="result-note">Each approval pays the rep ' + money(commissionPerQualified()) + " on Saturday. Not eligible? Disqualify it with a reason — the rep sees why.</p>" + qq.map(qualCard).join("") + "</section>";
      }
    }
    // Operations: leads the Team lead has approved as qualified that still
    // need a site visit or a quote.
    if (canReviewProspects()) {
      var ready = (state.prospects || []).filter(readyForOperations)
        .sort(function (a, b) { return String(b.qualApprovedAt || "").localeCompare(String(a.qualApprovedAt || "")); });
      if (ready.length) {
        review += '<section class="review-section"><h2 class="review-head">Qualified — ready for Operations <span class="review-count">' + ready.length + "</span></h2>" +
          '<p class="result-note">Approved by the Team lead (or imported leads marked Qualified). Book the site visit or send the quote.</p>' + ready.slice(0, 8).map(readyCard).join("") +
          (ready.length > 8 ? '<p class="result-note">+' + (ready.length - 8) + " more — filter by stage below.</p>" : "") + "</section>";
      }
    }
    if (!canApproveQual()) {
      var dqs = visibleProspects().filter(unreadDisqualified);
      if (dqs.length) {
        review += '<section class="review-section"><h2 class="review-head">Disqualified — see why <span class="review-count">' + dqs.length + "</span></h2>" + dqs.map(disqualifiedNoticeCard).join("") + "</section>";
      }
    }
    content.innerHTML =
      review +
      '<div class="toolbar">' +
        '<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' +
        '<input id="search" type="search" placeholder="Search business, contact, phone or location" aria-label="Search prospects"></div>' +
        '<div class="filter-row"><div class="field-inline"><label for="stageFilter">Stage</label>' +
        '<select id="stageFilter"><option value="">All stages</option>' + STAGES.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("") + "</select></div></div>" +
      "</div>" +
      (isAdmin() ? '<div class="button-row" style="margin:-4px 0 8px"><button type="button" class="btn btn-ghost btn-sm" data-import-leads>Import leads from Excel</button></div>' : "") +
      '<p class="result-note" id="resultNote" aria-live="polite"></p>' +
      '<div class="card-grid" id="prospectGrid"></div>';
    updateProspectGrid();
    hydrateProofThumbs();
  }

  function updateProspectGrid() {
    var grid = document.getElementById("prospectGrid");
    if (!grid) return;
    var q = ((document.getElementById("search") || {}).value || "").toLowerCase().trim();
    var stage = ((document.getElementById("stageFilter") || {}).value || "");
    var rows = visibleProspects().filter(function (p) {
      var haystack = [p.business, p.contact, p.phone, p.location, p.vertical, p.notes, p.source, p.imported ? "imported" : ""].map(function (x) { return x || ""; }).join(" ").toLowerCase();
      return (!stage || p.stage === stage) && (!q || haystack.indexOf(q) !== -1);
    }).sort(function (a, b) {
      // Overdue first, then by follow-up date.
      var ao = isOverdue(a.followUp) ? 0 : 1, bo = isOverdue(b.followUp) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.followUp || "9").localeCompare(b.followUp || "9");
    });

    document.getElementById("resultNote").textContent =
      rows.length + (rows.length === 1 ? " prospect" : " prospects") + (q || stage ? " match your filter" : " in your pipeline");

    grid.innerHTML = rows.length ? rows.map(prospectCard).join("") :
      emptyState(ICON_PEOPLE, "No prospects match", "Try a different search or clear the stage filter.", "Add prospect", 'data-new="prospect"');
    grid.classList.toggle("card-grid", rows.length > 0);
  }

  function readyForOperations(p) {
    var qualified = p.qualStatus === "approved" || (p.imported && window.VeriskoCommission.isQualStage(p.stage));
    return qualified && !p.closedSale && !isClosed(p.stage) && !quoteForProspect(p.id);
  }
  function readyCard(p) {
    var C = window.VeriskoCommission;
    var appt = appointmentFor(p.id);
    return '<article class="item tone-navy"><div class="item-top"><div><div class="item-title">' + esc(p.business) + "</div>" +
      '<div class="item-meta">' + esc(p.createdBy || "Rep") + " · " + esc(p.location || "No location") + "</div></div>" + stageChip(p.stage) + "</div>" +
      '<div class="item-lines">' +
      '<div class="item-line"><span class="k">Contact</span><span class="v">' + esc([p.contact, p.phone].filter(Boolean).join(" · ") || "—") + "</span></div>" +
      (p.imported ? '<div class="item-line"><span class="k">Lead</span><span class="v">Imported' + (p.source ? " · " + esc(p.source) : "") + " · no commission</span></div>"
        : '<div class="item-line"><span class="k">Approved</span><span class="v">' + esc((p.qualApprovedBy || "Team lead") + (p.qualApprovedAt ? " · " + C.label(C.eventTime(p.qualApprovedAt), true) : "")) + "</span></div>") +
      (appt ? '<div class="item-line"><span class="k">Site visit</span><span class="v">' + esc(dateLabel(appt.date) + " · " + (appt.status || "")) + "</span></div>" : "") + "</div>" +
      '<div class="item-actions">' + (p.phone ? '<a class="btn btn-sm btn-cyan" href="' + esc(telHref(p.phone)) + '">Call</a>' : "") +
      (!appt ? '<button type="button" class="btn btn-sm btn-ghost" data-schedule="' + esc(p.id) + '">Schedule visit</button>' : "") +
      (canInstalls() ? '<button type="button" class="btn btn-sm btn-primary" data-make-install="' + esc(p.id) + '">Create quote</button>' : "") +
      '<button type="button" class="btn btn-sm btn-ghost" data-log-followup="' + esc(p.id) + '">Follow-up</button></div></article>';
  }

  function quickQuestionsLine(p) {
    if (p.closedSale || isClosed(p.stage) || p.qualStatus === "approved") return "";
    var v = window.VeriskoQualify.verdict(p);
    var txt = v.ready ? '<span style="color:var(--green);font-weight:600">✓ Looks qualified</span>'
      : v.missing.length ? v.answered + " of 5 answered" : '<span style="color:var(--amber)">' + esc(v.stoppers.join(" · ")) + "</span>";
    return '<div class="item-line"><span class="k">5 questions</span><span class="v">' + txt + "</span></div>";
  }
  function prospectCard(p) {
    var appt = appointmentFor(p.id);
    var actions = "";
    // A Team lead can't edit other reps' prospects, but can log calls, plan
    // the next follow-up, decide qualification and record deposits.
    var canWork = canReviewProspects() || ownProspect(p);
    if (p.phone) actions += '<a class="btn btn-sm btn-cyan" href="' + esc(telHref(p.phone)) + '">Call</a>';
    if (canWork || isTeamLead()) actions += '<button class="btn btn-sm btn-ghost" data-log-followup="' + p.id + '">Follow-up</button>';
    if (canWork && /Qualified/i.test(p.stage) && !appt) actions += '<button class="btn btn-sm btn-ghost" data-schedule="' + p.id + '">Schedule</button>';
    if (canApproveQual() && p.qualStatus === "pending" && !ownProspect(p)) actions += '<button class="btn btn-sm btn-primary" data-approve-qual="' + esc(p.id) + '">Approve qualified</button>';
    if (canDisqualify(p)) actions += '<button class="btn btn-sm btn-ghost" data-disqualify="' + esc(p.id) + '">Disqualify</button>';
    if (canApproveQual() && p.qualStatus === "disqualified") actions += '<button class="btn btn-sm btn-ghost" data-reopen-qual="' + esc(p.id) + '">Re-open</button>';
    if (canInstalls()) {
      var pq = quoteForProspect(p.id);
      actions += pq ? '<button class="btn btn-sm btn-ghost" data-edit="job" data-id="' + esc(pq.id) + '">Open quote</button>'
        : '<button class="btn btn-sm btn-cyan" data-make-install="' + esc(p.id) + '">Create quote</button>';
    }
    if (canRecordDeposit()) actions += '<button class="btn btn-sm btn-ghost" data-record-deposit="' + esc(p.id) + '">Record deposit</button>';
    if (canWork) actions += '<button class="btn btn-sm btn-ghost" data-edit="prospect" data-id="' + p.id + '">Edit</button>';
    var tone = isOverdue(p.followUp) ? "red" : isToday(p.followUp) ? "amber" : "navy";
    var reviewChip = prospectReviewChip(p.reviewStatus);
    return '<article class="item tone-' + tone + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(p.business) + '</div>' +
      '<div class="item-meta">' + esc(p.vertical) + " · " + esc(p.location || "No location") + "</div></div>" +
      '<span class="chip-stack">' + stageChip(p.stage) + reviewChip + qualChip(p) + closedSaleChip(p) + (p.imported ? chip("Imported" + (p.source ? " · " + p.source : ""), "grey") : "") + "</span></div>" +
      '<div class="item-lines">' +
      '<div class="item-line"><span class="k">Contact</span><span class="v">' + esc(p.contact || "Unknown") + "</span></div>" +
      '<div class="item-line"><span class="k">Phone</span><span class="v">' + (p.phone ? '<a class="telink" href="' + esc(telHref(p.phone)) + '">' + esc(p.phone) + "</a>" : "Not recorded") + "</span></div>" +
      '<div class="item-line"><span class="k">Next action</span><span class="v">' + esc(p.nextAction || "Not set") + "</span></div>" +
      '<div class="item-line"><span class="k">Follow-up</span><span class="v">' + (isOverdue(p.followUp) ? '<span style="color:var(--red);font-weight:700">' + dateLabel(p.followUp) + " · overdue</span>" : dateLabel(p.followUp)) + plannedByNote(p) + "</span></div>" +
      quickQuestionsLine(p) + followUpSummaryLine(p) + disqualifiedLine(p) +
      "</div>" +
      (p.createdBy ? '<div class="added-by">Added by ' + esc(p.createdBy) + "</div>" : "") +
      '<div class="item-actions">' + actions + "</div></article>";
  }

  /* ------------------------------- SITE VISITS ------------------------------- */
  function renderVisits() {
    setHead("Field visits", "Site visits", "Book and confirm site visits, then hand them to Operations.", "Schedule visit", true);
    content.innerHTML =
      '<div class="toolbar"><div class="field-inline" style="flex:1"><label for="visitFilter">Show</label>' +
      '<select id="visitFilter"><option value="">All visits</option>' + APPT_STATUSES.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("") + "</select></div></div>" +
      '<p class="result-note" id="visitNote"></p>' +
      '<div class="list" id="visitList"></div>';
    updateVisitList();
  }

  function updateVisitList() {
    var listEl = document.getElementById("visitList");
    if (!listEl) return;
    var filter = ((document.getElementById("visitFilter") || {}).value || "");
    var rows = visibleAppointments().filter(function (a) { return !filter || a.status === filter; })
      .sort(function (a, b) {
        // Attention first: Proposed/Rescheduled, then by date.
        var rank = function (s) { return /Proposed|Rescheduled/i.test(s) ? 0 : /Confirmed/i.test(s) ? 1 : 2; };
        var ra = rank(a.status), rb = rank(b.status);
        if (ra !== rb) return ra - rb;
        return (a.date || "").localeCompare(b.date || "");
      });

    document.getElementById("visitNote").textContent =
      rows.length + (rows.length === 1 ? " visit" : " visits") + (filter ? " · " + filter : "");

    listEl.innerHTML = rows.length ? rows.map(function (a) { return handoffCard(a, false); }).join("") :
      emptyState(ICON_PIN, "No site visits yet", "Qualify a prospect, then schedule a site visit.", "Schedule visit", 'data-new="appointment"');
  }

  // Full visit card. Confirmed visits get the distinct "ready for handoff" style.
  function handoffCard(a, compact) {
    var p = prospect(a.prospectId);
    var isConfirmed = a.status === "Confirmed";
    var gaps = handoffGaps(a);
    var actions = "";
    if (p.phone) actions += '<a class="btn btn-sm btn-cyan" href="' + esc(telHref(p.phone)) + '">Call contact</a>';
    if (/Proposed|Rescheduled/i.test(a.status)) actions += '<button class="btn btn-sm btn-primary" data-confirm="' + a.id + '">Confirm visit</button>';
    actions += '<button class="btn btn-sm btn-ghost" data-edit="appointment" data-id="' + a.id + '">Edit</button>';

    var flag = isConfirmed ? '<div class="handoff-flag"><span aria-hidden="true">✓</span> Ready for handoff to Operations</div>' : "";
    var warn = (!isConfirmed && hasGaps(gaps)) ?
      '<div class="item-line"><span class="k">To confirm</span><span class="v" style="color:var(--amber);font-weight:650">Add ' + esc(listAnd(gaps.prospect.concat(gaps.appointment))) + "</span></div>" : "";

    return '<article class="item ' + (isConfirmed ? "handoff" : "tone-amber") + '">' + flag +
      '<div class="item-top"><div><div class="item-title">' + esc(p.business || "Unknown prospect") + '</div>' +
      '<div class="item-meta"><strong>' + esc(relDay(a.date)) + "</strong> · " + esc(a.time || "no time") + "</div></div>" + apptChip(a.status) + "</div>" +
      '<div class="handoff-grid">' +
      line("When", esc(dateLabel(a.date)) + (a.time ? " at " + esc(a.time) : "")) +
      line("Operations owner", esc(a.director || "Not set")) +
      line("Purpose", esc(a.purpose || "Site visit")) +
      line("Contact", esc(p.contact || "Unknown")) +
      lineHtml("Phone", p.phone ? '<a class="telink" href="' + esc(telHref(p.phone)) + '">' + esc(p.phone) + "</a>" : "Not recorded") +
      line("Location", esc(p.location || "Not recorded")) +
      (a.directions ? line("Directions & access", esc(a.directions)) : "") +
      warn +
      "</div><div class=\"item-actions\">" + actions + "</div></article>";
  }
  function line(k, v) { return '<div class="item-line"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>"; }
  function lineHtml(k, v) { return line(k, v); }

  /* -------------------------------- CASH FLOW ------------------------------- */
  var ICON_CASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.4"/></svg>';
  var ICON_INSTALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="M12 12v8M4 8.5 12 12l8-3.5"/></svg>';
  var TX_CATS = {
    in: ["Customer deposit", "Customer payment", "Float top-up", "Refund", "Other"],
    out: ["Equipment", "Cable & materials", "Transport & fuel", "Labour", "Airtime & data", "Other"]
  };
  // How the money moved — matters for reconciliation in Uganda (most field
  // payments are Mobile Money, not cash) and for what counts as proof.
  var TX_METHODS = ["Cash", "MTN MoMo", "Airtel Money", "Bank"];
  var LARGE_AMOUNT = 1000000; // nudge for a confirm above this, to catch zero slips
  var money = function (n) { return "UGX " + Number(n || 0).toLocaleString("en-US"); };
  var cashFilter = "all";
  var cashPeriodMode = "month";
  var cashPeriodAnchor = today;
  var pendingProof = null; // resized photo chosen in the form, not yet uploaded
  var pendingGeo = null;   // site GPS pin captured in the prospect form
  var txPreset = null;     // prefill for a cash entry opened from an installation

  function txStatusChip(s) {
    if (s === "approved") return chip("Approved", "green", "✓");
    if (s === "query") return chip("Sent back", "red", "!");
    return chip("Pending", "amber", "◔");
  }

  // Every expense (money OUT) needs a receipt — unless it was already vetted by
  // the cash-flow team, in which case the recorder ticks "pre-approved" and can
  // submit and be approved without one.
  function needsProof(t) { return t.direction === "out" && !t.proofId && !t.preapproved; }

  // Cash on hand = everything recorded in minus everything recorded out.
  // Sent-back (disputed) entries don't count. Pending entries DO — the float
  // reflects physical cash, whether or not the owner has reviewed it yet.
  // When editing an entry, exclude its own current amount from the total.
  function availableForOut(excludeId) {
    var sum = 0;
    (state.transactions || []).forEach(function (t) {
      if (!t || t.status === "query") return;
      if (excludeId && t.id === excludeId) return;
      if (t.direction === "in") sum += Number(t.amount || 0);
      else if (t.direction === "out") sum -= Number(t.amount || 0);
    });
    return sum;
  }

  /* -------------------------------- DASHBOARD ------------------------------- */
  function metricTile(n, label) {
    return '<div class="metric-tile"><div class="metric-num">' + n + '</div><div class="metric-label">' + esc(label) + "</div></div>";
  }
  function renderDashboard() {
    if (canReviewProspects() || isTeamLead()) return renderSalesConsole();  // Team lead/Operations/admins
    renderMyDashboard();                                    // Sales
  }

  // Commission is paid weekly, every Saturday at 12:00 noon Kampala time
  // (commission.js): UGX 2,500 per qualified prospect the Team lead approves,
  // UGX 100,000 per client once their first deposit is recorded.
  var commWeekShift = 0;
  function commissionOpts(extra) {
    return Object.assign({ perQualified: commissionPerQualified(), perDeposit: commissionRate(), users: state.users || [] }, extra || {});
  }
  function commissionFor(period, extra) {
    return window.VeriskoCommission.earnings(state.prospects || [], state.jobs || [], state.transactions || [], period, commissionOpts(extra));
  }
  function monthToDate() {
    var C = window.VeriskoCommission, now = new Date();
    var local = new Date(now.getTime() + 3 * 3600 * 1000);
    var first = local.getUTCFullYear() + "-" + String(local.getUTCMonth() + 1).padStart(2, "0") + "-01";
    return { start: C.eventTime(first), end: new Date(now.getTime() + 1) };
  }
  function commLine(n, rate, label) {
    return '<div class="pay-line"><span>' + n + " " + label + " × " + money(rate) + "</span><strong>" + money(n * rate) + "</strong></div>";
  }

  // Salesperson's own performance: this pay week, last week, month to date.
  function renderMyDashboard() {
    setHead("Your performance", "Dashboard", "Your sales and commission at a glance.", "", false);
    var C = window.VeriskoCommission;
    var email = ((settings.user || {}).email || "").toLowerCase();
    var ps = (state.prospects || []).filter(function (p) { return (p.createdByEmail || "").toLowerCase() === email; });
    var total = ps.length;
    var closed = ps.filter(function (p) { return p.closedSale; }).length;
    var conv = total ? Math.round((closed / total) * 100) : 0;
    var perQ = commissionPerQualified(), perD = commissionRate(), target = commissionTarget();
    var week = C.payWeek(new Date(), 0), last = C.payWeek(new Date(), -1);
    var zero = { qualified: [], deposits: [], total: 0, pendingQual: 0 };
    var w = commissionFor(week, { email: email }).reps[0] || zero;
    var lw = commissionFor(last, { email: email }).reps[0] || zero;
    var mtd = commissionFor(monthToDate(), { email: email }).total;
    var pending = ps.filter(function (p) { return p.qualStatus === "pending"; }).length;
    var sentBack = ps.filter(function (p) { return p.qualStatus === "query"; }).length;
    var disq = ps.filter(unreadDisqualified).length;
    var qualAll = ps.filter(function (p) { return p.qualStatus === "approved"; }).length;
    var depAll = ps.filter(function (p) { return !!firstPaymentFor(p); }).length;
    var pct = target ? Math.min(100, Math.round((mtd / target) * 100)) : 0;

    var hero = '<section class="card dash-hero">' +
      '<p class="dash-eyebrow">Commission this week</p>' +
      '<div class="dash-big">' + money(w.total) + "</div>" +
      '<div class="dash-sub">Paid ' + C.label(week.payday, true) + " · since " + C.label(week.start, true) + "</div>" +
      '<div class="pay-summary" style="margin-top:12px">' + commLine(w.qualified.length, perQ, "qualified prospects approved") + commLine(w.deposits.length, perD, "client deposits") + "</div>" +
      (pending ? '<div class="dash-note">' + pending + " qualified " + (pending === 1 ? "prospect is" : "prospects are") + " waiting for the Team lead (" + money(pending * perQ) + " once approved).</div>" : "") +
      (sentBack ? '<div class="dash-note" style="color:var(--amber)">' + sentBack + " sent back by the Team lead — open " + (sentBack === 1 ? "it" : "them") + " in Prospects to see why.</div>" : "") +
      (disq ? '<div class="dash-note" style="color:var(--red)">' + disq + " disqualified by the Team lead or Operations — open Prospects to see why.</div>" : "") +
      '<div class="dash-note">Last week: <strong>' + money(lw.total) + "</strong> (paid " + C.label(last.payday, true) + ").</div>" +
      '<div class="dash-foot" style="margin-top:12px">Month to date ' + money(mtd) + " of " + money(target) + " target</div>" +
      '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div></section>';

    var tiles = '<div class="metric-grid">' +
      metricTile(total, "My prospects") + metricTile(qualAll, "Qualified (approved)") +
      metricTile(depAll, "Clients with a deposit") + metricTile(conv + "%", "Close rate") + "</div>";

    var byStage = STAGES.map(function (s) { return { label: s, n: ps.filter(function (p) { return p.stage === s; }).length }; }).filter(function (x) { return x.n > 0; });
    var maxN = byStage.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
    var bars = byStage.length ? '<section class="card dash-bars"><h2 class="dash-h2">My pipeline by stage</h2>' +
      byStage.map(function (x) {
        return '<div class="bar-row"><span class="bar-label">' + esc(x.label) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.round((x.n / maxN) * 100) + '%"></span></span><span class="bar-count">' + x.n + "</span></div>";
      }).join("") + "</section>" : "";

    var how = '<p class="result-note">Move a prospect to Qualified and the Team lead approves it: ' + money(perQ) + ". When the client pays a deposit: " + money(perD) + ". Paid every Saturday at 12:00 noon.</p>";
    content.innerHTML = hero + tiles + how + bars;
  }

  // Team lead / Operations / admin console: weekly payout per rep.
  function renderSalesConsole() {
    var C = window.VeriskoCommission;
    setHead(isTeamLead() ? "Team lead" : "Operations", "Sales & commissions", "Weekly commission per rep, paid every Saturday at 12:00 noon.", "", false);
    var perQ = commissionPerQualified(), perD = commissionRate(), target = commissionTarget();
    var week = C.payWeek(new Date(), commWeekShift);
    var e = commissionFor(week);
    var isCurrent = commWeekShift === 0, isLast = commWeekShift === -1;
    var nQ = e.reps.reduce(function (n, r) { return n + r.qualified.length; }, 0);
    var nD = e.reps.reduce(function (n, r) { return n + r.deposits.length; }, 0);
    var waiting = (state.prospects || []).filter(function (p) { return p.qualStatus === "pending"; }).length;

    var nav = '<div class="cash-mode" role="group" aria-label="Pay week" style="display:flex;gap:8px;align-items:center;margin-bottom:12px">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-comm-week="-1">‹ Earlier</button>' +
      '<span style="flex:1;text-align:center;font-weight:600">' + (isCurrent ? "This week" : isLast ? "Last week" : "Week ending " + C.label(week.payday, false)) + "</span>" +
      '<button type="button" class="btn btn-ghost btn-sm" data-comm-week="1"' + (isCurrent ? " disabled" : "") + ">Later ›</button></div>";
    var hero = '<section class="card dash-hero">' + nav +
      '<p class="dash-eyebrow">' + (isCurrent ? "Commission so far · pay " : "Commission paid ") + C.label(week.payday, true) + "</p>" +
      '<div class="dash-big">' + money(e.total) + "</div>" +
      '<div class="dash-sub">' + nQ + " qualified × " + money(perQ) + " · " + nD + " deposits × " + money(perD) + "</div>" +
      '<div class="dash-note">Week from ' + C.label(week.start, true) + " to " + C.label(week.end, true) + " (Kampala time)." +
      (waiting ? " " + waiting + " qualified " + (waiting === 1 ? "prospect is" : "prospects are") + " waiting for approval in Prospects." : "") + "</div></section>";

    var board = e.reps.length ? '<section class="card dash-bars"><h2 class="dash-h2">Pay per rep</h2>' +
      '<div class="lead-head"><span>Rep</span><span>Qualified · Deposits</span><span>Pay</span></div>' +
      e.reps.map(function (r) {
        var detail = r.deposits.map(function (d) { return esc(d.business || ""); }).join(", ");
        return '<div class="lead-row"><span class="lead-name"><strong>' + esc(r.name) + "</strong><small>" + (detail ? "Deposits: " + detail : "No deposits this week") + "</small></span>" +
          '<span class="lead-closed">' + r.qualified.length + " · " + r.deposits.length + "</span>" +
          '<span class="lead-comm">' + money(r.total) + "</span></div>";
      }).join("") + "</section>" : '<p class="result-note">No commission earned in this week yet.</p>';

    var editor = canReviewProspects() ? '<section class="card settings-card"><h2>Commission settings</h2>' +
      "<p>Paid weekly, every Saturday at 12:00 noon. A qualified prospect counts once the Team lead approves it; a client counts once, as soon as their first deposit is recorded.</p>" +
      '<form id="commissionForm" class="add-member">' +
      '<div class="field"><label for="commQual">Per qualified prospect (UGX)</label><input id="commQual" name="commQual" type="number" inputmode="numeric" min="0" step="500" value="' + perQ + '"></div>' +
      '<div class="field"><label for="commRate">Per client deposit (UGX)</label><input id="commRate" name="commRate" type="number" inputmode="numeric" min="0" step="1000" value="' + perD + '"></div>' +
      '<div class="field"><label for="commTarget">Monthly target per rep (UGX)</label><input id="commTarget" name="commTarget" type="number" inputmode="numeric" min="0" step="10000" value="' + target + '"></div>' +
      '<button type="submit" class="btn btn-ghost btn-block">Save commission settings</button></form></section>' : "";

    content.innerHTML = hero + inviteCard() + board + (canReviewProspects() ? rosterCard() : "") + editor;
  }

  // Manage the sales roster from the console (Operations + admins). Scoped to
  // Sales/Operations members — Owner and Technical accounts stay in Settings.
  function rosterCard() {
    // Only the Sales/Operations roster — Owner and Technical (super-admins)
    // are managed by the Owner in Settings, not shown here.
    var users = (state.users || []).filter(function (u) { return u.id !== ownerId() && u.role !== "admin"; });
    var manageableRoleOpts = function (sel) {
      return [["sales", "Sales"], ["teamlead", "Team lead"], ["operations", "Operations"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === normRole(sel) ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("");
    };
    var rows = users.map(function (u) {
      var actions = "";
      if (actorCanManage(u)) {
        actions += '<select class="account-role-select" data-set-role data-user-id="' + esc(u.id) + '" aria-label="Role for ' + esc(u.name) + '">' + manageableRoleOpts(u.role) + "</select>";
        actions += pinActions(u);
        actions += '<button type="button" class="account-remove" data-remove-user="' + esc(u.id) + '" aria-label="Remove ' + esc(u.name) + '">Remove</button>';
      }
      return '<div class="account-row" style="background:var(--fill-2)"><span class="user-avatar" aria-hidden="true">' + esc(initials(u.name)) + "</span>" +
        '<span class="who"><strong>' + esc(u.name) + " · " + esc(roleName(u)) + "</strong><span>" + esc(contactOf(u)) + "</span></span>" +
        (actions ? '<span class="row-actions">' + actions + "</span>" : "") + "</div>";
    }).join("");
    return signupsCard() + '<section class="card settings-card"><h2>Manage the team</h2>' +
      "<p>Add or remove salespeople and Operations, and switch their roles. Owner and Technical accounts are managed by the Owner in Settings. Removing someone revokes access immediately.</p>" +
      (users.length ? '<div class="account-list">' + rows + "</div>" : '<p class="settings-note">No sales or operations members yet — add the first one below.</p>') +
      '<form id="addMemberForm" class="add-member">' +
      '<div class="field"><label for="memberName">Name</label><input id="memberName" name="name" type="text" autocomplete="off" placeholder="e.g. Grace Namubiru" required></div>' +
      '<div class="field"><label for="memberEmail">Email</label><input id="memberEmail" name="email" type="email" inputmode="email" autocomplete="off" autocapitalize="off" placeholder="grace@example.com" required></div>' +
      '<div class="field"><label for="memberRole">Role</label><select id="memberRole" name="role">' +
      '<option value="sales">Sales — prospects &amp; visits</option>' +
      '<option value="teamlead">Team lead — approves qualified prospects, records deposits</option>' +
      '<option value="operations">Operations — also Cash flow</option></select></div>' +
      '<button type="submit" class="btn btn-ghost btn-block">Add team member</button>' +
      '<p class="settings-note" style="margin-top:10px">No email? Invite them on WhatsApp — they join with their phone number, a PIN and a selfie, and add their National ID within 5 days.</p>' +
      '<button type="button" class="btn btn-primary btn-block" data-invite-staff style="margin-top:8px">Invite staff on WhatsApp</button></form></section>';
  }

  /* ------------------------------ INSTALLATIONS ----------------------------- */
  function canInstalls() { return isAdmin() || !!(settings.user && settings.user.role === "operations"); }

  // Shared client block used by installations AND quotes: pick a client from
  // the sales pipeline (read-only, no re-entry), or add a walk-in.
  function renderClientBlock(id, presetProspect, source) {
    var isWalkin = presetProspect === "__walkin__";
    var preset = (!id && presetProspect && !isWalkin) ? prospect(presetProspect) : null;
    var linkedId = source.prospectId || (preset ? preset.id : "");
    var lp = linkedId ? prospect(linkedId) : null;
    var isLinked = !!(lp && lp.id);
    var roClient = "";
    if (isLinked) {
      var visit = appointmentFor(linkedId);
      var ctx = line("Contact", esc(lp.contact || "—") + (lp.phone ? " · " + esc(lp.phone) : "")) +
        line("Site", esc(lp.location || "—") + (lp.geo ? " · " + mapLink(lp.geo) : "")) +
        (lp.vertical ? line("Type", esc(lp.vertical)) : "") +
        (lp.existing ? line("Existing cameras", esc(lp.existing)) : "") +
        (lp.areas ? line("Areas to cover", esc(lp.areas)) : "") +
        (lp.concern ? line("Security concern", esc(lp.concern)) : "") +
        (visit && visit.directions ? line("Site access", esc(visit.directions)) : "");
      roClient = '<div class="field full"><label>Client <span class="optional-tag">from the sales record</span></label>' +
        '<div class="ro-card"><div class="ro-title">' + esc(lp.business) + '</div><div class="item-lines">' + ctx + "</div>" +
        (lp.photoId ? '<button type="button" class="btn btn-ghost btn-sm" data-job-photo="' + esc(lp.photoId) + '" style="margin-top:10px">View business photo</button>' : "") + "</div>" +
        '<p class="helper">These come from the prospect — edit them in Prospects if they change.</p></div>';
    }
    var manualClient =
      field("business", "Client / business", "text", source.business, { required: true, full: true, placeholder: "e.g. Acacia Pharmacy" }) +
      field("contact", "Contact person", "text", source.contact, { placeholder: "Who to ask for" }) +
      field("phone", "Phone", "tel", source.phone) +
      field("location", "Site location", "text", source.location, { full: true, placeholder: "Area, street or landmark" });
    var block;
    if (!id) {
      var pickVal = isLinked ? linkedId : (isWalkin ? "__walkin__" : "");
      var quoteTag = function (p) { var q = quoteForProspect(p.id); return !q ? "" : jobIsDelivery(q.stage) ? " — accepted" : (q.stage === "Rejected" || q.stage === "Cancelled") ? " — quote " + q.stage.toLowerCase() : " — quoted"; };
      var opts = (state.prospects || []).slice()
        .sort(function (a, b) { return (quoteForProspect(a.id) ? 1 : 0) - (quoteForProspect(b.id) ? 1 : 0) || (a.business || "").localeCompare(b.business || ""); })
        .map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === pickVal ? " selected" : "") + ">" + esc(p.business) + quoteTag(p) + "</option>"; }).join("");
      block = '<div class="field full"><label for="f_clientPick">Client <span class="req" aria-hidden="true">*</span></label>' +
        '<select id="f_clientPick"><option value="">Choose the client…</option>' + opts +
        '<option value="__walkin__"' + (isWalkin ? " selected" : "") + ">+ Walk-in / not in the sales list</option></select>" +
        '<p class="helper">Pick a client from Sales, or add a walk-in.</p></div>' +
        (isLinked ? roClient : (isWalkin ? manualClient : '<div class="field full"><p class="rev-petty">Pick a client above to continue.</p></div>'));
    } else {
      block = isLinked ? roClient : manualClient;
    }
    return block + '<input type="hidden" name="prospectId" value="' + esc(linkedId) + '">';
  }

  /* ------------------------------ QUOTE ENGINE ------------------------------ */
  // Shared pricing UI used by the job form (the "quote" step of a job).
  function quoteTierChip(t) { return t === "Very Complex" ? chip(t, "red", "!") : t === "Complex" ? chip(t, "amber", "◔") : t === "Standard" ? chip(t, "cyan", "★") : chip(t || "Simple", "grey", "•"); }

  // Read the live quote inputs off the form.
  function readQuoteInputs() {
    var rubric = {};
    QUOTE_RUBRIC.forEach(function (r) { var el = document.getElementById("f_" + r.key); rubric[r.key] = el ? el.value : "0"; });
    var camEl = document.getElementById("f_cameraCount");
    var addons = {};
    QUOTE_ADDONS.forEach(function (a) {
      if (a.qty) { var qi = document.querySelector('[data-addon-qty="' + a.key + '"]'); addons[a.key] = qi ? Math.max(0, Math.round(Number(qi.value) || 0)) : 0; }
      else { var ci = document.querySelector('[data-addon="' + a.key + '"]'); addons[a.key] = ci ? ci.checked : false; }
    });
    var zoneEl = document.getElementById("f_zone");
    var discEl = document.getElementById("f_discountPct");
    return { rubric: rubric, cameraCount: camEl ? Number(camEl.value) || 0 : 0, addons: addons, zone: zoneEl ? zoneEl.value : "1", discountPct: discEl ? Math.max(0, Number(discEl.value) || 0) : 0 };
  }
  function quoteSummaryHtml(r) {
    var rows = (r.custom ? '<div class="pay-line"><span>Base (12+ cameras)</span><strong>Custom — Ben quotes</strong></div>' :
      '<div class="pay-line"><span>Base (' + r.cameras + "-cam " + esc(r.tier) + ")</span><strong>" + money(r.base) + "</strong></div>") +
      r.lines.map(function (l) { return '<div class="pay-line"><span>' + esc(l.label) + (l.qty > 1 ? " ×" + l.qty : "") + (l.auto ? " (auto)" : "") + "</span><strong>" + money(l.total) + "</strong></div>"; }).join("") +
      (r.zone.surcharge > 0 ? '<div class="pay-line"><span>' + esc(r.zone.label.split(" — ")[0]) + " surcharge</span><strong>" + money(r.zone.surcharge) + "</strong></div>" : "") +
      (r.bundle ? '<div class="pay-line"><span>Complete Home Bundle</span><strong class="pos">−' + money(r.bundleDiscount) + "</strong></div>" : "") +
      (r.discountAmount > 0 ? '<div class="pay-line"><span>Discount ' + r.discountPct + "%</span><strong class=\"pos\">−" + money(r.discountAmount) + "</strong></div>" : "");
    var total = '<div class="pay-line pay-grand"><span><strong>Total (cash)</strong></span><strong>' + (r.custom ? "—" : money(r.cash)) + "</strong></div>";
    var fin = (!r.custom && r.financingAvailable) ?
      '<div class="quote-fin"><div class="quote-fin-col"><div class="qf-h">Cash · 60/40</div>' +
      '<div class="qf-row"><span>Install day</span><strong>' + money(Math.round(r.cash * 0.6)) + "</strong></div>" +
      '<div class="qf-row"><span>Completion</span><strong>' + money(Math.round(r.cash * 0.4)) + "</strong></div></div>" +
      '<div class="quote-fin-col"><div class="qf-h">3 months · 40/30/30 <small>+250k</small></div>' +
      '<div class="qf-row"><span>Install day</span><strong>' + money(Math.round(r.financed * 0.4)) + "</strong></div>" +
      '<div class="qf-row"><span>Month 2</span><strong>' + money(Math.round(r.financed * 0.3)) + "</strong></div>" +
      '<div class="qf-row"><span>Month 3</span><strong>' + money(Math.round(r.financed * 0.3)) + "</strong></div></div></div>" :
      (r.custom ? "" : '<p class="helper">Financing options show at ' + money(1500000) + " and above.</p>");
    return '<div class="pay-summary">' + rows + total + "</div>" + fin;
  }
  function recalcQuoteForm() {
    var el = document.getElementById("quoteSummary"); if (!el) return;
    var r = computeQuote(readQuoteInputs());
    el.innerHTML = quoteSummaryHtml(r);
    var tc = document.getElementById("quoteTier"); if (tc) tc.innerHTML = quoteTierChip(r.tier) + ' <span class="quote-pts">' + r.pts + " pts</span>";
    var gov = document.getElementById("quoteGov");
    if (gov) gov.innerHTML = r.needsApproval ? '<div class="rev-noproof">' + (r.custom ? "12+ cameras is a custom quote — " : "This site scored Very Complex — ") + "send it to Ben to approve before quoting." + (isAdmin() ? " (You can approve as admin.)" : "") + "</div>" : "";
    var save = document.getElementById("saveButton");
    if (save) save.disabled = (r.needsApproval && !isAdmin()) || (!isAdmin() && r.discountPct > 5);
    // The Final-price field appears for a custom (12+) job, or whenever an admin
    // has typed an override value.
    var fp = document.getElementById("finalPriceField");
    if (fp) {
      var fpInput = document.getElementById("f_finalPrice");
      var hasVal = fpInput && String(fpInput.value || "").trim() !== "";
      fp.hidden = !(r.custom || hasVal);
    }
  }

  // Delete-safe reference: derive the next number from the highest existing one,
  // not the array length (so removing a job can't cause a collision).
  function newJobRef() {
    var yr = String(today || "2026").slice(0, 4);
    var max = (state.jobs || []).reduce(function (m, j) {
      var n = parseInt(String(j.ref || "").replace(/^J-\d{4}-/, ""), 10);
      return (n > m ? n : m);
    }, 0);
    return "J-" + yr + "-" + ("000" + (max + 1)).slice(-4);
  }

  async function saveJob(data) {
    if (!canInstalls()) return;
    var prospectId = data.prospectId || "";
    var linked = prospectId ? prospect(prospectId) : null;
    var isLinked = !!(linked && linked.id);
    // Linked jobs take client details from the prospect (not stored here);
    // walk-in/standalone jobs store their own.
    var client = isLinked ? { business: "", contact: "", phone: "", location: "" }
      : { business: (data.business || "").trim(), contact: (data.contact || "").trim(), phone: (data.phone || "").trim(), location: (data.location || "").trim() };
    if (!isLinked && !client.business) { showFormError(editing.id ? "Enter the client / business name." : "Choose the client for this job — pick one from Sales, or add a walk-in with a name."); return; }
    var inputs = readQuoteInputs();
    var r = computeQuote(inputs);
    if (!isAdmin() && r.discountPct > 5) { showFormError("A discount above 5% needs the Owner — ask Ben to apply it."); return; }
    if (r.needsApproval && !isAdmin()) { showFormError("This scored Very Complex (or 12+ cameras). Send it to Ben to approve before quoting."); return; }
    var stage = JOB_STAGES.indexOf(data.stage) >= 0 ? data.stage : "Draft";
    var checklist = collectChecklist();
    if (stage === "Handed over" && !checklistComplete(checklist)) {
      var missing = INSTALL_CHECKLIST.filter(function (i) { return !checklist[i.key]; }).map(function (i) { return i.label.toLowerCase(); });
      showFormError("Not ready to hand over — first tick: " + listAnd(missing) + ".");
      return;
    }
    // Preserve an existing manual price when the (admin-only) field isn't shown.
    var existing = editing.id ? (state.jobs.find(function (x) { return x.id === editing.id; }) || {}) : {};
    var fpEl = document.getElementById("f_finalPrice");
    var finalPrice = fpEl ? Math.max(0, Math.round(Number(fpEl.value) || 0)) : (Number(existing.finalPrice) || 0);
    var priceOverride = r.custom || (fpEl ? finalPrice > 0 : !!existing.priceOverride);
    var fields = Object.assign({
      prospectId: prospectId, business: client.business, contact: client.contact, phone: client.phone, location: client.location,
      stage: stage, finalPrice: finalPrice, priceOverride: priceOverride,
      scheduledDate: data.scheduledDate || "", scheduledTime: data.scheduledTime || "",
      technicianId: data.technicianId || "", materials: collectMaterials(), checklist: checklist,
      notes: (data.notes || "").trim()
    }, inputs);
    var jobId = editing.id || uid();
    var wasNew = !editing.id;
    var prevStage = existing.stage || "";
    if (editing.id) {
      var idx = state.jobs.findIndex(function (x) { return x.id === editing.id; });
      state.jobs[idx] = Object.assign({}, state.jobs[idx], fields);
    } else {
      state.jobs.push(Object.assign({ id: jobId, ref: newJobRef(), createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "", createdAt: today }, fields));
    }
    hideFormError(); dialog.close();
    saveData(wasNew ? "Job created" : "Job updated"); syncClosedSales(); render();
    // A quotation is "done" when a job is created in Draft/Sent, or moved to Sent.
    var quoteStage = stage === "Draft" || stage === "Sent";
    if (quoteStage && (wasNew || (stage === "Sent" && prevStage !== "Sent")) && jobValue(job(jobId)) > 0) offerQuoteShare(jobId);
  }

  function job(id) { return (state.jobs || []).find(function (x) { return x.id === id; }) || null; }
  function technician(id) { return (state.technicians || []).find(function (t) { return t.id === id; }) || null; }
  function activeTechnicians() { return (state.technicians || []).filter(function (t) { return t.active !== false; }); }

  // Bill of materials helpers.
  function materialsTotal(job) {
    return (job.materials || []).reduce(function (s, m) { return s + (Number(m.qty) || 0) * (Number(m.unitCost) || 0); }, 0);
  }
  function materialsCount(job) { return (job.materials || []).length; }

  // Completion checklist helpers.
  function checklistDone(job) { var cl = job.checklist || {}; return INSTALL_CHECKLIST.filter(function (i) { return cl[i.key]; }).length; }
  function checklistComplete(cl) { cl = cl || {}; return INSTALL_CHECKLIST.every(function (i) { return cl[i.key]; }); }
  function collectChecklist() {
    var out = {};
    document.querySelectorAll("#chkList [data-check]").forEach(function (el) { out[el.getAttribute("data-check")] = el.checked; });
    return out;
  }

  // Client details resolve from the linked prospect (one source of truth) —
  // standalone jobs keep their own. Nothing is re-typed by Operations.
  function jobClient(job) {
    if (job && job.prospectId) {
      var p = prospect(job.prospectId);
      if (p && p.id) return { business: p.business, contact: p.contact, phone: p.phone, location: p.location, prospect: p };
    }
    return { business: (job && job.business) || "", contact: (job && job.contact) || "", phone: (job && job.phone) || "", location: (job && job.location) || "", prospect: null };
  }

  // Job money — all recorded through the cash-flow float, linked by installId
  // (the field name is kept; it now points to a job id).
  function jobPayments(jobId) { return (state.transactions || []).filter(function (t) { return t.installId === jobId; }); }
  function paidForJob(jobId) { return jobPayments(jobId).filter(function (t) { return t.direction === "in" && t.status === "approved"; }).reduce(function (s, t) { return s + Number(t.amount || 0); }, 0); }
  function pendingInForJob(jobId) { return jobPayments(jobId).filter(function (t) { return t.direction === "in" && t.status !== "approved"; }).reduce(function (s, t) { return s + Number(t.amount || 0); }, 0); }
  function spendForJob(jobId) { return jobPayments(jobId).filter(function (t) { return t.direction === "out" && t.status === "approved"; }).reduce(function (s, t) { return s + Number(t.amount || 0); }, 0); }

  // Payments panel shown when editing a saved job.
  function jobPaymentsSection(job) {
    var quote = jobValue(job), paid = paidForJob(job.id), pend = pendingInForJob(job.id), spend = spendForJob(job.id);
    var pays = jobPayments(job.id).slice().sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    var rows = pays.length ? pays.map(function (t) {
      return '<div class="item-line"><span class="k">' + dateLabel(t.date) + " · " + (t.direction === "in" ? "In" : "Out") + '</span><span class="v">' + (t.direction === "in" ? "+" : "−") + money(t.amount) + " " + txStatusChip(t.status) + "</span></div>";
    }).join("") : '<p class="helper">No payments recorded yet.</p>';
    return '<div class="field full"><label>Payments &amp; float</label>' +
      '<div class="pay-summary">' +
      (quote > 0 ? '<div class="pay-line"><span>Quote</span><strong>' + money(quote) + "</strong></div>" : "") +
      '<div class="pay-line"><span>Paid (approved)</span><strong class="pos">' + money(paid) + "</strong></div>" +
      (pend > 0 ? '<div class="pay-line"><span>Awaiting approval</span><strong class="amber">' + money(pend) + "</strong></div>" : "") +
      (quote > 0 ? '<div class="pay-line"><span>Balance due</span><strong>' + money(Math.max(0, quote - paid)) + "</strong></div>" : "") +
      (spend > 0 ? '<div class="pay-line"><span>Materials/labour out</span><strong class="neg">' + money(spend) + "</strong></div>" : "") +
      "</div>" +
      '<div class="pay-list">' + rows + "</div>" +
      '<button type="button" class="btn btn-primary btn-block" data-job-pay="' + esc(job.id) + '" style="margin-top:10px">Record a client payment</button>' +
      (materialsTotal(job) > 0 ? '<button type="button" class="btn btn-ghost btn-block" data-job-spend="' + esc(job.id) + '" style="margin-top:8px">Record materials spend (' + money(materialsTotal(job)) + ")</button>" : "") +
      '<p class="helper">Payments post to the Cash flow float and appear there for approval.</p></div>';
  }

  /* ------------------------ Quotation PDF & sharing ------------------------- */
  // The PDF is drawn by quote-pdf.js with jsPDF (vendor/), which loads on
  // demand the first time Jobs opens so a Share tap is instant afterwards.
  var jsPdfLoading = null;
  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (jsPdfLoading) return jsPdfLoading;
    jsPdfLoading = new Promise(function (resolve, reject) {
      var sc = document.createElement("script");
      sc.src = "vendor/jspdf.umd.min.js?v=2.5.2"; sc.async = true;
      sc.onload = function () { if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF); else { jsPdfLoading = null; reject(new Error("The PDF tool didn't load. Try again.")); } };
      sc.onerror = function () { jsPdfLoading = null; reject(new Error("Couldn't load the PDF tool. Check your connection and try again.")); };
      document.head.appendChild(sc);
    });
    return jsPdfLoading;
  }
  function quoteModelFor(j) {
    return window.VeriskoQuote.buildQuoteModel(j, jobClient(j), computeQuote(j), { value: jobValue(j), preparedBy: settings.user && settings.user.name, date: today });
  }
  // A custom (12+ camera) job needs its final price before it can be quoted.
  function quoteReady(j) {
    if (!j) { toast("That job no longer exists."); return false; }
    if (quoteModelFor(j).total == null) { toast("Set the final price for this custom job before sharing its quotation."); return false; }
    return true;
  }
  async function quotePdfFor(j) {
    var JsPDF = await loadJsPdf();
    var model = quoteModelFor(j);
    return { doc: window.VeriskoQuote.renderQuotePdf(JsPDF, model), model: model, name: window.VeriskoQuote.quoteFileName(model) };
  }
  async function downloadQuotePdf(id) {
    var j = job(id); if (!quoteReady(j)) return;
    try { var q = await quotePdfFor(j); q.doc.save(q.name); toast("Quotation PDF saved to your phone"); }
    catch (e) { toast(e.message || "Couldn't build the PDF."); }
  }
  // Phone share sheet (WhatsApp, email…) with the PDF attached. Where files
  // can't be shared, save the PDF and open WhatsApp with the summary text.
  async function shareQuote(id) {
    var j = job(id); if (!quoteReady(j)) return;
    try {
      var q = await quotePdfFor(j);
      var text = window.VeriskoQuote.quoteShareText(q.model);
      var file = null;
      try { file = new File([q.doc.output("blob")], q.name, { type: "application/pdf" }); } catch (e) { file = null; }
      if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "Verisko quotation " + q.model.ref, text: text }); markQuoteShared(id); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      q.doc.save(q.name);
      var digits = String(q.model.client.phone || "").replace(/\D/g, "");
      if (digits.length === 10 && digits.charAt(0) === "0") digits = "256" + digits.slice(1);
      if (digits.length === 9) digits = "256" + digits;
      window.open("https://wa.me/" + (digits.length >= 11 ? digits : "") + "?text=" + encodeURIComponent(text), "_blank", "noopener");
      markQuoteShared(id);
      toast("PDF saved \u2014 attach it to the WhatsApp message");
    } catch (e) { toast(e.message || "Couldn't share the quotation."); }
  }
  // Sharing a quotation is the moment it's "sent": a Draft moves to Sent, and
  // the share is stamped on the job. If the job's form is open, its Stage
  // control follows so a later Save can't put it back to Draft.
  function markQuoteShared(id) {
    var j = job(id); if (!j) return;
    var was = j.stage;
    j.quoteSharedAt = nowIso(); j.quoteSharedBy = (settings.user && settings.user.name) || "";
    if (j.stage === "Draft" || !j.stage) j.stage = "Sent";
    if (dialog.open && editing && editing.id === id) {
      var sel = form.querySelector('select[name="stage"]');
      if (sel && sel.value === "Draft") { sel.value = "Sent"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    saveData(was !== j.stage ? "Quotation shared \u2014 job marked Sent" : "Quotation shared");
    if (!dialog.open) render();
  }
  async function offerQuoteShare(id) {
    var r = await openSheet({ title: "Quotation ready", body: "Send it to the client now? You can also do this later from the job.",
      choices: ["Share via WhatsApp", "Download PDF"], requireValue: true, confirmLabel: "Continue", cancelLabel: "Not now" });
    if (!r) return;
    if (r.choice === "Download PDF") downloadQuotePdf(id); else shareQuote(id);
  }
  function quoteActionsHtml(id) {
    return '<div class="item-actions quote-actions"><button type="button" class="btn btn-ghost btn-sm" data-quote-pdf="' + esc(id) + '">Quote PDF</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-quote-share="' + esc(id) + '">Share via WhatsApp</button></div>';
  }

  /* --------------------------------- JOBS ----------------------------------- */
  // One screen for the whole lifecycle: a job is a "quote" early and a live
  // install later — same record, same card, different stage.
  var jobFilter = "all";
  function jobStageChip(s) {
    if (s === "Handed over" || s === "Installed") return chip(s, "green", "✓");
    if (s === "Accepted") return chip(s, "green", "✓");
    if (s === "In progress") return chip(s, "cyan", "★");
    if (s === "Scheduled") return chip(s, "amber", "◔");
    if (s === "Sent") return chip(s, "cyan", "→");
    if (s === "Rejected" || s === "Cancelled") return chip(s, "red", "✕");
    return chip(s || "Draft", "grey", "•");
  }
  // Stages that count toward the live pipeline (not lost, not fully handed over).
  function jobIsOpen(j) { return j.stage !== "Handed over" && j.stage !== "Rejected" && j.stage !== "Cancelled"; }
  function jobIsWon(j) { return jobIsDelivery(j.stage); }

  function renderJobs() {
    setHead("Operations", "Jobs", "Quote, schedule and run CCTV jobs — one place from quote to handover.", "New job", true);
    loadJsPdf().catch(function () { /* retried on demand */ });
    var jobs = state.jobs || [];
    var open = jobs.filter(jobIsOpen);
    var pipeline = open.reduce(function (s, j) { return s + jobValue(j); }, 0);
    var wonValue = jobs.filter(jobIsWon).reduce(function (s, j) { return s + jobValue(j); }, 0);
    var summary = '<section class="card cash-summary"><div class="cash-bal"><span class="k">Open pipeline</span><strong>' + money(pipeline) + "</strong>" +
      "<small>" + open.length + " open · " + money(wonValue) + " won/in progress · " + jobs.length + " total</small></div></section>";
    var filterBar = '<div class="toolbar"><div class="field-inline" style="flex:1"><label for="jobFilter">Show</label><select id="jobFilter">' +
      [["all", "All jobs"]].concat(JOB_STAGES.map(function (s) { return [s, s]; })).map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === jobFilter ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div></div>";
    var order = JOB_STAGES;
    var rows = jobs.filter(function (j) { return jobFilter === "all" || j.stage === jobFilter; })
      .sort(function (a, b) { return order.indexOf(a.stage) - order.indexOf(b.stage) || (b.createdAt || "").localeCompare(a.createdAt || ""); });
    var list = rows.length ? '<div class="list">' + rows.map(jobCard).join("") + "</div>" :
      emptyState(ICON_INSTALL, "No jobs yet", "Tap New job to price a site, or start one from a closed sale in Prospects.", "New job", 'data-new="job"');
    content.innerHTML = summary + filterBar + '<p class="result-note">' + rows.length + (rows.length === 1 ? " job" : " jobs") + "</p>" + list + technicianRosterCard();
  }

  function jobCard(j) {
    var c = jobClient(j);
    var r = computeQuote(j);
    var val = jobValue(j);
    var tech = j.technicianId ? technician(j.technicianId) : null;
    var delivery = jobIsDelivery(j.stage);
    var priceLine = (r.custom && !val) ? '<div class="item-line"><span class="k">Value</span><span class="v">Custom — Ben quotes</span></div>' :
      '<div class="item-line"><span class="k">Value</span><span class="v">' + money(val) + "</span></div>";
    var cam = Number(j.cameraCount) || 0;
    var camMeta = cam >= 12 ? "12+ cam" : (cam >= 2 ? cam + "-cam · " + r.tier : "priced by hand");
    return '<article class="item" data-edit="job" data-id="' + j.id + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(c.business || "Untitled job") + "</div>" +
      '<div class="item-meta">' + esc(j.ref || "") + " · " + esc(camMeta) + "</div></div>" + jobStageChip(j.stage) + "</div>" +
      '<div class="item-lines">' +
      priceLine +
      (delivery ? '<div class="item-line"><span class="k">Scheduled</span><span class="v">' + (j.scheduledDate ? dateLabel(j.scheduledDate) + (j.scheduledTime ? " · " + esc(j.scheduledTime) : "") : "Not set") + "</span></div>" : "") +
      (delivery ? '<div class="item-line"><span class="k">Technician</span><span class="v">' + (tech ? esc(tech.name) : '<span style="color:var(--amber)">Unassigned</span>') + "</span></div>" : "") +
      ((delivery && (val > 0 || paidForJob(j.id) > 0)) ? '<div class="item-line"><span class="k">Paid</span><span class="v">' + money(paidForJob(j.id)) + (val > 0 ? " · " + money(Math.max(0, val - paidForJob(j.id))) + " due" : "") + "</span></div>" : "") +
      (j.stage === "Handed over" || (/progress|installed/i.test(j.stage || "") && checklistDone(j) > 0) ? '<div class="item-line"><span class="k">Checklist</span><span class="v">' + checklistDone(j) + " / " + INSTALL_CHECKLIST.length + (checklistComplete(j.checklist) ? " · done" : "") + "</span></div>" : "") +
      (j.quoteSharedAt ? '<div class="item-line"><span class="k">Quote shared</span><span class="v">' + dateLabel(String(j.quoteSharedAt).slice(0, 10)) + (j.quoteSharedBy ? " · " + esc(j.quoteSharedBy) : "") + "</span></div>" : "") +
      '<div class="item-line"><span class="k">Added by</span><span class="v">' + esc(j.createdBy || "—") + "</span></div>" +
      "</div>" + quoteActionsHtml(j.id) + "</article>";
  }

  // Onboard/manage technicians (Operations + admin).
  function technicianRosterCard() {
    var techs = state.technicians || [];
    var rows = techs.map(function (t) {
      return '<div class="account-row" style="background:var(--fill-2)"><span class="user-avatar" aria-hidden="true">' + esc(initials(t.name)) + "</span>" +
        '<span class="who"><strong>' + esc(t.name) + (t.active === false ? " · Inactive" : "") + "</strong><span>" + esc([t.phone, t.skills].filter(Boolean).join(" · ") || "No details") + "</span></span>" +
        '<span class="row-actions"><button type="button" class="account-role" data-tech-toggle="' + esc(t.id) + '">' + (t.active === false ? "Activate" : "Deactivate") + "</button>" +
        '<button type="button" class="account-remove" data-tech-remove="' + esc(t.id) + '">Remove</button></span></div>';
    }).join("");
    return '<section class="card settings-card" style="margin-top:20px"><h2>Technicians</h2>' +
      "<p>Onboard the field technicians you assign to installations. Deactivate anyone who has left.</p>" +
      (techs.length ? '<div class="account-list">' + rows + "</div>" : '<p class="settings-note">No technicians yet.</p>') +
      '<form id="technicianForm" class="add-member">' +
      '<div class="field"><label for="techName">Name</label><input id="techName" name="name" type="text" autocomplete="off" placeholder="e.g. Joseph Okello" required></div>' +
      '<div class="field"><label for="techPhone">Phone</label><input id="techPhone" name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="+256 7…"></div>' +
      '<div class="field"><label for="techSkills">Skills (optional)</label><input id="techSkills" name="skills" type="text" autocomplete="off" placeholder="e.g. IP cameras, networking"></div>' +
      '<button type="submit" class="btn btn-ghost btn-block">Add technician</button></form></section>';
  }

  function addTechnician(name, phone, skills) {
    if (!canInstalls()) return false;
    name = (name || "").trim();
    if (!name) { toast("Enter the technician's name."); return false; }
    if (!state.technicians) state.technicians = [];
    state.technicians.push({ id: uid(), name: name, phone: (phone || "").trim(), skills: (skills || "").trim(), active: true, createdAt: today });
    saveData(name.split(/\s+/)[0] + " added as a technician"); render();
    return true;
  }
  function toggleTechnician(id) {
    if (!canInstalls()) return;
    var t = technician(id); if (!t) return;
    t.active = t.active === false; saveData(); render();
  }
  async function removeTechnician(id) {
    if (!canInstalls()) return;
    var t = technician(id); if (!t) return;
    if (!(await confirmSheet("Remove " + t.name + "?", "They'll no longer appear in the technician list. Jobs already assigned keep their record.", "Remove", true))) return;
    state.technicians = state.technicians.filter(function (x) { return x.id !== id; });
    saveData(t.name.split(/\s+/)[0] + " removed"); render();
  }

  // One editable material line in the job form's bill of materials.
  function materialRow(m) {
    m = m || {};
    return '<div class="mat-row" data-mat-row data-mat-id="' + esc(m.id || "") + '">' +
      '<input class="mat-name" type="text" placeholder="Item, e.g. 4MP dome camera" value="' + esc(m.name || "") + '" aria-label="Item">' +
      '<input class="mat-qty" type="number" inputmode="numeric" min="0" step="1" placeholder="Qty" value="' + esc(m.qty || "") + '" aria-label="Quantity">' +
      '<input class="mat-cost" type="number" inputmode="numeric" min="0" step="1" placeholder="Unit UGX" value="' + esc(m.unitCost || "") + '" aria-label="Unit cost">' +
      '<button type="button" class="mat-del" data-mat-del aria-label="Remove item">×</button></div>';
  }
  function collectMaterials() {
    var out = [];
    document.querySelectorAll("#matList .mat-row").forEach(function (r) {
      var name = (r.querySelector(".mat-name").value || "").trim();
      var qty = Math.max(0, Math.round(Number(r.querySelector(".mat-qty").value) || 0));
      var cost = Math.max(0, Math.round(Number(r.querySelector(".mat-cost").value) || 0));
      if (!name && !qty && !cost) return; // skip fully-blank rows
      out.push({ id: r.getAttribute("data-mat-id") || uid(), name: name, qty: qty, unitCost: cost });
    });
    return out;
  }
  function updateMatTotal() {
    var el = document.getElementById("matTotal"); if (!el) return;
    var total = 0;
    document.querySelectorAll("#matList .mat-row").forEach(function (r) {
      total += (Number(r.querySelector(".mat-qty").value) || 0) * (Number(r.querySelector(".mat-cost").value) || 0);
    });
    el.textContent = total > 0 ? "Materials total: " + money(total) : "";
  }

  function renderCashflow() {
    setHead("Operations", "Cash flow", "Record money in and out, back each with proof, and keep the float reconciled.", "Add money", true);
    var txs = state.transactions || [];
    var sumBy = function (dir) { return txs.filter(function (t) { return t.status === "approved" && t.direction === dir; }).reduce(function (s, t) { return s + Number(t.amount || 0); }, 0); };
    var approvedIn = sumBy("in"), approvedOut = sumBy("out"), balance = approvedIn - approvedOut;
    var pending = txs.filter(function (t) { return t.status !== "approved"; });
    var onHand = availableForOut(null); // includes pending — what can still be spent

    var reports = window.VeriskoCashflowReport;
    var period = reports.buildCashflowPeriod(txs, cashPeriodAnchor, cashPeriodMode);

    var summary = '<section class="card cash-summary"><div class="cash-bal"><span class="k">Float balance</span><strong>' + money(balance) + "</strong>" +
      '<small>Approved in ' + money(approvedIn) + " · out " + money(approvedOut) + "</small>" +
      (onHand !== balance ? '<small>Cash on hand now (incl. pending): ' + money(onHand) + "</small>" : "") + "</div>" +
      (pending.length ? '<div class="cash-pending">' + chip(pending.length + " awaiting review", "amber", "◔") + "</div>" : "") + "</section>";

    var periodLabel = cashPeriodMode === "week" ? dateLabel(period.start) + " – " + dateLabel(period.end) : new Date(period.start + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    var awaiting = period.pendingIn + period.pendingOut;
    var periodControls = '<section class="card cash-period"><div class="cash-mode" role="group" aria-label="Cash-flow period">' +
      '<button type="button" data-cash-mode="week" class="' + (cashPeriodMode === "week" ? "is-on" : "") + '">Week</button>' +
      '<button type="button" data-cash-mode="month" class="' + (cashPeriodMode === "month" ? "is-on" : "") + '">Month</button></div>' +
      '<div class="cash-period-nav"><button type="button" data-cash-step="-1" aria-label="Previous ' + cashPeriodMode + '">‹</button><strong>' + periodLabel + '</strong><button type="button" data-cash-step="1" aria-label="Next ' + cashPeriodMode + '">›</button></div></section>';
    var netClass = period.net < 0 ? "neg" : "pos";
    var periodSummary = '<section class="cash-kpis" aria-label="Selected period cash flow">' +
      '<div class="cash-kpi"><span>Received</span><strong class="pos">' + money(period.received) + '</strong></div>' +
      '<div class="cash-kpi"><span>Used</span><strong class="neg">' + money(period.used) + '</strong></div>' +
      '<div class="cash-kpi"><span>Net</span><strong class="' + netClass + '">' + (period.net < 0 ? "−" : "") + money(Math.abs(period.net)) + '</strong></div></section>' +
      (awaiting ? '<p class="cash-awaiting">' + money(awaiting) + ' awaiting approval — not included above.</p>' : "");

    // Admins get a review queue pinned at the top — approve or send back as
    // entries come in, oldest first, with the receipt shown on the card.
    var review = "";
    if (isAdmin()) {
      var queue = txs.filter(function (t) { return t.status === "pending"; })
        .sort(function (a, b) { return (a.createdAt || "").localeCompare(b.createdAt || "") || (a.date || "").localeCompare(b.date || ""); });
      if (queue.length) {
        review = '<section class="review-section"><h2 class="review-head">Needs your review <span class="review-count">' + queue.length + "</span></h2>" +
          queue.map(reviewCard).join("") + "</section>";
      }
    }

    var filterBar = '<div class="toolbar"><div class="field-inline" style="flex:1"><label for="cashFilter">Show</label><select id="cashFilter">' +
      [["all", "All entries"], ["pending", "Pending"], ["approved", "Approved"], ["query", "Sent back"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cashFilter ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div></div>";

    var range = reports.cashflowPeriod(cashPeriodAnchor, cashPeriodMode);
    var rows = txs.filter(function (t) { return reports.inCashflowPeriod(t.date, range) && (cashFilter === "all" || t.status === cashFilter); })
      .sort(function (a, b) { return (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""); });

    var list = rows.length ? '<div class="list">' + rows.map(txCard).join("") + "</div>" :
      emptyState(ICON_CASH, "No entries yet", "Tap Add money to record your first cash movement.", "Add money", 'data-new="transaction"');

    content.innerHTML = summary + periodControls + periodSummary + review + '<h2 class="ledger-head">Entries for this ' + cashPeriodMode + '</h2>' + filterBar + '<p class="result-note">' + rows.length + (rows.length === 1 ? " entry" : " entries") + "</p>" + list;
    hydrateProofThumbs();
  }

  // "Category · Paid by · Business" line shared by both card styles.
  function txMeta(t) {
    var p = t.prospectId ? prospect(t.prospectId) : null;
    var j = t.installId ? job(t.installId) : null;
    var jc = j ? jobClient(j) : null;
    var bits = [esc(t.category || "Uncategorised")];
    if (t.method) bits.push(esc(t.method));
    if (jc && jc.business) bits.push("Job: " + esc(jc.business));
    else if (p && p.business) bits.push(esc(p.business));
    return bits.join(" · ");
  }

  // A single card in the admin review queue: receipt inline + quick actions.
  function reviewCard(t) {
    var sign = t.direction === "in" ? "+" : "−";
    var proof = t.direction !== "out" ? "" : (t.proofId
      ? '<button type="button" class="rev-proof" data-photo data-proof-id="' + esc(t.proofId) + '" aria-label="View receipt full screen"><span class="rev-proof-load">Loading receipt…</span></button>'
      : (t.preapproved
        ? '<p class="rev-petty">Pre-approved by the cash-flow team — no receipt required. Approve on the note alone.</p>'
        : '<p class="rev-noproof">No receipt attached. Send it back and ask for a photo before approving.</p>'));
    return '<article class="card rev-card" data-id="' + t.id + '">' +
      '<div class="item-top"><div><div class="item-title"><span class="tx-dir ' + (t.direction === "in" ? "in" : "out") + '">' + (t.direction === "in" ? "In" : "Out") + "</span> " + sign + money(t.amount) + "</div>" +
      '<div class="item-meta">' + txMeta(t) + "</div></div></div>" +
      '<div class="item-lines"><div class="item-line"><span class="k">Added by</span><span class="v">' + esc(t.createdBy || "—") + "</span></div>" +
      '<div class="item-line"><span class="k">Date</span><span class="v">' + dateLabel(t.date) + "</span></div>" +
      (t.note ? '<div class="item-line"><span class="k">Note</span><span class="v">' + esc(t.note) + "</span></div>" : "") + "</div>" +
      proof +
      '<div class="rev-actions">' +
      '<button type="button" class="btn btn-primary" data-approve-id="' + t.id + '"' + (needsProof(t) ? " disabled" : "") + ">Approve</button>" +
      '<button type="button" class="btn btn-ghost" data-sendback-id="' + t.id + '">Send back</button></div></article>';
  }

  // Fill in the receipt thumbnails after the queue is on screen.
  function hydrateProofThumbs() {
    var boxes = content.querySelectorAll("[data-proof-id]");
    boxes.forEach(function (box) {
      var id = box.getAttribute("data-proof-id");
      fetchProof(id).then(function (img) {
        box.innerHTML = img
          ? '<img src="' + img + '" alt="Receipt photo" class="rev-proof-img">'
          : '<span class="rev-proof-load">Couldn\'t load the photo</span>';
        if (img) box.setAttribute("data-img", img);
      });
    });
  }

  function txCard(t) {
    var sign = t.direction === "in" ? "+" : "−";
    return '<article class="item tx-item" data-edit="transaction" data-id="' + t.id + '">' +
      '<div class="item-top"><div><div class="item-title"><span class="tx-dir ' + (t.direction === "in" ? "in" : "out") + '">' + (t.direction === "in" ? "In" : "Out") + "</span> " + sign + money(t.amount) + "</div>" +
      '<div class="item-meta">' + txMeta(t) + "</div></div>" + txStatusChip(t.status) + "</div>" +
      '<div class="item-lines"><div class="item-line"><span class="k">Date</span><span class="v">' + dateLabel(t.date) + "</span></div>" +
      '<div class="item-line"><span class="k">Added by</span><span class="v">' + esc(t.createdBy || "—") + "</span></div>" +
      (t.status === "query" && t.reviewNote ? '<div class="item-line"><span class="k">Sent back</span><span class="v" style="color:var(--red)">' + esc(t.reviewNote) + "</span></div>" : "") +
      (t.direction === "out" ? '<div class="item-line"><span class="k">Proof</span><span class="v">' + (t.proofId ? "Attached" : (hasQueuedPhoto(t.id) ? '<span style="color:var(--muted)">Photo waiting to upload</span>' : (t.preapproved ? '<span style="color:var(--muted)">Pre-approved — no receipt</span>' : '<span style="color:var(--amber)">No proof yet</span>'))) + "</span></div>" : "") + "</div></article>";
  }

  /* -------- Receipt photo helpers -------- */
  function resizeImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject; img.src = reader.result;
      };
      reader.onerror = reject; reader.readAsDataURL(file);
    });
  }
  async function uploadProof(dataUrl) {
    if (settings.auth && settings.auth.expires_at && settings.auth.expires_at * 1000 - Date.now() < 60000) await refreshSession();
    var res = await fetch("/api/receipt", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (settings.auth ? settings.auth.access_token : "") }, body: JSON.stringify({ image: dataUrl }) });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || !j.ok) throw new Error(j.error === "Image too large — please retake it." ? j.error : "Couldn't upload the photo. Check your connection.");
    return j.id;
  }
  async function fetchProof(id) {
    try {
      var res = await fetch("/api/receipt?id=" + encodeURIComponent(id), { headers: { Authorization: "Bearer " + (settings.auth ? settings.auth.access_token : "") } });
      var j = await res.json(); return res.ok && j.ok ? j.image : null;
    } catch (e) { return null; }
  }
  // Generic photo control (receipt or business photo). Hidden input carries the
  // existing image id; a new pick lands in pendingProof and uploads on save.
  function proofControl(existingId) {
    var has = !!existingId;
    return '<div class="proof" id="proofBox"><input type="hidden" name="proofId" value="' + esc(existingId || "") + '">' +
      '<div class="proof-preview" id="proofPreview">' + (has ? '<span class="proof-none">Loading photo…</span>' : '<span class="proof-none">No photo yet</span>') + "</div>" +
      '<input type="file" id="proofInput" accept="image/*" hidden>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-proof-pick>' + (has ? "Replace photo" : "Add photo") + "</button></div>";
  }
  async function onProofPick() {
    var file = this.files && this.files[0]; if (!file) return;
    var pv = document.getElementById("proofPreview");
    if (pv) pv.innerHTML = '<span class="proof-none">Processing…</span>';
    try {
      pendingProof = await resizeImage(file, 1200, 0.7);
      if (pv) pv.innerHTML = '<img src="' + pendingProof + '" alt="Proof photo" class="proof-img">';
      var btn = document.querySelector("[data-proof-pick]"); if (btn) btn.textContent = "Replace photo";
    } catch (e) { if (pv) pv.innerHTML = '<span class="proof-none">Couldn\'t read that image</span>'; }
    this.value = "";
  }

  /* -------- Save / approve / send back a cash entry -------- */
  async function saveTransaction(data) {
    var amount = Math.round(Number(data.amount) || 0);
    if (amount <= 0) { showFormError("Enter an amount greater than zero."); return; }
    var direction = data.direction === "out" ? "out" : "in";
    var method = TX_METHODS.indexOf(data.method) >= 0 ? data.method : TX_METHODS[0];
    // Money out can never exceed the cash on hand — the float can't go negative.
    if (direction === "out") {
      var avail = availableForOut(editing.id);
      if (avail <= 0) { showFormError("There's no cash in the float yet. Record the money coming in first, then you can record what goes out."); return; }
      if (amount > avail) { showFormError("That's more than the float holds. You can record up to " + money(avail) + " out right now."); return; }
    }
    // A large amount is easy to fat-finger — confirm before saving.
    if (amount >= LARGE_AMOUNT && !(await confirmSheet("Confirm the amount", "Record " + money(amount) + " " + (direction === "in" ? "coming in" : "going out") + "? Double-check it's right.", "Yes, record it"))) return;
    var saveBtn = document.getElementById("saveButton");
    var txId = editing.id || uid();
    var isOut = direction === "out";
    // Prospect link, note and proof only apply to money out.
    var prospectId = isOut ? (data.prospectId || "") : "";
    var note = isOut ? (data.note || "") : "";
    var proofId = isOut ? (data.proofId || "") : "";
    var preapproved = isOut && !!data.preapproved;
    // Every expense must carry proof — a photo on file, one chosen now (even if
    // it queues offline), or an explicit "pre-approved by the cash-flow team".
    if (isOut && !preapproved && !proofId && !pendingProof) {
      showFormError("Attach a receipt for this expense — or tick “Already pre-approved by the cash-flow team” to submit without one.");
      return;
    }
    var queuePhoto = false;
    // Offline-safe: never lose the entry because a photo won't upload.
    // Online → upload now. Offline (or a network hiccup) → save the entry and
    // queue the photo on this device to upload automatically later.
    if (isOut && pendingProof) {
      if (navigator.onLine) {
        try {
          saveBtn.disabled = true; saveBtn.textContent = "Uploading photo…";
          proofId = await uploadProof(pendingProof);
        } catch (e) {
          if (/too large/i.test(e.message || "")) { saveBtn.disabled = false; saveBtn.textContent = editing.id ? "Save changes" : "Save"; showFormError(e.message); return; }
          queuePhoto = true; // couldn't reach the server — keep the photo locally
        }
      } else {
        queuePhoto = true; // no signal — keep the photo locally
      }
    }
    if (queuePhoto) proofId = ""; // photo isn't on the server yet

    if (editing.id) {
      var idx = state.transactions.findIndex(function (x) { return x.id === editing.id; });
      var prev = state.transactions[idx];
      var upd = Object.assign({}, prev, { direction: direction, amount: amount, date: data.date, category: data.category, method: method, prospectId: prospectId, note: note, proofId: proofId, preapproved: preapproved, installId: data.installId || prev.installId || "" });
      if (!isAdmin() && prev.status === "query") { upd.status = "pending"; upd.reviewNote = ""; } // resubmit after a send-back
      state.transactions[idx] = upd;
    } else {
      state.transactions.push({
        id: txId, direction: direction, amount: amount, date: data.date || today, category: data.category, method: method,
        prospectId: prospectId, note: note, proofId: proofId, preapproved: preapproved, installId: data.installId || "",
        createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "",
        createdAt: today, recordedAt: nowIso(), status: "pending", reviewedBy: "", reviewedAt: "", reviewNote: ""
      });
    }
    if (queuePhoto) await queueUpload(txId, pendingProof);
    pendingProof = null;
    saveBtn.disabled = false;
    hideFormError(); dialog.close();
    saveData(queuePhoto ? "Saved on this device. The photo will upload when you're back online." : (editing.id ? "Cash entry updated" : "Cash entry added"));
    syncClosedSales(true);
    render();
  }
  /* -------- Save a prospect (business photo + live location + audit) -------- */
  async function saveProspect(data) {
    var saveBtn = document.getElementById("saveButton");
    // A rep can only mark a lead Qualified once the 5 questions are answered.
    if (!canReviewProspects() && window.VeriskoCommission.isQualStage(data.stage)) {
      var qv = window.VeriskoQualify.verdict(data);
      if (qv.missing.length) { showFormError("Answer the 5 quick questions before you mark it " + data.stage + ". Still needed: " + qv.missing.join(", ") + "."); return; }
    }
    var isNew = !editing.id;
    var pid = editing.id || uid();
    var photoId = data.proofId || "";   // existing business photo id (hidden input)
    delete data.proofId;                // stored as photoId on the prospect
    var queuePhoto = false;
    var reopened = false;
    var photoPicked = !!pendingProof;
    // Business photo, offline-safe (same machinery as receipts).
    if (pendingProof) {
      if (navigator.onLine) {
        try { saveBtn.disabled = true; saveBtn.textContent = "Uploading photo…"; photoId = await uploadProof(pendingProof); }
        catch (e) { if (/too large/i.test(e.message || "")) { saveBtn.disabled = false; saveBtn.textContent = isNew ? "Save" : "Save changes"; showFormError(e.message); return; } queuePhoto = true; }
      } else queuePhoto = true;
    }
    if (queuePhoto) photoId = "";

    if (editing.id) {
      var idx = state.prospects.findIndex(function (x) { return x.id === editing.id; });
      var prev = state.prospects[idx];
      var merged = Object.assign({}, prev, data, { id: editing.id, photoId: photoId || prev.photoId || "" });
      if (pendingGeo) merged.geo = pendingGeo;   // a re-captured pin updates the record
      // A Sales edit re-opens the audit: a sent-back prospect returns to the
      // queue, and an approved one that actually changed goes back to pending.
      if (!canReviewProspects() && !prev.imported) {
        if (prev.reviewStatus === "query") { merged.reviewStatus = "pending"; merged.reviewNote = ""; reopened = true; }
        else if (prev.reviewStatus === "approved" && prospectChanged(prev, data, photoPicked)) {
          merged.reviewStatus = "pending"; merged.reviewedBy = ""; merged.reviewedAt = ""; merged.reviewNote = ""; reopened = true;
        }
      }
      if ((prev.followUp || "") !== (merged.followUp || "") || (prev.nextAction || "") !== (merged.nextAction || "")) stampPlan(merged);
      state.prospects[idx] = merged;
    } else {
      // The site GPS pin is a must-have for Sales: it proves the rep visited.
      // Use the pin captured in the form; if none, try once more on submit.
      var geo = pendingGeo;
      if (!geo) {
        saveBtn.disabled = true; saveBtn.textContent = "Getting location…";
        geo = (await captureGeo()).geo;
        saveBtn.disabled = false; saveBtn.textContent = "Save";
      }
      var reviewer = canReviewProspects();
      if (!geo && !reviewer) {
        showFormError("Capture the site location before submitting — tap “Capture site location” while you're on site. The GPS pin is required.");
        return;
      }
      state.prospects.push(Object.assign({}, data, {
        id: pid, created: today,
        createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "",
        photoId: photoId, geo: geo || null, followUps: [],
        reviewStatus: reviewer ? "approved" : "pending",
        reviewedBy: reviewer ? (settings.user && settings.user.name) || "" : "",
        reviewedAt: reviewer ? today : "", reviewNote: ""
      }));
      if (data.followUp || data.nextAction) stampPlan(state.prospects[state.prospects.length - 1]);
    }
    window.VeriskoCommission.qualificationRequest(state.prospects.find(function (x) { return x.id === pid; }), nowIso());
    if (queuePhoto) await queueUpload(pid, pendingProof);
    pendingProof = null;
    saveBtn.disabled = false;
    hideFormError(); dialog.close();
    saveData(editing.id ? (reopened ? "Changes saved — sent back for review" : "Changes saved") : (canReviewProspects() ? "Prospect added" : "Prospect submitted for review"));
    render();
  }

  function approveTransaction() {
    if (!editing || !editing.id || !isAdmin()) return;
    var t = state.transactions.find(function (x) { return x.id === editing.id; });
    if (!t) return;
    if (t.direction === "out" && !t.proofId && !pendingProof && !t.preapproved) { showFormError("Attach a receipt before approving — or the recorder can mark it pre-approved by the cash-flow team."); return; }
    t.status = "approved"; t.reviewedBy = (settings.user && settings.user.name) || ""; t.reviewedAt = today; t.reviewNote = "";
    dialog.close(); saveData("Entry approved"); render();
  }
  async function sendBackTransaction() {
    if (!editing || !editing.id || !isAdmin()) return;
    if (await sendBackTx(editing.id)) dialog.close();
  }
  // Inline approve/send-back used by the review queue (no dialog open).
  function approveTx(id) {
    if (!isAdmin()) return;
    var t = state.transactions.find(function (x) { return x.id === id; });
    if (!t) return;
    if (needsProof(t)) { toast("Add a proof photo before approving."); return; }
    t.status = "approved"; t.reviewedBy = (settings.user && settings.user.name) || ""; t.reviewedAt = today; t.reviewNote = "";
    saveData("Entry approved"); render();
  }
  async function sendBackTx(id) {
    if (!isAdmin()) return false;
    var t = state.transactions.find(function (x) { return x.id === id; });
    if (!t) return false;
    var r = await openSheet({ title: "Send back to the recorder", body: "What needs fixing?",
      choices: ["Blurry receipt", "No receipt", "Wrong amount", "Wrong category"], input: { placeholder: "Add a note (optional)" },
      requireValue: true, confirmLabel: "Send back" });
    if (!r) return false;
    t.status = "query"; t.reviewNote = combineNote(r); t.reviewedBy = (settings.user && settings.user.name) || ""; t.reviewedAt = today;
    saveData("Sent back for changes"); render();
    return true;
  }
  // Merge a quick-reason chip with any typed note into one string.
  function combineNote(r) { return r.choice && r.text ? r.choice + " — " + r.text : (r.choice || r.text); }
  // Full-screen receipt viewer for the review queue.
  function openPhoto(img) {
    if (!img) return;
    var ov = document.getElementById("photoOverlay");
    var close = function () { ov.classList.remove("show"); document.removeEventListener("keydown", onKey); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "photoOverlay"; ov.className = "photo-overlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
      ov.setAttribute("aria-label", "Receipt photo");
      ov.addEventListener("click", function () { close(); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = '<img src="' + img + '" alt="Receipt photo"><button type="button" class="photo-close" aria-label="Close">×</button>';
    ov.classList.add("show");
    document.addEventListener("keydown", onKey);
    var btn = ov.querySelector(".photo-close"); if (btn) btn.focus();
  }

  /* ------------------------- Live data export (Owner) ----------------------- */
  // A read-only feed of every table for a spreadsheet. The key lives in
  // config.exportKey; the server only ever sends it to Owner/Technical devices.
  function exportKey() { return (state.config && state.config.exportKey) || ""; }
  function exportUrl(table) {
    return location.origin + "/api/export?key=" + encodeURIComponent(exportKey()) + (table ? "&table=" + encodeURIComponent(table) : "");
  }
  function randomKey() {
    var a = new Uint8Array(24); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function exportSection() {
    var key = exportKey();
    var tables = ["prospects", "visits", "followups", "jobs", "transactions", "users", "technicians"];
    var body = key
      ? '<div class="field"><label for="exportKeyBox">Export key</label><input id="exportKeyBox" type="text" readonly value="' + esc(key) + '" onfocus="this.select()"></div>' +
        '<div class="button-row"><button class="btn btn-ghost" data-copy-export-key>Copy key</button>' +
        '<button class="btn btn-ghost" data-open-export="prospects">Open prospects CSV</button>' +
        '<button class="btn btn-danger" data-new-export-key>Generate new key…</button></div>' +
        '<p class="settings-note">Feed address: <code>' + esc(location.origin + "/api/export?key=…&table=") + "</code> followed by one of " + tables.join(", ") +
        '. In Google Sheets use <code>=IMPORTDATA("…&amp;table=prospects")</code>; add <code>&amp;format=json</code> for JSON. The <em>Verisko Live Data</em> spreadsheet in Verisko OS → 01 Leads &amp; Quotes reads every table once you paste the key on its Setup tab.</p>'
      : '<div class="button-row"><button class="btn btn-ghost" data-new-export-key>Generate export key</button></div>';
    return '<section class="card settings-card"><h2>Live data export</h2>' +
      "<p>A read-only copy of every prospect, visit, follow-up, job, cash entry and team member for your spreadsheet. Anyone holding the key can read all of it, so keep it private. Generating a new key stops the old one at once.</p>" +
      body + "</section>";
  }
  async function newExportKey() {
    var had = !!exportKey();
    if (had) {
      var ok = await confirmSheet("Generate a new export key?", "The current key stops working immediately. Paste the new key into your spreadsheet afterwards.", "Generate new key", true);
      if (!ok) return;
    }
    if (!state.config || typeof state.config !== "object") state.config = defaultConfig();
    state.config.exportKey = randomKey();
    saveData(had ? "New export key generated — update your spreadsheet" : "Export key generated");
    render();
  }
  function copyExportKey() {
    var k = exportKey(); if (!k) return;
    var done = function () { toast("Export key copied"); };
    var fail = function () { var box = document.getElementById("exportKeyBox"); if (box) { box.focus(); box.select(); } toast("Select the key and copy it"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(k).then(done, fail); else fail();
  }

  /* -------------------- Import leads from Excel (Admin) --------------------- */
  // The Admin uploads a call list (Instagram, Google search…). Each row is a
  // new lead for the Team lead / Operations to call, or updates the existing
  // lead with the same phone (else business name). Imported leads earn no
  // commission (commission.js skips `imported`). Parsing: lead-import.js.
  var IMPORT_SOURCES = ["Instagram", "Google search", "Facebook", "Referral", "Other"];
  var xlsxLoading = null;
  function loadXlsx() {
    if (window.XLSX && window.XLSX.read) return Promise.resolve(window.XLSX);
    if (xlsxLoading) return xlsxLoading;
    xlsxLoading = new Promise(function (resolve, reject) {
      var sc = document.createElement("script");
      sc.src = "vendor/xlsx.full.min.js?v=0.20.3"; sc.async = true;
      sc.onload = function () { if (window.XLSX && window.XLSX.read) resolve(window.XLSX); else { xlsxLoading = null; reject(new Error("The Excel reader didn't load. Try again.")); } };
      sc.onerror = function () { xlsxLoading = null; reject(new Error("Couldn't load the Excel reader. Check your connection and try again.")); };
      document.head.appendChild(sc);
    });
    return xlsxLoading;
  }
  function importSection() {
    if (!isAdmin()) return "";
    var li = state.config && state.config.lastImport;
    return '<section class="card settings-card"><h2>Import leads from Excel</h2>' +
      "<p>Upload a call list (.xlsx, .xls or .csv) — for example businesses found on Instagram or Google search. Each row becomes a lead for the Team lead and Operations to call. A row whose phone number (or business name) is already in the app updates that lead's details instead — its stage, owner and call history stay. Imported leads earn no commission.</p>" +
      '<p class="settings-note">First row = headings: <strong>Business name, Contact name, Phone, Location, Category, Source, Notes, Assigned to</strong>. Only Phone is required; similar headings (Client, Mobile, WhatsApp, Area…) are recognised.</p>' +
      '<div class="button-row"><button class="btn btn-primary" data-import-leads>Choose Excel file…</button>' +
      '<button class="btn btn-ghost" data-lead-template>Download template</button></div>' +
      (li ? '<p class="settings-note">Last import: ' + esc(li.file || "file") + " · " + esc(dateTimeLabel(li.at)) + " · " + (li.added || 0) + " new, " + (li.updated || 0) + " updated by " + esc(li.by || "—") +
        ' <button type="button" class="btn btn-ghost btn-sm" data-undo-import>Undo…</button></p>' : "") + "</section>";
  }
  function downloadLeadTemplate() {
    var rows = [window.VeriskoLeadImport.TEMPLATE];   // headings only — an example row would be imported
    var csv = rows.map(function (r) { return r.map(function (c) { return /[",\n]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : c; }).join(","); }).join("\r\n");
    download("verisko-leads-template.csv", "﻿" + csv, "text/csv");
  }
  async function readLeadFile(file) {
    if (!file || !isAdmin()) return;
    if (file.size > 5 * 1024 * 1024) { toast("That file is over 5 MB — split it and import it in parts."); return; }
    toast("Reading " + file.name + "…");
    var rows;
    try {
      var XLSX = await loadXlsx();
      var wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      var ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: true });
    } catch (e) { toast((e && /load/i.test(e.message || "")) ? e.message : "Couldn't read that file. Save it as .xlsx or .csv and try again."); return; }
    var I = window.VeriskoLeadImport;
    var parsed = I.parseRows(rows);
    if (parsed.error) { toast(parsed.error); return; }
    if (parsed.leads.length > 3000) { toast("That's " + parsed.leads.length + " rows — import at most 3,000 at a time."); return; }
    openImportPreview(file.name, parsed, I.plan(parsed.leads, state.prospects || []));
  }
  function openImportPreview(fileName, parsed, plan) {
    var I = window.VeriskoLeadImport;
    var users = state.users || [];
    var byRole = function (r) { return users.filter(function (u) { return normRole(u.role) === r; }); };
    var owners = byRole("teamlead").concat(byRole("sales"), byRole("operations"), byRole("admin"));
    if (!owners.length) owners = [settings.user || {}];
    var fresh = plan.filter(function (x) { return !x.match; }), updates = plan.filter(function (x) { return x.match; });
    var unknown = {};
    if (parsed.map.assignedTo !== undefined) fresh.forEach(function (x) { if (x.lead.assignedTo && !I.findUser(users, x.lead.assignedTo)) unknown[x.lead.assignedTo] = true; });
    var unknownList = Object.keys(unknown);
    var dlg = document.getElementById("askDialog");
    var line = function (n, text) { return '<div class="item-line"><span class="k">' + n + '</span><span class="v">' + text + "</span></div>"; };
    dlg.innerHTML = '<div class="ask-head"><h2 id="askTitle">Import leads</h2><p class="ask-body">' + esc(fileName) + "</p></div>" +
      '<div class="item-lines" style="margin-bottom:10px">' +
        line(fresh.length, "new " + (fresh.length === 1 ? "lead" : "leads") + " to call") +
        line(updates.length, "existing " + (updates.length === 1 ? "lead" : "leads") + " updated (phone, contact, location…)") +
        line(parsed.skipped.length, "rows skipped") + "</div>" +
      (parsed.skipped.length ? '<p class="ask-body" style="font-size:.85em">' + parsed.skipped.slice(0, 6).map(function (k) { return "Row " + k.row + ": " + esc(k.reason); }).join("<br>") + (parsed.skipped.length > 6 ? "<br>…and " + (parsed.skipped.length - 6) + " more" : "") + "</p>" : "") +
      (fresh.length ? '<p class="ask-body" style="font-size:.85em;color:var(--muted)">' + fresh.slice(0, 3).map(function (x) { return esc(x.lead.business) + " · " + esc(x.lead.phone); }).join("<br>") + (fresh.length > 3 ? "<br>…" : "") + "</p>" : "") +
      '<div class="field"><label for="impOwner">Give new leads to</label><select id="impOwner">' + owners.map(function (u, i) {
        return '<option value="' + esc(u.email || "") + '"' + (i === 0 ? " selected" : "") + ">" + esc((u.name || u.email || "Me") + " · " + roleName(u)) + "</option>";
      }).join("") + "</select>" + (parsed.map.assignedTo !== undefined ? '<p class="helper">Rows with an “Assigned to” name or email go to that person instead.</p>' : "") + "</div>" +
      (unknownList.length ? '<p class="ask-body" style="color:var(--amber)">Not on the team, so those rows go to the person above: ' + esc(unknownList.slice(0, 5).join(", ")) + (unknownList.length > 5 ? "…" : "") + "</p>" : "") +
      '<div class="field"><label for="impSource">Lead source (rows without one)</label><select id="impSource">' + IMPORT_SOURCES.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="impDate">First call on</label><input id="impDate" type="date" value="' + esc(today) + '"></div>' +
      '<p class="ask-body">No commission is paid on imported leads.</p>' +
      '<div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">Cancel</button><button type="button" class="btn btn-primary" id="askOk"' + (plan.length ? "" : " disabled") + ">Import " + (fresh.length + updates.length) + "</button></div>";
    var onCancel = function (e) { if (e) e.preventDefault(); dlg.close(); };
    dlg.querySelector("#askCancel").addEventListener("click", onCancel);
    dlg.addEventListener("cancel", onCancel, { once: true });
    dlg.querySelector("#askOk").addEventListener("click", function () {
      var owner = dlg.querySelector("#impOwner").value, src = dlg.querySelector("#impSource").value, date = dlg.querySelector("#impDate").value || today;
      dlg.close();
      applyLeadImport(fileName, plan, owner, src, date);
    });
    dlg.showModal();
  }
  function applyLeadImport(fileName, plan, ownerEmail, sourceDefault, callDate) {
    if (!isAdmin()) return;
    var I = window.VeriskoLeadImport;
    var me = settings.user || {}, users = state.users || [];
    var lc = function (v) { return String(v || "").toLowerCase(); };
    var owner = users.find(function (u) { return lc(u.email) === lc(ownerEmail); }) || me;
    var batch = uid(), at = nowIso(), added = 0, updated = 0;
    plan.forEach(function (x) {
      var l = x.lead;
      if (x.match) { if (I.applyUpdate(x.match, l).length) updated++; return; }
      var who = (l.assignedTo && I.findUser(users, l.assignedTo)) || owner;
      var p = {
        id: uid(), business: l.business, vertical: l.vertical || "Other", contact: l.contact, phone: l.phone, phone2: l.phone2, email: l.email,
        location: l.location, decisionMaker: "Unknown", concern: "", existing: "", areas: "", budget: "",
        stage: "New prospect", source: l.source || sourceDefault, nextAction: "First call", followUp: callDate, notes: l.notes, created: today,
        createdBy: who.name || "", createdByEmail: lc(who.email), photoId: "", geo: null, followUps: [],
        reviewStatus: "approved", reviewedBy: me.name || "", reviewedAt: today, reviewNote: "", qualStatus: "",
        imported: true, importedAt: at, importedBy: me.name || "", importBatch: batch
      };
      stampPlan(p);
      state.prospects.push(p); added++;
    });
    if (!state.config || typeof state.config !== "object") state.config = defaultConfig();
    state.config.lastImport = { id: batch, at: at, by: me.name || "", file: fileName, added: added, updated: updated };
    saveData("Imported " + added + " new " + (added === 1 ? "lead" : "leads") + (updated ? " · updated " + updated : "") + " — ready to call");
    render();
  }
  async function undoLeadImport() {
    var li = state.config && state.config.lastImport;
    if (!li || !isAdmin()) return;
    var batch = (state.prospects || []).filter(function (p) { return p.importBatch === li.id; });
    var untouched = batch.filter(function (p) { return !(p.followUps || []).length && p.stage === "New prospect" && !quoteForProspect(p.id) && !appointmentFor(p.id); });
    var ok = await confirmSheet("Undo the last import?", "Removes " + untouched.length + " of the " + batch.length + " leads added from " + (li.file || "the file") +
      ". Leads someone has already called or moved on are kept. Details updated on existing leads are not undone.", "Remove " + untouched.length + " leads", true);
    if (!ok) return;
    var drop = {}; untouched.forEach(function (p) { drop[p.id] = true; });
    state.prospects = state.prospects.filter(function (p) { return !drop[p.id]; });
    delete state.config.lastImport;
    saveData("Removed " + untouched.length + " imported leads"); render();
  }

  /* ------------------------------ SUPPORT CENTRE ----------------------------- */
  // Training videos (support-content.js) + quick help. Watched progress is
  // state.training[userId][videoId] = ISO time; the server lets each person
  // change only their own entry, and only the Team lead / Operations / admin
  // receive everyone's (Team training).
  function supportInMore() { return canInstalls(); }
  function myTraining() {
    var id = (settings.user || {}).id;
    return (id && state.training && state.training[id]) || {};
  }
  function setWatched(videoId, on) {
    var id = (settings.user || {}).id;
    if (!id) { toast("Sign in to save your progress."); return; }
    if (!state.training || typeof state.training !== "object") state.training = {};
    var mine = Object.assign({}, state.training[id] || {});
    if (on) mine[videoId] = nowIso(); else delete mine[videoId];
    state.training[id] = mine;
    var p = window.VeriskoSupport.progress(mine);
    saveData(on ? (p.complete ? "All 13 videos watched — well done!" : "Marked as watched · " + p.done + " of " + p.total) : "Marked as not watched");
  }
  // Keep the best quiz attempt; passing also counts the video as watched.
  function saveQuizResult(videoId, score, total) {
    var S = window.VeriskoSupport, id = (settings.user || {}).id;
    if (!id) { toast("Sign in to save your progress."); return; }
    if (!state.training || typeof state.training !== "object") state.training = {};
    var mine = Object.assign({}, state.training[id] || {});
    var prev = S.quizResult(mine, videoId);
    if (!prev || score >= prev.score) mine[S.quizKey(videoId)] = S.quizValue(score, total, nowIso());
    if (score === total && !mine[videoId]) mine[videoId] = nowIso();
    var p = S.progress(mine);
    if (p.complete && !mine.cert) mine.cert = nowIso();      // certificate date, fixed from now on
    state.training[id] = mine;
    saveData(score === total ? (p.complete ? "All 13 complete — your certificate is ready!" : "Quiz passed · " + p.done + " of " + p.total + " complete") : "Quiz saved — " + score + " of " + total + " right");
  }

  // Training certificate (certificate.js), for yourself or — Team lead,
  // Operations, admin — anyone on the team who has completed all 13.
  function certificateModelFor(userId) {
    var u = (state.users || []).find(function (x) { return x.id === userId; }) || (userId === (settings.user || {}).id ? settings.user : null);
    var t = (state.training || {})[userId];
    return u && t ? window.VeriskoCertificate.buildModel(u, t, window.VeriskoSupport) : null;
  }
  async function certificatePdf(userId) {
    var m = certificateModelFor(userId);
    if (!m) throw new Error("The certificate is ready once all 13 quizzes are passed.");
    var JsPDF = await loadJsPdf();
    return { model: m, doc: window.VeriskoCertificate.renderPdf(JsPDF, m), name: window.VeriskoCertificate.fileName(m) };
  }
  async function downloadCertificate(userId) {
    try { var c = await certificatePdf(userId); c.doc.save(c.name); toast("Certificate saved to your phone"); }
    catch (e) { toast(e.message || "Couldn't build the certificate."); }
  }
  async function shareCertificate(userId) {
    try {
      var c = await certificatePdf(userId), file = null;
      try { file = new File([c.doc.output("blob")], c.name, { type: "application/pdf" }); } catch (e) { file = null; }
      if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "Verisko training certificate", text: window.VeriskoCertificate.shareText(c.model) }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      c.doc.save(c.name); toast("Certificate saved — share it from your downloads");
    } catch (e) { toast(e.message || "Couldn't share the certificate."); }
  }

  // Team lead / Operations / admin: a card on Today when someone earns their
  // training certificate, until they tap "Got it" (stamps their own
  // training[myId].certseen, so it syncs across their phones).
  function newCertsForMe() {
    if (!canApproveQual()) return [];
    var seen = myTraining().certseen || "";
    var me = (settings.user || {}).id;
    return window.VeriskoSupport.newCertificates(state.users || [], state.training || {}, seen)
      .filter(function (c) { return c.id !== me; });
  }
  function certNotice() {
    var list = newCertsForMe();
    if (!list.length) return "";
    var C = window.VeriskoCommission;
    return '<section class="card cert-notice"><div class="cert-notice-head"><span class="cert-badge" aria-hidden="true">🎓</span><div><strong>' +
      (list.length === 1 ? "New training certificate" : list.length + " new training certificates") + "</strong>" +
      '<div class="settings-note">Completed the Verisko Field Sales Training — all 13 videos and quizzes.</div></div></div>' +
      list.map(function (c) {
        return '<div class="cert-notice-row"><div><strong>' + esc(c.name) + "</strong><span>" + esc(c.role === "teamlead" ? "Team lead" : "Sales") + " · " + esc(C.label(C.eventTime(c.cert), true)) + "</span></div>" +
          '<button type="button" class="btn btn-sm btn-ghost" data-cert-download="' + esc(c.id) + '">Certificate</button></div>';
      }).join("") +
      '<div class="item-actions"><button type="button" class="btn btn-sm btn-primary" data-certs-seen>Got it</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-goview-support>Team training</button></div></section>';
  }
  function markCertsSeen() {
    var id = (settings.user || {}).id; if (!id) return;
    if (!state.training || typeof state.training !== "object") state.training = {};
    state.training[id] = Object.assign({}, state.training[id] || {}, { certseen: nowIso() });
    saveData(); render();
  }

  // A one-line reminder on Today until a rep (or Team lead) finishes training.
  function trainingNudge() {
    if (supportInMore()) return "";
    var p = window.VeriskoSupport.progress(myTraining());
    if (p.complete) return "";
    return '<section class="card training-nudge"><div><strong>Training: ' + p.done + " of " + p.total + " videos complete</strong>" +
      '<div class="settings-note">Next: ' + esc(p.next.n + ". " + p.next.title) + "</div></div>" +
      '<button type="button" class="btn btn-sm btn-primary" data-watch="' + esc(p.next.id) + '">Watch</button></section>';
  }
  function certificateCard() {
    var me = (settings.user || {}).id, m = me ? certificateModelFor(me) : null;
    if (!m) return "";
    return '<section class="card cert-card"><div class="cert-badge" aria-hidden="true">🎓</div><div class="cert-text">' +
      "<strong>Certificate of Completion</strong><span>" + esc(m.course) + " · " + esc(m.date) + "</span><span class=\"cert-no\">" + esc(m.number) + "</span></div>" +
      '<div class="cert-actions"><button type="button" class="btn btn-sm btn-primary" data-cert-download="' + esc(me) + '">Download</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-cert-share="' + esc(me) + '">Share</button></div></section>';
  }
  function renderSupport() {
    var S = window.VeriskoSupport;
    setHead("Training & help", "Support centre", "Your sales training videos and quick answers about the app.", "", false);
    var mine = myTraining(), p = S.progress(mine);
    var pct = Math.round((p.done / p.total) * 100);
    var hero = '<section class="card dash-hero">' +
      '<p class="dash-eyebrow">Your training</p>' +
      '<div class="dash-big">' + p.done + " of " + p.total + " complete</div>" +
      '<div class="dash-sub">Watch each video, then pass its 3-question quiz · ' + p.watched + " watched · about " + S.TOTAL_MINUTES + " minutes of video</div>" +
      '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
      (p.next ? '<button type="button" class="btn btn-primary btn-block" data-watch="' + esc(p.next.id) + '">▶ ' + (p.done ? "Continue: " : "Start: ") + esc(p.next.n + ". " + p.next.title) + "</button>"
        : '<p class="dash-note" style="color:var(--green);font-weight:600">✓ All 13 videos and quizzes complete. Rewatch any video whenever you feel unsure, especially before a big meeting.</p>') +
      "</section>" + certificateCard();
    var how = '<section class="card settings-card"><h2>How to use this page</h2><ol class="help-steps">' +
      S.HOW_TO.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol></section>";
    var parts = S.PARTS.map(function (part) {
      var vids = S.VIDEOS.filter(function (v) { return v.part === part.n; });
      return '<section class="support-part"><h2 class="review-head">Part ' + part.n + ": " + esc(part.title) + "</h2>" +
        vids.map(function (v) {
          var seen = !!mine[v.id], qr = S.quizResult(mine, v.id), done = !!(qr && qr.passed);
          var status = done ? '<span class="vid-status is-done">✓ Complete · quiz ' + qr.score + "/" + qr.total + "</span>"
            : qr ? '<span class="vid-status is-retry">Quiz ' + qr.score + "/" + qr.total + " — try again</span>"
            : seen ? '<span class="vid-status">Watched · quiz to do</span>' : "";
          return '<article class="item video-item' + (done ? " is-seen" : "") + '">' +
            '<div class="video-row"><span class="vid-num" aria-hidden="true">' + (done ? "✓" : v.n) + "</span>" +
            '<div><div class="item-title">' + v.n + ". " + esc(v.title) + "</div>" +
            '<div class="item-meta video-desc">' + esc(v.desc) + "</div>" + status + "</div></div>" +
            '<div class="item-actions"><button type="button" class="btn btn-sm ' + (done || !seen ? "btn-primary" : "btn-ghost") + '" data-watch="' + esc(v.id) + '">▶ Watch</button>' +
            '<button type="button" class="btn btn-sm ' + (seen && !done ? "btn-primary" : "btn-ghost") + '" data-quiz="' + esc(v.id) + '">' + (done ? "Retake quiz" : "Take quiz") + "</button></div></article>";
        }).join("") + "</section>";
    }).join("");
    var team = "";
    if (canApproveQual()) {
      var rows = S.teamProgress(state.users || [], state.training || {});
      var fresh = {}; newCertsForMe().forEach(function (c) { fresh[c.id] = true; });
      team = '<section class="card settings-card"><h2>Team training</h2>' +
        (rows.length ? '<p class="settings-note">Videos complete (watched and quiz passed) for Sales and Team leads, least progress first.</p><div class="team-training">' + rows.map(function (r) {
          var w = Math.round((r.done / r.total) * 100);
          return '<div class="tt-row"><div class="tt-who"><strong>' + esc(r.name) + (fresh[r.id] ? ' <span class="tt-new">New</span>' : "") + "</strong><span>" + esc(r.role === "teamlead" ? "Team lead" : "Sales") + " · " + r.watched + " watched" +
            (r.last && /^\d{4}-/.test(r.last) ? " · last " + esc(dateLabel(String(r.last).slice(0, 10))) : "") + "</span></div>" +
            '<div class="tt-bar"><div class="progress" style="margin:0"><div class="progress-bar" style="width:' + w + '%"></div></div></div>' +
            '<div class="tt-count' + (r.done === 0 ? " is-zero" : r.complete ? " is-done" : "") + '">' + (r.complete ? "🎓 " : "") + r.done + "/" + r.total + "</div>" +
            (r.complete ? '<div class="tt-cert"><button type="button" class="btn btn-sm btn-ghost" data-cert-download="' + esc(r.id) + '">Certificate</button></div>' : "") + "</div>";
        }).join("") + "</div>" : '<p class="settings-note">No sales team members yet.</p>') + "</section>";
    }
    var who = canApproveQual() ? "lead" : "sales";
    var faq = S.faq({ who: who, perQualified: money(commissionPerQualified()), perDeposit: money(commissionRate()) });
    var help = '<section class="card settings-card"><h2>Quick help</h2>' + faq.map(function (x) {
      return '<details class="help-item"><summary>' + esc(x.q) + "</summary><p>" + esc(x.a) + "</p></details>";
    }).join("") + '<p class="settings-note" style="margin-top:12px">Still stuck? Write your question down and bring it to your immediate supervisor.</p></section>';
    content.innerHTML = hero + team + how + parts + help;
  }
  // Play a video inside the app (Loom embed), with a link out as a fallback,
  // then its quiz in the same dialog. "Next" swaps the video in place.
  function openVideo(videoId, startWithQuiz) {
    var S = window.VeriskoSupport;
    if (!S.byId(videoId)) return;
    var dlg = document.getElementById("askDialog");
    function head(v, label) { return '<div class="ask-head"><p class="dash-eyebrow" style="margin:0">' + label + '</p><h2 id="askTitle">' + esc(v.n + ". " + v.title) + "</h2></div>"; }
    function nextOf(v) { return S.VIDEOS.find(function (x) { return x.n === v.n + 1; }); }
    function fill(v) {
      var qr = S.quizResult(myTraining(), v.id), passed = !!(qr && qr.passed), next = nextOf(v);
      dlg.innerHTML = head(v, "Video " + v.n + " of " + S.VIDEOS.length) +
        '<div class="video-frame"><iframe src="' + esc(S.embedUrl(v)) + '" title="' + esc(v.title) + '" allow="fullscreen; autoplay; picture-in-picture" allowfullscreen></iframe></div>' +
        '<p class="ask-body">' + esc(v.desc) + "</p>" +
        '<p class="settings-note">Video not playing? <a href="' + esc(S.watchUrl(v)) + '" target="_blank" rel="noopener">Open it in Loom</a>.</p>' +
        (passed ? '<p class="settings-note" style="color:var(--green);font-weight:600">✓ Quiz passed ' + qr.score + "/" + qr.total + "</p>" : "") +
        '<div class="ask-actions" style="flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="askCancel">Close</button>' +
        '<button type="button" class="btn ' + (passed ? "btn-ghost" : "btn-primary") + '" id="vidQuiz">' + (passed ? "Retake quiz" : "Take the quiz →") + "</button>" +
        (passed && next ? '<button type="button" class="btn btn-primary" id="vidNext">Next video ›</button>' : "") + "</div>";
      dlg.querySelector("#askCancel").addEventListener("click", closeVideo);
      dlg.querySelector("#vidQuiz").addEventListener("click", function () {
        if (!myTraining()[v.id]) setWatched(v.id, true);
        quiz(v);
      });
      if (passed && next) dlg.querySelector("#vidNext").addEventListener("click", function () { fill(next); });
    }
    function quiz(v) {
      var qs = S.quizFor(v.id);
      dlg.innerHTML = head(v, "Quiz · " + qs.length + " questions · get them all right to pass") +
        '<form class="quiz" id="quizForm">' + qs.map(function (x, i) {
          return '<fieldset class="quiz-q"><legend>' + (i + 1) + ". " + esc(x.q) + "</legend>" +
            x.options.map(function (o, j) {
              return '<label class="quiz-opt"><input type="radio" name="q' + i + '" value="' + j + '"><span>' + esc(o) + "</span></label>";
            }).join("") + "</fieldset>";
        }).join("") + "</form>" +
        '<div class="ask-actions" style="flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="quizBack">‹ Back to video</button>' +
        '<button type="button" class="btn btn-primary" id="quizCheck" disabled>Check answers</button></div>';
      var formEl = dlg.querySelector("#quizForm"), check = dlg.querySelector("#quizCheck");
      var picked = function () { return qs.map(function (x, i) { var el = formEl.querySelector('input[name="q' + i + '"]:checked'); return el ? x.options[Number(el.value)] : null; }); };
      formEl.addEventListener("change", function () { check.disabled = picked().some(function (a) { return a === null; }); });
      dlg.querySelector("#quizBack").addEventListener("click", function () { fill(v); });
      check.addEventListener("click", function () {
        var answers = picked();
        if (answers.some(function (a) { return a === null; })) return;
        var res = S.scoreQuiz(v.id, answers);
        saveQuizResult(v.id, res.score, res.total);
        results(v, qs, answers, res);
      });
      dlg.scrollTop = 0;
    }
    function results(v, qs, answers, res) {
      var next = nextOf(v);
      dlg.innerHTML = head(v, "Quiz result") +
        '<div class="quiz-score ' + (res.passed ? "is-pass" : "is-fail") + '"><strong>' + res.score + " of " + res.total + " right</strong><span>" +
        (res.passed ? (window.VeriskoSupport.progress(myTraining()).complete ? "Passed — and that's all 13. Congratulations, your certificate is ready." : "Passed — video complete.") : "Not yet. Check the answers below, rewatch if you need to, and try again.") + "</span></div>" +
        '<div class="quiz-review">' + qs.map(function (x, i) {
          var r = res.results[i];
          return '<div class="quiz-review-item ' + (r.correct ? "is-right" : "is-wrong") + '"><div class="quiz-review-q">' + (r.correct ? "✓ " : "✗ ") + esc(x.q) + "</div>" +
            (r.correct ? "" : '<div class="quiz-review-a">You chose: ' + esc(answers[i]) + "</div>") +
            '<div class="quiz-review-a"><strong>Answer:</strong> ' + esc(r.answer) + "</div>" +
            '<div class="quiz-review-why">' + esc(r.why) + "</div></div>";
        }).join("") + "</div>" +
        '<div class="ask-actions" style="flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="askCancel">Close</button>' +
        (res.passed ? (window.VeriskoSupport.progress(myTraining()).complete ? '<button type="button" class="btn btn-primary" id="quizCert">🎓 Get your certificate</button>' : "") +
          (next ? '<button type="button" class="btn ' + (window.VeriskoSupport.progress(myTraining()).complete ? "btn-ghost" : "btn-primary") + '" id="quizNext">Next video ›</button>' : "")
          : '<button type="button" class="btn btn-ghost" id="quizRewatch">Rewatch video</button><button type="button" class="btn btn-primary" id="quizRetry">Try again</button>') + "</div>";
      dlg.querySelector("#askCancel").addEventListener("click", closeVideo);
      if (res.passed && next) dlg.querySelector("#quizNext").addEventListener("click", function () { fill(next); });
      var certBtn = dlg.querySelector("#quizCert");
      if (certBtn) certBtn.addEventListener("click", function () { downloadCertificate((settings.user || {}).id); });
      if (!res.passed) {
        dlg.querySelector("#quizRewatch").addEventListener("click", function () { fill(v); });
        dlg.querySelector("#quizRetry").addEventListener("click", function () { quiz(v); });
      }
      dlg.scrollTop = 0;
    }
    // Tidy up here rather than on the dialog's "close" event, which some
    // in-app browsers never fire.
    function closeVideo() {
      dlg.removeEventListener("cancel", onEsc);
      dlg.close();
      dlg.classList.remove("is-wide"); dlg.innerHTML = "";          // stops playback
      if (view === "support" || view === "today") render();
    }
    function onEsc(e) { e.preventDefault(); closeVideo(); }
    dlg.classList.add("is-wide");
    if (startWithQuiz) quiz(S.byId(videoId)); else fill(S.byId(videoId));
    dlg.addEventListener("cancel", onEsc);
    dlg.showModal();
  }

  /* -------------------------------- SETTINGS -------------------------------- */
  function renderSettings() {
    setHead("Owner settings", "Settings", "Team, connection, and data.", "", false);
    var users = state.users || [];
    var me = settings.user || {};
    var ownId = ownerId();
    var roleOpts = function (sel) {
      return [["sales", "Sales"], ["teamlead", "Team lead"], ["operations", "Operations"], ["admin", "Technical"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === sel ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("");
    };
    var teamRows = users.length ? '<div class="account-list">' + users.map(function (u) {
      var manageable = u.id !== ownId && u.id !== me.id;
      var actions = "";
      if (manageable) {
        // PIN accounts can't be made Technical (admin) — they have no email sign-in.
        var opts = u.authMethod === "pin" ? roleOpts(normRole(u.role)).replace(/<option value="admin"[^<]*<\/option>/, "") : roleOpts(normRole(u.role));
        actions += '<select class="account-role-select" data-set-role data-user-id="' + esc(u.id) + '" aria-label="Role for ' + esc(u.name) + '">' + opts + "</select>";
        actions += pinActions(u);
        actions += '<button type="button" class="account-remove" data-remove-user="' + esc(u.id) + '" aria-label="Remove ' + esc(u.name) + '">Remove</button>';
      }
      return '<div class="account-row" style="background:var(--fill-2)"><span class="user-avatar" aria-hidden="true">' + esc(initials(u.name)) + "</span>" +
        '<span class="who"><strong>' + esc(u.name) + " · " + esc(roleName(u)) + "</strong><span>" + esc(contactOf(u)) + "</span></span>" +
        (actions ? '<span class="row-actions">' + actions + "</span>" : "") + "</div>";
    }).join("") + "</div>" : '<p class="settings-note">No accounts yet.</p>';
    content.innerHTML = '<div class="settings-grid">' + signupsCard() +
      '<section class="card settings-card"><h2>Team members</h2>' +
      "<p><strong>Sales</strong> see only their own prospects and visits. <strong>Team leads</strong> see every rep's prospects, approve qualified ones and record client deposits. <strong>Operations</strong> also get the Cash flow tab. <strong>Technical</strong> can also open this Settings page. Removing someone revokes access immediately.</p>" +
      teamRows +
      '<form id="addMemberForm" class="add-member">' +
      '<div class="field"><label for="memberName">Name</label><input id="memberName" name="name" type="text" autocomplete="off" placeholder="e.g. Grace Namubiru" required></div>' +
      '<div class="field"><label for="memberEmail">Email</label><input id="memberEmail" name="email" type="email" inputmode="email" autocomplete="off" autocapitalize="off" placeholder="grace@example.com" required></div>' +
      '<div class="field"><label for="memberRole">Role</label><select id="memberRole" name="role">' +
      '<option value="sales">Sales — prospects &amp; visits</option>' +
      '<option value="teamlead">Team lead — approves qualified prospects, records deposits</option>' +
      '<option value="operations">Operations — also Cash flow</option>' +
      '<option value="admin">Technical — also Settings</option></select></div>' +
      '<button type="submit" class="btn btn-ghost btn-block">Add team member</button>' +
      '<p class="settings-note" style="margin-top:10px">No email? Invite them on WhatsApp — they join with their phone number, a PIN and a selfie, and add their National ID within 5 days.</p>' +
      '<button type="button" class="btn btn-primary btn-block" data-invite-staff style="margin-top:8px">Invite staff on WhatsApp</button>' +
      "</form></section>" +

      '<section class="card settings-card"><h2>Shared workspace</h2>' +
      "<p>Everyone signs in with their own email, verified by Supabase. Records sync securely through Netlify.</p>" +
      '<div class="conn-status" data-state="' + connection.state + '"><span class="dot"></span><span class="conn-label">' + esc(connection.text) + "</span></div>" +
      '<div class="button-row"><button class="btn btn-ghost" data-sync>Refresh shared data</button></div></section>' +

      exportSection() +
      importSection() +

      '<section class="card settings-card"><h2>Cash flow</h2>' +
      "<p>Every expense (money out) needs a receipt before it can be approved. If the cash-flow team has already vetted a payment, whoever records it can tick “Already pre-approved by the cash-flow team” to submit without a receipt — you still give the final approval here.</p></section>" +

      '<section class="card settings-card"><h2>Backup &amp; restore</h2>' +
      '<p>Download a JSON backup any time, or import one to recover your records.</p>' +
      '<div class="button-row"><button class="btn btn-ghost" data-export>Download JSON backup</button>' +
      '<button class="btn btn-ghost" data-import>Import backup</button></div></section>' +

      '<section class="card settings-card"><h2>Danger zone</h2>' +
      '<p class="settings-note">Resetting erases <strong>all prospects, visits and team accounts — for everyone</strong> and leaves the workspace empty. It cannot be undone. Download a backup first if unsure.</p>' +
      '<div class="button-row"><button class="btn btn-danger" data-reset>Reset everything…</button></div></section>' +

      '<section class="card settings-card"><h2>How Verisko Operations works</h2>' +
      '<p class="settings-note">One connected platform for the whole team. <strong>Sales</strong> capture and qualify leads and book site visits. <strong>Operations</strong> review them, run the cash-flow float, verify closed sales, and manage installations end to end. The <strong>Owner</strong> and Technical see the whole picture. Each person sees only what their role needs — and data captured once flows through, so nobody re-enters it.</p>' +
      '<p class="settings-note">Set each person\'s role above. As the business grows — installers, accounts, more field teams — add them here and they work from the same records.</p></section>' +
      "</div>";
  }

  /* --------------------------------- Forms ---------------------------------- */
  // "Looks qualified" / what's still needed, under the 5 questions.
  function qualVerdictHtml(p) {
    var v = window.VeriskoQualify.verdict(p || {}), est = window.VeriskoQualify.cameraEstimate(p || {});
    var cams = est ? '<div class="qv-cams">About ' + est.cameras + " cameras → " + esc(est.packageLabel) + " package</div>" : "";
    if (v.ready) return '<div class="qv qv-ok">✓ Looks qualified — you can mark it <strong>Qualified</strong>.</div>' + cams;
    if (v.missing.length) return '<div class="qv qv-todo">' + v.answered + " of " + v.total + " answered · still needed: " + esc(v.missing.join(", ")) + "</div>" + cams;
    return '<div class="qv qv-stop">Not ready yet: ' + esc(v.stoppers.join(" · ")) + "</div>" + cams;
  }
  function updateQualVerdict() {
    var box = document.getElementById("qualVerdict");
    if (!box) return;
    var p = {};
    window.VeriskoQualify.QUESTIONS.forEach(function (q) { var el = document.getElementById("f_" + q.key); p[q.key] = el ? el.value : ""; });
    box.innerHTML = qualVerdictHtml(p);
  }
  function field(name, label, type, value, opts) {
    opts = opts || {};
    var required = opts.required ? ' required aria-required="true"' : "";
    var reqMark = opts.required ? ' <span class="req" aria-hidden="true">*</span>' : "";
    var optTag = opts.optional ? ' <span class="optional-tag">Optional</span>' : "";
    var ph = opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "";
    var input;
    if (type === "segmented") {
      // Big tap targets — fast on a phone, no typing.
      var choices = opts.options.map(function (o) { return typeof o === "string" ? { value: o, label: o } : o; });
      input = '<input type="hidden" id="f_' + name + '" name="' + name + '" value="' + esc(value || "") + '">' +
        '<div class="segmented" role="radiogroup" aria-label="' + esc(label) + '">' +
        choices.map(function (c) {
          var on = c.value === value;
          return '<button type="button" class="seg-btn" role="radio" aria-checked="' + (on ? "true" : "false") +
            '" data-seg-target="' + name + '" data-val="' + esc(c.value) + '">' + esc(c.label) + "</button>";
        }).join("") + "</div>";
    } else if (type === "multi") {
      // Tap any number of choices; stored as "A, B, C".
      var picked = (window.VeriskoQualify ? window.VeriskoQualify.list(value) : []);
      input = '<input type="hidden" id="f_' + name + '" name="' + name + '" value="' + esc(picked.join(", ")) + '">' +
        '<div class="segmented multi" role="group" aria-label="' + esc(label) + '">' +
        opts.options.map(function (o) {
          var on = picked.indexOf(o) !== -1;
          return '<button type="button" class="seg-btn multi-btn" aria-pressed="' + (on ? "true" : "false") + '" data-multi-target="' + name + '" data-val="' + esc(o) + '">' + esc(o) + "</button>";
        }).join("") + "</div>";
    } else if (type === "textarea") {
      input = '<textarea id="f_' + name + '" name="' + name + '"' + ph + required + ">" + esc(value || "") + "</textarea>";
    } else if (type === "select") {
      input = '<select id="f_' + name + '" name="' + name + '"' + required + ">" +
        (opts.placeholder ? '<option value="">' + esc(opts.placeholder) + "</option>" : "") +
        opts.options.map(function (o) { return '<option value="' + esc(o) + '"' + (o === value ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>";
    } else {
      input = '<input id="f_' + name + '" name="' + name + '" type="' + type + '" value="' + esc(value || "") + '"' + ph + required + ">";
    }
    return '<div class="field ' + (opts.full ? "full" : "") + '"><label for="f_' + name + '">' + esc(label) + reqMark + optTag + "</label>" +
      input + (opts.help ? '<p class="helper">' + esc(opts.help) + "</p>" : "") + "</div>";
  }

  function openForm(type, id, presetProspect) {
    editing = { type: type, id: id || null };
    hideFormError();
    var collection = state[type + "s"];
    var source = id ? (collection.find(function (x) { return x.id === id; }) || {}) : {};
    document.getElementById("dialogEyebrow").textContent = id ? "Update record" : "New record";

    var html = '<div class="form-grid">';
    if (type === "prospect") {
      pendingGeo = source.geo || null;   // pin already on file (edit) or none yet (new)
      document.getElementById("dialogTitle").textContent = id ? "Edit prospect" : "Add prospect";
      var Qz = window.VeriskoQualify;
      var CAMERAS_NOW = ["None", "Yes, working", "Yes, broken or not enough"];
      var camerasNow = CAMERAS_NOW.indexOf(source.existing) !== -1 ? source.existing : (/^(no|none)$/i.test(String(source.existing || "").trim()) ? "None" : "");
      html +=
        // The basics.
        field("business", "Business or home name", "text", source.business, { required: true, full: true, placeholder: "e.g. Acacia Pharmacy" }) +
        field("contact", "Who did you talk to?", "text", source.contact, { placeholder: "Their name" }) +
        field("phone", "Their phone number", "tel", source.phone, { help: "We need it to book the visit." }) +
        field("location", "Where is it?", "text", source.location, { full: true, placeholder: "Area, street or landmark" }) +
        field("vertical", "What kind of place?", "segmented", source.vertical || "", { full: true, options: VERTICALS.map(function (v) { return { value: v, label: VERTICAL_LABELS[v] || v }; }) }) +

        // The 5 questions that qualify a lead — all taps.
        '<div class="field-group-title">5 quick questions — tap your answers</div>' +
        Qz.QUESTIONS.map(function (q) {
          return field(q.key, q.n + ". " + q.label + (q.multi ? " (tap all that fit)" : ""), q.multi ? "multi" : "segmented", Qz.normalize(q.key, source[q.key] || ""), { full: true, options: q.options });
        }).join("") +
        '<div class="field full"><div class="qual-verdict" id="qualVerdict" aria-live="polite">' + qualVerdictHtml(source) + "</div></div>" +

        // Next step.
        '<div class="field-group-title">Next step</div>' +
        field("existing", "Do they have cameras now?", "segmented", camerasNow, { full: true, options: CAMERAS_NOW }) +
        field("stage", "Stage", "select", source.stage || "New prospect", { options: STAGES }) +
        field("followUp", "Next follow-up", "date", source.followUp || (id ? "" : today)) +
        '<div class="field full"><label for="f_nextAction">Next action</label>' +
        '<div class="segmented chip-fill">' + NEXT_ACTIONS.map(function (a) { return '<button type="button" class="seg-btn" data-fill-next="' + esc(a) + '">' + esc(a) + "</button>"; }).join("") + "</div>" +
        '<input id="f_nextAction" name="nextAction" type="text" autocomplete="off" placeholder="Tap one above, or type" value="' + esc(source.nextAction || "") + '" style="margin-top:8px"></div>' +

        // Optional.
        '<div class="field-group-title">Optional</div>' +
        field("source", "How did you find them?", "segmented", source.source || "", { full: true, options: SOURCES }) +
        field("notes", "Notes for Operations", "textarea", source.notes, { full: true, optional: true }) +

        // Site GPS pin — a must-have: it proves the rep visited (no business photo needed).
        '<div class="field full"><label>Site location ' + (canReviewProspects() ? '<span class="optional-tag">GPS pin</span>' : '<span class="req" aria-hidden="true">*</span> <span class="optional-tag">capture on site</span>') + "</label>" +
        '<div class="geo-status" id="geoStatus" aria-live="polite">' + geoStatusHtml(pendingGeo, null) + "</div>" +
        '<button type="button" class="btn btn-ghost btn-sm" data-capture-geo>' + (pendingGeo ? "Re-capture location" : "Capture site location") + "</button>" +
        '<p class="helper">' + (canReviewProspects() ? "Capture the GPS pin if you're at the site." : "The GPS pin proves you visited — capture it before you leave the site.") + "</p></div>" +
        (source.photoId ? '<div class="field full"><label>Business photo <span class="optional-tag">taken earlier</span></label>' + proofControl(source.photoId) + "</div>" : "");
      if (id) {
        if (source.reviewStatus === "query" && source.reviewNote) {
          html += '<div class="field full"><div class="rev-noproof">Sent back: ' + esc(source.reviewNote) + "</div></div>";
        }
        if (source.imported) {
          html += '<div class="field full"><p class="helper">Imported' + (source.source ? " from " + esc(source.source) : "") + " by " + esc(source.importedBy || "the Admin") + (source.importedAt ? " on " + esc(dateLabel(String(source.importedAt).slice(0, 10))) : "") + " — no commission on this lead.</p></div>";
        }
        if (source.qualStatus === "disqualified") {
          html += '<div class="field full"><div class="rev-noproof">Disqualified by ' + esc(source.qualApprovedBy || "the Team lead") + ": " + esc(source.qualReason || "no reason given") + (source.qualNote ? " — " + esc(source.qualNote) : "") + ". No qualification commission. The Team lead or Operations can re-open it.</div></div>";
        } else if (source.qualStatus === "query") {
          html += '<div class="field full"><div class="rev-noproof">Not qualified yet' + (source.qualNote ? ": " + esc(source.qualNote) : "") + ". Update the prospect and save — it goes back to the Team lead.</div></div>";
        } else if (source.qualStatus === "pending") {
          html += '<div class="field full"><p class="helper" style="color:var(--amber)">Waiting for the Team lead to approve it as qualified (' + money(commissionPerQualified()) + ").</p></div>";
        } else if (source.qualStatus === "approved") {
          html += '<div class="field full"><p class="helper" style="color:var(--green);font-weight:600">Approved as qualified by ' + esc(source.qualApprovedBy || "the Team lead") + " — " + money(commissionPerQualified()) + " commission.</p></div>";
        }
        // The sale closes itself when the client accepts the quote (job stage
        // Accepted or later); commission then waits for the first payment.
        if (canReviewProspects()) {
          var fq = quoteForProspect(id);
          var statusHtml = source.closedSale
            ? '<p class="helper" style="color:var(--green);font-weight:600">Closed sale' + (source.closedAuto ? " — " + (source.closedBy === "Client deposit" ? "the client paid a deposit" : "the client accepted the quote") : "") + ".</p>" +
              (firstPaymentFor(source) ? '<p class="helper">Client\'s first deposit recorded ' + dateLabel(firstPaymentFor(source)) + (source.imported ? "." : " — " + money(commissionRate()) + " commission earned.") + "</p>"
                : source.imported ? "" : '<p class="helper" style="color:var(--amber)">The rep earns ' + money(commissionRate()) + " as soon as the client's first deposit is recorded.</p>")
            : (fq ? '<p class="helper">Quoted — ' + esc(fq.ref || "job") + " is " + esc(fq.stage || "Draft") + ". It becomes a closed sale when the client accepts.</p>"
              : '<p class="helper">No quote yet. The sale closes automatically once the client accepts a quote.</p>');
          html += '<div class="field full"><label>Quote &amp; sale</label>' + statusHtml +
            (canInstalls() ? (fq ? '<button type="button" class="btn btn-ghost btn-block" data-open-job="' + esc(fq.id) + '">Open quote ' + esc(fq.ref || "") + "</button>"
              : '<button type="button" class="btn btn-primary btn-block" data-make-install="' + esc(id) + '">Create quote</button>') : "") + "</div>";
        }
        html += '<div class="field full followup-block"><label>Follow-ups</label>' + followUpHistory(source) +
          '<button type="button" class="btn btn-ghost btn-block" data-log-followup="' + esc(id) + '" style="margin-top:10px">Log a call / plan the next follow-up</button></div>';
      }
    }
    if (type === "appointment") {
      document.getElementById("dialogTitle").textContent = id ? "Edit site visit" : "Schedule site visit";
      var options = visibleProspects().map(function (p) { return { value: p.id, label: p.business }; });
      var selected = source.prospectId || presetProspect || "";
      // Assign the visit to a real Operations/admin person, not a typed constant.
      var meOps = settings.user && (settings.user.role === "operations" || settings.user.role === "admin") ? settings.user.name : "";
      var dirNames = (state.users || []).filter(function (u) { return u.role === "operations" || u.role === "admin"; }).map(function (u) { return u.name; });
      var curDir = source.director || meOps || dirNames[0] || "Operations Director";
      if (curDir && dirNames.indexOf(curDir) === -1) dirNames.unshift(curDir);
      html +=
        '<div class="field full"><label for="f_prospectId">Prospect <span class="req" aria-hidden="true">*</span></label>' +
        '<select id="f_prospectId" name="prospectId" required aria-required="true"><option value="">Choose a prospect</option>' +
        options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === selected ? " selected" : "") + ">" + esc(o.label) + "</option>"; }).join("") + "</select></div>" +
        field("date", "Visit date", "date", source.date || plusDays(1), { required: true }) +
        field("time", "Time", "time", source.time || "10:00", { required: true }) +
        '<div class="field full"><label for="f_director">Operations owner <span class="req" aria-hidden="true">*</span></label><select id="f_director" name="director" required aria-required="true">' +
        dirNames.map(function (n) { return '<option value="' + esc(n) + '"' + (n === curDir ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select></div>" +
        field("status", "Appointment status", "select", source.status || "Proposed", { options: APPT_STATUSES }) +
        field("purpose", "Purpose", "segmented", source.purpose || PURPOSES[0], { full: true, options: PURPOSES }) +
        field("directions", "Directions and access instructions", "textarea", source.directions, { full: true, optional: true, placeholder: "How to reach the site and who to ask for." });
    }
    if (type === "transaction") {
      var txp = (!id && txPreset) ? txPreset : {};
      document.getElementById("dialogTitle").textContent = id ? "Cash entry" : (txp.installId ? (txp.direction === "out" ? "Record job spend" : "Record payment") : "Add money");
      var dir = source.direction || txp.direction || "in";
      var cats = TX_CATS[dir] || TX_CATS.in;
      var linkInstall = source.installId || txp.installId || "";
      var linkJob = linkInstall ? job(linkInstall) : null;
      var linkJobName = linkJob ? (jobClient(linkJob).business || "this job") : "";
      html +=
        (linkJob ? '<div class="field full"><div class="rev-petty">For job: <strong>' + esc(linkJobName) + "</strong>" + (dir === "in" ? " — client payment" : " — job spend") + "</div></div>" : "") +
        field("direction", "Direction", "segmented", dir, { full: true, options: [{ value: "in", label: "Money in" }, { value: "out", label: "Money out" }] }) +
        // Amount: numeric keypad, a live "= UGX 500,000" echo, and the float hint.
        '<div class="field full"><label for="f_amount">Amount (UGX) <span class="req" aria-hidden="true">*</span></label>' +
        '<input id="f_amount" name="amount" type="number" inputmode="numeric" min="0" step="1" required aria-required="true" value="' + esc(source.amount || txp.amount || "") + '">' +
        '<p class="amount-echo" id="amountEcho" aria-live="polite"></p>' +
        '<p class="helper">In the float now: ' + money(availableForOut(id)) + ".</p></div>" +
        field("date", "Date", "date", source.date || today, { required: true }) +
        field("category", "Category", "select", source.category || txp.category || cats[0], { options: cats, full: true }) +
        field("method", "Paid by", "select", source.method || TX_METHODS[0], { options: TX_METHODS, full: true }) +
        // Prospect link, note and proof only apply to money OUT — hidden for money in.
        // When the entry belongs to a job, the client is already implied — skip the prospect link.
        '<div id="txOutOnly" class="tx-outonly"' + (dir === "out" ? "" : " hidden") + ">" +
        (linkInstall ? "" : '<div class="field full"><label for="f_prospectId">Link to a prospect (optional)</label><select id="f_prospectId" name="prospectId"><option value="">— none —</option>' +
        state.prospects.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === source.prospectId ? " selected" : "") + ">" + esc(p.business) + "</option>"; }).join("") + "</select></div>") +
        field("note", "Note", "textarea", source.note, { full: true, optional: true }) +
        '<div class="field full"><label>Proof of payment <span class="req" aria-hidden="true">*</span> <span class="optional-tag">photo or MoMo SMS</span></label>' + proofControl(source.proofId) +
        '<p class="helper">Every expense needs a receipt. If the cash-flow team already approved this, tick the box below to submit without one.</p>' +
        '<label class="chk-item preapprove-row"><input type="checkbox" id="f_preapproved" name="preapproved"' + (source.preapproved ? " checked" : "") + '><span>Already pre-approved by the cash-flow team — submit without a receipt</span></label>' +
        "</div></div>" +
        '<input type="hidden" name="installId" value="' + esc(linkInstall) + '">';
      txPreset = null; // preset consumed
      if (id && isAdmin() && source.status !== "approved") {
        html += '<div class="field full tx-review"><button type="button" class="btn btn-primary btn-block" data-approve>Approve entry</button><button type="button" class="btn btn-ghost btn-block" data-sendback>Send back with a note</button></div>';
      }
    }
    if (type === "job") {
      // One record for the whole lifecycle. Pricing (the quote) is always shown;
      // delivery fields reveal at "Accepted"; the checklist reveals at handover.
      document.getElementById("dialogTitle").textContent = id ? esc(source.ref || "Job") : "New job";
      var qInputs = id ? source : {};
      var jobStage = source.stage || "Draft";
      var jr = computeQuote(qInputs);
      var showFinal = jr.custom || !!source.priceOverride;
      var techOpts = (state.technicians || []).filter(function (t) { return t.active !== false || t.id === source.technicianId; })
        .map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === source.technicianId ? " selected" : "") + ">" + esc(t.name) + (t.active === false ? " (inactive)" : "") + "</option>"; }).join("");
      html += renderClientBlock(id, presetProspect, source) +
        // ---- Pricing (the quote) ----
        '<div class="field full"><label>Site scoring <span class="optional-tag" id="quoteTier"></span></label>' +
        QUOTE_RUBRIC.map(function (r) {
          return '<div class="field full" style="margin-bottom:10px"><label for="f_' + r.key + '">' + esc(r.q) + "</label><select id=\"f_" + r.key + '" class="quote-input">' +
            r.opts.map(function (o) { return '<option value="' + o[0] + '"' + ((String((qInputs.rubric || {})[r.key] || "0")) === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div>";
        }).join("") + "</div>" +
        field("cameraCount", "Cameras", "segmented", String(qInputs.cameraCount || 4), { full: true, options: [{ value: "2", label: "2" }, { value: "4", label: "4" }, { value: "6", label: "6" }, { value: "8", label: "8" }, { value: "12", label: "12+" }] }) +
        '<div class="field full"><label>Add-ons</label><div class="quote-addons">' +
        QUOTE_ADDONS.map(function (a) {
          if (a.qty) {
            return '<div class="qa-row"><span class="qa-label">' + esc(a.label) + " · " + money(a.price) + '</span><input class="quote-input qa-qty" type="number" inputmode="numeric" min="0" step="1" data-addon-qty="' + a.key + '" value="' + esc((qInputs.addons || {})[a.key] || "") + '" placeholder="0" aria-label="' + esc(a.label) + ' quantity"></div>';
          }
          return '<label class="chk-item"><input type="checkbox" class="quote-input" data-addon="' + a.key + '"' + ((qInputs.addons || {})[a.key] ? " checked" : "") + "><span>" + esc(a.label) + " · " + money(a.price) + "</span></label>";
        }).join("") + '<p class="helper">Surge protector auto-adds on Complex+ sites; an HDMI cable auto-adds with a TV.</p></div></div>' +
        '<div class="field full"><label for="f_zone">Zone</label><select id="f_zone" class="quote-input">' +
        QUOTE_ZONES.map(function (z) { return '<option value="' + z.key + '"' + ((qInputs.zone || "1") === z.key ? " selected" : "") + ">" + esc(z.label) + (z.surcharge ? " (+" + money(z.surcharge) + ")" : "") + "</option>"; }).join("") + "</select></div>" +
        (isAdmin() ? '<div class="field full"><label for="f_discountPct">Discount %</label><input id="f_discountPct" class="quote-input" type="number" inputmode="numeric" min="0" max="100" step="1" value="' + esc(qInputs.discountPct || "") + '" placeholder="0"><p class="helper">Owner only. Above 5% is your call.</p></div>' : "") +
        '<div class="field full" id="quoteGov"></div>' +
        '<div class="field full"><label>Quote</label><div id="quoteSummary"></div></div>' +
        (id ? '<div class="field full"><label>Quotation for the client</label>' + quoteActionsHtml(id) +
          '<p class="helper">A branded PDF with the client\'s details, the prices above and the payment options. Share opens WhatsApp with it attached.</p></div>' : "") +
        // Final price — only for a custom (12+) job or an admin override. Admin-only.
        (isAdmin()
          ? '<div class="field full" id="finalPriceField"' + (showFinal ? "" : " hidden") + '><label for="f_finalPrice">Final price (UGX) <span class="optional-tag">custom / override</span></label>' +
            '<input id="f_finalPrice" class="quote-input" type="number" inputmode="numeric" min="0" step="1000" value="' + esc(source.finalPrice || "") + '" placeholder="0"><p class="helper">Set this for a 12+ camera custom job, or to override the rubric price.</p></div>'
          : '<div id="finalPriceField" hidden></div>') +
        // ---- Stage ----
        field("stage", "Stage", "select", jobStage, { options: JOB_STAGES, full: true }) +
        // ---- Delivery (revealed once Accepted) ----
        '<div id="deliveryFields"' + (jobIsDelivery(jobStage) ? "" : " hidden") + ">" +
        field("scheduledDate", "Install date", "date", source.scheduledDate || "") +
        field("scheduledTime", "Time", "time", source.scheduledTime || "") +
        '<div class="field full"><label for="f_technicianId">Technician</label><select id="f_technicianId" name="technicianId"><option value="">— unassigned —</option>' + techOpts + "</select>" +
        (techOpts ? "" : '<p class="helper">Add technicians in the Technicians card to assign one.</p>') + "</div>" +
        '<div class="field full"><label>Materials <span class="optional-tag">bill of materials</span></label>' +
        '<div class="mat-head"><span>Item</span><span>Qty</span><span>Unit</span><span></span></div>' +
        '<div class="mat-list" id="matList">' + ((source.materials && source.materials.length) ? source.materials.map(materialRow).join("") : materialRow()) + "</div>" +
        '<button type="button" class="btn btn-ghost btn-sm" data-mat-add style="margin-top:8px">Add item</button>' +
        '<p class="mat-total" id="matTotal" aria-live="polite"></p></div>' +
        "</div>" +
        // ---- Completion checklist (revealed at handover; gates it) ----
        '<div class="field full" id="chkField"' + ((jobStage === "Handed over") ? "" : " hidden") + '><label>Completion checklist <span class="optional-tag">tick before handover</span></label>' +
        '<div class="chk-list" id="chkList">' + INSTALL_CHECKLIST.map(function (i) {
          return '<label class="chk-item"><input type="checkbox" data-check="' + esc(i.key) + '"' + ((source.checklist && source.checklist[i.key]) ? " checked" : "") + "><span>" + esc(i.label) + "</span></label>";
        }).join("") + "</div></div>" +
        ((id && jobIsDelivery(jobStage)) ? jobPaymentsSection(source) : "") +
        field("notes", "Notes", "textarea", source.notes, { full: true, optional: true, placeholder: "Anything the customer or Ben should know." });
    }
    // Delete is offered for prospects, site visits and jobs (not cash entries),
    // and not once a prospect/visit is approved (Sales can't remove audited records).
    if (id && (type === "prospect" || type === "appointment" || type === "job") && canDeleteRecord(type, source)) html += '<button type="button" class="btn btn-danger btn-block delete-record" data-delete>Delete this ' + (type === "appointment" ? "site visit" : type === "job" ? "job" : "prospect") + "</button>";
    formContent.innerHTML = html + "</div>";
    if (type === "transaction" || type === "prospect") {
      pendingProof = null;
      if (type === "transaction") updateAmountEcho();
      var pIn = document.getElementById("proofInput");
      if (pIn) pIn.addEventListener("change", onProofPick);
      var existingPhoto = type === "transaction" ? source.proofId : source.photoId;
      if (existingPhoto) {
        fetchProof(existingPhoto).then(function (img) {
          var pv = document.getElementById("proofPreview");
          if (pv) pv.innerHTML = img ? '<img src="' + img + '" alt="Photo" class="proof-img">' : '<span class="proof-none">Couldn\'t load photo</span>';
        });
      } else if (id && hasQueuedPhoto(id)) {
        var pk = document.querySelector("[data-proof-pick]"); if (pk) pk.textContent = "Replace photo";
        getQueuedPhoto(id).then(function (img) {
          var pv0 = document.getElementById("proofPreview");
          if (pv0 && img) pv0.innerHTML = '<img src="' + img + '" alt="Photo (waiting to upload)" class="proof-img">';
        });
      }
    }
    if (type === "job") { recalcQuoteForm(); updateMatTotal(); }
    document.getElementById("saveButton").textContent = id ? "Save changes" : "Save";
    if (!dialog.open) dialog.showModal();
    var first = formContent.querySelector('input:not([type=hidden]),select,textarea');
    if (first) first.focus();
  }

  function showFormError(msg) { formError.textContent = msg; formError.hidden = false; }
  function hideFormError() { formError.hidden = true; formError.textContent = ""; }

  // Delete the record being edited (prospect also removes its site visits).
  async function deleteRecord() {
    if (!editing || !editing.id) return;
    var type = editing.type;
    var label = type === "appointment" ? "site visit" : type === "job" ? "job" : "prospect";
    var rec = state[type + "s"].find(function (x) { return x.id === editing.id; });
    if (!canDeleteRecord(type, rec)) {
      showFormError("This " + label + " has been approved, so it can't be deleted here. Ask Operations if it really needs removing.");
      return;
    }
    if (!(await confirmSheet("Delete this " + label + "?", "This can't be undone.", "Delete", true))) return;
    state[type + "s"] = state[type + "s"].filter(function (x) { return x.id !== editing.id; });
    if (type === "prospect") state.appointments = state.appointments.filter(function (a) { return a.prospectId !== editing.id; });
    hideFormError();
    dialog.close();
    saveData(label.charAt(0).toUpperCase() + label.slice(1) + " deleted");
    if (type === "job") syncClosedSales();
    render();
  }

  // Segmented (tap) controls: set the hidden value and move the selection.
  // Live "= UGX 500,000" under the amount field — catches missing/extra zeros.
  function updateAmountEcho() {
    var inp = document.getElementById("f_amount"), echo = document.getElementById("amountEcho");
    if (!inp || !echo) return;
    var n = Math.round(Number(inp.value) || 0);
    echo.textContent = n > 0 ? "= " + money(n) : "";
    echo.classList.toggle("big", n >= LARGE_AMOUNT);
  }
  form.addEventListener("input", function (e) {
    if (e.target.id === "f_amount") updateAmountEcho();
    if (e.target.classList.contains("mat-qty") || e.target.classList.contains("mat-cost")) updateMatTotal();
    if (editing && editing.type === "job" && e.target.classList.contains("quote-input")) recalcQuoteForm();
  });

  form.addEventListener("change", function (e) {
    // Picking the client on a new job re-renders the form with it.
    if (e.target.id === "f_clientPick") {
      var v = e.target.value;
      openForm(editing ? editing.type : "job", null, v === "__walkin__" ? "__walkin__" : (v || undefined));
      return;
    }
    if (editing && editing.type === "job" && e.target.classList.contains("quote-input")) recalcQuoteForm();
    // Jobs: delivery fields appear once won; the checklist appears at handover.
    if (e.target.id === "f_stage" && editing && editing.type === "job") {
      var df = document.getElementById("deliveryFields");
      if (df) df.hidden = !jobIsDelivery(e.target.value);
      var cf = document.getElementById("chkField");
      if (cf) cf.hidden = e.target.value !== "Handed over";
    }
  });

  form.addEventListener("click", function (e) {
    if (e.target.closest("[data-delete]")) { deleteRecord(); return; }
    if (e.target.closest("[data-mat-add]")) { var ml = document.getElementById("matList"); if (ml) { ml.insertAdjacentHTML("beforeend", materialRow()); var last = ml.querySelector(".mat-row:last-child .mat-name"); if (last) last.focus(); } return; }
    var md = e.target.closest("[data-mat-del]"); if (md) { var row = md.closest(".mat-row"); if (row) row.remove(); updateMatTotal(); return; }
    var lf = e.target.closest("[data-log-followup]"); if (lf) { logFollowUp(lf.getAttribute("data-log-followup")); return; }
    var ojf = e.target.closest("[data-open-job]"); if (ojf) { openForm("job", ojf.getAttribute("data-open-job")); return; }
    var mi = e.target.closest("[data-make-install]"); if (mi) { openForm("job", null, mi.getAttribute("data-make-install")); return; }
    var jph = e.target.closest("[data-job-photo]"); if (jph) { fetchProof(jph.getAttribute("data-job-photo")).then(function (img) { if (img) openPhoto(img); }); return; }
    var qpf = e.target.closest("[data-quote-pdf]"); if (qpf) { downloadQuotePdf(qpf.getAttribute("data-quote-pdf")); return; }
    var qsf = e.target.closest("[data-quote-share]"); if (qsf) { shareQuote(qsf.getAttribute("data-quote-share")); return; }
    var jpay = e.target.closest("[data-job-pay]"); if (jpay) { txPreset = { direction: "in", category: "Customer payment", installId: jpay.getAttribute("data-job-pay") }; openForm("transaction"); return; }
    var jspend = e.target.closest("[data-job-spend]"); if (jspend) { var jid = jspend.getAttribute("data-job-spend"); var jb = job(jid); txPreset = { direction: "out", category: "Cable & materials", installId: jid, amount: jb ? materialsTotal(jb) : "" }; openForm("transaction"); return; }
    if (e.target.closest("[data-proof-pick]")) { var pi = document.getElementById("proofInput"); if (pi) pi.click(); return; }
    var cg = e.target.closest("[data-capture-geo]");
    if (cg) {
      var geoEl = document.getElementById("geoStatus");
      cg.disabled = true; cg.textContent = "Getting location…";
      if (geoEl) geoEl.innerHTML = '<span class="geo-none">Getting your location…</span>';
      captureGeo().then(function (res) {
        if (res.geo) pendingGeo = res.geo;
        if (geoEl) geoEl.innerHTML = geoStatusHtml(pendingGeo, res.geo ? null : res.error);
        cg.disabled = false; cg.textContent = pendingGeo ? "Re-capture location" : "Capture site location";
      });
      return;
    }
    if (e.target.closest("[data-approve]")) { approveTransaction(); return; }
    if (e.target.closest("[data-sendback]")) { sendBackTransaction(); return; }
    var fill = e.target.closest("[data-fill-next]");
    if (fill) { var na = document.getElementById("f_nextAction"); if (na) na.value = fill.getAttribute("data-fill-next"); return; }
    var mb = e.target.closest(".multi-btn");
    if (mb) {
      var on = mb.getAttribute("aria-pressed") !== "true";
      mb.setAttribute("aria-pressed", on ? "true" : "false");
      var mname = mb.getAttribute("data-multi-target");
      var vals = [].map.call(mb.parentNode.querySelectorAll('.multi-btn[aria-pressed="true"]'), function (b) { return b.getAttribute("data-val"); });
      var mh = document.getElementById("f_" + mname); if (mh) mh.value = vals.join(", ");
      updateQualVerdict();
      return;
    }
    var btn = e.target.closest(".seg-btn");
    if (!btn) return;
    var name = btn.getAttribute("data-seg-target");
    btn.parentNode.querySelectorAll(".seg-btn").forEach(function (b) {
      b.setAttribute("aria-checked", b === btn ? "true" : "false");
    });
    var hidden = document.getElementById("f_" + name);
    if (hidden) hidden.value = btn.getAttribute("data-val");
    // Cash flow: switching In/Out re-populates the category list and shows the
    // prospect/note/proof fields only for money out.
    if (name === "direction" && editing && editing.type === "transaction") {
      var sel = document.getElementById("f_category");
      if (sel) {
        var cats = TX_CATS[hidden.value] || TX_CATS.in;
        sel.innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");
      }
      var outOnly = document.getElementById("txOutOnly");
      if (outOnly) outOnly.hidden = hidden.value !== "out";
    }
    // Job: the camera-count segmented control re-prices the quote live.
    if (name === "cameraCount" && editing && editing.type === "job") recalcQuoteForm();
    if (editing && editing.type === "prospect") updateQualVerdict();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    var type = editing.type;
    if (type === "transaction") { saveTransaction(data); return; }
    if (type === "prospect") { saveProspect(data); return; }
    if (type === "job") { saveJob(data); return; }
    var collection = state[type + "s"];

    // Client-side guard: confirming a visit requires a complete handoff.
    if (type === "appointment" && data.status === "Confirmed") {
      var gaps = handoffGaps({ prospectId: data.prospectId }, data);
      if (hasGaps(gaps)) {
        var parts = [];
        if (gaps.prospect.length) parts.push("the prospect's " + listAnd(gaps.prospect));
        if (gaps.appointment.length) parts.push(listAnd(gaps.appointment));
        showFormError("Can't confirm yet — add " + listAnd(parts) + ". " +
          (gaps.prospect.length ? "Open the prospect to add its missing details, or set the status back to Proposed for now." : "Fill the highlighted fields, or set the status back to Proposed."));
        return;
      }
    }

    if (editing.id) {
      var index = collection.findIndex(function (x) { return x.id === editing.id; });
      data.id = editing.id;
      data.created = collection[index].created;
      // Preserve fields not present in the salesperson form (e.g. Excel `estimate`, `owner`).
      collection[index] = Object.assign({}, collection[index], data);
    } else {
      data.id = uid();
      data.created = today;
      if (settings.user) data.createdBy = settings.user.name; // who added it
      collection.push(data);
    }

    if (type === "appointment") syncProspectFromAppointment(collection.find(function (x) { return x.id === data.id; }));

    hideFormError();
    dialog.close();
    saveData(editing.id ? "Changes saved" : (type === "appointment" ? "Site visit saved" : "Prospect added"));
    render();
  });

  // Keep the prospect stage in step with its appointment.
  function syncProspectFromAppointment(a) {
    var p = prospect(a.prospectId);
    if (!p.id) return;
    if (a.status === "Confirmed") { p.stage = "Appointment confirmed"; p.nextAction = "Operations site visit"; p.followUp = a.date; }
    else if (/Proposed|Rescheduled/i.test(a.status)) { p.stage = "Appointment proposed"; p.nextAction = "Confirm the site visit"; p.followUp = a.date; }
    else if (/Cancelled|No-show/i.test(a.status)) { if (/Appointment/i.test(p.stage)) { p.stage = "Qualified"; p.nextAction = "Re-book the site visit"; } }
    stampPlan(p);
    window.VeriskoCommission.qualificationRequest(p, nowIso());
  }

  // Confirm directly from a card when the handoff is already complete.
  function confirmVisit(id) {
    var a = state.appointments.find(function (x) { return x.id === id; });
    if (!a) return;
    var gaps = handoffGaps(a);
    if (hasGaps(gaps)) {
      openForm("appointment", id);
      var missing = gaps.prospect.concat(gaps.appointment);
      showFormError("Add " + listAnd(missing) + " before confirming this visit. " +
        (gaps.prospect.length ? "The prospect's details (contact, phone, location) must be completed on the prospect record." : ""));
      return;
    }
    a.status = "Confirmed";
    syncProspectFromAppointment(a);
    saveData("Visit confirmed — ready for handoff");
    render();
  }

  /* ---------------------- Prospect audit & follow-ups ----------------------- */
  function nowIso() { return new Date().toISOString(); }

  // Operations and admins review prospects. (Sales record them.)
  function canReviewProspects() { return isAdmin() || !!(settings.user && settings.user.role === "operations"); }

  /* ------ Closed sales & commission (Operations-verified, UGX 100k, paid ------ */
  /* ------ out once the client's first payment is recorded and approved)  ------ */
  function commissionRate() { var n = state.config && Number(state.config.commissionPerSale); return n > 0 ? n : 100000; }
  function commissionPerQualified() { var n = state.config && Number(state.config.commissionPerQualified); return n > 0 ? n : 2500; }
  // The client's first recorded deposit (pending or approved, not sent back),
  // directly or through their job. Returns its date, or "".
  function firstPaymentFor(p) {
    if (!p || !p.id) return "";
    var fd = window.VeriskoCommission.firstDeposit(p, state.jobs || [], state.transactions || []);
    return fd ? (fd.tx.date || fd.tx.createdAt || "") : "";
  }
  function commissionQualified(p) { return !!firstPaymentFor(p); }
  function commissionTarget() { var n = state.config && Number(state.config.commissionTarget); return n > 0 ? n : 1600000; }
  function closedSalesFor(email) {
    email = (email || "").toLowerCase();
    return (state.prospects || []).filter(function (p) { return p.closedSale && (p.createdByEmail || "").toLowerCase() === email; }).length;
  }
  function closedSaleChip(p) { return p.closedSale ? chip("Closed sale", "green", "✓") : ""; }
  // Closed sales follow the client's decision on the quote (closed-sales.js).
  // Only Operations/admin devices write the result; Sales devices just read it.
  function quoteForProspect(id) { return window.VeriskoClosedSales.quoteFor(id, state.jobs || [], JOB_DELIVERY_STAGES); }
  function syncClosedSales(quiet) {
    if (!canReviewProspects()) return false;
    var ch = window.VeriskoClosedSales.reconcile(state.prospects || [], state.jobs || [], today, JOB_DELIVERY_STAGES, state.transactions || []);
    if (!ch.length) return false;
    var closed = ch.filter(function (c) { return c.to; }).length, opened = ch.length - closed;
    saveData(quiet ? null : (closed && !opened ? "Quote accepted — " + (ch[0].business || "prospect") + " is now a closed sale"
      : opened && !closed ? (ch[0].business || "Prospect") + " is open again until the client accepts a quote"
      : "Closed sales updated from quotes"));
    return true;
  }

  // Sales may only delete prospects still in the review process (their own,
  // not yet approved). Once approved, only Operations/admins can delete — this
  // protects the audit trail. Legacy prospects (no reviewStatus) are locked too.
  function salesCanDeleteProspect(p) { return p.reviewStatus === "pending" || p.reviewStatus === "query"; }
  function canDeleteRecord(type, rec) {
    if (canReviewProspects()) return true;        // Operations/admins can delete
    if (type === "prospect") return salesCanDeleteProspect(rec || {});
    if (type === "appointment") { var p = prospect((rec || {}).prospectId); return !p || !p.id || salesCanDeleteProspect(p); }
    return true;
  }
  // Did a Sales edit change anything that should re-open the audit?
  function prospectChanged(prev, data, photoChanged) {
    if (photoChanged) return true;
    return Object.keys(data).some(function (k) {
      return String(prev[k] == null ? "" : prev[k]) !== String(data[k] == null ? "" : data[k]);
    });
  }

  // Best-effort GPS — resolves to {lat,lng,acc,at} or null. Never rejects, so
  // a denied permission or poor signal doesn't block the submission.
  // Resolves { geo, error } — geo is the pin (or null); error names why it failed
  // (denied / timeout / unavailable / unsupported) so we can guide the rep.
  function captureGeo() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve({ geo: null, error: "unsupported" });
      var done = false;
      var finish = function (v) { if (done) return; done = true; resolve(v); };
      setTimeout(function () { finish({ geo: null, error: "timeout" }); }, 12000);
      navigator.geolocation.getCurrentPosition(
        function (pos) { finish({ geo: { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6), acc: Math.round(pos.coords.accuracy || 0), at: nowIso() }, error: null }); },
        function (err) { finish({ geo: null, error: (err && err.code === 1) ? "denied" : (err && err.code === 3) ? "timeout" : "unavailable" }); },
        { enableHighAccuracy: true, timeout: 11000, maximumAge: 30000 }
      );
    });
  }
  // Plain-language status for the capture control and errors.
  function geoStatusHtml(geo, err) {
    if (geo && geo.lat != null) return '<span class="geo-ok">✓ Pin captured — ' + mapLink(geo, "view on map") + (geo.acc ? ' <span class="geo-acc">±' + geo.acc + " m</span>" : "") + "</span>";
    if (err === "denied") return '<span class="geo-err">Location is blocked. Allow location for this site in your browser, then tap again.</span>';
    if (err === "timeout") return '<span class="geo-err">Couldn\'t get a fix — step into the open and tap again.</span>';
    if (err === "unsupported") return '<span class="geo-err">This device can\'t share a location.</span>';
    if (err === "unavailable") return '<span class="geo-err">Location unavailable right now — tap to try again.</span>';
    return '<span class="geo-none">No pin yet — tap “Capture site location” while you\'re on site.</span>';
  }
  function mapLink(geo, label) {
    if (!geo || geo.lat == null) return "";
    return '<a class="maplink" href="https://www.google.com/maps?q=' + geo.lat + "," + geo.lng + '" target="_blank" rel="noopener">' + (label || "View on map") + "</a>";
  }
  function prospectReviewChip(s) {
    if (s === "query") return chip("Sent back", "red", "!");
    if (s === "pending") return chip("Pending review", "amber", "◔");
    return ""; // approved / legacy → no chip
  }
  function needsReview(p) { return p.reviewStatus === "pending"; }

  // Badge count: reviewers see prospects awaiting review; Sales see their own
  // sent-back prospects that need fixing.
  function prospectReviewCount() {
    var ps = state.prospects || [];
    var n = 0;
    if (canReviewProspects()) n += ps.filter(needsReview).length;
    if (canApproveQual()) n += ps.filter(needsQualApproval).length;
    if (canReviewProspects() || isTeamLead()) return n;
    var mine = (settings.user && settings.user.email || "").toLowerCase();
    return ps.filter(function (p) { return (p.reviewStatus === "query" || p.qualStatus === "query" || unreadDisqualified(p)) && (p.createdByEmail || "").toLowerCase() === mine; }).length;
  }
  function updateProspectBadge() {
    var b = document.getElementById("prospectBadge");
    if (!b) return;
    var n = prospectReviewCount();
    b.textContent = n > 9 ? "9+" : String(n);
    b.hidden = n === 0;
  }

  function followUpHistory(p) {
    var fs = (p.followUps || []).slice().reverse();
    if (!fs.length) return '<p class="rev-petty">No follow-ups logged yet. Use “Log follow-up” on the prospect to record one.</p>';
    return '<div class="followup-list">' + fs.map(function (f) {
      var office = f.role && f.role !== "Sales";
      return '<div class="followup-item"><div class="followup-meta">' + esc(dateTimeLabel(f.at)) + " · " + esc(f.by || "—") + (office ? " (" + esc(f.role) + ")" : "") +
        (f.geo ? " · " + mapLink(f.geo) : office ? "" : " · <span class=\"nogeo\">no location</span>") + (f.next ? " · next " + esc(dateLabel(f.next)) : "") + "</div>" +
        '<div class="followup-note">' + esc(f.note || "") + "</div></div>";
    }).join("") + "</div>";
  }

  // One sheet for every role: what happened on the call, notes, and when to
  // follow up next. Reps on their own prospect also stamp their GPS (proof of
  // visit); Team lead / Operations calls from the office don't need it.
  var FOLLOW_OUTCOMES = ["Answered", "No answer", "Call back later", "Not interested", "Visited", "Messaged", "Quoted"];
  function logFollowUp(id) {
    var p = prospect(id);
    if (!p || !p.id) return;
    if (!(canReviewProspects() || isTeamLead() || ownProspect(p))) return;
    var dlg = document.getElementById("askDialog");
    var plus2 = new Date(Date.now() + 2 * 864e5 + 3 * 3600e3).toISOString().slice(0, 10);
    var nextDate = p.followUp && p.followUp >= today ? p.followUp : plus2;
    var recent = (p.followUps || []).slice(-3).reverse();
    var tries = noAnswerCount(p);
    dlg.innerHTML = '<div class="ask-head"><h2 id="askTitle">Follow-up</h2><p class="ask-body">' + esc(p.business) + (p.contact ? " · " + esc(p.contact) : "") +
      (p.phone ? ' · <a class="telink" href="' + esc(telHref(p.phone)) + '">' + esc(p.phone) + "</a>" : "") + "</p></div>" +
      (recent.length ? '<div class="followup-list" style="max-height:150px;overflow:auto;margin-bottom:10px">' + recent.map(function (f) {
        return '<div class="followup-item"><div class="followup-meta">' + esc(dateTimeLabel(f.at)) + " · " + esc(f.by || "—") + '</div><div class="followup-note">' + esc(f.note || "") + "</div></div>";
      }).join("") + "</div>" : "") +
      (tries >= 2 && canDisqualify(p) ? '<p class="ask-body" style="color:var(--red)">' + tries + " unanswered calls so far — you can disqualify this lead from its card.</p>" : "") +
      '<div class="ask-choices" role="group" aria-label="What happened">' + FOLLOW_OUTCOMES.map(function (c) { return '<button type="button" class="ask-chip" data-choice="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") + "</div>" +
      '<textarea class="ask-input" id="fuNote" rows="3" placeholder="Call notes — what did they say?"></textarea>' +
      '<div class="field"><label for="fuDate">Next follow-up</label><input id="fuDate" type="date" value="' + esc(nextDate) + '"></div>' +
      '<div class="field"><label for="fuAction">Next action</label><input id="fuAction" type="text" list="fuActionList" autocomplete="off" placeholder="Tap a suggestion or type" value="' + esc(p.nextAction || "") + '">' +
      '<datalist id="fuActionList">' + NEXT_ACTIONS.map(function (a) { return "<option>" + esc(a) + "</option>"; }).join("") + "</datalist></div>" +
      '<div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">Cancel</button><button type="button" class="btn btn-primary" id="askOk" disabled>Save follow-up</button></div>';
    var selected = "", note = dlg.querySelector("#fuNote"), ok = dlg.querySelector("#askOk");
    var dateEl = dlg.querySelector("#fuDate"), actEl = dlg.querySelector("#fuAction");
    var refresh = function () { ok.disabled = !(selected || note.value.trim() || dateEl.value !== (p.followUp || "") || actEl.value.trim() !== (p.nextAction || "")); };
    dlg.querySelectorAll(".ask-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        selected = selected === b.dataset.choice ? "" : b.dataset.choice;
        dlg.querySelectorAll(".ask-chip").forEach(function (x) { x.classList.toggle("is-on", x === b && !!selected); });
        refresh();
      });
    });
    [note, dateEl, actEl].forEach(function (el) { el.addEventListener("input", refresh); el.addEventListener("change", refresh); });
    var onCancel = function (e) { if (e) e.preventDefault(); dlg.close(); };
    dlg.querySelector("#askCancel").addEventListener("click", onCancel);
    dlg.addEventListener("cancel", onCancel, { once: true });
    ok.addEventListener("click", async function () {
      if (ok.disabled) return;
      ok.disabled = true;
      var text = note.value.trim();
      var date = dateEl.value || "", action = actEl.value.trim();
      dlg.close();
      var logged = !!(selected || text);
      var geo = null;
      var wantGeo = logged && (selected === "Visited" || (ownProspect(p) && !canReviewProspects() && !isTeamLead()));
      if (wantGeo) { toast("Getting your location…"); geo = (await captureGeo()).geo; }
      if (logged) addFollowUpEntry(p, { outcome: selected, note: combineNote({ choice: selected, text: text }), geo: geo, next: date });
      if (date !== (p.followUp || "") || action !== (p.nextAction || "")) { p.followUp = date; p.nextAction = action; stampPlan(p); }
      var n = noAnswerCount(p);
      saveData(logged ? "Follow-up saved" + (date ? " · next " + dateLabel(date) : "") + (wantGeo ? (geo ? " with location" : " (no location)") : "") : "Next follow-up planned");
      if (selected === "No answer" && n >= 3 && canDisqualify(p)) toast(n + " unanswered calls — consider disqualifying this lead.");
      render();
      // If the prospect's form is open, refresh it so the new entry shows.
      if (dialog.open && editing && editing.type === "prospect" && editing.id === id) openForm("prospect", id);
    });
    dlg.showModal(); note.focus();
  }

  // Review queue card for a pending prospect (reviewers only).
  // The 5 answers as card lines (Operations review, Team lead approval).
  function answerLines(p) {
    var v = window.VeriskoQualify.verdict(p);
    return window.VeriskoQualify.summary(p).map(function (a) {
      return '<div class="item-line"><span class="k">' + esc(a.label) + '</span><span class="v">' + (a.value ? esc(a.value) : '<span style="color:var(--muted)">not asked</span>') + "</span></div>";
    }).join("") +
      '<div class="item-line"><span class="k">Verdict</span><span class="v" style="font-weight:600;color:' + (v.ready ? "var(--green)" : "var(--amber)") + '">' +
      (v.ready ? "✓ Looks qualified" : v.missing.length ? v.answered + " of 5 answered" : esc(v.stoppers.join(" · "))) + "</span></div>";
  }
  function prospectReviewCard(p) {
    var photo = p.photoId
      ? '<button type="button" class="rev-proof" data-photo data-proof-id="' + esc(p.photoId) + '" aria-label="View business photo full screen"><span class="rev-proof-load">Loading photo…</span></button>'
      : "";
    return '<article class="card rev-card" data-id="' + p.id + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(p.business) + "</div>" +
      '<div class="item-meta">' + esc(p.vertical || "—") + " · " + esc(p.location || "No location") + "</div></div>" + stageChip(p.stage) + "</div>" +
      '<div class="item-lines"><div class="item-line"><span class="k">Contact</span><span class="v">' + esc(p.contact || "Unknown") + (p.phone ? " · " + esc(p.phone) : "") + "</span></div>" +
      '<div class="item-line"><span class="k">Added by</span><span class="v">' + esc(p.createdBy || "—") + "</span></div>" +
      '<div class="item-line"><span class="k">Location</span><span class="v">' + (p.geo ? mapLink(p.geo, "View on map") : '<span style="color:var(--muted)">not captured</span>') + "</span></div>" +
      answerLines(p) +
      (p.reviewStatus === "query" && p.reviewNote ? '<div class="item-line"><span class="k">Sent back</span><span class="v" style="color:var(--red)">' + esc(p.reviewNote) + "</span></div>" : "") + "</div>" +
      photo +
      '<div class="rev-actions"><button type="button" class="btn btn-primary" data-approve-prospect="' + p.id + '">Approve</button>' +
      '<button type="button" class="btn btn-ghost" data-sendback-prospect="' + p.id + '">Send back</button></div></article>';
  }
  function approveProspect(id) {
    if (!canReviewProspects()) return;
    var p = prospect(id); if (!p || !p.id) return;
    p.reviewStatus = "approved"; p.reviewedBy = (settings.user && settings.user.name) || ""; p.reviewedAt = today; p.reviewNote = "";
    saveData("Prospect approved"); render();
  }
  async function sendBackProspect(id) {
    if (!canReviewProspects()) return;
    var p = prospect(id); if (!p || !p.id) return;
    var r = await openSheet({ title: "Send back to the rep", body: "What needs fixing?",
      choices: ["Answer the 5 questions", "Capture the location", "Wrong details", "Add their phone number"], input: { placeholder: "Add a note (optional)" },
      requireValue: true, confirmLabel: "Send back" });
    if (!r) return;
    p.reviewStatus = "query"; p.reviewNote = combineNote(r); p.reviewedBy = (settings.user && settings.user.name) || ""; p.reviewedAt = today;
    saveData("Prospect sent back"); render();
  }

  /* ---------------- Qualified prospects (UGX 2,500, Team lead) --------------- */
  function needsQualApproval(p) { return p.qualStatus === "pending" && !p.imported; }
  function qualChip(p) {
    if (p.qualStatus === "approved") return chip("Qualified · " + money(commissionPerQualified()), "green", "✓");
    if (p.qualStatus === "pending") return chip("Awaiting team lead", "amber", "◔");
    if (p.qualStatus === "query") return chip("Qualification sent back", "red", "!");
    if (p.qualStatus === "disqualified") return chip("Disqualified", "red", "✕");
    return "";
  }
  function qualCard(p) {
    var C = window.VeriskoCommission;
    return '<article class="item tone-amber"><div class="item-top"><div><div class="item-title">' + esc(p.business) + "</div>" +
      '<div class="item-meta">' + esc(p.createdBy || "Rep") + " · " + esc(p.stage || "") + " · " + esc(p.location || "No location") + "</div></div>" + qualChip(p) + "</div>" +
      '<div class="item-lines">' +
      '<div class="item-line"><span class="k">Contact</span><span class="v">' + esc([p.contact, p.phone].filter(Boolean).join(" · ") || "—") + "</span></div>" +
      answerLines(p) +
      '<div class="item-line"><span class="k">Asked</span><span class="v">' + esc(p.qualRequestedAt ? C.label(C.eventTime(p.qualRequestedAt), true) : "—") + "</span></div>" +
      followUpSummaryLine(p) + "</div>" +
      '<div class="item-actions"><button type="button" class="btn btn-sm btn-primary" data-approve-qual="' + esc(p.id) + '">Approve (' + money(commissionPerQualified()) + ")</button>" +
      '<button type="button" class="btn btn-sm btn-ghost" data-disqualify="' + esc(p.id) + '">Disqualify</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-log-followup="' + esc(p.id) + '">Follow-up</button>' +
      (p.phone ? '<a class="btn btn-sm btn-cyan" href="' + esc(telHref(p.phone)) + '">Call</a>' : "") + "</div></article>";
  }
  function approveQualification(id) {
    if (!canApproveQual()) return;
    var p = prospect(id); if (!p || !p.id) return;
    if (!isAdmin() && (p.createdByEmail || "").toLowerCase() === ((settings.user || {}).email || "").toLowerCase()) { toast("You can't approve your own prospect — ask the Owner."); return; }
    p.qualStatus = "approved"; p.qualApprovedBy = (settings.user && settings.user.name) || ""; p.qualApprovedAt = nowIso(); p.qualNote = "";
    saveData("Approved — " + money(commissionPerQualified()) + " to " + (p.createdBy || "the rep") + " this week"); render();
  }
  // Disqualify (Team lead or Operations): the reason is picked from a list —
  // "Other" needs a written reason — and goes back to the rep. The lead moves
  // to Lost and earns no qualification commission; it can be re-opened.
  var DQ_REASONS = ["No answer after several calls", "Not interested in cameras", "Not interested in an installation", "No budget", "Not the decision-maker", "Other"];
  function canDisqualify(p) {
    if (!canApproveQual() || !p || p.closedSale) return false;
    if (p.qualStatus === "approved" || p.qualStatus === "disqualified") return false;
    return isAdmin() || !ownProspect(p);
  }
  async function disqualifyProspect(id) {
    var p = prospect(id); if (!canDisqualify(p)) return;
    var tries = noAnswerCount(p);
    var r = await openSheet({ title: "Disqualify this lead", body: p.business + " · " + (p.createdBy || "the rep") + " sees this reason." + (tries ? " " + tries + " unanswered " + (tries === 1 ? "call" : "calls") + " logged." : ""),
      choices: DQ_REASONS, input: { placeholder: "Details — required if you pick Other" },
      requireChoice: true, textFor: "Other", confirmLabel: "Disqualify", danger: true });
    if (!r) return;
    var who = (settings.user && settings.user.name) || "";
    var reason = r.choice === "Other" ? r.text : r.choice;
    p.qualStatus = "disqualified"; p.qualReason = reason; p.qualNote = r.choice === "Other" ? "" : r.text;
    p.qualApprovedBy = who; p.qualApprovedAt = ""; p.qualDecidedAt = nowIso(); p.qualSeen = false;
    p.stage = "Lost"; p.followUp = ""; p.nextAction = ""; stampPlan(p);
    addFollowUpEntry(p, { outcome: "Disqualified", note: "Disqualified — " + reason + (p.qualNote ? " — " + p.qualNote : "") });
    saveData("Disqualified — " + (p.createdBy || "the rep") + " will see why"); render();
  }
  function reopenQualification(id) {
    if (!canApproveQual()) return;
    var p = prospect(id); if (!p || !p.id || p.qualStatus !== "disqualified") return;
    p.qualStatus = ""; p.qualReason = ""; p.qualNote = ""; p.qualApprovedBy = ""; p.qualDecidedAt = ""; p.qualSeen = false;
    p.stage = "Contact attempted"; p.nextAction = "Call back"; p.followUp = today; stampPlan(p);
    addFollowUpEntry(p, { outcome: "Re-opened", note: "Re-opened — back in the pipeline" });
    saveData("Re-opened — back in " + (p.createdBy || "the rep") + "'s pipeline"); render();
  }
  function markDisqualifiedSeen(id) {
    var p = prospect(id); if (!p || !p.id) return;
    p.qualSeen = true; saveData(); render();
  }
  function unreadDisqualified(p) { return !!p && p.qualStatus === "disqualified" && !p.qualSeen; }
  function disqualifiedLine(p) {
    if (p.qualStatus !== "disqualified") return "";
    return '<div class="item-line"><span class="k">Disqualified</span><span class="v" style="color:var(--red)">' + esc(p.qualReason || "No reason given") +
      (p.qualNote ? " — " + esc(p.qualNote) : "") + (p.qualApprovedBy ? ' <span style="color:var(--muted)">· ' + esc(p.qualApprovedBy) + "</span>" : "") + "</span></div>";
  }
  function disqualifiedNoticeCard(p) {
    return '<article class="item tone-red"><div class="item-top"><div><div class="item-title">' + esc(p.business) + "</div>" +
      '<div class="item-meta">' + esc(p.location || "No location") + "</div></div>" + qualChip(p) + "</div>" +
      '<div class="item-lines">' + disqualifiedLine(p) + "</div>" +
      '<div class="item-actions"><button type="button" class="btn btn-sm btn-primary" data-qual-seen="' + esc(p.id) + '">Got it</button></div></article>';
  }

  /* ---------------- Follow-ups: call notes + the next planned date ---------- */
  function stampPlan(p) {
    if (!p) return;
    p.followUpPlannedAt = nowIso();
    p.followUpPlannedBy = (settings.user && settings.user.name) || "";
    p.followUpPlannedByEmail = ((settings.user && settings.user.email) || "").toLowerCase();
  }
  function addFollowUpEntry(p, f) {
    if (!p.followUps) p.followUps = [];
    p.followUps.push(Object.assign({ at: nowIso(), by: (settings.user && settings.user.name) || "", byEmail: (settings.user && settings.user.email) || "",
      role: ({ admin: "Admin", operations: "Operations", teamlead: "Team lead" })[(settings.user || {}).role] || "Sales", note: "", geo: null }, f));
  }
  function noAnswerCount(p) {
    return (p.followUps || []).filter(function (f) { return f && (f.outcome === "No answer" || /^No answer/i.test(f.note || "")); }).length;
  }
  function plannedByNote(p) {
    if (!p.followUp || !p.followUpPlannedByEmail) return "";
    if ((p.followUpPlannedByEmail || "").toLowerCase() === (p.createdByEmail || "").toLowerCase()) return "";
    return ' <span style="color:var(--muted)">· planned by ' + esc(p.followUpPlannedBy || "the team") + "</span>";
  }
  function followUpSummaryLine(p) {
    var fs = p.followUps || [];
    if (!fs.length) return "";
    var last = fs[fs.length - 1], na = noAnswerCount(p);
    return '<div class="item-line"><span class="k">Calls &amp; notes</span><span class="v">' + fs.length + (na ? ' · <span style="color:var(--red);font-weight:600">' + na + " unanswered</span>" : "") +
      '<br><span style="color:var(--muted)">' + esc(dateTimeLabel(last.at)) + " · " + esc(last.by || "—") + ":</span> " + esc(last.note || "") + "</span></div>";
  }

  // Record a client deposit against a prospect (Team lead or Operations/admin).
  // It counts for the rep's UGX 100,000 straight away; the Owner still
  // approves it in Cash flow as usual.
  function recordDeposit(id) {
    if (!canRecordDeposit()) return;
    var p = prospect(id); if (!p || !p.id) return;
    var first = !firstPaymentFor(p) && !p.imported;
    var dlg = document.getElementById("askDialog");
    dlg.innerHTML = '<div class="ask-head"><h2 id="askTitle">Record client deposit</h2><p class="ask-body">' + esc(p.business) +
      (first ? " · first deposit earns " + esc(p.createdBy || "the rep") + " " + money(commissionRate()) + "." : p.imported ? " · imported lead — no commission." : " · this client already has a deposit.") + "</p></div>" +
      '<div class="field"><label for="depAmount">Amount (UGX)</label><input id="depAmount" type="number" inputmode="numeric" min="1" step="1000" placeholder="e.g. 500000"></div>' +
      '<div class="field"><label for="depMethod">Method</label><select id="depMethod"><option>MTN MoMo</option><option>Airtel Money</option><option>Cash</option><option>Bank</option></select></div>' +
      '<div class="field"><label for="depDate">Date</label><input id="depDate" type="date" value="' + esc(today) + '"></div>' +
      '<p class="ask-body" id="depEcho"></p>' +
      '<div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">Cancel</button><button type="button" class="btn btn-primary" id="askOk" disabled>Record deposit</button></div>';
    var amt = dlg.querySelector("#depAmount"), ok = dlg.querySelector("#askOk"), echo = dlg.querySelector("#depEcho");
    amt.addEventListener("input", function () { var n = Math.round(Number(amt.value) || 0); ok.disabled = !(n > 0); echo.textContent = n > 0 ? "= " + money(n) : ""; });
    var onCancel = function (e) { if (e) e.preventDefault(); dlg.close(); };
    dlg.querySelector("#askCancel").addEventListener("click", onCancel);
    dlg.addEventListener("cancel", onCancel, { once: true });
    ok.addEventListener("click", function () {
      var n = Math.round(Number(amt.value) || 0); if (!(n > 0)) return;
      var q = quoteForProspect(p.id);
      if (!state.transactions) state.transactions = [];
      state.transactions.push({ id: uid(), direction: "in", amount: n, date: dlg.querySelector("#depDate").value || today, category: "Customer deposit",
        method: dlg.querySelector("#depMethod").value, prospectId: p.id, installId: q ? q.id : "", note: "", proofId: "", preapproved: false,
        createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "", createdAt: today, recordedAt: nowIso(),
        status: "pending", reviewedBy: "", reviewedAt: "", reviewNote: "" });
      dlg.close();
      saveData(first ? "Deposit recorded — " + money(commissionRate()) + " to " + (p.createdBy || "the rep") + " this week" : "Deposit recorded");
      syncClosedSales(true);
      render();
    });
    dlg.showModal(); amt.focus();
  }

  /* ---------------------------- Supabase auth ------------------------------- */
  // Verified email sign-in (6-digit code). Both values below are public.
  var SUPABASE_URL = "https://cepernltrzrmupgegcib.supabase.co";
  var SUPABASE_KEY = "sb_publishable_hj2NsI1YGmpeQg815ET2Kg_CwznowqE";

  function sbFetch(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ apikey: SUPABASE_KEY, "Content-Type": "application/json" }, opts.headers || {});
    return fetch(SUPABASE_URL + path, opts);
  }
  async function sendMagicLink(email) {
    var res = await sbFetch("/auth/v1/otp", { method: "POST", body: JSON.stringify({ email: email, create_user: true }) });
    if (!res.ok) { var e = await res.json().catch(function () { return {}; }); throw new Error(e.msg || e.error_description || "Couldn't send the sign-in link. Please try again."); }
    return true;
  }
  // After a magic link, Supabase redirects back with the session in the URL hash.
  function readAuthFromHash() {
    var h = window.location.hash || "";
    if (h.indexOf("access_token=") === -1 && h.indexOf("error") === -1) return null;
    var p = {};
    h.replace(/^#/, "").split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > -1) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
    history.replaceState(null, "", window.location.pathname + window.location.search); // strip tokens from the URL
    return p;
  }
  function emailFromJwt(token) {
    try {
      var b = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      b += "=".repeat((4 - (b.length % 4)) % 4);
      return (JSON.parse(atob(b)).email || "").toLowerCase();
    } catch (e) { return ""; }
  }
  async function refreshSession() {
    if (!settings.auth || !settings.auth.refresh_token) return false;
    try {
      var res = await sbFetch("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: settings.auth.refresh_token }) });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.access_token) return false;
      settings.auth = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, email: settings.auth.email };
      saveSettings();
      return true;
    } catch (e) { return false; }
  }

  /* -------------------------------- Sharing --------------------------------- */
  // Call the workspace API with the Supabase bearer token; refresh once on 401.
  async function apiData(method, body) {
    if (settings.auth && settings.auth.expires_at && settings.auth.expires_at * 1000 - Date.now() < 60000) await refreshSession();
    var doFetch = function () {
      return fetch("/api/data", {
        method: method,
        headers: Object.assign({ "Content-Type": "application/json" }, settings.auth ? { Authorization: "Bearer " + settings.auth.access_token } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
    };
    var res = await doFetch();
    if (res.status === 401 && await refreshSession()) res = await doFetch();
    return res;
  }

  // Returns "ok", "signin" (session invalid), "unauth" (not on team), "offline".
  async function loadShared() {
    try {
      var res = await apiData("GET");
      if (res.status === 401) return "signin";
      if (res.status === 403) {
        var why = await res.clone().json().catch(function () { return {}; });
        return why.error === "id_overdue" ? "idoverdue" : "unauth";
      }
      if (res.status >= 500) return "offline";   // a server hiccup isn't "you were removed" — keep working on the device
      var result = await res.json();
      if (!result.ok) return "unauth";
      if (result.data && result.data.prospects) {
        state = { prospects: result.data.prospects || [], appointments: result.data.appointments || [], users: result.data.users || [], transactions: result.data.transactions || [], jobs: result.data.jobs, installations: result.data.installations || [], quotes: result.data.quotes || [], technicians: result.data.technicians || [], config: normalizeConfig(result.data.config), training: result.data.training || {}, signups: result.data.signups || [] };
        migrateToJobs(state);              // fold any legacy quotes/installations the server still holds
        if (!state.jobs) state.jobs = [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
      return "ok";
    } catch (e) { return "offline"; }
  }

  async function pullShared() {
    if (!settings.auth) return;
    setSync("syncing", "Refreshing…");
    var result = await loadShared();
    if (result === "ok") { resolveUser(); setSync("connected", "Synced"); toast("Data refreshed"); syncClosedSales(true); render(); }
    else if (result === "signin") { signOutLocal(); showLogin("Your session expired. Please sign in again."); }
    else if (result === "idoverdue") showIdRequired();
    else if (result === "unauth") { var _em = settings.auth && settings.auth.email; signOutLocal(); showDenied(_em, true); }
    else { setSync("error", "Offline — using this device"); toast("Couldn't reach the workspace. Your device copy is safe."); }
  }

  async function pushShared() {
    try {
      setSync("syncing", "Saving…");
      var res = await apiData("POST", { data: state });
      var result = await res.json().catch(function () { return {}; });
      if (!res.ok || !result.ok) throw new Error();
      setSync("connected", pendingUploadCount() ? pendingUploadCount() + " photo" + (pendingUploadCount() > 1 ? "s" : "") + " waiting to upload" : "Synced");
    } catch (e) { setSync("error", "Saved on device — sync pending"); }
  }

  /* -------- Offline photo queue (IndexedDB — photos until back online) ------- */
  // Photos are large (~0.3-0.5MB each); IndexedDB avoids the ~5MB localStorage
  // cap. A small in-memory Set of pending ids lets the UI check "is a photo
  // waiting?" synchronously during render; the bytes stay in IndexedDB.
  var UPLOAD_KEY = STORAGE_KEY + "_uploads_v1"; // legacy localStorage queue (migrated once)
  var IDB_NAME = "verisko_uploads", IDB_STORE = "photos";
  var pendingSet = new Set(); // ids (transaction or prospect) with a photo waiting

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error("no-idb"));
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { var db = req.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: "id" }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbRun(mode, run) {
    return idbOpen().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, mode), store = tx.objectStore(IDB_STORE), out;
        run(store, function (v) { out = v; });
        tx.oncomplete = function () { resolve(out); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  function idbPut(id, dataUrl) { return idbRun("readwrite", function (s) { s.put({ id: id, dataUrl: dataUrl }); }); } // put replaces — one photo per id
  function idbDelete(id) { return idbRun("readwrite", function (s) { s.delete(id); }); }
  function idbGet(id) { return idbRun("readonly", function (s, set) { var r = s.get(id); r.onsuccess = function () { set(r.result || null); }; }); }
  function idbGetAll() { return idbRun("readonly", function (s, set) { var r = s.getAll(); r.onsuccess = function () { set(r.result || []); }; }); }

  function pendingUploadCount() { return pendingSet.size; }
  function hasQueuedPhoto(id) { return pendingSet.has(id); }
  function getQueuedPhoto(id) { return idbGet(id).then(function (r) { return r ? r.dataUrl : null; }).catch(function () { return null; }); }
  async function queueUpload(id, dataUrl) {
    try { await idbPut(id, dataUrl); pendingSet.add(id); }
    catch (e) { toast("Couldn't save the photo on this device."); }
  }

  // Load the queue (migrating any legacy localStorage queue) at startup.
  async function initUploadQueue() {
    try {
      var legacy = [];
      try { legacy = JSON.parse(localStorage.getItem(UPLOAD_KEY) || "[]"); } catch (e) {}
      for (var i = 0; i < legacy.length; i++) {
        if (legacy[i] && legacy[i].txId && legacy[i].dataUrl) await idbPut(legacy[i].txId, legacy[i].dataUrl);
      }
      if (legacy.length) { try { localStorage.removeItem(UPLOAD_KEY); } catch (e) {} }
      var all = await idbGetAll();
      pendingSet = new Set(all.map(function (r) { return r.id; }));
      if (pendingSet.size) render();
    } catch (e) { /* IndexedDB unavailable — degrade quietly */ }
  }

  // Upload every queued photo; attach its id to the transaction (proofId) or
  // prospect (photoId), then remove it from the queue. Returns real uploads.
  async function flushUploads() {
    if (!settings.auth || !navigator.onLine) return 0;
    var all;
    try { all = await idbGetAll(); } catch (e) { return 0; }
    if (!all.length) return 0;
    var uploaded = 0;
    for (var i = 0; i < all.length; i++) {
      var item = all[i];
      var tx = (state.transactions || []).find(function (x) { return x.id === item.id; });
      var pr = tx ? null : (state.prospects || []).find(function (x) { return x.id === item.id; });
      var target = tx || pr, field = tx ? "proofId" : "photoId";
      if (!target || target[field]) { await idbDelete(item.id); pendingSet.delete(item.id); continue; } // orphan / already set
      try { target[field] = await uploadProof(item.dataUrl); await idbDelete(item.id); pendingSet.delete(item.id); uploaded++; }
      catch (e) { /* still offline / failing — keep for next time */ }
    }
    if (uploaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return uploaded;
  }

  // Push local changes and flush queued photos — called on reconnect.
  var syncing = false;
  async function syncNow() {
    if (syncing || !settings.auth || !navigator.onLine) return;
    syncing = true;
    try {
      var n = await flushUploads();
      await pushShared();
      if (n) { toast(n + " photo" + (n > 1 ? "s" : "") + " uploaded"); render(); }
    } finally { syncing = false; }
  }

  /* ------------------------------- Access gate ------------------------------ */
  var lockScreen = document.getElementById("lockScreen");
  var lockCard = document.getElementById("lockCard");
  var userChip = document.getElementById("userChip");
  var userMenu = document.getElementById("userMenu");
  var loginEmail = "";   // remembered between the two login steps

  function currentUser() { return settings.user || null; }
  function isAdmin() { return !!(settings.user && settings.user.role === "admin"); }
  function isTeamLead() { return !!(settings.user && settings.user.role === "teamlead"); }
  // The Team lead (and the Owner/Technical) approve qualified prospects.
  function canApproveQual() { return canReviewProspects() || isTeamLead(); }
  // Client deposits can be recorded by the Team lead and Operations/admin.
  function canRecordDeposit() { return canCashflow() || isTeamLead(); }
  function canCashflow() { return isAdmin() || !!(settings.user && settings.user.role === "operations"); }
  // How many cash entries need THIS person's attention: admins review pending
  // entries; operations act on their own sent-back ones.
  function reviewCount() {
    var txs = state.transactions || [];
    if (isAdmin()) return txs.filter(function (t) { return t.status === "pending"; }).length;
    if (canCashflow()) {
      var mine = (settings.user && settings.user.email || "").toLowerCase();
      return txs.filter(function (t) { return t.status === "query" && (t.createdByEmail || "").toLowerCase() === mine; }).length;
    }
    return 0;
  }
  function updateCashBadge() {
    var b = document.getElementById("cashBadge");
    if (!b) return;
    var n = canCashflow() ? reviewCount() : 0;
    b.textContent = n > 9 ? "9+" : String(n);
    b.hidden = n === 0;
  }
  function initials(name) {
    var p = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    return (p[0][0] + (p[1] ? p[1][0] : "")).toUpperCase();
  }

  function gate() {
    if (settings.auth && settings.user) showApp();
    else showLogin();
  }
  function showApp() {
    lockScreen.hidden = true;
    closeUserMenu();
    document.body.classList.remove("locked");
    applyRole();
    renderUserChip();
    render();
  }
  function showLogin(message) {
    userChip.hidden = true; closeUserMenu();
    document.body.classList.add("locked");
    renderLogin("pin", message);
    lockScreen.hidden = false;
  }
  var deniedRemoved = false;
  // Friendly "you're not on the team" (or "access removed") screen.
  function showDenied(email, removed) {
    loginEmail = email || loginEmail;
    deniedRemoved = !!removed;
    userChip.hidden = true; closeUserMenu();
    document.body.classList.add("locked");
    renderLogin("denied");
    lockScreen.hidden = false;
  }
  function signOutLocal() { settings.auth = null; settings.user = null; saveSettings(); }

  /* -------- Email magic-link login -------- */
  function renderLogin(step, message) {
    var errHtml = message ? '<p class="lock-error">' + esc(message) + "</p>" : '<p class="lock-error" id="loginError" role="alert" hidden></p>';
    var html;
    if (step === "denied") {
      html = '<div class="onb-icon warn" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg></div>';
    } else if (step === "sent" || step === "name") {
      html = '<img class="lock-mark" src="logo.svg" alt="" aria-hidden="true">';
    } else {
      html = '<div class="lockup lockup-lg" role="img" aria-label="Verisko"><img class="lockup-mark" src="logo.svg" alt=""><span class="lockup-word">VERISKO</span></div>';
    }
    if (step === "denied") {
      html += '<h1 id="lockTitle">' + (deniedRemoved ? "Access was removed" : "You're not on the team yet") + "</h1>" +
        '<p class="lock-sub">' + (deniedRemoved
          ? "Your access to this workspace was removed. If you still need it, ask the owner to add <strong>" + esc(loginEmail) + "</strong> again."
          : "The email <strong>" + esc(loginEmail) + "</strong> hasn't been approved for this workspace yet. Ask your team's owner to add it in <strong>Settings → Team members</strong>, then sign in again.") + "</p>" +
        '<p class="lock-help">This keeps your team\'s data private — only approved emails can get in.</p>' +
        '<button type="button" class="btn btn-primary btn-block" data-login-restart>Try a different email</button>';
    } else if (step === "sent") {
      html += '<h1 id="lockTitle">Check your email</h1>' +
        '<p class="lock-sub">We sent a sign-in link to <strong>' + esc(loginEmail) + "</strong>. Open the email on this device and tap <strong>Sign in</strong> — you'll come right back here, signed in.</p>" +
        errHtml +
        '<button type="button" class="btn btn-ghost btn-block" data-login-resend id="loginBtn">Resend the link</button>' +
        '<button type="button" class="account-back" data-login-restart>Use a different email</button>';
    } else if (step === "name") {
      html += '<h1 id="lockTitle">Welcome — you\'re the owner</h1>' +
        '<p class="lock-sub">You\'re the first person here. What\'s your name?</p>' +
        '<form id="loginForm" class="account-fields" data-step="name">' +
        '<div class="field"><label for="ownerName">Your name</label>' +
        '<input id="ownerName" name="name" type="text" autocomplete="name" placeholder="e.g. Benard Serunyigo" required></div>' +
        errHtml +
        '<button type="submit" class="btn btn-primary btn-block" id="loginBtn">Continue</button></form>';
    } else if (step === "signingIn") {
      html += '<h1 id="lockTitle">Signing you in…</h1><p class="lock-sub">One moment while we open your workspace.</p>';
    } else if (step === "pin") {
      var known = settings.lastPhone ? { phone: settings.lastPhone, first: settings.lastFirst || "" } : null;
      html += '<p class="lock-eyebrow" id="lockTitle">Uganda Operations</p>' +
        (known ? '<p class="lock-sub">Welcome back' + (known.first ? ", <strong>" + esc(known.first) + "</strong>" : "") + ". Enter your PIN.</p>" : '<p class="lock-sub">Sign in with your phone number and PIN.</p>') +
        '<form id="loginForm" class="account-fields" data-step="pin">' +
        '<div class="field"' + (known ? " hidden" : "") + '><label for="pinPhone">Phone number</label>' +
        '<input id="pinPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0772 123 456" value="' + esc(known ? known.phone : "") + '" required></div>' +
        '<div class="field"><label for="pinInput">PIN</label>' +
        '<input id="pinInput" name="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="current-password" placeholder="••••" required></div>' +
        errHtml +
        '<button type="submit" class="btn btn-primary btn-block" id="loginBtn">Sign in</button></form>' +
        '<div class="login-links">' +
        (known ? '<button type="button" class="account-back" data-login-notme>Not you? Use another number</button>' : "") +
        '<button type="button" class="account-back" data-login-step="forgot">Forgot PIN?</button>' +
        '<button type="button" class="account-back" data-login-step="signup">Got an invite? <strong>Join the team</strong></button>' +
        '<button type="button" class="account-back" data-login-step="email">Sign in with email instead</button></div>';
    } else if (step === "signup") {
      var inv = pendingInvite;
      html += '<h1 id="lockTitle">Join the Verisko team</h1>' +
        (inv && inv.info ? '<p class="lock-sub">' + esc(inv.info.invitedBy || "Your manager") + " invited you to join as <strong>" + esc(inv.info.roleLabel) + "</strong>.</p>"
          : '<p class="lock-sub">Joining is by invite only. Enter the code from your invite message.</p>') +
        '<form id="loginForm" class="account-fields signup-form" data-step="signup">' +
        '<div class="field"' + (inv && inv.info ? " hidden" : "") + '><label for="suCode">Invite code</label><input id="suCode" name="invite" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="12" placeholder="e.g. K7PM2QXA" value="' + esc(inv ? inv.code : "") + '"></div>' +
        '<div class="field"><label for="suName">Full name (as on your National ID)</label><input id="suName" name="legalName" type="text" autocomplete="name" autocapitalize="words" placeholder="e.g. Nansubuga Beatrice" required></div>' +
        '<div class="field"><label for="suPhone">Your phone number</label><input id="suPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0772 123 456" required>' +
        (inv && inv.info ? '<p class="helper">The number your invite was sent to (ends in ' + esc(inv.info.phoneEnd) + ").</p>" : "") + "</div>" +
        '<div class="field"><label>Take a selfie</label>' +
        '<label class="selfie-shot" for="suSelfie"><span class="selfie-img" id="suSelfiePrev">📷<br>Tap to take a selfie</span><input id="suSelfie" type="file" accept="image/*" capture="user" hidden></label>' +
        '<p class="helper">So we know it\'s really you. Face the camera in good light.</p></div>' +
        '<div class="field"><label for="suPin">Choose a 4-digit PIN</label><input id="suPin" name="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="••••" required></div>' +
        '<div class="field"><label for="suPin2">Enter the PIN again</label><input id="suPin2" name="pin2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="••••" required></div>' +
        '<label class="consent"><input type="checkbox" name="consent" required> <span>I agree that Verisko keeps my name, phone number and selfie — and, later, my National ID — to check who I am for work. Only the Owner and Operations can see them.</span></label>' +
        errHtml +
        '<button type="submit" class="btn btn-primary btn-block" id="loginBtn">Join</button></form>' +
        '<p class="lock-help">After joining you have <strong>5 days</strong> to add your National ID in the app.</p>' +
        '<button type="button" class="account-back" data-login-step="pin">I already have an account — sign in</button>';
    } else if (step === "signupDone") {
      html += '<h1 id="lockTitle">Thank you' + (loginFirst ? ", " + esc(loginFirst) : "") + "!</h1>" +
        '<p class="lock-sub">Your details were sent to your manager. Once they approve you, sign in here with your <strong>phone number and PIN</strong>.</p>' +
        '<button type="button" class="btn btn-primary btn-block" data-login-step="pin">Back to sign in</button>';
    } else if (step === "pending") {
      html += '<h1 id="lockTitle">Waiting for approval</h1>' +
        '<p class="lock-sub">Your sign-up hasn\'t been approved yet. Ask your manager to approve it, then sign in again.</p>' +
        '<button type="button" class="btn btn-primary btn-block" data-login-step="pin">Back to sign in</button>';
    } else if (step === "forgot") {
      html += '<h1 id="lockTitle">Reset your PIN</h1>' +
        '<p class="lock-sub">Ask your manager (the Owner or Operations) to reset your PIN. They\'ll send you a 6-digit code.</p>' +
        '<form id="loginForm" class="account-fields" data-step="forgot">' +
        '<div class="field"><label for="fgPhone">Phone number</label><input id="fgPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0772 123 456" value="' + esc(settings.lastPhone || "") + '" required></div>' +
        '<div class="field"><label for="fgCode">6-digit code from your manager</label><input id="fgCode" name="code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="123456" required></div>' +
        '<div class="field"><label for="fgPin">New 4-digit PIN</label><input id="fgPin" name="pin" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="••••" required></div>' +
        '<div class="field"><label for="fgPin2">Enter the new PIN again</label><input id="fgPin2" name="pin2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="••••" required></div>' +
        errHtml +
        '<button type="submit" class="btn btn-primary btn-block" id="loginBtn">Set new PIN and sign in</button></form>' +
        '<button type="button" class="account-back" data-login-step="pin">Back to sign in</button>';
    } else {
      html += '<p class="lock-eyebrow" id="lockTitle">Uganda Operations</p>' +
        '<p class="lock-sub">Sign in with your email — we\'ll send you a secure sign-in link.</p>' +
        '<form id="loginForm" class="account-fields" data-step="email">' +
        '<div class="field"><label for="loginEmailInput">Email</label>' +
        '<input id="loginEmailInput" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="' + esc(loginEmail) + '" required></div>' +
        errHtml +
        '<button type="submit" class="btn btn-primary btn-block" id="loginBtn">Email me a sign-in link</button></form>' +
        '<p class="lock-help">Ask the owner to add your email if you can\'t get in.</p>' +
        '<button type="button" class="account-back" data-login-step="pin">Sign in with phone and PIN instead</button>';
    }
    lockCard.innerHTML = html;
    var first = lockCard.querySelector("input:not([hidden]):not([type=file]):not([type=checkbox])");
    if (first && first.offsetParent) first.focus();
    if (step === "signup") bindPhotoPick("suSelfie", "suSelfiePrev", "selfie", 900);
  }
  function loginError(msg) {
    var el = lockCard.querySelector("#loginError") || lockCard.querySelector(".lock-error");
    if (el) { el.textContent = msg; el.hidden = false; }
  }
  function loginBusy(on, label) {
    var b = lockCard.querySelector("#loginBtn");
    if (b) { b.disabled = on; if (label) b.textContent = label; }
  }

  lockCard.addEventListener("click", async function (e) {
    if (e.target.closest("[data-login-restart]")) { renderLogin("email"); return; }
    var ls = e.target.closest("[data-login-step]"); if (ls) { renderLogin(ls.getAttribute("data-login-step")); return; }
    if (e.target.closest("[data-login-notme]")) { settings.lastPhone = ""; settings.lastFirst = ""; saveSettings(); renderLogin("pin"); return; }
    if (e.target.closest("[data-login-resend]")) {
      loginBusy(true, "Sending…");
      try { await sendMagicLink(loginEmail); loginBusy(false, "Resend the link"); toast("Sign-in link sent again"); }
      catch (err) { loginBusy(false, "Resend the link"); loginError(err.message); }
    }
  });
  lockCard.addEventListener("submit", async function (e) {
    var form = e.target.closest("#loginForm");
    if (!form) return;
    e.preventDefault();
    var step = form.getAttribute("data-step");
    if (step === "pin") {
      var phone = form.querySelector("[name=phone]").value.trim(), pin = form.querySelector("[name=pin]").value.trim();
      if (!phone || !/^\d{4}$/.test(pin)) { loginError("Enter your phone number and your 4-digit PIN."); return; }
      loginBusy(true, "Signing in…");
      var r = await authApi({ action: "login", phone: phone, pin: pin }, true);
      if (r.ok) return afterPinSignIn(phone, r);
      loginBusy(false, "Sign in");
      if (r.error === "pending") { renderLogin("pending"); return; }
      form.querySelector("[name=pin]").value = "";
      loginError(r.error || "Couldn't sign in. Check your connection and try again.");
      return;
    }
    if (step === "forgot") {
      var fp = form.querySelector("[name=phone]").value.trim(), code = form.querySelector("[name=code]").value.trim();
      var np = form.querySelector("[name=pin]").value.trim(), np2 = form.querySelector("[name=pin2]").value.trim();
      if (np !== np2) { loginError("The two PINs don't match."); return; }
      loginBusy(true, "Saving…");
      var fr = await authApi({ action: "resetWithCode", phone: fp, code: code, pin: np }, true);
      if (fr.ok) return afterPinSignIn(fp, fr);
      loginBusy(false, "Set new PIN and sign in");
      loginError(fr.error === "pending" ? "Your sign-up is still waiting for approval." : (fr.error || "Couldn't reset your PIN."));
      return;
    }
    if (step === "signup") {
      var g = function (n) { var el = form.querySelector("[name=" + n + "]"); return el ? el.value.trim() : ""; };
      if (!g("invite")) { loginError("Enter the invite code from your invite message."); return; }
      if (g("pin") !== g("pin2")) { loginError("The two PINs don't match."); return; }
      if (!photoPicks.selfie) { loginError("Take a selfie so we know it's you."); return; }
      if (!form.querySelector("[name=consent]").checked) { loginError("Please tick the box to agree."); return; }
      loginBusy(true, "Joining…");
      var sr = await authApi({ action: "signup", invite: g("invite"), legalName: g("legalName"), phone: g("phone"), pin: g("pin"), selfie: photoPicks.selfie, consent: true }, true);
      if (sr.ok) { photoPicks = {}; pendingInvite = null; return afterPinSignIn(g("phone"), sr); }
      loginBusy(false, "Join");
      loginError(sr.error || "Couldn't join. Check your connection and try again.");
      return;
    }
    if (step === "email") {
      loginEmail = form.querySelector("[name=email]").value.trim().toLowerCase();
      if (!loginEmail) return;
      loginBusy(true, "Sending…");
      try { await sendMagicLink(loginEmail); renderLogin("sent"); }
      catch (err) { loginBusy(false, "Email me a sign-in link"); loginError(err.message); }
    } else if (step === "name") {
      var name = form.querySelector("[name=name]").value.trim();
      if (!name) return;
      var owner = { id: uid(), name: name, email: loginEmail, role: "admin", created: today };
      if (!state.users) state.users = [];
      state.users.push(owner);
      settings.user = owner; saveSettings();
      saveData();
      toast("Welcome, " + name.split(/\s+/)[0] + "!");
      enterApp();
    }
  });


  /* ---------------- Problem reports (why didn't the app open?) -------------- */
  // Any crash, and any failure right after signing in, is reported to the
  // server (/api/auth clientError → the export's "diagnostics" table) with the
  // phone's browser details, and the person sees a clear screen instead of
  // being dropped back on the sign-in page.
  var APP_VERSION = "v68";
  var reportsSent = 0;
  function reportProblem(where, err) {
    if (reportsSent >= 5) return;
    reportsSent++;
    try {
      fetch("/api/auth", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clientError", where: where, message: String((err && (err.message || err)) || "unknown"), stack: String((err && err.stack) || ""),
          email: (settings && settings.auth && settings.auth.email) || loginEmail || "", app: APP_VERSION, view: typeof view === "string" ? view : "", online: navigator.onLine }) }).catch(function () {});
    } catch (e) { /* never let reporting break anything */ }
  }
  window.addEventListener("error", function (e) { reportProblem("crash", e.error || e.message); });
  window.addEventListener("unhandledrejection", function (e) { reportProblem("promise", e.reason); });
  function storageWorks() {
    try { localStorage.setItem("verisko_probe", "1"); localStorage.removeItem("verisko_probe"); return true; } catch (e) { return false; }
  }
  // Shown when the app can't open on this phone (after reporting it).
  function showOpenProblem(where, err) {
    reportProblem(where, err);
    var blocked = !storageWorks();
    userChip.hidden = true; closeUserMenu();
    document.getElementById("onboarding").hidden = true;
    document.body.classList.add("locked");
    lockScreen.hidden = false;
    lockCard.innerHTML = '<div class="onb-icon warn" aria-hidden="true">!</div>' +
      '<h1 id="lockTitle">We couldn\'t open the app on this phone</h1>' +
      (blocked
        ? '<p class="lock-sub">This browser is blocking the app from saving on your phone. Turn off <strong>private / incognito</strong> mode, or allow cookies and site data for this site, then try again.</p>'
        : '<p class="lock-sub">You signed in, but something on this phone stopped the app from opening. The details were sent to the Verisko team.</p>' +
          '<p class="lock-help">Meanwhile: update Chrome or Safari, or try on another phone or a computer.</p>') +
      '<p class="lock-help" style="font-size:12px;color:var(--faint)">' + esc(String((err && (err.message || err)) || "").slice(0, 140)) + "</p>" +
      '<button type="button" class="btn btn-primary btn-block" id="openRetry">Try again</button>' +
      '<button type="button" class="account-back" id="openSignOut">Sign in again</button>';
    lockCard.querySelector("#openRetry").addEventListener("click", function () { location.reload(); });
    lockCard.querySelector("#openSignOut").addEventListener("click", function () { try { signOutLocal(); } catch (e) {} location.reload(); });
  }

  /* -------- Staff phone + PIN sign-in (see netlify/functions/auth.mjs) -------- */
  var loginFirst = "";
  // quiet: never throw; returns the JSON body (ok:false + error on failure).
  async function authApi(body, quiet) {
    try {
      var res = await fetch("/api/auth", { method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, settings.auth ? { Authorization: "Bearer " + settings.auth.access_token } : {}),
        body: JSON.stringify(body) });
      var j = await res.json().catch(function () { return {}; });
      if (!res.ok && !j.error) j.error = "Something went wrong (" + res.status + ").";
      return res.ok ? j : Object.assign({ ok: false }, j);
    } catch (e) { return { ok: false, error: "You're offline. Check your connection and try again." }; }
  }
  var photoPicks = {};
  var pendingInvite = null;     // { code, info } from an invite link
  // A camera/photo input with a preview; the resized image lands in photoPicks[key].
  function bindPhotoPick(inputId, prevId, key, maxDim) {
    var input = document.getElementById(inputId), prev = document.getElementById(prevId);
    if (!input || !prev) return;
    input.addEventListener("change", async function () {
      var f = input.files && input.files[0]; if (!f) return;
      try {
        var url = await resizeImage(f, maxDim || 1400, 0.8);
        photoPicks[key] = url;
        prev.innerHTML = '<img src="' + url + '" alt="">';
        prev.classList.add("has-img");
      } catch (e) { toast("Couldn't read that photo — try again."); }
    });
  }
  async function afterPinSignIn(phone, r) {
    try { await finishPinSignIn(phone, r); } catch (err) { showOpenProblem("pin-sign-in", err); }
  }
  async function finishPinSignIn(phone, r) {
    settings.auth = { access_token: r.token, expires_at: r.expiresAt, email: r.user.email, kind: "pin" };
    settings.lastPhone = phone; settings.lastFirst = String(r.user.name || "");   // full name (surname-first on IDs)
    saveSettings();
    var s = await loadShared();
    if (s === "idoverdue") { showIdRequired(); return; }
    if (s !== "ok") { signOutLocal(); renderLogin("pin", "Signed in, but the workspace is unreachable. Check your connection."); return; }
    var me = (state.users || []).find(function (u) { return u.id === r.user.id; });
    if (!me) { signOutLocal(); renderLogin("pending"); return; }
    settings.user = me; saveSettings();
    toast("Signed in as " + me.name);
    enterApp();
  }


  async function afterVerify(email, session) {
    try {
      settings.auth = { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, email: email };
      saveSettings();
      var s = await loadShared();
      if (s === "unauth") { signOutLocal(); showDenied(email, false); return; }
      if (s === "signin") { signOutLocal(); renderLogin("email", "That sign-in link has expired or was already used. Enter your email to get a new one."); reportProblem("email-link-401", "session rejected by the server"); return; }
      if (s === "idoverdue") { showIdRequired(); return; }
      if (s === "offline") { renderLogin("email", "Signed in, but the workspace is unreachable. Check your connection and tap the link again."); reportProblem("email-link-offline", "data load failed after sign-in"); return; }
      var existing = (state.users || []).find(function (u) { return String(u.email || "").toLowerCase() === email.toLowerCase(); });
      if (existing) { settings.user = existing; saveSettings(); toast("Signed in as " + existing.name.split(/\s+/)[0]); enterApp(); return; }
      if ((state.users || []).length === 0) { renderLogin("name"); return; } // bootstrap the owner
      signOutLocal(); showDenied(email, false);
    } catch (err) { showOpenProblem("email-sign-in", err); }
  }


  // Refresh the local identity from the shared team list (handles rename/removal).
  function resolveUser() {
    if (!settings.auth) return;
    var u = (state.users || []).find(function (x) { return x.email.toLowerCase() === settings.auth.email.toLowerCase(); });
    if (u) { settings.user = u; saveSettings(); }
    else if ((state.users || []).length) { var _em = settings.auth && settings.auth.email; signOutLocal(); showDenied(_em, true); }
  }

  /* -------- Onboarding / welcome tour -------- */
  var ONB_STEPS = [
    { welcome: true, title: "Welcome to Verisko Operations", body: "One place for the whole Verisko team to run the business — leads and site visits, cash flow, installations and payments, all connected, on your phone." },
    { icon: ICON_CALENDAR, title: "Start on Today", body: "Today shows what needs you now — a call, a visit, an approval — most urgent first. Work from the top down." },
    { icon: ICON_PEOPLE, title: "You see what your role needs", body: "The app shows each person only their part of the work. As the team grows — sales, operations, installers, accounts — everyone works from the same connected records." },
    { icon: ICON_INSTALL, title: "Quick taps, saved for everyone", body: "Most things are a tap, not typing. Add with the + button; your work saves and syncs to the team automatically — and keeps working offline." }
  ];
  var onbScreen = document.getElementById("onboarding");
  var onbCard = document.getElementById("onbCard");
  var onbStep = 0;

  function enterApp() { if (settings.onboarded) showApp(); else showOnboarding(); }
  function showOnboarding() {
    onbStep = 0;
    lockScreen.hidden = true;
    userChip.hidden = true; closeUserMenu();
    document.body.classList.add("locked");
    renderOnboarding();
    onbScreen.hidden = false;
  }
  function finishOnboarding() {
    settings.onboarded = true; saveSettings();
    onbScreen.hidden = true;
    showApp();
  }
  function renderOnboarding() {
    var s = ONB_STEPS[onbStep];
    var last = onbStep === ONB_STEPS.length - 1;
    var mark = s.welcome
      ? '<div class="lockup lockup-lg" role="img" aria-label="Verisko"><img class="lockup-mark" src="logo.svg" alt=""><span class="lockup-word">VERISKO</span></div>'
      : '<div class="onb-icon" aria-hidden="true">' + s.icon + "</div>";
    onbCard.innerHTML =
      '<button type="button" class="onb-skip" data-onb-skip>' + (last ? "" : "Skip") + "</button>" + mark +
      '<h1 class="onb-title">' + esc(s.title) + "</h1>" +
      '<p class="onb-body">' + esc(s.body) + "</p>" +
      '<div class="onb-dots" aria-hidden="true">' + ONB_STEPS.map(function (_, k) { return '<span class="onb-dot' + (k === onbStep ? " on" : "") + '"></span>'; }).join("") + "</div>" +
      '<button type="button" class="btn btn-primary btn-block" data-onb-next>' + (last ? "Get started" : "Next") + "</button>";
  }
  onbCard.addEventListener("click", function (e) {
    if (e.target.closest("[data-onb-skip]")) { finishOnboarding(); return; }
    if (e.target.closest("[data-onb-next]")) {
      if (onbStep >= ONB_STEPS.length - 1) finishOnboarding();
      else { onbStep++; renderOnboarding(); }
    }
  });
  function replayOnboarding() { closeUserMenu(); showOnboarding(); }

  /* -------- Header user chip + menu -------- */
  function renderUserChip() {
    var u = settings.user;
    if (!u) { userChip.hidden = true; return; }
    userChip.hidden = false;
    userChip.setAttribute("aria-label", "Account: " + u.name);
    document.getElementById("userAvatar").textContent = initials(u.name);
    document.getElementById("userMenuAvatar").textContent = initials(u.name);
    document.getElementById("userMenuName").textContent = u.name + " · " + roleName(u);
    document.getElementById("userMenuEmail").textContent = contactOf(u);
  }
  // How to reach a team member: email, or phone for PIN sign-in accounts.
  function contactOf(u) { return u && u.authMethod === "pin" ? (u.phone || "") + " · " + (idStatusLabel(u) || "PIN sign-in") : (u && u.email) || ""; }
  function closeUserMenu() { userMenu.hidden = true; userChip.setAttribute("aria-expanded", "false"); }
  userChip.addEventListener("click", function (e) {
    e.stopPropagation();
    if (userMenu.hidden) { userMenu.hidden = false; userChip.setAttribute("aria-expanded", "true"); }
    else closeUserMenu();
  });
  document.addEventListener("click", function (e) {
    if (!userMenu.hidden && !userMenu.contains(e.target) && !userChip.contains(e.target)) closeUserMenu();
  });
  userMenu.addEventListener("click", function (e) {
    if (e.target.closest("[data-howto]")) { replayOnboarding(); return; }
    if (e.target.closest("[data-logout]")) logout();
  });

  async function logout() {
    try { if (settings.auth) await sbFetch("/auth/v1/logout", { method: "POST", headers: { Authorization: "Bearer " + settings.auth.access_token } }); } catch (e) {}
    signOutLocal();
    closeUserMenu();
    view = "today";
    loginEmail = "";
    showLogin();
  }

  // Which "More" destinations apply to the current role.
  // Sidebar layout (matches the 860px breakpoint in app.css).
  var wideMq = window.matchMedia ? window.matchMedia("(min-width: 860px)") : null;
  function isWideLayout() { return !!(wideMq && wideMq.matches); }
  if (wideMq) {
    var onWideChange = function () { if (settings.user) { applyRole(); updateNavActive(); } };
    if (wideMq.addEventListener) wideMq.addEventListener("change", onWideChange); else if (wideMq.addListener) wideMq.addListener(onWideChange);
  }
  function moreViewsForRole() {
    var v = [];
    if (canInstalls()) { v.push("jobs"); v.push("cashflow"); }
    if (supportInMore()) v.push("support");
    if (isAdmin()) v.push("settings");
    return v;
  }
  function applyRole() {
    // Operations/admin extras (cash flow, installs, settings) live in "More",
    // so they're always hidden from the bar itself; the More button reveals them.
    MORE_VIEWS.forEach(function (v) {
      var btn = document.querySelector('.mainnav .nav-item[data-view="' + v + '"]');
      if (btn) btn.hidden = true;
    });
    // Support centre: its own tab for Sales and the Team lead; in More for
    // Operations/admin, whose bar is already full.
    var supBtn = document.querySelector('.mainnav .nav-item[data-view="support"]');
    if (supBtn) supBtn.hidden = supportInMore();
    var moreBtn = document.querySelector(".mainnav [data-more]");
    if (moreBtn) moreBtn.hidden = moreViewsForRole().length === 0;
    // On a computer or tablet (sidebar layout) there's room for everything:
    // list every screen this role can open and drop "More".
    if (isWideLayout()) {
      moreViewsForRole().forEach(function (v) {
        var b = document.querySelector('.mainnav .nav-item[data-view="' + v + '"]');
        if (b) b.hidden = false;
      });
      if (moreBtn) moreBtn.hidden = true;
    }
    if (view === "settings" && !isAdmin()) view = "today";
    if ((view === "cashflow" || view === "jobs") && !canInstalls()) view = "today";
    updateNavActive();
  }
  function openMoreMenu() {
    var views = moreViewsForRole();
    if (!views.length) return;
    var dlg = document.getElementById("askDialog");
    dlg.innerHTML = '<div class="ask-head"><h2 id="askTitle">More</h2></div><div class="more-list">' +
      views.map(function (v) {
        var btn = document.querySelector('.mainnav .nav-item[data-view="' + v + '"]');
        var icon = btn && btn.querySelector(".nav-icon") ? btn.querySelector(".nav-icon").outerHTML : "";
        var label = btn && btn.querySelector(".nav-label") ? btn.querySelector(".nav-label").textContent : v;
        return '<button type="button" class="more-item" data-goview="' + v + '">' + icon + "<span>" + esc(label) + "</span></button>";
      }).join("") + "</div><div class=\"ask-actions\"><button type=\"button\" class=\"btn btn-ghost btn-block\" id=\"askCancel\">Close</button></div>";
    var onCancel = function (e) { if (e) e.preventDefault(); finish(); };
    function finish() { dlg.removeEventListener("cancel", onCancel); dlg.close(); }
    dlg.querySelector("#askCancel").addEventListener("click", finish);
    dlg.querySelectorAll("[data-goview]").forEach(function (b) {
      b.addEventListener("click", function () { view = b.getAttribute("data-goview"); finish(); render(); document.getElementById("main").focus(); });
    });
    dlg.addEventListener("cancel", onCancel);
    dlg.showModal();
    var first = dlg.querySelector(".more-item"); if (first) first.focus();
  }

  // The first member on the workspace is the owner (protected).
  function ownerId() { return (state.users && state.users[0]) ? state.users[0].id : null; }
  function roleName(u) {
    if (u.id === ownerId()) return "Owner";
    if (u.role === "admin") return "Technical";
    if (u.role === "operations") return "Operations";
    if (u.role === "teamlead") return "Team lead";
    return "Sales";
  }

  // Normalise a role input to one of: admin (Technical), operations, teamlead, sales.
  function normRole(role) { return role === "admin" ? "admin" : role === "operations" ? "operations" : role === "teamlead" ? "teamlead" : "sales"; }

  // Who may manage the roster: admins (everyone) and Operations (non-admins only).
  // Operations can never touch the Owner, Technical accounts, or their own row,
  // and can never grant Technical (admin) — that stops privilege escalation.
  function actorCanManage(u) {
    if (!u || !canReviewProspects()) return false;
    if (u.id === ownerId()) return false;
    if (settings.user && u.id === settings.user.id) return false;
    if (!isAdmin() && u.role === "admin") return false;
    return true;
  }

  // Add a teammate by email with a role: sales, operations, or admin (Technical).
  function addMember(name, email, role) {
    if (!canReviewProspects()) return false;
    name = (name || "").trim(); email = (email || "").trim().toLowerCase();
    role = normRole(role);
    if (!isAdmin() && role === "admin") role = "sales"; // Operations can't create admins
    if (!name || !email) { toast("Enter a name and email."); return false; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Enter a valid email."); return false; }
    if ((state.users || []).some(function (u) { return u.email.toLowerCase() === email; })) { toast("That email is already on the team."); return false; }
    if (!state.users) state.users = [];
    var user = { id: uid(), name: name, email: email, role: role, created: today };
    state.users.push(user);
    saveData();
    render();
    toast(name.split(/\s+/)[0] + " added as " + roleName(user));
    return true;
  }

  // Change a member's role (Sales / Operations / Technical).
  function setMemberRole(id, role) {
    var u = (state.users || []).find(function (x) { return x.id === id; });
    if (!u) return;
    if (!actorCanManage(u)) { toast("You can't change that member's role."); return; }
    role = normRole(role);
    if (!isAdmin() && role === "admin") { toast("Only the Owner can grant Technical access."); return; }
    u.role = role;
    saveData();
    render();
    toast(u.name.split(/\s+/)[0] + " is now " + roleName(u));
  }

  // Remove a team member (airtight offboarding — they lose access at once).
  async function removeUser(id) {
    var u = (state.users || []).find(function (x) { return x.id === id; });
    if (!u) return;
    if (!actorCanManage(u)) {
      toast(u.id === ownerId() ? "The owner account can't be removed." : (settings.user && u.id === settings.user.id) ? "You can't remove your own account." : "You can't remove that member.");
      return;
    }
    if (u.authMethod === "pin") {
      if (!(await confirmSheet("Remove " + u.name + "?", "They're signed out on every phone at once and can't sign in again. Their records stay. To come back, they sign up again and you approve them.", "Remove", true))) return;
      var rr = await authApi({ action: "remove", userId: id }, true);
      if (!rr.ok) { toast(rr.error || "Couldn't remove them."); return; }
      await pullShared();
      toast(u.name.split(/\s+/)[0] + " removed from the team");
      return;
    }
    if (!(await confirmSheet("Remove " + u.name + "?", u.email + " loses access immediately and can't sign in again unless you re-add them. This can't be undone.", "Remove", true))) return;
    state.users = state.users.filter(function (x) { return x.id !== id; });
    saveData();
    render();
    toast(u.name.split(/\s+/)[0] + " removed from the team");
  }


  /* ---- National ID within 5 days of joining (PIN staff) ---- */
  function myIdState() {
    var u = settings.user || {};
    if (u.authMethod !== "pin" || !(u.idStatus === "needed" || u.idStatus === "redo")) return null;
    var due = Date.parse(u.idDueAt || ""), left = isNaN(due) ? null : Math.ceil((due - Date.now()) / 864e5);
    return { status: u.idStatus, note: u.idNote || "", daysLeft: left };
  }
  function idNotice() {
    var st = myIdState();
    if (!st) return "";
    var when = st.daysLeft == null ? "" : st.daysLeft <= 0 ? "today" : st.daysLeft === 1 ? "by tomorrow" : "within " + st.daysLeft + " days";
    return '<section class="card id-notice' + (st.daysLeft != null && st.daysLeft <= 1 ? " is-urgent" : "") + '"><div><strong>' +
      (st.status === "redo" ? "Please add your National ID again" : "Finish joining: add your National ID") + "</strong>" +
      '<div class="settings-note">' + (st.note ? "Reason: " + esc(st.note) + ". " : "") + "Add it " + esc(when) + " or the app will lock until you do.</div></div>" +
      '<button type="button" class="btn btn-sm btn-primary" data-add-id>Add ID</button></section>';
  }
  function idFormHtml(title, intro) {
    return '<h1 id="lockTitle" class="id-form-title">' + esc(title) + "</h1>" +
      '<p class="lock-sub">' + intro + "</p>" +
      '<form id="idForm" class="account-fields signup-form">' +
      '<div class="field"><label for="idNin">National ID number (NIN)</label><input id="idNin" name="nin" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="16" placeholder="CM9001234567AB" required><p class="helper">14 characters, starting CM or CF.</p></div>' +
      '<div class="field"><label>Photo of your National ID</label><div class="id-shots">' +
      '<label class="id-shot" for="idFront"><span class="id-shot-img" id="idFrontPrev">Front<br><small>required</small></span><input id="idFront" type="file" accept="image/*" capture="environment" hidden></label>' +
      '<label class="id-shot" for="idBack"><span class="id-shot-img" id="idBackPrev">Back<br><small>optional</small></span><input id="idBack" type="file" accept="image/*" capture="environment" hidden></label>' +
      '</div><p class="helper">Lay the card flat in good light so the writing is clear.</p></div>' +
      '<p class="lock-error" id="idError" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-primary btn-block" id="idSubmit">Send my ID</button></form>';
  }
  function bindIdForm(root, onDone) {
    photoPicks.idFront = null; photoPicks.idBack = null;
    bindPhotoPick("idFront", "idFrontPrev", "idFront", 1400);
    bindPhotoPick("idBack", "idBackPrev", "idBack", 1400);
    var f = root.querySelector("#idForm"), err = root.querySelector("#idError"), btn = root.querySelector("#idSubmit");
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var fail = function (m) { err.textContent = m; err.hidden = false; };
      if (!photoPicks.idFront) { fail("Take a photo of the front of your National ID."); return; }
      btn.disabled = true; btn.textContent = "Sending…";
      var r = await authApi({ action: "submitId", nin: f.querySelector("[name=nin]").value.trim(), idFront: photoPicks.idFront, idBack: photoPicks.idBack || "" }, true);
      btn.disabled = false; btn.textContent = "Send my ID";
      if (!r.ok) { fail(r.error || "Couldn't send your ID. Check your connection."); return; }
      settings.user = Object.assign({}, settings.user, r.user || { idStatus: "submitted" }); saveSettings();
      var su = (state.users || []).find(function (x) { return x.id === settings.user.id; }); if (su) Object.assign(su, r.user || { idStatus: "submitted" });
      photoPicks = {};
      toast("Thank you — your ID was sent");
      onDone();
    });
  }
  // From the Today reminder.
  function openIdForm() {
    var dlg = document.getElementById("askDialog");
    var st = myIdState() || {};
    dlg.classList.add("is-wide");
    dlg.innerHTML = '<div class="ask-head"></div>' + idFormHtml(st.status === "redo" ? "Add your National ID again" : "Add your National ID",
      (st.note ? "<strong>" + esc(st.note) + ".</strong> " : "") + "We use it to check who you are. Only the Owner and Operations can see it.") +
      '<div class="ask-actions"><button type="button" class="btn btn-ghost" id="askCancel">Later</button></div>';
    var close = function () { dlg.close(); dlg.classList.remove("is-wide"); dlg.innerHTML = ""; };
    dlg.querySelector("#askCancel").addEventListener("click", close);
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); close(); }, { once: true });
    bindIdForm(dlg, function () { close(); render(); });
    dlg.showModal();
  }
  // After 5 days: the app stays locked on this screen until the ID is in.
  function showIdRequired() {
    userChip.hidden = true; closeUserMenu();
    document.body.classList.add("locked");
    lockScreen.hidden = false;
    lockCard.innerHTML = idFormHtml("Add your National ID to continue",
      "You joined more than 5 days ago. Add your National ID number and a photo of your ID to keep using the app.") +
      '<button type="button" class="account-back" data-id-signout>Sign out</button>';
    lockCard.querySelector("[data-id-signout]").addEventListener("click", function () { logout(); });
    bindIdForm(lockCard, async function () {
      var r = await loadShared();
      if (r === "ok") { resolveUser(); enterApp(); render(); }
      else if (r === "idoverdue") showIdRequired();
      else { enterApp(); }
    });
  }

  /* ---- Owner / Operations: check new IDs (selfie vs ID card) ---- */
  function idsToCheck() {
    if (!canReviewProspects()) return [];
    return (state.users || []).filter(function (u) { return u.authMethod === "pin" && u.idStatus === "submitted"; });
  }
  function idCheckNotice() {
    var list = idsToCheck();
    if (!list.length) return "";
    return '<section class="card training-nudge"><div><strong>' + list.length + " new " + (list.length === 1 ? "ID" : "IDs") + " to check</strong>" +
      '<div class="settings-note">Compare the selfie with the National ID photo.</div></div>' +
      '<button type="button" class="btn btn-sm btn-primary" data-check-id="' + esc(list[0].id) + '">Check</button></section>';
  }
  function idStatusLabel(u) {
    if (!u || u.authMethod !== "pin") return "";
    if (u.idStatus === "verified") return "ID checked ✓";
    if (u.idStatus === "submitted") return "ID to check";
    if (u.idStatus === "needed" || u.idStatus === "redo") {
      var left = Math.ceil((Date.parse(u.idDueAt || "") - Date.now()) / 864e5);
      return isNaN(left) ? "ID needed" : left <= 0 ? "ID overdue — app locked" : "ID due in " + left + (left === 1 ? " day" : " days");
    }
    return "";
  }
  async function checkStaffId(userId) {
    var r = await authApi({ action: "record", id: userId }, true);
    if (!r.ok) { toast(r.error || "Couldn't load their ID."); return; }
    var rec = r.record, dlg = document.getElementById("askDialog");
    dlg.classList.add("is-wide");
    dlg.innerHTML = '<div class="ask-head"><p class="dash-eyebrow" style="margin:0">Check ID</p><h2 id="askTitle">' + esc(rec.legalName) + "</h2></div>" +
      staffDetailsHtml(rec) + idPhotosHtml(rec) +
      '<p class="settings-note">Does the selfie match the ID photo, and the name and NIN match the card?</p>' +
      '<div class="ask-actions" style="flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="askCancel">Close</button>' +
      (rec.idStatus === "submitted" ? '<button type="button" class="btn btn-danger" id="idRedo">Ask to redo</button><button type="button" class="btn btn-primary" id="idOk">Looks right</button>' : "") + "</div>";
    var close = function () { dlg.close(); dlg.classList.remove("is-wide"); dlg.innerHTML = ""; };
    dlg.querySelector("#askCancel").addEventListener("click", close);
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); close(); }, { once: true });
    if (rec.idStatus === "submitted") {
      dlg.querySelector("#idOk").addEventListener("click", async function () {
        this.disabled = true;
        var x = await authApi({ action: "checkId", userId: userId, ok: true }, true);
        close();
        if (!x.ok) { toast(x.error || "Couldn't save."); return; }
        await pullShared(); toast(rec.legalName + " — ID checked ✓");
      });
      dlg.querySelector("#idRedo").addEventListener("click", async function () {
        close();
        var why = await openSheet({ title: "What should they fix?", body: rec.legalName + " gets 2 more days to send it again.",
          choices: ["Photo not clear", "Name doesn't match", "Selfie doesn't match", "Not a National ID", "Other"], input: { placeholder: "Details — required if you pick Other" },
          requireChoice: true, textFor: "Other", confirmLabel: "Ask to redo", danger: true });
        if (!why) return;
        var reason = why.choice === "Other" ? why.text : why.choice + (why.text ? " — " + why.text : "");
        var y = await authApi({ action: "checkId", userId: userId, ok: false, reason: reason }, true);
        if (!y.ok) { toast(y.error || "Couldn't save."); return; }
        await pullShared(); toast("Sent back — they'll see why");
      });
    }
    dlg.showModal();
  }

  /* ---- Staff sign-ups & PIN accounts (Owner / Operations) ---- */
  // The WhatsApp onboarding message: the personal invite link, how to join,
  // the 5-day ID step, signing in, the home screen and training.
  function staffInviteText(name, link, roleLabel) {
    var me = (settings.user && settings.user.name) || "";
    return "Hello" + (name ? " " + name : "") + " 👋 Welcome to the Verisko team" + (roleLabel ? " (" + roleLabel + ")" : "") + "!\n\n" +
      "Here is your personal invite to the Verisko app. It works for 7 days, only with this phone number:\n" + link + "\n\n" +
      "1️⃣ Open the link on your phone\n" +
      "2️⃣ Enter your full name *exactly as on your National ID*\n" +
      "3️⃣ Choose a 4-digit PIN. Keep it secret — don't share it with anyone\n" +
      "4️⃣ Take a selfie so we know it's you\n" +
      "5️⃣ *Within 5 days*: add your National ID number and a photo of your ID in the app\n\n" +
      "After that, sign in any time with your *phone number and PIN*.\n\n" +
      "📲 Tip: put the app on your home screen. Android: Chrome menu (⋮) → *Add to Home screen*. iPhone: Share → *Add to Home Screen*.\n\n" +
      "🎓 Then open *Support* in the app and watch the 13 training videos. Pass each quiz to get your certificate.\n\n" +
      "Questions? Reply to this message." + (me ? "\n— " + me + ", Verisko" : "");
  }
  function waDigits(phone) {
    var d = String(phone || "").replace(/\D/g, "");
    if (/^0\d{9}$/.test(d)) d = "256" + d.slice(1);
    else if (/^7\d{8}$/.test(d)) d = "256" + d;
    return /^\d{11,15}$/.test(d) ? d : "";
  }
  // Team lead / Operations / Owner dashboard: invite new staff on WhatsApp.
  function inviteCard() {
    if (!canApproveQual()) return "";
    return '<section class="card invite-card"><div><strong>Grow the team</strong>' +
      '<div class="settings-note">Send a new team member a personal invite link on WhatsApp. Joining is by invite only.' +
      (canReviewProspects() ? "" : " You can invite Sales.") + "</div></div>" +
      '<button type="button" class="btn btn-primary" data-invite-staff>Invite on WhatsApp</button></section>';
  }
  function inviteStaff() {
    if (!canApproveQual()) return;
    var role = (settings.user || {}).role;
    var roles = role === "teamlead" ? [["sales", "Sales"]] : [["sales", "Sales"], ["teamlead", "Team lead"]].concat(isAdmin() ? [["operations", "Operations"]] : []);
    var dlg = document.getElementById("askDialog");
    dlg.innerHTML = '<div class="ask-head"><h2 id="askTitle">Invite someone to the team</h2>' +
      '<p class="ask-body">They get a personal link that works once, for 7 days, only with their phone number. They join straight away and add their National ID within 5 days.</p></div>' +
      '<div class="field"><label for="invName">Their first name <span class="optional-tag">optional</span></label><input id="invName" type="text" autocomplete="off" placeholder="e.g. Grace"></div>' +
      '<div class="field"><label for="invPhone">Their WhatsApp number</label><input id="invPhone" type="tel" inputmode="tel" autocomplete="off" placeholder="0772 123 456" required></div>' +
      (roles.length > 1 ? '<div class="field"><label for="invRole">They join as</label><select id="invRole">' + roles.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</select></div>" : '<input type="hidden" id="invRole" value="sales">') +
      '<p class="lock-error" id="invError" role="alert" hidden></p>' +
      '<div class="ask-actions" style="flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="askCancel">Close</button>' +
      '<button type="button" class="btn btn-primary" id="invCreate">Create invite</button></div>';
    var nameEl = dlg.querySelector("#invName"), phoneEl = dlg.querySelector("#invPhone"), err = dlg.querySelector("#invError");
    dlg.querySelector("#askCancel").addEventListener("click", function () { dlg.close(); });
    dlg.querySelector("#invCreate").addEventListener("click", async function () {
      var d = waDigits(phoneEl.value);
      if (!d) { err.textContent = "Enter their WhatsApp number, e.g. 0772 123 456."; err.hidden = false; return; }
      this.disabled = true; this.textContent = "Creating…";
      var roleVal = dlg.querySelector("#invRole").value, name = nameEl.value.trim();
      var r = await authApi({ action: "invite", phone: phoneEl.value, name: name, role: roleVal }, true);
      if (!r.ok) { this.disabled = false; this.textContent = "Create invite"; err.textContent = r.error || "Couldn't create the invite."; err.hidden = false; return; }
      var label = (roles.find(function (o) { return o[0] === r.role; }) || [0, "Sales"])[1];
      var text = staffInviteText(name, location.origin + "/?invite=" + r.code, label);
      dlg.innerHTML = '<div class="ask-head"><h2 id="askTitle">Send the invite' + (name ? " to " + esc(name) : "") + "</h2>" +
        '<p class="ask-body">Invite code <strong>' + esc(r.code) + "</strong> · joins as " + esc(label) + " · works until " + esc(dateLabel(String(r.expiresAt).slice(0, 10))) + ".</p></div>" +
        '<div class="invite-preview">' + esc(text) + "</div>" +
        '<div class="ask-actions" style="flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="askCancel">Done</button>' +
        '<button type="button" class="btn btn-ghost" id="invCopy">Copy message</button>' +
        '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/' + esc(d) + "?text=" + encodeURIComponent(text) + '">Send on WhatsApp</a></div>';
      dlg.querySelector("#askCancel").addEventListener("click", function () { dlg.close(); });
      dlg.querySelector("#invCopy").addEventListener("click", function () {
        var done = function () { toast("Message copied — paste it in WhatsApp"); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast("Couldn't copy — select the message and copy it"); });
        else toast("Select the message and copy it");
      });
    });
    dlg.showModal();
    nameEl.focus();
  }

  function pinActions(u) {
    if (!u || u.authMethod !== "pin") return "";
    return '<button type="button" class="account-role" data-' + (u.idStatus === "submitted" ? "check-id" : "view-staff") + '="' + esc(u.id) + '">' + (u.idStatus === "submitted" ? "Check ID" : "View ID") + "</button>" +
      '<button type="button" class="account-role" data-reset-pin="' + esc(u.id) + '">Reset PIN</button>';
  }
  function pendingSignups() { return canReviewProspects() ? (state.signups || []) : []; }
  function signupsCard() {
    var list = pendingSignups();
    if (!list.length) return "";
    return '<section class="card settings-card signup-card"><h2>New staff sign-ups <span class="review-count">' + list.length + "</span></h2>" +
      "<p>Check each person's National ID, choose their role and approve them. Until then they can't sign in.</p>" +
      '<div class="account-list">' + list.map(function (x) {
        return '<div class="account-row" style="background:var(--fill-2)"><span class="user-avatar" aria-hidden="true">' + esc(initials(x.legalName)) + "</span>" +
          '<span class="who"><strong>' + esc(x.legalName) + "</strong><span>" + esc(x.phone) + " · signed up " + esc(dateLabel(String(x.signupAt).slice(0, 10))) + "</span></span>" +
          '<span class="row-actions"><button type="button" class="btn btn-sm btn-primary" data-review-signup="' + esc(x.id) + '">Review</button></span></div>';
      }).join("") + "</div></section>";
  }
  // Today: a nudge for the Owner / Operations while sign-ups are waiting.
  function signupNotice() {
    var n = pendingSignups().length;
    if (!n) return "";
    return '<section class="card training-nudge"><div><strong>' + n + " new staff " + (n === 1 ? "sign-up" : "sign-ups") + " waiting</strong>" +
      '<div class="settings-note">Check their National ID and approve them so they can sign in.</div></div>' +
      '<button type="button" class="btn btn-sm btn-primary" data-review-signup="' + esc(pendingSignups()[0].id) + '">Review</button></section>';
  }
  function idPhotosHtml(rec) {
    return '<div class="id-view">' + [["Selfie", rec.selfie], ["ID front", rec.idFront], ["ID back", rec.idBack]].filter(function (x) { return x[1]; }).map(function (x) {
      return '<figure><img src="' + esc(x[1]) + '" alt="National ID ' + x[0].toLowerCase() + '"><figcaption>' + x[0] + "</figcaption></figure>";
    }).join("") + "</div>";
  }
  function staffDetailsHtml(rec) {
    return '<div class="item-lines">' +
      '<div class="item-line"><span class="k">Legal name</span><span class="v">' + esc(rec.legalName) + "</span></div>" +
      '<div class="item-line"><span class="k">Phone</span><span class="v">' + esc(rec.phone) + "</span></div>" +
      '<div class="item-line"><span class="k">NIN</span><span class="v" style="font-variant-numeric:tabular-nums;letter-spacing:.04em">' + (rec.nin ? esc(rec.nin) : '<span style="color:var(--amber)">not added yet</span>') + "</span></div>" +
      (rec.invitedBy ? '<div class="item-line"><span class="k">Invited by</span><span class="v">' + esc(rec.invitedBy) + "</span></div>" : "") +
      (rec.idStatus === "redo" && rec.idNote ? '<div class="item-line"><span class="k">Asked to redo</span><span class="v">' + esc(rec.idNote) + "</span></div>" : "") +
      '<div class="item-line"><span class="k">Signed up</span><span class="v">' + esc(dateTimeLabel(rec.signupAt)) + "</span></div>" +
      (rec.approvedAt ? '<div class="item-line"><span class="k">Approved</span><span class="v">' + esc((rec.approvedBy || "—") + " · " + dateTimeLabel(rec.approvedAt)) + "</span></div>" : "") +
      "</div>";
  }
  async function reviewSignup(id) {
    toast("Loading their details…");
    var r = await authApi({ action: "record", id: id }, true);
    if (!r.ok) { toast(r.error === "not_found" ? "That sign-up was already handled." : (r.error || "Couldn't load the sign-up.")); await pullShared(); return; }
    var rec = r.record, dlg = document.getElementById("askDialog");
    var roles = [["sales", "Sales"], ["teamlead", "Team lead"]].concat(isAdmin() ? [["operations", "Operations"]] : []);
    dlg.classList.add("is-wide");
    dlg.innerHTML = '<div class="ask-head"><p class="dash-eyebrow" style="margin:0">New staff sign-up</p><h2 id="askTitle">' + esc(rec.legalName) + "</h2></div>" +
      staffDetailsHtml(rec) + idPhotosHtml(rec) +
      '<p class="settings-note">Check that the name and NIN match the card and the photo is clear.</p>' +
      '<div class="field"><label for="suRole">Role</label><select id="suRole">' + roles.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + "</option>"; }).join("") + "</select></div>" +
      '<div class="ask-actions" style="flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="askCancel">Close</button>' +
      '<button type="button" class="btn btn-danger" id="suReject">Reject</button>' +
      '<button type="button" class="btn btn-primary" id="suApprove">Approve</button></div>';
    var close = function () { dlg.close(); dlg.classList.remove("is-wide"); dlg.innerHTML = ""; };
    dlg.querySelector("#askCancel").addEventListener("click", close);
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); close(); }, { once: true });
    dlg.querySelector("#suApprove").addEventListener("click", async function () {
      this.disabled = true;
      var role = dlg.querySelector("#suRole").value;
      var a = await authApi({ action: "approve", id: id, role: role }, true);
      close();
      if (!a.ok) { toast(a.error || "Couldn't approve."); return; }
      await pullShared();
      toast(rec.legalName.split(/\s+/)[0] + " approved — they can sign in with their phone and PIN");
    });
    dlg.querySelector("#suReject").addEventListener("click", async function () {
      close();
      if (!(await confirmSheet("Reject " + rec.legalName + "?", "Their sign-up and ID photo are deleted. They can sign up again if this was a mistake.", "Reject", true))) return;
      var x = await authApi({ action: "reject", id: id }, true);
      if (!x.ok) { toast(x.error || "Couldn't reject."); return; }
      await pullShared();
      toast("Sign-up rejected and deleted");
    });
    dlg.showModal();
  }
  async function viewStaffId(userId) {
    var r = await authApi({ action: "record", id: userId }, true);
    if (!r.ok) { toast(r.error === "not_found" ? "No ID on file for this account." : (r.error || "Couldn't load their ID.")); return; }
    var dlg = document.getElementById("askDialog");
    dlg.classList.add("is-wide");
    dlg.innerHTML = '<div class="ask-head"><p class="dash-eyebrow" style="margin:0">National ID on file</p><h2 id="askTitle">' + esc(r.record.legalName) + "</h2></div>" +
      staffDetailsHtml(r.record) + idPhotosHtml(r.record) +
      '<div class="ask-actions"><button type="button" class="btn btn-primary" id="askCancel">Close</button></div>';
    var close = function () { dlg.close(); dlg.classList.remove("is-wide"); dlg.innerHTML = ""; };
    dlg.querySelector("#askCancel").addEventListener("click", close);
    dlg.addEventListener("cancel", function (e) { e.preventDefault(); close(); }, { once: true });
    dlg.showModal();
  }
  async function resetStaffPin(userId) {
    var u = (state.users || []).find(function (x) { return x.id === userId; });
    if (!u) return;
    if (!(await confirmSheet("Reset " + u.name + "'s PIN?", "They're signed out on every phone. You'll get a 6-digit code to send them; they enter it under “Forgot PIN?” and choose a new PIN. The code works once, for 48 hours.", "Reset PIN", true))) return;
    var r = await authApi({ action: "resetPin", userId: userId }, true);
    if (!r.ok) { toast(r.error || "Couldn't reset the PIN."); return; }
    var digits = String(u.phone || "").replace(/\D/g, "");
    var msg = "Hello " + u.name.split(/\s+/)[0] + ", your Verisko PIN was reset. Open " + location.origin + " , tap “Forgot PIN?” and enter this code: " + r.code + " (valid 48 hours). Then choose a new 4-digit PIN.";
    var dlg = document.getElementById("askDialog");
    dlg.innerHTML = '<div class="ask-head"><h2 id="askTitle">Send this code to ' + esc(u.name.split(/\s+/)[0]) + "</h2>" +
      '<p class="ask-body">One-time code, valid for 48 hours:</p></div><div class="reset-code">' + esc(r.code) + "</div>" +
      '<div class="ask-actions" style="flex-wrap:wrap"><button type="button" class="btn btn-ghost" id="askCancel">Done</button>' +
      '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/' + esc(digits) + "?text=" + encodeURIComponent(msg) + '">Send on WhatsApp</a></div>';
    dlg.querySelector("#askCancel").addEventListener("click", function () { dlg.close(); });
    dlg.showModal();
  }

  // Danger zone: wipe everything, leaving an empty workspace (type-to-confirm).
  async function resetDemo() {
    var r = await openSheet({
      title: "Reset everything?",
      body: "This ERASES all prospects, visits and team accounts for everyone, and leaves the workspace empty. It cannot be undone.",
      input: { placeholder: "Type RESET to confirm", confirmWord: "RESET" },
      confirmLabel: "Reset everything", danger: true
    });
    if (!r) return;
    state = JSON.parse(JSON.stringify(seed));
    saveData("Workspace reset");
    logout(); // wiped the team — sign out and re-onboard
  }

  /* --------------------------- Backup / import / CSV ------------------------ */
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function exportJson() { download("verisko-sales-backup-" + today + ".json", JSON.stringify(state, null, 2), "application/json"); }

  document.getElementById("importInput").addEventListener("change", function () {
    var file = this.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed.prospects || !parsed.appointments) throw new Error();
        state = { prospects: parsed.prospects, appointments: parsed.appointments, users: parsed.users || state.users || [], transactions: parsed.transactions || state.transactions || [], jobs: parsed.jobs, installations: parsed.installations || [], quotes: parsed.quotes || [], technicians: parsed.technicians || state.technicians || [], config: normalizeConfig(parsed.config && typeof parsed.config === "object" ? parsed.config : state.config) };
        migrateToJobs(state);              // support importing an older backup
        if (!state.jobs) state.jobs = [];
        saveData("Backup imported");
        render();
      } catch (e) { toast("That file is not a valid Verisko backup."); }
    };
    reader.readAsText(file); this.value = "";
  });

  document.getElementById("leadImportInput").addEventListener("change", function () {
    var file = this.files[0]; this.value = "";
    readLeadFile(file);
  });

  /* ------------------------------- Wiring ----------------------------------- */
  document.querySelectorAll("[data-close]").forEach(function (b) {
    b.addEventListener("click", function () { hideFormError(); dialog.close(); });
  });

  document.querySelector(".mainnav").addEventListener("click", function (e) {
    if (e.target.closest("[data-more]")) { openMoreMenu(); return; }
    var b = e.target.closest("[data-view]");
    if (b) { view = b.dataset.view; render(); document.getElementById("main").focus(); }
  });

  document.getElementById("primaryAction").addEventListener("click", function () {
    if (view === "cashflow") openForm("transaction");
    else if (view === "jobs") openForm("job");
    else if (view === "visits") openForm("appointment");
    else openForm("prospect");
  });

  content.addEventListener("input", function (e) {
    if (e.target.id === "search") updateProspectGrid();
  });
  content.addEventListener("change", function (e) {
    if (e.target.id === "stageFilter") updateProspectGrid();
    if (e.target.id === "visitFilter") updateVisitList();
    if (e.target.id === "cashFilter") { cashFilter = e.target.value; renderCashflow(); }
    if (e.target.id === "jobFilter") { jobFilter = e.target.value; renderJobs(); }
    if (e.target.matches("[data-set-role]")) setMemberRole(e.target.dataset.userId, e.target.value);
  });

  content.addEventListener("click", function (e) {
    var photo = e.target.closest("[data-photo]"); if (photo) { openPhoto(photo.getAttribute("data-img")); return; }
    var appr = e.target.closest("[data-approve-id]"); if (appr) { approveTx(appr.getAttribute("data-approve-id")); return; }
    var back = e.target.closest("[data-sendback-id]"); if (back) { sendBackTx(back.getAttribute("data-sendback-id")); return; }
    var apprP = e.target.closest("[data-approve-prospect]"); if (apprP) { approveProspect(apprP.getAttribute("data-approve-prospect")); return; }
    var apprQ = e.target.closest("[data-approve-qual]"); if (apprQ) { approveQualification(apprQ.getAttribute("data-approve-qual")); return; }
    var wv = e.target.closest("[data-watch]"); if (wv) { openVideo(wv.getAttribute("data-watch")); return; }
    if (e.target.closest("[data-invite-staff]")) { inviteStaff(); return; }
    if (e.target.closest("[data-add-id]")) { openIdForm(); return; }
    var cki = e.target.closest("[data-check-id]"); if (cki) { checkStaffId(cki.getAttribute("data-check-id")); return; }
    var rsu = e.target.closest("[data-review-signup]"); if (rsu) { reviewSignup(rsu.getAttribute("data-review-signup")); return; }
    var vsi = e.target.closest("[data-view-staff]"); if (vsi) { viewStaffId(vsi.getAttribute("data-view-staff")); return; }
    var rpn = e.target.closest("[data-reset-pin]"); if (rpn) { resetStaffPin(rpn.getAttribute("data-reset-pin")); return; }
    if (e.target.closest("[data-certs-seen]")) { markCertsSeen(); return; }
    if (e.target.closest("[data-goview-support]")) { view = "support"; render(); document.getElementById("main").focus(); return; }
    var cd = e.target.closest("[data-cert-download]"); if (cd) { downloadCertificate(cd.getAttribute("data-cert-download")); return; }
    var cs = e.target.closest("[data-cert-share]"); if (cs) { shareCertificate(cs.getAttribute("data-cert-share")); return; }
    var qz = e.target.closest("[data-quiz]"); if (qz) { openVideo(qz.getAttribute("data-quiz"), true); return; }
    var dq = e.target.closest("[data-disqualify]"); if (dq) { disqualifyProspect(dq.getAttribute("data-disqualify")); return; }
    var rq = e.target.closest("[data-reopen-qual]"); if (rq) { reopenQualification(rq.getAttribute("data-reopen-qual")); return; }
    var qs = e.target.closest("[data-qual-seen]"); if (qs) { markDisqualifiedSeen(qs.getAttribute("data-qual-seen")); return; }
    var dep = e.target.closest("[data-record-deposit]"); if (dep) { recordDeposit(dep.getAttribute("data-record-deposit")); return; }
    var cw = e.target.closest("[data-comm-week]"); if (cw) { commWeekShift = Math.min(0, commWeekShift + Number(cw.getAttribute("data-comm-week"))); render(); return; }
    var backP = e.target.closest("[data-sendback-prospect]"); if (backP) { sendBackProspect(backP.getAttribute("data-sendback-prospect")); return; }
    var tt = e.target.closest("[data-tech-toggle]"); if (tt) { toggleTechnician(tt.getAttribute("data-tech-toggle")); return; }
    var tr = e.target.closest("[data-tech-remove]"); if (tr) { removeTechnician(tr.getAttribute("data-tech-remove")); return; }
    var mkInstall = e.target.closest("[data-make-install]"); if (mkInstall) { openForm("job", null, mkInstall.getAttribute("data-make-install")); return; }
    var fup = e.target.closest("[data-log-followup]"); if (fup) { logFollowUp(fup.getAttribute("data-log-followup")); return; }
    var go = e.target.closest("[data-go]"); if (go) { view = go.dataset.go; render(); return; }
    var qpc = e.target.closest("[data-quote-pdf]"); if (qpc) { downloadQuotePdf(qpc.getAttribute("data-quote-pdf")); return; }
    var qsc = e.target.closest("[data-quote-share]"); if (qsc) { shareQuote(qsc.getAttribute("data-quote-share")); return; }
    var edit = e.target.closest("[data-edit]"); if (edit) { openForm(edit.dataset.edit, edit.dataset.id); return; }
    var sched = e.target.closest("[data-schedule]"); if (sched) { openForm("appointment", null, sched.dataset.schedule); return; }
    var confirmBtn = e.target.closest("[data-confirm]"); if (confirmBtn) { confirmVisit(confirmBtn.dataset.confirm); return; }
    var neu = e.target.closest("[data-new]"); if (neu) { openForm(neu.dataset.new); return; }
    var cashMode = e.target.closest("[data-cash-mode]"); if (cashMode) { cashPeriodMode = cashMode.dataset.cashMode; cashPeriodAnchor = today; renderCashflow(); return; }
    var cashStep = e.target.closest("[data-cash-step]"); if (cashStep) { cashPeriodAnchor = window.VeriskoCashflowReport.shiftCashflowAnchor(cashPeriodAnchor, cashPeriodMode, Number(cashStep.dataset.cashStep)); renderCashflow(); return; }

    if (e.target.closest("[data-new-export-key]")) { newExportKey(); return; }
    if (e.target.closest("[data-copy-export-key]")) { copyExportKey(); return; }
    var oex = e.target.closest("[data-open-export]"); if (oex) { window.open(exportUrl(oex.getAttribute("data-open-export")), "_blank", "noopener"); return; }
    if (e.target.closest("[data-export]")) exportJson();
    if (e.target.closest("[data-import]")) document.getElementById("importInput").click();
    if (e.target.closest("[data-import-leads]")) { if (isAdmin()) document.getElementById("leadImportInput").click(); return; }
    if (e.target.closest("[data-lead-template]")) { downloadLeadTemplate(); return; }
    if (e.target.closest("[data-undo-import]")) { undoLeadImport(); return; }
    if (e.target.closest("[data-sync]")) pullShared();
    var rm = e.target.closest("[data-remove-user]"); if (rm) { removeUser(rm.dataset.removeUser); return; }
    if (e.target.closest("[data-reset]")) { resetDemo(); return; }
  });
  content.addEventListener("submit", function (e) {
    var addForm = e.target.closest("#addMemberForm");
    if (addForm) {
      e.preventDefault();
      if (addMember(addForm.querySelector("[name=name]").value, addForm.querySelector("[name=email]").value, addForm.querySelector("[name=role]").value)) addForm.reset();
      return;
    }
    var commForm = e.target.closest("#commissionForm");
    if (commForm) {
      e.preventDefault();
      if (!canReviewProspects()) return;
      if (!state.config || typeof state.config !== "object") state.config = {};
      state.config.commissionPerSale = Math.max(0, Math.round(Number(commForm.querySelector("[name=commRate]").value) || 0));
      var cq = commForm.querySelector("[name=commQual]"); if (cq) state.config.commissionPerQualified = Math.max(0, Math.round(Number(cq.value) || 0));
      state.config.commissionTarget = Math.max(0, Math.round(Number(commForm.querySelector("[name=commTarget]").value) || 0));
      saveData("Commission settings saved");
      render();
      return;
    }
    var techForm = e.target.closest("#technicianForm");
    if (techForm) {
      e.preventDefault();
      if (addTechnician(techForm.querySelector("[name=name]").value, techForm.querySelector("[name=phone]").value, techForm.querySelector("[name=skills]").value)) techForm.reset();
    }
  });

  /* -------------------------------- Start ----------------------------------- */
  // Offline loading (sw.js): keep a copy of the app on the phone so it opens
  // with no signal. Registered after load so it never slows the first paint.
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
  }
  // Load any offline photos waiting to upload (migrates the old localStorage
  // queue into IndexedDB on first run).
  initUploadQueue();
  // Recover automatically when the phone gets signal back.
  window.addEventListener("online", function () { setSync("syncing", "Back online — syncing…"); syncNow(); });
  window.addEventListener("offline", function () { setSync("error", "Offline — saved on this device"); });

  // Invite link: /?invite=CODE opens "Join the team" (signed-out phones only).
  (function () {
    var m = /[?&]invite=([A-Za-z0-9-]+)/.exec(location.search);
    if (!m) return;
    history.replaceState(null, "", location.pathname + location.hash);
    if (settings.auth && settings.user) { toast("You're already signed in. Sign out first to use an invite."); return; }
    pendingInvite = { code: m[1].toUpperCase(), info: null };
    authApi({ action: "inviteInfo", code: pendingInvite.code }, true).then(function (r) {
      if (!pendingInvite) return;
      if (r.ok) pendingInvite.info = r; else toast(r.error || "That invite didn't work.");
      if (document.body.classList.contains("locked")) renderLogin("signup", r.ok ? "" : r.error);
    });
  })();
  var hashAuth = readAuthFromHash();
  if (!storageWorks()) showOpenProblem("storage-blocked", "This browser won't let the app save on this phone");
  else if (hashAuth && hashAuth.access_token) {
    // Landed back from a magic link — complete sign-in.
    showLogin(); renderLogin("signingIn"); setSync("syncing", "Signing you in…");
    loginEmail = emailFromJwt(hashAuth.access_token);
    afterVerify(loginEmail, { access_token: hashAuth.access_token, refresh_token: hashAuth.refresh_token, expires_at: Number(hashAuth.expires_at) });
  } else if (hashAuth && hashAuth.error) {
    showLogin(); renderLogin("email", "That sign-in link has expired or was already used. Enter your email to get a new one.");
    reportProblem("email-link-error", (hashAuth.error_code || hashAuth.error || "") + " " + (hashAuth.error_description || ""));
  } else if (settings.auth && settings.user) {
    try { enterApp(); } catch (err) { showOpenProblem("start", err); } // open straight to the app from cached data (offline-friendly)
    if (syncClosedSales(true)) render();
    setSync("syncing", "Checking…");
    loadShared().then(function (result) {
      if (result === "signin") { signOutLocal(); showLogin("Your session expired. Please sign in again."); }
      else if (result === "idoverdue") showIdRequired();
      else if (result === "unauth") { var _em = settings.auth && settings.auth.email; signOutLocal(); showDenied(_em, true); }
      else if (result === "ok") { resolveUser(); setSync("connected", "Synced"); syncClosedSales(true); render(); syncNow(); }
      else { setSync("error", "Offline — using this device"); }
    });
  } else {
    showLogin();
    if (pendingInvite) renderLogin("signup");
  }
})();
