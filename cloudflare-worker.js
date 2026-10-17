// Cloudflare Worker — Rider Performance System backend
// Replaces Firebase Functions + Firestore with a Workers API backed by R2 storage.
//
// R2 buckets (create in Cloudflare dashboard):
//   - dispatch_data  → key/value JSON documents (replaces Firestore dispatch_data collection)
//   - accounts       → user profiles + sessions keyed by uid/sessionId
//   - hubs           → hub registry (one JSON array)
//
// Bindings configured in wrangler.toml:
//   [[r2_buckets]]
//   binding = "ACCOUNTS", bucket_name = "accounts"
//   [[r2_buckets]]
//   binding = "DISPATCH_DATA", bucket_name = "dispatch-data"
//   [[r2_buckets]]
//   binding = "HUBS", bucket_name = "hubs"
//
// Environment variables:
//   SESSION_SECRET   — random string used to salt password hashes
//   ADMIN_EMAIL      — email that receives access request notifications
//   EMAIL_API_URL    — endpoint to send email via
//   EMAIL_API_KEY    — API key for the email service
//   EMAIL_FROM       — sender email address

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const headers = { 'Content-Type': 'application/json', ...corsHeaders() };

    try {
      // ---- GET /api/health ----
      if (path === '/api/health' && request.method === 'GET') {
        return new Response(JSON.stringify({ ok: true, backend: 'cloudflare-worker' }), { headers });
      }

      // ---- AUTH: POST /api/auth/register ----
      if (path === '/api/auth/register' && request.method === 'POST') {
        const { email, password, name } = await request.json();
        if (!email || !password) {
          return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers });
        }
        const uid = email.toLowerCase();
        const existing = await readJson(env.ACCOUNTS, `users/${uid}`);
        if (existing) {
          return new Response(JSON.stringify({ error: 'Account already exists' }), { status: 409, headers });
        }
        const passwordHash = await hashPassword(password, env.SESSION_SECRET || '');
        const profile = {
          uid,
          email: email.toLowerCase(),
          name: name || email,
          status: 'pending',
          role: 'user',
          hubs: [],
          actions: {},
          pages: [],
          passwordHash,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await writeJson(env.ACCOUNTS, `users/${uid}`, profile);
        return new Response(JSON.stringify({ ok: true, user: { uid, email, name: profile.name, status: 'pending' } }), { headers });
      }

      // ---- AUTH: POST /api/auth/login ----
      if (path === '/api/auth/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        if (!email || !password) {
          return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers });
        }
        const uid = email.toLowerCase();
        const profile = await readJson(env.ACCOUNTS, `users/${uid}`);
        if (!profile || !profile.passwordHash) {
          return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401, headers });
        }
        const ok = await verifyPassword(password, profile.passwordHash, env.SESSION_SECRET || '');
        if (!ok) {
          return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401, headers });
        }
        return new Response(JSON.stringify({ ok: true, user: { uid: profile.uid, email: profile.email, name: profile.name, status: profile.status, role: profile.role, hubs: profile.hubs, actions: profile.actions, pages: profile.pages } }), { headers });
      }

      // ---- AUTH: POST /api/auth/logout ----
      if (path === '/api/auth/logout' && request.method === 'POST') {
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

      // ---- AUTH: POST /api/auth/password-reset ----
      if (path === '/api/auth/password-reset' && request.method === 'POST') {
        const { email } = await request.json();
        if (!email) {
          return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers });
        }
        const uid = email.toLowerCase();
        const profile = await readJson(env.ACCOUNTS, `users/${uid}`);
        if (!profile) {
          return new Response(JSON.stringify({ ok: true, message: 'If an account exists, a reset link has been sent.' }), { headers });
        }
        return new Response(JSON.stringify({ ok: true, message: 'If an account exists, a reset link has been sent.' }), { headers });
      }

      // ---- DATA: GET /api/data/:key ----
      const dataMatch = path.match(/^\/api\/data\/(.+)$/);
      if (dataMatch && request.method === 'GET') {
        const key = decodeKey(dataMatch[1]);
        const value = await readJson(env.DISPATCH_DATA, key);
        return new Response(JSON.stringify(value), { headers });
      }

      // ---- DATA: POST /api/data/:key ----
      if (dataMatch && request.method === 'POST') {
        const key = decodeKey(dataMatch[1]);
        const body = await request.json();
        await writeJson(env.DISPATCH_DATA, key, body);
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

      // ---- DATA: DELETE /api/data/:key ----
      if (dataMatch && request.method === 'DELETE') {
        const key = decodeKey(dataMatch[1]);
        await env.DISPATCH_DATA.delete(key);
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

      // ---- DATA: GET /api/data ---- (list keys with optional ?prefix=)
      if (path === '/api/data' && request.method === 'GET') {
        const prefix = url.searchParams.get('prefix') || '';
        const keys = await listKeys(env.DISPATCH_DATA, prefix);
        return new Response(JSON.stringify({ keys }), { headers });
      }

      // ---- USERS: GET /api/users/:uid ----
      const userMatch = path.match(/^\/api\/users\/(.+)$/);
      if (userMatch && request.method === 'GET') {
        const uid = userMatch[1];
        const value = await readJson(env.ACCOUNTS, `users/${uid}`);
        return new Response(JSON.stringify(value), { headers });
      }

      // ---- USERS: POST /api/users/:uid ----
      if (userMatch && request.method === 'POST') {
        const uid = userMatch[1];
        const body = await request.json();
        await writeJson(env.ACCOUNTS, `users/${uid}`, body);
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

      // ---- USERS: PATCH /api/users/:uid ----
      if (userMatch && request.method === 'PATCH') {
        const uid = userMatch[1];
        const existing = await readJson(env.ACCOUNTS, `users/${uid}`) || {};
        const patch = await request.json();
        const merged = Object.assign({}, existing, patch);
        await writeJson(env.ACCOUNTS, `users/${uid}`, merged);
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

      // ---- USERS: GET /api/users ---- (list with ?status=)
      if (path === '/api/users' && request.method === 'GET') {
        const status = url.searchParams.get('status');
        const all = await listJson(env.ACCOUNTS, 'users/');
        let result = all;
        if (status) {
          result = result.filter(u => u.status === status);
        }
        return new Response(JSON.stringify({ users: result }), { headers });
      }

      // ---- HUBS: GET /api/hubs ----
      if (path === '/api/hubs' && request.method === 'GET') {
        const value = await readJson(env.HUBS, 'hubs');
        return new Response(JSON.stringify(value), { headers });
      }

      // ---- HUBS: POST /api/hubs ----
      if (path === '/api/hubs' && request.method === 'POST') {
        const body = await request.json();
        const current = await readJson(env.HUBS, 'hubs') || [];
        if (!current.includes(body.name)) {
          current.push(body.name);
          await writeJson(env.HUBS, 'hubs', current);
        }
        return new Response(JSON.stringify({ ok: true }), { headers });
      }

      // ---- NOTIFY: POST /api/notify-access-request ----
      if (path === '/api/notify-access-request' && request.method === 'POST') {
        const body = await request.json();
        const { email, name, uid, status } = body || {};
        const who = email || name || '(unknown)';
        console.log('[functions] New access request from ' + who + ' (uid=' + uid + ', status=' + status + ')');

        const adminEmail = env.ADMIN_EMAIL || '';
        const emailApiUrl = env.EMAIL_API_URL || '';
        const emailApiKey = env.EMAIL_API_KEY || '';
        const emailFrom = env.EMAIL_FROM || '';

        if (!adminEmail || !emailApiUrl || !emailApiKey) {
          console.warn('[functions] Email not fully configured; skipping email. In-app request still visible.');
          return new Response(JSON.stringify({ ok: true, sent: false, reason: 'email not configured' }), { headers });
        }

        try {
          const emailPayload = {
            from: emailFrom || adminEmail,
            to: adminEmail,
            subject: 'Rider Performance System — New access request',
            text:
              'New access request from ' + who + '.\n\n' +
              'UID: ' + (uid || '(unknown)') + '\n' +
              'Status: ' + (status || 'pending') + '\n\n' +
              'Open the dashboard and choose Options -> Access Requests to approve ' +
              'and set which hubs and actions this user can use.'
          };

          const resp = await fetch(emailApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + emailApiKey
            },
            body: JSON.stringify(emailPayload)
          });

          if (!resp.ok) {
            const text = await resp.text();
            throw new Error('Email API failed: ' + resp.status + ' ' + text);
          }

          console.log('[functions] Access request email sent to ' + adminEmail);
          return new Response(JSON.stringify({ ok: true, sent: true }), { headers });
        } catch (err) {
          console.error('[functions] Failed to send access request email', err);
          return new Response(JSON.stringify({ error: err.message || 'Failed to send email' }), { status: 500, headers });
        }
      }

      // 404
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
        status: 500,
        headers
      });
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

// R2 object keys cannot contain ':' — encode it as '_'.
function decodeKey(key) {
  return key.replace(/_/g, ':');
}

async function readJson(bucket, key) {
  const obj = await bucket.get(key);
  if (!obj) return null;
  const text = await obj.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeJson(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: 'application/json' }
  });
}

async function listKeys(bucket, prefix) {
  const listed = await bucket.list({ prefix });
  return listed.objects.map(o => o.key);
}

async function listJson(bucket, prefix) {
  const keys = await listKeys(bucket, prefix);
  const results = [];
  for (const key of keys) {
    const value = await readJson(bucket, key);
    if (value) results.push(value);
  }
  return results;
}

// ---- Password hashing (SHA-256 with salt) ----
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
