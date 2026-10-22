# Installer quality module · first pilot

Use the live app's **Installer work** screen. Operations runs approvals. Team Leads can assign themselves as site supervisor and review those jobs. Admin can also review. Site supervision is a job duty, not a separate account role. Installers use phone/PIN invites.

## Operations setup

1. In team management, create a phone setup link with the **Installer** role for each crew member. The crew member completes onboarding and chooses their PIN. Existing technician roster names are not login accounts; invite the actual person first.
2. Open **Installer work → Set up installation**. Select an existing sales job to copy its customer, address, camera count and schedule, or create a standalone installation. Confirm the actual scope and equipment list, name every camera location, and assign installer accounts. This quality record links to the sales job without changing its quote, profit or payment schedule.
3. Open **Pilot standards and approval cover**. Define approved cable methods, weather protection and mounting/finishing instructions. Operations is the primary and backup approval group, per Ben's direction; assign a named duty person internally. Upload an approved reference photo. Confirm the rules for this limited pilot. Unconfirmed standards block final submission.
4. Start with a few jobs. On a real Android phone, test the camera picker, lock/unlock, airplane mode, reload, reconnect, and permissions before wider rollout. Browser simulation is not a physical-device acceptance test.

## Installer workflow

- Only assigned jobs appear. Select a named camera.
- Plan a continuous cable route. Photograph it **before concealment**. Declare joins. Each exception needs a reason, location, proposal and photo. Pending/correction requests block completion, while other work can continue.
- Capture separate mounting, fixing and cable-entry photos, plus the final view. Confirm manufacturer fastening guidance and the safe stability check.
- Record each test: live image, recording, playback of a newly recorded clip, agreed coverage, and remote access. A failure needs an explanation and corrective action. Only remote access outside the agreed scope may be N/A, with a reason.
- Save each checklist section. Photos save directly against the item. The status line shows unsynchronized changes/photos; a successful upload is labelled synced. Previously synchronized images are cached for offline viewing when connectivity permits.
- If returned, upload a new photo and resubmit a revised proposal. After approval, capture the actual approved work, record what was done, and state whether a join was installed or the cable was kept continuous. Approval alone does not resolve it.
- Record the customer demonstration with a photo, outstanding issues (or None), and acknowledgment/name or the reason acknowledgment was unavailable. Do not photograph passwords, sensitive screens or unrelated people.
- Submit when the checklist is clear and all pending work has synchronized. Submission is an online action. The customer's acknowledgment is not technical approval.

## Supervisor queues

- **Needs a decision:** pending cable exceptions, camera, requester and waiting time.
- **Needs correction:** returned camera items and cable requests, instructions and waiting time.
- **Ready for review:** submitted jobs.
- **Completed:** technical approval with reviewer, time and comments.

Operations’ Today screen and Installer work navigation show pending review counts. The review screen refreshes every 30 seconds while open and idle; the app also checks review counts while visible. New exceptions produce an in-app notice. There are no email, WhatsApp, browser-push or background notifications in this version; keep the review queue staffed. Supervisors return one camera's cable, mounting or tests; other work and every older photo remain. Corrected cable/mounting items require new evidence and a resolution note. Only a supervisor may complete a submitted job.

## Offline and access boundaries

- Progress and queued photo bytes are kept in IndexedDB under the signed-in account, not localStorage. Commands have stable request IDs, per-item versions and server compare-and-set writes. Network retries cannot duplicate events or photos; a stale item is held as a conflict rather than overwriting newer work.
- Use the latest Chrome/Android app on HTTPS and one active tab. Browser Web Locks prevent competing tabs from overwriting the offline queue. The first connection must load the app and assigned records before offline use. Do not clear browser data or uninstall with pending work. Signing out warns before removing unsynchronized installer data.
- A conflict keeps the pending change. Review the latest record; remove only that conflicting local command, then re-enter it. Photo evidence already on the server is preserved.
- Assignment and media access are checked on every server request. Installers cannot access the sales/customer workspace or shared receipt endpoint. Team Leads keep their normal sales access and can review only installation jobs they supervise. Offline records reflect the last authorized assignment; a disconnected phone cannot learn of a revocation until reconnecting. Secure the device and avoid shared logins.
- Installation photos live in a private Blobs store and are returned only through the authenticated, job-scoped endpoint. Never store camera/customer account passwords in text or pictures.

## Pilot measures and inspection

Operations records return visits, cable replacements, actual completion minutes and on-site inspection notes. Correction requests are counted from the audit history. Review these after the first few installations. Photo evidence supports review; it does not certify concealed work. Conduct occasional site inspections.

## Implementation and verification

- New private `verisko-installations` store: per-job records, append-only event history and immutable photo objects.
- No existing jobs, staff accounts or customer records are automatically migrated or assigned.
- Node tests cover assignment isolation, photo authorization, evidence gates, join decisions, per-camera correction, technical approval, idempotent retries and stale edits.
- Synthetic browser QA covers assigned-only access, offline checklist + photo persistence across reload, reconnection without duplicate records, and supervisor queues. Physical Android pilot remains required.

## Interactive demo (v100)

Operations/admins can open **Installer work → Open demo installation**. It contains a fictional Kampala shop and two cameras. Start as Operations, assign DEMO Installer and a date, then switch to Installer. Use the sample-photo buttons (illustrations labelled DEMO ONLY), save cable/mounting/tests for both cameras, record handover, and submit. Switch back to Operations to approve or return one camera item. Reset repeats the exercise; Exit returns to real jobs.

The demo reuses the production workflow model and UI, but replaces network calls with a browser-only transport and separate account-partitioned IndexedDB records. No real crew accounts, jobs, notifications, approvals, or billing entries are created or modified. Demo data stays on the same browser. Its placeholder standards and schematic photos are for training, not approved installation instructions.

