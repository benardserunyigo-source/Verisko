// Verisko Sales Visit Planner — receipt/proof photo storage (Netlify Blobs).
//
// POST { image: <data URL> }  -> stores the (already phone-resized) image and
//                                returns { id }. Any signed-in team member:
//                                Sales attach business photos to prospects,
//                                Operations/admins attach receipts to cash entries.
// GET  ?id=<id>               -> returns { image: <data URL> } for any team member.
//
// Auth: same Supabase-token + allow-list check as /api/data. Images live in a
// separate Blobs store so the main data JSON stays small.
import { getStore } from "@netlify/blobs";
import { AUTH_STORE, identify } from "./pin-auth.mjs";
import { supabaseUser } from "./auth.mjs";

const DATA_STORE = "verisko-sales";
const DATA_KEY = "app-data";
const RECEIPTS = "verisko-receipts";

export default async (request) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const auth = await verify(request);
    if (!auth) return json({ ok: false, error: "not_authorized" }, 401, headers);
    const store = getStore(RECEIPTS);

    if (request.method === "POST") {
      // No role gate here: the photo only becomes visible once it is attached
      // to a record the caller is allowed to write (enforced in data.mjs).
      const body = await request.json().catch(() => ({}));
      const image = body && typeof body.image === "string" ? body.image : "";
      if (!image.startsWith("data:image/")) throw new Error("Invalid image.");
      if (image.length > 3000000) throw new Error("Image too large — please retake it.");
      const id = crypto.randomUUID();
      await store.set(id, image);
      return json({ ok: true, id }, 200, headers);
    }

    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("id") || "";
      if (!id) throw new Error("Missing id.");
      const image = await store.get(id, { type: "text" });
      if (!image) return json({ ok: false, error: "not_found" }, 404, headers);
      return json({ ok: true, image }, 200, headers);
    }

    return json({ ok: false, error: "method_not_allowed" }, 405, headers);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e.message || "Receipt error." }, 500, headers);
  }
};

// Verify the session (email or staff PIN) and that the caller is on the team.
async function verify(request) {
  const data = (await getStore(DATA_STORE).get(DATA_KEY, { type: "json" })) || { users: [] };
  const users = Array.isArray(data.users) ? data.users : [];
  const who = await identify(request, data, { authStore: getStore(AUTH_STORE), now: Date.now(), supabaseUser });
  if (who.error) return null;
  if (!who.me && users.length > 0) return null;   // on the team? (empty workspace = bootstrap owner)
  const me = who.me;
  const canCash = users.length === 0 || (me && (me.role === "admin" || me.role === "operations"));
  return { email: who.email, me, canCash };
}

function json(b, s, h) { return new Response(JSON.stringify(b), { status: s, headers: h }); }
