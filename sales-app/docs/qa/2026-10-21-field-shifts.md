# Field shifts v87

Staff-controlled check-in, pause, resume, continue sharing and check-out, with
an Operations/Owner team status view and private 30-day history. Foreground
browser GPS only; screen-off/background tracking is not supported.

## Verified

- Sales and Team lead can write/read only their own shifts. Operations and
  Owner/Technical can read staff shifts but cannot activate a rep's tracking.
- Consent, fresh coordinates and GPS accuracy are required for check-in/resume.
- Pauses and check-out clear GPS watches immediately on the device. Offline
  stops persist without coordinates and retry after reconnect/reload.
- Reload never automatically starts GPS. Another device gets a new sharing
  lease; old point writes are rejected. Visibility changes interrupt GPS.
- Conditional per-person writes, idempotency and strong readback prevent
  successful responses for lost writes and concurrent duplicate check-ins.
- Points are rejected after pause, checkout, stale lease or 12-hour expiry.
- Route lines break at pauses, poor GPS, gaps and implausible jumps.
- Stale signal is labelled Update missing after five minutes. Elapsed shift
  time excludes pauses but is explicitly not verified work or attendance.
- Scheduled cleanup physically removes records older than 30 days.
- Field GPS is absent from shared app-data, JSON business backups and exports.
- Browser QA used synthetic staff and GPS in an isolated local memory store.
  Staff: consent gate → check-in → pause → resume → check-out → saved history.
  Operations: latest team status → selected trail → event timeline.
  Desktop 1280px and phone 390px had no horizontal overflow. Phone access is
  Today → Check in / View field team, or More → Field shifts.
- Existing finance suite is run with its existing private test budget supplied
  only as an environment variable. No private budget was added to Git.
- All 279 tests pass, including 17 field-shift service/controller tests. Live
  checks verify the v87 assets and that both function and friendly API paths
  reject unauthenticated access. The route is declared in `_redirects` before
  its existing SPA catch-all, as well as in `netlify.toml`.

## Remaining field validation

No real employee location was collected for testing. Confirm first use on the
actual staff phones over mobile data, including location permission, GPS
accuracy, offline stop/recovery and Operations visibility. For continuous
tracking with a locked screen or while using other apps, a native mobile
background-location implementation is required. GPS alone cannot prove work,
identify a home reliably, prevent spoofing or determine pay eligibility.
