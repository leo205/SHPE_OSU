import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ekuaqbelulybowihmact.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_62E03z0eVijDd2rctrUPoA_DbFzpWfp';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
