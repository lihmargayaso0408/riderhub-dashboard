// firebase-client.js
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
const db = getFirestore(app);

window.firebaseAPI = {
  isEnabled: () => !!window.FIREBASE_CONFIG.apiKey,
  
  async set(key, value) {
    // We store the JSON string inside a document field called 'content'
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
  }
};