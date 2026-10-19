// Verisko Uganda Operations — branded quotation PDF + share text.
//
// Pure model building lives here so it can be unit-tested in Node; the PDF is
// drawn with jsPDF (vendor/jspdf.umd.min.js, loaded on demand by app.js).
(function (root) {
  "use strict";

  var COMPANY = {
    name: "VERISKO",
    tagline: "Security cameras for your home or business",
    phone: "+256 752 924 657",
    phoneDigits: "256752924657",
    email: "hello@verisko.com",
    web: "verisko.com",
    address: "Kampala, Uganda"
  };
  var VALID_DAYS = 30;
  var FINANCE_FEE = 250000;
  var TERMS = [
    "Prices are in Ugandan shillings and include installation, recorder setup and phone app configuration by the Verisko team.",
    "This quotation is valid for " + VALID_DAYS + " days from the date above. Site conditions found on installation day may change the final scope.",
    "Pay in full or in two parts: 60% before installation and 40% once everything is fitted and tested. Where shown, the 3-month plan spreads the cost over three payments.",
    "Questions? Call or WhatsApp " + COMPANY.phone + "."
  ];

  function money(n) { return "UGX " + Math.round(Number(n) || 0).toLocaleString("en-US"); }
  function signedMoney(n) { return n < 0 ? "- " + money(-n) : money(n); }
  function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function addDays(iso, n) {
    var d = new Date(String(iso) + "T12:00:00Z");
    if (isNaN(d)) d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function longDate(iso) {
    var d = new Date(String(iso) + "T12:00:00Z");
    if (isNaN(d)) return String(iso || "");
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }

  // job:    the saved job record (rubric inputs, stage, notes, finalPrice…)
  // client: { business, contact, phone, location } from jobClient()
  // quote:  computeQuote(job) — base, lines, zone, discounts, cash, financed…
  // opts:   { value: jobValue(job), preparedBy, date (YYYY-MM-DD) }
  function buildQuoteModel(job, client, quote, opts) {
    job = job || {}; client = client || {}; quote = quote || {}; opts = opts || {};
    var date = job.quotedAt || opts.date || new Date().toISOString().slice(0, 10);
    var current = quote.pricingVersion === '2026-10-18-cfo4300';
    var care = root.VeriskoCare && quote.servicePolicyVersion === root.VeriskoCare.VERSION ? root.VeriskoCare : null;
    var validDays = current ? 7 : VALID_DAYS;
    var custom = !!quote.custom;
    var override = !custom && !!job.priceOverride && Number(job.finalPrice) > 0;
    var value = Number(opts.value);
    if (!isFinite(value)) value = (custom || override) ? (Number(job.finalPrice) || 0) : (Number(quote.cash) || 0);
    var items = [];
    if (custom) {
      items.push({ label: "Custom camera system (" + ((Number(quote.cameras) || 0) >= 12 ? "12+" : quote.cameras) + " cameras)",
        detail: "Priced by Verisko for this site", qty: 1, unit: value || null, amount: value || null });
    } else {
      items.push({ label: (quote.packageTier || "Camera") + " package · " + (quote.cameras || 0) + " cameras",
        detail: (quote.tier || "Standard") + " installation · recorder, cabling and setup included" + (care ? ' · 12-month care and 2-year camera/cable fault warranty' : ''), qty: 1, unit: quote.base, amount: quote.base });
      (quote.lines || []).forEach(function (l) {
        items.push({ label: l.label, detail: l.auto ? "Included for this installation" : "", qty: l.qty, unit: l.price, amount: l.total });
      });
      if (quote.zone && quote.zone.surcharge > 0) items.push({ label: "Travel surcharge · " + clean(quote.zone.label), detail: "", qty: 1, unit: quote.zone.surcharge, amount: quote.zone.surcharge });
      if (quote.bundle && quote.bundleDiscount) items.push({ label: "Complete Home Bundle discount", detail: "", qty: 1, unit: -quote.bundleDiscount, amount: -quote.bundleDiscount });
      if (quote.discountAmount > 0) items.push({ label: "Discount " + quote.discountPct + "%", detail: "", qty: 1, unit: -quote.discountAmount, amount: -quote.discountAmount });
      if (override) {
        var adj = value - (quote.pricingVersion ? items.reduce(function (sum, it) { return sum + it.amount; }, 0) : (Number(quote.cash) || 0));
        if (adj) items.push({ label: adj < 0 ? "Price adjustment" : "Additional work", detail: "Agreed with Verisko", qty: 1, unit: adj, amount: adj });
      }
    }
    var total = (custom && !value) ? null : value;
    var plans = [];
    if (total != null && total > 0) {
      var first = quote.pricingVersion ? Math.round(total * .6 / 10000) * 10000 : Math.round(total * 0.6);
      plans.push({ title: "Pay cash · 60 / 40", rows: [
        { label: "Before installation (60%)", amount: first },
        { label: "On completion (40%)", amount: total - first }
      ], note: "Total " + money(total) });
      if (!custom && (!override || quote.pricingVersion) && quote.financingAvailable) {
        var fin = Number(quote.financed) || (total + FINANCE_FEE);
        var m1 = quote.pricingVersion ? Math.round(fin * .4 / 10000) * 10000 : Math.round(fin * 0.4), m2 = quote.pricingVersion ? Math.round(fin * .3 / 10000) * 10000 : Math.round(fin * 0.3);
        plans.push({ title: "3 monthly payments · 40 / 30 / 30", rows: [
          { label: "Install day (40%)", amount: m1 },
          { label: "Month 2 (30%)", amount: m2 },
          { label: "Month 3 (30%)", amount: fin - m1 - m2 }
        ], note: "Total " + money(fin) + (quote.pricingVersion ? " · financing included" : " (includes " + money(fin - total) + " plan fee)") });
      }
    }
    if(current && job.paymentPlan) plans = plans.filter(function(p){return job.paymentPlan === 'cash' ? p.title.indexOf('Pay cash')===0 : p.title.indexOf('3 monthly')===0;});
    if(current && job.paymentSchedule && job.paymentSchedule.length && plans.length===1) plans[0].rows=job.paymentSchedule.map(function(r){return {label:r.label+' ('+r.due+')',amount:r.amount};});
    var terms = TERMS.slice();
    if(current) {
      terms[1]='This quotation is valid for 7 days. Confirm any scope changes with Verisko before additional work.';
      if(job.paymentPlan) terms[2]=job.paymentPlan === 'cash' ? 'Payment: 60% before installation and 40% on completion.' : 'Payment: 40% on installation day, 30% after 30 days and the remaining balance after 60 days. Financing is included in the total.';
      terms.push('Prices exclude separately applicable VAT. Any VAT treatment must be confirmed before a tax invoice is issued.');
    }
    if(quote.pricingVersion) terms.push('Hard drive is included only when listed. Without a compatible hard drive, the system provides live viewing without stored recordings.');
    if(care) terms = terms.concat(care.terms);
    return {
      ref: clean(job.ref) || "Quotation",
      date: date, validUntil: job.validUntil || addDays(date, validDays),
      preparedBy: clean(opts.preparedBy), stage: clean(job.stage),
      client: { business: clean(client.business), contact: clean(client.contact), phone: clean(client.phone), location: clean(client.location) },
      items: items, total: total, custom: custom, override: override, plans: plans,
      notes: clean(job.notes), terms: terms, coverageSummary: care ? care.summary : '', company: COMPANY
    };
  }

  function quoteFileName(m) {
    var biz = clean(m.client.business).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    return "Verisko-Quotation-" + clean(m.ref).replace(/[^A-Za-z0-9-]+/g, "") + (biz ? "-" + biz : "") + ".pdf";
  }

  // Short WhatsApp message that stands alone even when the PDF can't be attached.
  function quoteShareText(m) {
    var lines = ["*Verisko quotation " + m.ref + "*"];
    if (m.client.business) lines.push("For: " + m.client.business + (m.client.location ? ", " + m.client.location : ""));
    lines.push("");
    m.items.forEach(function (it) {
      lines.push("• " + it.label + (it.qty > 1 ? " x" + it.qty : "") + (it.amount == null ? "" : ": " + signedMoney(it.amount)));
    });
    lines.push("");
    lines.push("*Total (cash): " + (m.total == null ? "to be confirmed" : money(m.total)) + "*");
    if(m.coverageSummary) { lines.push('Included: '+m.coverageSummary); lines.push('Health monitoring only, without access to your footage. Fault warranty excludes accidents and power-surge damage.'); }
    m.plans.forEach(function (p) {
      lines.push(p.title + ": " + p.rows.map(function (r) { return money(r.amount); }).join(" + "));
    });
    lines.push("");
    lines.push("Valid until " + longDate(m.validUntil) + ". Full details are in the attached PDF.");
    lines.push("Verisko · " + m.company.phone + " · " + m.company.web);
    return lines.join("\n");
  }

  /* ----------------------------- PDF drawing ------------------------------- */
  function renderQuotePdf(JsPDF, m) {
    var doc = new JsPDF({ unit: "mm", format: "a4" });
    var W = 210, H = 297, L = 16, R = 194, CW = R - L;
    var NAVY = [1, 33, 105], INK = [31, 41, 55], MUTED = [107, 114, 128], LIGHT = [234, 240, 250], LINE = [217, 222, 232], WHITE = [255, 255, 255];
    var y = 0;
    function color(c) { doc.setTextColor(c[0], c[1], c[2]); }
    function fill(c) { doc.setFillColor(c[0], c[1], c[2]); }
    function stroke(c) { doc.setDrawColor(c[0], c[1], c[2]); }
    function font(style, size, c) { doc.setFont("helvetica", style); doc.setFontSize(size); if (c) color(c); }
    function ensure(need) { if (y + need > H - 19) { doc.addPage(); y = 20; } }
    function wrap(text, width) { return doc.splitTextToSize(String(text || ""), width); }

    // Header band with the Verisko chevron mark.
    fill(NAVY); doc.rect(0, 0, W, 34, "F");
    stroke(WHITE); doc.setLineWidth(3); doc.setLineCap(1); doc.setLineJoin(1);
    doc.lines([[6, 15], [6, -15]], 17, 9, [1, 1], "S");
    font("bold", 20, WHITE); doc.text(m.company.name, 34, 19);
    font("normal", 9, WHITE); doc.text(m.company.tagline, 34, 26);
    font("normal", 8.5, WHITE);
    [m.company.phone, m.company.email + " · " + m.company.web, m.company.address].forEach(function (t, i) { doc.text(t, R, 13 + i * 5.2, { align: "right" }); });

    // Title and reference block.
    font("bold", 18, NAVY); doc.text("QUOTATION", L, 49);
    var meta = [["Reference", m.ref], ["Date", longDate(m.date)], ["Valid until", longDate(m.validUntil)]];
    meta.forEach(function (row, i) {
      font("normal", 8.5, MUTED); doc.text(row[0], R - 42, 44 + i * 5.5, { align: "right" });
      font("bold", 9.5, INK); doc.text(row[1], R, 44 + i * 5.5, { align: "right" });
    });

    // Client and preparer.
    y = 66;
    font("bold", 8, MUTED); doc.text("PREPARED FOR", L, y);
    doc.text("PREPARED BY", 120, y);
    y += 6;
    font("bold", 12, INK); doc.text(m.client.business || "Client", L, y);
    font("normal", 10, INK); doc.text(m.preparedBy || "Verisko team", 120, y);
    var cy = y + 5.5;
    font("normal", 9.5, INK);
    [m.client.contact, m.client.phone, m.client.location].filter(Boolean).forEach(function (t) { doc.text(t, L, cy); cy += 5; });
    var py = y + 5.5;
    font("normal", 9.5, MUTED);
    ["Verisko, " + m.company.address, m.company.phone].forEach(function (t) { doc.text(t, 120, py); py += 5; });
    y = Math.max(cy, py) + 4;

    // Items table.
    var xQty = 126, xUnit = 157, descW = xQty - L - 14;
    fill(LIGHT); doc.rect(L, y, CW, 8, "F");
    font("bold", 8.5, NAVY);
    doc.text("DESCRIPTION", L + 3, y + 5.4); doc.text("QTY", xQty, y + 5.4, { align: "right" });
    doc.text("UNIT PRICE", xUnit, y + 5.4, { align: "right" }); doc.text("AMOUNT", R - 3, y + 5.4, { align: "right" });
    y += 8;
    m.items.forEach(function (it) {
      var lines = wrap(it.label, descW);
      var detail = it.detail ? wrap(it.detail, descW) : [];
      var h = 3.2 + lines.length * 4.6 + detail.length * 4 + 1.6;
      ensure(h);
      font("normal", 10, INK);
      lines.forEach(function (t, i) { doc.text(t, L + 3, y + 4.6 + i * 4.6); });
      if (detail.length) { font("normal", 8, MUTED); detail.forEach(function (t, i) { doc.text(t, L + 3, y + 4.6 + lines.length * 4.6 + i * 4); }); }
      font("normal", 10, INK);
      doc.text(String(it.qty || 1), xQty, y + 4.6, { align: "right" });
      doc.text(it.unit == null ? "—" : signedMoney(it.unit), xUnit, y + 4.6, { align: "right" });
      font("bold", 10, INK);
      doc.text(it.amount == null ? "—" : signedMoney(it.amount), R - 3, y + 4.6, { align: "right" });
      y += h;
      stroke(LINE); doc.setLineWidth(0.2); doc.line(L, y, R, y);
    });
    ensure(14);
    y += 2;
    stroke(NAVY); doc.setLineWidth(0.6); doc.line(L, y, R, y);
    font("bold", 12, NAVY); doc.text("Total (cash)", L + 3, y + 8);
    doc.text(m.total == null ? "To be confirmed" : money(m.total), R - 3, y + 8, { align: "right" });
    y += 15;

    // Payment options.
    if (m.plans.length) {
      var boxH = 9 + 3 * 6 + 7, gap = 6, boxW = m.plans.length > 1 ? (CW - gap) / 2 : CW;
      ensure(boxH + 12);
      font("bold", 8, MUTED); doc.text("PAYMENT OPTIONS", L, y); y += 4;
      m.plans.forEach(function (p, i) {
        var x = L + i * (boxW + gap);
        fill(LIGHT); stroke(LINE); doc.setLineWidth(0.3); doc.roundedRect(x, y, boxW, boxH, 2, 2, "FD");
        font("bold", 10, NAVY); doc.text(p.title, x + 4, y + 7);
        var ry = y + 14;
        p.rows.forEach(function (r) {
          font("normal", 9.5, INK); doc.text(r.label, x + 4, ry);
          font("bold", 9.5, INK); doc.text(money(r.amount), x + boxW - 4, ry, { align: "right" });
          ry += 6;
        });
        font("normal", 8, MUTED); doc.text(p.note, x + 4, y + boxH - 3.5);
      });
      y += boxH + 8;
    }

    // Notes.
    if (m.notes) {
      var nl = wrap(m.notes, CW);
      ensure(10 + nl.length * 4.5);
      font("bold", 8, MUTED); doc.text("NOTES", L, y); y += 5;
      font("normal", 9.5, INK); nl.forEach(function (t) { doc.text(t, L, y); y += 4.5; });
      y += 3;
    }

    // Terms (measured, so a short quote stays on one page).
    var termLines = m.terms.map(function (t) { font("normal", 8.5, MUTED); return wrap(t, CW - 5); });
    ensure(6 + termLines.reduce(function (n, tl) { return n + tl.length * 4 + 1.5; }, 0));
    font("bold", 8, MUTED); doc.text("TERMS", L, y); y += 5;
    termLines.forEach(function (tl) {
      ensure(tl.length * 4 + 2);
      font("normal", 8.5, MUTED); doc.text("•", L, y);
      tl.forEach(function (line) { doc.text(line, L + 4, y); y += 4; });
      y += 1.5;
    });

    // Footer on every page.
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      stroke(LINE); doc.setLineWidth(0.3); doc.line(L, H - 16, R, H - 16);
      font("normal", 8, MUTED);
      doc.text(m.company.name.charAt(0) + m.company.name.slice(1).toLowerCase() + " · " + m.company.web + " · " + m.company.phone + " · " + m.company.email, L, H - 11);
      doc.text("Page " + p + " of " + pages, R, H - 11, { align: "right" });
    }
    return doc;
  }

  root.VeriskoQuote = {
    buildQuoteModel: buildQuoteModel,
    renderQuotePdf: renderQuotePdf,
    quoteFileName: quoteFileName,
    quoteShareText: quoteShareText,
    money: money,
    COMPANY: COMPANY,
    TERMS: TERMS
  };
}(typeof window !== "undefined" ? window : globalThis));
