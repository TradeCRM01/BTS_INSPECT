import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  || (import.meta.env.DEV ? 'http://127.0.0.1:54321' : '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || (import.meta.env.DEV ? 'dev-audit-anon-key' : '');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: { 'x-client-info': 'grafter' },
  },
  db: {
    schema: 'public',
  },
  realtime: {
    timeout: 20000,
  },
});
