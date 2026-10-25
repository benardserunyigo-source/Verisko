# Saved draft costs for 4, 6, 8 and 12 cameras

Operations/Admin chooses a saved job under More → Draft payment options, or opens its Job summary → Draft costs & profit. Camera count comes from the existing job, with no re-entry. Edit the same three fields, compare Cash / 12 months / 24 months / Rent, Save and return later.

## Draft scope

The four-camera sample terms are unchanged. Larger-job sample terms scale the existing four-camera upfront/monthly amounts by camera count and round up to UGX 10,000. The page explicitly labels this internal example method, not an approved customer quote. Cost edits do not change these draft amounts. Actual job cost defaults use the matching package from the existing private office budget; they are not scaled from four-camera costs. Missing package costs fail closed. Contingency, finance, fees, reserves and care rules are unchanged. Hard drive/extra work still need inclusion in job costs where applicable. Eight or fewer use an 8-channel example recorder; 12 uses 16 channels; cable allowance is 50m per camera.

## Persistence and access

The separate private record stores the actual camera count, selected package budget, four sample plans/results and saved by/time. Existing four-camera records without the new count field remain readable with identical amounts. Changing a saved job’s camera count or client blocks reuse of the old draft. Version/conditional writes and retry IDs remain in force. Only Operations/Admin can read or save. Source job, quotes, client payment schedules, receipts, commissions and company budget are never written. Customer calculator/catalogue/PDF/client link logic remain byte-identical.

## Verification

- Full suite: 583 passing. Includes all four private cost inputs through real office data handlers, round-to-10k plan reconciliation, exact 26% boundary, separate saved jobs, legacy four-camera compatibility, changed-count rejection, unavailable larger budget, role denial, concurrency/retry and same-job summary links.
- Isolated real-handler phone QA: loaded matching defaults for 4/6/8/12, saved distinct costs, reloaded, selected the same job and compared every field, saved timestamp, all four estimates and draft amounts. All matched. Care edits reset to each job’s saved value. Original source records stayed unchanged; four isolated draft records exist.
- Twelve-camera high-cost scenario marked all four rows below 26%; reset restored saved costs. Public Operations preview has all four sizes with Save disabled; each shows four profit rows. No console errors. 390px and 320px have no document overflow, selector is 48px high.
- Evidence: output/audits/draft-all-packages-20261024/ (tests.log, server.mjs, browser-readback.json, store-readback.json, 12-camera-options-phone.png, 12-camera-profit-phone.png). Fictional data only.

Release verified: v145 d70f1bddef1356da3acc924026542aa757535e9d; Netlify 6add576be0d1eb6090e79050 ready. Twelve asset hashes match; eight private APIs return JSON401 unsigned. Live Operations preview confirms all four sizes, four rows each, disabled preview Save, no overflow and no console errors. No authenticated production save or physical Android acceptance claimed.
