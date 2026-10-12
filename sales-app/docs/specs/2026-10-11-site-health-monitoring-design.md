# Site health monitoring — design

Status: approved by Ben on 11 October 2026. Next step: implementation plan.

## 1. Purpose

Tell Verisko Operations, quickly and reliably, when a customer's CCTV system stops working, without anyone visiting. This is Phase 1 of a monitoring system for installed sites. It checks health only: is each camera up, is the recorder up, is the disk healthy, is the site still reporting.

Why now: the care plan (UGX 370,000 a year) and the 30-day callback promise both depend on finding faults before the customer does. Today the first sign of a fault is a customer call.

## 2. Decisions already made

| Decision | Choice | Reason |
|---|---|---|
| What sits at a site | A small on-site box, plus the recorder's own email alerts as a free first feed | The box survives weak internet and changing addresses and needs no open ports. Recorder emails cost nothing and can be tested now. |
| Who gets alerts | Verisko Operations only | A false alarm must never reach a paying customer while the alerts are unproven. |
| Where monitoring data lives | New tables in the existing Supabase project `verisko-sales` | The project is empty today apart from login accounts. The app's shared JSON file cannot hold a stream of status data. |
| Secrets | One new Netlify setting is allowed | Needed so the Sites screen can read monitoring data. Its blast radius is limited, see section 5. |

## 3. Scope

In scope: two feeds (recorder emails, site box), one incident engine, a Sites screen for Operations and admin, SMS alerts to Operations, a watcher for silent sites.

Out of scope for Phase 1: live video, person-detection alerts, any message to customers, a customer-facing screen, reading disk or recording status from the recorder through the box (stays a goal until a bench test proves the recorder allows it), billing links to the care plan.

## 4. Architecture and data flow

```
Recorder email  ->  Gmail label on hello@verisko.com  ->  Apps Script (every 5 min)  ->  ingest
Site box        ->  HTTPS post every 60 s (store and forward when offline)            ->  ingest
ingest  ->  events + device_state  ->  incident engine  ->  incidents  ->  SMS to Operations
watch (every minute)  ->  finds silent boxes, expires stale email incidents  ->  incident engine
Operations app  ->  /api/sites (Netlify)  ->  Supabase read function  ->  Sites screen
```

Units, each with one purpose:

| Unit | Does | Depends on |
|---|---|---|
| `incident-engine` | Pure function: given the current state, rules and a new event, returns incident changes and notifications. No database, no network. | Nothing |
| `ingest` (Supabase Edge Function) | Checks the key, validates the payload, stores the event, updates device state, calls the engine, writes results, triggers SMS. | engine, database |
| `watch` (Supabase Edge Function on a one-minute schedule) | Detects silent boxes, expires stale email incidents, groups area outages. | engine, database |
| `sites-read` and `incident-update` (Supabase Edge Functions) | Return site summaries and apply Acknowledge or Fixed. Accept only the monitoring API secret. | database |
| `/api/sites` (Netlify Function) | Confirms the caller is admin or operations using the app's existing identity check, then calls the two functions above with the secret. | existing `identify` |
| Sites screen | Shows sites, incidents, device state. Acknowledge and Fixed buttons. | `/api/sites` |
| Email reader (Google Apps Script) | Reads labelled alert emails, extracts site code and event, posts to ingest. Unreadable emails are posted as `unknown`, never dropped. | ingest |
| Box agent (Python 3, standard library only) | Every 60 seconds checks the recorder and cameras on the site network and posts one summary. Queues posts on disk while offline. Outbound HTTPS only. | ingest |
| SMS sender | One function behind an interface, so the provider can change. | provider API |

Code location, all inside `sales-app/`: `monitoring/supabase/` (migrations, functions and the shared engine), `monitoring/apps-script/`, `monitoring/box-agent/`, `netlify/functions/sites.mjs`, and Sites screen additions in `app.js`. The engine is plain ES module JavaScript with JSDoc types, so it runs in Deno and in the existing `node --test` setup with no build step.

## 5. Data model (Supabase, public schema)

All tables have row level security on and no public policies. Only the Edge Functions, using the service role, read or write them.

