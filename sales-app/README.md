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
