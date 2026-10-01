import test from "node:test";
import assert from "node:assert/strict";
import { scopeForSales, mergeSalesWrite, scopeForTeamLead, mergeTeamLeadWrite, guardRepQual, keepFollowUps, keepNewerPlan } from "../netlify/functions/scope.mjs";

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
  assert.deepEqual(s.transactions.map((t) => t.id), ["t1", "t4"], "own clients' deposits incl. pending; no other client, no money out");
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
  assert.equal(scopeForSales({ ...data, config: { ...data.config, commissionPerQualified: 2500 } }, "ab@test").config.commissionPerQualified, 2500);
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

test("a Team lead sees every prospect and visit but no cash book, emails or export key", () => {
  const s = scopeForTeamLead(data, "lead@test");
  assert.equal(s.prospects.length, 3);
  assert.equal(s.appointments.length, 2);
  assert.deepEqual(s.transactions.map((t) => t.id).sort(), ["t1", "t2", "t4"], "client deposits only, no money out");
  assert.ok(!JSON.stringify(s).includes("secret"));
  assert.ok(!s.users.some((u) => u.email), "team list carries no emails (lead@test isn't on this roster)");
  assert.equal(s.jobs[0].materials, undefined);
});

test("reps can ask for qualification but never approve or send back", () => {
  assert.equal(guardRepQual({ qualStatus: "pending", qualRequestedAt: "T" }, {}).qualStatus, "pending");
  assert.equal(guardRepQual({ qualStatus: "approved", qualApprovedBy: "Me" }, { qualStatus: "pending" }).qualStatus, "pending");
  assert.equal(guardRepQual({ qualStatus: "approved", qualApprovedBy: "Me" }, { qualStatus: "pending" }).qualApprovedBy, "");
  assert.equal(guardRepQual({ qualStatus: "", }, { qualStatus: "approved", qualApprovedBy: "Lead" }).qualStatus, "approved", "can't undo an approval");
  assert.equal(guardRepQual({ qualStatus: "pending" }, { qualStatus: "query", qualNote: "why" }).qualNote, "why", "lead's note kept");
});

test("a Team lead's save: decides qualifications on others, adds deposits, changes nothing else", () => {
  const stored = { ...data, prospects: data.prospects.map((p) => (p.id === "b1" ? { ...p, qualStatus: "pending" } : p)) };
  const view = scopeForTeamLead(stored, "lead@test");
  const incoming = {
    ...view,
    prospects: view.prospects.map((p) => (p.id === "b1" ? { ...p, qualStatus: "approved", qualApprovedBy: "Lead", qualApprovedAt: "2026-09-30T08:00:00Z", business: "RENAMED" } : p)),
    transactions: view.transactions.concat([
      { id: "new1", direction: "in", amount: 250000, prospectId: "a1", status: "approved", createdByEmail: "x@y" },
      { id: "new2", direction: "out", amount: 9, prospectId: "a1" },
      { id: "t2", direction: "in", amount: 1, status: "approved", installId: "j2" }
    ])
  };
  const m = mergeTeamLeadWrite(stored, incoming, "lead@test");
  const b1 = m.prospects.find((p) => p.id === "b1");
  assert.equal(b1.qualStatus, "approved");
  assert.equal(b1.business, "Bea's Clinic", "can't edit anything else on another rep's prospect");
  const added = m.transactions.filter((t) => !data.transactions.some((d) => d.id === t.id));
  assert.deepEqual(added.map((t) => t.id), ["new1"], "only new money-in for a known client");
  assert.equal(added[0].status, "pending", "always pending");
  assert.equal(added[0].createdByEmail, "lead@test");
  assert.equal(m.transactions.find((t) => t.id === "t2").amount, 300000, "existing entries unchanged");
  assert.equal(m.transactions.length, data.transactions.length + 1);
});

