import test from "node:test";
import assert from "node:assert/strict";
import { buildTables, toCsv, TABLE_COLUMNS } from "../netlify/functions/export.mjs";

const sample = {
  prospects: [
    { id: "p1", business: "Acacia Pharmacy", vertical: "Pharmacy", contact: "Grace", phone: "+256 772 460 125", location: "Kira Road",
      createdBy: "Rep One", reviewStatus: "pending", closedSale: false, photoId: "ph1",
      geo: { lat: 0.3136, lng: 32.5811, accuracy: 12.4, at: "2026-09-28T09:00:00Z" },
      followUps: [{ at: "2026-09-28T10:00:00Z", by: "Rep One", note: "Called, \"busy\"", geo: null }], newField: "kept" },
    { id: "p2", business: "Comma, Ltd", vertical: "Office" }
  ],
  appointments: [{ id: "a1", prospectId: "p1", date: "2026-09-29", time: "10:00", director: "Ops", status: "Confirmed", purpose: "Survey", directions: "Ask for Grace" }],
  jobs: [{ id: "j1", ref: "J-2026-0001", stage: "Accepted", prospectId: "p1", finalPrice: 2500000, materials: [{ name: "Cable", qty: 2, unitCost: 50000 }] }],
  transactions: [
    { id: "t1", date: "2026-09-28", direction: "out", amount: 30000, category: "Transport", method: "Cash", prospectId: "p1", proofId: "rc1", status: "pending", preapproved: false },
    { id: "t2", date: "2026-09-30", direction: "in", amount: 200000, category: "Customer deposit", method: "MTN MoMo", installId: "j1", status: "approved" },
    { id: "t3", date: "2026-09-29", direction: "in", amount: 100000, category: "Customer deposit", method: "Cash", installId: "j1", status: "pending" }
  ],
  users: [{ id: "u1", name: "Ben", email: "ben@example.com", role: "admin" }],
  technicians: [{ id: "tech1", name: "Joel", active: false }],
  config: { exportKey: "secret-not-exported" }
};

test("flattens every table with joined prospect details, GPS and photo links", () => {
  const t = buildTables(sample, "https://x.test/api/export?key=K");
  assert.deepEqual(Object.keys(t), ["prospects", "visits", "followups", "jobs", "transactions", "users", "technicians"]);
  const p = t.prospects[0];
  assert.equal(p.gps_lat, "0.3136");
  assert.equal(p.gps_map_link, "https://maps.google.com/?q=0.3136,32.5811");
  assert.equal(p.gps_accuracy_m, "12");
  assert.equal(p.photo_link, "https://x.test/api/export?key=K&photo=ph1");
  assert.equal(p.follow_ups_count, "1");
  assert.equal(p.closed_sale, "no");
  assert.equal(p.first_payment_at, "2026-09-30", "only approved money-in counts, via the sale's job");
  assert.equal(p.commission_qualified, "no", "not closed, so not qualified");
  const closed = buildTables({ ...sample, prospects: [{ ...sample.prospects[0], closedSale: true }] }, "").prospects[0];
  assert.equal(closed.commission_qualified, "yes");
  assert.equal(p.new_field, "kept", "unmapped fields are appended in snake_case");
  assert.equal(t.visits[0].business, "Acacia Pharmacy");
  assert.equal(t.visits[0].phone, "+256 772 460 125");
  assert.equal(t.followups[0].note, 'Called, "busy"');
  assert.equal(t.jobs[0].materials_total, "100000");
  assert.equal(t.transactions[0].receipt_link, "https://x.test/api/export?key=K&photo=rc1");
  assert.equal(t.technicians[0].active, "no");
});

test("never leaks the export key or raw config", () => {
  const text = JSON.stringify(buildTables(sample, "https://x.test/api/export?key=K"));
  assert.ok(!text.includes("secret-not-exported"));
});

test("CSV quotes commas and quotes, unions columns, and neutralises formulas", () => {
  const csv = toCsv([{ a: "Comma, Ltd", b: 'say "hi"' }, { a: "=SUM(1)", c: "x" }]);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines[0], "a,b,c");
  assert.equal(lines[1], '"Comma, Ltd","say ""hi""",');
  assert.equal(lines[2], "'=SUM(1),,x");
  assert.equal(toCsv([]), "");
});

test("an empty table still exports its header row", () => {
  const t = buildTables({}, "https://x.test/api/export?key=K");
  for (const name of Object.keys(TABLE_COLUMNS)) {
    assert.deepEqual(t[name], []);
    assert.equal(toCsv(t[name], TABLE_COLUMNS[name]), TABLE_COLUMNS[name].join(",") + "\r\n", name);
  }
});

test("base columns match the flattened row keys, in order", () => {
  const t = buildTables(sample, "https://x.test/api/export?key=K");
  for (const name of Object.keys(TABLE_COLUMNS)) {
    if (!t[name].length) continue;
    const keys = Object.keys(t[name][0]).slice(0, TABLE_COLUMNS[name].length);
    assert.deepEqual(keys, TABLE_COLUMNS[name], name);
  }
});
