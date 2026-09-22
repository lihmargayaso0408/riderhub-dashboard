// auth.js — shared authentication + per-user access control.
// Loaded as a module on every page (after firebase-config.js).
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, where, getDocs, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const app = getApps().length ? getApps()[0] : initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const ALL_HUBS = ['Bauko', 'Buguias', 'Irisan', 'Itogon', 'Itogon Tuding', 'Kapangan', 'La Trinidad Pico', 'MB Atok'];
const REMOVED_HUBS = ['MB Mankayan'];
function isHubActive(hub) {
  return !REMOVED_HUBS.some(removed => removed.toLowerCase() === String(hub || '').trim().toLowerCase());
}
function sortHubs(hubs) {
  return hubs.filter(isHubActive).slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}
const ALL_ACTIONS = ['upload', 'delete', 'download'];
const ALL_PAGES = [
  { key: 'riders', file: 'riders-agency.html' },
  { key: 'loss', file: 'loss-report.html' },
  { key: 'pnr', file: 'pnr.html' },
  { key: 'dtr', file: 'riders-dtr.html' },
  { key: 'map', file: 'area-map.html' },
  { key: 'ranking', file: 'rider-ranking.html' },
  { key: 'accounts', file: 'accounts.html' }
];

// Owner email(s). Anyone signing in with one of these is auto-promoted to admin.
// The admin can approve requests and set each user's hubs + actions.
const ADMIN_EMAILS = ['lihmar.gayaso@spxexpress.com']; // TODO: add your email(s) here, e.g. 'you@gmail.com'

function emptyActions() { return Object.fromEntries(ALL_ACTIONS.map(a => [a, false])); }
function fullActions() { return Object.fromEntries(ALL_ACTIONS.map(a => [a, true])); }
function fullPages() { return ALL_PAGES.map(p => p.key); }

