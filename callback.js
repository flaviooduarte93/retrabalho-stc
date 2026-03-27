// js/callback.js — Sugestão de Call-Back para UCs com atendimentos improcedentes

function fmtDate(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDateShort(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'});
}
function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((new Date() - new Date(iso)) / 86400000);
}

let _lista = [], _criterio = 'mais-imp', _filtro = '';

function filtrarUC(v) {
  _filtro = v;
  const c = document.getElementById('filtro-clear');
  if (c) c.style.display = v ? 'flex' : 'none';
  renderLista();
}
function limparFiltro() {
  _filtro = '';
  const i = document.getElementById('filtro-uc');
  if (i) i.value = '';
  const c = document.getElementById('filtro-clear');
  if (c) c.style.display = 'none';
  renderLista();
}
function ordenar(criterio) {
  _criterio = criterio;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('sort-btn--active'));
  document.getElementById('sort-' + criterio)?.classList.add('sort-btn--active');
  renderLista();
}

function renderLista() {
  let lista = [..._lista];
  if (_filtro.trim()) lista = lista.filter(h => h.uc.toLowerCase().includes(_filtro.trim().toLowerCase()));

  if (_criterio === 'mais-imp') lista.sort((a, b) => b.qtdImprocedentes - a.qtdImprocedentes);
  if (_criterio === 'recente')  lista.sort((a, b) => (b.ultimoAtend?.data_conc||'') > (a.ultimoAtend?.data_conc||'') ? 1 : -1);
  if (_criterio === 'uc')       lista.sort((a, b) => a.uc.localeCompare(b.uc));

  const counter = document.getElementById('filtro-count');
  if (counter) counter.textContent = lista.length + ' UC' + (lista.length !== 1 ? 's' : '');

  const el = document.getElementById('callback-container');
  if (!lista.length) {
    el.innerHTML = `<div class="no-results" style="padding:48px 0">
      <p>Nenhuma UC encontrada com últimos atendimentos improcedentes.</p>
    </div>`;
    return;
  }

  el.innerHTML = `<div class="callback-list">${lista.map(h => {
    const dias = diasDesde(h.ultimoAtend?.data_conc);
    const diasStr = dias !== null ? `${dias}d atrás` : '----';
    const urgencia = dias !== null && dias <= 7 ? 'urgente' : dias !== null && dias <= 30 ? 'recente' : 'normal';

    const atendRows = h.historico.map((at, i) => {
      const imp = !isProcedente(at.causa);
      return `<tr class="${imp ? 'row-improcedente' : ''}">
        <td><span class="atend-num-badge" style="background:${imp?'var(--eq-gray-400)':'var(--eq-blue)'}">${i+1}</span></td>
        <td><strong>${at.os||'----'}</strong></td>
        <td>${fmtDate(at.data_origem)}</td>
        <td>${fmtDate(at.data_conc)}</td>
        <td>${at.prefixo||'----'}</td>
        <td>${at.causa||'----'}</td>
        <td>${imp
          ? '<span class="badge-improcedente" style="font-size:.68rem">✗ Improcedente</span>'
          : '<span class="badge-procedente" style="font-size:.68rem">✓ Procedente</span>'}</td>
      </tr>`;
    }).join('');

    return `<div class="callback-card urgencia-${urgencia}">
      <div class="callback-header">
        <div class="callback-header-left">
          <div class="callback-uc">
            <a href="pesquisa.html?uc=${encodeURIComponent(h.uc)}&from=callback"
               style="color:var(--eq-blue-dark);text-decoration:none;font-weight:800;font-size:1.05rem">
              UC ${h.uc}
            </a>
          </div>
          <div class="callback-meta">
            ${h.qtdAtendimentos} atendimento(s) total ·
            <strong>${h.qtdImprocedentes}</strong> improcedente(s) consecutivo(s) no final
          </div>
        </div>
        <div class="callback-header-right">
          <div class="callback-urgencia-badge urgencia-${urgencia}">
            ${urgencia === 'urgente' ? '🔴 Urgente' : urgencia === 'recente' ? '🟡 Recente' : '⚪ Normal'}
          </div>
          <div class="callback-dias">
            <span class="callback-dias-num">${dias !== null ? dias : '?'}</span>
            <span class="callback-dias-label">dias desde<br>último atend.</span>
          </div>
          <div class="callback-sugestao">
            📞 <strong>Call-Back sugerido</strong>
            <div style="font-size:.72rem;color:var(--eq-gray-600);margin-top:2px">
              Último: ${fmtDateShort(h.ultimoAtend?.data_conc)} · ${h.ultimoAtend?.prefixo||'----'}
            </div>
          </div>
        </div>
      </div>

      <div class="callback-body">
        <div class="callback-causas">
          ${h.historico.slice(-3).reverse().map(at => {
            const imp = !isProcedente(at.causa);
            return `<span class="callback-causa-chip ${imp ? 'chip-imp' : 'chip-proc'}">
              ${imp ? '✗' : '✓'} ${(at.causa||'----').substring(0,35)}${(at.causa||'').length>35?'…':''}
              <span style="opacity:.6;font-size:.65rem;margin-left:4px">${fmtDateShort(at.data_conc||at.data_origem)}</span>
            </span>`;
          }).join('')}
        </div>

        <details class="callback-details">
          <summary>Ver histórico completo (${h.historico.length} atendimentos)</summary>
          <div class="historico-table-wrap" style="margin-top:12px">
            <table class="historico-table">
              <thead><tr>
                <th>#</th><th>OS</th><th>Data Início</th><th>Data Fim</th>
                <th>Equipe</th><th>Causa</th><th>Tipo</th>
              </tr></thead>
              <tbody>${atendRows}</tbody>
            </table>
          </div>
        </details>
      </div>
    </div>`;
  }).join('')}</div>`;
}

