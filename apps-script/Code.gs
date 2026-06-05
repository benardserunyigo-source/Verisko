/**
 * Verisko — site-survey lead capture (Google Apps Script web app)
 * =================================================================
 * Receives POSTs from the free-site-survey form (index.html + app.js) and
 * appends one row per lead to the "Leads" tab — one friendly column per
 * answer, plus a readable Summary column.
 *
 * ---- HOW TO DEPLOY (keeps the SAME /exec URL the site already uses) ----
 * 1. Open the Google Sheet → Extensions → Apps Script.
 * 2. Replace the file contents with this script and Save.
 * 3. If this script is NOT bound to the sheet (i.e. it's a standalone
 *    project), set SHEET_ID below to your spreadsheet's id (the long string
 *    in the sheet URL between /d/ and /edit). If it IS bound, leave it blank.
 * 4. Deploy → Manage deployments → (pencil/edit the existing web app) →
 *    Version: "New version" → Deploy.  ← editing the existing deployment
 *    keeps the current URL, so no change is needed on the website.
 *    (Only "New deployment" would mint a new URL.)
 * 5. First test submission creates the "Leads" tab + header row automatically.
 */

const SHEET_NAME = 'Leads';
const SHEET_ID = '';   // leave '' if this script is bound to the sheet; else paste the spreadsheet id

// raw form field -> friendly column header, in display order.
// Contextual fields only fill in for the relevant space type; the rest stay blank.
const COLUMNS = [
  ['fullName',    'Name'],
  ['whatsapp',    'WhatsApp'],
  ['email',       'Email'],
  ['contactPref', 'Preferred contact'],
  ['vertical',    'Space type'],
  ['propName',    'Property name'],
  ['propArea',    'Area'],
  ['propSize',    'Property size'],
  ['cctvStatus',  'Existing CCTV'],
  ['timeline',    'Timeline'],
  ['concerns',    'Concerns'],
  ['notes',       'Notes'],
  ['floors',      'Floors'],
  ['gates',       'Gates / entrances'],
  ['boundary',    'Boundary wall'],
  ['staff',       'Domestic staff'],
  ['shopType',    'Shop type'],
  ['staffCount',  'Staff count'],
  ['tills',       'Till / cash points'],
  ['hours',       'Operating hours'],
  ['employees',   'Employees'],
  ['reception',   'Reception staffed'],
  ['serverRoom',  'Server / IT room'],
  ['parking',     'Car park'],
  ['pharmType',   'Pharmacy / clinic type'],
  ['cdStorage',   'Controlled drug storage'],
  ['dispensary',  'Dispensary counters'],
  ['buildings',   'Buildings'],
  ['mixedUse',    'Mixed use'],
  ['guard',       'Security guard'],
];

// value code -> friendly label (for the dropdown/radio answers)
const LABELS = {
  vertical:    { home: 'Home', shop: 'Shop / Retail', office: 'Office', pharmacy: 'Pharmacy / Clinic', compound: 'Compound' },
  propSize:    { small: 'Small (under 200m²)', medium: 'Medium (200–500m²)', large: 'Large (over 500m²)' },
  cctvStatus:  { none: 'No — first system', upgrade: 'Yes — wants upgrade', broken: 'Yes — stopped working' },
  timeline:    { '2w': 'Within 2 weeks', '1m': 'Within 1 month', '3m': '1–3 months', exploring: 'Just exploring' },
  contactPref: { whatsapp: 'WhatsApp', call: 'Phone call', email: 'Email' },
};

function pretty(key, value) {
  if (!value) return '';
  const map = LABELS[key];
  return (map && map[value]) ? map[value] : value;
}

function doPost(e) {
  try {
    const p  = (e && e.parameter)  || {};
    const ps = (e && e.parameters) || {};

    // honeypot: a real person never fills "company" — accept silently, store nothing
    if (p.company) return ok();

    const concerns = (ps['concerns[]'] || []).join(', ');

    const values = COLUMNS.map(function (col) {
      const key = col[0];
      if (key === 'concerns') return concerns;
      return pretty(key, (p[key] || '').toString().trim());
    });

    const sheet = getSheet();
    sheet.appendRow([new Date()].concat(values).concat([buildSummary(p, concerns)]));
    return ok();
  } catch (err) {
    return ContentService.createTextOutput('error: ' + err)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function buildSummary(p, concerns) {
  const g = function (k) { return (p[k] || '').toString().trim(); };
  const parts = [
    'Space: ' + pretty('vertical', g('vertical')),
    'Property: ' + g('propName') + (g('propArea') ? ' (' + g('propArea') + ')' : ''),
    'Size: ' + pretty('propSize', g('propSize')) + ' | CCTV: ' + pretty('cctvStatus', g('cctvStatus')),
    'Timeline: ' + pretty('timeline', g('timeline')) + ' | Via: ' + pretty('contactPref', g('contactPref')),
  ];
  if (concerns) parts.push('Concerns: ' + concerns);
  if (g('notes')) parts.push('Notes: ' + g('notes'));
  return parts.join('\n');
}

function getSheet() {
  const ss = SHEET_ID
    ? SpreadsheetApp.openById(SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet found — set SHEET_ID at the top of the script.');

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    const headers = ['Timestamp'].concat(COLUMNS.map(function (c) { return c[1]; })).concat(['Summary']);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ok() {
  return ContentService.createTextOutput(JSON.stringify({ result: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// lets you sanity-check the URL in a browser
function doGet() {
  return ContentService.createTextOutput('Verisko survey endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}
