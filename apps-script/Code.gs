/**
 * Pharmacy queue dashboard — Google Apps Script web app.
 *
 * Serves the dashboard from script.google.com, so it works on networks that block GitHub and
 * public CDNs. The page (apps-script/Index.html, every library built in) is fetched from the
 * repository by Google's servers, not by the viewer's browser, so dashboard updates merged into
 * main go live here by themselves. The page then asks getAllSheets() for every tab of the queue
 * sheet in one call; the script reads it as its owner, so the sheet need not be shared publicly.
 *
 * Setup: see apps-script/README.md.
 */

const SHEET_ID = '1yIIm_lbopIggu0BjnBVmxtgTTT1F2pNP7YPSpSCJ1mc';
const ALLOWED_SHEETS = ['daily_summary', 'service_summary', 'intraday', 'token_summary', 'wait_dist'];
const PAGE_URL = 'https://raw.githubusercontent.com/JooSzeHao/pharmacy-dashboard/main/apps-script/Index.html';
const CACHE_SECONDS = 3600;       // re-check the repository for a new page at most hourly (?refresh=1 forces it)
const DATA_CACHE_SECONDS = 300;   // reuse the sheet data for 5 minutes (the Refresh button skips this)
const CACHE_CHUNK = 30000;   // CacheService: 100 KB per value
const PROP_CHUNK = 2800;     // PropertiesService: 9 KB per value (UTF-8, up to 3 bytes a character)

function doGet(e) {
  const fresh = e && e.parameter && e.parameter.refresh === '1';
  return HtmlService.createHtmlOutput(getPageHtml_(fresh))
    .setTitle('Pharmacy Queue — HSIS Serdang')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    // Allow embedding in Google Sites
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** The dashboard page: short-term cache → repository → last good copy kept in script properties. */
function getPageHtml_(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) {
    const hit = readChunks_(function (keys) { return cache.getAll(keys); }, 'page');
    if (hit) return hit;
  }
  const props = PropertiesService.getScriptProperties();
  try {
    const res = UrlFetchApp.fetch(PAGE_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
    const html = res.getContentText('UTF-8');
    if (html.indexOf('<!DOCTYPE html>') !== 0) throw new Error('unexpected content');
    cache.putAll(toChunks_('page', html, CACHE_CHUNK), CACHE_SECONDS);
    // Keep a long-term copy for when the repository can't be reached; rewrite only on change
    const digest = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, html, Utilities.Charset.UTF_8));
    if (props.getProperty('page_digest') !== digest) {
      const chunks = toChunks_('saved', html, PROP_CHUNK);
      chunks.page_digest = digest;
      props.setProperties(chunks);
    }
    return html;
  } catch (err) {
    const saved = readChunks_(function (keys) { return props.getProperties(); }, 'saved');
    if (saved) return saved;
    return '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:32px">' +
      '<h2>Dashboard unavailable</h2><p>The dashboard page could not be loaded (' + String(err.message) +
      '). Try again in a few minutes.</p></body></html>';
  }
}

function toChunks_(prefix, text, size) {
  const out = {};
  const n = Math.ceil(text.length / size);
  for (let i = 0; i < n; i++) out[prefix + '_' + i] = text.substr(i * size, size);
  out[prefix + '_n'] = String(n);
  return out;
}

function readChunks_(getAll, prefix) {
  const head = getAll([prefix + '_n']);
  const n = Number(head && head[prefix + '_n']);
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(prefix + '_' + i);
  const got = getAll(keys);
  const parts = keys.map(function (k) { return got[k]; });
  return parts.every(function (p) { return typeof p === 'string'; }) ? parts.join('') : null;
}

/**
 * Every tab of the queue sheet in one call, as a JSON string:
 *   { fetchedAt, tabs: { name: { head: [...], rows: [[...], ...] } | null } }
 * Rows are arrays (not objects) to keep the payload small. The result is cached for
 * DATA_CACHE_SECONDS; pass fresh = true to read the sheet again.
 */
function getAllSheets(fresh) {
  const cache = CacheService.getScriptCache();
  if (!fresh) {
    const hit = readChunks_(function (keys) { return cache.getAll(keys); }, 'data');
    if (hit) return hit;
  }
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const tabs = {};
  ALLOWED_SHEETS.forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    tabs[name] = sheet ? readTab_(sheet, tz) : null;
  });
  const json = JSON.stringify({ fetchedAt: Date.now(), tabs: tabs });
  try { cache.putAll(toChunks_('data', json, CACHE_CHUNK), DATA_CACHE_SECONDS); } catch (err) { /* serve uncached */ }
  return json;
}

/**
 * One tab as { head, rows }. Dates become 'yyyy-MM-dd'; time-of-day cells (dates in 1899) become
 * the text the sheet shows (e.g. '7:30'), read only for the columns that hold them.
 */
function readTab_(sheet, tz) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return { head: [], rows: [] };
  const allHead = values[0].map(function (h) { return String(h).trim(); });
  const cols = [];
  allHead.forEach(function (h, c) { if (h) cols.push(c); });
  const body = values.slice(1);
  cols.forEach(function (c) {
    const isTime = function (v) { return v instanceof Date && v.getFullYear() < 1900; };
    if (!body.some(function (r) { return isTime(r[c]); })) return;
    const shown = sheet.getRange(2, c + 1, body.length, 1).getDisplayValues();
    body.forEach(function (r, i) { if (isTime(r[c])) r[c] = shown[i][0]; });
  });
  const rows = [];
  body.forEach(function (r) {
    const row = cols.map(function (c) {
      const v = r[c];
      return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v;
    });
    if (row.some(function (v) { return v !== ''; })) rows.push(row);
  });
  return { head: cols.map(function (c) { return allHead[c]; }), rows: rows };
}

/** One tab as objects keyed by the header row. Kept for pages built before getAllSheets(). */
function getSheetRows(name) {
  if (ALLOWED_SHEETS.indexOf(name) === -1) throw new Error('Unknown tab: ' + name);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('No tab named ' + name);
  const tab = readTab_(sheet, ss.getSpreadsheetTimeZone());
  return tab.rows.map(function (r) {
    const obj = {};
    tab.head.forEach(function (h, i) { obj[h] = r[i]; });
    return obj;
  });
}
