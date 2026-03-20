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
  const fim = new Date(new Date(dataConc).getTime() + 91 * 24 * 60 * 60 * 1000);
  return Math.ceil((fim - new Date()) / (24 * 60 * 60 * 1000));
}
function calcPct90(dataConc) {
  if (!dataConc) return 0;
  const inicio = new Date(dataConc);
  const fim    = new Date(inicio.getTime() + 91 * 24 * 60 * 60 * 1000);
  const hoje   = new Date();
  if (hoje >= fim) return 100;
  if (hoje <= inicio) return 0;
  return Math.min(100, Math.round((hoje - inicio) / (fim - inicio) * 100));
}
function estadoBadge(estado) {
  const e = estado.toUpperCase();
  if (e.includes('CAMPO') || e.includes('ANDAMENTO')) return 'badge-red';
  if (e.includes('AGUARD') || e.includes('PENDENTE')) return 'badge-amber';
  if (e.includes('ATENDER')) return 'badge-blue';
  return 'badge-gray';
}

async function carregarAlertas() {
  const statsEl    = document.getElementById('stats-container');
  const alertasEl  = document.getElementById('alertas-container');
  const historicoEl= document.getElementById('historico-container');

  alertasEl.innerHTML   = `<div class="loading-state"><div class="spinner"></div><br>Carregando ocorrências...</div>`;
  statsEl.innerHTML     = '';
  historicoEl.innerHTML = '';

  try {
    // 1. Visão atual (apenas não-finalizadas, já filtradas no upload)
    const snapAtual = await db.collection('visao_atual').get();
    const ocorrencias = [];
    snapAtual.forEach(doc => ocorrencias.push(doc.data()));

    const comRetrabalho = ocorrencias.filter(o => o.emHistorico);
    const semHistorico  = ocorrencias.filter(o => !o.emHistorico);

    // 2. Histórico — todas as UCs ainda no período de 90 dias
    const snapHist = await db.collection('historico').get();
    const hoje = new Date();

    // UCs com alerta ativo (para não duplicar na lista de baixo)
    const ucsComAlerta = new Set(comRetrabalho.map(o => o.uc));

    const historico90 = [];
    snapHist.forEach(doc => {
      const d = doc.data();
      if (!d.dataConc) return;
      const fim90 = new Date(new Date(d.dataConc).getTime() + 91 * 24 * 60 * 60 * 1000);
      if (fim90 > hoje) {
        historico90.push({ uc: doc.id, ...d, fim90 });
      }
    });
    historico90.sort((a, b) => a.fim90 - b.fim90);

    // UCs em retrabalho que NÃO têm ocorrência ativa no campo (lista suspensa)
    const ucsSemAlerta = historico90.filter(h => !ucsComAlerta.has(h.uc));

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

    if (!comRetrabalho.length) {
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
                <a href="pesquisa.html?uc=${encodeURIComponent(o.uc)}&from=alertas"
                   style="color:var(--eq-blue-dark);text-decoration:none;font-weight:700">
                  UC ${o.uc}
                </a>
              </div>
              <div class="alert-detail">
                ${o.pontoEletrico || o.uc} · Equipe: ${o.equipe || '----'} · ${fmtDate(o.dtInicio)}
              </div>
              ${o.motivo ? `<div class="alert-detail" style="margin-top:2px">${o.motivo}</div>` : ''}
            </div>
            <div class="alert-badges">
              <span class="badge ${estadoBadge(o.estado || '')}">${o.estado || '----'}</span>
              <span class="badge badge-red">Retrabalho</span>
              <span class="badge badge-360">⚡ Atendimento 360° recomendado</span>
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

    if (!semHistorico.length) {
      alertasHTML += `<div class="no-results" style="padding:32px 0"><p>Nenhuma ocorrência sem histórico.</p></div>`;
    } else {
      alertasHTML += `<div class="alert-list">`;
      for (const o of semHistorico) {
        alertasHTML += `
          <div class="alert-item sem-historico">
            <div class="alert-oc">#${o.ocorrencia}</div>
            <div class="alert-body">
              <div class="alert-uc">UC ${o.uc}</div>
              <div class="alert-detail">${o.pontoEletrico || ''} · Equipe: ${o.equipe || '----'} · ${fmtDate(o.dtInicio)}</div>
            </div>
            <div class="alert-badges">
              <span class="badge ${estadoBadge(o.estado || '')}">${o.estado || '----'}</span>
              <span class="badge badge-gray">Sem histórico</span>
            </div>
          </div>`;
      }
      alertasHTML += `</div>`;
    }

    alertasEl.innerHTML = alertasHTML;

    // ===== HISTÓRICO 90 DIAS — UCs SEM ALERTA ATIVO (cards suspensos) =====
    let histHTML = `
      <div class="section-head" style="margin-top:48px">
        <div class="section-count blue">${ucsSemAlerta.length}</div>
        <h2>📅 UCs em Retrabalho sem Ocorrência Ativa</h2>
      </div>
      <p style="font-size:0.83rem;color:var(--eq-gray-600);margin-bottom:16px">
        Clique em cada UC para ver os detalhes do histórico. A barra mostra o tempo consumido dos 90 dias.
      </p>`;

    if (!ucsSemAlerta.length) {
      histHTML += `<div class="no-results" style="padding:32px 0"><p>Nenhuma UC em retrabalho sem ocorrência ativa.</p></div>`;
    } else {
      histHTML += `<div class="accordion-list">`;
      for (const h of ucsSemAlerta) {
        const pct   = calcPct90(h.dataConc);
        const dias  = diasRestantes(h.dataConc);
        const barCls= pct >= 80 ? 'danger' : pct >= 50 ? 'warning' : 'safe';
        const uid   = 'acc_' + h.uc.replace(/\W/g, '_');

        // Monta linhas do histórico de atendimentos
        const histRows = (h.historico || [])
          .sort((a, b) => (b.dataOrigem || '') > (a.dataOrigem || '') ? 1 : -1)
          .map(at => `
            <tr>
              <td><strong>${at.os || '----'}</strong></td>
              <td>${fmtDate(at.dataOrigem)}</td>
              <td>${fmtDate(at.dataConc)}</td>
              <td>${at.prefixo || '----'}</td>
              <td>${at.causa || '----'}</td>
            </tr>`).join('');

        histHTML += `
          <div class="accordion-item" id="${uid}">
            <div class="accordion-header" onclick="toggleAccordion('${uid}')">
              <div class="accordion-left">
                <span class="acc-uc">UC ${h.uc}</span>
                <span class="acc-meta">${h.qtdAtendimentos || 1} atendimento(s) · Última OS: ${h.ultimaOS || '----'} · Equipe: ${h.prefixo || '----'}</span>
              </div>
              <div class="accordion-right">
                <div class="dias-bar-wrap" style="width:160px">
                  <div class="dias-bar-outer">
                    <div class="dias-bar-inner ${barCls}" style="width:${pct}%"></div>
                  </div>
                  <span style="font-size:0.72rem;color:var(--eq-gray-600);white-space:nowrap;min-width:32px">${pct}%</span>
                </div>
                <span class="acc-dias ${dias <= 10 ? 'dias-critico' : dias <= 30 ? 'dias-alerta' : 'dias-ok'}">
                  ${dias}d
                </span>
                <span style="font-size:0.75rem;color:var(--eq-gray-400)">
                  Sai em ${fmtDateShort(h.fim90.toISOString())}
                </span>
                <span class="accordion-chevron">▾</span>
              </div>
            </div>
            <div class="accordion-body" style="display:none">
              <div class="historico-table-wrap" style="margin:0">
                <table class="historico-table">
                  <thead>
                    <tr>
                      <th>OS</th>
                      <th>Data Início</th>
                      <th>Data Fim</th>
                      <th>Equipe</th>
                      <th>Causa</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${histRows || '<tr><td colspan="5" style="text-align:center;color:var(--eq-gray-400)">Sem registros detalhados</td></tr>'}
                  </tbody>
                </table>
              </div>
              <div style="padding:12px 16px;text-align:right">
                <a href="pesquisa.html?uc=${encodeURIComponent(h.uc)}&from=alertas"
                   style="font-size:0.82rem;color:var(--eq-blue);font-weight:600;text-decoration:none">
                  Ver histórico completo →
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

function toggleAccordion(uid) {
  const item   = document.getElementById(uid);
  const body   = item.querySelector('.accordion-body');
  const chev   = item.querySelector('.accordion-chevron');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  chev.textContent   = isOpen ? '▾' : '▴';
  item.classList.toggle('accordion-open', !isOpen);
}

document.addEventListener('DOMContentLoaded', () => {
  carregarAlertas();
  document.getElementById('btn-refresh').addEventListener('click', carregarAlertas);
});
