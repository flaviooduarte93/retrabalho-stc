// js/regional-config.js — Configuração das regionais

const REGIONAIS = {
  goiania: {
    nome:        'Goiânia',
    sigla:       'GYN',
    cor:         '#1565C0',
    supabaseUrl: 'https://xpnfedjswwizdvtjfouc.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwbmZlZGpzd3dpemR2dGpmb3VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDQxMjksImV4cCI6MjA5MjQyMDEyOX0.nJ6nUZ73gryFSLI3Z9C8RXbTvqoI9lxelUljOl5QyuE',
    fiscais: [
      'Hugo Leonardo',
      'Rogério Machado',
      'Cainan Ataides',
      'Francisco Pereira',
      'Paulo Henrique',
      'Elcop',
    ],
    features: {
      alimentador: true,   // rastrea alimentador por UC
      municipio:   false,  // filtro por município
    },
  },

  metropolitana: {
    nome:        'Metropolitana',
    sigla:       'MET',
    cor:         '#6A1B9A',
    supabaseUrl: 'https://dzueyajgxpdasmadeucb.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6dWV5YWpneHBkYXNtYWRldWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTkyNDIsImV4cCI6MjA5MzU3NTI0Mn0.70Dj2kt-4kpJnZhGgkZaocjjXpx-l0RUVoTuoRpzBR0',
    fiscais: [
      'Carlos Helio Jose Pereira',
      'Cassio Rodrigues de Andrade',
      'Diogo Correia da Silva',
      'Fabricio Fideles de Oliveira',
      'Henrique Lemes do Prado',
      'Ivan Soares Lima',
      'Joao Gabriel Martins Lourenco',
      'Jorgeval Martins Godinho',
      'Luis Guimaraes da Silva Filho',
      'Maciel Alves de Souza',
      'Rafael Pereira de Almeida',
      'Ronevon Divino Bernardo de Barros',
      'Saul Moreira Goncalves Neto',
    ],
    features: {
      alimentador: false,
      municipio:   true,   // filtro e exibição de município
    },
  },
};

// ============================================================
// REGIONAL ATIVA — lida do sessionStorage
// ============================================================
function getRegional() {
  const key = sessionStorage.getItem('regional') || 'goiania';
  return REGIONAIS[key] || REGIONAIS.goiania;
}

function getRegionalKey() {
  return sessionStorage.getItem('regional') || 'goiania';
}

function setRegional(key) {
  sessionStorage.setItem('regional', key);
}
