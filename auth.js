// auth.js — shared authentication + per-user access control.
// Backed by localStorage (no Cloudflare Worker).
// Loaded as a module on every page.

const ALL_HUBS = ['Abra-Bucay', 'Bacarra', 'Badoc', 'Bangued', 'Bangui', 'Bantay', 'Bauko', 'Buguias', 'Candon', 'Dolores-Abra', 'Ilocos Sur', 'Ilocos Sur-Santa Lucia', 'Ilocos Sur-Santa Maria', 'Irisan', 'Itogon', 'Itogon Tuding', 'Kapangan', 'La Paz Abra', 'La Trinidad Pico', 'Laoag', 'MB Atok', 'Narvacan', 'North Laoag', 'San Nicolas', 'Santo Domingo', 'Tagudin'];
const REMOVED_HUBS = ['MB Mankayan'];
function isHubActive(hub) {
  return !REMOVED_HUBS.some(removed => removed.toLowerCase() === String(hub || '').trim().toLowerCase());
}
function sortHubs(hubs) {
  return hubs.filter(isHubActive).slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}
const ALL_ACTIONS = ['upload', 'delete', 'download'];
const ALL_PAGES = [
  { key: 'loss', file: 'loss-report.html' },
  { key: 'ranking', file: 'rider-ranking.html' },
  { key: 'accounts', file: 'accounts.html' },
  { key: 'hub-location', file: 'hub-location.html' }
];
const ADMIN_EMAILS = ['lihmar.gayaso@spxexpress.com'];

function emptyActions() { return Object.fromEntries(ALL_ACTIONS.map(a => [a, false])); }
function fullActions() { return Object.fromEntries(ALL_ACTIONS.map(a => [a, true])); }
function fullPages() { return ALL_PAGES.map(p => p.key); }

function nowISO() { return new Date().toISOString(); }

const SESSION_KEY = 'spx-auth-user';
const USER_PREFIX = 'spx-user-';
const HUBS_KEY = 'spx-hubs';

function userKey(uid) { return USER_PREFIX + uid; }

// ---- Password hashing (SHA-256 with salt, same as worker) ----
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '|' + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
async function verifyPassword(password, storedHash, salt) {
  const computed = await hashPassword(password, salt);
  return computed === storedHash;
}

