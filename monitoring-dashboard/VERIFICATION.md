# Verification · 12 October 2026

## Version 2

- 33 JavaScript/database tests plus 2 Python agent checks. Database setup/lifecycle tested in an isolated PostgreSQL-compatible PGlite instance under service_role, never against production.
- Checked transactional onboarding, request deduplication, site key rotation, first-heartbeat notification, incident-triggered notification, versioned scheduling, superseded updates, idempotent completion, consent blocking and monotonic delivery status.
- Completion refuses an affected camera/recorder that still reports down. Public function privileges are denied.
- Provider tests use fake requests only. Disabled sender makes no provider/database calls; ambiguous send outcome is not auto-retried. Signed callback tested; missing signature refused.
- Browser demo: scheduling displayed the correct Uganda visit window and separate Client / Account manager messages; completion showed separate messages marked Demo, not sent.
- No production SQL applied, live WhatsApp configured, client message sent or mini PC installed. Hardware and live-provider end-to-end validation remain required.

## Version 1 baseline

- 21 automated tests passed: health boundaries, email-only sites, missing reports, paused sites, acknowledged faults, role allow-list, unauthenticated access, cross-origin requests, actor spoofing, secure cookies, logout, malformed actions, provider errors, truncation guard and raw-email removal.
- JavaScript syntax/build checks passed.
- Browser: demo entry, four-site overview, site details, fault acknowledgement, repair verification and search passed.
- Repair verification left the camera marked down, as required. Closing an incident never manufactures a healthy reading.
- Responsive checks: 390 px and 320 px body width matched scroll width (no page overflow).
- Browser console: no errors at inspection.
- Existing sales-app files untouched. No live sales-role smoke test was run because this is a separate application, not a modification of that app.
- Not verified: actual Supabase sign-in, production Netlify functions, live site readings, cross-device live updates, email delivery or SMS delivery. These require deployment configuration and a controlled live test.
