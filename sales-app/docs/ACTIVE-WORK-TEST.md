# Start and Finish verification

Checked 22 October 2026 (Edmonton) against the v127 app.

| Role | Start shown on Operations dashboard | Finish removed after refresh | Start/finish locations retained | Time retained |
| --- | --- | --- | --- | --- |
| Sales | Pass | Pass | Pass, different coordinates | Pass |
| Team Lead | Pass | Pass | Pass, different coordinates | Pass |
| Installer | Pass | Pass | Pass, different coordinates | Pass |

## Browser check

Separate local staff and Operations sessions used the real app screens and real HTTP handlers with fictional accounts, a single existing client, and sample GPS. This was not the public screen-preview mode.

For each role, the staff user tapped Start, Operations refreshed and saw the staff name, role, same client, exact start-map coordinates and running elapsed time. The staff user then tapped Finish and Operations refreshed to confirm removal. The finished records were read back separately from server storage. Original start coordinates were preserved, finish coordinates differed, and time matched the saved timestamps. Short browser sessions saved Sales 23 seconds, Team Lead 5 seconds and Installer 15.017 seconds. The UI correctly showed “Under 1 min.”

After all three finished, the Operations page was reloaded: people, client visits and installer jobs were all zero. There was still one client, one Sales visit, one Team Lead visit and one installer work session. No job, contact or time entry was duplicated.

The dashboard changes on its next refresh; the existing automatic refresh interval is 30 seconds while the page is visible. Browser verification used the Refresh button rather than claiming a push update.

## Automated checks

Three separate regression tests run the real Start/Finish commands for Sales, Team Lead and Installer. Each advances a controlled server clock by 37 minutes and 19 seconds. The active dashboard shows the correct person, client, original GPS and 2,239 elapsed seconds. Repeating Start and Finish requests creates no duplicates. Finish removes the row. New API reads retain both different locations and the exact elapsed time, including the installer’s capture timestamps.

The full app suite passes: **487 tests**. Existing checks also cover role access, simultaneous starts, missing/old/inaccurate GPS and finishing a client visit without GPS with an explicit missing-location record.

## Scope

No production clients, staff accounts or real locations were changed or captured. These results establish isolated browser and server behavior. Actual Android GPS permissions, real-world position accuracy, offline installer sync and device behavior still require a staff-phone trial. No application code fix was needed during this check.

Evidence files: `/Users/ben/Verisko/output/audits/active-work-lifecycle/`. They include role-by-role dashboard screenshots, the final empty dashboard and `browser-records-verified.json` with the fictional saved records.
