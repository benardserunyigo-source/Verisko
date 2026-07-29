# Installations module — CCTV job management (Operations)

**Owner:** Operations Director (+ Owner/Technical). Sales have no access.
**Status:** Phase 1 design, agreed 2026-07-28.

## Purpose
Let the Operations Director run CCTV installation jobs end to end: create a job
(from a verified closed sale or standalone), schedule it, assign a technician,
and track it through a status pipeline. Technicians are onboarded as a managed
roster (no login yet).

## Data model (new shared records in the app-data blob)
```
installation = {
  id, prospectId,                 // link to the closed-sale prospect (or "" standalone)
  business, contact, phone, location,   // client + site (snapshot; editable)
  status,                         // Quoted | Scheduled | In progress | Installed | Handed over | Cancelled
  scheduledDate, scheduledTime,
  technicianId,                   // assigned technician (roster) or ""
  quote,                          // UGX quoted amount (wired to the float in Phase 3)
  siteNotes,
  createdBy, createdByEmail, createdAt
}
technician = { id, name, phone, skills, active, createdAt }
```

## Rules / enforcement
- Only Operations + admins (`canInstalls()` = ops or admin) may read/write
  installations and technicians. The server (`data.mjs`) reverts any change
  from a non-reviewer, same pattern as the roster/prospect-audit rules.
- A closed-sale prospect (Operations-verified) can be turned into an
  installation in one tap, pre-filling the client fields. Standalone jobs are
  also allowed.

## UI
- **Nav:** the bottom bar keeps 4 primary tabs (Today, Dashboard, Prospects,
  Visits) plus a **More** sheet holding the Operations/admin extras
  (Cash flow, Installs, Settings). Sales see no More.
- **Installs screen:** status filter + job cards (client, site, status,
  date, assigned tech), a "New installation" action, and a **Technicians**
  card to onboard/edit/deactivate techs.
- **Job form:** client fields (+ optional prospect link that pre-fills),
  status, schedule (date + time), technician select, quote, site notes.

## Out of scope (later phases)
- Phase 2: per-job bill of materials (items, qty, cost).
- Phase 3: payments (quote / deposit / balance) posting into the cash-flow float.
- Before/after install photos; technician logins.
