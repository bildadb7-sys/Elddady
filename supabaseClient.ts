
import { createClient } from '@supabase/supabase-js';

// Safely access environment variables using optional chaining
const supabaseUrl = import.meta.env?.VITE_APP_SUPABASE_URL || 'https://yssenbdybuxoujfsuyjv.supabase.co';
const supabaseKey = import.meta.env?.VITE_APP_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzc2VuYmR5YnV4b3VqZnN1eWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzAyNDcsImV4cCI6MjA4NzUwNjI0N30.7STUrJ4gGYH_IGiHx0syiEIUDsZ0u1Xd8BFMW5ux7Cc';

export const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
