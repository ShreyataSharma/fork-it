import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("DEBUG: VITE_SUPABASE_URL is", supabaseUrl);
console.log("DEBUG: VITE_SUPABASE_ANON_KEY is", supabaseKey ? "SET" : "UNDEFINED");

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
