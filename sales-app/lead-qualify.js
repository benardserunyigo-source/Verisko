// Verisko Uganda Operations — the 5 questions that qualify a lead (pure, tested).
//
// Asked on the prospect form, all by tapping (grade-six words, no jargon):
//   1. Who decides?                  decides  (one)
//   2. What do they want to stop or see?  needs   (any, comma-separated)
//   3. Where do they want cameras?   places   (any, comma-separated)
//   4. How would they like to pay?   pay      (one)
//   5. When do they want it?         when     (one)
// A lead "looks qualified" when all 5 are answered and none is a stopper
// (someone else decides, can't pay now, just looking). A rep can only mark a
// prospect Qualified once all 5 are answered; the Team lead sees the answers.
(function (root) {
  "use strict";

  var QUESTIONS = [
    { key: "decides", n: 1, label: "Who decides?", short: "Who decides", options: ["I decide", "We decide together", "Someone else decides"] },
    { key: "needs", n: 2, label: "What do they want to stop or see?", short: "What they want", multi: true,
      options: ["Theft", "Watch staff", "See who comes to the gate", "Night safety", "Watch from my phone when away", "Other"] },
    { key: "places", n: 3, label: "Where do they want cameras?", short: "Where", multi: true,
      options: ["Gate", "Front door", "Inside", "Back", "Parking", "Counter or till", "Store room", "Compound"] },
    { key: "pay", n: 4, label: "How would they like to pay?", short: "How they pay", options: ["Pay in full", "Pay in 3 parts", "Not sure yet", "Can't pay now"] },
    { key: "when", n: 5, label: "When do they want it?", short: "When", options: ["This week", "This month", "In 1–3 months", "Just looking"] }
  ];
  // Answers that mean "not ready yet", and what to do about each.
  var STOPPERS = {
    decides: { "Someone else decides": "Meet the person who decides" },
    pay: { "Can't pay now": "They can't pay now" },
    when: { "Just looking": "They're just looking" }
  };

  function list(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return String(v == null ? "" : v).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function answer(p, q) { return q.multi ? list((p || {})[q.key]) : String(((p || {})[q.key]) || "").trim(); }
  function isAnswered(p, q) { var a = answer(p, q); return q.multi ? a.length > 0 : !!a; }

  function missing(p) { return QUESTIONS.filter(function (q) { return !isAnswered(p, q); }); }

  // About how many cameras the places add up to, and the matching package.
  function cameraEstimate(p) {
    var n = list((p || {}).places).length;
    if (!n) return null;
    var cams = Math.max(2, n);
    var pack = cams <= 2 ? "2-camera" : cams <= 4 ? "4-camera" : cams <= 6 ? "6-camera" : "custom (more than 6)";
    return { places: n, cameras: cams, packageLabel: pack };
  }

  // { answered, total, ready, missing:[short labels], stoppers:[reasons] }
  function verdict(p) {
    var miss = missing(p);
    var stops = [];
    Object.keys(STOPPERS).forEach(function (k) {
      var a = String(((p || {})[k]) || "");
      if (STOPPERS[k][a]) stops.push(STOPPERS[k][a]);
    });
    return {
      answered: QUESTIONS.length - miss.length, total: QUESTIONS.length,
      ready: miss.length === 0 && stops.length === 0,
      missing: miss.map(function (q) { return q.short; }),
      stoppers: stops
    };
  }

  // One line per answer for cards: [{ label, value }].
  function summary(p) {
    return QUESTIONS.map(function (q) {
      var a = answer(p, q);
      return { label: q.short, value: q.multi ? a.join(", ") : a };
    });
  }

  var api = { QUESTIONS: QUESTIONS, list: list, missing: missing, verdict: verdict, cameraEstimate: cameraEstimate, summary: summary };
  root.VeriskoQualify = api;
})(typeof window !== "undefined" ? window : globalThis);
