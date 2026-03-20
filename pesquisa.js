// js/pesquisa.js

function fmtDate(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDateShort(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
}
function calcRetrabalho(dataConc) {
  if (!dataConc) return false;
  return new Date() <= new Date(new Date(dataConc).getTime() + 91 * 86400000);
}

// ===== GANTT =====
function renderGantt(historico) {
  if (!historico || !historico.length) return '';
  const sorted = [...historico].filter(h => h.dataOrigem)
    .sort((a,b) => new Date(a.dataOrigem) - new Date(b.dataOrigem));
  if (!sorted.length) return '';

  const minDate = new Date(sorted[0].dataOrigem);
  const maxDate = new Date(sorted[sorted.length-1].dataConc || sorted[sorted.length-1].dataOrigem);
  maxDate.setDate(maxDate.getDate() + 5);
  const totalMs = maxDate - minDate || 1;

  const ticks = [];
  for (let i = 0; i <= 5; i++) {
    ticks.push(new Date(minDate.getTime() + totalMs * i / 5)
      .toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'}));
  }

  const bars = sorted.map((h, i) => {
    const start = new Date(h.dataOrigem);
    const end   = h.dataConc ? new Date(h.dataConc) : new Date(start.getTime() + 4*3600000);
    const left  = ((start - minDate) / totalMs * 100).toFixed(2);
    const width = Math.max(((end - start) / totalMs * 100), 0.4).toFixed(2);
    const isRet = calcRetrabalho(h.dataConc);
    const cls   = (i < sorted.length - 1 && isRet) ? 'retrabalho' : 'normal';
    return `
      <div class="gantt-row">
        <div class="gantt-label">${fmtDateShort(h.dataOrigem)}</div>
        <div class="gantt-track">
          <div class="gantt-bar ${cls}" style="left:${left}%;width:${width}%"
               title="OS ${h.os||'----'} · ${h.causa||'----'}\nInício: ${fmtDate(h.dataOrigem)}\nFim: ${fmtDate(h.dataConc)}">
            ${h.os||''}
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="gantt-section">
      <div class="gantt-title">Linha do Tempo de Atendimentos</div>
      <div class="gantt-container"><div class="gantt-chart">
        ${bars}
        <div class="gantt-axis">${ticks.map(t=>`<div class="gantt-tick">${t}</div>`).join('')}</div>
      </div></div>
      <div style="margin-top:14px;display:flex;gap:16px;font-size:0.75rem;color:var(--eq-gray-600)">
        <span style="display:flex;align-items:center;gap:6px">
          <span style="width:12px;height:12px;border-radius:3px;background:var(--eq-blue);display:inline-block"></span>Atendimento normal
        </span>
        <span style="display:flex;align-items:center;gap:6px">
          <span style="width:12px;height:12px;border-radius:3px;background:var(--eq-red);display:inline-block"></span>Em período de retrabalho
        </span>
      </div>
    </div>`;
}

// ===== TABELA DE ATENDIMENTOS =====
function renderHistoricoTable(historico) {
  if (!historico || !historico.length) return '';
  const sorted = [...historico].sort((a,b) =>
    (b.dataOrigem||'') > (a.dataOrigem||'') ? 1 : -1);
  const rows = sorted.map(h => `
    <tr>
      <td><strong>${h.os||'----'}</strong></td>
      <td>${fmtDate(h.dataOrigem)}</td>
      <td>${fmtDate(h.dataConc)}</td>
      <td>${h.prefixo||'----'}</td>
      <td>${h.causa||'----'}</td>
    </tr>`).join('');
  return `
    <div style="margin-top:24px">
      <div class="gantt-title" style="margin-bottom:12px">Todos os Atendimentos</div>
      <div class="historico-table-wrap">
        <table class="historico-table">
          <thead><tr>
            <th>OS</th><th>Data Início</th><th>Data Fim</th><th>Equipe</th><th>Causa</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ===== PESQUISA PRINCIPAL =====
async function pesquisarUC(uc) {
  const resultado = document.getElementById('resultado');
  resultado.innerHTML = `<div class="loading-state"><div class="spinner"></div><br>Consultando base de dados...</div>`;

  uc = uc.trim();
  if (!uc) { resultado.innerHTML = `<div class="no-results"><p>Digite uma UC para pesquisar.</p></div>`; return; }

  try {
    const doc = await db.collection('historico').doc(uc).get();
    if (!doc.exists) {
      resultado.innerHTML = `
        <div class="no-results">
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <circle cx="30" cy="30" r="28" stroke="#C8D6E5" stroke-width="2"/>
            <path d="M20 30h20M30 20v20" stroke="#C8D6E5" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p>UC <strong>${uc}</strong> não encontrada na base histórica.</p>
        </div>`;
      return;
    }

    const d = doc.data();
    const isRet = calcRetrabalho(d.dataConc);
    const fim90 = d.dataConc ? new Date(new Date(d.dataConc).getTime() + 91*86400000) : null;
    const diasR = fim90 ? Math.ceil((fim90 - new Date()) / 86400000) : null;

    resultado.innerHTML = `
      <div class="result-card">
        <div class="result-header">
          <div class="result-uc">UC ${uc}</div>
          ${isRet ? `<span class="badge-retrabalho">⚠ Em Retrabalho</span>` : `<span class="badge-ok">✓ Fora do Período</span>`}
        </div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Total de Atendimentos</div>
            <div class="info-value highlight">${d.qtdAtendimentos||1}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Última OS</div>
            <div class="info-value">${d.ultimaOS||'----'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Data Início Último Atend.</div>
            <div class="info-value">${fmtDate(d.dataOrigem)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Data Fim Último Atend.</div>
            <div class="info-value">${fmtDate(d.dataConc)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Equipe</div>
            <div class="info-value">${d.prefixo||'----'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Causa</div>
            <div class="info-value">${d.causa||'----'}</div>
          </div>
          ${fim90 ? `
          <div class="info-item">
            <div class="info-label">Sai do Retrabalho em</div>
            <div class="info-value" style="color:${isRet?'var(--eq-red)':'var(--eq-green)'}">
              ${fmtDateShort(fim90.toISOString())}
              ${diasR !== null ? `<span style="font-size:0.8rem;font-weight:400;margin-left:6px">(${diasR > 0 ? diasR+'d restantes' : 'encerrado'})</span>` : ''}
            </div>
          </div>` : ''}
        </div>
      </div>
      ${renderGantt(d.historico)}
      ${renderHistoricoTable(d.historico)}`;

  } catch(err) {
    console.error(err);
    resultado.innerHTML = `<div class="no-results"><p>Erro ao consultar: ${err.message}</p></div>`;
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  const btn   = document.getElementById('search-btn');
  const input = document.getElementById('search-input');

  btn.addEventListener('click', () => pesquisarUC(input.value));
  input.addEventListener('keydown', e => { if (e.key==='Enter') pesquisarUC(input.value); });

  // Breadcrumb dinâmico conforme origem
  const params    = new URLSearchParams(window.location.search);
  const ucParam   = params.get('uc');
  const fromParam = params.get('from');
  const navEl     = document.getElementById('topbar-nav');

  if (fromParam === 'alertas' && navEl) {
    navEl.innerHTML = `
      <a href="index.html" class="topbar-navitem">Início</a>
      <span class="topbar-navsep">›</span>
      <a href="alertas.html" class="topbar-navitem topbar-navitem--active">Alertas</a>
      <span class="topbar-navsep">›</span>
      <span class="topbar-navitem topbar-navitem--current">Pesquisa</span>`;
  } else if (navEl) {
    navEl.innerHTML = `
      <a href="index.html" class="topbar-navitem">Início</a>
      <span class="topbar-navsep">›</span>
      <span class="topbar-navitem topbar-navitem--current">Pesquisa</span>`;
  }

  if (ucParam) {
    input.value = ucParam;
    pesquisarUC(ucParam);
  }
});
