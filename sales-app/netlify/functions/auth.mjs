// Verisko Uganda Operations — invite-only staff sign-up and phone + PIN sign-in.
//
// POST /api/auth { action, … }
//   Public:
//     inviteInfo    { code }                     -> who invited them, as what role
//     signup        { invite, legalName, phone, pin, selfie, consent }
//                   -> joins the team at once (role from the invite) and signs
//                      in; the National ID is due within 5 days
//     login         { phone, pin }               -> { token, user }
//     resetWithCode { phone, code, pin }         -> new PIN with the 6-digit code
//   Signed-in staff (PIN):
//     submitId      { nin, idFront, idBack? }    -> National ID for the check
//   Team lead / Operations / Owner:
//     invite        { phone, name?, role }       -> single-use code, 7 days,
//                   only for that phone (Team lead: Sales only; Owner only
//                   for Operations)
//   Operations / Owner:
//     record        { id }                       -> ID details, selfie, photos
//     checkId       { userId, ok, reason? }      -> "looks right" or "redo"
//     resetPin      { userId }                   -> one-time code to send
//     remove        { userId }                   -> removes a PIN account
//     approve/reject { id }                      -> older sign-ups (before invites)
// See pin-auth.mjs for how PINs, sessions and ID details are stored.
import { getStore } from "@netlify/blobs";
import {
  AUTH_STORE, STAFF_STORE, SESSION_MS, INVITE_MS, ID_DUE_MS, ID_REDO_MS, normalizePhone, displayPhone, phoneEmail,
  pinProblem, ninProblem, cleanNin, legalNameProblem, newPinRecord, pinMatches, recordFailure, isLocked, startReset,
  resetCodeMatches, signToken, getSecret, identify, newInviteCode, cleanInviteCode, canInviteRole, inviteProblem
} from "./pin-auth.mjs";

const SUPABASE_URL = "https://cepernltrzrmupgegcib.supabase.co";
const SUPABASE_KEY = "sb_publishable_hj2NsI1YGmpeQg815ET2Kg_CwznowqE";
const DATA_STORE = "verisko-sales";
const DATA_KEY = "app-data";
const MAX_IMAGE = 1500000;
const WRONG = "That phone number and PIN don't match.";
const ROLE_LABEL = { sales: "Sales", teamlead: "Team lead", operations: "Operations" };
const isImage = (v) => /^data:image\/(jpeg|png|webp);base64,/.test(String(v || ""));

