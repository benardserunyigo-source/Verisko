/* Verisko pricing calculation engine. Private inputs are authenticated.
 * Public assets contain no equipment costs or overhead amounts.
 * Planning costs, not supplier purchase commitments. Existing unversioned jobs
 * retain their original calculator. Never pass this internal object to a PDF.
 */
(function (root) {
  "use strict";
  function create(config) {
  config = config || {};
  var VERSION = config.version || "2026-10-18-cfo4300";
  var PACKAGES = config.packages || {};
  var POLICY = config.policy || {};
  var STORAGE = config.storage || {};
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
  function minimum(direct, fee, margin) {
    margin = margin == null ? POLICY.target : margin;
    var beforeFees = direct * (1 + POLICY.contingency) + POLICY.callbacks + POLICY.acquisition + POLICY.overhead;
    var financeShare = .9 * POLICY.monthly + .6 * POLICY.risk;
    var roundingSafeguard = POLICY.increment / 2 * (3 * POLICY.monthly + POLICY.risk);
    return up(Math.max((beforeFees + fee) / (1 - POLICY.processing), (beforeFees + direct * POLICY.monthly + roundingSafeguard) / (1 - POLICY.processing - financeShare - margin)));
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
    var installationType = q.installationType || (context.tier === "Complex" || context.tier === "Very Complex" ? "Complex" : "Simple");
    if (installationType !== "Simple" && installationType !== "Complex") errors.push("Choose Simple or Complex installation.");
    var fields = ['extraMaterialsCost','extraCrewCost','extraAccessTravelCost'];
    var hasBreakdown = fields.some(function (k) { return q[k] != null; });
    var needsExtra = otherLines.length > 0 || zone.surcharge > 0 || installationType === "Complex";
    if (hasBreakdown) {
      fields.forEach(function (k) { if ((needsExtra || (q[k] !== '' && q[k] != null)) && !filled(q[k])) errors.push("Enter all three extra costs. Use 0 when confirmed none."); });
    } else if (needsExtra && !filled(q.extraCost)) errors.push("Enter the actual extra equipment, travel and complex-site costs (0 if confirmed none).");
    if (q.directCost !== "" && q.directCost != null && !filled(q.directCost)) errors.push("Enter a valid direct job cost.");
    var baseDirect = filled(q.directCost) ? number(q.directCost) : pack.direct;
    if (!(baseDirect > 0)) errors.push("Direct cost must be greater than zero.");
    var addonCost = 0;
    otherLines.forEach(function(l){
      if (!filled((q.addonCosts || {})[l.key])) errors.push("Enter the purchase and fitting cost for " + l.label + ".");
      addonCost += number((q.addonCosts || {})[l.key]);
    });
    var extra = (hasBreakdown ? fields.reduce(function (s,k) { return s + number(q[k]); },0) : number(q.extraCost)) + addonCost;
    var extraCrew = hasBreakdown ? number(q.extraCrewCost) : 0;
    var crewApprovalKey = extraCrew > 0 ? count + ':' + extraCrew : '';
    var direct = baseDirect + storage + extra;
    var base = minimum(baseDirect, pack.fee), targetPrice = minimum(direct, pack.fee), priceFloor = minimum(direct, 0, POLICY.margin);
    var lines = [], running = baseDirect, prior = base;
    storageKeys.forEach(function (k) { running += STORAGE[k]; var total = minimum(running, pack.fee), amount = total - prior; lines.push({ key: k, label: k === "hdd2tb" ? "Hard drive 2TB" : k === "hdd4tb" ? "Hard drive 4TB" : "Hard drive 6TB", qty: 1, price: amount, total: amount }); prior = total; });
    otherLines.forEach(function (l) { var total = up(number(l.total)); lines.push(Object.assign({}, l, { price: total / l.qty, total: total })); });
    var quoted = base + lines.reduce(function (s, l) { return s + l.total; }, 0) + number(zone.surcharge);
    var uplift = Math.max(0, targetPrice - up(quoted));
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
    var reasons = [];
    if (extraCrew > 0 && q.crewApprovalKey !== crewApprovalKey) reasons.push("extra crew");
    if (baseDirect < pack.direct) reasons.push("lower direct cost");
    if (otherLines.some(function(l){return l.key !== 'hdmi' && number((q.addonCosts||{})[l.key]) === 0;})) reasons.push("zero-cost add-on");
    if (result.margin < POLICY.target) reasons.push("discount below the 30% target");
    if (q.priceOverride || discountPct > 0) reasons.push("selling price adjustment");
    var approvalKey = reasons.length ? JSON.stringify([VERSION,count,baseDirect,storage,extra,price,q.costEvidence || '',q.paymentPlan || 'installments',q.scheduledDate || '',q.addons || {},q.addonCosts || {},zone.key || '',installationType]) : '';
    var approved = !!approvalKey && q.costApprovalKey === approvalKey;
    var releaseErrors = [];
    if (!q.costConfirmed || !String(q.costEvidence || '').trim()) releaseErrors.push("Confirm supplier prices, chargeable freight, cable routes, crew scope and overhead; add the evidence link or reference.");
    if (!['installments','cash'].includes(q.paymentPlan)) releaseErrors.push("Choose the customer's payment plan.");
    return {
      approvalKeyRequired: approvalKey, approvalReasons: reasons, releaseErrors: releaseErrors,
      exchangeRate: POLICY.fx, targetMargin: POLICY.target, fundingRequired: direct,
      fundingGap: Math.max(0,direct - (q.paymentPlan === 'cash' ? round(price*.6) : result.payments[0]) * (1-POLICY.processing)),
      pricingVersion: VERSION, pts: context.pts || 0, tier: installationType, cameras: count, packageTier: pack.name,
      base: base, custom: false, lines: lines, addonsTotal: lines.reduce(function (s, l) { return s + l.total; }, 0), zone: zone,
      bundle: false, bundleDiscount: 0, subtotal: quoted, discountPct: discountPct, discountAmount: discountAmount,
      cash: price, financed: price, financingAvailable: true, needsApproval: reasons.length > 0 && !approved,
      errors: errors, minimumPrice: priceFloor, direct: direct, costOfDoingBusiness: result.cost, netProfit: result.profit,
      margin: result.margin, financing: result.financing, payments: result.payments, cableMetres: count * 50,
      recorderChannels: count <= 8 ? 8 : 16, crew: pack.crew + extraCrew, extraCost: extra, requiresExtraCosts: needsExtra, crewApprovalKeyRequired: crewApprovalKey
    };
  }
  // Deliberate allow-list: Sales price cards never receive the costing model.
  function publicPackages() {
    if (!Object.keys(PACKAGES).length) return config.catalogue || [];
    return [4,6,8,12].map(function (count) {
      var r = compute({ cameraCount: count });
      return { cameras: count, name: r.packageTier, price: r.cash, payments: r.payments.slice(), recorderChannels: r.recorderChannels };
    });
  }
  return { VERSION: VERSION, packages: PACKAGES, policy: POLICY, compute: compute, costsAt: costsAt, payments: payments, publicPackages: publicPackages };
  }
  root.createVeriskoPricing = create;
  root.VeriskoPricing = create(root.VeriskoPriceCatalogue);
})(typeof window !== "undefined" ? window : globalThis);
