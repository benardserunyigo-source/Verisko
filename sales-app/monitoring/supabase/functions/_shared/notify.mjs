// Sends the SMS for a list of engine notifications and records who was told.
import { formatSms } from "./sms-text.mjs";

const unique = (list) => [...new Set(list.filter(Boolean))];

// notifications: engine output. created: { [ref]: incidentId } returned by repo.save.
export async function dispatchNotifications({ repo, sms, notifications, created, nowIso }) {
  if (!notifications.length) return { sent: 0 };
  const contacts = await repo.listContacts();
  if (!contacts.length) return { sent: 0 };
  const phones = contacts.map((c) => c.phone);
  const siteIds = unique(notifications.flatMap((n) => (n.siteIds ? n.siteIds : [n.siteId])));
  const deviceIds = unique(notifications.map((n) => n.deviceId));
  const info = await repo.describe({ siteIds, deviceIds });
  const toMark = [];
  let sent = 0;
  for (const n of notifications) {
    const ctx = {
      site: info.sites[n.siteId] || { code: "VS-????", name: "unknown site" },
      device: n.deviceId ? info.devices[n.deviceId] || null : null,
      sites: (n.siteIds || []).map((id) => info.sites[id]).filter(Boolean),
    };
    try {
      await sms.send(phones, formatSms(n, ctx));
      sent += 1;
    } catch (err) {
      continue; // leave notified_at empty so the watcher retries
    }
    if (n.type === "opened") toMark.push(n.incidentId || (created || {})[n.ref]);
    if (n.type === "reminder") toMark.push(n.incidentId);
    if (n.type === "area_outage") toMark.push(...(n.incidentIds || []), ...(n.refs || []).map((r) => (created || {})[r]));
  }
  const ids = unique(toMark);
  if (ids.length) await repo.markNotified(ids, nowIso);
  return { sent };
}
