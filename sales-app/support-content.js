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
    "After each video, take its 3-question quiz. Get all 3 right to complete the video — you can retry as often as you need.",
    "Watch them all once before your first day in the field.",
    "Come back and rewatch any video whenever you feel unsure, especially before a big meeting.",
    "If you have a question, write it down and bring it to your immediate supervisor."
  ];

  // A short quiz after each video: 3 questions, all must be right to pass
  // (retries allowed). Written from each Loom video's summary and chapters.
  // `a` is the right answer, `wrong` the others (shown in a shuffled order).
  var QUIZZES = {
    v1: [
      { q: "What is the one rule you must never break?", a: "Never guess or invent discounts, promises or facts", wrong: ["Always close the sale on the first visit", "Never speak to the caretaker at the gate"],
        why: "Honesty comes before any sales tactic. If you don't know, say so and follow up." },
      { q: "A customer asks something you don't know. What do you do?", a: "Say you don't know, then follow up with the right answer", wrong: ["Give your best guess so you don't look unsure", "Change the subject"],
        why: "A wrong answer costs trust. \"Let me check and come back to you\" keeps it." },
      { q: "What is Verisko's promise to every customer?", a: "Know what happens at your property, always", wrong: ["The cheapest cameras in Kampala", "Free cameras for every home"],
        why: "We sell knowing what happens at your property — homes and businesses alike." }
    ],
    v2: [
      { q: "How should you start a conversation with a customer?", a: "A proper greeting — ask how they are and how business is going", wrong: ["Go straight into the price", "Hand over a flyer without saying much"],
        why: "A proper greeting and brief, genuine small talk come before any pitch." },
      { q: "Which body language helps build trust?", a: "Eye contact, a smile and standing straight", wrong: ["Arms crossed so you look serious", "Looking at your phone while they talk"],
        why: "Speak clearly at a steady pace, keep eye contact, smile, stand straight — and don't cross your arms." },
      { q: "A customer is abrupt or rude. What do you do?", a: "Stay calm and polite — word travels", wrong: ["Answer back the same way", "Walk away without a word"],
        why: "Stay composed. How you treat one person reaches their neighbours." }
    ],
    v3: [
      { q: "What is the structure of a cold open?", a: "Greet, say who you are and what you do, ask for two minutes, then stop and listen", wrong: ["Greet, then explain every product you sell", "Ask for their budget first"],
        why: "Keep it tight: greeting, who you are, what you do, two minutes — then listen." },
      { q: "You meet the caretaker or askari at the gate. How do you treat them?", a: "With the same respect as the owner, and ask if the owner or landlord is available", wrong: ["Walk past them to find the owner", "Ask them to decide for the owner"],
        why: "Gatekeepers deserve the same respect as the owner — and they decide whether you get in." },
      { q: "The person is busy or says no. What do you do?", a: "Offer to leave your number or come back at a better time, and leave politely", wrong: ["Keep talking until they agree", "Come back the same day with a lower price"],
        why: "Exit cleanly. Pushing damages trust and future sales." }
    ],
    v4: [
      { q: "What are the four steps of every conversation, in order?", a: "Listen, Check, Answer, Move", wrong: ["Answer, Listen, Discount, Close", "Pitch, Price, Push, Close"],
        why: "Listen without interrupting, Check what they mean, Answer briefly and honestly, Move to a next step." },
      { q: "A customer says \"too expensive\". What is the Check step?", a: "Ask one clear question to find out what they really mean", wrong: ["Defend the price straight away", "Offer a discount"],
        why: "\"Too expensive\" can mean can't afford it, a cheaper quote elsewhere, unclear value, or testing for a discount." },
      { q: "What does the Move step mean?", a: "Agree a specific next step — a free site check, a written quotation or a decision", wrong: ["Move on to the next customer", "Move the price down"],
        why: "Every conversation ends with a clear, specific next step." }
    ],
    v5: [
      { q: "What does the video recorder (NVR) do?", a: "Connects to all the cameras and stores the footage", wrong: ["Powers the gate motor", "It is an extra outdoor camera"],
        why: "The recorder is the centre of the system: every camera connects to it and it keeps the footage." },
      { q: "Which camera suits a large site that needs to pan, tilt and zoom?", a: "A PTZ camera", wrong: ["A ceiling dome camera", "A doorbell camera"],
        why: "PTZ = pan, tilt, zoom — for larger sites. Domes suit indoor doors and corridors; outdoor cameras cover gates and parking." },
      { q: "What can the AI features do?", a: "Tell people from vehicles, watch a set zone like the back gate, and send photo alerts", wrong: ["Call the police automatically", "Lock the gate on their own"],
        why: "Person and vehicle detection, zone watching and photo alerts — explained in plain words." }
    ],
    v6: [
      { q: "What is the full-payment price for a 4-camera package?", a: "UGX 2,200,000", wrong: ["UGX 1,650,000", "UGX 2,700,000"],
        why: "2 cameras UGX 1,650,000 · 4 cameras UGX 2,200,000 · 6 cameras UGX 2,700,000. Above 6, the office prices it." },
      { q: "How does the payment plan work?", a: "40% on installation day, 30% after 30 days, 30% after 60 days", wrong: ["50% now and 50% next month", "Nothing to pay for 90 days"],
        why: "The plan has a UGX 250,000 administration fee, and there's no penalty for paying early." },
      { q: "The customer's budget is tight. What do you do?", a: "Offer a smaller system — cover the priority areas first and add more later", wrong: ["Invent a discount to close the sale", "Tell them to come back next year"],
        why: "Change the size of the system, never the approved price." }
    ],
    v7: [
      { q: "A customer says the price is too high. What do you do first?", a: "Find the real concern — the overall cost, or were they thinking of a smaller system?", wrong: ["Defend the figure straight away", "Drop the price on the spot"],
        why: "Don't defend the number. Understand the real concern first." },
      { q: "Once you understand the concern, what comes next?", a: "Explain what is included and look for a setup that fits", wrong: ["Promise the office will give a discount", "Thank them and leave"],
        why: "Show the value, then find a configuration that fits their budget." },
      { q: "They need an exact number. What do you offer?", a: "A free site check", wrong: ["Your best guess", "The highest price, to be safe"],
        why: "The site check gives an accurate quote — no guessing." }
    ],
    v8: [
      { q: "\"I know someone who would do it for less.\" How do you respond?", a: "Help them compare the full scope — camera quality, hidden cabling, written warranty and after-sales support", wrong: ["Criticise the other installer", "Match the lower price"],
        why: "Stay respectful and compare honestly — not just the headline number." },
      { q: "What helps the customer compare the two offers fairly?", a: "A written quotation showing exactly what's included", wrong: ["A verbal promise", "Pressure to decide today"],
        why: "In writing, both options can be compared clearly." },
      { q: "\"I already have an askari.\" What do you say?", a: "Cameras support the askari, covering the areas he can't watch every minute", wrong: ["Cameras replace the askari", "Askaris aren't reliable"],
        why: "Cameras work with the guard, not against him." }
    ],
    v9: [
      { q: "What comes with every Verisko installation?", a: "A 12-month written warranty and a free check-in after 30 days", wrong: ["A lifetime guarantee", "Nothing in writing"],
        why: "If equipment fails in the warranty window it's repaired or replaced free, on documented terms." },
      { q: "Why does Verisko's physical office matter to customers?", a: "It shows we won't disappear like some contractors — they can find us", wrong: ["Customers must pay there", "It doesn't matter"],
        why: "Build trust with facts the customer can check." },
      { q: "The customer already has cameras. What do you do?", a: "Find the real gaps in coverage, and check whether they can view footage on their phone when away", wrong: ["Tell them to replace everything", "Leave — they're not a customer"],
        why: "Don't assume they need a whole new system." }
    ],
    v10: [
      { q: "Nothing has happened yet, so the customer feels no rush. What do you do?", a: "Explain calmly that many people install before a loss, because prevention is easier — no exaggeration", wrong: ["Scare them with crime stories", "Say the offer ends today"],
        why: "Never create fear or exaggerate." },
      { q: "The customer wants to wait. What do you leave with them?", a: "A clear written quotation after the site visit", wrong: ["Nothing — wait for them to call", "A deadline to decide"],
        why: "A written quote keeps the door open without pressure." },
      { q: "\"Let me think about it.\" What is the best reply?", a: "Ask what they want to think over — the investment, the system or the timing — and whether someone else decides with them", wrong: ["Push for a yes now", "Offer a discount"],
        why: "Find out what's really behind the pause; often a spouse or partner decides too." }
    ],
    v11: [
      { q: "At a home, what do you connect the conversation to?", a: "Household values — children's safety, visitors, workers and vehicles", wrong: ["Stock levels and till disputes", "Only the price"],
        why: "Homes care about family, who comes in, workers and cars." },
      { q: "At a business, what do you connect the conversation to?", a: "Daily operations — stock, cash, staff and customer flow, till disputes, opening and closing", wrong: ["Children's safety", "Nothing — just give the price"],
        why: "Businesses care about stock, cash, staff and blind spots." },
      { q: "Who do you check with about cabling or mounting, if the customer isn't the owner?", a: "The landlord or caretaker", wrong: ["Nobody — just install", "The neighbours"],
        why: "Confirm approvals for cabling and mounting before you promise anything." }
    ],
    v12: [
      { q: "What are you really selling?", a: "Peace of mind — seeing what happens when the owner is away, and evidence if something happens", wrong: ["Cameras at the lowest price", "A monthly subscription"],
        why: "Sell protection and peace of mind, not hardware." },
      { q: "Why do referrals matter so much?", a: "Happy customers bring neighbours and contacts in their compound or trading area", wrong: ["They don't — only ads work", "They replace the site check"],
        why: "Satisfied customers are a big growth channel." },
      { q: "How should you close?", a: "Ask for a concrete next step, and be honest when you don't know something", wrong: ["Pressure them to sign today", "Wait for them to call you"],
        why: "No pressure: a clear next step and accurate answers." }
    ],
    v13: [
      { q: "Which of these is never allowed?", a: "Inventing discounts, prices, payment terms, customers or references", wrong: ["Asking a clarifying question", "Explaining value in the customer's own words"],
        why: "These are non-negotiable: never lie or invent anything." },
      { q: "Can you promise something that isn't in the written warranty?", a: "No — never promise capabilities or guarantees that aren't in writing", wrong: ["Yes, if it closes the sale", "Only for big customers"],
        why: "Only promise what the written warranty says." },
      { q: "A situation isn't covered in your training. What do you do?", a: "Work through the five questions: their concern, the real issue, what they need now, what Verisko can honestly offer, and the right next step", wrong: ["Make your best guess", "Tell them to call the office and leave"],
        why: "The five questions guide you when the script runs out." }
    ]
  };

  function quizKey(id) { return "q-" + id; }
  // Stored as "<score>/<total> <ISO time>" (the best attempt).
  function quizResult(watched, id) {
    var v = (watched || {})[quizKey(id)];
    var m = /^(\d+)\/(\d+) (.+)$/.exec(String(v || ""));
    if (!m) return null;
    var score = Number(m[1]), total = Number(m[2]);
    return { score: score, total: total, at: m[3], passed: total > 0 && score === total };
  }
  function quizValue(score, total, at) { return score + "/" + total + " " + at; }
  // Options in a shuffled order. `rand` is injectable for tests.
  function quizFor(id, rand) {
    var r = rand || Math.random;
    return (QUIZZES[id] || []).map(function (x) {
      var opts = [x.a].concat(x.wrong);
      for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
      return { q: x.q, options: opts, answer: x.a, why: x.why };
    });
  }
  // answers: the chosen option text for each question, in order.
  function scoreQuiz(id, answers) {
    var qs = QUIZZES[id] || [];
    var results = qs.map(function (x, i) { return { correct: (answers || [])[i] === x.a, answer: x.a, why: x.why }; });
    var score = results.filter(function (r) { return r.correct; }).length;
    return { score: score, total: qs.length, passed: qs.length > 0 && score === qs.length, results: results };
  }

  function watchUrl(v) { return "https://www.loom.com/share/" + v.loom; }
  function embedUrl(v) { return "https://www.loom.com/embed/" + v.loom + "?hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true"; }
  function byId(id) { return VIDEOS.find(function (v) { return v.id === id; }) || null; }

  // One person's progress from their training map: { videoId: isoTime } for
  // watched, { "q-videoId": "3/3 isoTime" } for the quiz. A video is complete
  // once its quiz is passed.
  function progress(watched) {
    var w = watched || {};
    var seen = VIDEOS.filter(function (v) { return !!w[v.id]; });
    var passed = VIDEOS.filter(function (v) { var r = quizResult(w, v.id); return r && r.passed; });
    var next = VIDEOS.find(function (v) { var r = quizResult(w, v.id); return !(r && r.passed); }) || null;
    var times = seen.map(function (v) { return String(w[v.id]); }).concat(passed.map(function (v) { return quizResult(w, v.id).at; }));
    var last = times.sort().pop() || "";
    return { done: passed.length, watched: seen.length, total: VIDEOS.length, next: next, last: last, complete: passed.length === VIDEOS.length };
  }

  // Everyone in the field (sales + team leads), least progress first.
  function teamProgress(users, training) {
    var t = training || {};
    return (users || []).filter(function (u) { return u && (u.role === "sales" || u.role === "teamlead" || !u.role); })
      .map(function (u) { var p = progress(t[u.id]); return { id: u.id, name: u.name || u.email || "—", role: u.role || "sales", done: p.done, watched: p.watched, total: p.total, last: p.last, complete: p.complete }; })
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

  var api = { QUIZZES: QUIZZES, quizKey: quizKey, quizResult: quizResult, quizValue: quizValue, quizFor: quizFor, scoreQuiz: scoreQuiz, PARTS: PARTS, VIDEOS: VIDEOS, TOTAL_MINUTES: TOTAL_MINUTES, HOW_TO: HOW_TO, watchUrl: watchUrl, embedUrl: embedUrl, byId: byId, progress: progress, teamProgress: teamProgress, faq: faq };
  root.VeriskoSupport = api;
})(typeof window !== "undefined" ? window : globalThis);
