// Verisko Sales Visit Planner — receipt/proof photo storage (Netlify Blobs).
//
// POST { image: <data URL> }  -> stores the (already phone-resized) image and
//                                returns { id }. Operations/admins only.
// GET  ?id=<id>               -> returns { image: <data URL> } for any team member.
//
// Auth: same Supabase-token + allow-list check as /api/data. Images live in a
// separate Blobs store so the main data JSON stays small.
import { getStore } from "@netlify/blobs";

const SUPABASE_URL = "https://cepernltrzrmupgegcib.supabase.co";
const SUPABASE_KEY = "sb_publishable_hj2NsI1YGmpeQg815ET2Kg_CwznowqE";
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
      if (!auth.canCash) return json({ ok: false, error: "forbidden" }, 403, headers);
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

// Verify the Supabase session and that the email is on the team allow-list.
async function verify(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const acc = await r.json();
  const email = String(acc.email || "").toLowerCase();
  if (!email) return null;
  const data = (await getStore(DATA_STORE).get(DATA_KEY, { type: "json" })) || { users: [] };
  const users = Array.isArray(data.users) ? data.users : [];
  const me = users.find((u) => String(u.email || "").toLowerCase() === email);
  if (!me && users.length > 0) return null; // on the team? (empty workspace = bootstrap owner)
  const canCash = users.length === 0 || (me && (me.role === "admin" || me.role === "operations"));
  return { email, me, canCash };
}

function json(b, s, h) { return new Response(JSON.stringify(b), { status: s, headers: h }); }
