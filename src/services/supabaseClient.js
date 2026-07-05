import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// This project has no bundler — config is injected at runtime via window.__ENV__,
// the same pattern already used for API_URL/SOCKET_URL in index.html.
// On Vercel, these values are baked into index.html at build time from
// Vercel Project Settings -> Environment Variables: SUPABASE_URL, SUPABASE_ANON_KEY
const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.__ENV__ || {};

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase config. Set window.__ENV__.SUPABASE_URL and SUPABASE_ANON_KEY (see index.html).'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
