// js/alertas.js
// Carrega ocorrências ativas da visao_atual e exibe alertas + histórico 90 dias

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
}

function diasRestantes(dataConc) {
  if (!dataConc) return null;
  const fim = new Date(new Date(dataConc).getTime() + 91 * 24 * 60 * 60 * 1000);
  const hoje = new Date();
  return Math.ceil((fim - hoje) / (24 * 60 * 60 * 1000));
}

function calcPorcentagem90(dataConc) {
  if (!dataConc) return 0;
  const inicio = new Date(dataConc);
  const fim    = new Date(inicio.getTime() + 91 * 24 * 60 * 60 * 1000);
  const hoje   = new Date();
  if (hoje >= fim) return 100;
  if (hoje <= inicio) return 0;
  return Math.min(100, Math.round((hoje - inicio) / (fim - inicio) * 100));
}

function estadoBadge(estado) {
  const map = {
    'EM CAMPO':      'badge-red',
    'AGUARDANDO':    'badge-amber',
    'PENDENTE':      'badge-amber',
    'A ATENDER':     'badge-blue',
    'EM ANDAMENTO':  'badge-red',
  };
  // Encontra match parcial
  for (const [k, v] of Object.entries(map)) {
    if (estado.toUpperCase().includes(k)) return v;
  }
  return 'badge-gray';
}

