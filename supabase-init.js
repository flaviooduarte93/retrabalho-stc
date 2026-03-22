// js/supabase-init.js
// Substitui o firebase-init.js — configure com suas credenciais do Supabase

const SUPABASE_URL  = 'https://SEU_PROJECT.supabase.co';
const SUPABASE_KEY  = 'SUA_ANON_KEY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
