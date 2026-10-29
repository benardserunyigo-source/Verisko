# Contact-list upload readiness

A fresh upload audit demonstrated invalid phone strings accepted, secondary phones duplicated within a file, and same-name/different-number matches overwriting the wrong contact. Fixed parser validation for both numbers, same-file duplicate detection on either number, and explicit conflict skips for ambiguous saved matches. Matching phones still update one existing record. Unknown source defaults to Other rather than claiming Instagram.

Actual390px Admin uploaded7fictional CSV rows. Preview:2new/1existing/4skipped with row reasons (secondary duplicate, invalid phone, missing phone, ambiguous name). Save produced3contacts, original existing ID/owner/stage/call history preserved and email updated. Exact-file CSV reimport:0new/3matches/4skipped, stored contacts identical. Same data exported as Excel and uploaded through actual file chooser: same preview,0new on save.

On the same browser-imported contact, real local handlers saved Operations call, one voice note (retried), Admin email. Admin/Operations/TeamLead read exactly3history entries/1voice note and exact audio bytes; unrelated Sales/Installer saw no contacts. Reimport preserved that history. No new cash/jobs; existing other contact business/history/owner unchanged (legacy absent import metadata normalizes to empty strings).745tests pass. Private fictional evidence output/audits/import-readiness-20261029/. No real records, calls, messages or privileges changed.

Blank human template: outputs/contact-upload-20261029/Verisko-Contact-Import-Template.xlsx, one Contacts sheet,10headings,0example rows; phone columns formatted as text. Artifact rendering inspected and exported workbook read back through the app's bundled XLSX reader with correct headings/no contacts. App supports xlsx/xls/csv, first sheet, at most3000valid contacts/5MB per upload. Phone required; business/contact name recommended. Optional Phone2/Email/Location/Category/Source/Notes/Assignedto. The UI selects default first caller and first call date; Assignedto matches office roster by supplied name/email under current import policy.

App CSV Download template browser-event capture was inconclusive in IAB; the attached Excel file is independently verified. No claim of actual Android microphone/playback acceptance.

Released v179 sourcec49f2b7, Netlify ready6ae37292984cffa3dc83c063.48assets match,12private APIJSON401+receiptJSON403. Real customer list not supplied/imported; authenticated production write and handset audio acceptance not claimed.
