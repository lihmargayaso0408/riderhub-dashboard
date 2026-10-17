// cloudflare-api.js
// Browser-side client for the Cloudflare Worker backend.
// Replaces firebase-client.js. Same window.firebaseAPI shape so the rest of
// the app can stay unchanged (get/set/delete/list/subscribe).
//
// Configure CLOUDFLARE_WORKER_URL in cloudflare-config.js to point at your
// deployed Worker (e.g. https://rider-performance.spxexpress.workers.dev).

const WORKER_URL = window.CLOUDFLARE_WORKER_URL || '';

function isEnabled() {
  return !!WORKER_URL;
}

function apiPath(parts) {
  return WORKER_URL + '/api/' + parts.join('/');
}

async function request(method, path, body) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Worker request failed: ' + res.status + ' ' + text);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Real-time subscriptions: Cloudflare Workers don't have a built-in push
// mechanism, so we poll. The poll interval is short enough that the UI
// feels live, but long enough to avoid hammering the endpoint.
let subscribers = [];
let pollTimer = null;
const POLL_INTERVAL = 5000;

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (document.hidden) return;
    for (const cb of subscribers) {
      try { await cb(); } catch (e) { /* ignore */ }
    }
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

window.cloudflareAPI = {
  isEnabled,

  async set(key, value) {
    if (!isEnabled()) return null;
    await request('POST', apiPath(['data', key]), { content: value, updated: new Date().toISOString() });
    return { key, value };
  },

  async get(key) {
    if (!isEnabled()) return null;
    const value = await request('GET', apiPath(['data', key]));
    return value ? { key, value: value.content } : null;
  },

  async delete(key) {
    if (!isEnabled()) return null;
    await request('DELETE', apiPath(['data', key]));
    return { key, deleted: true };
  },

  async list(prefix = '') {
    if (!isEnabled()) return { keys: [] };
    const url = apiPath(['data']) + (prefix ? '?prefix=' + encodeURIComponent(prefix) : '');
    const result = await request('GET', url);
    return { keys: (result && result.keys) || [] };
  },

  // Poll-based subscription. Callback receives an array of changed keys
  // (best-effort — the worker can't tell us exactly what changed, so we pass
  // the full key list on each poll and let callers diff).
  subscribe(callback) {
    if (!isEnabled()) return () => {};
    if (subscribers.length === 0) startPolling();
    subscribers.push(callback);

    // Fire once immediately so callers get data without waiting for a poll.
    callback([]);

    return () => {
      subscribers = subscribers.filter(s => s !== callback);
      if (subscribers.length === 0) stopPolling();
    };
  }
};

// Backwards-compatible alias — many files check window.firebaseAPI.
window.firebaseAPI = window.cloudflareAPI;