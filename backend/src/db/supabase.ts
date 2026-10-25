import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let client: any = null;
if (supabaseUrl && supabaseKey) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    // optional
  }
}

export const supabase = client;
export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseKey);
