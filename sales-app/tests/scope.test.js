import test from "node:test";
import assert from "node:assert/strict";
import { scopeForSales, mergeSalesWrite } from "../netlify/functions/scope.mjs";

const data = {
  prospects: [
    { id: "a1", business: "Ab's Pharmacy", createdByEmail: "ab@test", reviewStatus: "approved" },
    { id: "a2", business: "Ab's Shop", createdByEmail: "AB@test", reviewStatus: "pending" },
    { id: "b1", business: "Bea's Clinic", createdByEmail: "bea@test", reviewStatus: "approved" }
  ],
  appointments: [{ id: "v1", prospectId: "a1" }, { id: "v2", prospectId: "b1" }],
  jobs: [
    { id: "j1", ref: "J-1", prospectId: "a1", stage: "Accepted", materials: [{ name: "Cable" }], finalPrice: 9 },
    { id: "j2", ref: "J-2", prospectId: "b1", stage: "Accepted" }
  ],
  transactions: [
    { id: "t1", direction: "in", status: "approved", amount: 500000, date: "2026-09-29", installId: "j1", note: "MoMo ref", proofId: "rc" },
    { id: "t2", direction: "in", status: "approved", amount: 300000, date: "2026-09-29", installId: "j2" },
    { id: "t3", direction: "out", status: "approved", amount: 20000, prospectId: "a1" },
    { id: "t4", direction: "in", status: "pending", amount: 1, installId: "j1" }
  ],
  users: [
    { id: "u0", name: "Ben", email: "ben@test", role: "admin" },
    { id: "u1", name: "Ab", email: "ab@test", role: "sales" },
    { id: "u2", name: "Bea", email: "bea@test", role: "sales" },
    { id: "u3", name: "Abraham", email: "abraham@test", role: "operations" }
  ],
  technicians: [{ id: "tech" }],
  config: { commissionPerSale: 100000, commissionTarget: 1600000, commissionRule: 2, exportKey: "secret", pettyLimit: 20000 }
};

test("a salesperson only receives their own prospects and visits", () => {
  const s = scopeForSales(data, "ab@test");
  assert.deepEqual(s.prospects.map((p) => p.id), ["a1", "a2"], "email match is case-insensitive");
  assert.deepEqual(s.appointments.map((a) => a.id), ["v1"]);
  assert.ok(!JSON.stringify(s).includes("Bea's Clinic"));
});

test("jobs and payments are only their clients', stripped to what the dashboard needs", () => {
  const s = scopeForSales(data, "ab@test");
  assert.deepEqual(s.jobs, [{ id: "j1", ref: "J-1", prospectId: "a1", stage: "Accepted", createdAt: undefined }]);
  assert.deepEqual(s.transactions.map((t) => t.id), ["t1"], "no other client, no money out, no pending");
  assert.equal(s.transactions[0].note, undefined);
  assert.equal(s.transactions[0].proofId, undefined);
});

test("team list: themselves in full, Operations/admin by name only, no other reps", () => {
  const s = scopeForSales(data, "ab@test");
  assert.deepEqual(s.users.map((u) => u.name), ["Ben", "Ab", "Abraham"]);
  assert.equal(s.users.find((u) => u.name === "Ab").email, "ab@test");
  assert.equal(s.users.find((u) => u.name === "Ben").email, undefined);
  assert.ok(!JSON.stringify(s).includes("bea@test"));
});

test("config carries only commission settings; no technicians", () => {
  const s = scopeForSales(data, "ab@test");
  assert.deepEqual(s.config, { commissionPerSale: 100000, commissionTarget: 1600000, commissionRule: 2 });
  assert.deepEqual(s.technicians, []);
});

test("a salesperson's save keeps everyone else's records untouched", () => {
  const scoped = scopeForSales(data, "ab@test");
  const incoming = { ...scoped, prospects: scoped.prospects.map((p) => (p.id === "a2" ? { ...p, notes: "edited" } : p)) };
  const m = mergeSalesWrite(data, incoming, "ab@test");
  assert.deepEqual(m.prospects.map((p) => p.id).sort(), ["a1", "a2", "b1"]);
  assert.equal(m.prospects.find((p) => p.id === "a2").notes, "edited");
  assert.deepEqual(m.appointments.map((a) => a.id).sort(), ["v1", "v2"]);
});

test("records from another rep sent by an old cached phone are ignored", () => {
  const incoming = { prospects: [...data.prospects.map((p) => (p.id === "b1" ? { ...p, business: "HIJACK" } : p))], appointments: [{ id: "v2", prospectId: "a1" }, ...data.appointments.filter((a) => a.id === "v1")] };
  const m = mergeSalesWrite(data, incoming, "ab@test");
  assert.equal(m.prospects.find((p) => p.id === "b1").business, "Bea's Clinic");
  assert.equal(m.appointments.find((a) => a.id === "v2").prospectId, "b1", "can't move another rep's visit onto their prospect");
});

test("a new prospect is stamped as the sender's; deleting their own is allowed", () => {
  const incoming = { prospects: [data.prospects[0], { id: "n1", business: "New", createdByEmail: "bea@test" }], appointments: [{ id: "v1", prospectId: "a1" }, { id: "v9", prospectId: "n1" }] };
  const m = mergeSalesWrite(data, incoming, "ab@test");
  assert.equal(m.prospects.find((p) => p.id === "n1").createdByEmail, "ab@test");
  assert.ok(!m.prospects.find((p) => p.id === "a2"), "a2 removed by its owner (approval guard runs separately)");
  assert.ok(m.appointments.find((a) => a.id === "v9"));
  assert.ok(m.prospects.find((p) => p.id === "b1"));
});