async function ensureProfile(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const email = (user.email || '').toLowerCase();
  const isAdmin = ADMIN_EMAILS.includes(email);

  if (!snap.exists()) {
    const data = {
      email: user.email || '',
      name: user.displayName || user.email || '',
      status: isAdmin ? 'approved' : 'pending',
      role: isAdmin ? 'admin' : 'user',
      hubs: isAdmin ? ALL_HUBS.slice() : [],
      actions: isAdmin ? fullActions() : emptyActions(),
      pages: isAdmin ? fullPages() : fullPages(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, data);
    return data;
  }

  const d = snap.data();
  if (isAdmin && d.role !== 'admin') {
    const patch = {
      role: 'admin', status: 'approved',
      hubs: ALL_HUBS.slice(), actions: fullActions(), pages: fullPages(),
      updatedAt: serverTimestamp()
    };
    await updateDoc(ref, patch);
    return Object.assign({}, d, patch);
  }
  return d;
}

const Auth = {
  auth, db, ALL_HUBS, ALL_ACTIONS, ALL_PAGES, ADMIN_EMAILS, isHubActive, sortHubs,

  onAuthChange(cb) { return onAuthStateChanged(auth, cb); },
  currentUser() { return auth.currentUser; },

  async register(email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await ensureProfile(cred.user); // status: 'pending' (unless admin)
    return cred.user;
  },
  async login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  },
  async logout() { await signOut(auth); },

  async getProfile(uid) {
    const s = await getDoc(doc(db, 'users', uid));
    return s.exists() ? s.data() : null;
  },
  ensureProfile,

  // Resolves with the user (or null) once auth state is restored.
  // Fixes the common race where auth.currentUser is null on first load.
  whenReady() {
    return new Promise(resolve => {
      const u = auth.currentUser;
      if (u) return resolve(u);
      const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
    });
  },

  // Call at the very start of every protected page.
  // Pass a pageKey to enforce page-level access control.
  // Returns the approved profile, or redirects away (returns null).
  async guard(pageKey) {
    const user = await Auth.whenReady();
    if (!user) { window.location.href = 'login.html'; return null; }
    let profile = await ensureProfile(user);
    if (profile.status === 'pending') { window.location.href = 'login.html?state=pending'; return null; }
    if (profile.status === 'rejected') { window.location.href = 'login.html?state=rejected'; return null; }
    if (ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
      // Admins always get every hub (dynamic list, including newly added ones)
      // and full actions/pages.
      let allHubs;
      try { allHubs = await Auth.getHubs(); } catch (e) { allHubs = ALL_HUBS.slice(); }
      profile = Object.assign({}, profile, {
        role: 'admin', hubs: allHubs, actions: fullActions(), pages: fullPages()
      });
    }
    const allowedPages = profile.pages === undefined || profile.pages === null ? fullPages() : profile.pages;
    if (pageKey && allowedPages.indexOf(pageKey) === -1) {
      window.location.href = 'index.html';
      return null;
    }
    try {
      await user.getIdToken(true);
    } catch (e) {
      console.error('Token refresh failed in guard:', e);
    }
    return profile;
  },

  async listPending() {
    const q = query(collection(db, 'users'), where('status', '==', 'pending'));
    const s = await getDocs(q);
    return s.docs.map(d => ({ uid: d.id, id: d.id, ...d.data() }));
  },
  async setPerms(uid, { hubs, actions, status, pages }) {
    const activeHubs = hubs ? hubs.filter(isHubActive) : hubs;
    const data = { hubs: activeHubs, actions, status, updatedAt: serverTimestamp() };
    if (pages !== undefined) data.pages = pages;
    await updateDoc(doc(db, 'users', uid), data);
  },
  async reject(uid) {
    await updateDoc(doc(db, 'users', uid), { status: 'rejected', updatedAt: serverTimestamp() });
  },

  // Returns every approved account (the accounts that can log in).
  // Each item is { uid, email, name, hubs, actions, role, updatedAt }.
  async listAccounts() {
    const q = query(collection(db, 'users'), where('status', '==', 'approved'));
    const s = await getDocs(q);
    return s.docs.map(d => ({ uid: d.id, id: d.id, ...d.data() }));
  },
  // Revoke access for an approved account. The account can no longer log in.
  async removeAccess(uid) {
    await updateDoc(doc(db, 'users', uid), { status: 'rejected', updatedAt: serverTimestamp() });
  },

  // ---- Hub registry (Firestore `hubs` collection) ----
  // Hubs are stored as individual docs in a `hubs` collection.
  // Each doc has: { name: 'Bauko', createdAt: timestamp }
  // We always merge with the hardcoded ALL_HUBS fallback so existing
  // deployments without Firestore data keep working.

  HUB_FALLBACK: sortHubs(ALL_HUBS),

  // Returns the canonical hub list (case-insensitive, deterministic order).
  // Reads from Firestore `hubs` collection; falls back to ALL_HUBS when
  // Firebase is unavailable or the collection is empty.
  async getHubs() {
    try {
      const snap = await getDocs(collection(db, 'hubs'));
      const names = snap.docs
        .map(d => (d.data().name || '').trim())
        .filter(name => name && isHubActive(name));
      if (names.length) {
        const seen = new Set();
        const merged = [];
        // Hardcoded defaults first (preserve order), then Firestore additions.
        ALL_HUBS.forEach(h => { seen.add(h.toLowerCase()); merged.push(h); });
        names.forEach(n => {
          if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); merged.push(n); }
        });
        return sortHubs(merged);
      }
    } catch (e) { /* fall through to fallback */ }
    return ALL_HUBS.slice();
  },

  // Subscribe to hub list changes via onSnapshot on the `hubs` collection.
  // Returns an unsubscribe function. Falls back to a no-op if Firebase is
  // unavailable.
  onHubsChange(cb) {
    try {
      return onSnapshot(collection(db, 'hubs'), snap => {
        const names = snap.docs
          .map(d => (d.data().name || '').trim())
          .filter(name => name && isHubActive(name));
        if (!names.length) { cb(ALL_HUBS.slice()); return; }
        const seen = new Set();
        const merged = [];
        ALL_HUBS.forEach(h => { seen.add(h.toLowerCase()); merged.push(h); });
        names.forEach(n => {
          if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); merged.push(n); }
        });
        cb(sortHubs(merged));
      }, err => { console.error('onHubsChange error:', err); });
    } catch (e) {
      return () => {};
    }
  },

  // Add a new hub to the `hubs` collection. Rejects empty/duplicate names
  // (case-insensitive). Returns the hub name on success.
  async addHub(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Hub name is required.');
    if (!isHubActive(trimmed)) throw new Error('This hub is no longer available.');
    // Reject duplicates against the current merged list (case-insensitive).
    const existing = await this.getHubs();
    if (existing.some(h => h.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('A hub named "' + trimmed + '" already exists.');
    }
    const ref = await addDoc(collection(db, 'hubs'), {
      name: trimmed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return trimmed;
  },

  // Seed the `hubs` collection with the hardcoded defaults if it's empty.
  // Safe to call on every page load — only writes when collection is empty.
  async seedHubsIfEmpty() {
    try {
      const snap = await getDocs(collection(db, 'hubs'));
      if (snap.size > 0) return;
      const batch = [];
      ALL_HUBS.forEach(h => {
        batch.push(addDoc(collection(db, 'hubs'), {
          name: h,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }));
      });
      await Promise.all(batch);
    } catch (e) { /* Firebase unavailable — fallback covers it */ }
  }
};

window.Auth = Auth;
