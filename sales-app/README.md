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

The app opens on a **lock screen**. The access code is the `TEAM_KEY` set in
Netlify; it is checked on the server, so no data loads without a valid code.
After the code, each person signs in with a lightweight **account** (name +
email, no password) so every prospect records **who added it**. The first
account created is the **owner** (admin) — only the owner sees the **Settings**
tab (team list, connection, backup). Everyone can **Log out** from the avatar
menu in the top-right; the device stays connected until the owner uses
**Disconnect this device** in Settings.

## Deploy (Netlify Blobs backend)

Because this app includes a serverless function, deploy from Git — Netlify's
drag-and-drop uploader will not build the function.

1. In Netlify, choose **Add new site → Import an existing project** and pick this
   GitHub repository.
2. Set **Base directory** to `sales-app` (the repo root holds the public
   storefront; the app lives in this subfolder). Netlify then reads
   `sales-app/netlify.toml`, so build command, publish directory and functions
   are configured automatically.
3. Under **Site configuration → Environment variables**, add one variable:
   - `TEAM_KEY` — a private phrase the salesperson enters in the app.
4. Deploy. Netlify installs `@netlify/blobs`, builds the function, and gives you
   an HTTPS address.
5. Open the site. On the **lock screen**, enter the same `TEAM_KEY` as the
   access code to sign in — this loads and starts syncing the shared data.
   The device stays signed in until you use **Sign out** in Settings.

Netlify Blobs requires no separate setup — storage is enabled by default and the
function is authorised automatically inside Netlify's environment.

## Required Netlify variable

- `TEAM_KEY` — the only variable needed for the Netlify Blobs backend.

(The Microsoft Excel alternative in `excel-backend/` needs `MS_TENANT_ID`,
`MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `EXCEL_DRIVE_ID`, `EXCEL_FILE_ID` and
`TEAM_KEY` instead; swap `netlify/functions/data.mjs` for
`excel-backend/data.graph.mjs`.)

## Data safety

The browser keeps a local copy as a fallback. The team key lives only in the
Netlify environment, never in browser code. Download a JSON backup before
resetting or importing data.

This prototype uses one shared team key; it does not provide individual user
accounts or a per-user audit trail.