| Table | Columns that matter |
|---|---|
| `sites` | `id`, `code` (unique, for example VS-0001, goes in the recorder's email subject), `job_ref` (links to the app's job), `client_name`, `area`, `care_plan` boolean, `feeds` (email, box, or both), `status` (active, paused, closed) |
| `devices` | `id`, `site_id`, `kind` (camera, recorder, box), `label`, `channel`, `model` |
| `access_keys` | `id`, `kind` (box, email), `site_id` (null for the email script), `key_hash`, `created_at`, `revoked_at`. Keys are 32 random bytes, stored as SHA-256 hashes. |
| `events` | `id`, `site_id`, `device_id`, `source`, `kind`, `observed_at`, `received_at`, `raw` (jsonb), `dedupe_key` (unique). Kept 90 days, cleaned daily. |
| `device_state` | `device_id`, `state` (ok, down, unknown), `since`, `last_event_at` |
| `incidents` | `id`, `site_id`, `device_id`, `kind`, `state` (open, acknowledged, fixed), `source`, `opened_at`, `acknowledged_by`, `acknowledged_at`, `fixed_at`, `fixed_by`, `fixed_reason` (recovered, manual, expired), `notified_at`, `repeat_count`, `area_group` |
| `alert_rules` | `kind`, `wait_minutes`, `severity`, `sms` boolean, `auto_expire_hours` |
| `alert_contacts` | `id`, `name`, `phone`, `active` |

Monitoring API secret: one random value stored as a Netlify setting and as a Supabase function secret. It can call only `sites-read` and `incident-update`, so a leaked secret exposes monitoring summaries, not the database.

## 6. Alert rules (starting values, editable in `alert_rules`)

| Event kind | Source | Waits | Severity | SMS | Clears when |
|---|---|---|---|---|---|
| `camera_offline` | email or box | 5 min | high | yes | Box sees it back. For email: staff tap Fixed, or 24 hours with no repeat. |
| `recorder_offline` | box | 5 min | high | yes | Box sees it again |
| `disk_full` | email | 0 | high | yes | Staff tap Fixed |
| `disk_error` | email | 0 | high | yes | Staff tap Fixed |
| `site_silent` | watch | 15 min with no box report | high | yes | Box reports again |
| `ip_conflict` | email | 0 | medium | no, screen only | Staff tap Fixed |

Behaviour:

- A wait for the box means the check has failed on every run for that many minutes in a row. For email events the wait is always 0, because the recorder decides when to send, and the table value applies only to the box.
- Repeat events for the same fault update one incident and increase `repeat_count`. They never open a second incident.
- One SMS when an incident opens and one when it is fixed. No more than one repeat SMS per incident per hour.
- If two or more sites in the same `area` go silent within 10 minutes, they join one incident labelled "likely power cut" and send one SMS listing the sites.
- Email-only sites cannot raise `site_silent`, because a recorder that is off sends nothing. The Sites screen marks such sites "email only, cannot detect outages".
- Events arriving out of order, older than the device's current `since`, are stored but do not change state.
- Box clocks are not trusted: `observed_at` is clamped to within five minutes of `received_at`, except for queued posts replayed after an outage, which keep their original times.
- No quiet hours in Phase 1.

## 7. Email feed

Each recorder is configured to email the `hello@verisko.com` inbox, and its email subject or device name must contain the site code. A Gmail filter labels these emails. The Apps Script reads unprocessed labelled emails every five minutes, matches the site code, maps the text to an event kind using patterns per recorder model, and posts to `ingest` with the Gmail message id as `dedupe_key`. Emails with no site code or an unknown pattern become `unknown` events, listed on the Sites screen under "Needs a look".

The patterns cannot be written until real emails exist. They come from the recorder email test being run by Ronnie with Abraham. The test also records whether a recovery email is sent when a camera comes back.

## 8. Sites screen

New item in the More menu for admin and operations, hidden from Sales and Team lead. List sorted red, amber, green, each row showing site code, client, area, feed badges, last seen, and open incidents. Site detail shows each device with state and time, recent events, and Acknowledge and Fixed buttons that record who and when. An Add site form links a site to an existing job and generates its code and, for box sites, its key. Cache version `?v=` is bumped on every asset change, as the app requires.

## 9. Security and privacy

- Cameras and recorders are never exposed to the internet. The box makes outbound HTTPS calls only and opens no inbound ports.
- Camera makers' firmware has a poor security record, so the box is the only thing that talks to cameras, and only on the local network.
- Keys are per site, hashed, and revocable. The email script's key lives in Apps Script properties.
- The recorder's sending password is a revocable Google app password, never the account password.
- Only status is stored, never footage or images. Event rows can name a client, so the data is staff-only under the Data Protection and Privacy Act, 2019.

