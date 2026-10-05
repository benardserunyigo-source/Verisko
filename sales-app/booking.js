// Verisko Uganda Operations — "Book a site check": the one-minute form a rep
// fills at the business (pure, tested). One save creates the prospect AND its
// site visit, because the visit is what earns pay (pay scheme 4).
//   1 Business or home name      2 Owner's name     3 Do they decide? (tap)
//   4 Phone (checked + no duplicates)  5 Area (tap)  6 Landmark
//   7 Type of place (tap)  8 What to watch (tap all)  9 When can we come? (tap)
// The GPS pin is taken automatically when the form opens.
(function (root) {
  "use strict";

  var AREAS = ["Mukono Town", "Seeta", "Nabuti", "Kireka", "Ntinda", "Kampala", "Other"];
  var PLACE_TYPES = [
    { label: "Home", vertical: "Residence" }, { label: "Shop", vertical: "Retail shop" },
    { label: "Pharmacy or clinic", vertical: "Pharmacy" }, { label: "Mobile money", vertical: "Mobile money" },
    { label: "School", vertical: "School" }, { label: "Other", vertical: "Other" }
  ];
  // Same wording as lead-qualify.js so the answers read the same everywhere.
  var DECIDES = ["Yes, they decide", "They decide with someone", "No, someone else decides"];
  var WATCH = ["Gate", "Front door", "Counter or till", "Inside", "Parking", "Store room"];
  var WHEN = ["Tomorrow morning", "Tomorrow afternoon", "Pick a day", "Later: in 2 weeks", "Later: in 1 month"];

  function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
  function list(v) { return (Array.isArray(v) ? v : String(v || "").split(",")).map(clean).filter(Boolean); }
  function addDays(ymd, n) {
    var d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function skipSunday(ymd) { return new Date(ymd + "T12:00:00Z").getUTCDay() === 0 ? addDays(ymd, 1) : ymd; }

  function phoneTools() {
    var L = root.VeriskoLeadImport || {};
    return {
      normalize: L.normalizePhone || function (v) { return clean(v); },
      key: L.phoneKey || function (v) { var d = String(v || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; }
    };
  }
  // A Ugandan mobile, formatted "+256 7XX XXX XXX", or "" if not one.
  function ugMobile(v) {
    var n = phoneTools().normalize(v);
    return /^\+256 7\d{2} \d{3} \d{3}$/.test(n) ? n : "";
  }

  // Date and time of the visit from the "When can we come?" answer.
  // today = "YYYY-MM-DD" in Kampala. Sundays move to Monday.
  function slot(when, today, pickDate, pickTime) {
    if (when === "Tomorrow morning") return { date: skipSunday(addDays(today, 1)), time: "09:00", later: false };
    if (when === "Tomorrow afternoon") return { date: skipSunday(addDays(today, 1)), time: "14:00", later: false };
    if (when === "Later: in 2 weeks") return { date: skipSunday(addDays(today, 14)), time: "10:00", later: true };
    if (when === "Later: in 1 month") return { date: skipSunday(addDays(today, 30)), time: "10:00", later: true };
    if (when === "Pick a day") {
      var d = clean(pickDate), t = clean(pickTime) || "10:00";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < today) return null;
      return { date: d, time: t, later: d > addDays(today, 10) };
    }
    return null;
  }

  // Checks everything; returns { ok, errors:[...], phone, duplicate, slot }.
  // prospects = the records this device can see (for the duplicate check).
  function check(data, ctx) {
    data = data || {}; ctx = ctx || {};
    var errors = [];
    if (clean(data.business).length < 2) errors.push("Write the business or home name.");
    if (clean(data.contact).length < 2) errors.push("Write the owner's name.");
    var decides = clean(data.decides);
    if (!decides) errors.push("Tap whether this person decides.");
    else if (decides === DECIDES[2]) errors.push("Get the owner first — we only book visits with the person who decides.");
    var phone = ugMobile(data.phone);
    if (!clean(data.phone)) errors.push("Write their phone number.");
    else if (!phone) errors.push("Check the phone number — it should look like 0772 123 456.");
    var duplicate = null;
    if (phone) {
      var k = phoneTools().key(phone);
      duplicate = (ctx.prospects || []).find(function (p) { return p && phoneTools().key(p.phone) === k; }) || null;
      if (duplicate) errors.push("Already with Verisko: " + (duplicate.business || "this number") + ". Don't book it twice.");
    }
    if (!clean(data.area)) errors.push("Tap the area.");
    if (clean(data.landmark).length < 3) errors.push("Write a landmark so our team can find it.");
    if (!clean(data.placeType)) errors.push("Tap the type of place.");
    if (!list(data.places).length) errors.push("Tap what they want to watch.");
    var s = slot(clean(data.when), ctx.today || "", data.pickDate, data.pickTime);
    if (!clean(data.when)) errors.push("Tap when we can come.");
    else if (!s) errors.push("Pick a visit day from today on.");
    if (!ctx.geo && !ctx.skipGeo) errors.push("We need your location. Step outside and tap “Try again”.");
    return { ok: errors.length === 0, errors: errors, phone: phone, duplicate: duplicate, slot: s };
  }

  function vertical(placeType) {
    var t = PLACE_TYPES.find(function (x) { return x.label === placeType; });
    return t ? t.vertical : "Other";
  }
  // About how many cameras the places add up to (at least 2).
  function cameras(places) { var n = list(places).length; return n ? Math.max(2, n) : 0; }

  // The prospect and site visit to save. ctx: { today, slot, phone, director }.
  function build(data, ctx) {
    var area = clean(data.area), landmark = clean(data.landmark), s = ctx.slot;
    var prospect = {
      business: clean(data.business), contact: clean(data.contact), phone: ctx.phone, decides: clean(data.decides),
      area: area, landmark: landmark, location: landmark + (area && area !== "Other" ? ", " + area : ""),
      vertical: vertical(clean(data.placeType)), places: list(data.places).join(", "), needs: "",
      source: "Walk-in prospecting", stage: "Appointment proposed",
      followUp: s.later ? addDays(s.date, -3) : s.date,
      nextAction: s.later ? "Call to confirm before the visit" : "Office to confirm by phone",
      notes: clean(data.notes), quickBooked: true, bookedAt: ctx.nowIso || ""
    };
    var visit = {
      date: s.date, time: s.time, director: ctx.director || "Operations", status: "Proposed",
      purpose: "Technical site survey", directions: landmark, later: !!s.later
    };
    return { prospect: prospect, visit: visit };
  }

  root.VeriskoBooking = { AREAS: AREAS, PLACE_TYPES: PLACE_TYPES, DECIDES: DECIDES, WATCH: WATCH, WHEN: WHEN,
    slot: slot, check: check, build: build, cameras: cameras, ugMobile: ugMobile, vertical: vertical };
}(typeof window !== "undefined" ? window : globalThis));
