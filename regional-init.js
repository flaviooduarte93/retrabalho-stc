// js/regional-init.js — Inicialização regional em cada página interna
// Carregado após supabase-init.js em todas as páginas

document.addEventListener('DOMContentLoaded', () => {
  const reg = getRegional();

  // Atualiza badge da topbar
  const badge = document.getElementById('regional-badge');
  if (badge) badge.textContent = reg.nome;

  // Popula fiscais no select do modal de delegação (se existir)
  const selFiscal = document.getElementById('sel-fiscal');
  if (selFiscal && reg.fiscais?.length) {
    selFiscal.innerHTML = '<option value="">Selecione um fiscal...</option>' +
      reg.fiscais.map(f => `<option value="${f}">${f}</option>`).join('');
  }

  // Feature: município — mostra filtro se regional tiver
  if (reg.features?.municipio) {
    document.querySelectorAll('[data-feature="municipio"]').forEach(el => {
      el.style.display = '';
    });
  }

  // Feature: alimentador — mostra coluna se regional tiver
  if (reg.features?.alimentador) {
    document.querySelectorAll('[data-feature="alimentador"]').forEach(el => {
      el.style.display = '';
    });
  }
});
