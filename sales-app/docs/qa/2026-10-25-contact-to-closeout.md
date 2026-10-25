# Contact to closeout test · 25 October 2026

Result: passed in an isolated fictional workspace using current application screens and real HTTP handlers. No production clients, stock, accounts or money were changed.

One contact: DEMO End-to-End Shop. One quote: J-2026-0001. Contact ID vmvobcu4jkow56; quote ID vmvobeleymubtb. The saved contact name, phone and site flowed into the quote. The paid source, materials plan and installation retained these IDs. No second contact or copied materials list was needed.

## Browser checks at 390px

- Sales saved a new contact and sent it for a visit in one tap.
- Operations took ownership, confirmed a visit, started and finished its field timer with sample GPS, and marked the assessment done with actual Uganda finish time.
- Create quote selected the same contact automatically. Operations checked the sample scope/cost reference and saved Sent. Record quote sent selected the quote automatically.
- The client link showed the same quote and amounts. Fictional client chose the existing three-month plan and confirmed; Operations saw the reply on the same job. No WhatsApp message was sent.
- After handler-based installation checks and approval, the assigned Operations supervisor and fictional client completed the joint sign-off screen, including checks, typed signature and demo monitoring references.
- Reloaded Operations summary: Client signed off, client UGX0, installer UGX0, 8/8 journey steps, nothing waiting. Sales progress and My pay showed signed-off status and UGX115,000 (15,000 visit +100,000 first-payment commission; no three-visit bonus).

## Same-job handler checks

Payment recorded then Admin-approved with the same approval retried: one receipt and one commission. Owner funding and installation date confirmed. Materials planned once (4 cameras/200m cable), buying requested, order/arrival records, installation offer and installer acceptance. The issued list was reused; all camera checks and 22 sample evidence images, start/finish locations, material usage and submission persisted. Operations received20m usable cable and approved checks. Job records moved to Installed, then Handed over after joint client review. Demo balances were settled with one installer payment and remaining client receipt; no real transfer occurred.

Unrelated Sales/Installer could not see this contact/job. Sales could not access installer APIs or supplier cost notes. Unassigned Team Lead could not open the installation. Assigned installer could see agreed pay/payment records without supplier quote links. Full existing suite also tests return-to-Sales, decline, correction/resubmission, stale/offline writes and client-requested fixes.

## Gap found and fixed

The signed-off, paid job still showed “Review and approve the client’s chosen plan” from an earlier quote link. Such links cannot replace an already agreed job. Summary now retains the historical reply but stops asking for an unavailable approval after Accepted/Scheduled/In progress/Installed/Handed over. Unagreed Draft/Sent jobs still require plan review. Regression test covers settled closeout and pending saved plans. No prices, receipts, approvals or commercial terms changed.

651 tests passed after fix. Evidence: output/audits/full-journey-20261025/{server.mjs,continue.mjs,final-check.mjs,handler-checks.json,final-readback.json,1-sales-sent.png,2-closed-summary.png}. Browser and API testing were combined; not every intermediate material/check/payment field was manually tapped. Sample GPS/images/signatures do not establish physical installation quality or Android locked-screen acceptance. Those still require an actual handset/site trial.
