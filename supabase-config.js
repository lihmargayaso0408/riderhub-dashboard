// Supabase configuration for the Dispatch Board
// Replace the values below with your Supabase project URL and anon key.
// Keep this file private — the anon key is public but should still be treated carefully.
window.SUPABASE_CONFIG = {
  url: 'https://bjujpnyihllbbfqahvok.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqdWpwbnlpaGxsYmJmcWFodm9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMTEzMjcsImV4cCI6MjEwMDU4NzMyN30.8YT_x0cgQJZixzyWmdFeJyx_ocZe83OTwvFvVDkkdlw'
};

// If the Supabase UMD script has already loaded, create a client instance
// and make it available as `window.SUPABASE_CLIENT` for other helpers to reuse.
if(typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function'){
  try{
    window.SUPABASE_CLIENT = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.key);
  }catch(e){
    // initialization failure should not break the app
    console.warn('Could not initialize Supabase client:', e && e.message ? e.message : e);
  }
}

// Notes:
// - This integration uses a Storage bucket named 'dashboard' to store JSON blobs.
//   Create the bucket in your Supabase project and make it private or public as you prefer.
// - Filenames are generated from the app's internal keys (e.g. "snapshot:Bauko:2026-07-25.json").
// - If you don't fill these values the app will continue to use localStorage.
