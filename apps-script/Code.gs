/**
 * Pharmacy queue dashboard — Google Apps Script web app.
 *
 * Serves Index.html (the dashboard with every library built in) from script.google.com,
 * so it works on networks that block GitHub and public CDNs. The page asks getSheetRows()
 * for each tab of the queue sheet; the script reads it as you, so the sheet does not need
 * to be shared publicly.
 *
 * Setup: see apps-script/README.md.
 */

const SHEET_ID = '1yIIm_lbopIggu0BjnBVmxtgTTT1F2pNP7YPSpSCJ1mc';
const ALLOWED_SHEETS = ['daily_summary', 'service_summary', 'intraday', 'token_summary', 'wait_dist'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Pharmacy Queue — HSIS Serdang')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    // Allow embedding in Google Sites
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Rows of one tab as objects keyed by the header row (the same shape the gviz feed gives).
 * Dates become 'yyyy-MM-dd' and time-of-day cells their displayed text (e.g. '7:30'),
 * because google.script.run cannot return Date objects.
 */
function getSheetRows(name) {
  if (ALLOWED_SHEETS.indexOf(name) === -1) throw new Error('Unknown tab: ' + name);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('No tab named ' + name);
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length < 2) return [];
  const shown = range.getDisplayValues();
  const tz = ss.getSpreadsheetTimeZone();
  const head = values[0].map(function (h) { return String(h).trim(); });

  return values.slice(1).map(function (row, r) {
    const obj = {};
    head.forEach(function (h, c) {
      if (!h) return;
      let v = row[c];
      if (v instanceof Date) {
        // Time-only cells are dates in 1899; keep what the sheet shows instead of shifting by timezone
        v = v.getFullYear() < 1900 ? shown[r + 1][c] : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      }
      obj[h] = v;
    });
    return obj;
  });
}
