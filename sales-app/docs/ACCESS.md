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

Self-assignment is an online, audited command. It adds only the signed-in person, preserves current supervisors, and does not change their account role. Team Leads gain review access to that job, not crew payment, stock, job setup or pricing rights. Installers and Sales cannot self-assign as supervisors. Completed jobs cannot be claimed or reassigned. Version checks protect against stale setup saves.

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
