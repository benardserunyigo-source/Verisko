/* Verisko internal costing policy, approved 18 October 2026.
 * Source: Verisko Equipment Cost Map, Package Plans and Job Quote.
 * Planning costs, not supplier purchase commitments. Existing unversioned jobs
 * retain their original calculator. Never pass this internal object to a PDF.
 */
(function (root) {
  "use strict";
  var VERSION = "2026-10-18-margin26";
  var PACKAGES = {
    4: { name: "Essential", direct: 2683557.7688834295, crew: 350000, fee: 1200000 },
    6: { name: "Standard", direct: 3543285.6856179903, crew: 400000, fee: 1700000 },
    8: { name: "Premium", direct: 4385013.602352551, crew: 400000, fee: 2200000 },
    12: { name: "Commercial", direct: 6405950.833740699, crew: 400000, fee: 2200000 }
  };
  var POLICY = { margin: .26, increment: 10000, processing: .03, monthly: .02, risk: .03, contingency: .05, callbacks: 170000, acquisition: 60000, overhead: 210000 };
  var STORAGE = { hdd2tb: 327600, hdd4tb: 537600, hdd6tb: 967400 };
  var number = function (v) { return Math.max(0, Number(v) || 0); };
  var filled = function (v) { return v !== "" && v != null && Number.isFinite(Number(v)) && Number(v) >= 0; };
  var up = function (v) { return Math.ceil(v / POLICY.increment) * POLICY.increment; };
  var round = function (v) { return Math.round(v / POLICY.increment) * POLICY.increment; };
  function payments(price) { var a = round(price * .4), b = round(price * .3); return [a, b, price - a - b]; }
  function costsAt(price, direct) {
    var p = payments(price), beforeFees = direct * (1 + POLICY.contingency) + POLICY.callbacks + POLICY.acquisition + POLICY.overhead;
    var financing = direct * POLICY.monthly + ((price - p[0]) + (price - p[0] - p[1])) * POLICY.monthly + (price - p[0]) * POLICY.risk;
    var cost = beforeFees + price * POLICY.processing + financing;
    return { cost: cost, profit: price - cost, margin: price > 0 ? (price - cost) / price : 0, financing: financing, payments: p };
  }
  function minimum(direct, fee) {
    var beforeFees = direct * (1 + POLICY.contingency) + POLICY.callbacks + POLICY.acquisition + POLICY.overhead;
    var financeShare = .9 * POLICY.monthly + .6 * POLICY.risk;
    var roundingSafeguard = POLICY.increment / 2 * (3 * POLICY.monthly + POLICY.risk);
    return up(Math.max((beforeFees + fee) / (1 - POLICY.processing), (beforeFees + direct * POLICY.monthly + roundingSafeguard) / (1 - POLICY.processing - financeShare - POLICY.margin)));
  }
  function compute(q, context) {
    q = q || {}; context = context || {};
    var count = Number(q.cameraCount), pack = PACKAGES[count], addons = q.addons || {};
    if (!pack) return { pricingVersion: VERSION, cameras: count, custom: true, needsApproval: true, errors: ["Choose 4, 6, 8 or 12 cameras."], cash: 0, lines: [], zone: context.zone || { surcharge: 0 } };
    var errors = [], storageKeys = Object.keys(STORAGE).filter(function (k) { return !!addons[k]; });
    if (storageKeys.length > 1) errors.push("Choose only one hard drive.");
    var storage = storageKeys.reduce(function (s, k) { return s + STORAGE[k]; }, 0);
    var otherLines = (context.lines || []).filter(function (l) { return !STORAGE[l.key] && l.key !== "camFixed" && l.key !== "camWide" && l.key !== "surge"; });
    var zone = context.zone || { key: "1", label: "Zone 1", surcharge: 0 };
    var needsExtra = otherLines.length > 0 || zone.surcharge > 0 || context.tier === "Complex" || context.tier === "Very Complex";
    if (needsExtra && !filled(q.extraCost)) errors.push("Enter the actual extra equipment, travel and complex-site costs (0 if confirmed none).");
    if (q.directCost !== "" && q.directCost != null && !filled(q.directCost)) errors.push("Enter a valid direct job cost.");
    var baseDirect = filled(q.directCost) ? number(q.directCost) : pack.direct;
    var extra = number(q.extraCost), direct = baseDirect + storage + extra;
    var base = minimum(baseDirect, pack.fee), priceFloor = minimum(direct, pack.fee);
    var lines = [], running = baseDirect, prior = base;
    storageKeys.forEach(function (k) { running += STORAGE[k]; var total = minimum(running, pack.fee), amount = total - prior; lines.push({ key: k, label: k === "hdd2tb" ? "Hard drive 2TB" : k === "hdd4tb" ? "Hard drive 4TB" : "Hard drive 6TB", qty: 1, price: amount, total: amount }); prior = total; });
    otherLines.forEach(function (l) { var total = up(number(l.total)); lines.push(Object.assign({}, l, { price: total / l.qty, total: total })); });
    var quoted = base + lines.reduce(function (s, l) { return s + l.total; }, 0) + number(zone.surcharge);
    var uplift = Math.max(0, priceFloor - up(quoted));
    // Keep the existing customer package/add-on structure; price the site work
    // into the package rather than exposing our internal cost/profit uplift.
    base += uplift; quoted = up(quoted + uplift);
    var discountPct = Math.min(100, number(q.discountPct));
    var discountAmount = round(quoted * discountPct / 100), price = quoted - discountAmount;
    var override = q.priceOverride && number(q.finalPrice) > 0;
    if (override) price = number(q.finalPrice);
    if (price % POLICY.increment !== 0) errors.push("Customer prices must be in UGX 10,000 increments.");
    var result = costsAt(price, direct);
    if (result.margin < POLICY.margin) errors.push("Price is below the 26% profit margin. Reduce the discount or increase the price.");
    return {
      pricingVersion: VERSION, pts: context.pts || 0, tier: context.tier || "Simple", cameras: count, packageTier: pack.name,
      base: base, custom: false, lines: lines, addonsTotal: lines.reduce(function (s, l) { return s + l.total; }, 0), zone: zone,
      bundle: false, bundleDiscount: 0, subtotal: quoted, discountPct: discountPct, discountAmount: discountAmount,
      cash: price, financed: price, financingAvailable: true, needsApproval: context.tier === "Very Complex",
      errors: errors, minimumPrice: priceFloor, direct: direct, costOfDoingBusiness: result.cost, netProfit: result.profit,
      margin: result.margin, financing: result.financing, payments: result.payments, cableMetres: count * 50,
      recorderChannels: count <= 8 ? 8 : 16, crew: pack.crew
    };
  }
  // Deliberate allow-list: Sales price cards never receive the costing model.
  function publicPackages() {
    return [4,6,8,12].map(function (count) {
      var r = compute({ cameraCount: count });
      return { cameras: count, name: r.packageTier, price: r.cash, payments: r.payments.slice(), recorderChannels: r.recorderChannels };
    });
  }
  root.VeriskoPricing = { VERSION: VERSION, packages: PACKAGES, policy: POLICY, compute: compute, costsAt: costsAt, payments: payments, publicPackages: publicPackages };
})(typeof window !== "undefined" ? window : globalThis);
