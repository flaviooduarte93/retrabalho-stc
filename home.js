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
    const snapMeta = await db.collection('historico_recente_meta').get();
    const mesesRecentes = [];
    snapMeta.forEach(doc => mesesRecentes.push(doc.data()));
    mesesRecentes.sort((a, b) => a.mesAno.localeCompare(b.mesAno));

    for (const m of mesesRecentes) {
      const hoje = new Date();
      const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
      const isAtual = m.mesAno === mesAtual;
      chips.push(`
        <div class="base-chip ${isAtual ? 'chip-atual' : 'chip-fechado'}">
          <span class="chip-dot"></span>
          <span class="chip-label">${mesAnoLabel(m.mesAno)}</span>
          <span class="chip-tag">${isAtual ? 'Mês atual' : 'Fechado'}</span>
          <span class="chip-count">${m.totalRegistros} reg.</span>
        </div>`);
    }

    // 2. Visão atual (Decômetro) — verifica se existe algo na coleção
    const snapAtual = await db.collection('visao_atual').limit(1).get();
    if (!snapAtual.empty) {
      // Pega a data mais recente de uma amostra
      const snapSample = await db.collection('visao_atual').limit(20).get();
      let maxDate = null;
      snapSample.forEach(doc => {
        const d = doc.data().dtInicio ? new Date(doc.data().dtInicio) : null;
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
    const snapHist = await db.collection('historico').limit(1).get();
    if (!snapHist.empty) {
      const countSnap = await db.collection('historico').get();
      chips.push(`
        <div class="base-chip chip-historico">
          <span class="chip-dot"></span>
          <span class="chip-label">Base Histórica</span>
          <span class="chip-count">${countSnap.size} UCs</span>
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
