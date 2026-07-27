// Firebase configuration placeholder
// Replace the values below with your Firebase project settings.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAFy3ZIOZQNEShjV57JMxLaHQ2DNH6foFE",
  authDomain: "dashboard-3ef3e.firebaseapp.com",
  projectId: "dashboard-3ef3e",
  storageBucket: "dashboard-3ef3e.firebasestorage.app",
  messagingSenderId: "915179409949",
  appId: "1:915179409949:web:3927f37398ab00465aacf4",
  measurementId: "G-CRJ384EEX3",
};

window.FIREBASE_CONFIG = FIREBASE_CONFIG;

/**
 * Initialize Firebase if the Firebase SDK is loaded.
 * Call initFirebaseApp() after adding the Firebase SDK scripts.
 */
function initFirebaseApp(customConfig) {
  const config = customConfig || FIREBASE_CONFIG;

  if (!window.firebase || typeof window.firebase.initializeApp !== 'function') {
    console.warn('Firebase SDK is not loaded yet. Load Firebase scripts before firebase-config.js.');
    return null;
  }

  if (!window.firebase.apps || window.firebase.apps.length === 0) {
    return window.firebase.initializeApp(config);
  }

  return window.firebase.app();
}

window.initFirebaseApp = initFirebaseApp;
