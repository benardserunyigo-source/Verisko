# Application intake verification

- Baseline: 220 tests, four role smoke tests before edits. After intake: 226 tests, all passing.
- Local browser: ten required answers → generated 3-second test MP4 → consent → multipart upload → successful reference → Operations/Admin inbox → video playback (duration 3, readyState 4, no playback error) → saved Interview review and notes → Admin deleted test record and video.
- Admin and Operations see Applications; Sales and Team lead do not. API tests separately deny unauthorized list/record/video, not only navigation.
- Phone width 360px: public page and staff inbox have no horizontal overflow.
- Real Netlify v77 intake deployed, protected API returns 403 anonymously. Applicant Permissions-Policy verified camera=(self), microphone=(self); staff root retains camera=(), microphone=(). Public intake opens without login.
- Review session on production was expired. Authenticated production inbox read/playback is not independently confirmed this turn. Physical camera/microphone on an Android/iPhone remains a real-device check; upload fallback and playback were verified with a generated MP4 locally.
- QR images decode to the exact live /apply.html URL. No fabricated QR or private employer URL.
- BrighterMonday updated and read back: UGX 30,000 Monday transport/airtime, no CV required by Verisko intake, ten answers and two-minute video, public form URL. Its advert remains awaiting platform approval; the standalone intake does not depend on that approval.
- v78 adds the shareable QR card and guards late inbox responses when navigating away. No change to historic commissions/float or existing data.
