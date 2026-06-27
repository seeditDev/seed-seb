import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://iygqntndsgiysvibqjyw.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_t3I55wzxcJI5owngYx0A4w_oCLVZvq7';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