export default async (request) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const reply = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers });
  if (request.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String((body && body.action) || "");
    const auth = getStore(AUTH_STORE), staff = getStore(STAFF_STORE), dataStore = getStore(DATA_STORE);
    const now = Date.now(), nowIso = new Date(now).toISOString();
    const loadData = async () => (await dataStore.get(DATA_KEY, { type: "json" })) || { users: [] };
    const setUser = async (id, patch) => {
      const fresh = await loadData();
      const users = (fresh.users || []).map((u) => (u.id === id ? { ...u, ...patch } : u));
      await dataStore.setJSON(DATA_KEY, { ...fresh, users });
      return users.find((u) => u.id === id);
    };
    const session = async (uid, v, user) => {
      const secret = await getSecret(auth);
      const exp = now + SESSION_MS;
      return { ok: true, token: signToken(secret, { uid, v, exp }), expiresAt: Math.floor(exp / 1000), user };
    };

    if (action === "inviteInfo") {
      const inv = await auth.get("invite/" + cleanInviteCode(body.code), { type: "json" });
      const problem = inviteProblem(inv, now);
      if (problem) return reply({ ok: false, error: problem }, 404);
      return reply({ ok: true, name: inv.name || "", role: inv.role, roleLabel: ROLE_LABEL[inv.role] || "Sales", invitedBy: inv.invitedBy || "", phoneEnd: inv.phone.slice(-3) });
    }

    if (action === "signup") {
      const code = cleanInviteCode(body.invite);
      const inv = code ? await auth.get("invite/" + code, { type: "json" }) : null;
      const legalName = String(body.legalName || "").replace(/\s+/g, " ").trim();
      const phone = normalizePhone(body.phone);
      const problem = (!code && "You need an invite to join. Ask your manager to send you one.") ||
        legalNameProblem(legalName) || (!phone && "Enter a valid phone number, e.g. 0772 123 456.") ||
        inviteProblem(inv, now, phone) || pinProblem(body.pin) ||
        (!isImage(body.selfie) && "Take a selfie so we know it's you.") ||
        (String(body.selfie).length > MAX_IMAGE && "The selfie is too large — please take it again.") ||
        (body.consent !== true && "Please agree to Verisko keeping your details.");
      if (problem) return reply({ ok: false, error: problem }, 400);
      const data = await loadData();
      if ((data.users || []).some((u) => String(u.email || "").toLowerCase() === phoneEmail(phone))) return reply({ ok: false, error: "This phone number already has an account. Sign in with your PIN." }, 409);
      // The invite works once (claim it atomically).
      const used = await auth.set("used/" + code, "1", { onlyIfNew: true });
      if (used && used.modified === false) return reply({ ok: false, error: "This invite was already used. Sign in with your phone number and PIN." }, 409);
      const id = "s" + now.toString(36) + Math.random().toString(36).slice(2, 8);
      const claimed = await auth.set("phone/" + phone, id, { onlyIfNew: true });
      if (claimed && claimed.modified === false) {
        const owner = await auth.get("phone/" + phone, { type: "text" });
        const prev = owner ? await staff.get("staff/" + owner, { type: "json" }) : null;
        if ((prev && prev.status !== "removed") || (data.users || []).some((u) => u.id === owner)) {
          await auth.delete("used/" + code);
          return reply({ ok: false, error: "This phone number already has an account. Sign in with your PIN." }, 409);
        }
        await auth.set("phone/" + phone, id);
      }
      const idDueAt = new Date(now + ID_DUE_MS).toISOString();
      const rec = newPinRecord(body.pin);
      await auth.setJSON("pin/" + id, rec);
      await staff.setJSON("staff/" + id, {
        id, status: "active", legalName, phone, selfie: body.selfie, idStatus: "needed", idDueAt, role: inv.role,
        invitedBy: inv.invitedBy || "", inviteCode: code, consentAt: nowIso, signupAt: nowIso
      });
      await auth.setJSON("invite/" + code, { ...inv, usedAt: nowIso, usedBy: id });
      const user = { id, name: legalName, email: phoneEmail(phone), phone: displayPhone(phone), role: inv.role, authMethod: "pin", idStatus: "needed", idDueAt, invitedBy: inv.invitedBy || "", created: nowIso.slice(0, 10) };
      const fresh = await loadData();
      await dataStore.setJSON(DATA_KEY, { ...fresh, users: (fresh.users || []).concat([user]) });
      return reply(await session(id, rec.v, user));
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
      return reply(await session(uid, rec.v, me));
    }

    // ---- Signed-in actions ----
    const data = await loadData();
    const who = await identify(request, data, { authStore: auth, now, supabaseUser });
    if (who.error) return reply({ ok: false, error: who.error }, who.status);
    const me = who.me;
    if (!me) return reply({ ok: false, error: "forbidden" }, 403);

    if (action === "submitId") {
      if (me.authMethod !== "pin") return reply({ ok: false, error: "forbidden" }, 403);
      const nin = cleanNin(body.nin);
      const problem = ninProblem(nin) || (!isImage(body.idFront) && "Add a photo of the front of your National ID.") ||
        (body.idBack && !isImage(body.idBack) && "The back photo isn't an image.") ||
        (String(body.idFront || "").length + String(body.idBack || "").length > 2 * MAX_IMAGE && "The ID photos are too large — please take them again.");
      if (problem) return reply({ ok: false, error: problem }, 400);
      const r = (await staff.get("staff/" + me.id, { type: "json" })) || { id: me.id, legalName: me.name, phone: normalizePhone(me.phone) };
      await staff.setJSON("staff/" + me.id, { ...r, nin, idFront: body.idFront, idBack: body.idBack || "", idStatus: "submitted", idSubmittedAt: nowIso, idNote: "" });
      const user = await setUser(me.id, { idStatus: "submitted", idNote: "" });
      return reply({ ok: true, user });
    }

    if (action === "invite") {
      if (!["admin", "operations", "teamlead"].includes(me.role)) return reply({ ok: false, error: "forbidden" }, 403);
      const phone = normalizePhone(body.phone);
      const role = ["sales", "teamlead", "operations"].includes(body.role) ? body.role : "sales";
      if (!phone) return reply({ ok: false, error: "Enter their WhatsApp number, e.g. 0772 123 456." }, 400);
      if (!canInviteRole(me.role, role)) return reply({ ok: false, error: me.role === "teamlead" ? "Team leads can invite Sales only." : "Only the Owner can invite someone as Operations." }, 403);
      if ((data.users || []).some((u) => String(u.email || "").toLowerCase() === phoneEmail(phone))) return reply({ ok: false, error: "That phone number is already on the team." }, 409);
      let code = newInviteCode();
      for (let i = 0; i < 3 && (await auth.get("invite/" + code, { type: "text" })); i++) code = newInviteCode();
      const name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 40);
      const exp = now + INVITE_MS;
      await auth.setJSON("invite/" + code, { code, phone, name, role, invitedBy: me.name || "", invitedById: me.id, createdAt: nowIso, exp });
      return reply({ ok: true, code, role, expiresAt: new Date(exp).toISOString() });
    }

    // ---- Operations / Owner only ----
    const canManage = me.role === "admin" || me.role === "operations";
    if (!canManage) return reply({ ok: false, error: "forbidden" }, 403);
    const isOwner = me.role === "admin";

    if (action === "record") {
      const r = await staff.get("staff/" + String(body.id || ""), { type: "json" });
      if (!r) return reply({ ok: false, error: "not_found" }, 404);
      return reply({ ok: true, record: {
        id: r.id, status: r.status, legalName: r.legalName, phone: displayPhone(r.phone), nin: r.nin || "", selfie: r.selfie || "",
        idFront: r.idFront || "", idBack: r.idBack || "", idStatus: r.idStatus || (r.nin ? "submitted" : "needed"), idDueAt: r.idDueAt || "",
        idNote: r.idNote || "", idSubmittedAt: r.idSubmittedAt || "", idCheckedBy: r.idCheckedBy || "", idCheckedAt: r.idCheckedAt || "",
        signupAt: r.signupAt, consentAt: r.consentAt, invitedBy: r.invitedBy || "", approvedBy: r.approvedBy || "", approvedAt: r.approvedAt || ""
      } });
    }
    if (action === "checkId") {
      const id = String(body.userId || "");
      const r = await staff.get("staff/" + id, { type: "json" });
      if (!r || r.idStatus !== "submitted") return reply({ ok: false, error: "There's no new ID to check for this person." }, 409);
      const ok = body.ok === true;
      const reason = String(body.reason || "").slice(0, 200);
      if (!ok && !reason) return reply({ ok: false, error: "Say what they need to fix." }, 400);
      const patch = ok ? { idStatus: "verified", idNote: "" } : { idStatus: "redo", idNote: reason, idDueAt: new Date(now + ID_REDO_MS).toISOString() };
      await staff.setJSON("staff/" + id, { ...r, ...patch, idCheckedBy: me.name || "", idCheckedAt: nowIso });
      await setUser(id, patch);
      return reply({ ok: true });
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
        users.push({ id, name: r.legalName, email: phoneEmail(r.phone), phone: displayPhone(r.phone), role, authMethod: "pin", idStatus: r.nin ? "submitted" : "needed", idDueAt: new Date(now + ID_DUE_MS).toISOString(), created: nowIso.slice(0, 10) });
      }
      await dataStore.setJSON(DATA_KEY, { ...fresh, users });
      await staff.setJSON("staff/" + id, { ...r, status: "active", role, idStatus: r.nin ? "submitted" : "needed", approvedBy: me.name || "", approvedAt: nowIso });
      return reply({ ok: true });
    }
    if (action === "reject") {
      const id = String(body.id || "");
      const r = await staff.get("staff/" + id, { type: "json" });
      if (!r || r.status !== "pending") return reply({ ok: false, error: "This sign-up was already handled." }, 409);
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
      if (rec) await auth.setJSON("pin/" + id, { ...rec, hash: "", v: (rec.v || 0) + 1, reset: null });
      const s = await staff.get("staff/" + id, { type: "json" });
      if (s) await staff.setJSON("staff/" + id, { ...s, status: "removed", removedAt: nowIso, removedBy: me.name || "" });
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
