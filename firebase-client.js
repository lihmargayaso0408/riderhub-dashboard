// Firebase client helper
// This file expects Firebase SDK scripts and firebase-config.js to be loaded first.

function getFirebaseApp() {
  if (!window.firebase || typeof window.firebase.initializeApp !== 'function') {
    throw new Error('Firebase SDK is not loaded. Ensure firebase-app.js and firebase-config.js are included.');
  }

  if (window.firebase.apps && window.firebase.apps.length > 0) {
    return window.firebase.app();
  }

  return window.initFirebaseApp ? window.initFirebaseApp() : window.firebase.initializeApp(window.FIREBASE_CONFIG);
}

function getFirestore() {
  const app = getFirebaseApp();
  if (!window.firebase.firestore) {
    throw new Error('Firebase Firestore SDK is not loaded. Include firebase-firestore.js.');
  }
  return window.firebase.firestore(app);
}

function getAuth() {
  const app = getFirebaseApp();
  if (!window.firebase.auth) {
    throw new Error('Firebase Auth SDK is not loaded. Include firebase-auth.js.');
  }
  return window.firebase.auth(app);
}

function getStorage() {
  const app = getFirebaseApp();
  if (!window.firebase.storage) {
    throw new Error('Firebase Storage SDK is not loaded. Include firebase-storage.js.');
  }
  return window.firebase.storage(app);
}

window.getFirebaseApp = getFirebaseApp;
window.getFirestore = getFirestore;
window.getAuth = getAuth;
window.getStorage = getStorage;