// ---- localStorage profile storage ----
function readProfile(uid) {
  try {
    const raw = localStorage.getItem(userKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function writeProfile(uid, data) {
  try { localStorage.setItem(userKey(uid), JSON.stringify(data)); } catch (e) { /* ignore quota errors */ }
  return data;
}
async function patchProfile(uid, patch) {
  const profile = readProfile(uid) || {};
  const merged = Object.assign({}, profile, patch, { updatedAt: nowISO() });
  writeProfile(uid, merged);
  return merged;
}
function listUsers(status) {
  const users = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(USER_PREFIX)) continue;
    try {
      const u = JSON.parse(localStorage.getItem(key));
      if (u && (!status || u.status === status)) users.push(u);
    } catch (e) {}
  }
  return users;
}

// ---- Hubs (localStorage) ----
function readHubsList() {
  try {
    const raw = localStorage.getItem(HUBS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function writeHubsList(names) {
  try { localStorage.setItem(HUBS_KEY, JSON.stringify(names)); } catch (e) { /* ignore */ }
}
async function addHubRemote(name) {
  const existing = readHubsList() || [];
  if (!existing.some(h => h.toLowerCase() === String(name).toLowerCase())) {
    existing.push(name);
    writeHubsList(existing);
  }
}

// ---- Session ----
function sessionGet() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function sessionSet(user) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch (e) { /* ignore */ }
}
function sessionClear() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}

// ---- Auth over localStorage ----
async function ensureProfileFromLogin(user) {
  const email = (user.email || '').toLowerCase();
  const isAdmin = ADMIN_EMAILS.includes(email);
  let profile = null;
  try { profile = readProfile(user.uid); } catch (e) { console.warn('ensureProfile read failed', e); }
  if (!profile) {
    const data = {
      uid: user.uid,
      email: user.email || '',
      name: user.displayName || user.email || '',
      status: isAdmin ? 'approved' : 'pending',
      role: isAdmin ? 'admin' : 'user',
      hubs: isAdmin ? ALL_HUBS.slice() : [],
      actions: isAdmin ? fullActions() : emptyActions(),
      pages: isAdmin ? fullPages() : fullPages(),
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    try { writeProfile(user.uid, data); } catch (e) { console.warn('ensureProfile create failed', e); }
    return data;
  }
  if (isAdmin && profile.role !== 'admin') {
    const patch = {
      role: 'admin', status: 'approved',
      hubs: ALL_HUBS.slice(), actions: fullActions(), pages: fullPages(),
      updatedAt: nowISO()
    };
    try { patchProfile(user.uid, patch); } catch (e) { console.warn('ensureProfile admin patch failed', e); }
    return Object.assign({}, profile, patch);
  }
  return profile;
}

async function register(email, password) {
  if (!email || !password) throw new Error('Email and password are required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  const uid = email.toLowerCase();
  if (readProfile(uid)) throw new Error('Account already exists');
  const passwordHash = await hashPassword(password, '');
  const profile = {
    uid,
    email: uid,
    name: email,
    status: 'pending',
    role: 'user',
    hubs: [],
    actions: {},
    pages: [],
    passwordHash,
    createdAt: nowISO(),
    updatedAt: nowISO()
  };
  writeProfile(uid, profile);
  return { ok: true, user: { uid, email, name: profile.name, status: 'pending' } };
}

async function login(email, password) {
  if (!email || !password) throw new Error('Email and password are required.');
  const uid = email.toLowerCase();
  const profile = readProfile(uid);
  if (!profile || !profile.passwordHash) throw new Error('Invalid email or password');
  const ok = await verifyPassword(password, profile.passwordHash, '');
  if (!ok) throw new Error('Invalid email or password');
  const user = { uid, email: profile.email, name: profile.name, status: profile.status, role: profile.role };
  sessionSet(user);
  return user;
}

async function logout() {
  sessionClear();
}

async function sendPasswordReset(email) {
  // No email backend in localStorage mode — nothing to send.
}

function mergeHubs(names) {
  const seen = new Set();
  const merged = [];
  ALL_HUBS.forEach(h => { seen.add(h.toLowerCase()); merged.push(h); });
  names.forEach(n => {
    if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); merged.push(n); }
  });
  return sortHubs(merged);
}

const Auth = {
  ALL_HUBS, ALL_ACTIONS, ALL_PAGES, ADMIN_EMAILS, isHubActive, sortHubs,
  HUB_FALLBACK: sortHubs(ALL_HUBS),
  _hubsPromise: null,
  _hubsCache: null,
  _hubsCachedAt: 0,
  _hubTimer: null,
  _hubLast: null,
  _hubCbs: [],
  onAuthChange(cb) {
    const user = sessionGet();
    try { cb(user); } catch (e) { }
    return () => { /* no-op */ };
  },
  currentUser() {
    return sessionGet();
  },
  async register(email, password) {
    return await register(email, password);
  },
  async login(email, password) {
    return await login(email, password);
  },
  async logout() {
    await logout();
  },
  async sendPasswordReset(email) {
    return await sendPasswordReset(email);
  },
  async getProfile(uid) {
    try { return readProfile(uid); } catch (e) { return null; }
  },
  async ensureProfile(user) {
    return await ensureProfileFromLogin(user);
  },
  whenReady() {
    return new Promise(resolve => {
      const u = sessionGet();
      if (u) return resolve(u);
      resolve(null);
    });
  },
  async guard(pageKey) {
    const user = sessionGet();
    if (!user) { window.location.href = 'login.html'; return null; }
    let profile = await ensureProfileFromLogin(user);
    if (!profile) { window.location.href = 'login.html'; return null; }
    if (profile.status === 'pending') { window.location.href = 'login.html?state=pending'; return null; }
    if (profile.status === 'rejected') { window.location.href = 'login.html?state=rejected'; return null; }
    if (ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
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
    return profile;
  },
  async listPending() {
    try {
      const users = listUsers('pending');
      return users.map(u => ({ uid: u.uid, id: u.uid, ...u }));
    } catch (e) {
      console.warn('listPending failed', e);
      return [];
    }
  },
  async setPerms(uid, { hubs, actions, status, pages }) {
    const activeHubs = hubs ? hubs.filter(isHubActive) : hubs;
    const data = { hubs: activeHubs, actions, status, updatedAt: nowISO() };
    if (pages !== undefined) data.pages = pages;
    await patchProfile(uid, data);
  },
  async reject(uid) {
    await patchProfile(uid, { status: 'rejected', updatedAt: nowISO() });
  },
  async listAccounts() {
    try {
      const users = listUsers('approved');
      return users.map(u => ({ uid: u.uid, id: u.uid, ...u }));
    } catch (e) {
      console.warn('listAccounts failed', e);
      return [];
    }
  },
  async removeAccess(uid) {
    await patchProfile(uid, { status: 'rejected', updatedAt: nowISO() });
  },
  async getHubs() {
    if (Auth._hubsCache && Date.now() - Auth._hubsCachedAt < 30000) return Auth._hubsCache;
    if (!Auth._hubsPromise) {
      Auth._hubsPromise = Auth._readHubs().finally(() => { Auth._hubsPromise = null; });
    }
    const hubs = await Auth._hubsPromise;
    Auth._hubsCache = hubs;
    Auth._hubsCachedAt = Date.now();
    return hubs;
  },
  async _readHubs() {
    try {
      const names = readHubsList();
      const active = (names || []).filter(name => name && isHubActive(name));
      if (active.length) return mergeHubs(active);
    } catch (e) { }
    return ALL_HUBS.slice();
  },
  onHubsChange(cb) {
    Auth._hubCbs.push(cb);
    if (Auth._hubCbs.length === 1) startHubPolling();
    Auth.getHubs().then(hubs => { try { cb(hubs); } catch (e) { } });
    return () => {
      Auth._hubCbs = Auth._hubCbs.filter(c => c !== cb);
      if (Auth._hubCbs.length === 0) stopHubPolling();
    };
  },
  async addHub(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Hub name is required.');
    if (!isHubActive(trimmed)) throw new Error('This hub is no longer available.');
    Auth._hubsCache = null;
    Auth._hubsCachedAt = 0;
    const existing = await Auth.getHubs();
    if (existing.some(h => h.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('A hub named "' + trimmed + '" already exists.');
    }
    await addHubRemote(trimmed);
    Auth._hubsCache = null;
    Auth._hubsCachedAt = 0;
    return trimmed;
  },
  async seedHubsIfEmpty() {
    try {
      await Auth.getHubs();
      const names = readHubsList();
      if (names && names.length) return;
      await Promise.all(ALL_HUBS.map(h => addHubRemote(h)));
    } catch (e) { }
  }
};

function startHubPolling() {
  if (Auth._hubTimer) return;
  Auth._hubTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const names = readHubsList();
      const snapshot = JSON.stringify(names);
      if (snapshot !== Auth._hubLast) {
        Auth._hubLast = snapshot;
        const hubs = mergeHubs((names || []).filter(name => name && isHubActive(name)));
        const cbs = Auth._hubCbs.slice();
        for (const cb of cbs) { try { cb(hubs); } catch (e) { } }
      }
    } catch (e) { /* ignore */ }
  }, 5000);
}
function stopHubPolling() {
  if (Auth._hubTimer) { clearInterval(Auth._hubTimer); Auth._hubTimer = null; }
}

window.Auth = Auth;
