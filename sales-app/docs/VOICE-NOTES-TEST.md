# Client voice-note check

Checked 22 October 2026 (Edmonton), using the current v125 app.

## What passed

- In an isolated workspace, Sales opened the existing TEST Journey Shop contact, recorded a generated test tone through the real browser MediaRecorder, stopped and saved it with a short caption.
- After logging out and signing in separately, Team Lead found the same client under All requests and played Sales' saved note.
- Operations found the client under With me and played that same note. The player reached the end without a media error.
- All three roles retrieved the same contact ID, recording ID and identical audio bytes. There was one saved recording and no duplicate contact.
- The dialog fitted 360px and 390px wide browser frames without horizontal page overflow. Record, Listen, Refresh and Close buttons were at least 44px high. The 390px screen showed the complete saved-note dialog, including Close.
- Automated checks covered a note saved before handoff becoming available to Team Lead through the shared queue, access denial for unrelated Sales and Installers, retries, server attribution, stale contact saves, microphone denial, two-minute stop, closing/pending permission cleanup and a lost response after the server committed a save. Retrying kept one note.
- Full app suite: 472 tests passed.

The journey test fixture was corrected to pass ready-queue cases into voice authorization, matching the production voice endpoint. No production application code or staff permissions changed during this check.

## Test scope

Browser checks used fictional accounts, local in-memory stores and generated audio. The test did not use a microphone, real client records or real staff credentials. Phone widths are responsive browser checks, not an Android emulator or physical-device test. The existing 0.3.0 Android pilot build has passed its CI unit tests, lint task and APK build; those checks do not establish microphone or speaker operation on a staff phone.

## Last check on a real Android phone

Use current Android Chrome or the 0.3.0 pilot wrapper. On a shared test contact, Sales taps Voice notes, Record, allows microphone access, speaks, taps Stop, listens and saves. Team Lead and Operations then open that same contact and tap Listen. Confirm clear speech and speaker volume. Also deny and retry permission, switch apps while recording, and retry a save after reconnecting. Do not roll out microphone use as device-verified until these checks pass.

Local evidence is saved under `/Users/ben/Verisko/output/audits/voice-cross-role/`, including Sales save confirmation, Team Lead playback, Operations playback, small-screen layout, completed playback and matching recording hashes.
