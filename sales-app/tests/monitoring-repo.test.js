import test from "node:test";
import assert from "node:assert/strict";
import { makeRepo } from "../monitoring/supabase/functions/_shared/repo.mjs";

test("a malformed id is simply not found and never reaches the database", async () => {
  const db = new Proxy({}, { get() { throw new Error("the database must not be touched"); } });
  const repo = makeRepo(db);
  assert.equal(await repo.getSiteDetail("not-a-uuid"), null);
  assert.equal(await repo.getSiteDetail(undefined), null);
  assert.equal(await repo.setIncidentState({ incidentId: "nope", action: "fix", by: "a", nowIso: "2026-10-12T10:00:00Z" }), null);
});

test("database errors keep their code and details so the logs can say what failed", async () => {
  const db = { from: () => ({ select: async () => ({ error: { message: "permission denied", code: "42501", details: "no grant" } }) }) };
  await assert.rejects(() => makeRepo(db).loadRules(), /permission denied \[42501\] no grant/);
});
