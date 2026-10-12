import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join, normalize } from "node:path";
import { buildPayload, FUNCTION_NAMES } from "../monitoring/scripts/make-deploy-payload.mjs";
import { describeKey } from "../monitoring/scripts/make-key.mjs";
import { buildBoxScenario, buildEmailScenario } from "../monitoring/scripts/replay-fake-events.mjs";
import { DEFAULT_RULES } from "../monitoring/supabase/functions/_shared/rules.mjs";
import { hashKey } from "../monitoring/supabase/functions/_shared/keys.mjs";
import { makeHarness, T0 } from "./helpers/harness.mjs";

// ---------- deploy payloads ----------
test("each function payload has its entry point, shared code, and no ../_shared imports", () => {
  for (const name of FUNCTION_NAMES) {
    const p = buildPayload(name);
    assert.equal(p.entrypoint_path, "index.ts");
    assert.equal(p.verify_jwt, false);
    assert.equal(p.files[0].name, "index.ts");
    assert.ok(!p.files[0].content.includes("../_shared/"));
    assert.ok(p.files[0].content.includes("./_shared/"));
    assert.ok(p.files.some((f) => f.name === "_shared/incident-engine.mjs"));
    assert.ok(!p.files.some((f) => f.name.includes("test")), "no test files are deployed");
  }
});

test("every relative import in every payload points at a file inside that payload", () => {
  for (const name of FUNCTION_NAMES) {
    const p = buildPayload(name);
    const names = new Set(p.files.map((f) => f.name));
    for (const f of p.files) {
      for (const [, spec] of f.content.matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
        const target = normalize(join(dirname(f.name), spec)).split("\\").join("/");
        assert.ok(names.has(target), `${name}: ${f.name} imports ${spec}, which is not in the payload`);
      }
    }
  }
});

test("an unknown function name is refused", () => assert.throws(() => buildPayload("nope")));

// ---------- keys ----------
const UUID = "123e4567-e89b-12d3-a456-426614174000";
test("describeKey prints SQL with the hash and never the raw key", async () => {
  const raw = "vsk_box_secretvalue";
  const q = await describeKey("box", UUID, raw);
  assert.ok(q.includes(await hashKey(raw)));
  assert.ok(!q.includes("secretvalue"));
  assert.ok(q.includes(`'${UUID}'`));
  assert.match(await describeKey("api", null, raw), /values \('api', null, '[0-9a-f]{64}'/);
});
test("describeKey refuses bad combinations and injection", async () => {
  await assert.rejects(() => describeKey("box", null, "k"));
  await assert.rejects(() => describeKey("box", "x'); drop table sites;--", "k"));
  await assert.rejects(() => describeKey("api", UUID, "k"));
  await assert.rejects(() => describeKey("root", null, "k"));
});

// ---------- replay scenario ----------
test("the box replay scenario is ordered, in the past, and long enough to open an incident", () => {
  const now = Date.parse("2026-10-12T10:00:00Z");
  const bodies = buildBoxScenario(now);
  const times = bodies.map((b) => Date.parse(b.observed_at));
  assert.deepEqual([...times].sort((a, b) => a - b), times);
  assert.ok(times.every((t) => t <= now));
  assert.ok(bodies.every((b) => b.replay === true));
  assert.equal(bodies[0].checks[0].ok, true);
  const firstDown = bodies.findIndex((b) => !b.checks[0].ok);
  const lastDown = bodies.map((b) => b.checks[0].ok).lastIndexOf(false);
  assert.ok((times[lastDown] - times[firstDown]) / 60000 >= DEFAULT_RULES.camera_offline.waitMinutes);
  assert.equal(bodies[bodies.length - 1].checks[0].ok, true);
});
test("the email replay scenario targets the given site code", () => {
  const [mail] = buildEmailScenario(Date.parse("2026-10-12T10:00:00Z"), "VS-0042");
  assert.equal(mail.site_code, "VS-0042");
  assert.equal(mail.fault_kind, "disk_full");
});

// ---------- the replay scenario, end to end through the real handlers ----------

test("replaying the smoke-test scenario opens one incident, texts once, then fixes and texts again", async () => {
  const h = await makeHarness();
  for (const body of buildBoxScenario(T0)) assert.equal((await h.ingest(h.keys.box, body)).status, 200);
  assert.equal(h.incidents().length, 1);
  assert.equal(h.incidents()[0].kind, "camera_offline");
  assert.equal(h.incidents()[0].state, "fixed");
  assert.equal(h.incidents()[0].fixedReason, "recovered");
  assert.equal(h.sent.length, 2);
  assert.match(h.sent[0].text, /Camera 7 offline/);
  assert.match(h.sent[1].text, /^FIXED\./);
  for (const body of buildEmailScenario(T0, h.site.code)) assert.equal((await h.ingest(h.keys.email, body)).status, 200);
  assert.equal(h.incidents().length, 2);
  assert.equal(h.incidents()[1].kind, "disk_full");
  assert.equal(h.incidents()[1].state, "open");
});
