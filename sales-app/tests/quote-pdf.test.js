import test from "node:test";
import assert from "node:assert/strict";
import "../quote-pdf.js";

const Q = globalThis.VeriskoQuote;

// Mirrors computeQuote() output for a 4-cam Standard job with a 2TB drive,
// one moving camera and a Zone 3 surcharge (the example on Ben's phone).
const quote = {
  pts: 12, tier: "Standard", cameras: 4, packageTier: "Essential", base: 2500000, custom: false,
  lines: [
    { key: "hdd2tb", label: "Hard drive 2TB", qty: 1, price: 500000, total: 500000 },
    { key: "camWide", label: "Extra camera (moving/wide)", qty: 1, price: 500000, total: 500000 }
  ],
  addonsTotal: 1000000, zone: { key: "3", label: "Zone 3 — Entebbe / Mukono / Matugga", surcharge: 50000 },
  bundle: false, bundleDiscount: 0, subtotal: 3550000, discountPct: 0, discountAmount: 0,
  cash: 3550000, financed: 3800000, financingAvailable: true, needsApproval: false
};
const job = { id: "j1", ref: "J-2026-0007", stage: "Draft", notes: "Install Saturday morning.", cameraCount: 4 };
const client = { business: "Acacia Pharmacy", contact: "Grace N.", phone: "+256 772 460 125", location: "Kira Road, Kampala" };

test("items add up to the app's cash total and the plans match the app's split", () => {
  const m = Q.buildQuoteModel(job, client, quote, { value: 3550000, preparedBy: "Abraham", date: "2026-09-28" });
  const sum = m.items.reduce((s, it) => s + it.amount, 0);
  assert.equal(sum, 3550000);
  assert.equal(m.total, 3550000);
  assert.equal(m.validUntil, "2026-10-28");
  assert.equal(m.items[0].label, "Essential package · 4 cameras");
  assert.match(m.items[3].label, /Travel surcharge · Zone 3/);
  assert.equal(m.plans.length, 2);
  assert.deepEqual(m.plans[0].rows.map((r) => r.amount), [2130000, 1420000]);
  assert.deepEqual(m.plans[1].rows.map((r) => r.amount), [1520000, 1140000, 1140000]);
  assert.equal(m.plans[1].rows.reduce((s, r) => s + r.amount, 0), 3800000);
});

test("discounts appear as negative lines and still sum to the total", () => {
  const q = { ...quote, bundle: true, bundleDiscount: 150000, discountPct: 5, discountAmount: 170000, cash: 3230000, financed: 3480000 };
  const m = Q.buildQuoteModel(job, client, q, { value: 3230000, date: "2026-09-28" });
  const neg = m.items.filter((it) => it.amount < 0);
  assert.equal(neg.length, 2);
  assert.equal(m.items.reduce((s, it) => s + it.amount, 0), 3230000);
});

test("a custom 12+ camera job without a final price has no total and no plans", () => {
  const q = { ...quote, custom: true, base: null, cameras: 12, lines: [], financingAvailable: false };
  const m = Q.buildQuoteModel({ ...job, cameraCount: 12 }, client, q, { value: 0, date: "2026-09-28" });
  assert.equal(m.total, null);
  assert.deepEqual(m.plans, []);
  assert.match(Q.quoteShareText(m), /to be confirmed/);
});

test("a custom job with a final price gets a single line and the cash plan only", () => {
  const q = { ...quote, custom: true, base: null, cameras: 14, lines: [], financingAvailable: false };
  const m = Q.buildQuoteModel({ ...job, cameraCount: 14, finalPrice: 9000000, priceOverride: true }, client, q, { value: 9000000, date: "2026-09-28" });
  assert.equal(m.items.length, 1);
  assert.equal(m.total, 9000000);
  assert.equal(m.plans.length, 1);
});

test("an admin price override adds an adjustment line so the items still sum", () => {
  const m = Q.buildQuoteModel({ ...job, finalPrice: 3400000, priceOverride: true }, client, quote, { value: 3400000, date: "2026-09-28" });
  assert.equal(m.items[m.items.length - 1].label, "Price adjustment");
  assert.equal(m.items.reduce((s, it) => s + it.amount, 0), 3400000);
  assert.equal(m.plans.length, 1, "no 3-month plan on an overridden price");
});

test("file name and share text are safe and informative", () => {
  const m = Q.buildQuoteModel(job, { ...client, business: "Mama's Shop / Ntinda" }, quote, { value: 3550000, date: "2026-09-28" });
  assert.equal(Q.quoteFileName(m), "Verisko-Quotation-J-2026-0007-Mama-s-Shop-Ntinda.pdf");
  const t = Q.quoteShareText(m);
  assert.match(t, /J-2026-0007/);
  assert.match(t, /UGX 3,550,000/);
  assert.match(t, /28 October 2026/);
  assert.match(t, /\+256 752 924 657/);
});
