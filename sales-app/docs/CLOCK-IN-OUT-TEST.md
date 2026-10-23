# Clock-in and clock-out check

Checked 22 October 2026 (Edmonton), using the v127 application.

## Result

Pass in the isolated browser and server tests. No application-code fix was needed.

- Check-in without location-sharing consent was blocked.
- The pre-shift pop-up showed the three reminders and kept Start disabled until all were ticked.
- Check-in recorded a start location and showed sharing on.
- Pause showed sharing off. Resume required consent and created a new active segment.
- Check-out saved a different finish location, ended the shift and displayed the recorded-hours thank-you message only after server confirmation.
- The completed shift appeared in history. Operations read the same archived start/finish locations.
- The brief browser test recorded 19.544 active seconds and excluded a 7.352-second pause. Its display correctly rounded down to 0h 0m because active time was under a minute. Exact timestamps remained stored.

## Automated verification

The full suite passes: **489 tests**, including the visit/installer Start/Finish and Operations active-job checks.

New Sales and Team Lead clock tests each check 10 minutes working, 15 minutes paused, then 20 minutes working: 45 minutes on the clock, 30 minutes active. Start and finish GPS remain separate. A repeated check-out creates no duplicate event or history record. Operations can retrieve the archive, and post-checkout location updates are rejected.

Existing tracker tests cover stopping the GPS watch before pause/check-out, offline stop retry, reload, lost/expired sessions, another device taking over, late Android point uploads, missing checkout GPS, check-out from a pause and the twelve-hour limit. Offline check-out remains labelled waiting to sync; it does not falsely claim recorded hours.

## Scope

Browser checks used fictional accounts, local real HTTP handlers and sample GPS. No production staff records or actual location permissions were changed. Android bridge behavior is covered by automated tests; locked-screen tracking, real GPS accuracy and OS permissions still need an actual staff-phone trial with the Android pilot app. Browser-only tracking still requires the app to stay visible, as the screen explains.

Evidence: `/Users/ben/Verisko/output/audits/clock-in-out/`, including paused and confirmed-checkout screenshots and `verified-record.json`.
