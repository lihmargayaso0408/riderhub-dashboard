// dashboard-bridge.js — content script injected into the Rider Performance
// System dashboard (GitHub Pages). Exposes window.spxBridgePull(hub, startDate)
// so the "Data pull" button can trigger the SPX export via the background
// service worker, which fetches spx.shopee.ph using the user's SPX cookies.
window.SPX_BRIDGE = { version: '1.0.0', ready: true };

console.log('[SPX Bridge] dashboard-bridge loaded');

window.spxBridgePull = function (hub, startDate) {
  console.log('[SPX Bridge] pull-export requested', { hub: hub || 'Bauko', startDate });
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'pull-export', hub: hub || 'Bauko', startDate: startDate || '' },
      function (resp) {
        if (chrome.runtime.lastError) {
          console.error('[SPX Bridge] runtime error:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!resp) {
          reject(new Error('No response from background worker.'));
          return;
        }
        if (resp.ok) {
          console.log('[SPX Bridge] pull-export succeeded');
          resolve(resp);
        } else {
          console.error('[SPX Bridge] pull-export failed:', resp.error);
          reject(new Error(resp.error || 'bridge failed'));
        }
      }
    );
  });
};
