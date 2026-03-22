// js/supabase-init.js
// Substitui o firebase-init.js — configure com suas credenciais do Supabase

const SUPABASE_URL  = 'https://dlfijuiahpuyyxcgzstn.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsZmlqdWlhaHB1eXl4Y2d6c3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNDA0NDEsImV4cCI6MjA4OTcxNjQ0MX0.y_mSTCU00NsL7OaZ_myiUuNkcKtLAl_ZghbnKl_dp80';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
