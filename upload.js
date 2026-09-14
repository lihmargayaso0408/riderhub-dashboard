// upload.js — client logic for upload.html
// Parses the uploaded CSV (PapaParse), auto-detects the Hub, extracts rider
// data, and POSTs the payload to the Google Apps Script Web App backend.
(async function () {
  'use strict';

  // ---- Admin-only access control ----
  // Replicates the guard used by accounts.html: only signed-in, approved
  // admins may use this page. Everyone else is bounced to the dashboard.
  const __perms = await window.Auth.guard();
  if (!__perms) throw new Error('redirect');
  if (__perms.role !== 'admin') {
    window.location.href = 'index.html';
    throw new Error('not admin');
  }

  /* ============================================================
   * CONFIGURATION
   * Paste your deployed Google Apps Script Web App URL below.
   * Deploy with: Execute as = Me, Who has access = Anyone.
   * ============================================================ */
  var GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw3GvcQq1tWUt1kQwM733_bWZq2amuC7cpqqlONh955Kt1huhLr89IKmzS8PT0reII/exec';

  // localStorage key used to remember registered hubs across pages.
  var REGISTERED_HUBS_KEY = 'registered_hubs';

  // Case-insensitive (substring) column-name lookups.
  var HUB_COLUMNS = ['hub name', 'hub'];
  var RIDER_ID_COLUMNS = ['rider id', 'riderid', 'id'];
  var RIDER_NAME_COLUMNS = ['rider name', 'rider', 'driver name', 'driver', 'name'];
  var STATUS_COLUMNS = ['status', 'state'];

  var DEFAULT_HUB = 'Unassigned Hub';
  var MAX_PREVIEW_ROWS = 25;

  // ---- DOM refs ----
  var fileInput = document.getElementById('fileInput');
  var dropZone = document.getElementById('dropZone');
  var dropText = document.getElementById('dropText');
  var hubNameInput = document.getElementById('hubNameInput');
  var submitBtn = document.getElementById('submitBtn');
  var resetBtn = document.getElementById('resetBtn');
  var statusPill = document.getElementById('statusPill');
  var statusText = document.getElementById('statusText');
  var summaryGrid = document.getElementById('summaryGrid');
  var summaryHub = document.getElementById('summaryHub');
  var summaryCount = document.getElementById('summaryCount');
  var previewTitle = document.getElementById('previewTitle');
  var previewWrap = document.getElementById('previewWrap');
  var toast = document.getElementById('toast');

  // ---- State ----
  var currentPayload = null; // { hub, riders: [...] }

  // ---- Helpers ----
  function findColumn(headers, candidates) {
    if (!headers) return null;
    var lower = headers.map(function (h) { return String(h || '').trim().toLowerCase(); });
    for (var i = 0; i < candidates.length; i++) {
      var idx = lower.indexOf(candidates[i]);
      if (idx !== -1) return headers[idx];
    }
    // Fallback: substring match (e.g. "Delivery Hub" contains "hub").
    for (var j = 0; j < lower.length; j++) {
      for (var k = 0; k < candidates.length; k++) {
        if (lower[j].indexOf(candidates[k]) !== -1) return headers[j];
      }
    }
    return null;
  }

  function getCell(row, col) {
    if (!col) return '';
    var v = row[col];
    return v != null ? String(v).trim() : '';
  }

  function setStatus(state, message) {
    if (!statusPill) return;
    statusPill.className = 'status-pill ' + state;
    if (statusText) statusText.textContent = message;
  }

  function showToast(html) {
    if (!toast) return;
    toast.innerHTML = html;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () { toast.classList.remove('show'); }, 3200);
  }

  function renderPreview(riders, headers) {
    if (!previewWrap) return;
    if (!riders.length) { previewWrap.style.display = 'none'; if (previewTitle) previewTitle.style.display = 'none'; return; }
    var cols = headers && headers.length ? headers : ['Rider ID', 'Rider Name', 'Status'];
    var rows = riders.slice(0, MAX_PREVIEW_ROWS).map(function (r) {
      return '<tr>' + cols.map(function (c) {
        return '<td>' + escapeHtml(r[c] != null ? r[c] : '') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    previewWrap.innerHTML = '<table><thead><tr>' + cols.map(function (c) {
      return '<th>' + escapeHtml(c) + '</th>';
    }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table>';
    previewWrap.style.display = '';
    if (previewTitle) {
      previewTitle.style.display = '';
      previewTitle.textContent = 'Preview (first ' + Math.min(riders.length, MAX_PREVIEW_ROWS) + ' of ' + riders.length + ' rows)';
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  // ---- Parsing ----
  function handleFile(file) {
    if (!file) return;
    if (!window.Papa) {
      setStatus('error', 'PapaParse failed to load.');
      showToast('CSV parser failed to load. Check your connection.');
      return;
    }
    setStatus('loading', 'Reading ' + file.name + '…');
    submitBtn.disabled = true;
    summaryGrid.style.display = 'none';

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: function (h) { return h.trim(); },
      complete: function (results) {
        try {
          processParsed(results);
        } catch (err) {
          console.error(err);
          setStatus('error', 'Could not parse file.');
          showToast('Could not parse the CSV: ' + (err.message || err));
        }
      },
      error: function (err) {
        setStatus('error', 'Parse error.');
        showToast('Failed to read the CSV: ' + (err.message || err));
      }
    });
  }

  function processParsed(results) {
    var rows = results.data || [];
    var headers = (results.meta && results.meta.fields) || [];

    if (!rows.length) {
      setStatus('error', 'No rows found.');
      showToast('The CSV appears to be empty.');
      return;
    }

    var hubCol = findColumn(headers, HUB_COLUMNS);
    var idCol = findColumn(headers, RIDER_ID_COLUMNS);
    var nameCol = findColumn(headers, RIDER_NAME_COLUMNS);
    var statusCol = findColumn(headers, STATUS_COLUMNS);

    // Detect hub: first non-empty value in the hub column.
    var detectedHub = DEFAULT_HUB;
    if (hubCol) {
      for (var i = 0; i < rows.length; i++) {
        var h = getCell(rows[i], hubCol);
        if (h) { detectedHub = h; break; }
      }
    }
    if (!detectedHub) detectedHub = DEFAULT_HUB;
    hubNameInput.value = detectedHub;

    var riders = rows.map(function (row) {
      return {
        'Rider ID': getCell(row, idCol),
        'Rider Name': getCell(row, nameCol),
        'Status': getCell(row, statusCol)
      };
    }).filter(function (r) {
      return r['Rider ID'] || r['Rider Name'];
    });

    if (!riders.length) {
      setStatus('error', 'No rider rows found.');
      showToast('No rider rows detected. Check that the CSV has Rider ID / Rider Name columns.');
      return;
    }

    currentPayload = { hub: detectedHub, riders: riders };
    summaryHub.textContent = detectedHub;
    summaryCount.textContent = String(riders.length);
    summaryGrid.style.display = '';
    renderPreview(riders, ['Rider ID', 'Rider Name', 'Status']);
    submitBtn.disabled = false;
    setStatus('success', 'Ready — ' + riders.length + ' riders detected.');
  }

  // ---- Submission ----
  function submit() {
    if (!currentPayload) return;
    var hub = (hubNameInput.value || '').trim() || DEFAULT_HUB;
    currentPayload.hub = hub;

    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.indexOf('REPLACE_WITH') !== -1) {
      setStatus('error', 'Web App URL not configured.');
      showToast('Set <b>GAS_WEB_APP_URL</b> in upload.js to your Apps Script Web App URL.');
      return;
    }

    setStatus('loading', 'Sending to Hub Sheet…');
    submitBtn.disabled = true;

    // Form-encoded body avoids a CORS preflight that Apps Script can't answer.
    fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'payload=' + encodeURIComponent(JSON.stringify(currentPayload))
    })
      .then(function (res) {
        return res.text().then(function (text) {
          try { return JSON.parse(text); }
          catch (e) {
            console.error('Apps Script raw response (HTTP ' + res.status + '):\n' + text);
            throw new Error('Server returned an HTML error page (HTTP ' + res.status + '). Open the Web App URL in a browser while logged in to see the message.');
          }
        });
      })
      .then(function (data) {
        if (data && data.success) {
          setStatus('success', 'Saved ' + (data.rowsAppended || currentPayload.riders.length) + ' riders to "' + hub + '".');
          showToast('Manifest for <b>' + escapeHtml(hub) + '</b> uploaded.');
          saveRegisteredHub(hub);
        } else {
          throw new Error((data && data.error) || 'Unknown backend error');
        }
      })
      .catch(function (err) {
        console.error(err);
        setStatus('error', 'Upload failed.');
        showToast('Upload failed: ' + (err.message || err));
      })
      .then(function () { submitBtn.disabled = false; });
  }

  // ---- localStorage hub registry ----
  function saveRegisteredHub(hub) {
    try {
      var raw = localStorage.getItem(REGISTERED_HUBS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      if (arr.indexOf(hub) === -1) {
        arr.push(hub);
        localStorage.setItem(REGISTERED_HUBS_KEY, JSON.stringify(arr));
      }
    } catch (e) { /* localStorage may be unavailable */ }
  }

  function resetAll() {
    currentPayload = null;
    if (fileInput) fileInput.value = '';
    if (hubNameInput) hubNameInput.value = '';
    if (summaryGrid) summaryGrid.style.display = 'none';
    if (previewWrap) { previewWrap.style.display = 'none'; previewWrap.innerHTML = ''; }
    if (previewTitle) previewTitle.style.display = 'none';
    if (submitBtn) submitBtn.disabled = true;
    if (dropText) dropText.innerHTML = '<b>Click to choose</b> or drag a .csv file here';
    setStatus('idle', 'Idle');
  }

  // ---- Wire up events ----
  if (fileInput) {
    fileInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) handleFile(f);
    });
  }

  if (dropZone) {
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.add('drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove('drag');
      });
    });
    dropZone.addEventListener('drop', function (e) {
      var dt = e.dataTransfer;
      var f = dt && dt.files && dt.files[0];
      if (f) handleFile(f);
    });
  }

  if (submitBtn) submitBtn.addEventListener('click', submit);
  if (resetBtn) resetBtn.addEventListener('click', resetAll);

  setStatus('idle', 'Idle');
})();
