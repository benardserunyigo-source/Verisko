# Build queue

Maintain one queue. Status: ready, working, needs-device, needs-decision, done. Do not invent features or repeat completed audits just to fill a scheduled run.

| Priority | Item | Status | Acceptance |
| --- | --- | --- | --- |
| 1 | Android field pilot | needs-device | On an actual Android handset: phone/PIN sign-in for intended roles; GPS consent/permissions; shift locked-screen tracking, pause/resume/checkout; offline sync; voice recording/playback; installer photos and start/finish. Check same saved records in Operations. Log device/app version and results without publishing staff data. |
| 2 | Reconcile release readiness against the complete approved journey | ready | Read current full-journey tests and role policies. Map every journey step to coverage and current module docs, flag actual gaps, fix reproducible bugs under existing policy. Do not repeat already verified clock testing without a new failure. Save a concise coverage map. |
| 3 | Phone usability check across Sales, Operations and Installer | ready | Inspect the existing phone layout using fictional role sessions: four primary buttons, short words, no duplicate contact/material entry, understandable save/offline/error state. Fix concrete defects; do not redesign working flows for taste alone. |

Device checks can wait while other work progresses. If only device checks remain, do not mark the portal fully accepted. Do not send staff instructions or invite accounts without the owner's authorization.
