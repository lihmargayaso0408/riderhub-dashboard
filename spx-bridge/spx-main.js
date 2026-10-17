// spx-main.js — content script (MAIN world) injected into spx.shopee.ph.
// Marks the page so the bridge knows SPX is open in this profile.
window.SPX_BRIDGE_SPX_PAGE = { version: '1.0.0', ready: true };
console.log('[SPX Bridge] spx-main loaded on SPX page');