async function carregarAlertas() {
  const statsEl    = document.getElementById('stats-container');
  const alertasEl  = document.getElementById('alertas-container');
  const historicoEl= document.getElementById('historico-container');

  alertasEl.innerHTML  = `<div class="loading-state"><div class="spinner"></div><br>Carregando ocorrências...</div>`;
  statsEl.innerHTML    = '';
  historicoEl.innerHTML= '';

  try {
    // 1. Carrega visão atual (todas menos finalizadas já foram filtradas no upload)
    const snapAtual = await db.collection('visao_atual').get();
    const ocorrencias = [];
    snapAtual.forEach(doc => ocorrencias.push(doc.data()));

    // Separa: com retrabalho e sem histórico
    const comRetrabalho = ocorrencias.filter(o => o.emHistorico);
    const semHistorico  = ocorrencias.filter(o => !o.emHistorico);

    // 2. Carrega histórico para tabela de 90 dias
    const snapHist = await db.collection('historico').get();
    const historico90 = [];
    const hoje = new Date();
    snapHist.forEach(doc => {
      const d = doc.data();
      if (!d.dataConc) return;
      const fim90 = new Date(new Date(d.dataConc).getTime() + 91 * 24 * 60 * 60 * 1000);
      if (fim90 > hoje) {
        historico90.push({ uc: doc.id, ...d, fim90 });
      }
    });
    historico90.sort((a, b) => a.fim90 - b.fim90);

    // ===== STATS =====
    statsEl.innerHTML = `
      <div class="alert-stats">
        <div class="stat-card danger">
          <div class="stat-value">${comRetrabalho.length}</div>
          <div class="stat-label">Ocorrências em UC com Retrabalho</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-value">${semHistorico.length}</div>
          <div class="stat-label">Ocorrências sem Histórico</div>
        </div>
        <div class="stat-card info">
          <div class="stat-value">${ocorrencias.length}</div>
          <div class="stat-label">Total Ativas</div>
        </div>
        <div class="stat-card success">
          <div class="stat-value">${historico90.length}</div>
          <div class="stat-label">UCs no Período de 90 dias</div>
        </div>
      </div>`;

    // ===== ALERTAS COM RETRABALHO =====
    let alertasHTML = `
      <div class="section-head">
        <div class="section-count">${comRetrabalho.length}</div>
        <h2>⚠ Ocorrências em UCs com Histórico de Retrabalho</h2>
      </div>`;

    if (comRetrabalho.length === 0) {
      alertasHTML += `<div class="no-results" style="padding:32px 0"><p>Nenhuma ocorrência ativa em UC com retrabalho.</p></div>`;
    } else {
      alertasHTML += `<div class="alert-list">`;
      for (const o of comRetrabalho) {
        const diasR = diasRestantes(o.dataConc);
        alertasHTML += `
          <div class="alert-item retrabalho-ativo">
            <div class="alert-oc">#${o.ocorrencia}</div>
            <div class="alert-body">
              <div class="alert-uc">
                <a href="pesquisa.html?uc=${encodeURIComponent(o.uc)}"
                   style="color:var(--eq-blue-dark);text-decoration:none;font-weight:700">
                  UC ${o.uc}
                </a>
              </div>
              <div class="alert-detail">
                ${o.pontoEletrico || o.uc} · Equipe: ${o.equipe || '—'} · ${fmtDate(o.dtInicio)}
              </div>
              ${o.motivo ? `<div class="alert-detail" style="margin-top:2px;color:var(--eq-gray-600)">${o.motivo}</div>` : ''}
            </div>
            <div class="alert-badges">
              <span class="badge ${estadoBadge(o.estado || '')}">${o.estado || '—'}</span>
              <span class="badge badge-red">Retrabalho</span>
              ${o.qtdAtendimentos > 1 ? `<span class="badge badge-blue">${o.qtdAtendimentos}x atend.</span>` : ''}
              ${diasR !== null ? `<span class="badge badge-amber">${diasR}d restantes</span>` : ''}
            </div>
          </div>`;
      }
      alertasHTML += `</div>`;
    }

    // ===== ALERTAS SEM HISTÓRICO =====
    alertasHTML += `
      <div class="section-head" style="margin-top:36px">
        <div class="section-count blue">${semHistorico.length}</div>
        <h2>📋 Ocorrências sem Histórico na Base</h2>
      </div>`;

    if (semHistorico.length === 0) {
      alertasHTML += `<div class="no-results" style="padding:32px 0"><p>Nenhuma ocorrência sem histórico.</p></div>`;
    } else {
      alertasHTML += `<div class="alert-list">`;
      for (const o of semHistorico) {
        alertasHTML += `
          <div class="alert-item sem-historico">
            <div class="alert-oc">#${o.ocorrencia}</div>
            <div class="alert-body">
              <div class="alert-uc">UC ${o.uc}</div>
              <div class="alert-detail">
                ${o.pontoEletrico || ''} · Equipe: ${o.equipe || '—'} · ${fmtDate(o.dtInicio)}
              </div>
            </div>
            <div class="alert-badges">
              <span class="badge ${estadoBadge(o.estado || '')}">${o.estado || '—'}</span>
              <span class="badge badge-gray">Sem histórico</span>
            </div>
          </div>`;
      }
      alertasHTML += `</div>`;
    }

    alertasEl.innerHTML = alertasHTML;

    // ===== HISTORICO 90 DIAS =====
    let histHTML = `
      <div class="section-head" style="margin-top:48px">
        <div class="section-count blue">${historico90.length}</div>
        <h2>📅 UCs no Período de 90 Dias (Retrabalho Ativo)</h2>
      </div>
      <p style="font-size:0.83rem;color:var(--eq-gray-600);margin-bottom:16px">
        UCs com OCO_DATA_CONCLUSAO dentro dos últimos 90 dias. A barra mostra o tempo consumido do período.
      </p>`;

    if (historico90.length === 0) {
      histHTML += `<div class="no-results" style="padding:32px 0"><p>Nenhuma UC no período de 90 dias.</p></div>`;
    } else {
      histHTML += `<div class="historico-table-wrap"><table class="historico-table">
        <thead>
          <tr>
            <th>UC</th>
            <th>Última OS</th>
            <th>Fim do Atend.</th>
            <th>Equipe</th>
            <th>Causa</th>
            <th>Qtd Atend.</th>
            <th style="min-width:180px">Tempo no Período</th>
            <th>Sai do Retrabalho</th>
          </tr>
        </thead>
        <tbody>`;

      for (const h of historico90) {
        const pct   = calcPorcentagem90(h.dataConc);
        const dias  = diasRestantes(h.dataConc);
        const barCls= pct >= 80 ? 'danger' : pct >= 50 ? 'warning' : 'safe';

        histHTML += `
          <tr>
            <td>
              <a href="pesquisa.html?uc=${encodeURIComponent(h.uc)}"
                 style="color:var(--eq-blue-dark);font-weight:700;text-decoration:none">
                ${h.uc}
              </a>
            </td>
            <td>${h.ultimaOS || '—'}</td>
            <td>${fmtDateShort(h.dataConc)}</td>
            <td>${h.prefixo || '—'}</td>
            <td>${h.causa || '—'}</td>
            <td style="text-align:center;font-weight:700">${h.qtdAtendimentos || 1}</td>
            <td>
              <div class="dias-bar-wrap">
                <div class="dias-bar-outer">
                  <div class="dias-bar-inner ${barCls}" style="width:${pct}%"></div>
                </div>
                <span style="font-size:0.75rem;color:var(--eq-gray-600);white-space:nowrap">${pct}%</span>
              </div>
            </td>
            <td>
              <span style="font-weight:600;color:${dias <= 10 ? 'var(--eq-red)' : dias <= 30 ? 'var(--eq-amber-dark)' : 'var(--eq-green)'}">
                ${fmtDateShort(h.fim90.toISOString())}
                <br><span style="font-weight:400;font-size:0.75rem">(${dias}d restantes)</span>
              </span>
            </td>
          </tr>`;
      }

      histHTML += `</tbody></table></div>`;
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
