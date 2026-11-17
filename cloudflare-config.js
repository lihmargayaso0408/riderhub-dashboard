// cloudflare-config.js
// Set your deployed Cloudflare Worker URL here.
// Deploy with: wrangler deploy (after creating the R2 buckets below).
// SESSION_SECRET must match the Worker's SESSION_SECRET env var for password hashing to work.
const CLOUDFLARE_CONFIG = {
  workerUrl: 'https://rider-performance.lihmargayaso.workers.dev',
  sessionSecret: ''
};

window.CLOUDFLARE_WORKER_URL = CLOUDFLARE_CONFIG.workerUrl;
window.__SESSION_SECRET = CLOUDFLARE_CONFIG.sessionSecret;