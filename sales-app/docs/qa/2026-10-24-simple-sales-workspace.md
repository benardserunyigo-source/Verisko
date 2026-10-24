# Simple Sales workspace: 24 October 2026

## Approved change

Sales has four main buttons: Home, Contacts, My work and My pay. Home shows Save a contact, own contacts, this week's earned pay and Monday pay date, returned contacts with reasons, and today's follow-ups. Returned contacts are not repeated in the due list. Home caps returned rows at three and other due rows at five, with links to the full list. Existing shift check-in stays visible; its phone controls wrap clearly. Sales onboarding uses three short role-specific lessons.

Contacts shows the salesperson's own saved and earlier client records together, with search and four plain filters. The visible Send for site visit button uses the saved record, saved next action/notes and current queue version. It opens no extra form. While sending, the button is disabled; retry IDs and server idempotency protect against duplicates. Failed sends show an error rather than claiming success. Returned contacts show why, offer follow-up, and use Ready again to resend the same contact. Extra contact notes and detail stay collapsed. My work focuses on sent contacts, progress and shifts; the normal Sales navigation no longer exposes duplicate legacy prospect/booking entry points. Earlier routes remain supported. My pay is one primary tap away; pay rules stay collapsed, help videos and package prices remain available.

Operations or an assigned Team Lead can use **Send back to Sales** with a reason. This is separate from returning ownership to the previous office person. The receiving salesperson can follow up and resend. No duplicate contact, case, visit or pay event is created. An upcoming visit returned to Sales leaves the active schedule until the office confirms a day/time again. The same visit ID is reused; it cannot be marked done while on hold. A confirmed or completed visit stays on the same case; if a completed visit is returned and then resent, it remains completed and cannot be completed again for pay. The office can continue from that existing assessment when the client is ready. This does not create a second payable visit or cancel a past visit. Received money, buying or installation prevent return into prospecting. The original salesperson and history remain protected.

## Verification

**519 automated tests passed**, zero failures. New tests cover one-request sending from saved context, creator ownership, returned converted contacts, version reuse, safe display of reasons, already-sent/account-change denial, direct navigation, explicit return across office ownership, required reason, unauthorized return denial, return after a completed visit, same-visit resend/quote continuation, refusal after payment, and unchanged once-only UGX 15,000 completed-visit earnings. Existing full-journey, payment, client-handover, offline, voice, location and role tests still pass.

Local browser used real handlers, isolated in-memory stores and fictional accounts. Sales saved DEMO Kampala Pharmacy once, sent it with one tap and no dialog; Operations saw the same record, took it, could not return without a reason, and returned it with a reason. Sales Home highlighted it; the returned filter showed the reason and one-tap Ready again action. Sales saved a follow-up, resent, and saw the same case in My work. Readback: one contact, one request, one follow-up, zero appointments/payments, canonical four-event request/take/return/resend history. No real customer, account or money record changed.

Phone checks at 390px and 320px covered Home, contacts, short contact form and pay. Bounded DOM checks found no horizontal overflow, unnamed visible controls, small visible targets or sampled text-contrast failures. Console errors were empty. Check-in banner text/buttons wrap rather than squeezing into a narrow column. Help, prices, voice and start/finish visit controls remain accessible. Evidence: `output/audits/simple-sales-20261024/` from repository root.

## Boundaries

No changed pay policy, customer prices, account privileges, warranty or tracking policy. Sales still sees only its own clients and pay; office financial data stays protected. A browser test is not real Android/TalkBack or authenticated production acceptance. Existing Android pilot remains pending. No supplier/client/staff messages were sent.

## Release

v132 `e9d77cd2bbc9249393c5e047c166e84dc3c8a03f` reached Netlify ready. HTML references v132 and the new Sales workspace module; five affected frontend hashes match the tested local source. Six private APIs deny unauthenticated requests with JSON 401. Public fictional Sales preview opened the new Home and pay page with no console errors; it remains view only and is not authenticated role acceptance. Saved release-readback.json records the checks.
