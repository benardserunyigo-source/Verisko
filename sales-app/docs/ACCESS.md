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
