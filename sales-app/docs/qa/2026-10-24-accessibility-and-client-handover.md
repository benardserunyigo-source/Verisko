# Verisko portal: accessibility, simple use and delivery audit

24 October 2026. Released v130. Scope: Sales contact → shared visit queue → quote → approved payment → materials → installer → Operations approval → client sign-off.

## Assessment

The linked workflow passes the automated checks and the browser checks below. The audit found and fixed gaps at client handover, keyboard access, contrast and small-phone layout. It is suitable for an actual-phone pilot. This is not a WCAG conformance certificate or proof that a real installation, client signature, monitoring test or staff phone has been accepted.

No real customer, staff-access, financial or supplier records were changed. Prices, commissions, financing, warranty terms and tracking policy are unchanged.

## Findings and fixes

| Priority | Finding | Result |
| --- | --- | --- |
| High | Verisko staff acknowledging the installer’s demonstration was not a named client acceptance record. | Operations/Admin now use **Jobs → Job records → Client sign-off** after technical approval. Record the client/representative, role, actual date, agreement method and form/message/meeting reference. Five final checks cover cameras, recording/playback, phone viewing, training and delivery of login/warranty information. No passwords belong in this form. |
| High | Final checklist was checked in the browser, but the quote API did not enforce it. | The server now rejects a new Handed over status without the checks and acceptance record. The linked installation must exist and be approved; changing the job status alone cannot bypass this. Server supplies who recorded it and when. |
| High | A later old-device save could undo a new acceptance. | Saved acceptance, its checklist and finalized stage survive stale saves. Changes to the original acceptance record are refused. Historical closed jobs are preserved without inventing client consent. |
| Medium | Keyboard Tab could leave the custom sign-in overlay and reach the background page. | Sign-in and welcome overlays now contain focus and make the background inert. Tested Tab from the last sign-in action returns inside the sign-in form. |
| Medium | Some notes had only placeholders; installation dialogs lacked a programmatic title. | Added visible labels for follow-up/confirmation notes and a labelled installation dialog. Form errors receive focus. |
| Medium | Camera count radio buttons lacked arrow-key selection. | Added Arrow keys/Home/End and one tab stop per group. Actual browser check changed 4 → 6 with ArrowRight, updated selection and retained focus; no quote was saved. |
| Medium | Secondary text and active navigation were too faint on tinted backgrounds. | Darkened shared secondary/accent colours, strengthened form boundaries/focus and added a colour-contrast regression test. Final measured screens had no normal-text contrast failures in the inspected DOM sample. |
| Medium | Long Installer photo/problem labels caused 361px of document width at a 320px viewport. | Buttons wrap within the card. Camera checks, materials and Finish & send now measure 320px at the 320px viewport. Expand/collapse controls have larger tap areas. |
| Medium | Existing job editing depended on clicking a card, and its installation link opened the general list. | Added an explicit **Edit job** button. **Open installation checks** opens that exact linked installation. |
| Medium | The older job editor asked again for installer/material records already stored in the installation. | Linked installations use their saved installer and materials. The editor keeps historical values without silently clearing them. Older manual technician tools are collapsed under **Older job tools**. Agreed pricing details are collapsed when locked. |

Client sign-off is a staff-recorded acknowledgment with a reference to the client’s agreement. It is not a client-authenticated electronic signature, a new contract or an automatic message to the client. A signed form or message must actually exist when that method is selected. An unavailable or dissatisfied client must stay unsigned; technical approval alone leaves the job Installed.

## Whole-job coverage

| Step | Owner and required result | Audit result |
| --- | --- | --- |
| Save contact | Sales saves contact, status, next action and follow-up once. | Own-contact access and duplicate-phone checks pass. Operations sees prospecting; another rep cannot. |
| Interactions | Sales and permitted office staff add notes/voice on the same contact. | Access, attribution, stale writes and recording lifecycle pass automated tests. Real microphone/speaker acceptance remains open. |
| Ready for visit | Sales selects the existing contact and adds visit context. | Shared Team Lead/Operations queue; no second client. |
| Ownership | Office person takes or assigns the lead. | One owner, simultaneous-claim protection, reason required to return. |
| Site visit | Owner confirms/reschedules/completes the same visit. | Reasoned rescheduling, shared progress and once-only qualifying visit pay pass. Job start/finish and location are separate from visit completion. |
| Quote | Operations records the quote for this client and marks it sent. | Other-client quote links rejected. Locked accepted pricing retained; public customer PDF excludes internal costs/profit. Sending is a separate staff action. |
| First payment | Office records; Admin approves. | Pending/rejected money earns no commission; first approved payment adds UGX 100,000 once. Recording is not a transfer. |
| Plan and procure | Operations uses the paid client’s same quote/materials plan. | Plan/request/order/partial/full arrival gates pass. Supplier references remain office-only. Recording an order does not place it with a supplier. |
| Offer installation | Materials ready, site staff, fee and camera positions. | Same list and client reused. Installer must accept; decline/reassignment and pending-work gates pass. |
| Work | Assigned installer starts/finishes and completes camera/cable tests/photos. | Required route/mount/fixings/entry/view evidence, test results, join exceptions and two location marks are checked. An unrelated installer cannot read the job. |
| Stock return | Installer counts used, damaged, missing and left; Operations receives returns. | Quantities reconcile; unreceived required returns block approval. |
| Review | Operations/assigned reviewer checks evidence, returns with a reason or approves. | Installer cannot self-approve. Missing checks and unresolved returns block completion. Original job becomes Installed. |
| Client handover | Operations/Admin shows the system and records the client’s actual agreement. | New API and browser tests cover required checks, care references, date/identity, preservation after reload/stale saves and role boundaries. Job becomes Handed over; Sales/Team Lead see Client signed off. |
| Care and balance | Keep payment balance and approved care terms visible. | Handover does not pay balances, add commission, change quoted total or activate monitoring. Existing 12-month care/24-month fault warranty dates and recorded mini-PC alert-test reference are retained. Actual site tests remain required. |