test("a Team lead disqualifies another rep's lead with a reason: it moves to Lost; re-open puts it back", () => {
  const view = scopeForTeamLead(data, "lead@test");
  const dq = { qualStatus: "disqualified", qualReason: "No answer after several calls", qualNote: "5 calls", qualApprovedBy: "Lead", qualDecidedAt: "2026-09-30T09:00:00Z", qualSeen: false, stage: "Lost", business: "RENAMED" };
  const m = mergeTeamLeadWrite(data, { ...view, prospects: view.prospects.map((p) => (p.id === "b1" ? { ...p, ...dq } : p)) }, "lead@test");
  const b1 = m.prospects.find((p) => p.id === "b1");
  assert.equal(b1.qualStatus, "disqualified");
  assert.equal(b1.qualReason, "No answer after several calls");
  assert.equal(b1.stage, "Lost");
  assert.equal(b1.business, "Bea's Clinic");
  const stored2 = { ...data, prospects: m.prospects };
  const m2 = mergeTeamLeadWrite(stored2, { prospects: m.prospects.map((p) => (p.id === "b1" ? { ...p, qualStatus: "", qualReason: "", stage: "Contact attempted" } : p)) }, "lead@test");
  assert.equal(m2.prospects.find((p) => p.id === "b1").stage, "Contact attempted");
  // A stage change without a qualification decision is ignored.
  const m3 = mergeTeamLeadWrite(data, { prospects: data.prospects.map((p) => (p.id === "b1" ? { ...p, stage: "Lost" } : p)) }, "lead@test");
  assert.equal(m3.prospects.find((p) => p.id === "b1").stage, undefined);
});

test("a rep can't undo a disqualification, only mark the reason as read", () => {
  const prev = { qualStatus: "disqualified", qualReason: "Not interested in cameras", stage: "Lost", qualSeen: false };
  const g = guardRepQual({ qualStatus: "pending", qualReason: "", stage: "Qualified", qualSeen: true }, prev);
  assert.equal(g.qualStatus, "disqualified");
  assert.equal(g.qualReason, "Not interested in cameras");
  assert.equal(g.stage, "Lost");
  assert.equal(g.qualSeen, true);
});

test("a Team lead logs call notes and plans the next follow-up on another rep's prospect", () => {
  const stored = { ...data, prospects: data.prospects.map((p) => (p.id === "b1" ? { ...p, followUp: "2026-10-01", followUps: [{ at: "T1", byEmail: "bea@test", note: "Called" }] } : p)) };
  const view = scopeForTeamLead(stored, "lead@test");
  const inc = view.prospects.map((p) => (p.id !== "b1" ? p : {
    ...p, followUp: "2026-10-03", nextAction: "Call back", followUpPlannedAt: "2026-09-30T10:00:00Z", followUpPlannedBy: "Lead",
    followUps: p.followUps.concat([{ at: "T2", byEmail: "lead@test", note: "No answer" }, { at: "T3", byEmail: "bea@test", note: "forged" }])
  }));
  const b1 = mergeTeamLeadWrite(stored, { prospects: inc }, "lead@test").prospects.find((p) => p.id === "b1");
  assert.equal(b1.followUp, "2026-10-03");
  assert.equal(b1.nextAction, "Call back");
  assert.equal(b1.followUpPlannedByEmail, "lead@test");
  assert.deepEqual(b1.followUps.map((f) => f.at), ["T1", "T2"], "only their own new notes");
});

test("call notes are append-only and the newer follow-up plan wins", () => {
  const stored = [{ id: "p", followUps: [{ at: "T1", byEmail: "a", note: "x" }, { at: "T2", byEmail: "lead", note: "y" }], followUp: "2026-10-05", nextAction: "Lead's plan", followUpPlannedAt: "2026-09-30T10:00:00Z" }];
  const stale = [{ id: "p", followUps: [{ at: "T1", byEmail: "a", note: "x" }, { at: "T3", byEmail: "a", note: "z" }], followUp: "2026-10-01", nextAction: "Old", followUpPlannedAt: "2026-09-29T10:00:00Z" }];
  const out = keepNewerPlan(stored, keepFollowUps(stored, stale))[0];
  assert.deepEqual(out.followUps.map((f) => f.at), ["T1", "T2", "T3"]);
  assert.equal(out.followUp, "2026-10-05");
  assert.equal(out.nextAction, "Lead's plan");
  const newer = keepNewerPlan(stored, [{ id: "p", followUp: "2026-10-09", followUpPlannedAt: "2026-09-30T11:00:00Z" }])[0];
  assert.equal(newer.followUp, "2026-10-09");
});
