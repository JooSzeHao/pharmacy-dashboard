# Pharmacy queue dashboard on Google Apps Script

Use this when a network blocks GitHub (and often public CDNs such as jsDelivr), so the
GitHub Pages dashboard won't load. The same dashboard runs as a Google Apps Script web app,
served from `script.google.com`:

- **Only Google needs to be reachable.** Viewers' browsers talk to Google only. Chart.js, its
  plugins and morphicons are built into `Index.html`; fonts come from Google Fonts (if those are
  blocked, system fonts are used and everything still works).
- **Updates go live by themselves.** `Code.gs` fetches `apps-script/Index.html` from this
  repository's `main` branch on Google's servers (not through the hospital network), keeps it
  for 10 minutes, and keeps the last good copy in case GitHub can't be reached.
- **The sheet can stay private.** The script reads the queue sheet as its owner, so the sheet
  no longer has to be shared as "anyone with the link can view".

## Files

| File | What it is |
|---|---|
| `Code.gs` | The whole Apps Script project: serves the page (`doGet`) and reads one tab of the sheet for it (`getSheetRows`) |
| `Index.html` | The dashboard with every library inlined, built from `../dashboard.html` by `tools/build_apps_script.py`. Committed so `Code.gs` can fetch it — don't edit it by hand |

## First-time setup

Signed in to the Google account that owns the queue sheet:

1. Create the project: open the `Pharmacy queue dashboard` Apps Script project in Google Drive
   (if it was created for you), or go to [script.google.com](https://script.google.com) → **New project**
   and paste `Code.gs` over the default code, then **Save**.
2. **Deploy → New deployment** → gear icon → **Web app**:
   - **Execute as:** **Me**
   - **Who has access:** **Anyone** (anyone with the link, no sign-in), or
     **Anyone with a Google account** if staff sign in to Google
3. Click **Deploy**, then **Authorize access**. The script asks to *see your spreadsheets* (to read
   the queue sheet) and to *connect to an external service* (to fetch the page from GitHub).
   Google may warn that the app isn't verified: choose **Advanced → Go to … (unsafe)**. It's your own script.
4. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`). That's the dashboard's new address.

### Put it on Google Sites (optional)

In Google Sites: **Insert → Embed → By URL**, paste the web app URL, choose **Whole page**, then **Publish**.

## Updating

- **Dashboard changes:** run `python3 tools/build_apps_script.py`, commit `apps-script/Index.html`
  with the change and merge into `main`. The web app picks it up within 10 minutes; add
  `?refresh=1` to the web app URL to load it straight away.
- **`Code.gs` changes:** paste the new code into the project, **Save**, then
  **Deploy → Manage deployments** → pencil icon → **Version: New version** → **Deploy**. The URL stays the same.

## Troubleshooting

| What you see | Fix |
|---|---|
| Banner: "Couldn't reach the Google Sheet (…)" | Check the account in **Execute as** can open the sheet, and that the tab names are `daily_summary`, `service_summary`, `intraday`, `token_summary`, `wait_dist` |
| "Sorry, unable to open the file at this time" | The deployment was removed or its access changed: redeploy (step 6) |
| Blank page inside Google Sites | Embed **By URL** (not "Embed code"), and make sure the deployment's access is **Anyone** |
| Old version still showing | Open the web app URL with `?refresh=1` added; for a `Code.gs` change, deploy a **New version** (Manage deployments) |
| Page says "Dashboard unavailable" | GitHub couldn't be reached from Google and no copy was saved yet: try again later, or check `apps-script/Index.html` is on `main` |
