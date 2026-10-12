# Installation onboarding and client updates

Built on 12 October 2026. User confirmed: **build the message flow only**. No WhatsApp number was connected, customer message sent, production database changed or mini PC installed.

## Team workflow

1. **Add installation:** site name, area, order, client contact, account manager contact and each person's WhatsApp consent.
2. **Local network:** record the mini PC's private IPv4 address and a list of camera/recorder labels, private IPs and TCP ports. Use router DHCP reservations. The mini PC must reach the cameras, including any recorder-private PoE network. A technician must confirm this on site.
3. **Private config:** save to issue a site-bound key; download the file once and transfer it privately to that mini PC. Only the hash is retained by the database. A lost config requires key replacement by Technical/Admin; this revokes the old key. The mini PC IP is a network record, not a remotely exposed connection or an authentication factor.
4. **First report:** the existing ingest endpoint receives outbound HTTPS checks. A first-report trigger queues a connection message. Until then the dashboard says it has no report, never “connected”.
5. **Confirmed fault:** when the existing incident engine opens a camera/recorder/disk/site fault, queue one update per recipient. Raw failed pings do not message clients; the existing threshold rules still apply. Disk checking still requires a supported recorder email feed, not TCP reachability.
6. **Schedule:** choose a technician and future visit window in Uganda time. A transactional update saves the plan, audit entry and both messages together. Changing the visit creates a reschedule update and cancels unsent older schedule messages.
7. **Complete:** technician explicitly checks playback and records a repair note. Completion queues updates for client and account manager. A camera merely coming back online creates a separate recovery update, not a claim of completed service.
8. **Message history:** inspect Pending / Accepted / Delivered / Read / Failed / Uncertain / Blocked / Cancelled. Pending is not delivery. Failed or uncertain outcomes need staff follow-up.

## Database activation gate

The draft `database/workflow-setup.sql` depends on the existing monitoring tables. It was tested on an isolated embedded PostgreSQL engine (PGlite), including under the service_role role. It has NOT been applied to Supabase.

Before staging or production: back up the monitoring schema, review the SQL, apply it with an owner-approved database workflow, run Supabase security advisors, and test against the actual deployed functions. Generate the deployment migration with the supported Supabase CLI after review; this file is a reviewed setup source, not an already-applied migration.

New tables contain private contact details, network inventory, repair history and message queue. They have RLS enabled, no anonymous/authenticated policies and explicit service-role grants only. RPC functions use invoker rights, pinned search paths, and revoked public execution. The existing incident/heartbeat triggers add rows within the originating transaction: any queue database failure rolls back the triggering write and must be caught during staging.

New Netlify server-only setting: `SUPABASE_SERVICE_ROLE_KEY`. This is broader access than the original read-only monitoring key; **do not activate it without owner approval**. It is never returned to the browser. Existing identity validation and STAFF_ACCESS role allow-list protect each workflow route; the actor email comes from verified identity. Use a separate monitoring project or narrowly scoped gateway before expanding the deployment if this privilege level is unacceptable.

The new onboarding path covers NEW sites. Existing sites lacking a watch profile need a controlled migration of contacts/network inventory before scheduling client notifications; do not recreate an existing production site just to add a profile. In the meantime they remain visible in the original monitoring overview. Site editing, staff work calendars and bulk imports are not in this version.

## Mini PC pilot

Python 3 standard library only. No camera credentials, video storage, cloud video, port forwarding or incoming mini-PC connections.

On Linux create a dedicated `verisko-watch` service account, install `watch-agent.py` at `/opt/verisko-watch/watch-agent.py`, place the downloaded config at `/etc/verisko-watch/config.json`, restrict it to that service account with mode 600, and test as that account:

```
python3 /opt/verisko-watch/watch-agent.py /etc/verisko-watch/config.json --once
```

The supplied systemd unit is a template for the installer to review and enable after the one-shot report succeeds. Validate startup after reboot, cable unplug/reconnect, WAN failure/recovery, time synchronisation and power loss. The mini PC, router, NVR and PoE equipment need appropriate backup power.

