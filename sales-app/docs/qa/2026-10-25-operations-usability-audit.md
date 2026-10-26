# Operations audit and proposed redesign

25 October 2026. Scope: daily Operations work from Sales contact to client acceptance and financial closeout. This is an audit and proposal, not a released redesign.

## Verdict

The main workflow is connected and guarded, but the interface still follows the software modules more than the operator’s next task. Operations must understand which of several pages owns the next step. Simplify around one job and a short action list. Fix misleading summary and cash information before adding visual polish.

## Evidence and limits

- Inspected the actual isolated Operations app on port 4466 at phone width, using the existing fictional DEMO End-to-End Shop/J-2026-0001. Opened Home, owned visit queue, job summary, materials, installation review, job record/edit form and Cash flow. No records were saved or changed.
- Cross-checked the deployed Operations sample preview, including Inventory. Preview is view-only fictional data, not authenticated production acceptance.
- Ran 188 targeted checks in two groups of 94, all passing: complete journey, ownership/return, receipt approval, saved plan approval, warehouse allocation, installer evidence/pay, client fixes/sign-off, access, job/shift time, voice and Sales pay. These check handlers/models; they do not establish that every action is easy for a new operator.
- Reproduced a previously uncovered warehouse-summary error with a minimal fictional record. Results in `output/audits/operations-usability-20261025/warehouse-summary-repro.json`.
- Live access and full 654-test release evidence remains in the separate team-readiness audit. It is not represented as a second full-suite run here.
- The old isolated payment fixture does not supply the full inventory endpoint: its Inventory screen stayed loading. Live sample Inventory loaded normally. Do not classify this fixture limitation as a production defect.
- No real-client, stock, account or financial writes. Actual staff usability, TalkBack, interrupted mobile connections and native locked-screen tracking still require a real-phone trial.

## Findings, ordered by impact

| Priority | Observed issue | Operational consequence | Proposed change |
| --- | --- | --- | --- |
| High | Summary ignores the `warehouse` quantity when checking materials readiness and asks for buying if `requestedAt` is absent. A plan with four needed/four held/zero to buy shows Materials arrived=false and Request buying. | Staff may request unnecessary purchases or mistrust the summary. This is a reproduced display/task defect; warehouse allocation itself is guarded. | Use the same readiness calculation as Materials & buying: warehouse held + received covers the need. Call the milestone Materials ready. No buying task when shortage is zero. Test all-stock and mixed-stock summaries. |
| High | The same demo shows installer paid350,000/balance0, while Cash flow has approved out0 and float5,280,000. Installer payments and cash transactions are separate records. | A user can interpret the cash figure as money still available after paying the crew, or manually enter it twice. This establishes a reconciliation gap, not evidence that real money was lost. | Create one explicit link between an installer payment and its cash expense, with a backfill/reconciliation review for older entries. Preserve existing approval rules; never auto-approve or assume an unverified historical payment. Label unreconciled entries clearly. |
| High | Home prioritizes visits; installation decisions, corrections and handover are behind collapsed Other work. | Time-sensitive crew blockers are easy to miss. | Show My actions today first, spanning visits, payment follow-ups, missing materials, installer decisions/reviews and client handovers. Each card states client, owner, what is needed, and one next button. |
| Medium | Signed-off demo remains counted under With me; helper says Arrange or finish a visit. Its Materials page also says Materials ready/Installer accepted after closeout. | Completed work looks active and inflates the operator’s apparent workload. | Default lists to open work. Put finished jobs in a separate Completed filter; retain history and ownership. Use stage-aware labels on materials/installation cards. |
| Medium | Jobs has six sub-pages: Job summaries, Site visits, Installations, Inventory, Materials & buying, Job records. Summary ends with up to seven different action buttons. | Operator must choose a module rather than finish a task. | One job workspace as the main entry point. Offer the next allowed action at the top; keep specialist tools and history below. Preserve existing job/contact/material IDs and old links. |
| Medium | Summary tasks store an action type but render as plain list text; buttons are separate at the bottom. | Staff read what to do, then search for the correct button. | Turn each actionable task into a contextual button. A waiting task should name the responsible role, e.g. Waiting for Admin to approve UGX… |
| Medium | Installation review shows raw ISO technical-approval time and several separate acceptance headings before camera details. Approved work still displays the long disabled test form. | Completion is hard to scan, especially on a phone. | Compact status block: installer submitted, checks approved, client accepted. Use Uganda dates/times. Open full evidence only when needed; highlight failed/missing evidence first. |
| Medium | Job edit contains a second five-item completion checklist alongside installation tests and joint handover. Some checks overlap, while client training/warranty handover are distinct. | Staff may confirm the same fact twice or misunderstand which checklist is authoritative. | Derive camera/testing completion from approved installer evidence. Keep genuinely separate supervisor checks for client training, access and warranty handover once, during joint handover. |
| Medium | Payments opens a page titled Cash flow with Add money, float and reconciled wording. Job record says quote/schedule/run while another page is Job summaries. | Similar labels mean different tasks and require training. | Use Record client payment and Record job expense in job context; keep a clearly named Office cash book for office-wide records. Use Jobs as the main list and Job details for the workspace. Replace float/reconciled with plain wording plus explanation where needed. |
| Medium | Internal comparison, Sales prices and client plan publishing are separate pages. Inventory explicitly does not automatically update approved budgets/offers. | Operations can mistake a draft cost edit or new supplier price for an updated Sales/client offer. | Always show Draft only / Sales price valid until… / Client agreed… with separate Review and publish actions. Do not silently reprice accepted jobs. |

