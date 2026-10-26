# Who can use what

Current policy: v111, October 22, 2026. These rules are enforced by the server as well as the screens. Existing staff roles are preserved; this update does not promote or remove anyone.

| Role | Can see and do | Cannot do |
| --- | --- | --- |
| Admin | Full workspace, company rules, costs, profit, cash approval, team access and export settings. | Remove or change the protected first owner through a normal roster save; approve their own ID. |
| Operations | All contacts and follow-ups, quotes and costs, job assignments, installer fees and payments, materials, field shifts, applications and daily cash entries. Manage Sales, Team lead and Installer accounts. | Grant Admin or Operations access; manage those accounts or their ID records; change company pay rules; approve cash or alter approved cash; see the export key. |
| Team lead | Shared sales prospects, visits, qualification work, limited job/deposit summaries, own saved leads and training, public package prices. Invite Sales staff and submit pending deposits. Pick an active installation to supervise and review assigned installation evidence. | See another person's private saved lead, internal job costing, expenses, installer pay, staff ID records or company settings; change job setup or payments. |
| Sales | Own contacts, visits, follow-ups, earnings, training and field shifts; public package prices. | See other people's contacts or earnings, internal costs/profit, expenses, staff IDs, installation work or access settings. |
| Installer | Assigned jobs, site staff contact, checks, evidence, material use/returns, own agreed fee and payments. Record start and finish with location. | See another installer's pay or unrelated jobs; set assignments, approve work, record payments or receive stock into the warehouse. |

Operations and Admin automatically review all installation jobs. Site supervisor is a job assignment. In job setup, Operations can choose Operations, a Team Lead or Admin. Operations and Team Leads can use **Assign me as site supervisor** without changing account roles. Team Leads see a short active-site list (site name, date and status); full checks and evidence appear only after assignment. Installers complete the checks; reviewers check the evidence and return or approve the work.

## Controls checked

- Roles come from the current server roster. Unknown roles are refused. The system checks live roster and session-revocation data on each online request.
- Main workspace responses are limited by role. Staff profiles use an explicit field list; PIN secrets and identity photos are not included in roster responses.
- Phone and email account management use the same privilege limits. A removed or demoted invite issuer cannot leave a privileged invitation usable.
- Photos require access to the linked record. A guessed photo ID does not grant access. Sales cannot attach a finance photo to a contact to gain access to it.
- Team Leads need a named site assignment. Installer checks and review actions have separate server permissions. Installer payment privacy is applied before a response leaves the server.
- Cash approval and approved entries are protected from Operations edits. Only Admin can allow receipt-free expenses.
- Sign-out clears the main workspace and photo cache on that browser. Old responses are ignored after an account switch. Installer queues remain separated by account, with a warning before discarding unsent work.

## Limits to remember

A phone that is offline cannot receive a role change or account removal until it reconnects. Previously downloaded information cannot be recalled from screenshots or exports. Use a screen lock and sign out on shared devices.

The existing spreadsheet integration uses a separate read-only export key. Whoever holds that key can read exported workspace data independently of their app role. Only Admin can see or rotate it in Settings. Rotate it when an integration or trusted key holder loses access; then update the approved spreadsheet connection. This audit preserves the existing connection and does not rotate that key.

The installation demo uses fictional records in the browser. Its role preview does not grant access to real jobs.

## Verification

Automated tests cover all five roles, forged writes, staff privilege escalation, photo access, hidden lead references, supervisor assignments, payment privacy and account/session boundaries. Browser checks use fictional Sales, Operations and Team Lead accounts. No real staff account is changed for testing.

## Admin screen preview (v109)

Admin can open **Account menu → Preview a team role**, or use the same button in **Settings**. Choose Sales, Team Lead, Operations or Installer. Select **Back to Admin** to return to the same account and page.

The preview opens the real app screens in a separate frame with fictional records. It is a view-only screen preview, not an impersonation session or a substitute for server access tests. Buttons that save, send, pay or collect location are turned off. Navigation and record details remain available. The preview holds no real credentials, reads no workspace storage, uses no real API, and stores no work. Switching roles starts a fresh sample view. The installer screen uses the same job/payment projection as real installations, backed by an in-memory sample client.

The launch button appears only for Admin. A direct preview URL can display only public fictional sample data; it grants no access to real records. Server permissions remain unchanged. Automated preview tests cover launcher eligibility, isolated storage, blocked network writes and the installer sample projection.

Team Lead samples show shared sales prospects and their own saved contact, with no expenses or job costing. Their Installer work preview shows an assigned review job, with crew pay and payments removed. All previews keep the same blocked writes and isolated device storage.

## Site supervisor assignment (v110)

