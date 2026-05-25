// supabase-init.js — Inicializa Supabase com base na regional ativa
// regional-config.js deve ser carregado antes deste arquivo

const { createClient } = supabase;

// Fallback caso regional-config.js não esteja disponível
const _reg = (typeof getRegional === 'function')
  ? getRegional()
  : {
      supabaseUrl: 'https://xpnfedjswwizdvtjfouc.supabase.co',
      supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwbmZlZGpzd3dpemR2dGpmb3VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDQxMjksImV4cCI6MjA5MjQyMDEyOX0.nJ6nUZ73gryFSLI3Z9C8RXbTvqoI9lxelUljOl5QyuE',
    };

const db = createClient(_reg.supabaseUrl, _reg.supabaseKey);
