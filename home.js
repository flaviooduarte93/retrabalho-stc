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

async function carregarStatusBases() {
  const el = document.getElementById('bases-chips');
  if (!el) return;

  try {
    const chips = [];

    // 1. Histórico recente — lê os metadados dos meses salvos
    const { data: snapMeta } = await db.from('historico_recente_meta').select('*');
    const mesesRecentes = [];
    (snapMeta||[]).forEach(m => mesesRecentes.push(m));
    mesesRecentes.sort((a, b) => (a.mes_ano||'').localeCompare(b.mes_ano||''));

    for (const m of mesesRecentes) {
      const hoje = new Date();
      const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
      const isAtual = m.mes_ano === mesAtual;
      chips.push(`
        <div class="base-chip ${isAtual ? 'chip-atual' : 'chip-fechado'}">
          <span class="chip-dot"></span>
          <span class="chip-label">${mesAnoLabel(m.mes_ano)}</span>
          <span class="chip-tag">${isAtual ? 'Mês atual' : 'Fechado'}</span>
          <span class="chip-count">${m.total_registros||0} reg.</span>
        </div>`);
    }

    // 2. Visão atual (Decômetro) — verifica se existe algo na coleção
    const { data: snapAtualCheck } = await db.from('visao_atual').select('ocorrencia').limit(1);
    if (snapAtualCheck?.length) {
      // Pega a data mais recente de uma amostra
      const { data: snapSample } = await db.from('visao_atual').select('dt_inicio').limit(20);
      let maxDate = null;
      (snapSample||[]).forEach(doc => {
        const d = doc.dt_inicio ? new Date(doc.dt_inicio) : null;
        if (d && (!maxDate || d > maxDate)) maxDate = d;
      });
      const label = maxDate
        ? mesAnoLabel(`${maxDate.getFullYear()}-${String(maxDate.getMonth()+1).padStart(2,'0')}`)
        : 'Mês atual';
      chips.push(`
        <div class="base-chip chip-visao">
          <span class="chip-dot"></span>
          <span class="chip-label">Visão Atual</span>
          <span class="chip-tag">${label}</span>
        </div>`);
    }

    // 3. Base histórica
    const { data: snapHistCheck } = await db.from('historico').select('uc').limit(1);
    if (snapHistCheck?.length) {
      const { count: histCount } = await db.from('historico').select('*', { count: 'exact', head: true });
      chips.push(`
        <div class="base-chip chip-historico">
          <span class="chip-dot"></span>
          <span class="chip-label">Base Histórica</span>
          <span class="chip-count">${histCount||0} UCs</span>
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
