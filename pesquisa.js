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

// ===== GANTT — Linha do tempo com marcadores =====
function renderGantt(historico) {
  if (!historico || !historico.length) return '';
  const sorted = [...historico].filter(h => h.dataOrigem)
    .sort((a,b) => new Date(a.dataOrigem) - new Date(b.dataOrigem));
  if (!sorted.length) return '';

  const minDate = new Date(sorted[0].dataOrigem);
  const maxDate = new Date(sorted[sorted.length-1].dataOrigem);

  // Adiciona margem de 7 dias em cada lado para os marcadores não ficarem cortados
  minDate.setDate(minDate.getDate() - 7);
  maxDate.setDate(maxDate.getDate() + 7);
  const totalMs = maxDate - minDate || 1;

  // Ticks do eixo — 6 datas distribuídas
  const ticks = [];
  for (let i = 0; i <= 5; i++) {
    ticks.push(new Date(minDate.getTime() + totalMs * i / 5)
      .toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}));
  }

  // Marcadores
  const markers = sorted.map((h, i) => {
    const pos     = ((new Date(h.dataOrigem) - minDate) / totalMs * 100).toFixed(2);
    const isRet   = calcRetrabalho(h.dataConc);
    const isLast  = i === sorted.length - 1;
    const color   = isLast ? 'var(--eq-blue)' : (isRet ? 'var(--eq-red)' : 'var(--eq-blue)');
    const causaTip = (h.causa||'----').substring(0,45) + ((h.causa||'').length>45?'…':'');
    const num     = i + 1;

    // Alterna label acima/abaixo para evitar sobreposição
    const labelPos = (i % 2 === 0) ? 'above' : 'below';

    return `
      <div class="tl-marker-wrap" style="left:${pos}%">
        ${labelPos === 'above' ? `
        <div class="tl-label tl-label--above">
          <div class="tl-label-os">${h.os||'----'}</div>
          <div class="tl-label-date">${fmtDateShort(h.dataOrigem)}</div>
        </div>` : ''}
        <div class="tl-dot" style="background:${color};border-color:${color}" data-idx="${num}">
          <span class="tl-dot-num">${num}</span>
          <div class="tl-tooltip">
            <div class="tl-tooltip-num">Atendimento ${num}</div>
            <div class="tl-tooltip-os">${h.os||'----'}</div>
            <div class="tl-tooltip-row">📋 ${causaTip}</div>
            <div class="tl-tooltip-row">▶ ${fmtDate(h.dataOrigem)}</div>
            <div class="tl-tooltip-row">■ ${fmtDate(h.dataConc)}</div>
          </div>
        </div>
        ${labelPos === 'below' ? `
        <div class="tl-label tl-label--below">
          <div class="tl-label-os">${h.os||'----'}</div>
          <div class="tl-label-date">${fmtDateShort(h.dataOrigem)}</div>
        </div>` : ''}
      </div>`;
  }).join('');

  const ticksHtml = ticks.map(t => `<div class="gantt-tick">${t}</div>`).join('');

  return `
    <div class="gantt-section">
      <div class="gantt-title">Linha do Tempo de Atendimentos</div>
      <div class="gantt-container">
        <div class="tl-chart">
          <!-- Linha central -->
          <div class="tl-line"></div>
          <!-- Marcadores -->
          ${markers}
        </div>
        <!-- Eixo de datas -->
        <div class="gantt-axis" style="margin-top:8px">${ticksHtml}</div>
      </div>
      <div style="margin-top:16px;display:flex;gap:20px;font-size:0.75rem;color:var(--eq-gray-600);flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:6px">
          <span style="width:12px;height:12px;border-radius:50%;background:var(--eq-blue);display:inline-block"></span>
          Atendimento
        </span>
        <span style="display:flex;align-items:center;gap:6px">
          <span style="width:12px;height:12px;border-radius:50%;background:var(--eq-red);display:inline-block"></span>
          Em período de retrabalho
        </span>
        <span style="font-size:0.72rem;color:var(--eq-gray-400)">Passe o mouse sobre cada marcador para ver os detalhes</span>
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

  // Posiciona tooltip perto do cursor, sempre dentro da viewport
  document.addEventListener('mousemove', e => {
    const tooltip = document.querySelector('.tl-dot:hover .tl-tooltip');
    if (!tooltip) return;
    const tw = 220, th = 120; // largura/altura aprox do tooltip
    const margin = 12;
    let x = e.clientX - tw / 2;
    let y = e.clientY - th - margin;
    // Evita sair pela direita
    if (x + tw > window.innerWidth - 8) x = window.innerWidth - tw - 8;
    // Evita sair pela esquerda
    if (x < 8) x = 8;
    // Evita sair pelo topo — aparece abaixo do cursor
    if (y < 8) y = e.clientY + margin;
    tooltip.style.left = x + 'px';
    tooltip.style.top  = y + 'px';
  });

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
