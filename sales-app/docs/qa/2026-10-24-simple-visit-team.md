# Simple Operations and Team Lead visit pages

24 October 2026, v133.

## Change

Operations and Team Lead Home now start with New requests and With me, each linking to the matching request filter. Next visits stays short. Installations, materials, installation alerts and the Operations active-work dashboard stay available under Other work. Team Lead no longer lands on the Sales prospecting start card. Required ID notices and existing shift controls remain.

Contacts opens Visit requests first for both roles. The page has three count filters, search by name/phone/area and refresh. A request shows the saved name, area, salesperson, current handler and saved note. Take contact is the visible action on a new request. Taking switches to With me and exposes Confirm visit, Call contact and Send back to Sales. Confirmation uses the existing short date/time form. Returning still requires a reason and uses the same contact/case. A booked visit shows its Uganda date/time, visit completion and start/finish controls. Later quote/payment steps, assignment, previous-person return, voice, time/location, full progress and history remain under More details. No backend permissions, pay, finance, visit, warranty or tracking rules changed. Admin and Sales retain their own page variants.

## Verification

Full verifier: **526 tests passed**. New tests cover matching Operations/Team Lead take/confirm/return steps; no action for a contact handled by someone else or for Sales; retained quote/payment steps; no return after received money; new/own count rules; held visit reconfirmation; completed installation status; visible next action with later details collapsed; escaped notes; and request-first navigation without wider Team Lead access. Existing API role, concurrent ownership, reason, return/resend, appointment, pay and full-journey tests still pass.

Local real-handler browser reused only fictional DEMO Kato Shop. Operations opened New requests from Home, took the contact, confirmed Monday 26 October at 10:00, and returned it with a reason. Empty reason was blocked. Sales resent the same contact. Team Lead opened New requests, took it, confirmed the same visit at 11:00, and returned it with a reason. Sales resent again; Operations took it for the final phone check. Readback retained one contact, one request and one appointment ID; zero payments. History records each actor. Upcoming returned visits remained on hold until reconfirmed, as in v132.

390px and 320px checks covered Team Lead and Operations request cards and the short confirmation form. Bounded inspection found no horizontal overflow, unnamed visible controls, small visible targets or sampled contrast failures. Console errors were empty. Screenshots and fictional records: `output/audits/simple-visit-team-20261024/` from repository root. No real client, financial or staff account data changed.

## Boundaries

Phone browser testing is not actual Android/TalkBack acceptance or a signed-in production mutation test. The existing Android pilot remains pending. Source changes are presentation/navigation only. The existing server commands enforce all access, reasons, versions and audit events. No messages were sent.
