// supabase-init.js — Inicializa Supabase com base na regional ativa

// regional-config.js deve ser carregado antes deste arquivo
const _reg    = getRegional();
const { createClient } = supabase;
const db = createClient(_reg.supabaseUrl, _reg.supabaseKey);
