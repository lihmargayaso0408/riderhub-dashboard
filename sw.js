// sw.js — cache for pinned third-party libraries only.
//
// SCOPE NOTE: this worker deliberately does NOT cache the app's own HTML, CSS or
// JS. An earlier version cached the app shell with stale-while-revalidate, and on
// a slow connection the 3s timeout kept serving the cached copy — so fixes never
// reached the browser and pages looked broken for as long as the connection was
// slow. App code now always goes straight to the network; the browser's normal
// cache and the IndexedDB caches in firestore-setup.js / data-cache.js handle the
// data side.
//
// Cached here (safe because these are version-pinned URLs that never change
// content in place):
//   • Firebase SDK modules (gstatic)   • Leaflet (unpkg)
//   • PapaParse (jsdelivr)              • Google Fonts
//
// Firestore and Auth traffic never touches this worker.
const VERSION = 'spx-vendor-v7';
const VENDOR_CACHE = VERSION + '-vendor';

const VENDOR_HOSTS = [
  'www.gstatic.com',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VENDOR_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Cache-first for pinned vendor libraries; everything else is left alone.
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (VENDOR_HOSTS.indexOf(url.hostname) === -1) return; // never intercept app code or API calls

  event.respondWith((async () => {
    const cache = await caches.open(VENDOR_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      // Refresh quietly; the next load gets the newer copy.
      fetch(request).then(response => {
        if (response && response.status === 200) cache.put(request, response.clone());
      }).catch(() => {});
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    } catch (e) {
      // Offline and uncached: let the browser show its own network error.
      throw e;
    }
  })());
});
