# Contact to installation audit

Checked 24 October 2026, Uganda time. Released v128, source commit `4d7d1e2239b83b331ad14ca94d7d75a34a13b4a9`.

## Result and fix

The existing contact-to-approved-installation journey passes the real-handler tests with fictional accounts and in-memory stores. One workflow gap was found: a confirmed queue visit had no date/time change action. The current owner or Admin can now choose **Change visit time**, enter the new agreed date/time and a reason, and keep the same appointment. Sales sees the new time and history. Completed visits stay fixed. Repeating a request does not duplicate the history or visit, and an older workspace save cannot undo the change.

The full app suite passes **492 tests**. This includes the full journey, five-role access controls, workflow rejection paths, offline queues, private evidence and the new rescheduling regression cases. These results are isolated QA, not a claim that real staff used production successfully.

## Coverage map

Test paths below are relative to `sales-app/tests/`.

| Step | Verified outcome | Evidence |
| --- | --- | --- |
| Save contact and follow up | Sales owns its contact; Operations can see prospecting contacts; private unsent contacts stay outside another rep/Team Lead's scope. Duplicate contact creation is rejected. | `full-journey.test.js`, `lead-pipeline.test.js`, `scope.test.js`, `access.test.js` |
| Submit for visit | Saved client reused. Both office roles see the shared queue; requesting does not earn visit pay. | `ready-leads.test.js`, `helpers/journey-steps.mjs` |
| Ownership | One simultaneous claim wins; non-owner cannot hand it on; a send-back needs a reason. | `ready-leads.test.js` |
| Confirm/change/complete visit | One linked appointment, new date/time and reason visible to Sales, no pay before completion, UGX 15,000 once after completion. | `journey-audit.test.js`, `ready-progress.test.js`, `ready-leads.test.js` |
| Quote | Quote belongs to same client; other clients' quotes cannot be linked. Record-sent does not send a message or generate payment commission. | `full-journey.test.js`, `ready-leads.test.js`, `quote-guard.test.js` |
| First payment | Office owner records, Admin approves; Sales sees state and UGX 100,000 once. Pending/returned payments earn none; private references remain hidden. | `ready-leads.test.js`, `sales-pay-policy.test.js`, `job-finance.test.js` |
| Materials and buying | Approved paid work only; save/request/order/partial arrival/full arrival. Source and job reused; Sales/Team Lead get progress, not buying controls or supplier evidence. | `materials.test.js`, `materials-assignment.test.js`, `full-journey.test.js` |
| Installer offer | All planned materials arrived; agree pay, site staff and camera positions. Acceptance/decline and reassignment keep one installation; pending/declined work cannot start. | `materials-assignment.test.js` |
| Work and evidence | Assigned installer saves cable/mount checks, required uploaded photos, live/recording/playback/coverage/phone tests and start/finish. Other installers cannot read the job/photos. | `installer.test.js`, `installer-completion.test.js`, `active-work.test.js` |
| Count and return stock | Issued, used, damaged, missing and left quantities reconcile. Only Operations receives warehouse stock. | `installer-materials.test.js`, `installer-completion.test.js` |
| Send/review/correct/approve | Missing checks/photos/finished time block submission; installer cannot self-approve. Required returns block completion. Returned camera check needs a reason and corrected evidence on the same job. | `installer-completion.test.js`, `full-journey.test.js` |
| Progress and pay | Sales sees installation approval without internal supplier/cost records. Same client, quote, payment, plan and installation remain linked. Installer sees own fee, recorded payments and balance only. | `full-journey.test.js`, `installer-pay.test.js`, `journey-audit.test.js` |
| Voice notes and role navigation | Authorized workers share the same contact audio; unrelated contacts/media denied. Role menu and server access are tested separately. | `voice-notes.test.js`, `navigation.test.js`, `access.test.js` |

## Phone browser checks

Used local HTTP handlers and fictional Sales/Operations/Installer accounts. The local login fixture is not a production authentication test. No real contacts, client money, staff access or supplier messages were changed.

- At 390 × 844: Sales saved a new contact, expanded it, tapped Ready for site visit and submitted the pre-selected saved contact. It appeared in Client progress as unassigned.
- Operations changed the existing client's visit from 10:00 to 14:30 with a reason. Sales signed in and saw 14:30 on the same client. No Operations editing/payment/approval controls were shown to Sales.
- Installer opened the existing assigned job and its camera checks/materials. It showed the Verisko site staff contact, agreed UGX 350,000 pay and balance; no Contacts tab or office buying/finance controls.
- Document width matched the 390-pixel viewport on the checked Sales, Operations queue and Installer screens. The new form fits within the phone width.

Screenshots: `/Users/ben/Verisko/output/audits/full-app-20261024/` (`change-visit-phone.jpg`, `sales-progress-phone.jpg`, `installer-job-phone.jpg`, `installer-materials-phone.jpg`). These are fictional local QA records, not production evidence.

## Remaining acceptance

Actual Android handset acceptance remains pending: real permission prompts, locked-screen shift tracking, offline reconnection, microphone/speaker and camera/gallery. Production authenticated cross-device use is a separate check; this audit does not impersonate real staff or create production test accounts. Recording payments and buying activity in the app does not make bank transfers, order goods or notify clients automatically.

## Deployment readback

Netlify reported ready for the exact release commit. Deployed `app.js` and `ready-leads-ui.mjs` hashes matched tested local files; HTML referenced v128. The hosting service inserts its own comment into HTML. All five checked workflow APIs returned JSON 401 without a session. The production Operations sample preview loaded without console errors. This verifies publication and public authentication boundaries, not authenticated production staff acceptance.
