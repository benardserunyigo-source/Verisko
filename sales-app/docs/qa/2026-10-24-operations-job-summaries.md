# Operations job summaries

Added a read-only **Jobs → Job summaries** view for Operations and Admin. The four main buttons stay the same. Search by client, job number or area, then open one job.

Shows saved journey milestones, approved and pending client receipts, saved quote total and remaining balance, net installer payments and balance, material returns, and explicit next steps. Expanding a section reveals payment dates/methods, the agreed client schedule and materials. Existing installation, quote, visit and buying pages remain the action screens. The materials link opens the same client/source directly without re-entry.

Joins records using IDs, never client names. Multiple jobs remain separate. An unallocated client deposit is flagged instead of counted against every job. Case payment projections are deduplicated against the cash ledger. Installer corrections use the existing void-aware payment helper. A missing total does not become a zero balance. Client sign-off does not imply all client installments have been paid. Monitoring is only treated as recorded when its saved confirmation/reference/test evidence exists. Older job stages remain visibly older records, without manufacturing a joint signature.

## Verification

- Full verifier: 539 passed, zero failed.
- Added coverage for linked records, once-only receipt totals, multiple jobs/unallocated cash, pending/query receipts, voided and multi-installer payments, partial returns, unknown totals, fixes/overdue dates, legacy standalone jobs, role guards, escaping, material-link loading and the real contact-to-approval handler journey.
- Operations/Admin navigation only. Sales, Team Lead and Installer are refused before the module fetches data. Existing server permissions/projections remain unchanged; no new backend route or widened account access.
- Local real-handler Operations browser: same signed-off Kato Shop case shows 2m client receipt, unknown quote balance, 350k agreed/paid installer and zero remaining, complete journey and returned stock. Search, refresh, installation link and precise materials link checked. Materials link initially lost the selection during its first load; fixed and regression tested.
- 320px and390px inspection: no horizontal overflow or unnamed visible controls; new summary buttons meet44px. Existing account chip remains38px. No browser console errors. Not a blanket accessibility or physical Android acceptance claim.
- Read-only comparison: workspace data, case records and installation records match the snapshots from before implementation exactly. No new demo records, client payments, installer payments, signatures, privileges or staff messages.
- Evidence: `output/audits/operations-job-summaries-20261024/` from repository root.

Release evidence will be added after exact-source Netlify verification. Authenticated production and physical Android remain separate from fictional local and public-preview checks.