Use **Installer work** to choose a site. Operations and Admin can open any job and select **Assign me as site supervisor**. A Team Lead sees **Choose a site to supervise**, then selects the same button. The job shows the named site supervisors. Operations can also choose them under **Edit job setup** or when creating a job. The setup form has an **Assign me** shortcut; press **Save** to keep that selection.

Self-assignment is an online, audited command. It adds only the signed-in person, preserves current supervisors, and does not change their account role. Team Leads gain review access to that job, not crew payment, stock, job setup or pricing rights. Installers and Sales cannot self-assign as supervisors. Technically completed jobs cannot be claimed through the active-site list. Operations/Admin can use **Choose site supervisor** on a completed installation awaiting client handover; this audited assignment preserves the crew, pay, materials and checks. Accepted client handovers cannot be reassigned. Version checks protect against stale setup saves.

The separate Supervisor account role and preview were removed in v111. Active account roles are Admin, Operations, Team Lead, Sales and Installer. Live roster inspection found no Supervisor accounts needing migration. Historical site assignments and review history are retained.

## Full journey check, 22 October 2026

The integrated test creates a fictional contact through the main data API, routes it through the shared queue, confirms/completes a visit, saves a priced quote, records and approves payment, orders/receives materials, assigns the installer, uploads photos, submits checks and material counts, receives returns and approves the installation. It calls the real handlers against in-memory stores; it does not write real customer data or test real staff credentials.

The run checks one client, one visit, one first payment, one quote, one materials plan and one installation after retries and another Sales save. It also checks shared follow-up notes, duplicate-phone rejection, ownership/send-back reasons, incomplete-material and unaccepted-offer gates, return balances and final approval. A separate three-client run verifies UGX 45,000 visit pay + UGX 50,000 weekly bonus + UGX 100,000 first-payment commission = UGX 195,000.

Gaps fixed during the check:

- Sales and Team Lead now see a small installation-status summary on the existing client. Status reaches **Installation approved**. Crew pay, photos, supplier information and GPS stay in the installation workspace under the existing access rules.
- Recording a quote as sent reuses a quote saved for that client. A single saved quote fills in automatically; several quotes require a choice. A quote from another client is rejected. External quote references remain available when there is no saved app quote.
- Materials changes check the role before checking assignment locks, so Sales and Team Lead receive the proper access denial.

All five roles are checked through the server handlers, including forged actions and unassigned installer access. Local browser checks cover Sales progress and Operations navigation with fictional accounts. Screen previews remain view-only. Android camera/gallery, GPS, offline recovery on the actual phone and production PIN login still require a real-device pilot; this automated run does not establish those results. Voice notes were added in v125, as described below.


## Client voice notes (v125)

Open the saved contact or site-visit request and tap **Voice notes → Record voice note**. Allow the microphone, record your update, then tap **Stop recording**. Listen, add a short note if useful, and tap **Save voice note**. Notes can be up to two minutes. Record your own update after the conversation.

Sales can record and listen on their own contacts. Operations and Admin can access all contacts. Team Lead can access their own contacts and contacts shared through the site-visit workflow. Installers and unrelated Sales staff cannot access the recordings. Saved notes show the staff name and Uganda time on the same contact, and count as follow-up interactions. They do not create another contact. Recordings have no public link; listening requires a current permitted session.

Saving needs an internet connection. If saving fails, keep the window open and tap Save again. The draft stays only in this open window; closing or signing out discards it. Recording stops when the window closes, the app goes into the background, or two minutes pass. Role previews show sample notes with recording and playback turned off.

Automated tests cover access, attribution, retry/concurrent saves, stale contact saves and microphone cleanup. A local browser check recorded a generated test tone through MediaRecorder, saved it and played it back. It used no microphone and no real client data. Test microphone permission, voice clarity and playback on an actual staff Android before rollout. The installed wrapper needs the 0.3.0 pilot APK; Android Chrome can use the website directly.


## Visit and installation time (v126)

Sales, Team Lead and Operations open an existing client and tap **Start / finish visit → Start visit** on arrival. Tap **Finish visit** before leaving. The same client is reused. The server saves start/finish time, staff name and the location from each tap. There is no continuous route tracking from this timer. The timer continues after closing the app because elapsed time is calculated from saved timestamps. Starting and finishing require a connection. If saving is not confirmed, keep the window open and retry or Refresh before leaving.

Start requires a fresh GPS position with accuracy within 150 metres. If GPS is unavailable at Finish, staff can explicitly choose **Finish without location**. That finish is marked missing GPS and never receives a made-up location. One person can have only one running client visit. Each person starts/finishes their own visit; Operations cannot end a colleague's timer. Staff can finish their own running visit after contact reassignment from **Home → Client visit times**.

