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
  const fim = new Date(new Date(dataConc).getTime() + 91 * 86400000);
  return Math.ceil((fim - new Date()) / 86400000);
}
function calcPct90(dataConc) {
  if (!dataConc) return 0;
  const inicio = new Date(dataConc);
  const fim    = new Date(inicio.getTime() + 91 * 86400000);
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

// ===== CARREGAR =====
async function carregarAlertas() {
  const statsEl    = document.getElementById('stats-container');
  const alertasEl  = document.getElementById('alertas-container');
  const historicoEl= document.getElementById('historico-container');

  alertasEl.innerHTML   = `<div class="loading-state"><div class="spinner"></div><br>Carregando ocorrências...</div>`;
  statsEl.innerHTML     = '';
  historicoEl.innerHTML = '';

  try {
    // 1. Visão atual
    const snapAtual = await db.collection('visao_atual').get();
    const ocorrencias = [];
    snapAtual.forEach(doc => ocorrencias.push(doc.data()));

    const comRetrabalho = ocorrencias.filter(o => o.emHistorico);

    // UCs que já têm alerta ativo (para não duplicar na seção de baixo)
    const ucsComAlerta = new Set(comRetrabalho.map(o => o.uc));

    // 2. Base histórica — todas dentro dos 90 dias, EXCETO as com alerta ativo
    const snapHist = await db.collection('historico').get();
    const hoje = new Date();
    const ucsSemAlerta = [];

    snapHist.forEach(doc => {
      const d = doc.data();
      if (!d.dataConc) return;
      const fim90 = new Date(new Date(d.dataConc).getTime() + 91 * 86400000);
      if (fim90 > hoje && !ucsComAlerta.has(doc.id)) {
        ucsSemAlerta.push({ uc: doc.id, ...d, fim90 });
      }
    });
    ucsSemAlerta.sort((a, b) => a.fim90 - b.fim90);

    const total90 = ucsSemAlerta.length + comRetrabalho.length;

    // ===== STATS =====
    statsEl.innerHTML = `
      <div class="alert-stats">
        <div class="stat-card danger">
          <div class="stat-value">${comRetrabalho.length}</div>
          <div class="stat-label">Ocorrências com Retrabalho</div>
        </div>
        </div>
        <div class="stat-card info">
          <div class="stat-value">${ocorrencias.length}</div>
          <div class="stat-label">Total Ativas</div>
        </div>
        <div class="stat-card success">
          <div class="stat-value">${total90}</div>
          <div class="stat-label">UCs no Período de 90 dias</div>
        </div>
      </div>`;

    // ===== ALERTAS COM RETRABALHO =====
    let alertasHTML = `
      <div class="section-head">
        <div class="section-count">${comRetrabalho.length}</div>
        <h2>⚠ Ocorrências em UCs com Retrabalho</h2>
      </div>`;

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

    // ===== HISTÓRICO 90 DIAS — DROPDOWNS =====
    let histHTML = `
      <div class="section-head" style="margin-top:48px">
        <div class="section-count blue">${ucsSemAlerta.length}</div>
        <h2>📅 UCs em Retrabalho sem Ocorrência Ativa</h2>
      </div>
      <p style="font-size:0.83rem;color:var(--eq-gray-600);margin-bottom:16px">
        Clique em cada UC para expandir o histórico de atendimentos e ver quando sairá do retrabalho.
      </p>`;

    if (!ucsSemAlerta.length) {
      histHTML += `<div class="no-results" style="padding:32px 0"><p>Nenhuma UC em retrabalho sem ocorrência ativa no momento.</p></div>`;
    } else {
      histHTML += `<div class="dropdown-list">`;

      for (const h of ucsSemAlerta) {
        const pct   = calcPct90(h.dataConc);
        const dias  = diasRestantes(h.dataConc);
        const barCls= pct >= 80 ? 'danger' : pct >= 50 ? 'warning' : 'safe';
        const diasCls = dias <= 10 ? 'dias-critico' : dias <= 30 ? 'dias-alerta' : 'dias-ok';
        const uid   = h.uc.replace(/\W/g, '_');

        // Linhas do histórico de atendimentos
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

        histHTML += `
          <div class="dropdown-item" id="item_${uid}">

            <!-- CABEÇALHO CLICÁVEL -->
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
                <!-- Barra de progresso 90 dias -->
                <div class="dropdown-progress">
                  <div class="dropdown-progress-label">
                    <span style="font-size:0.72rem;color:var(--eq-gray-500)">Período de retrabalho</span>
                    <span style="font-size:0.72rem;font-weight:700;color:var(--eq-gray-700)">${pct}%</span>
                  </div>
                  <div class="dias-bar-outer" style="height:6px">
                    <div class="dias-bar-inner ${barCls}" style="width:${pct}%"></div>
                  </div>
                </div>
                <!-- Contador de dias -->
                <div class="dropdown-dias-badge ${diasCls}">
                  <span class="dropdown-dias-num">${dias}</span>
                  <span class="dropdown-dias-label">dias restantes</span>
                </div>
                <!-- Data de saída -->
                <div class="dropdown-saida">
                  <span style="font-size:0.68rem;color:var(--eq-gray-400);display:block">Sai do retrabalho</span>
                  <span style="font-size:0.78rem;font-weight:700;color:${dias<=10?'var(--eq-red)':dias<=30?'var(--eq-amber-dark)':'var(--eq-green)'}">${fmtDateShort(h.fim90.toISOString())}</span>
                </div>
                <span class="dropdown-chevron" id="icon_${uid}">▾</span>
              </div>
            </div>

            <!-- CORPO EXPANSÍVEL -->
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

      histHTML += `</div>`;
    }

    historicoEl.innerHTML = histHTML;

  } catch(err) {
    console.error(err);
    alertasEl.innerHTML = `<div class="no-results"><p>Erro ao carregar: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carregarAlertas();
  document.getElementById('btn-refresh').addEventListener('click', carregarAlertas);
});
