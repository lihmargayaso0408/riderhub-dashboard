// Code.gs — Google Apps Script Web App backend for the Rider Performance System
//
// Deploy:  Extensions ▸ Apps Script ▸ paste this file ▸ Deploy ▸ New deployment
//          ▸ Select type: Web app
//             • Execute as:   Me
//             • Who has access: Anyone
//          Then copy the resulting Web App URL into GAS_WEB_APP_URL in both
//          upload.js and nav-sync.js.
//
// Endpoints:
//   doPost(e) — accepts { hub, riders:[{riderId, riderName, status}] }, creates
//               a per-hub sheet tab if needed, appends the rider rows, and keeps
//               the Hub_Registry master tab up to date.
//   doGet(e)  — returns { success, hubs:[...] } listing every registered hub.

var HUB_REGISTRY_SHEET = 'Hub_Registry';
var RIDER_HEADERS = ['Rider ID', 'Rider Name', 'Status', 'Updated At'];

function doGet(e) {
  try {
    var hubs = getRegisteredHubs();
    return jsonOutput({ success: true, hubs: hubs });
  } catch (err) {
    return jsonOutput({ success: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var payload = parsePayload(e);
    if (!payload || !payload.hub) {
      return jsonOutput({ success: false, error: 'Missing hub in payload.' });
    }
    var hub = String(payload.hub).trim();
    if (!hub) {
      return jsonOutput({ success: false, error: 'Empty hub name.' });
    }

    var riders = Array.isArray(payload.riders) ? payload.riders : [];
    var sheet = ensureHubSheet(hub);
    var now = new Date();

    var rows = riders.map(function (r) {
      return [
        r.riderId != null ? String(r.riderId) : '',
        r.riderName != null ? String(r.riderName) : '',
        r.status != null ? String(r.status) : '',
        now
      ];
    });

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, RIDER_HEADERS.length)
        .setValues(rows);
    }

    registerHub(hub);

    return jsonOutput({ success: true, hub: hub, rowsAppended: rows.length });
  } catch (err) {
    return jsonOutput({ success: false, error: String(err) });
  }
}

// Reads the payload. upload.js sends it form-encoded as `payload=<json>`,
// which Apps Script exposes on e.parameter.payload (already URL-decoded).
// A raw JSON body (content-type application/json) arrives in e.postData.contents.
function parsePayload(e) {
  var raw = '';
  if (e && e.parameter && e.parameter.payload) {
    raw = e.parameter.payload;
  } else if (e && e.postData && e.postData.contents) {
    raw = e.postData.contents;
  }
  if (!raw) return null;
  return JSON.parse(raw);
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Lists every hub currently recorded in the Hub_Registry sheet.
function getRegisteredHubs() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HUB_REGISTRY_SHEET);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var hubs = [];
  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    if (name) hubs.push(String(name));
  }
  return hubs;
}

// Creates the hub's sheet tab (with headers) if it does not already exist.
function ensureHubSheet(hub) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(hub);
  if (!sheet) {
    sheet = ss.insertSheet(hub);
    sheet.appendRow(RIDER_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, RIDER_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#EDEDED');
  }
  return sheet;
}

// Adds the hub to the master Hub_Registry tab (deduplicated).
function registerHub(hub) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HUB_REGISTRY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(HUB_REGISTRY_SHEET);
    sheet.appendRow(['Hub Name', 'Registered At']);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#EDEDED');
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === hub) return; // already registered
  }
  sheet.appendRow([hub, new Date()]);
}
