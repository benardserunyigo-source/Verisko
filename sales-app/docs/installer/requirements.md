> Current access update (v111): site supervisor is a job assignment for Operations and Team Leads. There is no separate Supervisor account role. See [ACCESS.md](../ACCESS.md).

# Verisko Installer Module — First-Version Requirements

## Purpose

Help installers complete consistent, reliable CCTV installations and reduce return visits caused by unnecessary cable joins, insecure camera mounting, and incomplete testing.

Build this module inside the existing sales and operations app.

## 1. Users and access

- **Installer:** View assigned jobs, capture evidence, report problems, and submit work.
- **Supervisor:** Assign jobs, approve exceptions, request corrections, and close completed jobs.
- Installers can access only their assigned jobs.

## 2. Job screen

Each job must show:

- Customer name, address, and site contact.
- Installation scope and equipment list.
- Named camera locations, such as “Front gate.”
- Installation instructions and reference images.
- Assigned installers and scheduled date.
- Current status and outstanding actions.

## 3. Checklist for each camera

### A. Cable installation

- Show the rule: **Use a continuous cable run. Obtain supervisor approval before adding a join.**
- Record the planned route and capture photos before the cable is concealed.
- Require the installer to declare whether any joins exist.
- Provide a **“Request a join / Report a cable problem”** button.
- Require a reason, photo, and proposed solution for each exception.
- Reasons include obstruction, damaged cable, insufficient cable length, changed route, and other.
- Record approved connections and their locations in the final job record.

### B. Camera mounting

- Show an example of acceptable mounting and cable finishing.
- Capture close-up photos of the mounting, fixings, and cable entry.
- Confirm appropriate fixings were used for the surface.
- Confirm fasteners were secured according to manufacturer instructions and a safe stability check was completed.
- Capture the final camera view.

### C. System testing

Record a separate result for:

- Live image.
- Recording.
- Playback of a newly recorded clip.
- Coverage of the agreed area.
- Customer remote access, where included in scope.

Failed checks require a description and corrective action. Items outside the agreed scope must be explicitly marked as not applicable.

## 4. Exception approval

- Notify the supervisor when an installer submits an exception.
- Let the supervisor approve a method or request a correction, with comments.
- Keep the affected checklist item pending until the decision and required evidence are recorded.
- Allow unrelated work to continue.
- Preserve who requested and approved the exception, timestamps, and supporting evidence.

## 5. Handover and final review

Before submission, require:

- All camera checklists completed.
- Required evidence uploaded.
- Exceptions resolved.
- Customer demonstration recorded.
- Outstanding issues documented.
- Customer handover acknowledgment, or a reason it could not be obtained.

Customer acknowledgment does not replace technical review.

The supervisor must be able to approve the job or return individual items for correction. Only the supervisor can mark a job completed.

## 6. Supervisor dashboard

Provide queues for:

- **Needs a decision:** Exception requests.
- **Needs correction:** Returned checklist items.
- **Ready for review:** Submitted jobs.
- **Completed:** Approved jobs.

Each item must show the job, camera location, installer, issue, and time waiting.

## 7. Mobile and offline use

- Large buttons, short instructions, and minimal typing.
- Capture photos directly against the relevant camera and checklist item.
- Save progress and evidence offline.
- Clearly show pending uploads and successful synchronization.
- Retry uploads without duplicating records.
- Never show an offline request as approved.
- Prevent final submission until required evidence has synchronized.

## 8. Records and security

- Keep a history of submissions, approvals, corrections, and status changes.
- Preserve previous evidence when replacement evidence is submitted.
- Restrict customer information and installation photos to authorized users.
- Do not store camera or customer account passwords in notes or photos.

## 9. Acceptance criteria

The first version is acceptable when:

- An installer can complete an assigned multi-camera job from a phone.
- Missing evidence prevents submission.
- A declared cable join triggers an approval request.
- Pending or rejected exceptions prevent job completion.
- A supervisor can return one camera item without resetting the whole job.
- Offline work synchronizes without lost evidence or duplicate records.
- A completed job contains the evidence, test results, exception decisions, and supervisor approval.

## 10. Pilot and operating rules

Pilot on a few installations before wider rollout. Track return visits, cable replacements, correction requests, and installer completion time.

Before launch, Verisko must define acceptable cable methods, weather protection, mounting examples, and who covers approvals when the primary supervisor is unavailable.

Photos and confirmations support review; occasional on-site inspections remain necessary to verify concealed work.