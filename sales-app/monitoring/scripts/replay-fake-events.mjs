#!/usr/bin/env node
// Smoke test against a deployed ingest function, using made-up history so it finishes in seconds.
//
//   INGEST_URL=https://<ref>.supabase.co/functions/v1/ingest BOX_KEY=... EMAIL_KEY=... \
//   SITE_CODE=VS-0001 node monitoring/scripts/replay-fake-events.mjs

import { fileURLToPath } from "node:url";

// Twelve minutes of box history, replayed: all ok, then Camera 7 down for seven minutes.
export function buildBoxScenario(nowMs) {
  const at = (minutesAgo) => new Date(nowMs - minutesAgo * 60000).toISOString();
  const report = (minutesAgo, cameraOk) => ({
    type: "box", replay: true, observed_at: at(minutesAgo),
    checks: [{ kind: "camera", label: "Camera 7", ok: cameraOk }, { kind: "recorder", label: "Recorder", ok: true }],
  });
  const bodies = [report(12, true)];
  for (let m = 11; m >= 4; m--) bodies.push(report(m, false)); // down from 11 minutes ago
  bodies.push(report(1, true));                                  // back one minute ago
  return bodies;
}

export function buildEmailScenario(nowMs, siteCode) {
  return [{ type: "email", message_id: `smoke-${nowMs}`, observed_at: new Date(nowMs).toISOString(), class: "fault",
    fault_kind: "disk_full", site_code: siteCode, subject: "SMOKE TEST disk full", excerpt: "smoke test" }];
}

async function post(url, key, body) {
  const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.text() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { INGEST_URL, BOX_KEY, EMAIL_KEY, SITE_CODE } = process.env;
  if (!INGEST_URL || !BOX_KEY || !EMAIL_KEY || !SITE_CODE) { console.error("set INGEST_URL, BOX_KEY, EMAIL_KEY and SITE_CODE"); process.exit(1); }
  const now = Date.now();
  for (const b of buildBoxScenario(now)) console.log("box  ", b.observed_at, b.checks[0].ok ? "ok  " : "down", JSON.stringify(await post(INGEST_URL, BOX_KEY, b)));
  for (const b of buildEmailScenario(now, SITE_CODE)) console.log("email", JSON.stringify(await post(INGEST_URL, EMAIL_KEY, b)));
}
