/**
 * Pharmacy queue dashboard — Google Apps Script web app.
 *
 * Serves the dashboard from script.google.com, so it works on networks that block GitHub and
 * public CDNs. The page (apps-script/Index.html, every library built in) is fetched from the
 * repository by Google's servers, not by the viewer's browser, so dashboard updates merged into
 * main go live here by themselves. The page then asks getSheetRows() for each tab of the queue
 * sheet; the script reads it as its owner, so the sheet need not be shared publicly.
 *
 * Setup: see apps-script/README.md.
 */

const SHEET_ID = '1yIIm_lbopIggu0BjnBVmxtgTTT1F2pNP7YPSpSCJ1mc';
const ALLOWED_SHEETS = ['daily_summary', 'service_summary', 'intraday', 'token_summary', 'wait_dist'];
const PAGE_URL = 'https://raw.githubusercontent.com/JooSzeHao/pharmacy-dashboard/main/apps-script/Index.html';
const CACHE_SECONDS = 600;   // re-check the repository at most every 10 minutes
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
