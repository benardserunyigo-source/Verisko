# Operations redesign — v162

Owner approved the25October audit plan, starting with warehouse buying and installer cash links, then simpler Operations screens.

## Changes

- Job summary uses held warehouse stock plus receipts to decide material readiness; all-stock jobs do not request buying. Mixed-stock jobs request only the missing amount.
- Deterministic source-linked installer expenses project into the private cash book once. Amount/date/method/job stay tied to the installer record. Admin approval and proof stay separate from recording payment. Cash displays approved balance separately from the balance after recorded, unapproved payments.
- Earlier possible cash duplicates are flagged without auto-linking or another expense. Admin explicitly links the existing receipt, preserving its ID/proof/approval. Pending corrections can return for proof and resubmit. Source cancellation cannot silently reverse an approved expense: Admin must record the reasoned cash correction. No real money is moved.
- Operations/Admin: Today, Contacts, Jobs, Stock. Today surfaces job tasks, with the same client/job and a next action. Job workspace puts the next task first; details and less-used actions expand below. Cash tasks open that job's filtered cash book. Office tools/help/settings remain in the account menu.
- Completed visit contacts have their own filter. Operations and Team Lead active counts exclude signed-off installations. Read-only signed-off checklist and human-readable approval times reduce repeated confirmations. Materials show signed-off status where appropriate.

## Verification

664 automated checks passed, including10 new tests covering all-stock/mixed readiness; once-only expense projection/approval; source-field tampering/deletion/duplicate prevention; prior-expense linking; void/correction/resubmission; office privacy; completed counts; and task context. Existing full-journey, commission, stock, client acceptance and role tests pass.

Actual isolated app at4469: fictional existing closed job; Operations Today→same-job→job cash book showed installer350,000 once pending, approved cash5,280,000 and after-recorded balance4,930,000. Linked form amount/date/direction/category/method are locked and correct. Contacts shows With me0/Completed1; Stock loads. 390px and320px checks, no horizontal overflow. Fresh final browser tab has no console errors. Earlier intermediate null-host race was caught by browser QA and fixed by keeping ready-data refresh from replacing Operations Home and checking the task host/lifecycle. Its earlier log remains in evidence, separate from clean final results.

Evidence: `output/audits/operations-redesign-20261025/` contains phone screenshots, clean final measurements and local QA server. Existing actual end-to-end fictional state reused; no production records, accounts, stock, payments or messages changed for QA. Tests do not establish real Android locked-screen or TalkBack acceptance.

Release verified: v162 source `0ea1770c534acf9152911f92870468b92540bbb3`, Netlify `6ade9adff3fe0d5454f5e989` ready.35 exact live assets plus the observed application anchor rewrite match; ten private APIs deny unsigned requests with JSON401. Live Operations and other role previews are phone-safe; no authenticated production writes were used.

Live-preview follow-up: v161 showed an unassigned contact with a premature future-payment task. Final v162 keeps these contacts in the visit queue and prioritises visit/quote tasks before payment for a saved draft job. Added a regression; final664tests pass.
