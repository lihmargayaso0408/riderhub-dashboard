// data-cache.js
// Connection-friendly caching for slow / unreliable networks.
//
// Every Google Sheet read in this app goes through cachedFetchText() instead of
// fetch(). That buys three things on a slow connection:
//   1. Repeat visits render instantly from localStorage (no network at all).
//   2. Concurrent requests for the same URL share one in-flight request.
//   3. If the network is down or a request times out, the last good copy is
//      used instead of showing an error.

const NS = 'spx-data-cache-v1:';
const DEFAULT_TTL = 5 * 60 * 1000;        // treat as fresh for 5 minutes
const FALLBACK_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // still usable as a fallback for 7 days
const MAX_CACHE_CHARS = 2_000_000;        // skip caching anything bigger than this
const DEFAULT_TIMEOUT = 30000;

const inflight = new Map();      // real fetches — these resolve to text, never null
const revalidating = new Set();  // background refreshes — never handed to callers

// Small, stable, non-cryptographic hash so cache keys stay short.
function hashKey(url) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c + i, 2246822519) >>> 0;
  }
  return url.length.toString(36) + '-' + h1.toString(36) + '-' + h2.toString(36);
}

function readEntry(url) {
  try {
    const raw = localStorage.getItem(NS + hashKey(url));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.text !== 'string' || !entry.t) return null;
    return entry;
  } catch (e) {
    return null;
  }
}

function writeEntry(url, text) {
  if (typeof text !== 'string' || text.length > MAX_CACHE_CHARS) return;
  try {
    localStorage.setItem(NS + hashKey(url), JSON.stringify({ t: Date.now(), url: url, text: text }));
  } catch (e) {
    // Quota exceeded — drop the oldest entries once and retry, then give up.
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(NS) === 0) keys.push(k);
      }
      keys.slice(0, Math.max(1, Math.ceil(keys.length / 4))).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(NS + hashKey(url), JSON.stringify({ t: Date.now(), url: url, text: text }));
    } catch (e2) { /* cache is best-effort only */ }
  }
}

function networkFetch(url, timeout) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  return fetch(url, controller ? { signal: controller.signal } : undefined)
    .then(response => {
      if (timer) clearTimeout(timer);
      if (!response.ok) throw new Error('Request failed with status ' + response.status);
      return response.text();
    })
    .catch(err => {
      if (timer) clearTimeout(timer);
      throw err;
    });
}

// Quietly refresh a stale copy. Deliberately kept out of `inflight`: a
// background refresh must never be handed to a caller, because it resolves to
// null on failure and callers expect response text.
function revalidate(url) {
  const k = hashKey(url);
  if (revalidating.has(k)) return;
  revalidating.add(k);
  networkFetch(url, DEFAULT_TIMEOUT)
    .then(text => { writeEntry(url, text); })
    .catch(() => { /* offline — keep the stale copy */ })
    .then(() => { revalidating.delete(k); });
}

/**
 * fetch() with a local cache layer.
 *
 * @param {string} url
 * @param {{ttl?:number, timeout?:number, force?:boolean}} [opts]
 * @returns {Promise<string>} response text
 */
export function cachedFetchText(url, opts) {
  const options = opts || {};
  const ttl = typeof options.ttl === 'number' ? options.ttl : DEFAULT_TTL;
  const timeout = typeof options.timeout === 'number' ? options.timeout : DEFAULT_TIMEOUT;
  const entry = readEntry(url);
  const age = entry ? Date.now() - entry.t : Infinity;

  if (entry && !options.force && age < ttl) return Promise.resolve(entry.text);

  // Stale copy: show it immediately, refresh in the background.
  if (entry && !options.force) {
    revalidate(url);
    return Promise.resolve(entry.text);
  }

  if (inflight.has(hashKey(url))) return inflight.get(hashKey(url));

  const task = networkFetch(url, timeout)
    .then(text => {
      writeEntry(url, text);
      inflight.delete(hashKey(url));
      return text;
    })
    .catch(err => {
      inflight.delete(hashKey(url));
      // Offline / timeout: a slightly old copy beats an error screen.
      if (entry && Date.now() - entry.t < FALLBACK_MAX_AGE) return entry.text;
      throw err;
    });

  inflight.set(hashKey(url), task);
  return task;
}

/** Force the next read to hit the network (still falls back to cache on failure). */
export function refreshText(url, opts) {
  return cachedFetchText(url, Object.assign({}, opts, { force: true }));
}

/** Drop cached copies — used when the user clears stored data. */
export function clearDataCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(NS) === 0) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch (e) { /* nothing to clear */ }
}