## Simple job setup and work times (v102)

- Operations chooses common job needs, materials with amounts, and camera places. Use the extra notes box for anything new. Saved needs and materials remain when editing a job.
- Enter the name and work phone of the **Verisko staff member at the site**. Do not use the client phone. The installer API omits old client contact/phone fields, including old records. Old offline copies are replaced at the next sync; historical records are not rewritten.
- Installers tap **Start work** on arrival and **Finish work** before leaving. Each tap requests one fresh GPS reading. There is no installer location watch, timer, or movement tracking. The Android WebView already supports this one-time location permission.
- Operations sees the installer name, GPS coordinates, accuracy, start/finish times in Uganda time, and the server upload time in the record. Offline taps retain capture time and wait in the durable queue. GPS accuracy must be within 1 km; device time may be up to five minutes ahead. Offline taps can upload for up to 30 days. A phone location is evidence of the tap, not proof of productive work.
- New jobs require each assigned installer to record a finished visit before sending for approval. An installer can record further visits. Operations cannot remove an installer while their visit is open. Existing records remain readable without invented attendance; editing job setup or starting work enables the new gate.
- The browser demo uses a clearly labelled sample location and never asks for real GPS. Reset an old demo to see the new site-staff fields. A physical Android test with location allowed is still needed before crew rollout.

## Site materials and warehouse returns (v103)

1. Choose material amounts in job setup. Those amounts become the **Needed** list, not a claim that stock has left the warehouse. Add other items and tools through **Site materials and tools → Add an item**. Units are metres, pieces, sets or rolls. Tools must return; they cannot be marked as fitted.
2. Operations/admin records each delivery with **Record taken to site** or **Send more to site**. Enter only that delivery's amount. Check the full list, including small parts and tools, then use **Confirm full site list**. Job notes are still available for requirements that are not counted items.
3. The assigned installer records total **Used / fitted**, **Damaged** and **Missing** for each issued item. The app calculates the good amount still to return. Metres allow two decimal places; pieces, sets and rolls use whole numbers. Explain damaged or missing items. Installer counts use the existing offline queue; dispatch and warehouse receipts require a live connection.
4. Operations counts and receives actual returns. Partial receipts are allowed. Good and damaged returns are separate; damaged items must not be treated as usable stock. Missing amounts need an Operations note and explicit review. New deliveries require a fresh installer count. Returned amounts cannot be erased by a later count.
5. Installer submission requires the full list checked and all issued items counted. Returns may still be pending when submitting for technical review. Final job approval waits for all returns and missing-item reviews. Operations can use **Ask installer to check amounts** to return an incorrect count, including after submission, without deleting the original count or receipts.
6. **Show → Materials and returns** finds jobs with unchecked lists, counts or returns. Movements record who, when, item, unit, quantity and note. This is a job-specific dispatch/receipt log in the existing private installation store; it does not post quantities to an external inventory spreadsheet or general warehouse balance.

Existing records are not given invented stock movements. Their materials log starts when Operations adds/checks it. Existing structured quantity lines can be suggested as needed amounts; free-text notes must be converted to named items by Operations. The updated browser-only demo starts with 2 cameras, 1 NVR and 100 metres of cable dispatched so the crew/warehouse workflow can be tried safely.

## Agreed installer pay (v104)

- Operations/admin opens the job and selects **Set / update agreed pay**. Enter each assigned installer's whole-job amount in UGX and optional payment notes. For example, notes can state whether transport/lunch are included and when payment is due. No real-job rate is guessed or filled automatically.
- Each installer sees **Your agreed pay for this job**, their own amount, notes, date and the person who set it. The job list also shows their amount. Operations sees each amount and the total for the current crew. Team Leads supervising sites do not receive crew pay values. The API filters payment fields and payment history for every list, single-job and mutation response, not just in the interface.
- New jobs require pay set for every assigned installer before submission. Starting a new work visit requires that installer's agreed rate; finishing an existing visit is not blocked by a missing old rate. Assigning a new installer requires setting their rate. Old completed records are not given invented prices.
- Changes are saved online with per-field version checks, request IDs and amount history. Completed jobs are read-only. An agreed amount is not a payment transaction or confirmation of payment, and does not change the customer quote or automatically post to payroll/accounting. The training demo's UGX 350,000 is an example only.

## Installer payment record and balance (v105)

- Operations/admin selects **Record payment** next to the installer. Enter money already paid, the payment date, method (mobile money, cash or bank), reference and optional note. Mobile money and bank payments require a reference. The balance is the agreed amount minus active payment entries. Partial payments are supported.
- An installer sees only their own agreed pay, paid total, amount left and payment entries. Operations sees records for current and previously assigned installers. Team Leads supervising sites cannot access crew payment values, references or correction notes. Records and cached copies come from the same role-filtered API projections as agreed rates.
- Payment recording stays available after a job is completed, since payment may happen later. Entries are online-only, use stable request IDs, and share the rate-version check to prevent conflicting payment/rate updates. An entry cannot exceed the balance; an agreed rate cannot be lowered below recorded payments. Duplicate active references for the same installer/method/job are rejected.
- Use **Correct this entry** only for an entry recorded by mistake. A reason is required. The correction cancels that entry in the total but keeps the original payment and correction visible. It does not reverse a bank/mobile-money transfer or initiate a refund. Record the correct amount as a new entry if needed.
- The job record does not initiate transfers or automatically post to cash flow/accounting. The demo includes an explicitly fictional UGX 100,000 cash payment against UGX 350,000 agreed pay, leaving UGX 250,000.
