import { createClient } from '@supabase/supabase-js';

// ⚠️  Credentials are loaded from .env (never hardcode here).
// To set up: copy .env.example → .env and fill in the values.
// To rotate: Supabase Dashboard → Project Settings → API → Roll anon key,
// then update VITE_SUPABASE_ANON_KEY in .env AND in Vercel Dashboard →
// Settings → Environment Variables → Production.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Copy .env.example to .env and fill in your project credentials.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
