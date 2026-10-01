// Verisko Uganda Operations — staff sign-up and phone + PIN sign-in.
//
// POST /api/auth { action, … }
//   Public:
//     signup        { legalName, phone, nin, idFront, idBack?, pin, consent }
//                   -> creates a sign-up waiting for approval
//     login         { phone, pin } -> { token, user } once approved
//     resetWithCode { phone, code, pin } -> sets a new PIN with the 6-digit
//                   code from the Owner/Operations, then signs in
//   Owner / Operations only (signed in):
//     record        { id }               -> the sign-up's ID details + photos
//     approve       { id, role }         -> adds them to the team
//     reject        { id }               -> deletes the sign-up and its ID photos
//     resetPin      { userId }           -> one-time code to send the person
//     remove        { userId }           -> removes a PIN account from the team
// See pin-auth.mjs for how PINs, sessions and ID details are stored.
import { getStore } from "@netlify/blobs";
import {
  AUTH_STORE, STAFF_STORE, SESSION_MS, normalizePhone, displayPhone, phoneEmail, pinProblem, ninProblem, cleanNin,
  legalNameProblem, newPinRecord, pinMatches, recordFailure, isLocked, startReset, resetCodeMatches, signToken,
  getSecret, identify
} from "./pin-auth.mjs";

const SUPABASE_URL = "https://cepernltrzrmupgegcib.supabase.co";
const SUPABASE_KEY = "sb_publishable_hj2NsI1YGmpeQg815ET2Kg_CwznowqE";
const DATA_STORE = "verisko-sales";
const DATA_KEY = "app-data";
const MAX_PENDING = 40;
const MAX_IMAGE = 1500000;
const WRONG = "That phone number and PIN don't match.";

