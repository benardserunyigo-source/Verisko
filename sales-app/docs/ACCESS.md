# Who can use what

Current policy: v106, October 22, 2026. These rules are enforced by the server as well as the screens. Existing staff roles are preserved; this update does not promote or remove anyone.

| Role | Can see and do | Cannot do |
| --- | --- | --- |
| Admin | Full workspace, company rules, costs, profit, cash approval, team access and export settings. | Remove or change the protected first owner through a normal roster save; approve their own ID. |
| Operations | All contacts and follow-ups, quotes and costs, job assignments, installer fees and payments, materials, field shifts, applications and daily cash entries. Manage Sales, Team lead and Installer accounts. | Grant Admin, Operations or Supervisor access; manage those accounts or their ID records; change company pay rules; approve cash or alter approved cash; see the export key. |
| Team lead | Shared sales prospects, visits, qualification work, limited job/deposit summaries, own saved leads and training, public package prices. Invite Sales staff and submit pending deposits. | See another person's private saved lead, internal job costing, expenses, installer jobs/pay, staff ID records or company settings. |
| Sales | Own contacts, visits, follow-ups, earnings, training and field shifts; public package prices. | See other people's contacts or earnings, internal costs/profit, expenses, staff IDs, installation work or access settings. |
| Installer | Assigned jobs, site staff contact, checks, evidence, material use/returns, own agreed fee and payments. Record start and finish with location. | See another installer's pay or unrelated jobs; set assignments, approve work, record payments or receive stock into the warehouse. |
| Supervisor | Only installation jobs explicitly assigned for review, their technical evidence and review/return/approval actions. | Create or assign jobs, complete installer checks, see crew fees/payments, change materials or browse the sales workspace. |

Operations and Admin automatically review all installation jobs. In a job's setup, Operations can select named Supervisors who may also review that job. Installers complete the checks; reviewers check the evidence and return or approve the work.

## Controls checked

- Roles come from the current server roster. Unknown roles are refused. The system checks live roster and session-revocation data on each online request.
- Main workspace responses are limited by role. Staff profiles use an explicit field list; PIN secrets and identity photos are not included in roster responses.
- Phone and email account management use the same privilege limits. A removed or demoted invite issuer cannot leave a privileged invitation usable.
- Photos require access to the linked record. A guessed photo ID does not grant access. Sales cannot attach a finance photo to a contact to gain access to it.
- Supervisors need a named assignment. Installer checks and review actions have separate server permissions. Installer payment privacy is applied before a response leaves the server.
- Cash approval and approved entries are protected from Operations edits. Only Admin can allow receipt-free expenses.
- Sign-out clears the main workspace and photo cache on that browser. Old responses are ignored after an account switch. Installer queues remain separated by account, with a warning before discarding unsent work.

## Limits to remember

A phone that is offline cannot receive a role change or account removal until it reconnects. Previously downloaded information cannot be recalled from screenshots or exports. Use a screen lock and sign out on shared devices.

The existing spreadsheet integration uses a separate read-only export key. Whoever holds that key can read exported workspace data independently of their app role. Only Admin can see or rotate it in Settings. Rotate it when an integration or trusted key holder loses access; then update the approved spreadsheet connection. This audit preserves the existing connection and does not rotate that key.

The installation demo uses fictional records in the browser. Its role preview does not grant access to real jobs.

## Verification

Automated tests cover all six roles, forged writes, staff privilege escalation, photo access, hidden lead references, supervisor assignments, payment privacy and account/session boundaries. Browser checks use fictional Sales, Operations and Supervisor accounts. No real staff account is changed for testing.
