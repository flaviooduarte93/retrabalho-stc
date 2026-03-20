// js/alertas.js

function fmtDate(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDateShort(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
}
function diasRestantes(dataConc) {
  if (!dataConc) return null;
  return Math.ceil((new Date(new Date(dataConc).getTime() + 91*86400000) - new Date()) / 86400000);
}
function calcPct90(dataConc) {
  if (!dataConc) return 0;
  const inicio = new Date(dataConc);
  const fim    = new Date(inicio.getTime() + 91*86400000);
  const hoje   = new Date();
  if (hoje >= fim)    return 100;
  if (hoje <= inicio) return 0;
  return Math.min(100, Math.round((hoje - inicio) / (fim - inicio) * 100));
}
function estadoBadge(estado) {
  const e = (estado||'').toUpperCase();
  if (e.includes('CAMPO') || e.includes('ANDAMENTO')) return 'badge-red';
  if (e.includes('AGUARD') || e.includes('PENDENTE'))  return 'badge-amber';
  if (e.includes('ATENDER'))                           return 'badge-blue';
  return 'badge-gray';
}

// ===== TOGGLE DROPDOWN =====
function toggleDropdown(uid) {
  const body = document.getElementById('body_' + uid);
  const icon = document.getElementById('icon_' + uid);
  const item = document.getElementById('item_' + uid);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (icon) icon.textContent = isOpen ? '▾' : '▴';
  if (item) item.classList.toggle('dropdown-open', !isOpen);
}

// ===== DADOS GLOBAIS para ordenação =====
let _ucsSemAlerta = [];

function renderDropdowns(lista) {
  const historicoEl = document.getElementById('historico-container');
  if (!lista.length) {
    historicoEl.querySelector('.dropdown-list').innerHTML =
      `<div class="no-results" style="padding:32px 0"><p>Nenhuma UC em retrabalho sem ocorrência ativa no momento.</p></div>`;
    return;
  }

  let html = '';
  for (const h of lista) {
    const pct     = calcPct90(h.dataConc);
    const dias    = diasRestantes(h.dataConc);
    const barCls  = pct >= 80 ? 'danger' : pct >= 50 ? 'warning' : 'safe';
    const diasCls = dias <= 10 ? 'dias-critico' : dias <= 30 ? 'dias-alerta' : 'dias-ok';
    const uid     = h.uc.replace(/\W/g, '_');

    const atendRows = (h.historico || [])
      .sort((a,b) => (b.dataOrigem||'') > (a.dataOrigem||'') ? 1 : -1)
      .map(at => `
        <tr>
          <td><strong>${at.os||'----'}</strong></td>
          <td>${fmtDate(at.dataOrigem)}</td>
          <td>${fmtDate(at.dataConc)}</td>
          <td>${at.prefixo||'----'}</td>
          <td>${at.causa||'----'}</td>
        </tr>`).join('');

    html += `
      <div class="dropdown-item" id="item_${uid}">
        <div class="dropdown-header" onclick="toggleDropdown('${uid}')">
          <div class="dropdown-header-left">
            <div class="dropdown-uc">UC ${h.uc}</div>
            <div class="dropdown-meta">
              ${h.qtdAtendimentos||1} atendimento(s) &nbsp;·&nbsp;
              Última OS: <strong>${h.ultimaOS||'----'}</strong> &nbsp;·&nbsp;
              Equipe: <strong>${h.prefixo||'----'}</strong>
            </div>
          </div>
          <div class="dropdown-header-right">
            <div class="dropdown-progress">
              <div class="dropdown-progress-label">
                <span style="font-size:0.72rem;color:var(--eq-gray-500)">Período de retrabalho</span>
                <span style="font-size:0.72rem;font-weight:700;color:var(--eq-gray-700)">${pct}%</span>
              </div>
              <div class="dias-bar-outer" style="height:6px">
                <div class="dias-bar-inner ${barCls}" style="width:${pct}%"></div>
              </div>
            </div>
            <div class="dropdown-dias-badge ${diasCls}">
              <span class="dropdown-dias-num">${dias}</span>
              <span class="dropdown-dias-label">dias restantes</span>
            </div>
            <div class="dropdown-saida">
              <span style="font-size:0.68rem;color:var(--eq-gray-400);display:block">Sai do retrabalho</span>
              <span style="font-size:0.78rem;font-weight:700;color:${dias<=10?'var(--eq-red)':dias<=30?'var(--eq-amber-dark)':'var(--eq-green)'}">
                ${fmtDateShort(h.fim90.toISOString())}
              </span>
            </div>
            <span class="dropdown-chevron" id="icon_${uid}">▾</span>
          </div>
        </div>
        <div class="dropdown-body" id="body_${uid}" style="display:none">
          <div class="historico-table-wrap" style="margin:0;border-radius:0">
            <table class="historico-table">
              <thead><tr>
                <th>OS</th><th>Data Início</th><th>Data Fim</th><th>Equipe</th><th>Causa</th>
              </tr></thead>
              <tbody>
                ${atendRows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--eq-gray-400)">Sem registros detalhados</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="dropdown-footer">
            <a href="pesquisa.html?uc=${encodeURIComponent(h.uc)}&from=alertas" class="dropdown-link">
              Ver histórico completo e Gantt →
            </a>
          </div>
        </div>
      </div>`;
  }

  historicoEl.querySelector('.dropdown-list').innerHTML = html;
}

let _criterioAtual = 'menor-tempo';
let _filtroUC = '';

function aplicarFiltroOrdem() {
  let lista = [..._ucsSemAlerta];
  if (_filtroUC.trim()) {
    lista = lista.filter(h => h.uc.toLowerCase().includes(_filtroUC.trim().toLowerCase()));
  }
  if (_criterioAtual === 'maior-tempo') lista.sort((a,b) => diasRestantes(b.dataConc) - diasRestantes(a.dataConc));
  if (_criterioAtual === 'menor-tempo') lista.sort((a,b) => diasRestantes(a.dataConc) - diasRestantes(b.dataConc));
  if (_criterioAtual === 'mais-atend')  lista.sort((a,b) => (b.qtdAtendimentos||1) - (a.qtdAtendimentos||1));
  const counter = document.getElementById('filtro-count');
  if (counter) counter.textContent = lista.length + ' UC' + (lista.length !== 1 ? 's' : '');
  renderDropdowns(lista);
}

function filtrarUC(valor) {
  _filtroUC = valor;
  const clearBtn = document.getElementById('filtro-clear');
  if (clearBtn) clearBtn.style.display = valor ? 'flex' : 'none';
  aplicarFiltroOrdem();
}

function limparFiltro() {
  _filtroUC = '';
  const input = document.getElementById('filtro-uc');
  if (input) input.value = '';
  const clearBtn = document.getElementById('filtro-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  aplicarFiltroOrdem();
}

function ordenarLista(criterio) {
  _criterioAtual = criterio;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('sort-btn--active'));
  document.getElementById('sort-' + criterio)?.classList.add('sort-btn--active');
  aplicarFiltroOrdem();
}

// ===== CARREGAR =====
async function carregarAlertas() {
  const statsEl    = document.getElementById('stats-container');
  const alertasEl  = document.getElementById('alertas-container');
  const historicoEl= document.getElementById('historico-container');

  alertasEl.innerHTML   = `<div class="loading-state"><div class="spinner"></div><br>Carregando ocorrências...</div>`;
  statsEl.innerHTML     = '';
  historicoEl.innerHTML = '';

  try {
    const snapAtual = await db.collection('visao_atual').get();
    const ocorrencias = [];
    snapAtual.forEach(doc => ocorrencias.push(doc.data()));
    const comRetrabalho = ocorrencias.filter(o => o.emHistorico);
    const ucsComAlerta  = new Set(comRetrabalho.map(o => o.uc));

    const snapHist = await db.collection('historico').get();
    const hoje = new Date();
    _ucsSemAlerta = [];

    snapHist.forEach(doc => {
      const d = doc.data();
      if (!d.dataConc) return;
      const fim90 = new Date(new Date(d.dataConc).getTime() + 91*86400000);
      if (fim90 > hoje && !ucsComAlerta.has(doc.id)) {
        _ucsSemAlerta.push({ uc: doc.id, ...d, fim90 });
      }
    });
    // Ordenação padrão: menor tempo restante primeiro
    _ucsSemAlerta.sort((a,b) => diasRestantes(a.dataConc) - diasRestantes(b.dataConc));

    // ===== STATS — 4 cards =====
    statsEl.innerHTML = `
      <div class="alert-stats">
        <div class="stat-card danger">
          <div class="stat-value">${comRetrabalho.length}</div>
          <div class="stat-label">Ocorrências com Retrabalho</div>
        </div>
        <div class="stat-card info">
          <div class="stat-value">${ocorrencias.length}</div>
          <div class="stat-label">Total de Ocorrências Ativas</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-value">${_ucsSemAlerta.length}</div>
          <div class="stat-label">UCs em Retrabalho sem Ocorrência Ativa</div>
        </div>
        <div class="stat-card success">
          <div class="stat-value">${_ucsSemAlerta.length + comRetrabalho.length}</div>
          <div class="stat-label">Total de UCs no Período de 90 dias</div>
        </div>
      </div>`;

    // ===== ALERTAS COM RETRABALHO =====
    let alertasHTML = `
      <div class="section-head">
        <div class="section-count">${comRetrabalho.length}</div>
        <h2>⚠ Ocorrências em UCs com Retrabalho</h2>
      </div>`;

    // Ordem: T-TRABALHANDO → A-EM DESLOCAMENTO → B-ATRIB. MULTIPLA → E-PREPARAÇÃO → resto
    const ordemEstado = (estado) => {
      const e = (estado||'').toUpperCase();
      if (e.startsWith('T-') || e.includes('TRABALHANDO'))    return 0;
      if (e.startsWith('A-') || e.includes('DESLOCAMENTO'))   return 1;
      if (e.startsWith('B-') || e.includes('MULTIPLA'))       return 2;
      if (e.startsWith('E-') || e.includes('PREPARA'))        return 3;
      return 4;
    };
    comRetrabalho.sort((a, b) => ordemEstado(a.estado) - ordemEstado(b.estado));

    if (!comRetrabalho.length) {
      alertasHTML += `<div class="no-results" style="padding:32px 0"><p>Nenhuma ocorrência ativa em UC com retrabalho.</p></div>`;
    } else {
      alertasHTML += `<div class="alert-list">`;
      for (const o of comRetrabalho) {
        const dias = diasRestantes(o.dataConc);
        alertasHTML += `
          <div class="alert-item retrabalho-ativo">
            <div class="alert-oc">#${o.ocorrencia}</div>
            <div class="alert-body">
              <div class="alert-uc">
                <a href="pesquisa.html?uc=${encodeURIComponent(o.uc)}&from=alertas"
                   style="color:var(--eq-blue-dark);text-decoration:none;font-weight:700">UC ${o.uc}</a>
              </div>
              <div class="alert-detail">${o.pontoEletrico||o.uc} · Equipe: ${o.equipe||'----'} · ${fmtDate(o.dtInicio)}</div>
              ${o.motivo ? `<div class="alert-detail" style="margin-top:2px">${o.motivo}</div>` : ''}
            </div>
            <div class="alert-badges">
              <span class="badge ${estadoBadge(o.estado)}">${o.estado||'----'}</span>
              <span class="badge badge-red">Retrabalho</span>
              <span class="badge badge-360">⚡ Atendimento 360° recomendado</span>
              ${o.qtdAtendimentos > 1 ? `<span class="badge badge-blue">${o.qtdAtendimentos}x atend.</span>` : ''}
              ${dias !== null ? `<span class="badge badge-amber">${dias}d restantes</span>` : ''}
            </div>
          </div>`;
      }
      alertasHTML += `</div>`;
    }
    alertasEl.innerHTML = alertasHTML;

    // ===== HISTÓRICO 90 DIAS — DROPDOWNS COM ORDENAÇÃO =====
    historicoEl.innerHTML = `
      <div class="section-head" style="margin-top:48px">
        <div class="section-count blue">${_ucsSemAlerta.length}</div>
        <h2>📅 UCs em Retrabalho sem Ocorrência Ativa</h2>
      </div>

      <div class="historico-toolbar">
        <div class="filtro-uc-wrap">
          <svg class="filtro-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.6"/><line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input id="filtro-uc" type="text" class="filtro-uc-input" placeholder="Buscar UC..." oninput="filtrarUC(this.value)" autocomplete="off"/>
          <button class="filtro-clear" id="filtro-clear" onclick="limparFiltro()" style="display:none" title="Limpar">✕</button>
          <span class="filtro-count" id="filtro-count"></span>
        </div>
        <div class="sort-group">
          <span class="sort-label">Ordenar:</span>
          <button id="sort-menor-tempo" class="sort-btn sort-btn--active" onclick="ordenarLista('menor-tempo')">⏱ Menor tempo</button>
          <button id="sort-maior-tempo" class="sort-btn" onclick="ordenarLista('maior-tempo')">📅 Maior tempo</button>
          <button id="sort-mais-atend" class="sort-btn" onclick="ordenarLista('mais-atend')">🔁 Mais atendimentos</button>
        </div>
      </div>

      <div class="dropdown-list"></div>`;

    aplicarFiltroOrdem();

  } catch(err) {
    console.error(err);
    alertasEl.innerHTML = `<div class="no-results"><p>Erro ao carregar: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carregarAlertas();
  document.getElementById('btn-refresh').addEventListener('click', carregarAlertas);
});
