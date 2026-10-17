// background.js — BAUKO SPX BRIDGE service worker
const SPX_BASE = 'https://spx.shopee.ph';
const EXPORT_PATH = '/api/driverservice/admin/performance/delivery/export/list';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbw3GvcQq1tWUt1kQwM733_bWZq2amuC7cpqqlONh955Kt1huhLr89IKmzS8PT0reII/exec';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'pull-export') {
    const url = SPX_BASE + EXPORT_PATH + '?function_type=0&frequency=2&start_date=' + encodeURIComponent(msg.startDate || '');
    fetch(url, { credentials: 'include' })
      .then(r => r.text())
      .then(text => {
        // Forward to project backend
        return fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'payload=' + encodeURIComponent(JSON.stringify({ hub: msg.hub || 'Bauko', raw: text }))
        }).then(r => r.text());
      })
      .then(res => sendResponse({ ok: true, res }))
      .catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});