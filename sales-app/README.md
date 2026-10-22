# Verisko Sales & Site Visits

A Netlify-ready mobile-first sales workflow. Shared data is stored in
**Netlify Blobs** (Netlify's own built-in storage) through a serverless
function. A Microsoft Excel backend is also available as an alternative
(see `excel-backend/`).

## What is included

- A mobile-first salesperson app with four screens: **Today**, **Prospects**,
  **Site visits**, and **Settings**
- **Today** lists actionable work in priority order — overdue follow-ups, due
  today, qualified prospects ready to schedule, proposed visits awaiting
  confirmation, and confirmed upcoming visits
- Prospect qualification and site-visit handoff workflows, with one-tap
  telephone links for the field
- Client-side validation that prevents confirming a visit until the prospect
  has a contact person, telephone number and location and the visit has a
  date, time and Operations owner
- A serverless function (`netlify/functions/data.mjs`) that stores the shared
  dataset in Netlify Blobs, gated by a private team key
- Device-local fallback and JSON backup if the shared service is unavailable

The salesperson finds and qualifies prospects and books confirmed site visits.
Technical surveys, cable quantities, official quotations and equipment lists are
handled by the Operations Director after the handoff — they are not entered
here.

## Using the app

- **Today** — start here each day; every item shows the obvious next action
  (Call, Schedule, Confirm).
- **Prospects** — search and filter the pipeline; add or edit a prospect with
  business type, contact, telephone, location, security concern, areas to
  cover, existing cameras, budget indication, next action and follow-up date.
- **Site visits** — schedule a visit for the Operations Director; confirmed
  visits are shown as distinct "ready for handoff" cards. A visit can only be
  confirmed once its handoff details are complete.
- **Settings** — see the connection status, refresh shared data, sign out,
  download or import a JSON backup, or restore the demonstration data.

## Sign-in (Supabase email login)

Each person signs in with **their own email + a 6-digit code** (Supabase email
OTP — no passwords). The Netlify function verifies every request against
Supabase and checks the email against the team **allow-list**, so nothing loads
for an email that isn't on the team.

- The **first** person to sign in on an empty workspace becomes the **owner**
  (admin) and is asked for their name.
- The owner adds teammates by **name + email** in **Settings → Team members**;
  that person can then sign in with that email.
- **Removing** a teammate revokes their access immediately (the server rejects
  their token) — airtight offboarding, no shared code to rotate.
- Only the owner sees the **Settings** tab. Everyone can **Log out** from the
  avatar menu (top-right). Once signed in, a device works offline until logout.
- Every prospect records **who added it**.

The two public Supabase values (project URL and publishable key) are compiled
into `app.js` and `netlify/functions/data.mjs`; both are safe to ship. The
`{{ .Token }}` Supabase "Magic Link" email template turns the email into a code.
No shared `TEAM_KEY` is used anymore.

## Deploy (Netlify Blobs backend)

Because this app includes a serverless function, deploy from Git — Netlify's
drag-and-drop uploader will not build the function.

1. In Netlify, choose **Add new site → Import an existing project** and pick this
   GitHub repository.
2. Set **Base directory** to `sales-app` (the repo root holds the public
   storefront; the app lives in this subfolder). Netlify then reads
   `sales-app/netlify.toml`, so build command, publish directory and functions
   are configured automatically.
3. Deploy. Netlify installs `@netlify/blobs`, builds the function, and gives you
   an HTTPS address.
4. In the **Supabase** project, set the **Magic Link** email template to include
   `{{ .Token }}` (so the email carries a 6-digit code), and set the **Site URL**
   to your Netlify address.
5. Open the site and sign in with your email — the first sign-in becomes the
   **owner**. Add teammates in **Settings → Team members**.

Netlify Blobs requires no separate setup — storage is enabled by default and the
function is authorised automatically inside Netlify's environment.

## Configuration

- **No Netlify environment variables are required.** Auth uses the two public
  Supabase values (project URL + publishable key) compiled into `app.js` and
  `netlify/functions/data.mjs`. To point at a different Supabase project, edit
  the `SUPABASE_URL` / `SUPABASE_KEY` constants in both files.

(The Microsoft Excel alternative in `excel-backend/` is unchanged and still uses
the Microsoft Graph env vars; swap `netlify/functions/data.mjs` for
`excel-backend/data.graph.mjs` to use it.)

## Data safety

The browser keeps a local copy as a fallback and works offline once signed in.
Access is controlled per-email through Supabase and the owner's team allow-list.
Download a JSON backup before resetting or importing data.

## Pricing, release 85

The active budget is private server configuration in `VERISKO_PRICING_BUDGET`,
scoped to production functions in Netlify. Do not commit its value, copy it into
public browser scripts or include it in customer PDFs. The JSON contains a
version, policy, package cost basis and USD storage costs. Owner/Operations get
the approved inputs after authentication; Sales receive the public price cards.
Older repository history contains earlier budgets; this change does not erase
previously published history.

New quotes use UGX 4,300/USD, a 30% planning target and a 26% minimum.
Commission and visit pay remain inside the overhead allocation. Purchase costs,
freight weights, crew scope, actual overhead coverage, finance charges and VAT
status still require human confirmation. The budget is not an actual job P&L.

Set the private environment variable in a trusted development shell before
running `npm test` or `node scripts/build-price-catalogue.mjs`. Regenerate and
commit `price-catalogue.js` whenever the approved budget/version changes; it
contains only customer prices, package scope and installment amounts. Publish
the matching function configuration and app release together.

Server validation recalculates current quotes, records approval of cost
reductions/price adjustments, requires cost evidence before issue, and protects
accepted prices and payment schedules. New quotes expire after seven days;
unaccepted expired/older offers refresh when edited. Accepted legacy contracts
keep their agreed prices. A financed job needs an installation date and Owner
funding confirmation before acceptance. Downloads/sharing require a successful
server save. Existing records can be viewed offline; new pricing needs a
connection to load private cost inputs.

Release 86 includes 12 months of callbacks and health/status monitoring via an
on-site mini PC, without footage access, plus 24 months of replacement for
faulty cameras and installed cables. The Owner confirmed faults-only coverage;
accidents and power-surge damage are excluded. The mini PC and this care remain
inside the existing callback allowance: no new charge, reserve or package price
increase. Cash review reserves the existing allowance; P&L costs are unchanged.
Actual costs still need reconciliation against that allowance.

`care-policy.js` versions the terms. New quotes carry its version. Accepted older
contracts are not silently rewritten. Operations records the actual care start,
mini PC reference and offline-alert test evidence; handover requires these.
Care dates are 12 and 24 calendar months from installation. An activation-test
record is not an automatic monitoring deployment or proof of delivered alerts.

## Field shifts (v89)

**Today → Check in** or **More → Field shifts** opens the field shift screen.
Sales and Team leads start only their own shift, agree to location sharing and
allow their phone's location permission. Pause stops GPS immediately; Resume
requires fresh location and agreement. Check out stops GPS and closes the shift.
A pending offline pause/check-out is saved without coordinates and retried on
reconnection. Opening/reloading the app never automatically starts GPS.

Operations and Owner/Technical accounts see staff check-in state, the latest
reported location with its time/accuracy, a location trail and event timeline.
Sales and Team leads see only their own location records. Existing prospect,
visit, quote and commission records are unchanged. The shift service is separate
from `/api/data`, spreadsheet feeds and local business-data backups.

In a normal browser this is **foreground browser tracking**.
The app must remain visible with location permission and a connection. Locking
the screen, switching apps, GPS failure or loss of signal can interrupt updates.
The manager view flags a location older than five minutes as **Update missing**.
It must not be used as proof of attendance, a client visit, fraud or pay eligibility.
Stationary time requires discussion: a rep may be meeting a client. GPS can be
inaccurate or spoofed. Times display in Africa/Kampala.

Locations are requested approximately once per minute during active sharing.
A new browser tab/device needs an explicit Continue sharing action and invalidates
the old location-sharing lease. Open shifts expire after 12 hours. Records are
available for 30 days and the daily `field-shifts-cleanup` scheduled function
physically removes older records. Location trails do not join pauses, poor GPS
points, implausible jumps or reporting gaps over five minutes. No map-provider
request is made until a person opens the explicit Maps link.

Storage: dedicated strong-consistency Netlify Blobs store `verisko-field-shifts`.
Each staff member has an independently keyed current shift with conditional
ETag writes. Completed shifts have revision-checked archive records, allowing valid late Android uploads. Concurrent staff
updates cannot overwrite the workspace or one another. No additional service
credentials or database migration are required.

### Android field app

`android-field/` contains the Android 8+ pilot APK source and installation/field
trial instructions. Phone/PIN staff can check in from its WebView, then keep a
native location foreground service running while locked or using another app.
The ongoing notification has Pause and Check out. The web screen uses a strictly
origin-scoped native message bridge; it does not use browser GPS for shift routes
in Android. Opening/reloading the screen never starts tracking.

Offline native points are encrypted on-device and uploaded in bounded batches
with original capture timestamps. The API accepts only the owning staff member's
valid active intervals, deduplicates points and rejects post-pause locations.
Offline stops are timestamped and stop native GPS before network delivery.
Authoritative status checks stop a superseded local service without pausing a
new device's shift. A killed service needs explicit Continue sharing.

Build/JUnit/lint checks do not prove phone battery behaviour. Pilot on one actual
team phone before rollout, following `android-field/README.md`.

## Saved leads and explicit handovers (v91)

Today → Save a lead, or More → My leads on a phone, keeps a contact without
booking a visit. Save the contact name, phone, area, notes, contact status and
next follow-up. GPS and the qualification questionnaire are not required for
this path. Existing Book site check still creates a visit-ready prospect and
proposed visit using its existing checks.

Saved contacts use the same prospect ID throughout, with `leadOnly: true`.
They stay out of the Prospects list, qualification/review queues and visit pay.
Sales sees its own drafts. Other Sales accounts cannot access them. Team leads
and Operations receive drafts only after an explicit handover to their team;
Owner/Technical accounts retain existing administrative oversight. The receiving
team sees a Today notice and a Received handovers inbox under My leads. A Team
lead can forward the same record to Operations. Move to Prospects is an explicit
receiving-team action; it does not itself create or confirm a visit.

The server enforces visibility, preserves hidden drafts when a scoped or older
client saves, blocks visits/quotes while a record is still a saved lead, rejects
duplicate contact phone numbers on new leads, and prevents stale draft copies
from undoing a handover/conversion. Existing call notes and follow-up plans retain
their append-only/newer-plan protections. An offline handover remains pending on
the phone until workspace sync succeeds; saving locally is not delivery proof.