The agent checks at most 64 devices with up to eight parallel TCP connection attempts every minute. Successful TCP connect means **port reachable**, not a valid RTSP picture or recorded footage. Confirm the chosen port on each device. No broad subnet scanning. Private RFC1918 IPv4 addresses only. Reports omit local IP addresses. If internet is down, the next report uses fresh checks rather than replaying old checks as current; the cloud silent-site watcher must already be active. This pilot agent has no offline historical spool or remote software updater. Windows users can run the same script and configure Task Scheduler separately; a Windows startup package has not been validated.

## Message flow only: sending stays OFF

`WHATSAPP_ENABLED` is unset/false. The scheduled dispatcher exits without calling the database or provider. Demo records and messages live only in the browser tab and never contact a provider.

An optional Meta Cloud API adapter and signed-delivery webhook are prepared for later integration, not connected or live-tested. Before enabling, choose the provider and business number, confirm pricing, approve recipients/consent and review exact template content. Meta's documentation was rate-limited during this build, so the payload and template configuration must be revalidated with the chosen provider during integration.

Future sender settings: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_LANGUAGE`, `WHATSAPP_TEMPLATES` (JSON mapping six event kinds to approved names), `WHATSAPP_APP_SECRET`, and `WHATSAPP_VERIFY_TOKEN`. All are server-side. Never use a personal WhatsApp automation session. Set `WHATSAPP_ENABLED=true` only after approval and a controlled recipient test.

Each approved template must take exactly two body parameters: site name, service detail. Suggested fixed wrappers to review:

| Event | Draft wrapper |
| --- | --- |
| connected | Verisko monitoring is connected at {{1}}. {{2}} Reply STOP to stop updates. |
| fault | Verisko service alert for {{1}}. {{2}} Reply STOP to stop updates. |
| scheduled | A Verisko repair visit is scheduled for {{1}}. {{2}} Reply STOP to stop updates. |
| rescheduled | The Verisko repair visit for {{1}} has changed. {{2}} Reply STOP to stop updates. |
| completed | Verisko repair update for {{1}}. {{2}} Reply STOP to stop updates. |
| restored | Verisko connection update for {{1}}. {{2}} Reply STOP to stop updates. |

Webhook path: `/.netlify/functions/whatsapp-webhook`. GET verifies the subscription token; POST requires the provider HMAC signature before accepting delivery status or an inbound STOP. STOP revokes that number's current consent and blocks pending messages. It cannot recall an already sent/in-flight message. Re-consent/contact correction currently requires an owner-controlled database update; do not silently opt someone back in.

## Reliability limits

- One queue item claimed per scheduled minute to stay inside Netlify's execution limit and bound pilot spend. Client and manager messages may therefore arrive in different minutes. Increase throughput only after approved load/budget testing.
- Queue records are unique by event and phone. Repeated onboarding requests reuse a site; an uncertain onboarding response never issues an unusable replacement key.
- Scheduling uses a version check and row lock. A stale tab must refresh rather than overwrite another person's plan. Completion is idempotent.
- Consent is checked at enqueue and again when claiming a message. Paused/closed sites and changed contacts are blocked before dispatch. Blocked messages are never auto-released later.
- A provider response is only Accepted, not Delivered. Signed status callbacks advance delivery state without downgrading a delivered/read record.
- Timeout/crash after a provider request is Uncertain. It is not auto-retried, because that could duplicate a message. Operators must reconcile provider records before any manual resend. No “exactly once” delivery guarantee.
- Pending messages older than 24 hours are cancelled so stale visits/faults are not sent after a delayed activation. Old pending fault/schedule messages are cancelled when superseded. Sent/in-flight messages cannot be recalled.
- A notification may arrive before its acceptance write stores provider_id; that early webhook may not match. Before live launch add durable webhook event capture/reconciliation, load tests and a staff remediation interface. For now do not treat missing delivery evidence as success.
- Existing monitoring limitations still apply: 1,000-row summary cap, 50-event/incident detail limit, actual hardware/recorder support and cloud watcher deployment remain to be verified.

## References

- [Netlify scheduled functions and execution limits](https://docs.netlify.com/build/functions/scheduled-functions/)
- [Supabase database functions and privileges](https://supabase.com/docs/guides/database/functions)
- [Meta WhatsApp API reference](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates)