## Role access and simple navigation

- **Sales:** own contacts, follow-ups, site-visit progress, package prices, earnings and shifts. No buying, installer pay, internal costing, acceptance references or other reps’ private contacts.
- **Team Lead:** shared ready queue/ownership/visits, their contact work and assigned site reviews. No internal costing, buying or final client-acceptance editing.
- **Operations:** contacts, visits, costs, buying, installation assignment/review, stock, recorded installer payments and client handover. First client-payment approval remains Admin’s action.
- **Installer:** assigned installation, site staff, agreed own fee/balance, checks/photos, material usage and Start/Finish. No Contacts tab, client money, office procurement or approval rights.
- **Admin:** workspace rules, finance approval and access oversight; accepted commercial terms and historical evidence keep their server protections.

Sales/Team Lead/Operations retain Home, Contacts, Jobs and More. Installer has Home, Jobs and More. Server handler tests, rather than menu hiding or role previews alone, establish the tested permission boundaries.

## Verification

**501 automated tests passed, zero failures.** Five added cases cover acceptance requirements, the extended full journey, Uganda-date handling, no-approved-installation/installer forgery rejection and actual colour contrast. Existing tests continue to cover permissions, photos/audio, payment approval, commissions, assignment, stock, offline queues and installation review.

The extended real-handler test runs Sales contact through approved installation and client handover with fictional accounts/in-memory stores. It verifies the same client/job/deposit, unchanged quote/payment records, stale-save recovery, private acceptance references and unrelated-user denial. No production credentials or real client data are used.

Browser checks at **320px** and selected **390px** phone widths:

- Sales home and contact form; Team Lead shared queue.
- Operations job records, linked-job editor, the exact linked installation and client sign-off form.
- Installer home, assigned camera checks, material count and Finish & send.
- Sign-in Tab containment, camera-count ArrowRight, missing-check error focus, direct installation navigation, no hidden required handover fields blocking ordinary quote forms.
- Completed a fictional client sign-off through the actual form, reloaded and confirmed Handed over, 5/5 checks and the client’s recorded reference.

Final checked screens had no detected unnamed visible fields, undersized direct-control targets or normal-text contrast failures in the DOM measurements; document width matched the phone viewport. This targeted inspection is not an exhaustive automated accessibility scanner or screen-reader certification. CSS measurements do not prove every content state.

Independent local API readback: one client, visit, quote, approved deposit and installation; 22 saved photo records; Completed technical installation plus Handed over commercial job; Sales/Team Lead see Client signed off while the acceptance evidence remains office-only. The originating Sales account also saw this final status and completed tick through the actual local UI after signing in. Quote/deposit remain unchanged.

Evidence: `/Users/ben/Verisko/output/audits/accessibility-handover-20261024/` (`verified-records.json`, `accessibility-screens.json`, `client-signoff.jpg`, `client-signoff-phone.jpg`, `sales-client-signed-off.jpg`). Measurements include the initial failures and final corrected results. Role previews are fictional and view-only; the handover test uses local authenticated fixture handlers, not production staff authentication.

Accessibility reference: [W3C WCAG 2.2 quick reference](https://www.w3.org/WAI/WCAG22/quickref/) for contrast, reflow, labels, keyboard access, focus, status and target sizes.

## Remaining acceptance and recommendations

1. **Actual Android phone:** install the 0.3.0 pilot and test real phone/PIN access, GPS consent, locked-screen active tracking, pause/resume/checkout, offline recovery, camera upload and voice playback. No handset success claim yet.
2. **TalkBack and real users:** test reading order, controls, error announcements and photo handling on the team’s Android phones, including a user who needs larger text. The browser keyboard tests do not replace this.
3. **Accessible media:** recorded audio may lack an equivalent text version. Staff should add useful written interaction notes; audit actual training video captions and text alternatives before claiming full WCAG compliance. No private historical recordings were fetched or automatically transcribed in this audit.
4. **Actual installation/client evidence:** staff must carry out the camera, cable, client training, monitoring and handover checks. Saved checkboxes/references do not prove physical quality, an authentic client signature, a live mini PC or a supplier purchase.
5. **Client self-signing:** not included in this release. The existing staff portal records acceptance and references the client’s form/message/meeting. A client-facing signing portal would be a separate workflow.

These limits remain visible. Do not label the whole system fully field-accepted or accessibility-certified until the relevant checks pass.

## Release

Release `e5b0782dfa88bc3e5d2abb8ad361a1b616bce4c3` reached Netlify ready. Five affected frontend files (`app.js`, `app.css`, `client-handover.js`, `installer-ui.mjs`, `ready-leads-ui.mjs`) returned HTTP 200 with hashes matching the tested files. HTML references v130 and the new handover module. Data, ready-leads, installer, voice-notes, client-work and field-shifts APIs all returned JSON 401 without a session. The public fictional Operations preview loaded with no console errors.

Readback: `output/audits/accessibility-handover-20261024/release-readback.json`. This confirms publication and unauthenticated boundaries. It does not claim production staff-authenticated or actual Android acceptance.
