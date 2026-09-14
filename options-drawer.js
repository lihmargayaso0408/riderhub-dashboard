(function () {
  "use strict";

  // Shared Option Button + Options drawer for the sub-pages
  // (riders-agenda, loss-report, pnr). The dashboard (index.html) keeps its
  // own full-featured drawer in script.js; this file provides the same
  // easy-access Option button + navigation on every other page.

  function escapeAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '"')
      .replace(/</g, '<').replace(/>/g, '>');
  }

  // Cheap, non-authoritative check used only to decide which menu items to
  // show; the target pages enforce access authoritatively themselves.
  function isAdmin() {
    try {
      var u = window.Auth && window.Auth.currentUser && window.Auth.currentUser();
      if (!u) return false;
      var emails = (window.Auth && window.Auth.ADMIN_EMAILS) || [];
      return emails.indexOf(String(u.email || '').toLowerCase()) !== -1;
    } catch (e) { return false; }
  }

  var THEME_KEY = 'hub-theme';

  function getSavedTheme() {
    try {
      var raw = localStorage.getItem(THEME_KEY);
      if (raw === null || raw === undefined) return null;
      try { return JSON.parse(raw); } catch (e) { return raw; }
    } catch (err) { return null; }
  }

  function saveTheme(mode) {
    try { localStorage.setItem(THEME_KEY, JSON.stringify(mode)); } catch (e) {}
  }

  function applyTheme(mode) {
    var isDark = mode === 'dark' ||
      (mode === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark', isDark);
    var pill = document.getElementById('optThemeState');
    if (pill) pill.textContent = isDark ? 'On' : 'Off';
  }

  function buildHTML() {
    var wheelSvg = '<svg class="car-wheel-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
      + '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>'
      + '<line x1="12" y1="3.5" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="20.5"/>'
      + '<line x1="3.5" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="20.5" y2="12"/>'
      + '<line x1="6" y1="6" x2="8.4" y2="8.4"/><line x1="15.6" y1="15.6" x2="18" y2="18"/>'
      + '<line x1="18" y1="6" x2="15.6" y2="8.4"/><line x1="8.4" y1="15.6" x2="6" y2="18"/>'
      + '</svg>';

    var icon = function (inner) {
      return '<span class="drawer-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg></span>';
    };

    var item = function (id, label, svgPath) {
      return '<button class="drawer-item" id="' + id + '" type="button">'
        + icon(svgPath) + '<span class="drawer-label">' + label + '</span></button>';
    };

    var svgHome = '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>';
    var svgRiders = '<circle cx="9" cy="7" r="4"/><path d="M17 11a4 4 0 0 0 0-8"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M17 13a4 4 0 0 1 4 4v2"/>';
    var svgLoss = '<path d="M12 3v18M8 7l-4 4 4 4M16 7l4 4-4 4"/>';
    var svgPnr = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2M8 17h6M12 11h4"/>';
    var svgDtr = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v6H8V2"/><path d="M8 10h8M8 14h8M8 18h5"/>';
    var svgMap = '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>';
    var svgUpload = '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 20h16"/>';
    var svgLogout = '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>';
    var svgTheme = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
    var svgAccounts = '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/>';

    var btn = '<button class="wheel-btn" id="optSettingsToggle" title="Open options" aria-label="Open options menu" type="button">' + wheelSvg + '</button>';

    var drawerHead = '<div class="drawer-head"><h3>Options</h3>'
      + '<button class="drawer-close" id="optDrawerClose" type="button" aria-label="Close options">×</button></div>';

    var drawerBody = '<div class="drawer-body">'
      + item('optHomeBtn', 'Rider Performance System', svgHome)
      + item('optRidersBtn', 'Riders &amp; Agency per hub', svgRiders)
      + item('optLossBtn', 'Loss Report per hub', svgLoss)
      + item('optPnrBtn', 'PNR of Riders', svgPnr)
      + item('optDtrBtn', 'Riders DTR', svgDtr)
       + item('optAreaBtn', 'Area Map', svgMap)
       + item('optUploadBtn', 'Upload manifest', svgUpload)
       + item('optAccountsBtn', 'Manage Accounts', svgAccounts)
       + item('optLogoutBtn', 'Log out', svgLogout)
      + '<button class="drawer-item drawer-item-theme" id="optThemeToggle" type="button">'
      + icon(svgTheme) + '<span class="drawer-label">Dark mode</span>'
      + '<span class="settings-pill" id="optThemeState">Off</span></button>'
      + '</div>';

    var backdrop = '<div class="drawer-backdrop" id="optDrawerBackdrop" hidden></div>';
    var drawer = '<aside class="drawer" id="optSettingsDrawer" aria-hidden="true">' + drawerHead + drawerBody + '</aside>';

    return '<div class="opt-fab-shell" id="optFabShell">' + btn + '</div>' + backdrop + drawer;
  }

  function positionWheel() {
    // Reserve space at the top of the page so the floating button never
    // covers the page title or the page header on the sub-pages.
    // The wheel is 56px tall and sits 14px from the top, so allow ~90px.
    document.body.style.paddingTop = '90px';

    // Place the button fixed at the top-left so it's always accessible.
    var shell = document.getElementById('optFabShell');
    if (!shell) return;
    shell.style.position = 'fixed';
    shell.style.top = '16px';
    shell.style.left = '16px';
    shell.style.zIndex = '1500';
    // The wheel button is styled as a 56px circle in styles.css
    var btn = document.getElementById('optSettingsToggle');
    if (btn) {
      btn.style.boxShadow = '0 6px 18px rgba(0,0,0,.25)';
      btn.style.background = 'var(--ink)';
      btn.style.color = '#F5F6F1';
      btn.style.borderColor = '#3A4150';
    }
  }

  function openMenu() {
    var drawer = document.getElementById('optSettingsDrawer');
    var backdrop = document.getElementById('optDrawerBackdrop');
    var wheel = document.getElementById('optSettingsToggle');
    if (drawer) { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); }
    if (backdrop) backdrop.hidden = false;
    if (wheel) wheel.classList.add('open');
  }

  function closeMenu() {
    var drawer = document.getElementById('optSettingsDrawer');
    var backdrop = document.getElementById('optDrawerBackdrop');
    var wheel = document.getElementById('optSettingsToggle');
    if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
    if (backdrop) backdrop.hidden = true;
    if (wheel) wheel.classList.remove('open');
  }

  function wireDrag() {
    var wheel = document.getElementById('optSettingsToggle');
    var drawerEl = document.getElementById('optSettingsDrawer');
    var backdropEl = document.getElementById('optDrawerBackdrop');
    if (!wheel) return;
    var dragState = null;

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function onStart(e) {
      if (drawerEl && drawerEl.classList.contains('open')) return;
      var pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
      dragState = { startX: pt.clientX, startY: pt.clientY, moved: false };
      wheel.classList.add('dragging');
      wheel.classList.remove('open');
      document.body.style.userSelect = 'none';
    }
    function onMove(e) {
      if (!dragState) return;
      var pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
      var dx = pt.clientX - dragState.startX;
      var dy = pt.clientY - dragState.startY;
      if (!dragState.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) dragState.moved = true;
      if (!dragState.moved) return;
      if (e.cancelable) e.preventDefault();
      var travel = clamp(dx, 0, 300);
      if (drawerEl) { drawerEl.style.transition = 'none'; drawerEl.style.transform = 'translateX(' + (-300 + travel) + 'px)'; }
      if (backdropEl) { backdropEl.hidden = false; backdropEl.style.opacity = 0.45 * (travel / 300); }
    }
    function onEnd(e) {
      if (!dragState) return;
      var pt = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
      var dx = pt ? pt.clientX - dragState.startX : 0;
      var shouldOpen = dragState.moved && dx > 120;
      dragState = null;
      wheel.classList.remove('dragging');
      document.body.style.userSelect = '';
      if (drawerEl) { drawerEl.style.transition = ''; drawerEl.style.transform = ''; }
      if (backdropEl) backdropEl.style.opacity = '';
      if (shouldOpen) openMenu(); else closeMenu();
    }

    wheel.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    wheel.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  }

  function wireEvents() {
    var wheel = document.getElementById('optSettingsToggle');
    var closeBtn = document.getElementById('optDrawerClose');
    var backdrop = document.getElementById('optDrawerBackdrop');

    if (wheel) wheel.addEventListener('click', function (e) {
      e.stopPropagation();
      var drawer = document.getElementById('optSettingsDrawer');
      if (drawer && drawer.classList.contains('open')) closeMenu(); else openMenu();
    });
    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
    if (backdrop) backdrop.addEventListener('click', closeMenu);

    var go = function (href) {
      return function () { closeMenu(); window.location.href = href; };
    };
    var home = document.getElementById('optHomeBtn');
    var riders = document.getElementById('optRidersBtn');
    var loss = document.getElementById('optLossBtn');
    var pnr = document.getElementById('optPnrBtn');
    var dtr = document.getElementById('optDtrBtn');
    var area = document.getElementById('optAreaBtn');
    var logout = document.getElementById('optLogoutBtn');
    if (home) home.addEventListener('click', go('index.html'));
    if (riders) riders.addEventListener('click', go('riders-agency.html'));
    if (loss) loss.addEventListener('click', go('loss-report.html'));
    if (pnr) pnr.addEventListener('click', go('pnr.html'));
    if (dtr) dtr.addEventListener('click', go('riders-dtr.html'));
    if (area) area.addEventListener('click', go('area-map.html'));
    var upload = document.getElementById('optUploadBtn');
    if (upload) upload.addEventListener('click', go('upload.html'));
    var accounts = document.getElementById('optAccountsBtn');
    if (accounts) accounts.addEventListener('click', go('accounts.html'));
    if (logout) logout.addEventListener('click', async function(){
      closeMenu();
      try { await window.Auth.logout(); } catch (e) {}
      window.location.href = 'login.html';
    });

    var themeToggle = document.getElementById('optThemeToggle');
    if (themeToggle) themeToggle.addEventListener('click', function () {
      closeMenu();
      var next = document.body.classList.contains('dark') ? 'light' : 'dark';
      applyTheme(next);
      saveTheme(next);
    });
  }

  function init() {
    if (document.getElementById('optFabShell')) return; // already injected
    var host = document.createElement('div');
    host.innerHTML = buildHTML();
    // Append the whole block (button + backdrop + drawer) to the body
    while (host.firstChild) document.body.appendChild(host.firstChild);

    applyTheme(getSavedTheme());
    positionWheel();
    wireDrag();
    wireEvents();

    (async function applyAccess(){
      try {
        var Auth = window.Auth;
        if (!Auth) return;
        // Wait for auth state to avoid race where currentUser is null on first load
        var u = Auth.auth && Auth.auth.currentUser;
        if (!u && Auth.whenReady) {
          u = await Auth.whenReady();
        }
        if (!u) return;
        var profile = await Auth.getProfile(u.uid);
        // Admins get all pages; use profile.pages for everyone else
        var isAdmin = Auth.ADMIN_EMAILS && Auth.ADMIN_EMAILS.indexOf(String(u.email || '').toLowerCase()) !== -1;
        if (!isAdmin && profile && profile.pages && profile.pages.length) {
          var pageMap = {
            'optRidersBtn': 'riders',
            'optLossBtn': 'loss',
            'optPnrBtn': 'pnr',
            'optDtrBtn': 'dtr',
            'optAreaBtn': 'map',
            'optAccountsBtn': 'accounts'
          };
          Object.keys(pageMap).forEach(function(id){
            var el = document.getElementById(id);
            if (el && profile.pages.indexOf(pageMap[id]) === -1) {
              el.style.display = 'none';
            }
          });
        }

        // The Upload manifest page is admin-only.
        var uploadBtn = document.getElementById('optUploadBtn');
        if (uploadBtn && !isAdmin) uploadBtn.style.display = 'none';
      } catch(e) {}
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.getSavedTheme = getSavedTheme;
  window.applySavedTheme = function() {
    var isDark = getSavedTheme() === 'dark' || (getSavedTheme() === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark', isDark);
  };
})();
