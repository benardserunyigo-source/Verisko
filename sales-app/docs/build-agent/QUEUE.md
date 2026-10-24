# Build queue

Maintain one queue. Status: ready, working, needs-device, needs-decision, done. Do not invent features or repeat completed audits just to fill a scheduled run.

| Priority | Item | Status | Acceptance |
| --- | --- | --- | --- |
| 0 | Assigned site supervisor and client handover | working | Only a named site supervisor can record the joint sign-off. Client signature and supervisor confirmation required. Fixes stay open, return to installer, and need re-review. Preserve one job and all prices/payments. |
| 0 | Full accessibility, simple-use and client handover audit | done | v130: 501 tests passed; source workflow through named client acceptance, server gates, stale saves, contrast/keyboard/320px phone fixes and local browser handover/reload verified. See `../qa/2026-10-24-accessibility-and-client-handover.md`. Real Android/TalkBack and media-content acceptance remain separate. |
| 1 | Android field pilot | needs-device | On an actual Android handset: phone/PIN sign-in for intended roles; GPS consent/permissions; shift locked-screen tracking, pause/resume/checkout; offline sync; voice recording/playback; installer photos and start/finish. Check same saved records in Operations; try TalkBack and larger text. Review voice-note text alternatives and training captions before claiming full accessibility. Log device/app version and results without publishing staff data. |
| 2 | Reconcile release readiness against the complete approved journey | done | Read current full-journey tests and role policies. Map every journey step to coverage and current module docs, flag actual gaps, fix reproducible bugs under existing policy. Do not repeat already verified clock testing without a new failure. Save a concise coverage map. |
| 3 | Phone usability check across Sales, Operations and Installer | done | Inspect the existing phone layout using fictional role sessions: four primary buttons, short words, no duplicate contact/material entry, understandable save/offline/error state. Fix concrete defects; do not redesign working flows for taste alone. |
| 4 | Reconcile Job records display with linked installation approval | done | Fresh full browser test completed the installation but its source quote/job stayed Sent. Reproduce with a regression test; make linked technical progress clear in Job records and pipeline handling without inventing contract acceptance or bypassing funding approval. Evidence: `../qa/2026-10-24-browser-end-to-end.md`. |

Device checks can wait while other work progresses. If only device checks remain, do not mark the portal fully accepted. Do not send staff instructions or invite accounts without the owner's authorization.

Audit evidence: `../qa/2026-10-24-full-journey-audit.md`. Full suite: 492 passed. Local phone checks covered Sales contact submission, Operations visit rescheduling and Installer job/material screens at 390 × 844. Actual Android and authenticated production cross-device acceptance remain separate.

Job-record approval sync resolved in v129. Evidence: `../qa/2026-10-24-job-approval-sync.md`; 496 tests passed, browser approval → Job records → Installed filter → reload checked. Existing price/payment/funding fields were preserved.

Android pilot distribution: direct HTTPS download requested by owner on 24 October. Existing checksum-verified 0.3.0 APK is live at `/downloads/verisko-field-0.3.0-pilot.apk` (HTTP 200 and exact binary hash checked); handset acceptance remains pending.