**Home → Client visit times** shows the history. Operations and Admin can review visits on existing contacts. Sales and Team Lead see their own visit history; Team Lead can start visits on their own or shared contacts. Installers use their assigned installation job instead. The visit API verifies these rules for every request, and retries do not duplicate a start or finish. Precise visit locations are not projected into the general contact data or Sales' view of colleagues. Timer records do not change commissions, payment, visit completion or approval. The existing Sales field shift remains separate and still uses its existing check-in, pause and check-out route tracking.

Installers keep the existing assigned-job Start/Finish and offline queue. The buttons now say **Start job** and **Finish job**. Jobs show each session's time and the person's total; Operations sees total crew time, summed across people rather than claiming it is wall-clock job duration. Locations are saved at the two taps only. Closing a work session does not submit or approve the installation.

Verification uses real handlers with fictional accounts and in-memory stores, plus local browser checks with sample GPS. Actual Android location permissions, accuracy, connectivity and the installed wrapper still require a phone check; no real staff location was collected during development.


## Operations active jobs (v127)

Open **Home → Today → Who is on a job?**. Operations and Admin see all open client visits and installer work sessions together. Each card shows the staff name and role, client, start time, start-location map and GPS accuracy, and elapsed time. Use **Show** to filter by role. Counts cover everyone; the list follows the filter. The dashboard refreshes from the server every 30 seconds while visible; elapsed labels update every second. Refresh checks immediately. A failed refresh is labelled, so old rows are not presented as freshly confirmed.

Rows come from the same client-visit and installation work logs. Finish removes that session on the next refresh. Each installer session is a separate card; the people count counts each person once. Old open sessions and completed installations with a missing Finish are flagged for Operations to check, not silently closed. Start location is where work began, not a live position or proof that the person remains there. Pending offline installer starts/finishes cannot appear until synced.

The dashboard is a minimal server projection. It does not send crew pay, client payments, evidence photos, notes or route histories. Sales, Team Lead and Installer accounts cannot call the team-dashboard endpoint. These roles keep their existing personal/assigned work views. Sample previews have fictional names and locations, with the read-only filter and Refresh available. Tests check mixed-role aggregation, unique people counts, missing GPS, access denial, and real Start/Finish commands entering/leaving the combined view.

## Joint client handover (v131)

Technical approval and client handover are separate. Only a site supervisor named on the installation can record client handover, including Operations, Team Lead or an explicitly assigned Admin. A global review role does not bypass that assignment. Installers submit to Verisko staff and cannot sign for the client.

The named supervisor meets the client at the site, checks the five handover items, and lets the client draw a signature or type their full name on the same phone. The client accepts and the signed-in supervisor confirms. This is an in-person record, not remote identity verification. Saving requires a connection. Only accepted joint handover closes the linked commercial job.

**Fix needed** requires a reason and next action, returns the same installation for correction and leaves its commercial job In progress. The installer records a new repair visit, note and new photo, then resubmits. Technical checks must be approved again before the next client meeting. **Client not available** records why and the next step; the commercial job stays Installed, awaiting sign-off.

Saved signature strokes, typed signature and handover history are returned only to assigned site supervisors. Other authorized installation readers see the result and required next step, not the signature. Sales sees progress only. The source job stores signature-recorded metadata, not signature strokes. Existing historical handovers retain their original records and terms. Version checks and request IDs prevent duplicate or competing acceptance.

## Return to Sales and resend (v132)

Sales has one-tap sending from its own saved contacts. An office owner (Operations or Team Lead) or Admin can explicitly Send back to Sales with a reason, independently of office-to-office ownership returns. Only the original active salesperson/Team Lead receives it. Existing visit IDs, history, original creator and earned pay are preserved. An upcoming visit is removed from the active schedule while returned, and the office must confirm it again after resend. Completed visits remain completed. The original salesperson can resend even after conversion from a saved contact; the same request/visit IDs remain. Received money, buying or an installed job block return to prospecting. Sales cannot take or return office-owned requests. Normal Sales navigation and language are simpler; server scopes and older supported routes remain unchanged.

## Operations job summaries (v137)

Operations/Admin can read joined summaries using their existing authenticated workspace, ready-case and installation endpoints. No new data privilege or backend write route was added. The screen refuses other roles before fetching; existing server projections continue to protect private costs, payments and media. No new browser persistence is added. Leaving the page or switching accounts discards its loaded summary state.


## Client quote links (v139)

Operations/Admin can create or revoke a private client quote link and read its reply. Sales, Team Lead, Installer and unsigned callers cannot issue links or list replies. The public page requires a random32-byte bearer token, held in the URL fragment and sent in a same-origin JSON request. Only its hash is stored. It exposes the quote reference, client business name, customer scope/prices/terms and the saved typed-name plan choice. It does not expose internal costs, phone/address, staff records, other clients, receipts or media. This is a self-reported reply from whoever holds the link, not verified identity or a payment.

