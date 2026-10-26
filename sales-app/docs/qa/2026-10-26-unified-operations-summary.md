# Unified Operations summary — 26 October 2026

## Change
Jobs opens one Operations summary: office funds received, actual Sales pay, material payments, callback expenses, installer payments, approved cash balance and tasks. Open an existing job for client and installer balances, material returns, callback work and its next steps. Callbacks open directly, including closed callbacks with pending money.

Shared office funds and weekly Sales pay are shown once at office level. Job payments are subsets of the same cash ledger, not extra costs. Fund requests, supplier order estimates, stock movements and callback source logs do not create extra cash totals. Waiting payments are separate from approved amounts. Repeated source keys count once; conflicting source rows are excluded with a warning. No records are edited by this summary.

## Evidence
- Full portal verification: 697 passed, zero failed.
- Seven new behavioral tests cover canonical source deduplication, conflicts, approved versus pending totals, office/job separation, closed callbacks with pending costs, role denial, safe text, exact callback navigation, mounting and immutable inputs.
- Actual isolated fictional phone UI: 390px summary shows UGX350,000 approved funds (including UGX100,000 opening funds), Sales15,000, materials150,000, callback20,000 waiting, approved balance185,000. Office cash book opens without a leftover job filter and shows the same185,000 balance.
- Existing DEMO Simple Journey job shows approved material150,000 and pending callback20,000; no shared Sales pay copied to the job. Closed callback opens directly from its summary. Client balance5.28m and installer balance350,000 remain unchanged.
- 320px viewport: no horizontal overflow. Screenshot inspected: output/audits/unified-summary-20261026/office-summary-phone.png.
- Existing access rules stay in force; summary builders deny Sales, Team Lead and Installer. No new backend endpoints or expanded permissions.

## Boundaries
All interactions used isolated fictional data. No actual money transfers or production record changes. Phone viewport testing does not establish physical Android or TalkBack acceptance. Exact live source/assets and unauthenticated API denial are checked separately after release.
