# Live workflow readiness — 25 October 2026

The browser workflow is deployed at https://verisko-sales-2026.netlify.app/.

- Live v160 source `8adb6b3f9d4ce26b20f2cf6a441b18b5229b28aa`; Netlify deploy `6ade7553bda97f8bdcf0bc92` is ready. All 35 raw asset hashes match; application HTML matches after the single observed Netlify pretty-link anchor rewrite.
- All 654 automated checks passed this run, including the linked later-payment approval and once-only Sales commission regression. Existing actual-app fictional journey evidence covers contact, visit, quote, client plan, approved receipts, materials, installer acceptance/checks/photos/returns, technical approval and joint supervisor/client sign-off.
- Ten private APIs reject unsigned requests with JSON 401. Server-side role tests cover scoped reads and writes. Sales sees own contacts/progress/pay/public prices; Team Lead handles shared visits and assigned supervision; Operations manages delivery and costs; Installer sees assigned jobs and own pay; Admin approves client receipts and controls privileged settings.
- Live Sales, Operations, Team Lead and Installer view-only sample previews inspected at 390 × 720. Each has at most four visible main buttons and no horizontal overflow. Hidden DOM navigation elements were not treated as visible access. Screens and DOM measurements saved under `output/audits/team-readiness-20261025/`.

## Remaining acceptance boundary

The live browser was signed out; no authenticated production cross-role write journey was performed. Intended staff should verify their own phone/PIN sign-in in the pilot. No real clients, financial entries, stock or privileges were changed for this check.

Android 0.3.0 remains a debug-signed pilot. Before full Android rollout, run the documented real-phone locked-screen/offline/pause/check-out, photo, audio and accessibility trial, and establish stable production signing/distribution. Browser tests do not establish locked-screen tracking reliability. See `android-field/README.md` and the existing needs-device queue item.

No source changes or redundant deployment were necessary: the verified workflow already matches production. Live normal sign-in remains the team entry point; rolePreview URLs contain fictional read-only examples and are not staff sessions.
