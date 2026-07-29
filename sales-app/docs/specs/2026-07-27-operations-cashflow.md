# Operations Cash Flow & Reconciliation — Design Spec

_Date: 2026-07-27 · App: `sales-app/` (Verisko Sales Visit Planner)_

## Summary
Add an Operations cash-flow / reconciliation layer. Split the current combined
"Sales / Operations" role into distinct **Sales** and **Operations** roles.
Operations users get a new **Cash flow** tab: a running **float** where they
record money in and out, each backed by a **receipt photo**, then reviewed and
**approved by the Owner/Technical**. Reuses the existing stack (Supabase email
login + allow-list, Netlify Functions + Blobs). Keep it simple.

## Roles
- User record `role`: `admin` (Owner + Technical), `operations`, `sales`.
  Legacy `user` is treated as `sales`.
- **Owner** = first user (protected from removal/role change).
- Add-member picker options: **Sales**, **Operations**, **Technical**.
- Access by role:
  - **Sales** → Today, Prospects, Site visits.
  - **Operations** → the above **+ Cash flow**.
  - **Technical / Owner** → the above **+ Cash flow + Settings**.
- Helpers: `isAdmin()` = role `admin` (Settings + approvals); `canCashflow()` =
  role `operations` or `admin`.
- **Approve / Send-back** actions: admins only. Operations records & edits their
  own entries but cannot approve.
- **Server-enforced** in the function: `sales` cannot write transactions; only
  admins may set `status = approved` or edit entries they didn't create. Mirrors
  the existing "only admins may change the team list" rule.

## Data model
New `transactions` array in the shared workspace JSON (syncs via `/api/data`
alongside prospects/appointments/users).

Transaction fields:
- `id`, `direction` (`"in"` | `"out"`), `amount` (whole-number UGX), `date` (YYYY-MM-DD)
- `category` (from the fixed lists below), `prospectId` (optional link), `note`
- `proofId` (Netlify Blob id of the photo) or `""`
- `createdBy` (name), `createdByEmail`, `createdAt` (date)
- `status` (`"pending"` | `"approved"` | `"query"`)
- `reviewedBy` (name), `reviewedAt` (date), `reviewNote` (string, for query)

Categories:
- **In:** Customer deposit · Customer payment · Float top-up · Refund · Other
- **Out:** Equipment · Cable & materials · Transport & fuel · Labour · Airtime & data · Other

## Receipt photos
- The chosen image is **shrunk on the phone** (max ~1200px, JPEG ~0.7 → ~100–250 KB)
  before upload, so storage/bandwidth stay small.
- New endpoint **`/api/receipt`** (same auth gate as `/api/data`: verify Supabase
  token + allow-list):
  - `POST` `{ image: dataURL }` → store in Netlify Blobs (store `verisko-receipts`,
    key = generated id) → return `{ id }`.
  - `GET ?id=` → return the image (data URL).
- Transaction holds only `proofId`; the image is fetched on demand (thumbnail /
  detail view), keeping the synced JSON small.
- One photo per entry; can be replaced.

## Float calculation
- **Float balance** = Σ(approved `in`) − Σ(approved `out`).
- **Pending** shown separately (count + amount). Only **approved** entries count
  toward the balance, so nothing is hidden but nothing unverified inflates it.

## UI — Cash flow tab
- **Header summary:** Float balance (UGX, large); below it "Pending review — N · UGX X".
- **+ Add money** → dialog form: direction (segmented **In / Out**), amount, date,
  category (select), link to prospect (optional select), note, and **photo of proof**
  (attach/replace). Save → `pending`.
- **Entries list** (newest first): direction label (In/Out — not colour alone) +
  amount, category, date, added-by, **status chip**, proof thumbnail or "No proof yet".
  Filters: status (All/Pending/Approved/Sent back) and month.
- **Detail view:** full info + tap-to-enlarge photo.
  - Operations (entry owner): edit while `pending`/`query`, attach/replace photo, resubmit.
  - Admin: **Approve** (blocked until a proof photo exists) · **Send back** (with a note).

## Reconciliation flow (states)
`pending` → **Approve** (admin; requires proof) → `approved` (counts in float)
`pending` → **Send back** (admin; with note) → `query` → Operations edits → `pending`
Every state change stamps who + when.

## Sync / offline / security
- Transactions sync like prospects (record offline, sync when back online).
- Photo upload needs connection; an entry can be saved first and the photo added
  when online (it just can't be approved until the photo is attached).
- Role checks for cash-flow writes/approvals are enforced server-side.
- Amounts and approvals are stamped with the verified signed-in identity.

## Out of scope (v1 — keep simple)
One float (no multiple wallets), UGX only, no bank integration or automatic
reconciliation, no multi-approver chains, no heavy reporting (a monthly total now;
CSV export can come later).
