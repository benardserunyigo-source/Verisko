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
    ]
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
      return data;
    } catch (e) { return JSON.parse(JSON.stringify(seed)); }
  }
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveData(message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (message) toast(message);
    if (settings.teamKey) pushShared();
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
    document.querySelectorAll(".nav-item").forEach(function (b) {
      var on = b.dataset.view === view;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (view === "today") renderToday();
    else if (view === "prospects") renderProspects();
    else if (view === "visits") renderVisits();
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
      "</div><div class=\"item-actions\">" + actions + "</div></article>";
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

  /* -------------------------------- SETTINGS -------------------------------- */
  function renderSettings() {
    setHead("App settings", "Settings", "Connection, backup, and data.", "", false);
    var connected = !!settings.teamKey && connection.state === "connected";
    content.innerHTML = '<div class="settings-grid">' +
      '<section class="card settings-card"><h2>Shared team data</h2>' +
      "<p>You're signed in with your team access code. Records sync securely through Netlify; the code lives only in the Netlify server, never in this browser.</p>" +
      '<div class="conn-status" data-state="' + connection.state + '"><span class="dot"></span><span class="conn-label">' + esc(connection.text) + "</span></div>" +
      '<div class="button-row"><button class="btn btn-ghost" data-sync>Refresh shared data</button>' +
      '<button class="btn btn-danger" data-signout>Sign out</button></div></section>' +

      '<section class="card settings-card"><h2>Backup &amp; restore</h2>' +
      '<p>Download a JSON backup before clearing a device, or import one to recover your records. These stay on your device unless you are connected to the shared workbook.</p>' +
      '<div class="button-row"><button class="btn btn-ghost" data-export>Download JSON backup</button>' +
      '<button class="btn btn-ghost" data-import>Import backup</button>' +
      '<button class="btn btn-danger" data-reset>Restore demo data</button></div></section>' +

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
    formContent.innerHTML = html + "</div>";
    document.getElementById("saveButton").textContent = id ? "Save changes" : "Save";
    if (!dialog.open) dialog.showModal();
    var first = formContent.querySelector("input,select,textarea");
    if (first) first.focus();
  }

  function showFormError(msg) { formError.textContent = msg; formError.hidden = false; }
  function hideFormError() { formError.hidden = true; formError.textContent = ""; }

  // Segmented (tap) controls: set the hidden value and move the selection.
  form.addEventListener("click", function (e) {
    var btn = e.target.closest(".seg-btn");
    if (!btn) return;
    var name = btn.getAttribute("data-seg-target");
    btn.parentNode.querySelectorAll(".seg-btn").forEach(function (b) {
      b.setAttribute("aria-checked", b === btn ? "true" : "false");
    });
    var hidden = document.getElementById("f_" + name);
    if (hidden) hidden.value = btn.getAttribute("data-val");
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    var type = editing.type;
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

  /* -------------------------------- Sharing --------------------------------- */
  // Validate an access code against the server and, on success, load the shared
  // data. Returns "ok" (valid), "bad" (wrong code), or "offline" (unreachable).
  async function connectWithKey(key) {
    try {
      var response = await fetch("/api/data", { headers: { "X-Team-Key": key } });
      if (response.status === 401) return "bad";
      var result = await response.json();
      if (!result.ok) return "bad";
      if (result.data && result.data.prospects) {
        state = { prospects: result.data.prospects || [], appointments: result.data.appointments || [] };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
      return "ok";
    } catch (e) { return "offline"; }
  }

  async function pullShared() {
    if (!settings.teamKey) return;
    setSync("syncing", "Refreshing shared data…");
    var result = await connectWithKey(settings.teamKey);
    if (result === "ok") { setSync("connected", "Shared data is current"); toast("Shared data refreshed"); render(); }
    else if (result === "bad") { settings.teamKey = ""; saveSettings(); setSync("error", "Access code no longer valid"); lock("Your access code is no longer valid. Please sign in again."); }
    else { setSync("error", "Offline — using this device"); toast("Could not reach shared data. Your device copy is safe."); }
  }

  async function pushShared() {
    try {
      setSync("syncing", "Saving shared data…");
      var response = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Team-Key": settings.teamKey },
        body: JSON.stringify({ data: state })
      });
      var result = await response.json();
      if (!result.ok) throw new Error();
      setSync("connected", "Shared data is current");
    } catch (e) {
      setSync("error", "Saved on device — shared sync pending");
    }
  }

  /* ------------------------------ Lock screen ------------------------------- */
  var lockScreen = document.getElementById("lockScreen");
  var lockForm = document.getElementById("lockForm");
  var lockInput = document.getElementById("accessCode");
  var lockError = document.getElementById("lockError");
  var lockSubmit = document.getElementById("lockSubmit");

  function lock(message) {
    document.body.classList.add("locked");
    lockScreen.hidden = false;
    lockInput.value = "";
    if (message) { lockError.textContent = message; lockError.hidden = false; }
    else { lockError.hidden = true; }
    lockInput.focus();
  }
  function unlock() {
    document.body.classList.remove("locked");
    lockScreen.hidden = true;
    lockError.hidden = true;
  }

  lockForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var code = lockInput.value.trim();
    if (!code) { lockError.textContent = "Enter your access code."; lockError.hidden = false; return; }
    lockError.hidden = true;
    lockSubmit.disabled = true;
    lockSubmit.textContent = "Checking…";
    var result = await connectWithKey(code);
    lockSubmit.disabled = false;
    lockSubmit.textContent = "Unlock";
    if (result === "ok") {
      settings.teamKey = code; saveSettings();
      setSync("connected", "Shared data is current");
      unlock(); render();
    } else if (result === "bad") {
      lockError.textContent = "Incorrect access code. Please try again.";
      lockError.hidden = false;
    } else {
      lockError.textContent = "Couldn't reach the server. Check your connection and try again.";
      lockError.hidden = false;
    }
  });

  document.getElementById("lockShow").addEventListener("click", function () {
    var showing = lockInput.type === "text";
    lockInput.type = showing ? "password" : "text";
    this.textContent = showing ? "Show" : "Hide";
    lockInput.focus();
  });

  function signOut() {
    settings.teamKey = ""; saveSettings();
    setSync("local", "Saved on this device");
    view = "today";
    lock();
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
        state = { prospects: parsed.prospects, appointments: parsed.appointments };
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
    if (view === "visits") openForm("appointment");
    else openForm("prospect");
  });

  content.addEventListener("input", function (e) {
    if (e.target.id === "search") updateProspectGrid();
  });
  content.addEventListener("change", function (e) {
    if (e.target.id === "stageFilter") updateProspectGrid();
    if (e.target.id === "visitFilter") updateVisitList();
  });

  content.addEventListener("click", function (e) {
    var go = e.target.closest("[data-go]"); if (go) { view = go.dataset.go; render(); return; }
    var edit = e.target.closest("[data-edit]"); if (edit) { openForm(edit.dataset.edit, edit.dataset.id); return; }
    var sched = e.target.closest("[data-schedule]"); if (sched) { openForm("appointment", null, sched.dataset.schedule); return; }
    var confirmBtn = e.target.closest("[data-confirm]"); if (confirmBtn) { confirmVisit(confirmBtn.dataset.confirm); return; }
    var neu = e.target.closest("[data-new]"); if (neu) { openForm(neu.dataset.new); return; }

    if (e.target.closest("[data-export]")) exportJson();
    if (e.target.closest("[data-import]")) document.getElementById("importInput").click();
    if (e.target.closest("[data-sync]")) pullShared();
    if (e.target.closest("[data-signout]")) signOut();
    if (e.target.closest("[data-reset]") && confirm("Replace the data on this device with the demonstration records?")) {
      state = JSON.parse(JSON.stringify(seed));
      saveData("Demonstration data restored");
      render();
    }
  });

  /* -------------------------------- Start ----------------------------------- */
  render(); // render behind the lock so there is no flash when we unlock
  if (settings.teamKey) {
    // Already signed in on this device — open straight away, verify in background.
    unlock();
    setSync("connected", "Shared data is current");
    connectWithKey(settings.teamKey).then(function (result) {
      if (result === "ok") { setSync("connected", "Shared data is current"); render(); }
      else if (result === "bad") { settings.teamKey = ""; saveSettings(); lock("Your access code is no longer valid. Please sign in again."); }
      else { setSync("error", "Offline — using this device"); }
    });
  } else {
    lock();
  }
})();