## Journey and difficult-case coverage

| Case | Current evidence | Redesign acceptance |
| --- | --- | --- |
| Sales saves and sends one contact | Same-ID journey and ready-lead tests pass. | Operations sees the existing name, location, Sales owner and notes, without retyping. |
| Two staff take the same request | Concurrent ownership tests pass. | Second user sees Taken by [name], refreshes safely. |
| Client not ready; return and resend | Required reason/history and completed-visit preservation tests pass. | Reason visible on the same contact; one resend action for Sales. |
| Visit confirmation, start/end, completion and quote | Progress ordering and time/location checks pass. | Next action guides Confirm visit → Start visit → Finish visit → Prepare quote. |
| Client chooses a plan | Canonical approval and stale/role tests pass. | Choice is distinct from Ops agreement approval and Admin receipt approval. |
| Pending, returned, later and final receipts | Receipt tests and actual saved demo show correct balance; commission once. | Waiting/rejected reason and responsible approver visible beside the receipt. |
| All stock, partial stock, no stock | Warehouse API checks pass; summary defect reproduced. | No buying request for all-stock jobs; only shortage requested; summary agrees with materials. |
| Partial arrival, stock clash, repeated save | Order/allocation/version/idempotency checks pass. | Item card shows needed, held, ordered, arrived and still missing without arithmetic by staff. |
| Installer accepts/declines | Assignment/journey coverage passes. | Decline reason leads directly to Offer to another installer. |
| Issue, checks, photos, used/left/damaged materials | Completion and return checks pass. | One saved list; missing evidence/counts named; no finish until required work saved. |
| Cable cut/join approval and correction | Installer exception tests pass. | Installer sees the decision/reason; revised route and new evidence stay on the same request. |
| Review, corrections and resubmission | Completion checks pass. | Show only items needing attention, then review revised evidence. |
| Client asks for fixes or is unavailable | Handover tests pass; no invented signature. | Job stays open with named owner and next action; new joint acceptance after repair. |
| Installer payment and final closeout | Pay/balance tests pass; cross-ledger gap observed. | Recorded pay reconciles once to cash expense; signed-off job can still show money/returns outstanding. |
| Role privacy, audio, offline and tracking | Targeted automated checks pass. | Real staff phone/PIN and handset/network trial before field acceptance; no claim that web tracking runs while locked. |

## Proposed simple layout

Operations keeps four main buttons: **Today · Contacts · Jobs · Stock**. Help, applications and infrequent office settings move under the account menu. Team Lead gets only its allowed tasks; it does not inherit Operations stock, costs or cash access. Sales and Installer navigation remains tailored to their roles.

**Today:** a short list of actions, ordered by overdue work and blocked crew first. Filters: Mine / Unassigned. Show waiting-for-others separately. Completed work never appears as urgent.

**Contacts:** new site requests, with one-tap Take contact. Existing contact record holds notes, calls and voice notes. Return requires a reason. Sending again reuses the record.

**Jobs:** one card per existing job. Opening it shows client, owner, stage and one primary next action. Expand Progress, Money, Materials, Checks & photos, or History. Money separates client owed, payment waiting approval and crew owed. Technical approval, client acceptance and financial settlement stay separate states.

**Stock:** free stock, held stock and items needing a count/price check. Hold for a job; buy only the shortage. Supplier evidence, unit price, currency and checked date stay with the item/order; historic job snapshots remain fixed.

## Implementation order and release checks

1. **Correct misleading information first.** Fix warehouse-summary readiness. Design and test the one-payment/one-expense cash reconciliation, including old records without silently changing money or approval. Add regressions for both cases before release.
2. **Make daily work obvious.** Add task-first Operations Home; exclude completed requests by default; link summary tasks directly to the same job/action. State who must act when Operations is waiting.
3. **Bring the job together.** Make the current job summary the workspace; preserve URLs and IDs behind it. Reduce duplicate checklist entry, simplify labels/times and stage-aware read-only completion screens. Keep office-wide cash book separate from job receipts.
4. **Validate with a real operator.** Run new-contact, all-stock, missing-stock, returned-payment, declined-installer, client-fixes and full-closeout tasks on a phone. Observe task completion without coaching. Check 320px/larger text, TalkBack, data loss/retry, offline photos/audio and actual Android tracking. Record device and results.

Release gate: same IDs and no duplicate client/material/payment entry; matching balances across views; no duplicate commission/stock/cash movement after retries; positive/negative role checks; full suite; phone screenshots; exact live release readback. Keep business prices, commissions, terms, warranty and location policy unchanged. No whole-app rewrite or new commercial policy is needed.
