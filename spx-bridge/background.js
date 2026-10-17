// background.js — orchestrates a pull:
//   dashboard -> PULL -> find/open the SPX report tab -> EXTRACT -> CSV back to dashboard.
const SPX_URL = 'https://spx.shopee.ph/#/driverLMPerformanceReport/list';
const SPX_MATCH = 'https://spx.shopee.ph/*';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function withTimeout(promise, ms, message) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(message)), ms))]);
}

async function getSpxTab() {
  const tabs = await chrome.tabs.query({ url: SPX_MATCH });
  let tab = tabs.find(t => /driverLMPerformanceReport/.test(t.url || '')) || tabs[0];
  if (!tab) {
    tab = await chrome.tabs.create({ url: SPX_URL, active: false });
    await waitForComplete(tab.id);
    await sleep(2500);
  } else if (!/driverLMPerformanceReport/.test(tab.url || '')) {
    await chrome.tabs.update(tab.id, { url: SPX_URL });
    await sleep(1500);
    await waitForComplete(tab.id);
    await sleep(2500);
  }
  return chrome.tabs.get(tab.id);
}

function waitForComplete(tabId) {
  return new Promise(resolve => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(t => { if (t.status === 'complete') done(); }).catch(done);
    setTimeout(done, 30000);
  });
}

async function pingTab(tabId) {
  for (let i = 0; i < 20; i++) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (r && r.ok) return true;
    } catch (e) { /* content script not ready yet */ }
    await sleep(750);
  }
  return false;
}

async function pull(hub, startDate) {
  const tab = await getSpxTab();
  if (/login|passport|signin/i.test(tab.url || '')) {
    await chrome.tabs.update(tab.id, { active: true });
    return { ok: false, error: 'SPX is asking you to log in. Log in in the SPX tab, then press Data pull again.' };
  }
  if (!(await pingTab(tab.id))) {
    return { ok: false, error: 'Could not reach the SPX tab. Reload it (F5) and try again.' };
  }
  const res = await withTimeout(
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT', opts: { hub, startDate } }),
    150000,
    'Timed out waiting for the SPX report to load.'
  );
  if (res && res.error === 'NOT_LOGGED_IN') {
    await chrome.tabs.update(tab.id, { active: true });
    return { ok: false, error: 'SPX is asking you to log in. Log in in the SPX tab, then press Data pull again.' };
  }
  return res || { ok: false, error: 'No response from the SPX tab.' };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'PULL') {
    pull(msg.hub, msg.startDate)
      .then(sendResponse)
      .catch(e => sendResponse({ ok: false, error: (e && e.message) || String(e) }));
    return true;
  }
});
