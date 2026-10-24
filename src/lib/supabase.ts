import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

/** The Supabase client (login only; all data goes through our API). Created on first use. */
export function supabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env (see .env.example).');
    // PKCE: after Google, Supabase sends back a one-time ?code= that supabase-js exchanges for a session.
    client = createClient(url, key, { auth: { flowType: 'pkce' } });
  }
  return client;
}
