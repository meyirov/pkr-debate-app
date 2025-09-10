// src/supabase.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dwkbptqrblyiqymnqjiv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3a2JwdHFyYmx5aXF5bW5xaml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM0MzA3NTcsImV4cCI6MjA1OTAwNjc1N30.QIHms9_kllO7SMxxUlu2U_ugICz1q_cr2-fO61092N4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);