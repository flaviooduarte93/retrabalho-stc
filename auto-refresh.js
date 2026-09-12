// ============================================================
//  AUTO-REFRESH — atualiza os horários das bases sem apertar F5
//
//  O sistema já tem window.carregarStatusBases(), que lê as tabelas
//  de meta (historico_meta / historico_recente_meta) da regional
//  ativa e desenha os chips com data/hora de cada base. Ela só era
//  chamada ao logar e após um upload feito NESTA tela — então, se
//  alguém subia uma base em outra máquina, você só via depois de F5.
//
//  Este módulo re-chama essa mesma função automaticamente:
//   • a cada 30 segundos, enquanto a aba está visível;
//   • sempre que a aba volta ao foco (você troca de janela e volta).
//
//  A independência por regional já é garantida pela própria
//  carregarStatusBases(), que usa o db da regional do sessionStorage.
//  Este módulo não muda nada disso — só dispara a atualização.
//
//  INSTALAR: incluir no index.html DEPOIS do home.js:
//     <script src="home.js"></script>
//     <script src="auto-refresh.js"></script>   ← esta linha
// ============================================================

(function () {
  'use strict';

  const INTERVALO_MS = 30000;   // 30s — ajuste aqui se quiser mais/menos frequente
  let timer = null;

  // Só atualiza se: a função existe, o usuário está logado, e a home
  // está visível (não adianta atualizar chips escondidos atrás do login).
  function podeAtualizar() {
    if (typeof window.carregarStatusBases !== 'function') return false;
    let logado = false;
    try { logado = sessionStorage.getItem('auth_home') === '1'; } catch (e) {}
    if (!logado) return false;
    const home = document.getElementById('conteudo-home');
    if (home && home.style.display === 'none') return false;
    return true;
  }

  function atualizar() {
    if (!podeAtualizar()) return;
    try { window.carregarStatusBases(); }
    catch (e) { console.warn('[auto-refresh] falha ao atualizar status:', e.message); }
  }

  function iniciar() {
    if (timer) return;
    timer = setInterval(() => {
      // Não gasta rede com a aba em segundo plano; o foco reativa.
      if (document.visibilityState === 'visible') atualizar();
    }, INTERVALO_MS);
  }

  // Atualiza imediatamente quando a aba volta ao foco.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') atualizar();
  });
  window.addEventListener('focus', atualizar);

  // Começa após a página montar (dá tempo do home.js definir a função).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 1000));
  } else {
    setTimeout(iniciar, 1000);
  }

  console.log('[auto-refresh] ativo: horários das bases atualizam a cada 30s e ao focar a aba.');
})();
