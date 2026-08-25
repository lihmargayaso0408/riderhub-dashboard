// firebase-client.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
const db = getFirestore(app);

window.firebaseAPI = {
  isEnabled: () => !!window.FIREBASE_CONFIG.apiKey,
  
  async set(key, value) {
    const docRef = doc(db, "dispatch_data", key.replace(/:/g, '_')); 
    await setDoc(docRef, { content: value, updated: new Date().toISOString() });
    return { key, value };
  },

  async get(key) {
    const docRef = doc(db, "dispatch_data", key.replace(/:/g, '_'));
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { key, value: docSnap.data().content };
    }
    return null;
  },

  async delete(key) {
    const docRef = doc(db, "dispatch_data", key.replace(/:/g, '_'));
    await deleteDoc(docRef);
    return { key, deleted: true };
  },

  async list(prefix = '') {
    const querySnapshot = await getDocs(collection(db, "dispatch_data"));
    const keys = [];
    querySnapshot.forEach((doc) => {
      const originalKey = doc.id.replace(/_/g, ':');
      if (!prefix || originalKey.startsWith(prefix)) {
        keys.push(originalKey);
      }
    });
    return { keys };
  },

  subscribe(callback) {
    if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
      console.warn('Firebase not configured — real-time subscription disabled');
      return () => {};
    }
    const q = collection(db, "dispatch_data");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const changedKeys = [];
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified' || change.type === 'removed') {
          changedKeys.push(change.doc.id.replace(/_/g, ':'));
        }
      });
      if (changedKeys.length > 0) {
        callback(changedKeys);
      }
    }, (err) => {
      console.error('Firebase real-time listener error:', err);
    });
    return unsubscribe;
  }
};