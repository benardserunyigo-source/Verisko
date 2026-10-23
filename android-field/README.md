# Verisko Field for Android · pilot

Android 8+ app for the existing Sales & Site Visits system. Staff sign in with
phone + PIN and use Today → Check in or More → Field shifts. The native location
foreground service continues when the screen locks, WhatsApp opens or the
Activity is dismissed. It shows an ongoing notification with Pause shift and
Check out. Resume/check-in require opening the app. The browser remains usable
but does not have background tracking.

## Installation and first field trial

The workflow `Android Field pilot APK` produces an installable **debug-signed
pilot APK**, not a Play Store release. Install on one actual team Android first.
Use the existing staff phone/PIN. Allow precise location and notifications.
Check in outdoors, verify the notification, lock the phone for at least 10 minutes,
then use WhatsApp for 10 minutes. Operations should see new captured timestamps
and locations. Repeat with mobile data off, pause while offline from the
notification, move again, and reconnect: no positions after the pause may appear.
Resume, then check out from the notification while locked. Verify GPS stops and
the server eventually closes the shift. Check battery use, GPS accuracy and the
actual phone manufacturer's battery restrictions before wider deployment.

Force-stop, reboot, revoked permissions, dead battery and some manufacturer
battery restrictions can interrupt tracking. The app does not covertly restart
GPS after reboot or force-stop. Operations shows missing updates. No claim of
real-device locked-screen reliability is made until the field trial passes.
The existing 12-hour maximum shift still applies. Tracking also stops on session
expiry. A stable production signing key/distribution process is required before
ongoing team rollout; a future CI debug build may have a different test signature.

## Build

The manual GitHub Actions workflow uses the repository's standard Ubuntu Android
SDK, Temurin JDK 17, checksum-verified Gradle 8.13 and Android Gradle Plugin 8.13.2.
It runs `testDebugUnitTest lintDebug assembleDebug`. It publishes only the pilot
APK and test/lint reports as a build artifact, never keys or staff data. There is
no scheduled workflow or app-store submission. With a local SDK and JDK 17,
run the same Gradle tasks from this directory.

## Boundaries

- No separate paid tracking SDK or Google Play Services dependency.
- Native GPS uses LocationManager and a location-type foreground service started
  from the visible Activity after permissions. No Always Allow location grant,
  boot receiver, accessibility service or continuous wake lock is requested.
- MainActivity's native message bridge is restricted to the exact production
  HTTPS origin and main frame. Other pages open externally. No unsafe JavaScript
  interface fallback, mixed content or TLS-certificate bypass.
- Phone + PIN sessions are stored in a device-keystore-encrypted, atomic private
  file. GPS is queued in that same encrypted file, not browser localStorage.
  App backup is disabled. Native status replies contain no tokens or coordinates.
  Queued items expire after 36 hours and are removed on the next app, service or
  upload-job run; Android cannot run deletion code while the app is force-stopped.
- Uploads go only to the fixed production HTTPS field-shifts API and do not
  follow redirects. A bounded upload wake lock helps complete network requests
  when the screen is locked. A network-constrained JobService retries queued
  uploads after tracking stops; that job never starts GPS.
- Delayed batches carry original capture times, exact active segment IDs and
  deterministic idempotency keys. The server verifies intervals and ownership,
  deduplicates points, rejects off-shift locations and never treats upload receipt
  time as a fresh location. Archived shift revisions include valid late points.
- Starting/resuming needs connectivity to confirm an authenticated shift. A pause
  or check-out stops GPS locally first and queues the control with its actual time.
  Different accounts cannot take over an unfinished locally queued shift.
- Sampling targets one point per minute, subject to Android and GPS availability;
  this is not a guaranteed interval. Mock-provider fixes are rejected, but this
  is not comprehensive anti-spoofing or evidence of working time.

## Check-out location update · 0.2.0 pilot

The app stops the continuous location watch first. An explicit check-out then requests one precise finish fix for up to eight seconds, including check-out from the notification. That point is saved with the end event, separate from the active route. It can be queued in encrypted Android storage. When GPS is unavailable, check-out still saves with a clear missing-location note. Checking out from a pause does not add break time to the shift.

The website supplies the check-in reminder checklist and Support link, and thanks staff after check-out. It says hours are recorded only when the server confirms the end; offline work is labelled waiting to sync. Install the 0.2.0 pilot APK to get the native finish-location capture. Older APKs can still stop shifts but do not capture that separate finish point.

Repeat the real-phone trial above for both in-app and notification check-out, including a paused shift, location disabled, and no data. A successful CI build is not evidence of locked-screen behaviour on a staff phone.


## Client voice notes · 0.3.0 pilot

This pilot adds microphone support for client voice notes. Tap **Voice notes → Record voice note** on the Verisko website inside the app, then allow Android microphone permission. Record, stop, listen and save. It does not record automatically. Saving requires data. Switching away stops the recording; closing discards an unsaved draft.

The WebView grants audio capture only to the exact Verisko production HTTPS origin while this Activity is in the foreground. Other origins, camera requests and background requests are denied. An in-flight microphone request is denied when the Activity pauses. The page is told to stop recording when the app leaves the foreground. This microphone change does not change the location service.

Install the new pilot APK for microphone support in the wrapper. Android Chrome can also use the website directly. Before staff rollout, test permission denial/retry, record/stop/save/playback, app switch and lock-screen stop, and sign-out with a draft on an actual Android phone. A successful CI build and synthetic browser audio test do not establish those real-device results.
