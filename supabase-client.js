/* Supabase client helper for the Dispatch Board
   This file exposes `window.supabaseAPI` with a small key/value-style API
   that mirrors the localStorage wrapper used by the app. It stores JSON
   blobs in a Storage bucket named 'dashboard'.

   Requirements:
   - Fill `supabase-config.js` with your project `url` and `key`.
   - Create a Storage bucket named `dashboard` in your Supabase project.
*/
(function(){
  const cfg = window.SUPABASE_CONFIG || {};
  function isEnabled(){ return cfg && cfg.url && cfg.key; }
  let client = null;
  function ensure(){
    if(client) return client;
    if(typeof window.SUPABASE_CLIENT !== 'undefined' && window.SUPABASE_CLIENT) { client = window.SUPABASE_CLIENT; return client; }
    if(!isEnabled()) return null;
    client = supabase.createClient(cfg.url, cfg.key);
    return client;
  }

  async function set(key, value){
    const c = ensure(); if(!c) throw new Error('Supabase not configured');
    const bucket = 'dashboard';
    const path = encodeURIComponent(key) + '.json';
    const file = new Blob([value], {type:'application/json'});
    // upload with upsert
    const {data, error} = await c.storage.from(bucket).upload(path, file, {upsert: true});
    if(error) throw error;
    return {key, value};
  }

  async function get(key){
    const c = ensure(); if(!c) throw new Error('Supabase not configured');
    const bucket = 'dashboard';
    const path = encodeURIComponent(key) + '.json';
    const {data, error} = await c.storage.from(bucket).download(path);
    if(error){
      if(error.status === 404) return null;
      throw error;
    }
    const text = await data.text();
    return {key, value: text};
  }

  async function del(key){
    const c = ensure(); if(!c) throw new Error('Supabase not configured');
    const bucket = 'dashboard';
    const path = encodeURIComponent(key) + '.json';
    const {data, error} = await c.storage.from(bucket).remove([path]);
    if(error) throw error;
    return {key, deleted:true};
  }

  async function list(prefix=''){
    const c = ensure(); if(!c) throw new Error('Supabase not configured');
    const bucket = 'dashboard';
    const {data, error} = await c.storage.from(bucket).list('', {limit: 1000});
    if(error) throw error;
    const keys = data.map(f=>decodeURIComponent(f.name.replace(/\.json$/,''))).filter(n=>!prefix||n.startsWith(prefix));
    return {keys};
  }

  window.supabaseAPI = {
    isEnabled,
    init: (cfgIn)=>{ window.SUPABASE_CONFIG = cfgIn; client = null; ensure(); },
    get,
    set,
    delete: del,
    list,
    // kvStorage returns an object compatible with the storage wrapper used by the app
    kvStorage: ()=>({ get, set, delete: del, list }),
  };
})();
