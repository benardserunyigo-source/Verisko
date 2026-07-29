(function () {
  "use strict";

  /* ---------------------------------------------------------------------------
   * Verisko Sales Visit Planner
   * One salesperson finds and qualifies prospects, then hands confirmed site
   * visits to the Operations Director. Data lives in a shared Excel workbook
   * (via the Netlify /api/data function + X-Team-Key) with a localStorage
   * fallback. Excel field names and record ids are preserved exactly.
   * ------------------------------------------------------------------------- */

  var STORAGE_KEY = "verisko_sales_app_v1";
  var SETTINGS_KEY = "verisko_sales_settings_v1";

  // Salesperson-facing prospect stages (Excel `stage` is a free string, so any
  // legacy value coming from the workbook still renders — this is the pick-list).
  var STAGES = ["New prospect", "Contact attempted", "Qualified", "Appointment proposed", "Appointment confirmed", "Lost", "Postponed"];
  var VERTICALS = ["Pharmacy", "Clinic", "Hospital", "Mobile money", "Retail shop", "Supermarket", "School", "Office", "Warehouse", "Residence", "Other"];
  var SOURCES = ["Cold visit", "Walk-in prospecting", "Referral", "Website enquiry", "Phone enquiry", "Existing customer", "Other"];
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
  var relDay = function (v) {
    if (!v) return "";
    if (v === today) return "Today";
    if (v === plusDays(1)) return "Tomorrow";
    if (v === plusDays(-1)) return "Yesterday";
    return dateLabel(v);
  };

  /* ---------- Seed / demonstration data (prospects + appointments only) ------ */
  var seed = {
    prospects: [
      { id: "p1", business: "Acacia Pharmacy", vertical: "Pharmacy", contact: "Grace N.", phone: "+256 772 460 125", location: "Kira Road, Kampala", decisionMaker: "Yes", concern: "Blind spot at the dispensary entrance and after-hours access.", existing: "Yes", areas: "Entrance, dispensary, rear store", estimate: "", budget: "Has budget", stage: "Appointment confirmed", owner: "Operations Director", source: "Walk-in prospecting", nextAction: "Site visit with Operations Director", followUp: plusDays(1), notes: "Best time is before the lunch rush.", created: plusDays(-6) },
      { id: "p2", business: "Luwum Mobile Money", vertical: "Mobile money", contact: "Brian S.", phone: "+256 701 908 412", location: "Luwum Street, Kampala", decisionMaker: "Yes", concern: "Cash handling and street-facing counter.", existing: "No", areas: "Counter and entrance", estimate: "", budget: "Has budget", stage: "Qualified", owner: "Sales", source: "Referral", nextAction: "Propose a site visit this week", followUp: today, notes: "Owner is usually present after 3pm.", created: plusDays(-3) },
      { id: "p3", business: "Nakasero Family Clinic", vertical: "Clinic", contact: "Dr. Amina K.", phone: "+256 754 330 219", location: "Nakasero, Kampala", decisionMaker: "Yes", concern: "Night access, reception and medicine store.", existing: "Yes", areas: "Reception, corridors, pharmacy store, parking", estimate: "", budget: "Not discussed", stage: "Appointment proposed", owner: "Sales", source: "Website enquiry", nextAction: "Confirm the proposed Thursday visit", followUp: today, notes: "Wants the Operations Director to view the ceiling void.", created: plusDays(-10) },
      { id: "p4", business: "Ntinda Fresh Mart", vertical: "Supermarket", contact: "Joel M.", phone: "+256 783 222 608", location: "Ntinda, Kampala", decisionMaker: "No", concern: "Till monitoring and stock loss.", existing: "No", areas: "Tills, aisles and stock room", estimate: "", budget: "Not discussed", stage: "Contact attempted", owner: "Sales", source: "Cold visit", nextAction: "Reach the proprietor, not only the supervisor", followUp: plusDays(-1), notes: "Branch supervisor cannot make the decision.", created: plusDays(-18) },
      { id: "p5", business: "Kabalagala Hardware", vertical: "Retail shop", contact: "Sara T.", phone: "+256 776 114 900", location: "Kabalagala, Kampala", decisionMaker: "Unknown", concern: "Break-ins after closing.", existing: "No", areas: "Shopfront and yard", estimate: "", budget: "Price-sensitive", stage: "New prospect", owner: "Sales", source: "Cold visit", nextAction: "Call to introduce Verisko", followUp: plusDays(2), notes: "", created: plusDays(-1) }
    ],
    appointments: [
      { id: "a1", prospectId: "p1", date: plusDays(1), time: "10:00", director: "Operations Director", status: "Confirmed", purpose: "Technical site survey", directions: "Ask for Grace at the dispensary counter. Parking on Kira Road.", created: plusDays(-2) },
      { id: "a2", prospectId: "p3", date: plusDays(2), time: "14:30", director: "Operations Director", status: "Proposed", purpose: "Technical site survey", directions: "Reception will call Dr. Amina. Enter from the side gate.", created: plusDays(-1) }
    ],
    users: [],
    transactions: []
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
    document.querySelectorAll(".nav-item").forEach(function (b) {
      var on = b.dataset.view === view;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    updateCashBadge();
    if (view === "today") renderToday();
    else if (view === "prospects") renderProspects();
    else if (view === "visits") renderVisits();
    else if (view === "cashflow") renderCashflow();
    else if (view === "settings") renderSettings();
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
    content.innerHTML =
      '<div class="toolbar">' +
        '<div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' +
        '<input id="search" type="search" placeholder="Search business, contact, phone or location" aria-label="Search prospects"></div>' +
        '<div class="filter-row"><div class="field-inline"><label for="stageFilter">Stage</label>' +
        '<select id="stageFilter"><option value="">All stages</option>' + STAGES.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("") + "</select></div></div>" +
      "</div>" +
      '<p class="result-note" id="resultNote"></p>' +
      '<div class="card-grid" id="prospectGrid"></div>';
    updateProspectGrid();
  }

  function updateProspectGrid() {
    var grid = document.getElementById("prospectGrid");
    if (!grid) return;
    var q = ((document.getElementById("search") || {}).value || "").toLowerCase().trim();
    var stage = ((document.getElementById("stageFilter") || {}).value || "");
    var rows = state.prospects.filter(function (p) {
      var haystack = (p.business + " " + p.contact + " " + p.phone + " " + p.location + " " + p.vertical + " " + p.notes).toLowerCase();
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
    if (/Qualified/i.test(p.stage) && !appt) actions += '<button class="btn btn-sm btn-ghost" data-schedule="' + p.id + '">Schedule</button>';
    actions += '<button class="btn btn-sm btn-ghost" data-edit="prospect" data-id="' + p.id + '">Edit</button>';
    var tone = isOverdue(p.followUp) ? "red" : isToday(p.followUp) ? "amber" : "navy";
    return '<article class="item tone-' + tone + '">' +
      '<div class="item-top"><div><div class="item-title">' + esc(p.business) + '</div>' +
      '<div class="item-meta">' + esc(p.vertical) + " · " + esc(p.location || "No location") + "</div></div>" + stageChip(p.stage) + "</div>" +
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
    setHead("Site-visit handoffs", "Site visits", "Book and confirm visits to hand over.", "Schedule visit", true);
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
      emptyState(ICON_PIN, "No site visits yet", "Qualify a prospect, then schedule a visit for the Operations Director.", "Schedule visit", 'data-new="appointment"');
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

  function txStatusChip(s) {
    if (s === "approved") return chip("Approved", "green", "✓");
    if (s === "query") return chip("Sent back", "red", "!");
    return chip("Pending", "amber", "◔");
  }

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
    var bits = [esc(t.category || "Uncategorised")];
    if (t.method) bits.push(esc(t.method));
    if (p && p.business) bits.push(esc(p.business));
    return bits.join(" · ");
  }

  // A single card in the admin review queue: receipt inline + quick actions.
  function reviewCard(t) {
    var sign = t.direction === "in" ? "+" : "−";
    var proof = t.proofId
      ? '<button type="button" class="rev-proof" data-photo data-proof-id="' + esc(t.proofId) + '" aria-label="View receipt full screen"><span class="rev-proof-load">Loading receipt…</span></button>'
      : '<p class="rev-noproof">No receipt attached. Send it back and ask for a photo before approving.</p>';
    return '<article class="card rev-card" data-id="' + t.id + '">' +
      '<div class="item-top"><div><div class="item-title"><span class="tx-dir ' + (t.direction === "in" ? "in" : "out") + '">' + (t.direction === "in" ? "In" : "Out") + "</span> " + sign + money(t.amount) + "</div>" +
      '<div class="item-meta">' + txMeta(t) + "</div></div></div>" +
      '<div class="item-lines"><div class="item-line"><span class="k">Added by</span><span class="v">' + esc(t.createdBy || "—") + "</span></div>" +
      '<div class="item-line"><span class="k">Date</span><span class="v">' + dateLabel(t.date) + "</span></div>" +
      (t.note ? '<div class="item-line"><span class="k">Note</span><span class="v">' + esc(t.note) + "</span></div>" : "") + "</div>" +
      proof +
      '<div class="rev-actions">' +
      '<button type="button" class="btn btn-primary" data-approve-id="' + t.id + '"' + (t.proofId ? "" : " disabled") + ">Approve</button>" +
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
      '<div class="item-line"><span class="k">Proof</span><span class="v">' + (t.proofId ? "Attached" : '<span style="color:var(--amber)">No proof yet</span>') + "</span></div></div></article>";
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
  function proofControl(source) {
    var has = source && source.proofId;
    return '<div class="proof" id="proofBox"><input type="hidden" name="proofId" value="' + esc((source && source.proofId) || "") + '">' +
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
    if (amount >= LARGE_AMOUNT && !window.confirm("Record " + money(amount) + " " + (direction === "in" ? "coming in" : "going out") + "?\n\nDouble-check the amount is right.")) return;
    var saveBtn = document.getElementById("saveButton");
    var proofId = data.proofId || "";
    try {
      if (pendingProof) { saveBtn.disabled = true; saveBtn.textContent = "Uploading photo…"; proofId = await uploadProof(pendingProof); }
    } catch (e) { saveBtn.disabled = false; saveBtn.textContent = editing.id ? "Save changes" : "Save"; showFormError(e.message); return; }

    if (editing.id) {
      var idx = state.transactions.findIndex(function (x) { return x.id === editing.id; });
      var prev = state.transactions[idx];
      var upd = Object.assign({}, prev, { direction: direction, amount: amount, date: data.date, category: data.category, method: method, prospectId: data.prospectId || "", note: data.note || "", proofId: proofId });
      if (!isAdmin() && prev.status === "query") { upd.status = "pending"; upd.reviewNote = ""; } // resubmit after a send-back
      state.transactions[idx] = upd;
    } else {
      state.transactions.push({
        id: uid(), direction: direction, amount: amount, date: data.date || today, category: data.category, method: method,
        prospectId: data.prospectId || "", note: data.note || "", proofId: proofId,
        createdBy: (settings.user && settings.user.name) || "", createdByEmail: (settings.user && settings.user.email) || "",
        createdAt: today, status: "pending", reviewedBy: "", reviewedAt: "", reviewNote: ""
      });
    }
    pendingProof = null;
    saveBtn.disabled = false;
    hideFormError(); dialog.close();
    saveData(editing.id ? "Cash entry updated" : "Cash entry added");
    render();
  }
  function approveTransaction() {
    if (!editing || !editing.id || !isAdmin()) return;
    var t = state.transactions.find(function (x) { return x.id === editing.id; });
    if (!t) return;
    if (!t.proofId && !pendingProof) { showFormError("Attach a proof photo before approving."); return; }
    t.status = "approved"; t.reviewedBy = (settings.user && settings.user.name) || ""; t.reviewedAt = today; t.reviewNote = "";
    dialog.close(); saveData("Entry approved"); render();
  }
  function sendBackTransaction() {
    if (!editing || !editing.id || !isAdmin()) return;
    if (sendBackTx(editing.id)) dialog.close();
  }
  // Inline approve/send-back used by the review queue (no dialog open).
  function approveTx(id) {
    if (!isAdmin()) return;
    var t = state.transactions.find(function (x) { return x.id === id; });
    if (!t) return;
    if (!t.proofId) { toast("Add a proof photo before approving."); return; }
    t.status = "approved"; t.reviewedBy = (settings.user && settings.user.name) || ""; t.reviewedAt = today; t.reviewNote = "";
    saveData("Entry approved"); render();
  }
  function sendBackTx(id) {
    if (!isAdmin()) return false;
    var t = state.transactions.find(function (x) { return x.id === id; });
    if (!t) return false;
    var note = prompt("Send this back to whoever recorded it. What needs fixing?");
    if (note === null) return false;
    t.status = "query"; t.reviewNote = (note || "").trim(); t.reviewedBy = (settings.user && settings.user.name) || ""; t.reviewedAt = today;
    saveData("Sent back for changes"); render();
    return true;
  }
  // Full-screen receipt viewer for the review queue.
  function openPhoto(img) {
    if (!img) return;
    var ov = document.getElementById("photoOverlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "photoOverlay"; ov.className = "photo-overlay"; ov.setAttribute("role", "dialog");
      ov.setAttribute("aria-label", "Receipt photo");
      ov.addEventListener("click", function () { ov.classList.remove("show"); });
      document.body.appendChild(ov);
    }
    ov.innerHTML = '<img src="' + img + '" alt="Receipt photo"><button type="button" class="photo-close" aria-label="Close">×</button>';
    ov.classList.add("show");
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

      '<section class="card settings-card"><h2>Backup &amp; restore</h2>' +
      '<p>Download a JSON backup any time, or import one to recover your records.</p>' +
      '<div class="button-row"><button class="btn btn-ghost" data-export>Download JSON backup</button>' +
      '<button class="btn btn-ghost" data-import>Import backup</button></div></section>' +

      '<section class="card settings-card"><h2>Danger zone</h2>' +
      '<p class="settings-note">Resetting erases <strong>all prospects, visits and team accounts — for everyone</strong> — and loads sample data. It cannot be undone. Download a backup first if unsure.</p>' +
      '<div class="button-row"><button class="btn btn-danger" data-reset>Reset to demo data…</button></div></section>' +

      '<section class="card settings-card"><h2>How this app is used</h2>' +
      '<p class="settings-note"><strong>The salesperson</strong> finds and qualifies prospects, follows up, and books confirmed site visits. Technical surveys, cable quantities, official quotations and equipment lists are handled by the Operations Director after handoff — they are not entered here.</p>' +
      '<p class="settings-note">Before a visit can be confirmed, the prospect needs a contact person, telephone number and location, and the visit needs a date, time and Operations owner.</p></section>' +
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
        field("followUp", "Follow up on", "date", source.followUp || today) +
        field("nextAction", "Next action", "text", source.nextAction, { full: true, placeholder: "e.g. Call back, book a visit" }) +

        // Optional — only if it helps Operations.
        '<div class="field-group-title">Optional details</div>' +
        field("source", "Lead source", "select", source.source || SOURCES[0], { options: SOURCES, optional: true }) +
        field("concern", "Main security concern", "textarea", source.concern, { full: true, optional: true, placeholder: "What are they worried about?" }) +
        field("areas", "Areas to cover", "text", source.areas, { full: true, optional: true, placeholder: "e.g. Entrance, till, store" }) +
        field("notes", "Notes for Operations", "textarea", source.notes, { full: true, optional: true });
    }
    if (type === "appointment") {
      document.getElementById("dialogTitle").textContent = id ? "Edit site visit" : "Schedule site visit";
      var options = state.prospects.map(function (p) { return { value: p.id, label: p.business }; });
      var selected = source.prospectId || presetProspect || "";
      html +=
        '<div class="field full"><label for="f_prospectId">Prospect <span class="req" aria-hidden="true">*</span></label>' +
        '<select id="f_prospectId" name="prospectId" required aria-required="true"><option value="">Choose a prospect</option>' +
        options.map(function (o) { return '<option value="' + esc(o.value) + '"' + (o.value === selected ? " selected" : "") + ">" + esc(o.label) + "</option>"; }).join("") + "</select></div>" +
        field("date", "Visit date", "date", source.date || plusDays(1), { required: true }) +
        field("time", "Time", "time", source.time || "10:00", { required: true }) +
        field("director", "Operations owner", "text", source.director || "Operations Director", { required: true, full: true }) +
        field("status", "Appointment status", "select", source.status || "Proposed", { options: APPT_STATUSES }) +
        field("purpose", "Purpose", "segmented", source.purpose || PURPOSES[0], { full: true, options: PURPOSES }) +
        field("directions", "Directions and access instructions", "textarea", source.directions, { full: true, optional: true, placeholder: "How to reach the site and who to ask for." });
    }
    if (type === "transaction") {
      document.getElementById("dialogTitle").textContent = id ? "Cash entry" : "Add money";
      var dir = source.direction || "in";
      var cats = TX_CATS[dir] || TX_CATS.in;
      html +=
        field("direction", "Direction", "segmented", dir, { full: true, options: [{ value: "in", label: "Money in" }, { value: "out", label: "Money out" }] }) +
        // Amount: numeric keypad, a live "= UGX 500,000" echo, and the float hint.
        '<div class="field full"><label for="f_amount">Amount (UGX) <span class="req" aria-hidden="true">*</span></label>' +
        '<input id="f_amount" name="amount" type="number" inputmode="numeric" min="0" step="1" required aria-required="true" value="' + esc(source.amount || "") + '">' +
        '<p class="amount-echo" id="amountEcho" aria-live="polite"></p>' +
        '<p class="helper">In the float now: ' + money(availableForOut(id)) + ". Money out can't go past this.</p></div>" +
        field("date", "Date", "date", source.date || today, { required: true }) +
        field("category", "Category", "select", source.category || cats[0], { options: cats, full: true }) +
        field("method", "Paid by", "select", source.method || TX_METHODS[0], { options: TX_METHODS, full: true }) +
        '<div class="field full"><label for="f_prospectId">Link to a prospect (optional)</label><select id="f_prospectId" name="prospectId"><option value="">— none —</option>' +
        state.prospects.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === source.prospectId ? " selected" : "") + ">" + esc(p.business) + "</option>"; }).join("") + "</select></div>" +
        field("note", "Note", "textarea", source.note, { full: true, optional: true }) +
        '<div class="field full"><label>Proof of payment <span class="optional-tag">photo or MoMo SMS</span></label>' + proofControl(source) + "</div>";
      if (id && isAdmin() && source.status !== "approved") {
        html += '<div class="field full tx-review"><button type="button" class="btn btn-primary btn-block" data-approve>Approve entry</button><button type="button" class="btn btn-ghost btn-block" data-sendback>Send back with a note</button></div>';
      }
    }
    // Delete is offered for prospects & site visits (not cash entries).
    if (id && (type === "prospect" || type === "appointment")) html += '<button type="button" class="btn btn-danger btn-block delete-record" data-delete>Delete this ' + (type === "appointment" ? "site visit" : "prospect") + "</button>";
    formContent.innerHTML = html + "</div>";
    if (type === "transaction") {
      pendingProof = null;
      updateAmountEcho();
      var pIn = document.getElementById("proofInput");
      if (pIn) pIn.addEventListener("change", onProofPick);
      if (source && source.proofId) {
        fetchProof(source.proofId).then(function (img) {
          var pv = document.getElementById("proofPreview");
          if (pv) pv.innerHTML = img ? '<img src="' + img + '" alt="Proof photo" class="proof-img">' : '<span class="proof-none">Couldn\'t load photo</span>';
        });
      }
    }
    document.getElementById("saveButton").textContent = id ? "Save changes" : "Save";
    if (!dialog.open) dialog.showModal();
    var first = formContent.querySelector('input:not([type=hidden]),select,textarea');
    if (first) first.focus();
  }

  function showFormError(msg) { formError.textContent = msg; formError.hidden = false; }
  function hideFormError() { formError.hidden = true; formError.textContent = ""; }

  // Delete the record being edited (prospect also removes its site visits).
  function deleteRecord() {
    if (!editing || !editing.id) return;
    var type = editing.type;
    var label = type === "appointment" ? "site visit" : "prospect";
    if (!confirm("Delete this " + label + "? This can't be undone.")) return;
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
  });

  form.addEventListener("click", function (e) {
    if (e.target.closest("[data-delete]")) { deleteRecord(); return; }
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
    // Cash flow: switching In/Out re-populates the category list to match.
    if (name === "direction" && editing && editing.type === "transaction") {
      var sel = document.getElementById("f_category");
      if (sel) {
        var cats = TX_CATS[hidden.value] || TX_CATS.in;
        sel.innerHTML = cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");
      }
    }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    var type = editing.type;
    if (type === "transaction") { saveTransaction(data); return; }
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
      if (type === "prospect" && !data.owner) data.owner = "Sales";
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
    if (a.status === "Confirmed") { p.stage = "Appointment confirmed"; p.owner = "Operations Director"; p.nextAction = "Operations site visit"; p.followUp = a.date; }
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
        state = { prospects: result.data.prospects || [], appointments: result.data.appointments || [], users: result.data.users || [], transactions: result.data.transactions || [] };
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
      setSync("connected", "Synced");
    } catch (e) { setSync("error", "Saved on device — sync pending"); }
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
      html += '<p class="lock-eyebrow" id="lockTitle">Sales Visit Planner</p>' +
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
    { welcome: true, title: "Welcome to Verisko Sales", body: "Your simple tool for finding prospects, following up, and booking confirmed site visits for the Operations Director." },
    { icon: ICON_CALENDAR, title: "Start on Today", body: "Each day, Today shows who to call, which visits to confirm, and what's overdue — most urgent first. Work from the top down." },
    { icon: ICON_PEOPLE, title: "Add & qualify prospects", body: "Capture the business, contact, phone and location. Most answers are quick taps — no long forms. Mark them Qualified when they're ready." },
    { icon: ICON_PIN, title: "Book & confirm visits", body: "Schedule a site visit and confirm it — a confirmed visit is ready to hand to the Operations Director. A visit can only be confirmed once it has a contact, phone, location, date, time and owner." }
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

  function applyRole() {
    var settingsNav = document.querySelector('.nav-item[data-view="settings"]');
    if (settingsNav) settingsNav.hidden = !isAdmin();
    var cashNav = document.querySelector('.nav-item[data-view="cashflow"]');
    if (cashNav) cashNav.hidden = !canCashflow();
    if (view === "settings" && !isAdmin()) view = "today";
    if (view === "cashflow" && !canCashflow()) view = "today";
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

  // Add a teammate by email with a role: sales, operations, or admin (Technical).
  function addMember(name, email, role) {
    name = (name || "").trim(); email = (email || "").trim().toLowerCase();
    role = normRole(role);
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
    if (u.id === ownerId()) { toast("The owner's role can't be changed."); return; }
    u.role = normRole(role);
    saveData();
    render();
    toast(u.name.split(/\s+/)[0] + " is now " + roleName(u));
  }

  // Remove a team member (airtight offboarding — they lose access at once).
  function removeUser(id) {
    var u = (state.users || []).find(function (x) { return x.id === id; });
    if (!u) return;
    if (u.id === ownerId()) { toast("The owner account can't be removed."); return; }
    if (settings.user && u.id === settings.user.id) { toast("You can't remove your own account."); return; }
    if (!confirm("Remove " + u.name + " (" + u.email + ") from the team?\n\nThey lose access immediately and can't sign in again unless you re-add them. This can't be undone.")) return;
    state.users = state.users.filter(function (x) { return x.id !== id; });
    saveData();
    render();
    toast(u.name.split(/\s+/)[0] + " removed from the team");
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
        state = { prospects: parsed.prospects, appointments: parsed.appointments, users: parsed.users || state.users || [], transactions: parsed.transactions || state.transactions || [] };
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
    var b = e.target.closest("[data-view]");
    if (b) { view = b.dataset.view; render(); document.getElementById("main").focus(); }
  });

  document.getElementById("primaryAction").addEventListener("click", function () {
    if (view === "cashflow") openForm("transaction");
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
    if (e.target.matches("[data-set-role]")) setMemberRole(e.target.dataset.userId, e.target.value);
  });

  content.addEventListener("click", function (e) {
    var photo = e.target.closest("[data-photo]"); if (photo) { openPhoto(photo.getAttribute("data-img")); return; }
    var appr = e.target.closest("[data-approve-id]"); if (appr) { approveTx(appr.getAttribute("data-approve-id")); return; }
    var back = e.target.closest("[data-sendback-id]"); if (back) { sendBackTx(back.getAttribute("data-sendback-id")); return; }
    var go = e.target.closest("[data-go]"); if (go) { view = go.dataset.go; render(); return; }
    var edit = e.target.closest("[data-edit]"); if (edit) { openForm(edit.dataset.edit, edit.dataset.id); return; }
    var sched = e.target.closest("[data-schedule]"); if (sched) { openForm("appointment", null, sched.dataset.schedule); return; }
    var confirmBtn = e.target.closest("[data-confirm]"); if (confirmBtn) { confirmVisit(confirmBtn.dataset.confirm); return; }
    var neu = e.target.closest("[data-new]"); if (neu) { openForm(neu.dataset.new); return; }

    if (e.target.closest("[data-export]")) exportJson();
    if (e.target.closest("[data-import]")) document.getElementById("importInput").click();
    if (e.target.closest("[data-sync]")) pullShared();
    var rm = e.target.closest("[data-remove-user]"); if (rm) { removeUser(rm.dataset.removeUser); return; }
    if (e.target.closest("[data-reset]")) {
      var ans = prompt("This ERASES all prospects, visits and team accounts for everyone, and loads sample data. It cannot be undone.\n\nType RESET to confirm.");
      if (ans && ans.trim().toUpperCase() === "RESET") {
        state = JSON.parse(JSON.stringify(seed));
        saveData("Reset to demo data");
        logout(); // wiped the team — sign out and re-onboard
      }
    }
  });
  content.addEventListener("submit", function (e) {
    var addForm = e.target.closest("#addMemberForm");
    if (addForm) {
      e.preventDefault();
      if (addMember(addForm.querySelector("[name=name]").value, addForm.querySelector("[name=email]").value, addForm.querySelector("[name=role]").value)) addForm.reset();
    }
  });

  /* -------------------------------- Start ----------------------------------- */
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
      else if (result === "ok") { resolveUser(); setSync("connected", "Synced"); render(); }
      else { setSync("error", "Offline — using this device"); }
    });
  } else {
    showLogin();
  }
})();