Links expire within7days (earlier if an unaccepted quote expires), can be turned off, and stop working after a quote's commercial details/date change or cancellation/deletion. New links replace old ones. Compare-and-swap writes prevent simultaneous replies from overwriting one another; retries of the same reply succeed without duplication. Earlier choices are retained when a revised/revoked link is replaced. Accepted jobs expose only their existing agreed plan; unaccepted checked quotes expose only existing supported plans that pass server pricing/approval guards.

Client choice is saved separately from the protected source quote, client money and funding approval. It appears in Job records and the job summary. Staff review it before accepting a plan; Admin funding approval and actual receipt approval remain required. No customer/staff message is sent automatically. The operator chooses Send on WhatsApp.

## Approve a chosen saved plan (v153)

Only Operations/Admin can review and approve a current saved-option client reply. Staff review the canonical amounts and one first-payment date (the planned job date is filled in when available). The server rechecks the issued/saved/current cost estimate and selected profit target, uses the canonical client choice, and saves one approval with staff/time attribution by compare-and-swap. Browser-supplied prices, ownership or approver details are ignored. Old agreed/delivery jobs, changed/expired replies, stale choices and low-margin plans cannot be approved by this action.

The approved record projects its total, deposit and dated schedule onto the same job in shared data, summaries, Job records and the visit/material workflow. Commercial details and dates are protected from stale/forged workspace writes. Monthly dates use calendar months with month-end clamping; rental shows the first12months and ongoing Verisko ownership. Turning off the public link does not undo the approved agreement. Approval never creates/approves a receipt, earns a payment commission, approves borrowing or skips delivery/funding gates. Sales/Team Lead still receive job progress only; Installers retain assigned-installation access. No real approval was made in QA.

## Inventory (v154)

Only Operations/Admin can open `/api/inventory`, save item costs, supplier quotes and physical stock counts. All other roles and unsigned requests are refused by the server. The separate private store uses version checks, conditional writes and retry IDs; website previews use fictional values with writes disabled. Supplier links require HTTPS without embedded login details. Costs are buying costs in UGX or USD, not client billing amounts. No prices are fetched from a market or published to Sales automatically.

Stock combines an explicit warehouse count with subsequent job arrivals, site issues and usable returns. Damaged returns stay separate. Unknown starting stock is shown as needing a count; negative balances are flagged. Counts anchor existing movements so a reload or retry does not add the same arrival twice. A changed movement snapshot rejects a stale count. Both stock counts and item price checks are due every30days, independently. Supplier quotes also require a fresh check after30days before using their price. Orders keep their original unit-cost snapshot and evidence. Inventory changes do not rewrite agreed quotes, payments, private package budgets or customer prices.

## Warehouse stock on a job (v155)

Operations/Admin may hold usable counted stock against an existing paid job/material line through the private inventory API. The authoritative hold is in the inventory record, projected into the same materials plan. Quantities, source identity, case version, inventory version, current payment and assignment state are checked on the server. No fabricated supplier order or arrival is created for warehouse stock. Non-office roles cannot see stock costs or allocate/release stock.

Free stock is counted warehouse stock less unissued stock already held for jobs, including job-specific supplier arrivals. Holding reduces free stock; issuing reduces physical warehouse stock and consumes the hold. Only an Operations-confirmed usable return adds it back. Unknown opening counts cannot fund new holds. Negative/short counted stock cannot be sent in place of another job's stock. Unused holds can be reduced/released before assignment; assigned jobs keep their existing materials list. Invalid/orphaned holds stay reserved for review, rather than being silently freed.

Inventory writes, ready-lead material writes and installer writes share a conditional lease with guarded writes. This serializes a stock count/reservation/order/issue/return; concurrent actions receive a refresh/retry error instead of allocating twice. A2-minute stale-lease recovery window is longer than a normal request; expired owners cannot write through the guarded stores or release a new owner's lease. Original request replay/CAS guards remain. Main-workspace saves cannot manufacture holds or change private stock records. Existing purchased jobs without a global count retain their prior delivery flow.

## Completed-job callbacks (v165)

Operations/Admin can open callbacks against technically completed installations and assign any active staff member, including themselves. The assigned person can read only that callback, add fix/receipt photos and costs and send the fix for review. Only Operations/Admin can reassign, cancel incorrect costs, return/reopen or close. A callback does not grant access to the underlying installation, full client record or finances. Unassigned users cannot read callback details or photos. Completed-job catalogue and assignment roster are office-only. Existing client sign-off and installation records are preserved. See CALLBACKS.md for cost-log and online-save boundaries.