export default async (request) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const reply = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers });
  if (request.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String((body && body.action) || "");
    const auth = getStore(AUTH_STORE), staff = getStore(STAFF_STORE), dataStore = getStore(DATA_STORE);
    const now = Date.now();
    const loadData = async () => (await dataStore.get(DATA_KEY, { type: "json" })) || { users: [] };

    if (action === "signup") {
      const legalName = String(body.legalName || "").replace(/\s+/g, " ").trim();
      const phone = normalizePhone(body.phone);
      const nin = cleanNin(body.nin);
      const problem = legalNameProblem(legalName) || (!phone && "Enter a valid phone number, e.g. 0772 123 456.") || ninProblem(nin) || pinProblem(body.pin) ||
        (!/^data:image\/(jpeg|png|webp);base64,/.test(String(body.idFront || "")) && "Add a photo of the front of your National ID.") ||
        (body.idBack && !/^data:image\/(jpeg|png|webp);base64,/.test(String(body.idBack)) && "The back photo isn't an image.") ||
        (String(body.idFront || "").length + String(body.idBack || "").length > 2 * MAX_IMAGE && "The ID photos are too large — please retake them.") ||
        (body.consent !== true && "Please agree to Verisko keeping your ID details.");
      if (problem) return reply({ ok: false, error: problem }, 400);
      const data = await loadData();
      if ((data.users || []).some((u) => String(u.email || "").toLowerCase() === phoneEmail(phone))) return reply({ ok: false, error: "This phone number already has an account. Sign in with your PIN, or ask your manager to reset it." }, 409);
      const { blobs } = await staff.list({ prefix: "staff/" });
      let pending = 0;
      for (const b of blobs || []) { const r = await staff.get(b.key, { type: "json" }); if (r && r.status === "pending") pending++; }
      if (pending >= MAX_PENDING) return reply({ ok: false, error: "Too many sign-ups are waiting. Ask your manager to review them first." }, 429);
      const id = "s" + now.toString(36) + Math.random().toString(36).slice(2, 8);
      // One account per phone number (atomic).
      const claimed = await auth.set("phone/" + phone, id, { onlyIfNew: true });
      if (claimed && claimed.modified === false) {
        const owner = await auth.get("phone/" + phone, { type: "text" });
        const prev = owner ? await staff.get("staff/" + owner, { type: "json" }) : null;
        if (prev && prev.status === "pending") return reply({ ok: false, error: "This phone number has already signed up and is waiting for approval." }, 409);
        if ((prev && prev.status !== "removed") || (data.users || []).some((u) => u.id === owner)) return reply({ ok: false, error: "This phone number already has an account. Sign in with your PIN, or ask your manager to reset it." }, 409);
        await auth.set("phone/" + phone, id);                     // stale claim: rejected or removed earlier
      }
      await auth.setJSON("pin/" + id, newPinRecord(body.pin));
      await staff.setJSON("staff/" + id, {
        id, status: "pending", legalName, phone, nin, idFront: body.idFront, idBack: body.idBack || "",
        consentAt: new Date(now).toISOString(), signupAt: new Date(now).toISOString()
      });
      return reply({ ok: true, status: "pending" });
    }

    if (action === "login" || action === "resetWithCode") {
      const phone = normalizePhone(body.phone);
      const uid = phone ? await auth.get("phone/" + phone, { type: "text" }) : null;
      let rec = uid ? await auth.get("pin/" + uid, { type: "json" }) : null;
      if (!rec) return reply({ ok: false, error: action === "login" ? WRONG : "That code isn't right or has expired. Ask your manager for a new one." }, 401);
      if (isLocked(rec, now)) return reply({ ok: false, error: "Too many wrong tries. Wait 15 minutes, or ask your manager to reset your PIN." }, 429);
      if (action === "login") {
        if (rec.reset && !rec.hash) return reply({ ok: false, error: "Your PIN was reset. Tap “Forgot PIN?” and enter the code from your manager." }, 401);
        if (!pinMatches(body.pin, rec)) { await auth.setJSON("pin/" + uid, recordFailure(rec, now)); return reply({ ok: false, error: WRONG }, 401); }
      } else {
        if (!resetCodeMatches(String(body.code || ""), rec, now)) { await auth.setJSON("pin/" + uid, recordFailure(rec, now)); return reply({ ok: false, error: "That code isn't right or has expired. Ask your manager for a new one." }, 401); }
        const problem = pinProblem(body.pin);
        if (problem) return reply({ ok: false, error: problem }, 400);
        rec = { ...newPinRecord(body.pin, rec.v), v: rec.v };
      }
      rec = { ...rec, failed: 0, lockedUntil: 0 };
      await auth.setJSON("pin/" + uid, rec);
      const data = await loadData();
      const me = (data.users || []).find((u) => u.id === uid && u.authMethod === "pin");
      if (!me) {
        const s = await staff.get("staff/" + uid, { type: "json" });
        return reply({ ok: false, error: s && s.status === "pending" ? "pending" : "Your account isn't active. Ask your manager." }, 403);
      }
      const secret = await getSecret(auth);
      const exp = now + SESSION_MS;
      return reply({ ok: true, token: signToken(secret, { uid, v: rec.v, exp }), expiresAt: Math.floor(exp / 1000), user: me });
    }

    // ---- Owner / Operations actions ----
    const data = await loadData();
    const who = await identify(request, data, { authStore: auth, now, supabaseUser });
    if (who.error) return reply({ ok: false, error: who.error }, who.status);
    const canManage = who.me && (who.me.role === "admin" || who.me.role === "operations") && who.me.status !== "pending";
    if (!canManage) return reply({ ok: false, error: "forbidden" }, 403);
    const isOwner = who.me.role === "admin";

    if (action === "record") {
      const r = await staff.get("staff/" + String(body.id || ""), { type: "json" });
      if (!r) return reply({ ok: false, error: "not_found" }, 404);
      return reply({ ok: true, record: { id: r.id, status: r.status, legalName: r.legalName, phone: displayPhone(r.phone), nin: r.nin, idFront: r.idFront, idBack: r.idBack, signupAt: r.signupAt, consentAt: r.consentAt, approvedBy: r.approvedBy || "", approvedAt: r.approvedAt || "" } });
    }
    if (action === "approve") {
      const id = String(body.id || "");
      const r = await staff.get("staff/" + id, { type: "json" });
      if (!r || r.status !== "pending") return reply({ ok: false, error: "This sign-up was already handled." }, 409);
      const role = ["sales", "teamlead", "operations"].includes(body.role) ? body.role : "sales";
      if (role === "operations" && !isOwner) return reply({ ok: false, error: "Only the Owner can approve someone as Operations." }, 403);
      const fresh = await loadData();
      const users = Array.isArray(fresh.users) ? fresh.users : [];
      if (!users.some((u) => u.id === id)) {
        users.push({ id, name: r.legalName, email: phoneEmail(r.phone), phone: displayPhone(r.phone), role, authMethod: "pin", created: new Date(now).toISOString().slice(0, 10) });
      }
      await dataStore.setJSON(DATA_KEY, { ...fresh, users });
      await staff.setJSON("staff/" + id, { ...r, status: "active", role, approvedBy: who.me.name || "", approvedAt: new Date(now).toISOString() });
      return reply({ ok: true });
    }
    if (action === "reject") {
      const id = String(body.id || "");
      const r = await staff.get("staff/" + id, { type: "json" });
      if (!r || r.status !== "pending") return reply({ ok: false, error: "This sign-up was already handled." }, 409);
      // Don't keep the ID of someone who isn't joining.
      await staff.delete("staff/" + id);
      await auth.delete("pin/" + id);
      const owner = await auth.get("phone/" + r.phone, { type: "text" });
      if (owner === id) await auth.delete("phone/" + r.phone);
      return reply({ ok: true });
    }
    if (action === "resetPin") {
      const id = String(body.userId || "");
      const target = (data.users || []).find((u) => u.id === id && u.authMethod === "pin");
      if (!target) return reply({ ok: false, error: "not_found" }, 404);
      if (target.role === "operations" && !isOwner) return reply({ ok: false, error: "Only the Owner can reset an Operations PIN." }, 403);
      const rec = await auth.get("pin/" + id, { type: "json" });
      const { code, rec: next } = startReset(rec, now);
      await auth.setJSON("pin/" + id, next);
      return reply({ ok: true, code, expiresInHours: 48 });
    }
    if (action === "remove") {
      const id = String(body.userId || "");
      const fresh = await loadData();
      const target = (fresh.users || []).find((u) => u.id === id && u.authMethod === "pin");
      if (!target) return reply({ ok: false, error: "not_found" }, 404);
      if (target.role === "operations" && !isOwner) return reply({ ok: false, error: "Only the Owner can remove an Operations account." }, 403);
      await dataStore.setJSON(DATA_KEY, { ...fresh, users: fresh.users.filter((u) => u.id !== id) });
      const rec = await auth.get("pin/" + id, { type: "json" });
      if (rec) await auth.setJSON("pin/" + id, { ...rec, hash: "", v: (rec.v || 0) + 1, reset: null });  // signs them out everywhere
      const s = await staff.get("staff/" + id, { type: "json" });
      if (s) await staff.setJSON("staff/" + id, { ...s, status: "removed", removedAt: new Date(now).toISOString(), removedBy: who.me.name || "" });
      return reply({ ok: true });
    }
    return reply({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return reply({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
};

export async function supabaseUser(token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const a = await r.json().catch(() => ({}));
  return String(a.email || "").toLowerCase() || null;
}
