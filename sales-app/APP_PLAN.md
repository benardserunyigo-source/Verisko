# Verisko Sales Visit Planner

## Purpose

Give one salesperson a simple daily tool for finding prospects, following up,
and booking complete site-visit appointments for the Operations Director.

## Sales workflow

1. Add a prospect.
2. Record the contact person, phone number, business type, and location.
3. Understand the customer’s security concern and areas needing coverage.
4. Record the next action and follow-up date.
5. Qualify the prospect.
6. Propose and confirm a site-visit appointment.
7. Hand the confirmed visit to the Operations Director.

The salesperson does not perform technical surveys or prepare official
quotations in this app.

## App sections

- **Today:** follow-ups due, qualified prospects, and confirmed visits.
- **Prospects:** searchable prospect list and qualification form.
- **Site visits:** proposed and confirmed appointments.
- **Settings:** Excel connection, backup, and recovery.

## Data

The shared Excel workbook has two tables: Prospects and Appointments. The
Netlify function connects to the workbook securely through Microsoft Graph.
The browser keeps a local fallback copy if the shared service is unavailable.