async function carregar() {
  document.getElementById('callback-container').innerHTML =
    `<div class="loading-state"><div class="spinner"></div><br>Analisando histórico...</div>`;

  try {
    // Busca toda a base histórica com paginação
    async function fetchAll(query) {
      let all = [], page = 0;
      while (true) {
        const { data } = await query.range(page * 1000, page * 1000 + 999);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < 1000) break;
        page++;
      }
      return all;
    }

    const hist = await fetchAll(
      db.from('historico').select('uc,qtd_atendimentos,historico,prefixo,causa')
    );

    // Filtra UCs onde os ÚLTIMOS atendimentos (com data_conc) são improcedentes
    // Critério: pelo menos os 2 últimos atendimentos procedentes são improcedentes
    _lista = [];

    for (const h of hist) {
      const atends = (h.historico || [])
        .filter(a => a.data_conc) // só finalizados
        .sort((a, b) => (a.data_origem||'') > (b.data_origem||'') ? 1 : -1);

      if (atends.length < 2) continue; // precisa de pelo menos 2 finalizados

      // Conta quantos dos últimos atendimentos são improcedentes (de trás para frente)
      let qtdImprocedentes = 0;
      for (let i = atends.length - 1; i >= 0; i--) {
        if (!isProcedente(atends[i].causa)) qtdImprocedentes++;
        else break; // para no primeiro procedente
      }

      if (qtdImprocedentes < 2) continue; // exige pelo menos 2 improcedentes consecutivos no final

      const ultimoAtend = atends[atends.length - 1];

      _lista.push({
        uc:               h.uc,
        qtdAtendimentos:  h.qtd_atendimentos || atends.length,
        qtdImprocedentes,
        ultimoAtend,
        historico:        atends,
      });
    }

    // Stats
    const urgentes = _lista.filter(h => {
      const d = diasDesde(h.ultimoAtend?.data_conc);
      return d !== null && d <= 7;
    }).length;
    const recentes = _lista.filter(h => {
      const d = diasDesde(h.ultimoAtend?.data_conc);
      return d !== null && d > 7 && d <= 30;
    }).length;

    document.getElementById('stats-container').innerHTML = `
      <div class="alert-stats" style="margin-bottom:24px">
        <div class="stat-card danger">
          <div class="stat-value">${_lista.length}</div>
          <div class="stat-label">UCs para Call-Back</div>
        </div>
        <div class="stat-card danger" style="border-color:#b71c1c">
          <div class="stat-value">${urgentes}</div>
          <div class="stat-label">🔴 Urgente (≤ 7 dias)</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-value">${recentes}</div>
          <div class="stat-label">🟡 Recente (8–30 dias)</div>
        </div>
        <div class="stat-card info">
          <div class="stat-value">${_lista.length - urgentes - recentes}</div>
          <div class="stat-label">⚪ Normal (> 30 dias)</div>
        </div>
      </div>`;

    renderLista();

  } catch(err) {
    console.error(err);
    document.getElementById('callback-container').innerHTML =
      `<div class="no-results"><p>Erro: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carregar();
  document.getElementById('btn-refresh')?.addEventListener('click', carregar);
});