## 10. Build order and testing

| Step | Delivers | Verified by |
|---|---|---|
| 1 | Tables, `ingest`, engine, rules | Unit tests for every rule and edge case in section 6, plus replayed fake events. No hardware. |
| 2 | Email reader script | Real emails from Ronnie's recorder test saved as test fixtures with names removed, then a live test on that recorder. |
| 3 | Sites screen and `/api/sites` | Browser smoke test as admin, operations, sales, and teamlead. Sales and teamlead must be refused. |
| 4 | SMS alerts | A real SMS to Abraham's phone for each rule. |
| 5 | Box agent and `site_silent` | Bench test with a spare camera and recorder, then one real site for a month. |

Starting success targets: in bench tests, every seeded fault produces an SMS within its wait time plus two minutes. In the one-site pilot, fewer than one false alarm per week.

## 11. Inputs still needed from real work

| Input | From | Blocks |
|---|---|---|
| Recorder email format, and whether a recovery email is sent | Ronnie's email test | Step 2 patterns, and whether email incidents can clear by themselves |
| SMS provider and its price | Ben and Abraham | Step 4 |
| Box hardware model | Bench test of an N100 unit and a Pi 4 | Step 5 |
| Whether the box ships free with the care plan | Ben | Pricing only, not the build |
| Whether cameras sit behind the recorder's private network | A wiring photo from one finished install | Which device checks the box can do in step 5 |

## 12. Changes made while planning (11 October 2026)

These refine sections 4 to 6. Where this section disagrees with an earlier one, this section wins.

- Shared code, including the engine, lives in `monitoring/supabase/functions/_shared/`, because each Supabase function is bundled from its own folder.
- Access keys have four kinds: box, email, api and watch. The API key and watch key are ordinary hashed rows in `access_keys`, so nothing is set in the Supabase dashboard. The one Netlify setting holds the raw API key. The raw watch key is kept in Supabase Vault for the scheduler.
- New columns: `sites.box_last_seen_at`, `devices.label_key` (case-insensitive label) and `incidents.created_at`. A partial unique index allows one live incident per site, device and kind.
- Devices are created automatically when a box or an email first mentions them. A mistyped label creates a new device.
- Box reports become events only when a device changes state. An all-ok report only updates the last-seen time. A report older than a device's current state is dropped, not stored.
- A paused site keeps its history and device state but raises no incidents and sends no SMS.
- A manual Fixed tap sends no SMS. Automatic recoveries do.
- If an SMS fails, or no contact exists yet, the incident stays unnotified and the watcher retries for two hours.
- The foundation ships a console SMS sender. Real texts arrive at build step 4.

## 13. Follow-ups found in code review (11 October 2026)

Fixed before deployment: explicit database grants and pinned function search paths, site codes that grow past four digits, a malformed id is "not found" rather than a server error, only source files are bundled, and the watch key is created inside Postgres so its raw value never leaves the database.

Not yet fixed, and which plan must fix each:

- **Before real SMS (build step 4):** two posts for the same fault at the same moment can both send an "opened" text, and the watcher's retry can overlap a text still being sent. Fix: make `save()` report which incidents it created and text only those, and retry only incidents older than two minutes. Also add an SMS budget per hour, so a leaked email key cannot run up costs.
- **Before the Sites screen (build step 3):** the database returns at most 1,000 rows per query, so the summary and watcher reads must page through results. The fake and real repositories must return identical shapes and ordering for the summary and detail calls.
- **Before the email reader (build step 2):** an acknowledged camera fault opened by email can expire after 24 hours while a box still sees the camera down, then reopen with a new text. Fix: a box "down" report should refresh the incident's last-seen time. Expiry should also set the device back to unknown. A report older than a device's latest event, not just older than its current state, should count as out of order.
- **Later:** other files in the app folder are still publicly served because the app is published from its source folder (for example `README.md`, `APP_PLAN.md`, `netlify.toml`, `package.json` and `node_modules`). Fix by publishing from a dedicated folder. The migration is not repeatable, so a half-applied run needs manual cleanup. One database query per check when a box reports, a paused or closed site that still has an open silent incident, and a manual Fixed on a device that is still down reopens it within a minute, so the screen should point staff to Acknowledge for known issues.
