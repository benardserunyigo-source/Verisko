// Verisko Uganda Operations — Support centre content (pure, tested).
//
// The field sales training library (from "Verisko Field Sales Training",
// Sep 2026): 13 short Loom videos in 5 parts, about 25 minutes in total.
// To change a video, edit VIDEOS below — keep each `id` stable, because
// watched progress is stored against it.
(function (root) {
  "use strict";

  var PARTS = [
    { n: 1, title: "Getting started" },
    { n: 2, title: "Starting the conversation" },
    { n: 3, title: "Know what you sell" },
    { n: 4, title: "Handling objections" },
    { n: 5, title: "Winning the sale" }
  ];

  var VIDEOS = [
    { id: "v1", n: 1, part: 1, title: "Welcome & The One Rule", loom: "95873acd1c0a4bc0bafa59193781a4dd",
      desc: "Learn what Verisko does, the one rule you must never break, and the four stages of your training." },
    { id: "v2", n: 2, part: 1, title: "How You Sound and Look", loom: "894b44830359477da4d160fc711cbf71",
      desc: "People decide whether to trust you in the first few seconds. Learn how your greeting, tone, and body language create a good first impression." },
    { id: "v3", n: 3, part: 2, title: "The Cold Open", loom: "a9f6dfd6dcc440ada5cd90fe08dfadf0",
      desc: "Learn how to start a conversation with a stranger at a shop, at a home, or with an askari or caretaker at the gate." },
    { id: "v4", n: 4, part: 2, title: "Listen, Check, Answer, Move + SPIN / Gap", loom: "9a81f637d0ac41adbddd43701c2c4200",
      desc: "Learn the four-step method that guides every conversation, and the kind of questions that help customers see what they need." },
    { id: "v5", n: 5, part: 3, title: "The Product Lineup", loom: "f47fc277f5e64de5af93e83b1f303e97",
      desc: "Learn our core products, what AI features do, and our key add-ons, all explained in plain language you can repeat to customers." },
    { id: "v6", n: 6, part: 3, title: "Packages & Approved Pricing", loom: "1e2300bc18114b9e9a5437b44b7ee939",
      desc: "Learn how to quote our packages and payment plan correctly. When a budget is tight, offer a smaller package instead of inventing a discount." },
    { id: "v7", n: 7, part: 4, title: "Objections: Price & Budget", loom: "236d3b7cb6f54ceea5cc79e0c8eb3965",
      desc: "Learn how to respond when a customer says it is too expensive, without dropping the price on the spot." },
    { id: "v8", n: 8, part: 4, title: "Objections: Competitor & Askari", loom: "d95ba26f66b0460893dc1a1ab39347bb",
      desc: "Learn how to respond when someone has a cheaper offer or already has a guard. Stay respectful and compare honestly." },
    { id: "v9", n: 9, part: 4, title: "Objections: Trust & Existing Cameras", loom: "e61720fc013649cca245d9cdddc21905",
      desc: "Learn how to build trust with facts the customer can check, and how to find the real gaps in cameras they already have." },
    { id: "v10", n: 10, part: 4, title: "Objections: Urgency & “Let Me Think”", loom: "3781754ab80c417194b4b5717cba381e",
      desc: "Learn how to handle customers who are not in a hurry or want time to decide, without pushing or pressuring them." },
    { id: "v11", n: 11, part: 5, title: "Homes, Businesses & Decision-Makers", loom: "1ba7744fcefd42d7b83b9911cba4a8b8",
      desc: "Learn how to adjust your conversation for a home or a business, and how to work with families and teams who decide together." },
    { id: "v12", n: 12, part: 5, title: "What We Sell & Closing", loom: "6c9db82d2477484c8e3265a7fa0cfb7e",
      desc: "Learn how to explain the real value of what we offer, and how to end every conversation with a clear next step." },
    { id: "v13", n: 13, part: 5, title: "What Not to Do & Your 10 Rules", loom: "abd0fe05fb54440da8c0aee133a14015",
      desc: "Learn the mistakes to avoid and the ten rules to follow every day in the field." }
  ];

  var TOTAL_MINUTES = 25;

  var HOW_TO = [
    "Watch the videos in order, from 1 to 13. Each one builds on the one before it.",
    "Watch them all once before your first day in the field.",
    "Come back and rewatch any video whenever you feel unsure, especially before a big meeting.",
    "If you have a question, write it down and bring it to your immediate supervisor."
  ];

  function watchUrl(v) { return "https://www.loom.com/share/" + v.loom; }
  function embedUrl(v) { return "https://www.loom.com/embed/" + v.loom + "?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true"; }
  function byId(id) { return VIDEOS.find(function (v) { return v.id === id; }) || null; }

  // One person's progress from their { videoId: isoTime } map.
  function progress(watched) {
    var w = watched || {};
    var done = VIDEOS.filter(function (v) { return !!w[v.id]; });
    var next = VIDEOS.find(function (v) { return !w[v.id]; }) || null;
    var last = done.map(function (v) { return String(w[v.id]); }).sort().pop() || "";
    return { done: done.length, total: VIDEOS.length, next: next, last: last, complete: done.length === VIDEOS.length };
  }

  // Everyone in the field (sales + team leads), least progress first.
  function teamProgress(users, training) {
    var t = training || {};
    return (users || []).filter(function (u) { return u && (u.role === "sales" || u.role === "teamlead" || !u.role); })
      .map(function (u) { var p = progress(t[u.id]); return { id: u.id, name: u.name || u.email || "—", role: u.role || "sales", done: p.done, total: p.total, last: p.last, complete: p.complete }; })
      .sort(function (a, b) { return a.done - b.done || a.name.localeCompare(b.name); });
  }

  // Short answers about using the app. `who`: "all", "sales" or "lead"
  // (Team lead, Operations and admin). Amounts come from the app's settings.
  function faq(opts) {
    var o = opts || {};
    var perQ = o.perQualified || "UGX 2,500", perD = o.perDeposit || "UGX 100,000";
    return [
      { who: "all", q: "How do I add a prospect?",
        a: "Tap + Add prospect on Today or Prospects. Fill in the business, the contact and their phone, take a photo of the business, and capture the GPS pin while you are at the site — the pin is required. Operations checks every new prospect." },
      { who: "all", q: "How do I log a call and plan the next follow-up?",
        a: "Tap Follow-up on the prospect. Pick what happened (Answered, No answer, Call back later…), write a short note of what they said, and set the next follow-up date and action. It is saved to the prospect's history, and the follow-up shows on Today when it is due." },
      { who: "sales", q: "How do I earn commission?",
        a: perQ + " for every prospect you move to Qualified that the Team lead approves, and " + perD + " when your client pays their first deposit. Commission is paid every Saturday at 12:00 noon — your Dashboard shows this week's total." },
      { who: "sales", q: "My prospect was sent back or disqualified — what now?",
        a: "Sent back: open it, fix what the note asks for, and save — it goes back for review. Disqualified: the reason is shown on the prospect; tap Got it. Only the Team lead or Operations can re-open a disqualified lead." },
      { who: "all", q: "Why is there no commission on some leads?",
        a: "Leads the office imports from Instagram or Google search are marked Imported. They are called by the Team lead and Operations and earn no commission." },
      { who: "all", q: "Can I give a discount?",
        a: "No. Quote only the approved package prices (video 6). If the budget is tight, offer a smaller package instead of inventing a discount." },
      { who: "lead", q: "How do I approve or disqualify a qualified prospect?",
        a: "Open Prospects → Qualified prospects to approve. Approve pays the rep " + perQ + " on Saturday. Disqualify asks for a reason from the list — choose Other to write your own. The rep sees the reason, and the lead moves to Lost." },
      { who: "lead", q: "How do I work the imported call list?",
        a: "Imported leads appear on Today as “First call”. Tap Call, then Follow-up to log what happened and plan the next call. After three unanswered calls, consider disqualifying the lead with the reason “No answer after several calls”." },
      { who: "lead", q: "How do I record a client's deposit?",
        a: "Tap Record deposit on the prospect. The rep's " + perD + " counts straight away; the Owner still approves the money in Cash flow." },
      { who: "all", q: "The app says “Saved on device — sync pending”.",
        a: "You were offline. Your work is safe on this phone. Keep the app open once you have signal again and it sends your changes; don't sign out until it says Synced." }
    ].filter(function (x) { return !o.who || x.who === "all" || x.who === o.who; });
  }

  var api = { PARTS: PARTS, VIDEOS: VIDEOS, TOTAL_MINUTES: TOTAL_MINUTES, HOW_TO: HOW_TO, watchUrl: watchUrl, embedUrl: embedUrl, byId: byId, progress: progress, teamProgress: teamProgress, faq: faq };
  root.VeriskoSupport = api;
})(typeof window !== "undefined" ? window : globalThis);
