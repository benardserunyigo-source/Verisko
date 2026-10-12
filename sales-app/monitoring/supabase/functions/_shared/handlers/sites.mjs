// The two calls the Operations app makes (through its own Netlify function):
//   POST /sites-read       { action: "summary" } or { action: "detail", siteId }
//   POST /incident-update  { incidentId, action: "acknowledge" | "fix", by }
// Both accept only the app's API key.

import { authenticate } from "../auth.mjs";
import { json } from "../http.mjs";

async function readJson(request) {
  try { return await request.json(); } catch (err) { return null; }
}

export async function handleSitesRead(request, deps) {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  const auth = await authenticate(request, deps.repo, ["api"]);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return json(400, { error: "invalid JSON" });
  if (body.action === "summary") return json(200, { ok: true, ...(await deps.repo.listSummary()) });
  if (body.action === "detail") {
    if (typeof body.siteId !== "string" || !body.siteId) return json(400, { error: "siteId is required" });
    const detail = await deps.repo.getSiteDetail(body.siteId);
    return detail ? json(200, { ok: true, ...detail }) : json(404, { error: "no such site" });
  }
  return json(400, { error: "action must be summary or detail" });
}

export async function handleIncidentUpdate(request, deps) {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  const auth = await authenticate(request, deps.repo, ["api"]);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return json(400, { error: "invalid JSON" });
  if (body.action !== "acknowledge" && body.action !== "fix") return json(400, { error: "action must be acknowledge or fix" });
  if (typeof body.incidentId !== "string" || !body.incidentId) return json(400, { error: "incidentId is required" });
  const by = typeof body.by === "string" ? body.by.trim().slice(0, 200) : "";
  if (!by) return json(400, { error: "by is required" });
  const result = await deps.repo.setIncidentState({ incidentId: body.incidentId, action: body.action, by, nowIso: new Date(deps.now().getTime()).toISOString() });
  if (!result) return json(404, { error: "no such incident" });
  return json(200, { ok: true, changed: result.changed, state: result.state });
}
