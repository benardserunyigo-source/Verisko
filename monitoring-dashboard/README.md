# Verisko Watch

Separate Netlify-ready, mobile-friendly installation-health dashboard for Technical and Operations. No video streams, customer accounts, or changes to the sales app.

## Status

Implemented: site overview, search, status filters, fault queue, device detail, recent events, acknowledge and verified-close actions, 60-second foreground refresh, stale-report handling, secure staff gateway, isolated sample demo.

Not deployed or connected to live monitoring yet. Demo actions are in-memory only; live actions persist through the existing monitoring functions. No actual SMS is sent by this application. The existing backend currently documents a console-only SMS sender.

## Run

Requires Node 22 or later. No package dependencies.

```
npm test
npm run build
npm start
```

Open http://127.0.0.1:8897 and choose Explore demo. Production sign-in uses a Secure cookie and is intentionally not supported over plain local HTTP.

## Deploy as a SEPARATE Netlify site

Connect this repository to a **new** Netlify site. Do not change the sales site's settings.

- Base directory: `monitoring-dashboard`
- Build command: `npm run build`
- Publish directory: `public` (relative to base)
- Functions directory: `netlify/functions` (relative to base)
- Node: 22

Set these in the new site's server environment, not public files:

| Variable | Value |
| --- | --- |
| SITE_URL | Exact HTTPS URL of this new site |
| SUPABASE_URL | Existing monitoring project's HTTPS URL |
| SUPABASE_PUBLISHABLE_KEY | Project publishable key; NOT a service-role key |
| MONITORING_API_KEY | API-kind key issued for the existing monitoring backend |
| STAFF_ACCESS | JSON mapping approved email addresses to `technical`, `operations`, or `admin` |

Example STAFF_ACCESS shape: `{"approved-person@example.com":"operations"}`. This example grants nobody access. Confirm staff accounts with Ben before configuring. All three allowed roles can read, acknowledge and close faults; sales/teamlead/unknown roles are denied. Revoking an entry takes effect on the next request after the environment change is deployed.

Existing approved users must already exist in Supabase Auth. No automatic sign-up. Add the exact SITE_URL + `/` to allowed Auth redirect URLs. Keep the existing sales redirect URLs unchanged. Use the existing magic-link email template. The token arrives in the URL fragment, is removed immediately, then exchanged for an HttpOnly, Secure, SameSite=Strict cookie; no token or private monitoring data is saved in browser storage. Session is at most one hour and subject to the upstream token's expiry. Sign out removes this dashboard's cookie; it does not sign the user out of the sales app.

The gateway validates identity through `/auth/v1/user` on every private request, then uses the server-only API key for `sites-read` and `incident-update`. Actor email is server supplied. No raw recorder emails or keys are returned. Origin checking, JSON-only requests, no-store responses and a restrictive CSP are configured. Auth's existing rate limits apply to sign-in email requests; configure production mail delivery and monitor abuse before launch.

## Before calling this live

1. Deploy the existing monitoring schema and functions if not already live. Confirm the API key has only `api` scope.
2. Connect real sites and their reporting boxes. Registered sites only are shown: this does NOT auto-import all sales jobs or provision boxes. Site provisioning remains an owner/backend task.
3. Fix the existing repository's 1,000-row pagination limitation before scaling. This gateway refuses summaries at the known cap, but cannot repair upstream truncation or prove completeness beyond that cap. Detail history is the latest 50 incidents/events returned by the backend.
4. Configure the new site variables and approved staff. Staff without work email need an approved account; this separate app does not reuse sales phone/PIN login.
5. Test an approved Operations account and Technical account. Test a non-approved/Sales account is rejected.
6. Use a clearly labelled test site to confirm actual summary, detail, acknowledge, verified close and cross-device persistence. Ensure closing a fault does not change a down reading.
7. Disconnect a camera and a site box: verify unknown/late/silent state, backend incident creation and eventual recovery. Confirm actual recording independently.
8. Real SMS provider and delivery, recorder disk alerts, site agents, UPS duration and human response coverage require separate field validation.

## Health meanings

- Reporting: active box-equipped site, last report less than 3 minutes ago, registered devices all `ok`, no unresolved incidents. Not proof of recording.
- Needs checking: missing/invalid/future report, report 3–15 minutes old, unknown device, no devices or email-only feed.
- Needs attention: unresolved incident, down device or no box report for at least 15 minutes.
- Paused/closed: never treated as healthy.

Acknowledge means the team has seen the fault, not that someone has repaired it. Verify repair asks for explicit playback/repair confirmation. Existing backend stores actor/time; it does not currently return actor details, task notes, assigned technicians or due dates, so this dashboard does not invent those fields. Unknown-email counts flag items for backend review, without exposing raw customer email.

## References

- Existing contract: `../sales-app/monitoring/supabase/functions/_shared/handlers/sites.mjs`
- Existing data model: `../sales-app/monitoring/supabase/functions/_shared/repo.mjs`
- [Supabase email sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithotp)
- [Netlify Functions](https://docs.netlify.com/build/functions/overview/)

No production account, secret, permission, database record or existing application was changed to build this package.
