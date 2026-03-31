// js/callback.js — Sugestão de Call-Back

function _cbNorm(s) {
  return String(s||'').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}

function _cbIsProcedente(causa) {
  const c = _cbNorm(causa);
  if (!c || c === '----') return null; // sem causa — não classifica
  const IMP = [
    "ACESSO IMPEDIDO","DISJUNTOR BT CLIENTE DESARMADO","DISJUNTOR BT CLIENTE COM DEFEITO",
    "DISJUNTOR MT GRUPO A DESARMADO","ENCONTRADO ENERGIA CORTADA CLIENTE",
    "ENCONTRADO NORMAL UC","ENDERECO NAO LOCALIZADO","ILUMINACAO PUBLICA COM DEFEITO",
    "INSTALACAO APOS MEDICAO COM DEFEITO CLIENTE","PORTEIRA TRANCADA",
    "REDE TELEFONICA TV A CABO","RAMAL DE ENTRADA COM DEFEITO CLIENTE"
  ];
  const KW = [
    ["INSTALAC","APOS","MEDIC","DEFEITO","CLIENTE"],["ILUMINAC","PUBLICA"],
    ["ENCONTRADO","NORMAL"],["ENCONTRADO","ENERGIA","CORTADA"],["ACESSO","IMPEDIDO"],
    ["DISJUNTOR","DESARMADO"],["ENDERECO","NAO","LOCALIZADO"],["PORTEIRA","TRANCADA"],
    ["REDE","TELEFON"],["DISJUNTOR","BT","CLIENTE","COM","DEFEITO"],
    ["RAMAL","ENTRADA","DEFEITO","CLIENTE"]
  ];
  if (IMP.some(i => { const ni=_cbNorm(i); return c===ni||c.includes(ni)||ni.includes(c); })) return false;
  if (KW.some(kws => kws.every(kw => c.includes(kw)))) return false;
  return true;
}

