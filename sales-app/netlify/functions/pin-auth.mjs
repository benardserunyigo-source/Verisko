// Verisko Uganda Operations — phone + PIN sign-in for staff without email.
//
// Staff sign up in the app (legal name as on the National ID, phone, NIN, a
// photo of the ID, a 4-digit PIN). The Owner or Operations approves them and
// picks their role; then they sign in with phone + PIN.
//
// Where things live (Netlify Blobs):
//   verisko-auth   "secret"          random key that signs session tokens
//                  "pin/<userId>"    { salt, hash, v, failed, lockedUntil, reset }
//                  "phone/<digits>"  userId — one account per phone number
//   verisko-staff  "staff/<userId>"  { status, legalName, phone, nin, idFront,
//                                      idBack, consentAt, signupAt, … }
// Approved staff also appear in the shared `users` list (authMethod "pin",
// email "<phone digits>@staff.verisko" so every email-based rule keeps
// working). ID numbers and photos never enter the shared data or the export.
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_STORE = "verisko-auth";
export const STAFF_STORE = "verisko-staff";
export const PIN_ITERATIONS = 120000;
export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const SESSION_MS = 30 * 24 * 3600 * 1000;
export const RESET_MS = 48 * 3600 * 1000;
export const STAFF_DOMAIN = "staff.verisko";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

// Phone digits with the country code (Uganda by default), or "" if invalid.
export function normalizePhone(v) {
  let d = String(v == null ? "" : v).replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) d = "256" + d.slice(1);
  else if (/^7\d{8}$/.test(d)) d = "256" + d;
  return /^\d{11,15}$/.test(d) ? d : "";
}
export function displayPhone(d) {
  d = String(d || "");
  if (/^256\d{9}$/.test(d)) return "+256 " + d.slice(3, 6) + " " + d.slice(6, 9) + " " + d.slice(9);
  return d ? "+" + d : "";
}
export function phoneEmail(digits) { return digits + "@" + STAFF_DOMAIN; }

// 4 digits, and not an obvious one (1111, 1234, 4321…).
export function pinProblem(pin) {
  const p = String(pin == null ? "" : pin);
  if (!/^\d{4}$/.test(p)) return "Your PIN must be exactly 4 digits.";
  if (/^(\d)\1{3}$/.test(p)) return "Choose a PIN that isn't the same digit four times.";
  const up = "0123456789", down = "9876543210";
  if (up.includes(p) || down.includes(p)) return "Choose a PIN that isn't a simple sequence like 1234.";
  return "";
}
// Uganda National ID number: 14 characters starting CM or CF.
export function ninProblem(nin) {
  const n = String(nin || "").toUpperCase().replace(/\s+/g, "");
  return /^C[MF][0-9A-Z]{12}$/.test(n) ? "" : "Enter the 14-character NIN from your National ID (it starts with CM or CF).";
}
export function cleanNin(nin) { return String(nin || "").toUpperCase().replace(/\s+/g, ""); }
export function legalNameProblem(name) {
  const n = String(name || "").replace(/\s+/g, " ").trim();
  if (n.length < 5 || n.split(" ").length < 2) return "Enter your full name exactly as it is on your National ID (at least two names).";
  if (n.length > 80 || /[<>{}]/.test(n)) return "That name doesn't look right.";
  return "";
}

