// Turns a notification from the engine into one short SMS (kept under 160 characters).

const WHAT = {
  camera_offline: (device) => `${(device && device.label) || "camera"} offline`,
  recorder_offline: () => "recorder offline",
  disk_full: () => "recorder disk full",
  disk_error: () => "recorder disk error",
  site_silent: () => "no report from the site box",
  ip_conflict: () => "recorder address conflict",
};

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kampala", hour: "2-digit", minute: "2-digit", hour12: false,
});

export const kampalaTime = (iso) => timeFormat.format(new Date(iso));
const short = (text, n) => (String(text || "").length > n ? String(text).slice(0, n - 1).trimEnd() + "." : String(text || ""));
const cap = (text) => (text.length > 160 ? text.slice(0, 157) + "..." : text);

// ctx = { site: {code, name}, device: {label}|null, sites: [{code, name}] }
export function formatSms(n, ctx) {
  if (n.type === "area_outage") {
    const codes = (ctx.sites || []).map((s) => s.code).join(", ");
    return cap(`VERISKO likely power cut in ${n.area}: ${(ctx.sites || []).length} sites silent (${codes}) since ${kampalaTime(n.since)}. Open Sites.`);
  }
  const who = `${ctx.site.code} ${short(ctx.site.name, 22)}`;
  const what = (WHAT[n.kind] || (() => n.kind))(ctx.device);
  if (n.type === "opened") return cap(`VERISKO ${who}: ${what} since ${kampalaTime(n.since)}. Open Sites.`);
  if (n.type === "reminder") return cap(`STILL OPEN. VERISKO ${who}: ${what} since ${kampalaTime(n.since)}.`);
  if (n.type === "fixed") return cap(`FIXED. VERISKO ${who}: ${what}.`);
  throw new Error(`unknown notification type ${n.type}`);
}
