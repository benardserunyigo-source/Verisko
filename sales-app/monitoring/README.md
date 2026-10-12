# Site health monitoring

Watches the CCTV systems Verisko installs and texts Operations when one stops working.
Design: `docs/specs/2026-10-11-site-health-monitoring-design.md`.

## What is here

| Path | What it is |
|---|---|
| `supabase/migrations/` | The database tables, applied once through the Supabase connector. |
| `supabase/functions/_shared/` | All the logic: rules, incident engine, handlers, database access. Plain JavaScript, no build step. |
| `supabase/functions/<name>/index.ts` | Thin entry points for the four Edge Functions: `ingest`, `watch`, `sites-read`, `incident-update`. |
| `scripts/make-deploy-payload.mjs` | Builds the file list to deploy one function through the Supabase connector. |
| `scripts/make-key.mjs` | Creates an access key. Raw key goes to a private file, only its hash goes in the database. |
| `scripts/replay-fake-events.mjs` | Smoke test against the deployed `ingest` function. |

## Run the tests

```bash
cd sales-app && node --test tests/monitoring-*.test.js
```

The handler tests run against an in-memory fake of the database (`tests/helpers/fake-repo.mjs`).
The real database code is `_shared/repo.mjs`. It is checked by the live smoke test, not by unit tests.

## Keys

Four kinds of key, all stored only as SHA-256 hashes in `access_keys`:

| Kind | Used by | Tied to a site | Made by |
|---|---|---|---|
| `box` | The box agent at one customer site | Yes | `scripts/make-key.mjs` |
| `email` | The Google Apps Script that reads recorder emails | No | `scripts/make-key.mjs` |
| `api` | The Operations app's Netlify function | No | `scripts/make-key.mjs` |
| `watch` | The one-minute database scheduler | No | Inside Postgres only. The raw value lives in Supabase Vault and never leaves the database. |

Raw box, email and api keys live in `~/.verisko-monitoring/` on the machine that made them. Never commit one.
To revoke a key, set its `revoked_at` in `access_keys`.

## Deploy

1. Apply `supabase/migrations/*.sql` with the Supabase connector.
2. For each function: `node monitoring/scripts/make-deploy-payload.mjs <name>`, then deploy the printed file list with `verify_jwt` false.
3. Create the watch key and schedule the watcher and cleanup (see the foundation plan, Task 11).

## Known limits

- SMS goes to the console sender until a provider is chosen. Alerts are recorded, but no text is sent.
- Email-only sites cannot raise "site silent", because a recorder that is off sends nothing.
- Devices appear on a box's first report. A mistyped label in the box's config creates a new device.
