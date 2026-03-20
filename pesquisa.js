// js/pesquisa.js
// Pesquisa UC no Firebase e exibe histórico + Gantt

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function calcRetrabalho(dataConc) {
  if (!dataConc) return false;
  const fim = new Date(dataConc);
  const limite = new Date(fim.getTime() + 90 * 24 * 60 * 60 * 1000);
  return new Date() <= limite;
}

function renderGantt(historico) {
  if (!historico || historico.length === 0) return '';

  // Ordena por dataOrigem
  const sorted = [...historico]
    .filter(h => h.dataOrigem)
    .sort((a, b) => new Date(a.dataOrigem) - new Date(b.dataOrigem));

  if (!sorted.length) return '';

  const minDate = new Date(sorted[0].dataOrigem);
  const maxDate = new Date(sorted[sorted.length - 1].dataConc || sorted[sorted.length - 1].dataOrigem);
  maxDate.setDate(maxDate.getDate() + 5); // margem

  const totalMs = maxDate - minDate || 1;

  // Gera ticks no eixo X (6 ticks)
  const ticks = [];
  for (let i = 0; i <= 5; i++) {
    const d = new Date(minDate.getTime() + (totalMs * i / 5));
    ticks.push(d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }));
  }

  const bars = sorted.map((h, i) => {
    const start = new Date(h.dataOrigem);
    const end   = h.dataConc ? new Date(h.dataConc) : new Date(start.getTime() + 3600000 * 4);
    const left  = ((start - minDate) / totalMs * 100).toFixed(2);
    const width = Math.max(((end - start) / totalMs * 100), 0.4).toFixed(2);

    const isRetrabalho = calcRetrabalho(h.dataConc);
    const cls = i < sorted.length - 1 && isRetrabalho ? 'retrabalho' : 'normal';
    const label = `OS ${h.os || '—'} · ${h.causa || '—'}`;

    return `
      <div class="gantt-row">
        <div class="gantt-label" title="OS ${h.os}">${fmtDateShort(h.dataOrigem)}</div>
        <div class="gantt-track">
          <div class="gantt-bar ${cls}" style="left:${left}%;width:${width}%"
               title="${label}\nInício: ${fmtDate(h.dataOrigem)}\nFim: ${fmtDate(h.dataConc)}\nCausa: ${h.causa}">
            ${h.os || ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const ticksHtml = ticks.map(t => `<div class="gantt-tick">${t}</div>`).join('');

  return `
    <div class="gantt-section">
      <div class="gantt-title">Linha do Tempo de Atendimentos</div>
      <div class="gantt-container">
        <div class="gantt-chart">
          ${bars}
          <div class="gantt-axis">${ticksHtml}</div>
        </div>
      </div>
      <div style="margin-top:16px;display:flex;gap:16px;font-size:0.75rem;color:var(--eq-gray-600)">
        <span style="display:flex;align-items:center;gap:6px">
          <span style="width:14px;height:14px;border-radius:3px;background:var(--eq-blue);display:inline-block"></span>
          Atendimento normal
        </span>
        <span style="display:flex;align-items:center;gap:6px">
          <span style="width:14px;height:14px;border-radius:3px;background:var(--eq-red);display:inline-block"></span>
          Em período de retrabalho (90 dias)
        </span>
      </div>
    </div>`;
}

function renderHistoricoTable(historico) {
  if (!historico || !historico.length) return '';
  const sorted = [...historico].sort((a, b) =>
    (b.dataOrigem ? new Date(b.dataOrigem) : 0) - (a.dataOrigem ? new Date(a.dataOrigem) : 0)
  );
  const rows = sorted.map(h => `
    <tr>
      <td><strong>${h.os || '—'}</strong></td>
      <td>${h.osOrigem || '—'}</td>
      <td>${fmtDate(h.dataOrigem)}</td>
      <td>${fmtDate(h.dataConc)}</td>
      <td>${h.prefixo || '—'}</td>
      <td>${h.causa || '—'}</td>
    </tr>`).join('');

  return `
    <div style="margin-top:24px">
      <div class="gantt-title" style="margin-bottom:12px">Todos os Atendimentos</div>
      <div class="historico-table-wrap">
        <table class="historico-table">
          <thead>
            <tr>
              <th>OS</th>
              <th>OS Origem</th>
              <th>Data Início</th>
              <th>Data Fim</th>
              <th>Equipe</th>
              <th>Causa</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

async function pesquisarUC(uc) {
  const resultado = document.getElementById('resultado');
  resultado.innerHTML = `<div class="loading-state"><div class="spinner"></div><br>Consultando base de dados...</div>`;

  uc = uc.trim();
  if (!uc) {
    resultado.innerHTML = `<div class="no-results"><p>Digite uma UC para pesquisar.</p></div>`;
    return;
  }

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
    const isRetrabalho = calcRetrabalho(d.dataConc);
    const fim90 = d.dataConc ? new Date(new Date(d.dataConc).getTime() + 91 * 24 * 60 * 60 * 1000) : null;

    resultado.innerHTML = `
      <div class="result-card">
        <div class="result-header">
          <div class="result-uc">UC ${uc}</div>
          ${isRetrabalho
            ? `<span class="badge-retrabalho">⚠ Em Retrabalho</span>`
            : `<span class="badge-ok">✓ Fora do Período</span>`}
        </div>

        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Total de Atendimentos</div>
            <div class="info-value highlight">${d.qtdAtendimentos || 1}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Última OS</div>
            <div class="info-value">${d.ultimaOS || '—'}</div>
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
            <div class="info-value">${d.prefixo || '—'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Causa</div>
            <div class="info-value">${d.causa || '—'}</div>
          </div>
          ${fim90 ? `
          <div class="info-item">
            <div class="info-label">Período Retrabalho até</div>
            <div class="info-value" style="color:${isRetrabalho ? 'var(--eq-red)' : 'var(--eq-green)'}">
              ${fmtDateShort(fim90.toISOString())}
            </div>
          </div>` : ''}
        </div>
      </div>

      ${renderGantt(d.historico)}
      ${renderHistoricoTable(d.historico)}
    `;

  } catch(err) {
    console.error(err);
    resultado.innerHTML = `<div class="no-results"><p>Erro ao consultar: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn   = document.getElementById('search-btn');
  const input = document.getElementById('search-input');

  btn.addEventListener('click', () => pesquisarUC(input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') pesquisarUC(input.value); });

  // Suporte a UC via query string: pesquisa.html?uc=123456
  const params = new URLSearchParams(window.location.search);
  const ucParam = params.get('uc');
  if (ucParam) {
    input.value = ucParam;
    pesquisarUC(ucParam);
  }
});

// Detecta se veio da tela de alertas e adiciona botão de retorno
(function() {
  function initBackButton() {
    const params    = new URLSearchParams(window.location.search);
    const fromParam = params.get('from');
    if (fromParam !== 'alertas') return;
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const backAlertas = document.createElement('a');
    backAlertas.href = 'alertas.html';
    backAlertas.className = 'topbar-back';
    backAlertas.style.cssText = 'margin-left:16px;color:#F9A825;border:1px solid rgba(249,168,37,0.45);padding:4px 14px;border-radius:20px;font-size:0.82rem;';
    backAlertas.innerHTML = '← Voltar aos Alertas';
    const existingBack = topbar.querySelector('.topbar-back');
    if (existingBack) existingBack.insertAdjacentElement('afterend', backAlertas);
    else topbar.appendChild(backAlertas);
  }
  document.addEventListener('DOMContentLoaded', initBackButton);
})();
