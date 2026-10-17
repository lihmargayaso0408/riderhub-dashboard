// functions/index.js
// Cloudflare Worker — access request email notifications.
// Replaces the Firebase Function that triggered on Firestore document creation.
//
// Deploy with: wrangler deploy (from this directory, with its own wrangler.toml
// or by merging the email binding into the main worker).
//
// Environment variables (set via `wrangler secret put` or wrangler.toml [vars]):
//   ADMIN_EMAIL     — email address that receives access request notifications
//   EMAIL_API_URL   — endpoint to send email via (e.g. SendGrid, Mailgun, etc.)
//   EMAIL_API_KEY   — API key for the email service
//   EMAIL_FROM      — sender email address

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
      // ---- POST /api/notify-access-request ----
      if (path === '/api/notify-access-request' && request.method === 'POST') {
        const body = await request.json();
        const { email, name, uid, status } = body || {};

        if (!email && !name) {
          return new Response(JSON.stringify({ error: 'Missing email or name' }), {
            status: 400,
            headers
          });
        }

        const who = email || name || '(unknown)';
        console.log('[functions] New access request from ' + who + ' (uid=' + uid + ', status=' + status + ')');

        const adminEmail = env.ADMIN_EMAIL || '';
        const emailApiUrl = env.EMAIL_API_URL || '';
        const emailApiKey = env.EMAIL_API_KEY || '';
        const emailFrom = env.EMAIL_FROM || '';

        if (!adminEmail || !emailApiUrl || !emailApiKey) {
          console.warn('[functions] Email not fully configured; skipping email. In-app request still visible.');
          return new Response(JSON.stringify({
            ok: true,
            sent: false,
            reason: 'email not configured'
          }), { headers });
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
          return new Response(JSON.stringify({ error: err.message || 'Failed to send email' }), {
            status: 500,
            headers
          });
        }
      }

      // ---- GET /api/health ----
      if (path === '/api/health' && request.method === 'GET') {
        return new Response(JSON.stringify({ ok: true, backend: 'cloudflare-functions' }), { headers });
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
