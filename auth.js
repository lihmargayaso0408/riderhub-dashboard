// auth.js — shared authentication + per-user access control.
// Backed by the Cloudflare Worker API (no Firebase).
// Loaded as a module on every page (after cloudflare-config.js + cloudflare-api.js).

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
const ADMIN_EMAILS = ['lihmar.gayaso@spxexpress.com'];

function emptyActions() { return Object.fromEntries(ALL_ACTIONS.map(a => [a, false])); }
function fullActions() { return Object.fromEntries(ALL_ACTIONS.map(a => [a, true])); }
function fullPages() { return ALL_PAGES.map(p => p.key); }

function workerBase() {
  return window.CLOUDFLARE_WORKER_URL || '';
}
function workerEnabled() {
  return !!workerBase();
}

async function workerRequest(method, path, body) {
  if (!workerEnabled()) throw new Error('Cloudflare Worker URL not configured.');
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(workerBase() + path, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Worker request failed: ' + res.status + ' ' + text);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function readProfile(uid) {
  const data = await workerRequest('GET', '/api/users/' + encodeURIComponent(uid));
  return data || null;
}
async function writeProfile(uid, data) {
  await workerRequest('POST', '/api/users/' + encodeURIComponent(uid), data);
  return data;
}
async function patchProfile(uid, patch) {
  await workerRequest('PATCH', '/api/users/' + encodeURIComponent(uid), patch);
  return patch;
}
async function listUsers(status) {
  const result = await workerRequest('GET', '/api/users?status=' + encodeURIComponent(status));
  return (result && result.users) || [];
}
async function readHubsList() {
  const value = await workerRequest('GET', '/api/hubs');
  return Array.isArray(value) ? value : (value && value.hubs) || [];
}
async function addHubRemote(name) {
  await workerRequest('POST', '/api/hubs', { name });
}

function nowISO() { return new Date().toISOString(); }

const SESSION_KEY = 'spx-auth-user';

// Persist the signed-in user so the app survives refreshes without Firebase Auth.
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

// ---- Auth over Cloudflare Worker ----
async function ensureProfileFromLogin(user) {
  const email = (user.email || '').toLowerCase();
  const isAdmin = ADMIN_EMAILS.includes(email);
  let profile = null;
  try { profile = await readProfile(user.uid); } catch (e) { console.warn('ensureProfile read failed', e); }
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
    try { await writeProfile(user.uid, data); } catch (e) { console.warn('ensureProfile create failed', e); }
    return data;
  }
  if (isAdmin && profile.role !== 'admin') {
    const patch = {
      role: 'admin', status: 'approved',
      hubs: ALL_HUBS.slice(), actions: fullActions(), pages: fullPages(),
      updatedAt: nowISO()
    };
    try { await patchProfile(user.uid, patch); } catch (e) { console.warn('ensureProfile admin patch failed', e); }
    return Object.assign({}, profile, patch);
  }
  return profile;
}

async function register(email, password) {
  if (!email || !password) throw new Error('Email and password are required.');
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  const res = await workerRequest('POST', '/api/auth/register', { email, password, name: email });
  if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Registration failed.');
  return res.user;
}

async function login(email, password) {
  if (!email || !password) throw new Error('Email and password are required.');
  const res = await workerRequest('POST', '/api/auth/login', { email, password });
  if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Login failed.');
  const user = res.user;
  sessionSet(user);
  return user;
}

async function logout() {
  try { await workerRequest('POST', '/api/auth/logout'); } catch (e) { /* ignore */ }
  sessionClear();
}

async function sendPasswordReset(email) {
  if (!email) throw new Error('Email is required.');
  await workerRequest('POST', '/api/auth/password-reset', { email });
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
    // No real-time auth state in Cloudflare Workers — check once on call and
    // again whenever the caller re-invokes. The session persists in localStorage.
    const user = sessionGet();
    try { cb(user); } catch (e) { }
    return () => { /* no-op */ };
  },
  currentUser() {
    return sessionGet();
  },
  async register(email, password) {
    const user = await register(email, password);
    return user;
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
    try { return await readProfile(uid); } catch (e) { return null; }
  },
  async ensureProfile(user) {
    return await ensureProfileFromLogin(user);
  },
  whenReady() {
    return new Promise(resolve => {
      const u = sessionGet();
      if (u) return resolve(u);
      // No async auth state — resolve with null if no session.
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
      const users = await listUsers('pending');
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
      const users = await listUsers('approved');
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
      const names = await readHubsList();
      const active = names.filter(name => name && isHubActive(name));
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
      const names = await readHubsList();
      if (names.length) return;
      await Promise.all(ALL_HUBS.map(h => addHubRemote(h)));
    } catch (e) { }
  }
};

function startHubPolling() {
  if (Auth._hubTimer) return;
  Auth._hubTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const names = await readHubsList();
      const snapshot = JSON.stringify(names);
      if (snapshot !== Auth._hubLast) {
        Auth._hubLast = snapshot;
        const hubs = mergeHubs(names.filter(name => name && isHubActive(name)));
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
