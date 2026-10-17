// nav-sync.js — keeps hub selectors in sync across all pages.
// Include this script (deferred) on any page that has one or more elements
// with the class `.hub-dropdown-selector`. It will populate them from
// localStorage (key `registered_hubs`) and, when available, refresh the list
// from the Google Apps Script Web App backend.
(function () {
  'use strict';

  /* ============================================================
   * CONFIGURATION
   * Same deployed Google Apps Script Web App URL as in upload.js.
   * ============================================================ */
  var GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw3GvcQq1tWUt1kQwM733_bWZq2amuC7cpqqlONh955Kt1huhLr89IKmzS8PT0reII/exec';

  var REGISTERED_HUBS_KEY = 'registered_hubs';
  var SELECTOR_CLASS = 'hub-dropdown-selector';

  // ---- localStorage helpers ----
  function getLocalHubs() {
    try {
      var raw = localStorage.getItem(REGISTERED_HUBS_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function setLocalHubs(hubs) {
    try { localStorage.setItem(REGISTERED_HUBS_KEY, JSON.stringify(hubs)); } catch (e) {}
  }

  // Merge freshly-fetched hubs into what we already have (dedup, keep order).
  function mergeHubs(hubs) {
    var existing = getLocalHubs();
    var seen = {};
    var merged = [];
    existing.concat(hubs || []).forEach(function (h) {
      if (h && !seen[h]) { seen[h] = true; merged.push(h); }
    });
    setLocalHubs(merged);
    return merged;
  }

  // ---- Backend fetch (doGet returns { hubs: [...] }) ----
  function fetchHubs() {
    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.indexOf('REPLACE_WITH') !== -1) {
      return Promise.resolve([]);
    }
    return fetch(GAS_WEB_APP_URL, { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var hubs = (data && data.hubs) ? data.hubs : (Array.isArray(data) ? data : []);
        return mergeHubs(hubs);
      })
      .catch(function () { return getLocalHubs(); });
  }

  // ---- Populate a single element ----
  function populateElement(el, hubs) {
    if (!el) return;
    if (el.tagName === 'SELECT') {
      var includeAll = el.getAttribute('data-include-all') === 'true';
      var current = el.value;
      el.innerHTML = '';
      if (includeAll) {
        var optAll = document.createElement('option');
        optAll.value = 'All';
        optAll.textContent = 'All Hubs';
        el.appendChild(optAll);
      }
      hubs.forEach(function (hub) {
        var o = document.createElement('option');
        o.value = hub;
        o.textContent = hub;
        el.appendChild(o);
      });
      // Restore previous selection if still valid.
      if (current && (hubs.indexOf(current) !== -1 || (includeAll && current === 'All'))) {
        el.value = current;
      } else if (includeAll) {
        el.value = 'All';
      }
    } else {
      // Container element: render hub buttons (e.g. tab-style nav).
      el.innerHTML = '';
      hubs.forEach(function (hub) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tab-btn';
        b.dataset.hub = hub;
        b.textContent = hub;
        el.appendChild(b);
      });
    }
  }

  function populateAll(hubs) {
    var els = document.querySelectorAll('.' + SELECTOR_CLASS);
    Array.prototype.forEach.call(els, function (el) { populateElement(el, hubs); });
  }

  // ---- Public refresh: paint local immediately, then refresh from Sheet ----
  function refresh() {
    var local = getLocalHubs();
    populateAll(local);
    fetchHubs().then(function (hubs) { populateAll(hubs); });
  }

  // Expose a small API for manual control from other scripts.
  window.HubSync = {
    getHubs: getLocalHubs,
    fetchHubs: fetchHubs,
    mergeHubs: mergeHubs,
    populateAll: populateAll,
    refresh: refresh
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
})();
