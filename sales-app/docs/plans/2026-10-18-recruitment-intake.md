# Field-sales application MVP

## Tap-to-select revision (v79)

Eight of ten questions now use selections. Only name and WhatsApp phone always
need typing. Area, university and bachelor’s course have dropdowns plus a
required text field only for Other. Study year is a dropdown. Availability is
day checkboxes plus a time choice. Start time is a choice, with a calendar only
for Pick a date. Experience and readiness for fieldwork are single-choice
answers. Motivation and the customer-approach explanation are covered by the
two-minute video instead of written essays. No auto-rejection or scoring.

New answers carry formVersion=pick-v1. Their selections and conditional values
are validated on the server. Existing submissions and already-open older forms
remain compatible. The reviewer uses each submission’s original question
labels so old essay answers are never relabelled as experience/readiness.

## Applicant journey

Public /apply.html → role and pay → 6 personal/study questions → 4 availability/sales questions → record or choose a video up to two minutes → preview → consent → send → reference.

No CV, National ID, email account or staff account is required. The ten questions collect name, WhatsApp number, area, university, bachelor’s course, study year/graduate status, available work days/times, start date, approach to a shop owner and interest in the role.

Recording uses the front camera and microphone only after a tap. It stops at two minutes. Phone Camera uploads are the fallback for browsers without MediaRecorder. MP4/WebM accepted up to 24 MB. Browser metadata and recording timer enforce length; the server bounds byte size and checks container signatures, not full codec decoding/duration. Upload in 1 MB parts with retries. Never report success until all parts and answers are stored.

## Review and storage

Operations/Admin → More → Applications (sidebar on desktop). Read answers, load/watch the private video, call the applicant, save New/Contacted/Interview/Hired/Not selected plus notes. Hiring is a human decision. Applications never create a staff account. The existing invite flow is the next step for hires.

Separate private Netlify Blobs store verisko-applications. Existing staff identity helper checks each read, video part and review. Sales/Team lead/anonymous users cannot read applications. No applicant records are stored in app-data, localStorage, exports or shared sales sync. Video object URLs are released when leaving the inbox. No public video links.

Anonymous intake creates a random upload capability valid for 24 hours, stored hashed. Ten new upload sessions per platform-reported connection/day; retries reuse the same session. Honeypot, explicit consent and same-origin checks. This is basic abuse control, not CAPTCHA/phone verification. Daily cleanup removes expired incomplete uploads and old quota counters. Completed records remain until the Admin explicitly deletes them, including video. Rate limits and storage/bandwidth should be reviewed if sharing broadly.

## New-role offer

Three-month contract; possible additional year based on performance and agreement. Bachelor’s students/graduates; Sales/Marketing/business courses preferred. Minimum three confirmed bookings/week. UGX 70,000 weekly pay; UGX 30,000 Monday transport/airtime; UGX 15,000 per confirmed booking above three/week; UGX 100,000 sale commission after customer first payment. Existing staff commission/float calculators intentionally unchanged: they use a different scheme and historic pay must not change.

## Verification

Before edits: 220 existing tests passed; Today/Dashboard/Prospects/Visits opened in local seeded Admin, Operations, Team lead and Sales roles. Backend tests cover authorization, multipart upload, incomplete submission, expiry, consent, duplicates, size and magic bytes. Local browser end-to-end uses a clearly labelled synthetic applicant and a generated test video; delete that record afterwards. Live checks must confirm version, anonymous intake page, protected API and camera/microphone policy. Real phone camera/microphone hardware is not simulated proof.

Run: npm test; node docs/tools/application-preview.mjs. Preview is local-only and contains synthetic auth, never used by the production endpoint. No new Supabase tables, auth settings, vendor account or provider integration.
