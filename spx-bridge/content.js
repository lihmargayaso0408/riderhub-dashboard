// content.js — injected into BAUKO project pages
window.BAUKO_BRIDGE = { version: '2.4.0', ready: true };
window.baukoBridgePull = function (hub, startDate) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'pull-export', hub, startDate }, (resp) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (resp && resp.ok) resolve(resp);
      else reject(new Error((resp && resp.error) || 'bridge failed'));
    });
  });
};