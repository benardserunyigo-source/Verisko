# Survey lead capture — Google Apps Script

`Code.gs` is the web app that receives the free-site-survey form
([`../index.html`](../index.html) `#contact`, submitted by
[`../app.js`](../app.js)) and appends each lead to a **"Leads"** tab in the
Google Sheet — one friendly column per answer, plus a Summary column.

## Deploy (keeps the existing `/exec` URL)

1. Google Sheet → **Extensions → Apps Script**.
2. Paste `Code.gs` over the existing file, **Save**.
3. If the script is standalone (not opened from the sheet), set `SHEET_ID`
   at the top to the spreadsheet id. If it's bound to the sheet, leave it `''`.
4. **Deploy → Manage deployments →** edit the existing Web app deployment →
   **Version: New version → Deploy.** Editing the existing deployment keeps the
   current URL, so nothing changes on the website. (A brand-new deployment
   would mint a different URL and break the form.)
5. The first submission creates the `Leads` tab and a bold, frozen header row.

## Notes

- **No downtime during the switch.** `app.js` still sends the legacy
  `name` / `phone` / `email` / `type` / `message` fields alongside the raw
  survey fields, so leads keep landing whether the old or new script is live.
  The new script ignores those aliases (and the `company` honeypot) and reads
  the raw fields, so the sheet stays clean.
- **Columns** are defined by `COLUMNS` in `Code.gs`; **dropdown/radio codes**
  are made human-readable via `LABELS`. Add a form field → add one row to
  `COLUMNS` (and a `LABELS` entry if it's a coded value).
- To change the destination tab, edit `SHEET_NAME`.
