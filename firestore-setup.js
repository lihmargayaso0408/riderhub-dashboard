// firestore-setup.js
// One shared Firestore instance for the whole app, backed by a persistent
// local cache (IndexedDB) when possible.
//
// Without persistence, every page load waits on the network for data that was
// already downloaded. With it, reads come from the local cache immediately and
// sync in the background — which is what makes the app usable on a slow or
// flaky connection (and offline).
//
// This module never blocks app startup: it returns the Firestore instance
// synchronously, and any failure to set up persistence is non-fatal.
import * as Firestore from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let dbInstance = null;

export function getSharedDb(app) {
  if (dbInstance) return dbInstance;
  dbInstance = createDb(app);
  return dbInstance;
}

function createDb(app) {
  // Preferred: persistent local cache with multi-tab support, created up front
  // so the very first read is already backed by IndexedDB.
  try {
    if (typeof Firestore.initializeFirestore === 'function' &&
        typeof Firestore.persistentLocalCache === 'function' &&
        typeof Firestore.persistentMultipleTabManager === 'function') {
      const db = Firestore.initializeFirestore(app, {
        localCache: Firestore.persistentLocalCache({
          tabManager: Firestore.persistentMultipleTabManager()
        })
      });
      console.info('Firestore offline cache enabled.');
      return db;
    }
  } catch (e) {
    // initializeFirestore throws if the app was already initialised — in that
    // case just use the existing instance below.
    console.warn('Firestore persistent cache not applied:', e && e.message);
  }

  const db = Firestore.getFirestore(app);
  enableLegacyOfflineCache(db);
  return db;
}

// Fallback for SDK builds without persistentLocalCache.
function enableLegacyOfflineCache(db) {
  const options = { experimentalForceLongPolling: true };
  const candidates = [
    Firestore.enableMultiTabIndexedDbPersistence, // note: "MultiTab", not "MultipleTab"
    Firestore.enableIndexedDbPersistence
  ];
  (async () => {
    for (const enable of candidates) {
      if (typeof enable !== 'function') continue;
      try {
        await enable(db, options);
        console.info('Firestore offline cache enabled (legacy API).');
        return;
      } catch (e) {
        const code = e && e.code;
        // Already enabled / not supported in this browser — try the next one.
        if (code === 'failed-precondition' || code === 'unimplemented') continue;
        console.warn('Firestore offline cache unavailable:', e && e.message);
        return;
      }
    }
  })();
}
