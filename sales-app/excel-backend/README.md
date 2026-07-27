# Connect the app to Microsoft Excel

Upload `Verisko-Sales-Backend.xlsx` to Microsoft OneDrive for Business or
SharePoint. The Netlify function reads and writes its Prospects and Appointments
tables.

## Microsoft setup

1. Create an app registration in Microsoft Entra.
2. Create a client secret.
3. Add Microsoft Graph application permission `Files.ReadWrite.All` and grant
   admin consent. For production, `Sites.Selected` scoped to one SharePoint site
   is safer.
4. Obtain the tenant ID, application/client ID, drive ID, and workbook item ID.

## Netlify environment variables

Add these under **Site configuration → Environment variables**, then redeploy:

- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `EXCEL_DRIVE_ID`
- `EXCEL_FILE_ID`
- `TEAM_KEY` — a private phrase team members enter in the app

Open the deployed app, go to **Settings**, enter the same `TEAM_KEY`, and select
**Connect to Excel**.

Never place the Microsoft client secret in browser-visible code or settings.