function _cbChaveOS(osStr, dataStr) {
  const num = String(osStr||'').trim().replace(/^\d{4}-\d+-/, '');
  if (!dataStr) return String(osStr||'').trim();
  const d = new Date(dataStr);
  if (isNaN(d)) return String(osStr||'').trim();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${num}`;
}

function fmtDate(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDateShort(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((new Date() - new Date(iso)) / 86400000);
}

let _lista = [], _criterio = 'recente', _filtro = '';

function filtrarUC(v) {
  _filtro = v;
  document.getElementById('filtro-clear').style.display = v ? 'flex' : 'none';
  renderLista();
}
function limparFiltro() {
  _filtro = '';
  const i = document.getElementById('filtro-uc'); if (i) i.value = '';
  document.getElementById('filtro-clear').style.display = 'none';
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
  if (_criterio === 'mais-imp') lista.sort((a,b) => b.qtdImprocedentes - a.qtdImprocedentes);
  if (_criterio === 'recente')  lista.sort((a,b) => (b.ultimoAtend?.data_conc||'').localeCompare(a.ultimoAtend?.data_conc||''));
  if (_criterio === 'uc')       lista.sort((a,b) => a.uc.localeCompare(b.uc));

  const counter = document.getElementById('filtro-count');
  if (counter) counter.textContent = lista.length + ' UC' + (lista.length !== 1 ? 's' : '');

  const el = document.getElementById('callback-container');
  if (!lista.length) {
    el.innerHTML = `<div class="no-results" style="padding:48px 0">
      <p>Nenhuma UC encontrada com último atendimento improcedente e ocorrência ativa.</p>
    </div>`;
    return;
  }

  el.innerHTML = `<div class="callback-list">${lista.map(h => {
    const dias = diasDesde(h.ultimoAtend?.data_conc);
    const urgencia = dias !== null && dias <= 7 ? 'urgente' : dias !== null && dias <= 30 ? 'recente' : 'normal';
    const atendRows = h.historico.map((at,i) => {
      const proc = _cbIsProcedente(at.causa);
      const imp  = proc === false;
      return `<tr class="${imp?'row-improcedente':''}">
        <td><span class="atend-num-badge" style="background:${imp?'var(--eq-gray-400)':'var(--eq-blue)'}">${i+1}</span></td>
        <td><strong>${at.os||'----'}</strong></td>
        <td>${fmtDate(at.data_origem)}</td>
        <td>${fmtDate(at.data_conc)}</td>
        <td>${at.prefixo||'----'}</td>
        <td>${at.causa||'----'}</td>
        <td>${imp?'<span class="badge-improcedente" style="font-size:.68rem">✗ Improcedente</span>':proc===true?'<span class="badge-procedente" style="font-size:.68rem">✓ Procedente</span>':'<span style="font-size:.68rem;color:var(--eq-gray-400)">— Ativa</span>'}</td>
      </tr>`;
    }).join('');

    return `<div class="callback-card urgencia-${urgencia}">
      <div class="callback-header">
        <div class="callback-header-left">
          <div class="callback-uc">
            <a href="pesquisa.html?uc=${encodeURIComponent(h.uc)}&from=callback"
               style="color:var(--eq-blue-dark);text-decoration:none;font-weight:800;font-size:1.05rem">UC ${h.uc}</a>
          </div>
          <div class="callback-meta">
            ${h.qtdAtendimentos} atend. total ·
            último atend. finalizado improcedente${h.qtdImprocedentes > 1 ? ` · ${h.qtdImprocedentes} consecutivos` : ''}
          </div>
        </div>
        <div class="callback-header-right">
          <div class="callback-urgencia-badge urgencia-${urgencia}">
            ${urgencia==='urgente'?'🔴 Urgente':urgencia==='recente'?'🟡 Recente':'⚪ Normal'}
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
          ${h.historico.filter(a => a.data_conc).slice(-3).reverse().map(at => {
            const proc = _cbIsProcedente(at.causa);
            const imp  = proc === false;
            return `<span class="callback-causa-chip ${imp?'chip-imp':proc===true?'chip-proc':''}">
              ${imp?'✗':proc===true?'✓':'—'} ${(at.causa||'----').substring(0,40)}${(at.causa||'').length>40?'…':''}
              <span style="opacity:.6;font-size:.65rem;margin-left:4px">${fmtDateShort(at.data_conc||at.data_origem)}</span>
            </span>`;
          }).join('')}
        </div>
        <details class="callback-details">
          <summary>Ver histórico completo (${h.historico.length} atendimentos)</summary>
          <div class="historico-table-wrap" style="margin-top:12px">
            <table class="historico-table">
              <thead><tr><th>#</th><th>OS</th><th>Data Início</th><th>Data Fim</th><th>Equipe</th><th>Causa</th><th>Tipo</th></tr></thead>
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
    async function fetchAll(query) {
      let all=[], page=0;
      while(true){
        const{data}=await query.range(page*1000, page*1000+999);
        if(!data||!data.length) break;
        all=all.concat(data);
        if(data.length<1000) break;
        page++;
      }
      return all;
    }

    // Busca tudo em paralelo
    // historico_recente: pega TODOS (finalizados e ativos) para ter o histórico completo
    const [ativasRaw, hist, recenteRaw] = await Promise.all([
      fetchAll(db.from('visao_atual').select('uc,ocorrencia,estado')),
      fetchAll(db.from('historico').select('uc,qtd_atendimentos,historico')),
      fetchAll(db.from('historico_recente').select('uc,ocorrencia,dt_inicio,dt_fim,equipe,causa,finalizado,procedente'))
    ]);

    // Mapa histórico por UC
    const historicoMap = {};
    hist.forEach(h => { historicoMap[h.uc] = h; });

    // Mapa recente por UC — inclui finalizados E ativos para ter contexto completo
    const recenteMap = {};
    for (const r of recenteRaw) {
      if (!recenteMap[r.uc]) recenteMap[r.uc] = [];
      recenteMap[r.uc].push({
        os:          r.ocorrencia,
        data_origem: r.dt_inicio,
        data_conc:   r.dt_fim    || null,  // null = ainda ativo
        prefixo:     r.equipe    || '----',
        causa:       r.causa     || '',
        finalizado:  r.finalizado,
      });
    }

    // UCs únicas ativas
    const ucsUnicas = [...new Set(ativasRaw.map(a => a.uc))];
    _lista = [];

    let debug = { semHistorico: 0, semFinalizados: 0, ultimoProcedente: 0, semCausa: 0, adicionados: 0 };

    for (const uc of ucsUnicas) {
      const h = historicoMap[uc];

      // Atendimentos da base histórica (sempre finalizados)
      const atendHist = (h?.historico||[])
        .filter(a => a.data_conc)
        .map(a => ({...a, finalizado: true}));

      // Atendimentos do histórico recente — deduplicados
      const chavesVistas = new Set(atendHist.map(a => _cbChaveOS(a.os, a.data_origem)));
      const atendRecente = (recenteMap[uc]||[])
        .filter(a => !chavesVistas.has(_cbChaveOS(a.os, a.data_origem)));

      // Une tudo e ordena cronologicamente
      const todos = [...atendHist, ...atendRecente]
        .sort((a,b) => (a.data_origem||'').localeCompare(b.data_origem||''));

      if (!todos.length) { debug.semHistorico++; continue; }

      // Pega apenas os FINALIZADOS para determinar o último atendimento concluído
      const finalizados = todos.filter(a => a.data_conc);
      if (!finalizados.length) { debug.semFinalizados++; continue; }

      const ultimoFinalizado = finalizados[finalizados.length - 1];
      const proc = _cbIsProcedente(ultimoFinalizado.causa);

      if (proc === null) { debug.semCausa++; continue; }  // sem causa definida
      if (proc === true) { debug.ultimoProcedente++; continue; }  // último foi procedente

      // Chegou aqui: último atendimento finalizado foi IMPROCEDENTE → callback!
      let qtdImp = 0;
      for (let i = finalizados.length-1; i >= 0; i--) {
        if (_cbIsProcedente(finalizados[i].causa) === false) qtdImp++;
        else break;
      }

      debug.adicionados++;
      _lista.push({
        uc,
        qtdAtendimentos: Math.max(h?.qtd_atendimentos||0, todos.length),
        qtdImprocedentes: qtdImp,
        ultimoAtend: ultimoFinalizado,
        historico: todos,  // exibe todos (finalizados + ativo atual)
      });
    }

    // Log de diagnóstico no console do navegador
    console.log('📊 Callback diagnóstico:', {
      ucsAtivas:        ucsUnicas.length,
      semHistorico:     debug.semHistorico,
      semFinalizados:   debug.semFinalizados,
      ultimoProcedente: debug.ultimoProcedente,
      semCausa:         debug.semCausa,
      sugeridos:        debug.adicionados,
    });

    // Stats
    const urgentes = _lista.filter(h => { const d=diasDesde(h.ultimoAtend?.data_conc); return d!==null&&d<=7; }).length;
    const recentes = _lista.filter(h => { const d=diasDesde(h.ultimoAtend?.data_conc); return d!==null&&d>7&&d<=30; }).length;

    document.getElementById('stats-container').innerHTML = `
      <div class="alert-stats" style="margin-bottom:24px">
        <div class="stat-card danger"><div class="stat-value">${_lista.length}</div><div class="stat-label">UCs para Call-Back</div></div>
        <div class="stat-card danger" style="border-color:#b71c1c"><div class="stat-value">${urgentes}</div><div class="stat-label">🔴 Urgente (≤ 7 dias)</div></div>
        <div class="stat-card warning"><div class="stat-value">${recentes}</div><div class="stat-label">🟡 Recente (8–30 dias)</div></div>
        <div class="stat-card info"><div class="stat-value">${_lista.length-urgentes-recentes}</div><div class="stat-label">⚪ Normal (> 30 dias)</div></div>
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
