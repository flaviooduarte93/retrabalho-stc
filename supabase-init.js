// js/supabase-init.js
// Substitui o firebase-init.js — configure com suas credenciais do Supabase

const SUPABASE_URL  = 'https://xpnfedjswwizdvtjfouc.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwbmZlZGpzd3dpemR2dGpmb3VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDQxMjksImV4cCI6MjA5MjQyMDEyOX0.nJ6nUZ73gryFSLI3Z9C8RXbTvqoI9lxelUljOl5QyuE';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
