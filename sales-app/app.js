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
  var SOURCES = ["Cold visit", "Walk-in prospecting", "Referral", "Website enquiry", "Phone enquiry", "Existing customer", "Other"];
  // Common next actions — offered as tap-or-type suggestions to cut typing.
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
  var QUOTE_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

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
  function defaultConfig() { return { pettyLimit: 20000, commissionPerSale: 80000, commissionTarget: 1600000 }; }

  /* ---------- Seed / demonstration data (prospects + appointments only) ------ */
  var seed = {
    prospects: [
      { id: "p1", business: "Acacia Pharmacy", vertical: "Pharmacy", contact: "Grace N.", phone: "+256 772 460 125", location: "Kira Road, Kampala", decisionMaker: "Yes", concern: "Blind spot at the dispensary entrance and after-hours access.", existing: "Yes", areas: "Entrance, dispensary, rear store", budget: "Has budget", stage: "Appointment confirmed", source: "Walk-in prospecting", nextAction: "Site visit with Operations Director", followUp: plusDays(1), notes: "Best time is before the lunch rush.", created: plusDays(-6) },
      { id: "p2", business: "Luwum Mobile Money", vertical: "Mobile money", contact: "Brian S.", phone: "+256 701 908 412", location: "Luwum Street, Kampala", decisionMaker: "Yes", concern: "Cash handling and street-facing counter.", existing: "No", areas: "Counter and entrance", budget: "Has budget", stage: "Qualified", source: "Referral", nextAction: "Propose a site visit this week", followUp: today, notes: "Owner is usually present after 3pm.", created: plusDays(-3) },
      { id: "p3", business: "Nakasero Family Clinic", vertical: "Clinic", contact: "Dr. Amina K.", phone: "+256 754 330 219", location: "Nakasero, Kampala", decisionMaker: "Yes", concern: "Night access, reception and medicine store.", existing: "Yes", areas: "Reception, corridors, pharmacy store, parking", budget: "Not discussed", stage: "Appointment proposed", source: "Website enquiry", nextAction: "Confirm the proposed Thursday visit", followUp: today, notes: "Wants the Operations Director to view the ceiling void.", created: plusDays(-10) },
      { id: "p4", business: "Ntinda Fresh Mart", vertical: "Supermarket", contact: "Joel M.", phone: "+256 783 222 608", location: "Ntinda, Kampala", decisionMaker: "No", concern: "Till monitoring and stock loss.", existing: "No", areas: "Tills, aisles and stock room", budget: "Not discussed", stage: "Contact attempted", source: "Cold visit", nextAction: "Reach the proprietor, not only the supervisor", followUp: plusDays(-1), notes: "Branch supervisor cannot make the decision.", created: plusDays(-18) },
      { id: "p5", business: "Kabalagala Hardware", vertical: "Retail shop", contact: "Sara T.", phone: "+256 776 114 900", location: "Kabalagala, Kampala", decisionMaker: "Unknown", concern: "Break-ins after closing.", existing: "No", areas: "Shopfront and yard", budget: "Price-sensitive", stage: "New prospect", source: "Cold visit", nextAction: "Call to introduce Verisko", followUp: plusDays(2), notes: "", created: plusDays(-1) }
    ],
    appointments: [
      { id: "a1", prospectId: "p1", date: plusDays(1), time: "10:00", director: "Operations Director", status: "Confirmed", purpose: "Technical site survey", directions: "Ask for Grace at the dispensary counter. Parking on Kira Road.", created: plusDays(-2) },
      { id: "a2", prospectId: "p3", date: plusDays(2), time: "14:30", director: "Operations Director", status: "Proposed", purpose: "Technical site survey", directions: "Reception will call Dr. Amina. Enter from the side gate.", created: plusDays(-1) }
    ],
    users: [],
    transactions: [],
    jobs: [],
    technicians: [],
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
      if (!data.config || typeof data.config !== "object") data.config = defaultConfig();
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
        if (opts.requireValue) { var r = result(); return !!(r.choice || r.text); }
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
    if (view === "installs" && !canInstalls()) view = "today";  // Installations is Operations + admin
    if (view === "quotes" && !canInstalls()) view = "today";    // Quotes is Operations + admin
    updateNavActive();
    updateCashBadge();
    updateProspectBadge();
    if (view === "today") renderToday();
    else if (view === "dashboard") renderDashboard();
    else if (view === "prospects") renderProspects();
    else if (view === "visits") renderVisits();
    else if (view === "installs") renderInstalls();
    else if (view === "quotes") renderQuotes();
    else if (view === "cashflow") renderCashflow();
    else if (view === "settings") renderSettings();
  }
  // Highlight the current tab — or the More button when the view lives there.
  function updateNavActive() {
    var inMore = MORE_VIEWS.indexOf(view) !== -1 && !!document.querySelector('[data-more]:not([hidden])');
    document.querySelectorAll(".mainnav .nav-item").forEach(function (b) {
      var on = b.dataset.view === view || (b.hasAttribute("data-more") && inMore);
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
  }

  /* --------------------------------- TODAY ---------------------------------- */
  function renderToday() {
    setHead("Your work today", "Today", "Your priorities, most urgent first.", "Add prospect", true);

    var active = state.prospects.filter(function (p) { return !isClosed(p.stage); });

    var overdue = active.filter(function (p) { return isOverdue(p.followUp); });
    var dueToday = active.filter(function (p) { return isToday(p.followUp); });
    var seen = {};
    overdue.concat(dueToday).forEach(function (p) { seen[p.id] = true; });

    var toSchedule = active.filter(function (p) {
      return /Qualified/i.test(p.stage) && !appointmentFor(p.id) && !seen[p.id];
    });

    var awaiting = state.appointments.filter(function (a) { return /Proposed|Rescheduled/i.test(a.status); })
      .sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
    var confirmed = state.appointments.filter(function (a) { return a.status === "Confirmed" && (!a.date || a.date >= today); })
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

    content.innerHTML = '<div class="stack">' + sections + "</div>";
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
    content.innerHTML =
      review +
      '<div class="toolbar">' +
        '<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' +
        '<input id="search" type="search" placeholder="Search business, contact, phone or location" aria-label="Search prospects"></div>' +
        '<div class="filter-row"><div class="field-inline"><label for="stageFilter">Stage</label>' +
        '<select id="stageFilter"><option value="">All stages</option>' + STAGES.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("") + "</select></div></div>" +
      "</div>" +
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
    var rows = state.prospects.filter(function (p) {
      var haystack = [p.business, p.contact, p.phone, p.location, p.vertical, p.notes].map(function (x) { return x || ""; }).join(" ").toLowerCase();
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

  function prospectCard(p) {
    var appt = appointmentFor(p.id);
    var actions = "";
    if (p.phone) actions += '<a class="btn btn-sm btn-cyan" href="' + esc(telHref(p.phone)) + '">Call</a>';
    actions += '<button class="btn btn-sm btn-ghost" data-log-followup="' + p.id + '">Follow-up</button>';
    if (/Qualified/i.test(p.stage) && !appt) actions += '<button class="btn btn-sm btn-ghost" data-schedule="' + p.id + '">Schedule</button>';
    if (canReviewProspects()) actions += '<button class="btn btn-sm ' + (p.closedSale ? "btn-ghost" : "btn-cyan") + '" data-toggle-closed="' + p.id + '">' + (p.closedSale ? "Undo close" : "Mark closed") + "</button>";
    actions += '<button class="btn btn-sm btn-ghost" data-edit="prospect" data-id="' + p.id + '">Edit</button>';
    var tone = isOverdue(p.followUp) ? "red" : isToday(p.followUp) ? "amber" : "navy";
    var reviewChip = prospectReviewChip(p.reviewStatus);
    return '<article class="item tone-' + tone + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(p.business) + '</div>' +
      '<div class="item-meta">' + esc(p.vertical) + " · " + esc(p.location || "No location") + "</div></div>" +
      '<span class="chip-stack">' + stageChip(p.stage) + reviewChip + closedSaleChip(p) + "</span></div>" +
      '<div class="item-lines">' +
      '<div class="item-line"><span class="k">Contact</span><span class="v">' + esc(p.contact || "Unknown") + "</span></div>" +
      '<div class="item-line"><span class="k">Phone</span><span class="v">' + (p.phone ? '<a class="telink" href="' + esc(telHref(p.phone)) + '">' + esc(p.phone) + "</a>" : "Not recorded") + "</span></div>" +
      '<div class="item-line"><span class="k">Next action</span><span class="v">' + esc(p.nextAction || "Not set") + "</span></div>" +
      '<div class="item-line"><span class="k">Follow-up</span><span class="v">' + (isOverdue(p.followUp) ? '<span style="color:var(--red);font-weight:700">' + dateLabel(p.followUp) + " · overdue</span>" : dateLabel(p.followUp)) + "</span></div>" +
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
    var rows = state.appointments.filter(function (a) { return !filter || a.status === filter; })
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
  var pendingProof = null; // resized photo chosen in the form, not yet uploaded
  var txPreset = null;     // prefill for a cash entry opened from an installation

  function txStatusChip(s) {
    if (s === "approved") return chip("Approved", "green", "✓");
    if (s === "query") return chip("Sent back", "red", "!");
    return chip("Pending", "amber", "◔");
  }

  // Petty-cash limit: below this, an entry can be approved without a formal
  // receipt (a note or photo-of-item is enough). 0 disables the exception.
  function pettyLimit() { var n = state.config && Number(state.config.pettyLimit); return n > 0 ? n : 0; }
  // Only money OUT needs a receipt (and only above the petty-cash limit).
  function needsProof(t) { return t.direction === "out" && !t.proofId && (t.amount || 0) > pettyLimit(); }

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
    if (canReviewProspects()) return renderSalesConsole();  // Operations/admins
    renderMyDashboard();                                    // Sales
  }

  // Salesperson's own performance: commission = my closed sales × rate.
  function renderMyDashboard() {
    setHead("Your performance", "Dashboard", "Your sales and commission at a glance.", "", false);
    var email = ((settings.user || {}).email || "").toLowerCase();
    var ps = (state.prospects || []).filter(function (p) { return (p.createdByEmail || "").toLowerCase() === email; });
    var total = ps.length;
    var closed = ps.filter(function (p) { return p.closedSale; }).length;
    var approved = ps.filter(function (p) { return p.reviewStatus === "approved"; }).length;
    var conv = total ? Math.round((closed / total) * 100) : 0;
    var rate = commissionRate(), target = commissionTarget();
    var earned = closed * rate;
    var pct = target ? Math.min(100, Math.round((earned / target) * 100)) : 0;
    var remaining = Math.max(0, target - earned);

    var hero = '<section class="card dash-hero">' +
      '<p class="dash-eyebrow">Commission this month</p>' +
      '<div class="dash-big">' + money(earned) + "</div>" +
      '<div class="dash-sub">of ' + money(target) + " target</div>" +
      '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
      '<div class="dash-foot">' + pct + "% reached · " + money(remaining) + " to go</div>" +
      '<div class="dash-note">' + closed + " closed " + (closed === 1 ? "sale" : "sales") + " verified by Operations × " + money(rate) + " each.</div></section>";

    var tiles = '<div class="metric-grid">' +
      metricTile(total, "My prospects") + metricTile(approved, "Approved") +
      metricTile(closed, "Closed sales") + metricTile(conv + "%", "Close rate") + "</div>";

    var byStage = STAGES.map(function (s) { return { label: s, n: ps.filter(function (p) { return p.stage === s; }).length }; }).filter(function (x) { return x.n > 0; });
    var maxN = byStage.reduce(function (m, x) { return Math.max(m, x.n); }, 1);
    var bars = byStage.length ? '<section class="card dash-bars"><h2 class="dash-h2">My pipeline by stage</h2>' +
      byStage.map(function (x) {
        return '<div class="bar-row"><span class="bar-label">' + esc(x.label) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.round((x.n / maxN) * 100) + '%"></span></span><span class="bar-count">' + x.n + "</span></div>";
      }).join("") + "</section>" : "";

    var emptyNote = total ? "" : '<p class="result-note">Add and close prospects to grow your commission.</p>';
    content.innerHTML = hero + tiles + emptyNote + bars;
  }

  // Operations/admin console: team totals, per-rep leaderboard, rate + target.
  function renderSalesConsole() {
    setHead("Operations", "Sales & commissions", "Verify closed sales and track each rep's commission.", "", false);
    var rate = commissionRate(), target = commissionTarget();
    var ps = state.prospects || [];
    var totalClosed = ps.filter(function (p) { return p.closedSale; }).length;
    var totalComm = totalClosed * rate;

    var hero = '<section class="card dash-hero">' +
      '<p class="dash-eyebrow">Commission earned by the team</p>' +
      '<div class="dash-big">' + money(totalComm) + "</div>" +
      '<div class="dash-sub">' + totalClosed + " closed " + (totalClosed === 1 ? "sale" : "sales") + " × " + money(rate) + " each</div></section>";

    // Per-rep leaderboard (anyone who has created prospects), best first.
    var byEmail = {};
    ps.forEach(function (p) {
      var key = (p.createdByEmail || "").toLowerCase();
      if (!key) return;
      if (!byEmail[key]) byEmail[key] = { name: p.createdBy || key, email: key, prospects: 0, closed: 0, approved: 0 };
      byEmail[key].prospects++;
      if (p.closedSale) byEmail[key].closed++;
      if (p.reviewStatus === "approved") byEmail[key].approved++;
    });
    (state.users || []).forEach(function (u) {
      var key = (u.email || "").toLowerCase();
      if (key && byEmail[key]) byEmail[key].name = u.name || byEmail[key].name;
    });
    var reps = Object.keys(byEmail).map(function (k) { return byEmail[k]; })
      .sort(function (a, b) { return b.closed - a.closed || b.prospects - a.prospects; });

    var board = reps.length ? '<section class="card dash-bars"><h2 class="dash-h2">Salespeople</h2>' +
      '<div class="lead-head"><span>Rep</span><span>Closed</span><span>Commission</span></div>' +
      reps.map(function (r) {
        return '<div class="lead-row"><span class="lead-name"><strong>' + esc(r.name) + "</strong><small>" + r.prospects + " prospects · " + r.approved + " approved</small></span>" +
          '<span class="lead-closed">' + r.closed + "</span>" +
          '<span class="lead-comm">' + money(r.closed * rate) + "</span></div>";
      }).join("") + "</section>" : '<p class="result-note">No sales activity yet. Closed sales appear here once you verify them on a prospect.</p>';

    var editor = '<section class="card settings-card"><h2>Commission settings</h2>' +
      "<p>Each closed sale you verify earns the rep this much. Set the monthly target reps are working toward.</p>" +
      '<form id="commissionForm" class="add-member">' +
      '<div class="field"><label for="commRate">Per closed sale (UGX)</label><input id="commRate" name="commRate" type="number" inputmode="numeric" min="0" step="1000" value="' + rate + '"></div>' +
      '<div class="field"><label for="commTarget">Monthly target (UGX)</label><input id="commTarget" name="commTarget" type="number" inputmode="numeric" min="0" step="10000" value="' + target + '"></div>' +
      '<button type="submit" class="btn btn-ghost btn-block">Save commission settings</button></form></section>';

    content.innerHTML = hero + board +
      '<p class="result-note">Mark a sale as closed from any prospect (Prospects tab) — that verification credits the rep.</p>' +
      rosterCard() + editor;
  }

  // Manage the sales roster from the console (Operations + admins). Scoped to
  // Sales/Operations members — Owner and Technical accounts stay in Settings.
  function rosterCard() {
    // Only the Sales/Operations roster — Owner and Technical (super-admins)
    // are managed by the Owner in Settings, not shown here.
    var users = (state.users || []).filter(function (u) { return u.id !== ownerId() && u.role !== "admin"; });
    var manageableRoleOpts = function (sel) {
      return [["sales", "Sales"], ["operations", "Operations"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === normRole(sel) ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("");
    };
    var rows = users.map(function (u) {
      var actions = "";
      if (actorCanManage(u)) {
        actions += '<select class="account-role-select" data-set-role data-user-id="' + esc(u.id) + '" aria-label="Role for ' + esc(u.name) + '">' + manageableRoleOpts(u.role) + "</select>";
        actions += '<button type="button" class="account-remove" data-remove-user="' + esc(u.id) + '" aria-label="Remove ' + esc(u.name) + '">Remove</button>';
      }
      return '<div class="account-row" style="background:var(--fill-2)"><span class="user-avatar" aria-hidden="true">' + esc(initials(u.name)) + "</span>" +
        '<span class="who"><strong>' + esc(u.name) + " · " + esc(roleName(u)) + "</strong><span>" + esc(u.email) + "</span></span>" +
        (actions ? '<span class="row-actions">' + actions + "</span>" : "") + "</div>";
    }).join("");
    return '<section class="card settings-card"><h2>Manage the team</h2>' +
      "<p>Add or remove salespeople and Operations, and switch their roles. Owner and Technical accounts are managed by the Owner in Settings. Removing someone revokes access immediately.</p>" +
      (users.length ? '<div class="account-list">' + rows + "</div>" : '<p class="settings-note">No sales or operations members yet — add the first one below.</p>') +
      '<form id="addMemberForm" class="add-member">' +
      '<div class="field"><label for="memberName">Name</label><input id="memberName" name="name" type="text" autocomplete="off" placeholder="e.g. Grace Namubiru" required></div>' +
      '<div class="field"><label for="memberEmail">Email</label><input id="memberEmail" name="email" type="email" inputmode="email" autocomplete="off" autocapitalize="off" placeholder="grace@example.com" required></div>' +
      '<div class="field"><label for="memberRole">Role</label><select id="memberRole" name="role">' +
      '<option value="sales">Sales — prospects &amp; visits</option>' +
      '<option value="operations">Operations — also Cash flow</option></select></div>' +
      '<button type="submit" class="btn btn-ghost btn-block">Add team member</button></form></section>';
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
      var opts = (state.prospects || []).slice()
        .sort(function (a, b) { return (b.closedSale ? 1 : 0) - (a.closedSale ? 1 : 0) || (a.business || "").localeCompare(b.business || ""); })
        .map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === pickVal ? " selected" : "") + ">" + esc(p.business) + (p.closedSale ? " — closed sale" : "") + "</option>"; }).join("");
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

  /* -------------------------------- QUOTES ---------------------------------- */
  function quoteTierChip(t) { return t === "Very Complex" ? chip(t, "red", "!") : t === "Complex" ? chip(t, "amber", "◔") : t === "Standard" ? chip(t, "cyan", "★") : chip(t || "Simple", "grey", "•"); }
  function quoteStatusChip(s) { if (s === "Accepted") return chip(s, "green", "✓"); if (s === "Rejected") return chip(s, "red", "✕"); if (s === "Sent") return chip(s, "cyan", "→"); if (s === "Expired") return chip(s, "grey", "•"); return chip(s || "Draft", "amber", "◔"); }
  function newQuoteRef() { var n = (state.quotes || []).length + 1; return "Q-" + String(today || "2026").slice(0, 4) + "-" + ("000" + n).slice(-4); }
  var quoteFilter = "all";

  function renderQuotes() {
    setHead("Operations", "Quotes", "Build a professional site quote in minutes — priced by the rubric.", "New quote", true);
    var qs = state.quotes || [];
    var open = qs.filter(function (q) { return q.status !== "Rejected" && q.status !== "Expired"; });
    var pipeline = open.reduce(function (s, q) { return s + computeQuote(q).cash; }, 0);
    var summary = '<section class="card cash-summary"><div class="cash-bal"><span class="k">Open pipeline</span><strong>' + money(pipeline) + "</strong>" +
      "<small>" + open.length + " open · " + qs.length + " total</small></div></section>";
    var filterBar = '<div class="toolbar"><div class="field-inline" style="flex:1"><label for="quoteFilter">Show</label><select id="quoteFilter">' +
      [["all", "All quotes"]].concat(QUOTE_STATUSES.map(function (s) { return [s, s]; })).map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === quoteFilter ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div></div>";
    var rows = qs.filter(function (q) { return quoteFilter === "all" || q.status === quoteFilter; })
      .sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || "") || (b.quoteRef || "").localeCompare(a.quoteRef || ""); });
    var list = rows.length ? '<div class="list">' + rows.map(quoteCard).join("") + "</div>" :
      emptyState(ICON_INSTALL, "No quotes yet", "Tap New quote to price a site with the rubric.", "New quote", 'data-new="quote"');
    content.innerHTML = summary + filterBar + '<p class="result-note">' + rows.length + (rows.length === 1 ? " quote" : " quotes") + "</p>" + list;
  }

  function quoteCard(q) {
    var c = jobClient(q);
    var r = computeQuote(q);
    return '<article class="item" data-edit="quote" data-id="' + q.id + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(c.business || "Untitled") + "</div>" +
      '<div class="item-meta">' + esc(q.quoteRef || "") + " · " + (r.custom ? "12+ cam" : r.cameras + "-cam") + " · " + esc(r.tier) + "</div></div>" + quoteStatusChip(q.status) + "</div>" +
      '<div class="item-lines">' +
      (r.custom ? '<div class="item-line"><span class="k">Total</span><span class="v">Custom — Ben quotes</span></div>' :
        '<div class="item-line"><span class="k">Total (cash)</span><span class="v">' + money(r.cash) + "</span></div>") +
      (r.financingAvailable ? '<div class="item-line"><span class="k">Financed</span><span class="v">' + money(r.financed) + "</span></div>" : "") +
      '<div class="item-line"><span class="k">Added by</span><span class="v">' + esc(q.createdBy || "—") + "</span></div>" +
      (r.needsApproval ? '<div class="item-line"><span class="k">Flag</span><span class="v" style="color:var(--red)">Needs Ben approval</span></div>' : "") +
      "</div></article>";
  }

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

  async function saveQuote(data) {
    if (!canInstalls()) return;
    var prospectId = data.prospectId || "";
    var linked = prospectId ? prospect(prospectId) : null;
    var isLinked = !!(linked && linked.id);
    if (!isLinked && !(data.business || "").trim()) { showFormError("Choose the client for this quote — pick one, or add a walk-in with a name."); return; }
    var inputs = readQuoteInputs();
    var r = computeQuote(inputs);
    if (!isAdmin() && r.discountPct > 5) { showFormError("A discount above 5% needs the Owner — ask Ben to apply it."); return; }
    if (r.needsApproval && !isAdmin()) { showFormError("This scored Very Complex (or 12+ cameras). Send it to Ben to approve before quoting."); return; }
    var status = QUOTE_STATUSES.indexOf(data.status) >= 0 ? data.status : "Draft";
    var fields = Object.assign({
      prospectId: prospectId,
      business: isLinked ? "" : (data.business || "").trim(), contact: isLinked ? "" : (data.contact || "").trim(),
      phone: isLinked ? "" : (data.phone || "").trim(), location: isLinked ? "" : (data.location || "").trim(),
      status: status, notes: (data.notes || "").trim()
    }, inputs);
    if (editing.id) {
      var idx = state.quotes.findIndex(function (x) { return x.id === editing.id; });
      state.quotes[idx] = Object.assign({}, state.quotes[idx], fields);
    } else {
      state.quotes.push(Object.assign({ id: uid(), quoteRef: newQuoteRef(), createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "", createdAt: today }, fields));
    }
    hideFormError(); dialog.close();
    saveData(editing.id ? "Quote updated" : "Quote created"); render();
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
    if (editing.id) {
      var idx = state.jobs.findIndex(function (x) { return x.id === editing.id; });
      state.jobs[idx] = Object.assign({}, state.jobs[idx], fields);
    } else {
      state.jobs.push(Object.assign({ id: uid(), ref: newJobRef(), createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "", createdAt: today }, fields));
    }
    hideFormError(); dialog.close();
    saveData(editing.id ? "Job updated" : "Job created"); render();
  }

  function job(id) { return (state.jobs || []).find(function (x) { return x.id === id; }) || null; }
  function technician(id) { return (state.technicians || []).find(function (t) { return t.id === id; }) || null; }
  function activeTechnicians() { return (state.technicians || []).filter(function (t) { return t.active !== false; }); }
  function installStatusChip(s) {
    if (s === "Handed over") return chip(s, "green", "✓");
    if (s === "Installed") return chip(s, "green", "✓");
    if (s === "In progress") return chip(s, "cyan", "★");
    if (s === "Scheduled") return chip(s, "amber", "◔");
    if (s === "Cancelled") return chip(s, "red", "✕");
    return chip(s || "Quoted", "grey", "•");
  }
  var installFilter = "all";

  function renderInstalls() {
    setHead("Operations", "Installations", "Schedule and run CCTV jobs — client, technician and status.", "New installation", true);
    var jobs = state.installations || [];
    var open = jobs.filter(function (j) { return j.status !== "Handed over" && j.status !== "Cancelled"; }).length;

    var summary = '<section class="card cash-summary"><div class="cash-bal"><span class="k">Open jobs</span><strong>' + open + "</strong>" +
      "<small>" + jobs.length + " total · " + activeTechnicians().length + " active " + (activeTechnicians().length === 1 ? "technician" : "technicians") + "</small></div></section>";

    var filterBar = '<div class="toolbar"><div class="field-inline" style="flex:1"><label for="installFilter">Show</label><select id="installFilter">' +
      [["all", "All jobs"]].concat(INSTALL_STATUSES.map(function (s) { return [s, s]; })).map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === installFilter ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div></div>";

    var rows = jobs.filter(function (j) { return installFilter === "all" || j.status === installFilter; })
      .sort(function (a, b) { return (a.scheduledDate || "9").localeCompare(b.scheduledDate || "9") || (b.createdAt || "").localeCompare(a.createdAt || ""); });
    var list = rows.length ? '<div class="list">' + rows.map(installCard).join("") + "</div>" :
      emptyState(ICON_INSTALL, "No jobs yet", "Turn a closed sale into an installation, or add a standalone job.", "New installation", 'data-new="installation"');

    content.innerHTML = summary + filterBar + '<p class="result-note">' + rows.length + (rows.length === 1 ? " job" : " jobs") + "</p>" + list + technicianRosterCard();
  }

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

  // Job money — all recorded through the cash-flow float, linked by installId.
  function installation(id) { return (state.installations || []).find(function (x) { return x.id === id; }) || null; }
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
    return '<article class="item" data-edit="job" data-id="' + j.id + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(c.business || "Untitled job") + "</div>" +
      '<div class="item-meta">' + esc(j.ref || "") + " · " + (r.custom ? "12+ cam" : (r.cameras ? r.cameras + "-cam" : "—")) + (r.cameras || r.custom ? " · " + esc(r.tier) : "") + "</div></div>" + jobStageChip(j.stage) + "</div>" +
      '<div class="item-lines">' +
      priceLine +
      (delivery ? '<div class="item-line"><span class="k">Scheduled</span><span class="v">' + (j.scheduledDate ? dateLabel(j.scheduledDate) + (j.scheduledTime ? " · " + esc(j.scheduledTime) : "") : "Not set") + "</span></div>" : "") +
      (delivery ? '<div class="item-line"><span class="k">Technician</span><span class="v">' + (tech ? esc(tech.name) : '<span style="color:var(--amber)">Unassigned</span>') + "</span></div>" : "") +
      ((delivery && (val > 0 || paidForJob(j.id) > 0)) ? '<div class="item-line"><span class="k">Paid</span><span class="v">' + money(paidForJob(j.id)) + (val > 0 ? " · " + money(Math.max(0, val - paidForJob(j.id))) + " due" : "") + "</span></div>" : "") +
      (j.stage === "Handed over" || (/progress|installed/i.test(j.stage || "") && checklistDone(j) > 0) ? '<div class="item-line"><span class="k">Checklist</span><span class="v">' + checklistDone(j) + " / " + INSTALL_CHECKLIST.length + (checklistComplete(j.checklist) ? " · done" : "") + "</span></div>" : "") +
      '<div class="item-line"><span class="k">Added by</span><span class="v">' + esc(j.createdBy || "—") + "</span></div>" +
      "</div></article>";
  }

  function installCard(j) {
    var tech = j.technicianId ? technician(j.technicianId) : null;
    var matTotal = materialsTotal(j);
    var c = jobClient(j);
    return '<article class="item" data-edit="installation" data-id="' + j.id + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(c.business || "Untitled job") + "</div>" +
      '<div class="item-meta">' + esc(c.location || "No site") + "</div></div>" + installStatusChip(j.status) + "</div>" +
      '<div class="item-lines">' +
      '<div class="item-line"><span class="k">Scheduled</span><span class="v">' + (j.scheduledDate ? dateLabel(j.scheduledDate) + (j.scheduledTime ? " · " + esc(j.scheduledTime) : "") : "Not set") + "</span></div>" +
      '<div class="item-line"><span class="k">Technician</span><span class="v">' + (tech ? esc(tech.name) : '<span style="color:var(--amber)">Unassigned</span>') + "</span></div>" +
      '<div class="item-line"><span class="k">Contact</span><span class="v">' + esc(c.contact || "—") + (c.phone ? " · " + esc(c.phone) : "") + "</span></div>" +
      (Number(j.quote) > 0 ? '<div class="item-line"><span class="k">Quote</span><span class="v">' + money(j.quote) + "</span></div>" : "") +
      ((Number(j.quote) > 0 || paidForJob(j.id) > 0) ? '<div class="item-line"><span class="k">Paid</span><span class="v">' + money(paidForJob(j.id)) + (Number(j.quote) > 0 ? " · " + money(Math.max(0, Number(j.quote) - paidForJob(j.id))) + " due" : "") + "</span></div>" : "") +
      (matTotal > 0 ? '<div class="item-line"><span class="k">Materials</span><span class="v">' + materialsCount(j) + " item" + (materialsCount(j) === 1 ? "" : "s") + " · " + money(matTotal) + "</span></div>" : "") +
      (checklistDone(j) > 0 || /progress|installed|handed/i.test(j.status || "") ? '<div class="item-line"><span class="k">Checklist</span><span class="v">' + checklistDone(j) + " / " + INSTALL_CHECKLIST.length + (checklistComplete(j.checklist) ? " · done" : "") + "</span></div>" : "") +
      "</div></article>";
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

  async function saveInstallation(data) {
    if (!canInstalls()) return;
    var prospectId = data.prospectId || "";
    var linked = prospectId ? prospect(prospectId) : null;
    var isLinked = !!(linked && linked.id);
    // Linked jobs take client details from the prospect (not stored here);
    // standalone jobs store their own.
    var client = isLinked ? { business: "", contact: "", phone: "", location: "" }
      : { business: (data.business || "").trim(), contact: (data.contact || "").trim(), phone: (data.phone || "").trim(), location: (data.location || "").trim() };
    if (!isLinked && !client.business) { showFormError(editing.id ? "Enter the client / business name." : "Choose the client for this installation — pick one from Sales, or add a walk-in with a name."); return; }
    var status = INSTALL_STATUSES.indexOf(data.status) >= 0 ? data.status : "Quoted";
    var checklist = collectChecklist();
    // Can't hand over until the completion checklist is done.
    if (status === "Handed over" && !checklistComplete(checklist)) {
      var missing = INSTALL_CHECKLIST.filter(function (i) { return !checklist[i.key]; }).map(function (i) { return i.label.toLowerCase(); });
      showFormError("Not ready to hand over — first tick: " + listAnd(missing) + ".");
      return;
    }
    var quote = Math.max(0, Math.round(Number(data.quote) || 0));
    var fields = {
      prospectId: prospectId, business: client.business, contact: client.contact, phone: client.phone,
      location: client.location, status: status, scheduledDate: data.scheduledDate || "", scheduledTime: data.scheduledTime || "",
      technicianId: data.technicianId || "", quote: quote, siteNotes: (data.siteNotes || "").trim(), materials: collectMaterials(), checklist: checklist
    };
    if (editing.id) {
      var idx = state.installations.findIndex(function (x) { return x.id === editing.id; });
      state.installations[idx] = Object.assign({}, state.installations[idx], fields);
    } else {
      state.installations.push(Object.assign({ id: uid(), createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "", createdAt: today }, fields));
    }
    hideFormError(); dialog.close();
    saveData(editing.id ? "Installation updated" : "Installation created"); render();
  }

  function renderCashflow() {
    setHead("Operations", "Cash flow", "Record money in and out, back each with proof, and keep the float reconciled.", "Add money", true);
    var txs = state.transactions || [];
    var sumBy = function (dir) { return txs.filter(function (t) { return t.status === "approved" && t.direction === dir; }).reduce(function (s, t) { return s + Number(t.amount || 0); }, 0); };
    var approvedIn = sumBy("in"), approvedOut = sumBy("out"), balance = approvedIn - approvedOut;
    var pending = txs.filter(function (t) { return t.status !== "approved"; });
    var onHand = availableForOut(null); // includes pending — what can still be spent

    var summary = '<section class="card cash-summary"><div class="cash-bal"><span class="k">Float balance</span><strong>' + money(balance) + "</strong>" +
      '<small>Approved in ' + money(approvedIn) + " · out " + money(approvedOut) + "</small>" +
      (onHand !== balance ? '<small>Cash on hand now (incl. pending): ' + money(onHand) + "</small>" : "") + "</div>" +
      (pending.length ? '<div class="cash-pending">' + chip(pending.length + " awaiting review", "amber", "◔") + "</div>" : "") + "</section>";

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

    var rows = txs.filter(function (t) { return cashFilter === "all" || t.status === cashFilter; })
      .sort(function (a, b) { return (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || ""); });

    var list = rows.length ? '<div class="list">' + rows.map(txCard).join("") + "</div>" :
      emptyState(ICON_CASH, "No entries yet", "Tap Add money to record your first cash movement.", "Add money", 'data-new="transaction"');

    content.innerHTML = summary + review + '<h2 class="ledger-head">All entries</h2>' + filterBar + '<p class="result-note">' + rows.length + (rows.length === 1 ? " entry" : " entries") + "</p>" + list;
    hydrateProofThumbs();
  }

  // "Category · Paid by · Business" line shared by both card styles.
  function txMeta(t) {
    var p = t.prospectId ? prospect(t.prospectId) : null;
    var job = t.installId ? installation(t.installId) : null;
    var bits = [esc(t.category || "Uncategorised")];
    if (t.method) bits.push(esc(t.method));
    if (job && job.business) bits.push("Job: " + esc(job.business));
    else if (p && p.business) bits.push(esc(p.business));
    return bits.join(" · ");
  }

  // A single card in the admin review queue: receipt inline + quick actions.
  function reviewCard(t) {
    var sign = t.direction === "in" ? "+" : "−";
    var proof = t.direction !== "out" ? "" : (t.proofId
      ? '<button type="button" class="rev-proof" data-photo data-proof-id="' + esc(t.proofId) + '" aria-label="View receipt full screen"><span class="rev-proof-load">Loading receipt…</span></button>'
      : (needsProof(t)
        ? '<p class="rev-noproof">No receipt attached. Send it back and ask for a photo before approving.</p>'
        : '<p class="rev-petty">Petty cash under ' + money(pettyLimit()) + " — a receipt is optional. You can approve on the note alone.</p>"));
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
      (t.direction === "out" ? '<div class="item-line"><span class="k">Proof</span><span class="v">' + (t.proofId ? "Attached" : (hasQueuedPhoto(t.id) ? '<span style="color:var(--muted)">Photo waiting to upload</span>' : '<span style="color:var(--amber)">No proof yet</span>')) + "</span></div>" : "") + "</div></article>";
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
      var upd = Object.assign({}, prev, { direction: direction, amount: amount, date: data.date, category: data.category, method: method, prospectId: prospectId, note: note, proofId: proofId, installId: data.installId || prev.installId || "" });
      if (!isAdmin() && prev.status === "query") { upd.status = "pending"; upd.reviewNote = ""; } // resubmit after a send-back
      state.transactions[idx] = upd;
    } else {
      state.transactions.push({
        id: txId, direction: direction, amount: amount, date: data.date || today, category: data.category, method: method,
        prospectId: prospectId, note: note, proofId: proofId, installId: data.installId || "",
        createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "",
        createdAt: today, status: "pending", reviewedBy: "", reviewedAt: "", reviewNote: ""
      });
    }
    if (queuePhoto) await queueUpload(txId, pendingProof);
    pendingProof = null;
    saveBtn.disabled = false;
    hideFormError(); dialog.close();
    saveData(queuePhoto ? "Saved on this device. The photo will upload when you're back online." : (editing.id ? "Cash entry updated" : "Cash entry added"));
    render();
  }
  /* -------- Save a prospect (business photo + live location + audit) -------- */
  async function saveProspect(data) {
    var saveBtn = document.getElementById("saveButton");
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
      var merged = Object.assign({}, prev, data, { id: editing.id, photoId: photoId });
      // A Sales edit re-opens the audit: a sent-back prospect returns to the
      // queue, and an approved one that actually changed goes back to pending.
      if (!canReviewProspects()) {
        if (prev.reviewStatus === "query") { merged.reviewStatus = "pending"; merged.reviewNote = ""; reopened = true; }
        else if (prev.reviewStatus === "approved" && prospectChanged(prev, data, photoPicked)) {
          merged.reviewStatus = "pending"; merged.reviewedBy = ""; merged.reviewedAt = ""; merged.reviewNote = ""; reopened = true;
        }
      }
      state.prospects[idx] = merged;
    } else {
      // Capture location on first submit (best-effort — never blocks).
      saveBtn.disabled = true; saveBtn.textContent = "Getting location…";
      var geo = await captureGeo();
      var reviewer = canReviewProspects();
      state.prospects.push(Object.assign({}, data, {
        id: pid, created: today,
        createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "",
        photoId: photoId, geo: geo, followUps: [],
        reviewStatus: reviewer ? "approved" : "pending",
        reviewedBy: reviewer ? (settings.user && settings.user.name) || "" : "",
        reviewedAt: reviewer ? today : "", reviewNote: ""
      }));
    }
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
    if (t.direction === "out" && !t.proofId && !pendingProof && (t.amount || 0) > pettyLimit()) { showFormError("Attach a proof photo before approving. (Receipts are only optional for petty cash under " + money(pettyLimit()) + ".)"); return; }
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

  /* -------------------------------- SETTINGS -------------------------------- */
  function renderSettings() {
    setHead("Owner settings", "Settings", "Team, connection, and data.", "", false);
    var users = state.users || [];
    var me = settings.user || {};
    var ownId = ownerId();
    var roleOpts = function (sel) {
      return [["sales", "Sales"], ["operations", "Operations"], ["admin", "Technical"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === sel ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("");
    };
    var teamRows = users.length ? '<div class="account-list">' + users.map(function (u) {
      var manageable = u.id !== ownId && u.id !== me.id;
      var actions = "";
      if (manageable) {
        actions += '<select class="account-role-select" data-set-role data-user-id="' + esc(u.id) + '" aria-label="Role for ' + esc(u.name) + '">' + roleOpts(normRole(u.role)) + "</select>";
        actions += '<button type="button" class="account-remove" data-remove-user="' + esc(u.id) + '" aria-label="Remove ' + esc(u.name) + '">Remove</button>';
      }
      return '<div class="account-row" style="background:var(--fill-2)"><span class="user-avatar" aria-hidden="true">' + esc(initials(u.name)) + "</span>" +
        '<span class="who"><strong>' + esc(u.name) + " · " + esc(roleName(u)) + "</strong><span>" + esc(u.email) + "</span></span>" +
        (actions ? '<span class="row-actions">' + actions + "</span>" : "") + "</div>";
    }).join("") + "</div>" : '<p class="settings-note">No accounts yet.</p>';
    content.innerHTML = '<div class="settings-grid">' +
      '<section class="card settings-card"><h2>Team members</h2>' +
      "<p><strong>Sales</strong> see prospects and visits. <strong>Operations</strong> also get the Cash flow tab. <strong>Technical</strong> can also open this Settings page. Removing someone revokes access immediately.</p>" +
      teamRows +
      '<form id="addMemberForm" class="add-member">' +
      '<div class="field"><label for="memberName">Name</label><input id="memberName" name="name" type="text" autocomplete="off" placeholder="e.g. Grace Namubiru" required></div>' +
      '<div class="field"><label for="memberEmail">Email</label><input id="memberEmail" name="email" type="email" inputmode="email" autocomplete="off" autocapitalize="off" placeholder="grace@example.com" required></div>' +
      '<div class="field"><label for="memberRole">Role</label><select id="memberRole" name="role">' +
      '<option value="sales">Sales — prospects &amp; visits</option>' +
      '<option value="operations">Operations — also Cash flow</option>' +
      '<option value="admin">Technical — also Settings</option></select></div>' +
      '<button type="submit" class="btn btn-ghost btn-block">Add team member</button>' +
      "</form></section>" +

      '<section class="card settings-card"><h2>Shared workspace</h2>' +
      "<p>Everyone signs in with their own email, verified by Supabase. Records sync securely through Netlify.</p>" +
      '<div class="conn-status" data-state="' + connection.state + '"><span class="dot"></span><span class="conn-label">' + esc(connection.text) + "</span></div>" +
      '<div class="button-row"><button class="btn btn-ghost" data-sync>Refresh shared data</button></div></section>' +

      '<section class="card settings-card"><h2>Cash flow</h2>' +
      "<p>Set the petty-cash limit. Money out below this can be approved without a formal receipt — a note or a photo of the item is enough. Set it to 0 to always require a receipt.</p>" +
      '<form id="pettyForm" class="add-member"><div class="field"><label for="pettyLimit">Petty-cash limit (UGX)</label>' +
      '<input id="pettyLimit" name="pettyLimit" type="number" inputmode="numeric" min="0" step="1000" value="' + pettyLimit() + '"></div>' +
      '<button type="submit" class="btn btn-ghost btn-block">Save limit</button></form></section>' +

      '<section class="card settings-card"><h2>Backup &amp; restore</h2>' +
      '<p>Download a JSON backup any time, or import one to recover your records.</p>' +
      '<div class="button-row"><button class="btn btn-ghost" data-export>Download JSON backup</button>' +
      '<button class="btn btn-ghost" data-import>Import backup</button></div></section>' +

      '<section class="card settings-card"><h2>Danger zone</h2>' +
      '<p class="settings-note">Resetting erases <strong>all prospects, visits and team accounts — for everyone</strong> — and loads sample data. It cannot be undone. Download a backup first if unsure.</p>' +
      '<div class="button-row"><button class="btn btn-danger" data-reset>Reset to demo data…</button></div></section>' +

      '<section class="card settings-card"><h2>How Verisko Operations works</h2>' +
      '<p class="settings-note">One connected platform for the whole team. <strong>Sales</strong> capture and qualify leads and book site visits. <strong>Operations</strong> review them, run the cash-flow float, verify closed sales, and manage installations end to end. The <strong>Owner</strong> and Technical see the whole picture. Each person sees only what their role needs — and data captured once flows through, so nobody re-enters it.</p>' +
      '<p class="settings-note">Set each person\'s role above. As the business grows — installers, accounts, more field teams — add them here and they work from the same records.</p></section>' +
      "</div>";
  }

  /* --------------------------------- Forms ---------------------------------- */
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
      document.getElementById("dialogTitle").textContent = id ? "Edit prospect" : "Add prospect";
      // Normalise legacy free-text camera values into a simple Yes/No.
      var cameras = source.existing == null || source.existing === "" ? "" :
        (/^(no|none)$/i.test(String(source.existing).trim()) ? "No" : "Yes");
      html +=
        // Essentials — the least typing needed for a good handoff.
        field("business", "Business name", "text", source.business, { required: true, full: true, placeholder: "e.g. Acacia Pharmacy" }) +
        field("contact", "Contact person", "text", source.contact, { placeholder: "Who you speak to" }) +
        field("phone", "Phone number", "tel", source.phone, { help: "Needed to confirm a visit." }) +
        field("location", "Location", "text", source.location, { full: true, placeholder: "Area, street or landmark" }) +
        field("vertical", "Business type", "select", source.vertical || VERTICALS[0], { options: VERTICALS, full: true }) +

        // Quick taps — no typing.
        field("decisionMaker", "Spoke to the decision-maker?", "segmented", source.decisionMaker || "Unknown", { full: true, options: [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }, { value: "Unknown", label: "Not sure" }] }) +
        field("existing", "Do they already have cameras?", "segmented", cameras, { full: true, options: ["No", "Yes"] }) +
        field("budget", "Budget", "segmented", source.budget || "", { full: true, options: ["Has budget", "Price-sensitive", "Not discussed"] }) +

        field("stage", "Stage", "select", source.stage || "New prospect", { options: STAGES }) +
        field("followUp", "Follow up on", "date", source.followUp || (id ? "" : today)) +
        '<div class="field full"><label for="f_nextAction">Next action</label>' +
        '<input id="f_nextAction" name="nextAction" type="text" list="nextActionList" autocomplete="off" placeholder="Tap a suggestion or type" value="' + esc(source.nextAction || "") + '">' +
        '<datalist id="nextActionList">' + NEXT_ACTIONS.map(function (a) { return "<option>" + esc(a) + "</option>"; }).join("") + "</datalist></div>" +

        // Optional — only if it helps Operations.
        '<div class="field-group-title">Optional details</div>' +
        field("source", "Lead source", "select", source.source || SOURCES[0], { options: SOURCES, optional: true }) +
        field("concern", "Main security concern", "textarea", source.concern, { full: true, optional: true, placeholder: "What are they worried about?" }) +
        field("areas", "Areas to cover", "text", source.areas, { full: true, optional: true, placeholder: "e.g. Entrance, till, store" }) +
        field("notes", "Notes for Operations", "textarea", source.notes, { full: true, optional: true }) +

        // Audit: a photo of the business and the salesperson's live location.
        '<div class="field full"><label>Business photo <span class="optional-tag">helps Operations verify</span></label>' + proofControl(source.photoId) +
        (id ? (source.geo ? '<p class="helper">Location on file: ' + mapLink(source.geo) + "</p>" : "") : '<p class="helper">Your live location is captured when you submit.</p>') + "</div>";
      if (id) {
        if (source.reviewStatus === "query" && source.reviewNote) {
          html += '<div class="field full"><div class="rev-noproof">Sent back: ' + esc(source.reviewNote) + "</div></div>";
        }
        // Operations verify a closed sale here — earns the rep their commission.
        if (canReviewProspects()) {
          var hasInstall = (state.installations || []).some(function (j) { return j.prospectId === id; });
          html += '<div class="field full">' +
            (source.closedSale ? '<p class="helper" style="color:var(--green);font-weight:600">Verified closed sale — ' + money(commissionRate()) + " commission to " + esc(source.createdBy || "the rep") + ".</p>" : "") +
            '<button type="button" class="btn ' + (source.closedSale ? "btn-ghost" : "btn-primary") + ' btn-block" data-toggle-closed="' + esc(id) + '">' + (source.closedSale ? "Remove closed sale" : "Mark as closed sale (" + money(commissionRate()) + ")") + "</button>" +
            (source.closedSale && !hasInstall ? '<button type="button" class="btn btn-cyan btn-block" data-make-install="' + esc(id) + '" style="margin-top:10px">Create installation from this sale</button>' : "") +
            (source.closedSale && hasInstall ? '<p class="helper">An installation already exists for this client.</p>' : "") + "</div>";
        }
        html += '<div class="field full followup-block"><label>Follow-ups</label>' + followUpHistory(source) +
          '<button type="button" class="btn btn-ghost btn-block" data-log-followup="' + esc(id) + '" style="margin-top:10px">Log a follow-up (with location)</button></div>';
      }
    }
    if (type === "appointment") {
      document.getElementById("dialogTitle").textContent = id ? "Edit site visit" : "Schedule site visit";
      var options = state.prospects.map(function (p) { return { value: p.id, label: p.business }; });
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
      var linkJob = linkInstall ? (state.installations || []).find(function (j) { return j.id === linkInstall; }) : null;
      html +=
        (linkJob ? '<div class="field full"><div class="rev-petty">For installation: <strong>' + esc(linkJob.business) + "</strong>" + (dir === "in" ? " — client payment" : " — job spend") + "</div></div>" : "") +
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
        '<div class="field full"><label>Proof of payment <span class="optional-tag">photo or MoMo SMS</span></label>' + proofControl(source.proofId) +
        (pettyLimit() > 0 ? '<p class="helper">Optional for petty cash under ' + money(pettyLimit()) + " — a note is enough.</p>" : "") + "</div></div>" +
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
    var tcf = e.target.closest("[data-toggle-closed]"); if (tcf) { toggleClosedSale(tcf.getAttribute("data-toggle-closed")); return; }
    var mi = e.target.closest("[data-make-install]"); if (mi) { openForm("job", null, mi.getAttribute("data-make-install")); return; }
    var jph = e.target.closest("[data-job-photo]"); if (jph) { fetchProof(jph.getAttribute("data-job-photo")).then(function (img) { if (img) openPhoto(img); }); return; }
    var jpay = e.target.closest("[data-job-pay]"); if (jpay) { txPreset = { direction: "in", category: "Customer payment", installId: jpay.getAttribute("data-job-pay") }; openForm("transaction"); return; }
    var jspend = e.target.closest("[data-job-spend]"); if (jspend) { var jid = jspend.getAttribute("data-job-spend"); var jb = job(jid); txPreset = { direction: "out", category: "Cable & materials", installId: jid, amount: jb ? materialsTotal(jb) : "" }; openForm("transaction"); return; }
    if (e.target.closest("[data-proof-pick]")) { var pi = document.getElementById("proofInput"); if (pi) pi.click(); return; }
    if (e.target.closest("[data-approve]")) { approveTransaction(); return; }
    if (e.target.closest("[data-sendback]")) { sendBackTransaction(); return; }
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

  /* -------- Closed sales & commission (Operations-verified, UGX 80k) -------- */
  function commissionRate() { var n = state.config && Number(state.config.commissionPerSale); return n > 0 ? n : 80000; }
  function commissionTarget() { var n = state.config && Number(state.config.commissionTarget); return n > 0 ? n : 1600000; }
  function closedSalesFor(email) {
    email = (email || "").toLowerCase();
    return (state.prospects || []).filter(function (p) { return p.closedSale && (p.createdByEmail || "").toLowerCase() === email; }).length;
  }
  function closedSaleChip(p) { return p.closedSale ? chip("Closed sale", "green", "✓") : ""; }
  // Only Operations/admins mark a sale closed — that verification earns the rep 80k.
  function toggleClosedSale(id) {
    if (!canReviewProspects()) return;
    var p = prospect(id); if (!p || !p.id) return;
    if (p.closedSale) {
      p.closedSale = false; p.closedBy = ""; p.closedAt = "";
      saveData("Closed sale removed");
    } else {
      p.closedSale = true; p.closedBy = (settings.user && settings.user.name) || ""; p.closedAt = today;
      saveData("Closed sale verified — " + money(commissionRate()) + " commission");
    }
    render();
    if (dialog.open && editing && editing.type === "prospect" && editing.id === id) openForm("prospect", id);
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
  function captureGeo() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      var done = false;
      var finish = function (v) { if (done) return; done = true; resolve(v); };
      setTimeout(function () { finish(null); }, 9000);
      navigator.geolocation.getCurrentPosition(
        function (pos) { finish({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6), acc: Math.round(pos.coords.accuracy || 0), at: nowIso() }); },
        function () { finish(null); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
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
    if (canReviewProspects()) return ps.filter(needsReview).length;
    var mine = (settings.user && settings.user.email || "").toLowerCase();
    return ps.filter(function (p) { return p.reviewStatus === "query" && (p.createdByEmail || "").toLowerCase() === mine; }).length;
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
      return '<div class="followup-item"><div class="followup-meta">' + esc(dateTimeLabel(f.at)) + " · " + esc(f.by || "—") + (f.geo ? " · " + mapLink(f.geo) : " · <span class=\"nogeo\">no location</span>") + "</div>" +
        '<div class="followup-note">' + esc(f.note || "") + "</div></div>";
    }).join("") + "</div>";
  }

  async function logFollowUp(id) {
    var p = prospect(id);
    if (!p || !p.id) return;
    // Mostly taps: pick what happened, optionally add a note.
    var r = await openSheet({ title: "Log a follow-up", body: p.business,
      choices: ["Called", "No answer", "Visited", "Messaged", "Quoted"], input: { placeholder: "Add a note (optional)" },
      requireValue: true, confirmLabel: "Log follow-up" });
    if (!r) return;
    var note = combineNote(r);
    toast("Getting your location…");
    var geo = await captureGeo();
    if (!p.followUps) p.followUps = [];
    p.followUps.push({ at: nowIso(), by: (settings.user && settings.user.name) || "", byEmail: (settings.user && settings.user.email) || "", note: note, geo: geo });
    saveData("Follow-up logged" + (geo ? " with location" : " (no location)"));
    render();
    // If the prospect's form is open, refresh it so the new entry shows.
    if (dialog.open && editing && editing.type === "prospect" && editing.id === id) openForm("prospect", id);
  }

  // Review queue card for a pending prospect (reviewers only).
  function prospectReviewCard(p) {
    var photo = p.photoId
      ? '<button type="button" class="rev-proof" data-photo data-proof-id="' + esc(p.photoId) + '" aria-label="View business photo full screen"><span class="rev-proof-load">Loading photo…</span></button>'
      : '<p class="rev-petty">No business photo yet — you can approve, or send it back to ask for one.</p>';
    return '<article class="card rev-card" data-id="' + p.id + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(p.business) + "</div>" +
      '<div class="item-meta">' + esc(p.vertical || "—") + " · " + esc(p.location || "No location") + "</div></div>" + stageChip(p.stage) + "</div>" +
      '<div class="item-lines"><div class="item-line"><span class="k">Contact</span><span class="v">' + esc(p.contact || "Unknown") + (p.phone ? " · " + esc(p.phone) : "") + "</span></div>" +
      '<div class="item-line"><span class="k">Added by</span><span class="v">' + esc(p.createdBy || "—") + "</span></div>" +
      '<div class="item-line"><span class="k">Location</span><span class="v">' + (p.geo ? mapLink(p.geo, "View on map") : '<span style="color:var(--muted)">not captured</span>') + "</span></div>" +
      (p.decisionMaker && p.decisionMaker !== "Unknown" ? '<div class="item-line"><span class="k">Decision-maker</span><span class="v">' + esc(p.decisionMaker) + "</span></div>" : "") +
      (p.budget ? '<div class="item-line"><span class="k">Budget</span><span class="v">' + esc(p.budget) + "</span></div>" : "") +
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
      choices: ["Add a photo", "Confirm the location", "Wrong details", "Add contact/phone"], input: { placeholder: "Add a note (optional)" },
      requireValue: true, confirmLabel: "Send back" });
    if (!r) return;
    p.reviewStatus = "query"; p.reviewNote = combineNote(r); p.reviewedBy = (settings.user && settings.user.name) || ""; p.reviewedAt = today;
    saveData("Prospect sent back"); render();
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
      if (res.status === 403) return "unauth";
      var result = await res.json();
      if (!result.ok) return "unauth";
      if (result.data && result.data.prospects) {
        state = { prospects: result.data.prospects || [], appointments: result.data.appointments || [], users: result.data.users || [], transactions: result.data.transactions || [], jobs: result.data.jobs, installations: result.data.installations || [], quotes: result.data.quotes || [], technicians: result.data.technicians || [], config: result.data.config && typeof result.data.config === "object" ? result.data.config : defaultConfig() };
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
    if (result === "ok") { resolveUser(); setSync("connected", "Synced"); toast("Data refreshed"); render(); }
    else if (result === "signin") { signOutLocal(); showLogin("Your session expired. Please sign in again."); }
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
    renderLogin("email", message);
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
    } else {
      html += '<p class="lock-eyebrow" id="lockTitle">Uganda Operations</p>' +
        '<p class="lock-sub">Sign in with your email — we\'ll send you a secure sign-in link.</p>' +
        '<form id="loginForm" class="account-fields" data-step="email">' +
        '<div class="field"><label for="loginEmailInput">Email</label>' +
        '<input id="loginEmailInput" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="' + esc(loginEmail) + '" required></div>' +
        errHtml +
        '<button type="submit" class="btn btn-primary btn-block" id="loginBtn">Email me a sign-in link</button></form>' +
        '<p class="lock-help">Ask the owner to add your email if you can\'t get in.</p>';
    }
    lockCard.innerHTML = html;
    var first = lockCard.querySelector("input");
    if (first) first.focus();
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

  async function afterVerify(email, session) {
    settings.auth = { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at, email: email };
    saveSettings();
    var s = await loadShared();
    if (s === "unauth") { signOutLocal(); showDenied(email, false); return; }
    if (s === "offline") { renderLogin("email", "Signed in, but the workspace is unreachable. Check your connection."); return; }
    var existing = (state.users || []).find(function (u) { return u.email.toLowerCase() === email.toLowerCase(); });
    if (existing) { settings.user = existing; saveSettings(); toast("Signed in as " + existing.name.split(/\s+/)[0]); enterApp(); return; }
    if ((state.users || []).length === 0) { renderLogin("name"); return; } // bootstrap the owner
    signOutLocal(); showDenied(email, false);
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
    document.getElementById("userMenuEmail").textContent = u.email;
  }
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
  function moreViewsForRole() {
    var v = [];
    if (canInstalls()) { v.push("quotes"); v.push("installs"); v.push("cashflow"); }
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
    var moreBtn = document.querySelector(".mainnav [data-more]");
    if (moreBtn) moreBtn.hidden = moreViewsForRole().length === 0;
    if (view === "settings" && !isAdmin()) view = "today";
    if ((view === "cashflow" || view === "installs" || view === "quotes") && !canInstalls()) view = "today";
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
    return "Sales";
  }

  // Normalise a role input to one of: admin (Technical), operations, sales.
  function normRole(role) { return role === "admin" ? "admin" : role === "operations" ? "operations" : "sales"; }

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
    if (!(await confirmSheet("Remove " + u.name + "?", u.email + " loses access immediately and can't sign in again unless you re-add them. This can't be undone.", "Remove", true))) return;
    state.users = state.users.filter(function (x) { return x.id !== id; });
    saveData();
    render();
    toast(u.name.split(/\s+/)[0] + " removed from the team");
  }

  // Danger zone: wipe everything and load demo data (type-to-confirm).
  async function resetDemo() {
    var r = await openSheet({
      title: "Reset everything?",
      body: "This ERASES all prospects, visits and team accounts for everyone, and loads sample data. It cannot be undone.",
      input: { placeholder: "Type RESET to confirm", confirmWord: "RESET" },
      confirmLabel: "Reset everything", danger: true
    });
    if (!r) return;
    state = JSON.parse(JSON.stringify(seed));
    saveData("Reset to demo data");
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
        state = { prospects: parsed.prospects, appointments: parsed.appointments, users: parsed.users || state.users || [], transactions: parsed.transactions || state.transactions || [], jobs: parsed.jobs, installations: parsed.installations || [], quotes: parsed.quotes || [], technicians: parsed.technicians || state.technicians || [], config: parsed.config && typeof parsed.config === "object" ? parsed.config : (state.config || defaultConfig()) };
        migrateToJobs(state);              // support importing an older backup
        if (!state.jobs) state.jobs = [];
        saveData("Backup imported");
        render();
      } catch (e) { toast("That file is not a valid Verisko backup."); }
    };
    reader.readAsText(file); this.value = "";
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
    else if (view === "installs") openForm("installation");
    else if (view === "quotes") openForm("quote");
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
    if (e.target.id === "installFilter") { installFilter = e.target.value; renderInstalls(); }
    if (e.target.id === "quoteFilter") { quoteFilter = e.target.value; renderQuotes(); }
    if (e.target.matches("[data-set-role]")) setMemberRole(e.target.dataset.userId, e.target.value);
  });

  content.addEventListener("click", function (e) {
    var photo = e.target.closest("[data-photo]"); if (photo) { openPhoto(photo.getAttribute("data-img")); return; }
    var appr = e.target.closest("[data-approve-id]"); if (appr) { approveTx(appr.getAttribute("data-approve-id")); return; }
    var back = e.target.closest("[data-sendback-id]"); if (back) { sendBackTx(back.getAttribute("data-sendback-id")); return; }
    var apprP = e.target.closest("[data-approve-prospect]"); if (apprP) { approveProspect(apprP.getAttribute("data-approve-prospect")); return; }
    var backP = e.target.closest("[data-sendback-prospect]"); if (backP) { sendBackProspect(backP.getAttribute("data-sendback-prospect")); return; }
    var tt = e.target.closest("[data-tech-toggle]"); if (tt) { toggleTechnician(tt.getAttribute("data-tech-toggle")); return; }
    var tr = e.target.closest("[data-tech-remove]"); if (tr) { removeTechnician(tr.getAttribute("data-tech-remove")); return; }
    var mkInstall = e.target.closest("[data-make-install]"); if (mkInstall) { openForm("installation", null, mkInstall.getAttribute("data-make-install")); return; }
    var fup = e.target.closest("[data-log-followup]"); if (fup) { logFollowUp(fup.getAttribute("data-log-followup")); return; }
    var tc = e.target.closest("[data-toggle-closed]"); if (tc) { toggleClosedSale(tc.getAttribute("data-toggle-closed")); return; }
    var go = e.target.closest("[data-go]"); if (go) { view = go.dataset.go; render(); return; }
    var edit = e.target.closest("[data-edit]"); if (edit) { openForm(edit.dataset.edit, edit.dataset.id); return; }
    var sched = e.target.closest("[data-schedule]"); if (sched) { openForm("appointment", null, sched.dataset.schedule); return; }
    var confirmBtn = e.target.closest("[data-confirm]"); if (confirmBtn) { confirmVisit(confirmBtn.dataset.confirm); return; }
    var neu = e.target.closest("[data-new]"); if (neu) { openForm(neu.dataset.new); return; }

    if (e.target.closest("[data-export]")) exportJson();
    if (e.target.closest("[data-import]")) document.getElementById("importInput").click();
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
    var pettyForm = e.target.closest("#pettyForm");
    if (pettyForm) {
      e.preventDefault();
      if (!isAdmin()) return;
      var v = Math.max(0, Math.round(Number(pettyForm.querySelector("[name=pettyLimit]").value) || 0));
      if (!state.config || typeof state.config !== "object") state.config = {};
      state.config.pettyLimit = v;
      saveData("Petty-cash limit set to " + money(v));
      return;
    }
    var commForm = e.target.closest("#commissionForm");
    if (commForm) {
      e.preventDefault();
      if (!canReviewProspects()) return;
      if (!state.config || typeof state.config !== "object") state.config = {};
      state.config.commissionPerSale = Math.max(0, Math.round(Number(commForm.querySelector("[name=commRate]").value) || 0));
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
  // Load any offline photos waiting to upload (migrates the old localStorage
  // queue into IndexedDB on first run).
  initUploadQueue();
  // Recover automatically when the phone gets signal back.
  window.addEventListener("online", function () { setSync("syncing", "Back online — syncing…"); syncNow(); });
  window.addEventListener("offline", function () { setSync("error", "Offline — saved on this device"); });

  var hashAuth = readAuthFromHash();
  if (hashAuth && hashAuth.access_token) {
    // Landed back from a magic link — complete sign-in.
    showLogin(); setSync("syncing", "Signing you in…");
    loginEmail = emailFromJwt(hashAuth.access_token);
    afterVerify(loginEmail, { access_token: hashAuth.access_token, refresh_token: hashAuth.refresh_token, expires_at: Number(hashAuth.expires_at) });
  } else if (hashAuth && hashAuth.error) {
    showLogin(hashAuth.error_description ? decodeURIComponent(hashAuth.error_description.replace(/\+/g, " ")) : "That sign-in link didn't work — please request a new one.");
  } else if (settings.auth && settings.user) {
    enterApp(); // open straight to the app from cached data (offline-friendly)
    setSync("syncing", "Checking…");
    loadShared().then(function (result) {
      if (result === "signin") { signOutLocal(); showLogin("Your session expired. Please sign in again."); }
      else if (result === "unauth") { var _em = settings.auth && settings.auth.email; signOutLocal(); showDenied(_em, true); }
      else if (result === "ok") { resolveUser(); setSync("connected", "Synced"); render(); syncNow(); }
      else { setSync("error", "Offline — using this device"); }
    });
  } else {
    showLogin();
  }
})();
