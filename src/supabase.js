import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://rxtmnywtqkqhatudwkqc.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dG1ueXd0cWtxaGF0dWR3a3FjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjgyMjEsImV4cCI6MjEwNjcwNDIyMX0.MwPw8MFg0H2YC2OBCCcv3dFn0VtdO3Tg5nheniBVEug';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { createClient, SUPABASE_URL, SUPABASE_ANON_KEY };
