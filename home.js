// js/home.js
const SENHA = 'eqtlstcgyn26';

function setupModal(btnId, modalId, inputId, errorId, cancelId, confirmId, destino) {
  const btn    = document.getElementById(btnId);
  const modal  = document.getElementById(modalId);
  const input  = document.getElementById(inputId);
  const error  = document.getElementById(errorId);
  const cancel = document.getElementById(cancelId);
  const confirm= document.getElementById(confirmId);
  if (!btn || !modal) return;

  btn.addEventListener('click', e => { e.preventDefault(); modal.style.display='flex'; setTimeout(()=>input.focus(),100); });
  cancel.addEventListener('click', ()=>{ modal.style.display='none'; input.value=''; error.style.display='none'; });
  confirm.addEventListener('click', ()=>verificar());
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') verificar(); });
  modal.addEventListener('click', e=>{ if(e.target===modal){modal.style.display='none';input.value='';error.style.display='none';}});

  function verificar() {
    if (input.value === SENHA) { window.location.href = destino; }
    else { error.style.display='block'; input.select(); }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupModal('btn-alertas','modal-senha','input-senha','modal-error','btn-cancel-modal','btn-confirm-modal','alertas.html');
  setupModal('btn-detalhamento','modal-senha-det','input-senha-det','modal-error-det','btn-cancel-det','btn-confirm-det','detalhamento.html');
});


// ===== STATUS DAS BASES CARREGADAS =====
const MESES_PT = {
  '01':'Janeiro','02':'Fevereiro','03':'Março','04':'Abril',
  '05':'Maio','06':'Junho','07':'Julho','08':'Agosto',
  '09':'Setembro','10':'Outubro','11':'Novembro','12':'Dezembro'
};

function mesAnoLabel(key) {
  // key = "YYYY-MM"
  const [ano, mes] = key.split('-');
  return `${MESES_PT[mes]||mes}/${ano}`;
}

function fmtDateTime(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

async function carregarStatusBases() {
  const el = document.getElementById('bases-chips');
  if (!el) return;

  try {
    const chips = [];
    const atualizacoes = {}; // guarda última atualização por base

    // 1. Histórico recente — lê metadados dos meses
    const { data: snapMeta } = await db.from('historico_recente_meta').select('*');
    // Filtra 'visao_atual' — tem chip próprio abaixo
    const mesesRecentes = [...(snapMeta||[])]
      .filter(m => m.mes_ano !== 'visao_atual')
      .sort((a,b) => (a.mes_ano||'').localeCompare(b.mes_ano||''));

    for (const m of mesesRecentes) {
      const hoje = new Date();
      const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
      const isAtual = m.mes_ano === mesAtual;
      chips.push(`
        <div class="base-chip ${isAtual ? 'chip-atual' : 'chip-fechado'}">
          <span class="chip-dot"></span>
          <div class="chip-info">
            <div class="chip-top">
              <span class="chip-label">${mesAnoLabel(m.mes_ano)}</span>
              <span class="chip-tag">${isAtual ? 'Mês atual' : 'Fechado'}</span>
              <span class="chip-count">${m.total_registros||0} reg.</span>
            </div>
            ${m.atualizado_em ? `<div class="chip-updated">⏱ ${fmtDateTime(m.atualizado_em)}</div>` : ''}
          </div>
        </div>`);
      // Guarda a mais recente atualização do histórico recente
      if (m.atualizado_em) {
        if (!atualizacoes.recente || m.atualizado_em > atualizacoes.recente) {
          atualizacoes.recente = m.atualizado_em;
        }
      }
    }

    // 2. Visão atual — busca meta própria da visão atual
    const { data: visaoMetaRow } = await db
      .from('historico_recente_meta')
      .select('*')
      .eq('mes_ano', 'visao_atual')
      .maybeSingle();

    if (visaoMetaRow) {
      chips.push(`
        <div class="base-chip chip-visao">
          <span class="chip-dot"></span>
          <div class="chip-info">
            <div class="chip-top">
              <span class="chip-label">Ocorrências Ativas</span>
              <span class="chip-count">${visaoMetaRow.total_registros||0} reg.</span>
            </div>
            ${visaoMetaRow.atualizado_em ? `<div class="chip-updated">⏱ ${fmtDateTime(visaoMetaRow.atualizado_em)}</div>` : ''}
          </div>
        </div>`);
    } else {
      // fallback: verifica se há dados mas sem meta
      const { data: snapAtualCheck } = await db.from('visao_atual').select('ocorrencia').limit(1);
      if (snapAtualCheck?.length) {
        chips.push(`
          <div class="base-chip chip-visao">
            <span class="chip-dot"></span>
            <div class="chip-info">
              <div class="chip-top">
                <span class="chip-label">Ocorrências Ativas</span>
              </div>
              <div class="chip-updated">Faça um novo upload para registrar o timestamp</div>
            </div>
          </div>`);
      }
    }

    // 3. Base histórica
    const { data: snapHistCheck } = await db.from('historico').select('uc').limit(1);
    if (snapHistCheck?.length) {
      const { count: histCount } = await db.from('historico').select('*', { count: 'exact', head: true });
      // Supabase não tem timestamp de atualização nativo, usamos um doc de meta
      const { data: histMeta } = await db.from('historico_meta').select('atualizado_em').limit(1);
      const histTs = histMeta?.[0]?.atualizado_em || null;

      chips.push(`
        <div class="base-chip chip-historico">
          <span class="chip-dot"></span>
          <div class="chip-info">
            <div class="chip-top">
              <span class="chip-label">Base Histórica</span>
              <span class="chip-count">${histCount||0} UCs</span>
            </div>
            ${histTs ? `<div class="chip-updated">⏱ ${fmtDateTime(histTs)}</div>` : ''}
          </div>
        </div>`);
    }

    if (chips.length === 0) {
      el.innerHTML = '<span class="bases-loading">Nenhuma base carregada ainda.</span>';
    } else {
      el.innerHTML = chips.join('');
    }

  } catch(err) {
    console.error(err);
    el.innerHTML = '<span class="bases-loading" style="color:var(--eq-red)">Erro ao verificar bases.</span>';
  }
}

// Atualiza status ao carregar e após cada upload
document.addEventListener('DOMContentLoaded', () => {
  carregarStatusBases();

  // Recarrega status após upload bem-sucedido
  ['file-historico','file-atual','file-recente'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
      setTimeout(carregarStatusBases, 3000); // aguarda o upload processar
    });
  });
});
