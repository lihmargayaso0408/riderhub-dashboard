// cloudflare-config.js
// Set your deployed Cloudflare Worker URL here.
// Deploy with: wrangler deploy (after creating the R2 buckets below).
const CLOUDFLARE_CONFIG = {
  workerUrl: 'https://rider-performance.lihmargayaso.workers.dev'
};

window.CLOUDFLARE_WORKER_URL = CLOUDFLARE_CONFIG.workerUrl;