export function hashPin(pin, salt) {
  return pbkdf2Sync(String(pin), String(salt), PIN_ITERATIONS, 32, "sha256").toString("hex");
}
export function newPinRecord(pin, v) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: hashPin(pin, salt), v: v || 1, failed: 0, lockedUntil: 0, reset: null };
}
function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), "hex"), y = Buffer.from(String(b), "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
export function pinMatches(pin, rec) { return !!rec && !!rec.hash && safeEqualHex(hashPin(pin, rec.salt), rec.hash); }

// Failed-attempt bookkeeping. Returns the updated record.
export function recordFailure(rec, now) {
  const failed = (rec.failed || 0) + 1;
  return failed >= MAX_FAILED ? { ...rec, failed: 0, lockedUntil: now + LOCK_MS } : { ...rec, failed };
}
export function isLocked(rec, now) { return !!rec && Number(rec.lockedUntil || 0) > now; }

// A one-time 6-digit code (Owner/Operations "Reset PIN"). Signs out every
// session (v + 1) and clears the old PIN.
export function startReset(rec, now) {
  const code = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
  const salt = randomBytes(16).toString("hex");
  return { code, rec: { ...(rec || {}), hash: "", salt: "", v: ((rec && rec.v) || 0) + 1, failed: 0, lockedUntil: 0, reset: { salt, hash: hashPin(code, salt), exp: now + RESET_MS } } };
}
export function resetCodeMatches(code, rec, now) {
  return !!(rec && rec.reset && rec.reset.exp > now && safeEqualHex(hashPin(code, rec.reset.salt), rec.reset.hash));
}

// Session tokens: "vs1.<payload>.<signature>", payload { uid, v, exp }.
export function signToken(secret, payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update("vs1." + body).digest());
  return "vs1." + body + "." + sig;
}
export function verifyToken(secret, token, now) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "vs1") return null;
  const expect = createHmac("sha256", secret).update("vs1." + parts[1]).digest();
  const got = fromB64url(parts[2]);
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
  let p; try { p = JSON.parse(fromB64url(parts[1]).toString("utf8")); } catch (e) { return null; }
  if (!p || !p.uid || !(Number(p.exp) > now)) return null;
  return p;
}
export function isStaffToken(token) { return String(token || "").startsWith("vs1."); }

export async function getSecret(authStore) {
  let s = await authStore.get("secret", { type: "text" });
  if (s) return s;
  await authStore.set("secret", randomBytes(32).toString("hex"), { onlyIfNew: true });
  return authStore.get("secret", { type: "text" });
}

// Approved PIN accounts are managed by the server (/api/auth): a device can
// change only their role, never remove them or change their phone, name or
// status by posting the team list.
export function protectPinUsers(storedUsers, incomingUsers) {
  const stored = Array.isArray(storedUsers) ? storedUsers : [];
  const inc = Array.isArray(incomingUsers) ? incomingUsers : [];
  const incById = new Map(inc.filter((u) => u && u.id).map((u) => [u.id, u]));
  const pinIds = new Set(stored.filter((u) => u && u.authMethod === "pin").map((u) => u.id));
  const out = inc.filter((u) => !(u && u.authMethod === "pin" && !pinIds.has(u.id)))   // can't invent one
    .map((u) => {
      if (!u || !pinIds.has(u.id)) return u;
      const s = stored.find((x) => x.id === u.id);
      const role = ["sales", "teamlead", "operations"].includes(u.role) ? u.role : s.role;
      return { ...s, role };
    });
  stored.forEach((s) => { if (s && s.authMethod === "pin" && !incById.has(s.id)) out.push(s); });
  return out;
}

// Who is calling? Either a staff PIN session or a Supabase email session.
// deps: { authStore, supabaseUser(token) -> email|null, now }
// Returns { email, me } or { error, status }.
export async function identify(request, data, deps) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { error: "not_signed_in", status: 401 };
  const users = Array.isArray(data.users) ? data.users : [];
  if (isStaffToken(token)) {
    const secret = await getSecret(deps.authStore);
    const p = verifyToken(secret, token, deps.now);
    if (!p) return { error: "session_expired", status: 401 };
    const me = users.find((u) => u.id === p.uid && u.authMethod === "pin");
    if (!me) return { error: "not_authorized", status: 403 };
    const rec = await deps.authStore.get("pin/" + me.id, { type: "json" });
    if (!rec || rec.v !== p.v) return { error: "session_expired", status: 401 };   // PIN was reset
    return { email: String(me.email).toLowerCase(), me };
  }
  const email = await deps.supabaseUser(token);
  if (!email) return { error: "session_expired", status: 401 };
  const me = users.find((u) => String(u.email || "").toLowerCase() === email) || null;
  if (me && me.authMethod === "pin") return { error: "not_authorized", status: 403 };
  return { email, me };
}
