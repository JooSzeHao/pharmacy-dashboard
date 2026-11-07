# Pharmacy queue dashboard on Google Apps Script

Use this when a network blocks GitHub (and often public CDNs such as jsDelivr), so the
GitHub Pages dashboard won't load. The same dashboard runs as a Google Apps Script web app,
served from `script.google.com`:

- **Only Google needs to be reachable.** Chart.js, its plugins and morphicons are built into
  `Index.html`; fonts come from Google Fonts. If Google Fonts is blocked, the dashboard falls
  back to system fonts and still works.
- **The sheet can stay private.** The script reads the queue sheet as its owner, so the sheet
  no longer has to be shared as "anyone with the link can view".

## Files

| File | What it is |
|---|---|
| `Code.gs` | Serves the page (`doGet`) and reads one tab of the sheet for it (`getSheetRows`) |
| `Index.html` | Built from `../dashboard.html` by `tools/build_apps_script.py` — don't edit it by hand |

## First-time setup (about 5 minutes)

Do this signed in to the Google account that owns the queue sheet.

1. Open the queue Google Sheet → **Extensions → Apps Script**. (Or go to
   [script.google.com](https://script.google.com) → **New project**; the script opens the sheet by its ID either way.)
2. Rename the project, e.g. **Pharmacy queue dashboard**.
3. **Code.gs:** replace everything in the default `Code.gs` with the contents of `apps-script/Code.gs`.
4. **Index.html:** click **+ → HTML**, name it `Index` (the editor adds `.html`), and replace its
   contents with the whole of `apps-script/Index.html`.
5. Click **Save**.
6. **Deploy → New deployment** → gear icon → **Web app**:
   - **Description:** e.g. `Dashboard`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone** (anyone with the link, no sign-in), or
     **Anyone with a Google account** if staff sign in to Google
7. Click **Deploy**, then **Authorize access** and allow the script to view your spreadsheets.
   Google may warn that the app isn't verified: choose **Advanced → Go to … (unsafe)**. It's your own script.
8. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`). That's the dashboard's new address.

### Put it on Google Sites (optional)

In Google Sites: **Insert → Embed → By URL**, paste the web app URL, choose **Whole page**, then **Publish**.

## Updating after a dashboard change

1. On a computer that can reach GitHub, run `python3 tools/build_apps_script.py` (or download
   the updated `apps-script/Index.html` from the repository).
2. In the Apps Script editor, replace the contents of `Index.html` and click **Save**.
3. **Deploy → Manage deployments** → pencil icon → **Version: New version** → **Deploy**.
   The URL stays the same.

Changing `Code.gs` follows the same redeploy step.

## Troubleshooting

| What you see | Fix |
|---|---|
| Banner: "Couldn't reach the Google Sheet (…)" | Check the account in **Execute as** can open the sheet, and that the tab names are `daily_summary`, `service_summary`, `intraday`, `token_summary`, `wait_dist` |
| "Sorry, unable to open the file at this time" | The deployment was removed or its access changed: redeploy (step 6) |
| Blank page inside Google Sites | Embed **By URL** (not "Embed code"), and make sure the deployment's access is **Anyone** |
| Old version still showing | Deploy a **New version** (Manage deployments), then hard-refresh (Ctrl+Shift+R) |
