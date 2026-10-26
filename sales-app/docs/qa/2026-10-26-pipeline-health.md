# Deal health and deferred contacts

User approved health tracking and a separate deferred list with reason and follow-up date. Contacts now contains Sales progress counts, health labels with written reasons, stage totals and filters. These are derived from the same scoped contacts and authoritative visit/payment cases. No forecast probability, automatic lost stage, changed commission or price. Shared case contacts are included once even before a normal workspace record is visible to the visit team.

Deferred uses the existing Not ready contact status with a saved reason and valid calendar date. Owner can defer or resume from Contact details; all details and IDs remain. Deferred contacts cannot be sent for a visit until marked Following up, enforced by client and ready API. Existing incomplete legacy contacts stay visible; newly changed deferrals must validate. Empty filtered lists tell staff to clear filters rather than create a duplicate.

710 tests passed. Added real calendar validation, same-ID defer/resume, date/owner-based health, canonical paid precedence, stage deduplication and server request rejection/resume coverage. Existing role and finance tests remain passing.

Isolated real-handler UI: fictional DEMO Future School saved as Not ready, missing reason rejected, future date/reason persisted, deferred filter found it, resumed on same ID, Send for site visit reappeared, deferred again and reopened. Operations sees same reason/date and stage count. Sales and Operations 320px no horizontal overflow;390px screenshots. Existing paid TEST Journey Shop remains paid, amounts and history unchanged. No production data or real accounts modified. Actual Android acceptance remains separate.

Evidence: output/audits/pipeline-health-20261026/. Release readback follows.
