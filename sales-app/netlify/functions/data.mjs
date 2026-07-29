// Verisko Sales Visit Planner — shared data API backed by Netlify Blobs,
// gated by Supabase email auth.
//
// Every request must carry a valid Supabase access token (Authorization:
// Bearer <token>). The token is verified with Supabase; the verified email
// must be on the team allow-list (the `users` list). The very first sign-in on
// an empty workspace bootstraps the owner. Non-admins cannot alter the team
// list. Both Supabase values below are public (publishable) and safe to ship.
import { getStore } from "@netlify/blobs";

const SUPABASE_URL = "https://cepernltrzrmupgegcib.supabase.co";
const SUPABASE_KEY = "sb_publishable_hj2NsI1YGmpeQg815ET2Kg_CwznowqE";

const STORE = "verisko-sales";
const KEY = "app-data";
const EMPTY = { prospects: [], appointments: [], users: [], transactions: [], config: {} };

export default async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  try {
    // 1) Verify the caller's Supabase session.
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json({ ok: false, error: "not_signed_in" }, 401, headers);

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
    });
    if (!userRes.ok) return json({ ok: false, error: "session_expired" }, 401, headers);
    const account = await userRes.json();
    const email = String(account.email || "").toLowerCase();
    if (!email) return json({ ok: false, error: "no_email" }, 401, headers);

    // 2) Load data and check the allow-list.
    const store = getStore(STORE);
    const data = (await store.get(KEY, { type: "json" })) || EMPTY;
    const users = Array.isArray(data.users) ? data.users : [];
    const bootstrap = users.length === 0;                              // brand-new workspace
    const me = users.find((u) => String(u.email || "").toLowerCase() === email);
    if (!me && !bootstrap) return json({ ok: false, error: "not_authorized" }, 403, headers);

    if (request.method === "GET") {
      return json({ ok: true, data: { ...EMPTY, ...data } }, 200, headers);
    }

    if (request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      if (!payload || !payload.data) throw new Error("Missing application data.");
      const incoming = payload.data;
      const storedTx = Array.isArray(data.transactions) ? data.transactions : [];
      const storedConfig = data.config && typeof data.config === "object" && !Array.isArray(data.config) ? data.config : {};
      const clean = {
        prospects: Array.isArray(incoming.prospects) ? incoming.prospects : [],
        appointments: Array.isArray(incoming.appointments) ? incoming.appointments : [],
        users: Array.isArray(incoming.users) ? incoming.users : [],
        transactions: Array.isArray(incoming.transactions) ? incoming.transactions : [],
        config: incoming.config && typeof incoming.config === "object" && !Array.isArray(incoming.config) ? incoming.config : {}
      };
      const isAdmin = bootstrap || (me && me.role === "admin");
      const canCash = isAdmin || (me && me.role === "operations");

      // Only an admin (or the bootstrapping owner) may change the team list.
      if (!isAdmin && JSON.stringify(clean.users) !== JSON.stringify(users)) {
        clean.users = users; // ignore team-list tampering from non-admins
      }
      // Workspace config (e.g. petty-cash limit) is admin-only too.
      if (!isAdmin && JSON.stringify(clean.config) !== JSON.stringify(storedConfig)) {
        clean.config = storedConfig;
      }

      // Cash flow: Sales cannot touch transactions; only admins may approve.
      if (JSON.stringify(clean.transactions) !== JSON.stringify(storedTx)) {
        if (!canCash) {
          clean.transactions = storedTx; // Sales roles cannot write cash entries at all
        } else if (!isAdmin) {
          const prevById = Object.fromEntries(storedTx.map((t) => [t.id, t]));
          clean.transactions = clean.transactions.map((t) => {
            const prev = prevById[t.id];
            // Operations cannot approve — revert any new/changed approval to its prior state (pending).
            if (t && t.status === "approved" && (!prev || prev.status !== "approved")) {
              return prev || { ...t, status: "pending", reviewedBy: "", reviewedAt: "", reviewNote: "" };
            }
            return t;
          });
        }
      }

      await store.setJSON(KEY, clean);
      return json({ ok: true }, 200, headers);
    }

    return json({ ok: false, error: "method_not_allowed" }, 405, headers);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error.message || "Storage error." }, 500, headers);
  }
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}
