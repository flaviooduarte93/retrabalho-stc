// js/inspecoes.js — Painel de Inspeções

const ACOES_LABEL = {
  troca_conector: 'Troca de conector',
  troca_ramal:    'Troca do ramal',
  poda_arvore:    'Poda de árvore',
  outros:         'Outros',
};
const ACAO_ST_LABEL = {
  pendente:       { label:'⏳ Pendente',       cor:'var(--eq-amber-dark)' },
  em_andamento:   { label:'🔄 Em andamento',   cor:'var(--eq-blue)' },
  concluida:      { label:'✅ Concluída',       cor:'var(--eq-green)' },
  nao_executada:  { label:'❌ Não executada',   cor:'var(--eq-red)' },
};
const STATUS_LABEL = {
  pendente:         { label:'⏳ Pendente',          cor:'var(--eq-amber-dark)' },
  ok:               { label:'✅ Tudo OK',            cor:'var(--eq-green)' },
  acao_necessaria:  { label:'⚠ Ação necessária',    cor:'var(--eq-red)' },
};

function fmtDate(iso){ if(!iso)return'----'; return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
function diasDesde(iso){ if(!iso)return null; return Math.floor((new Date()-new Date(iso))/86400000); }

let _todos = [], _chartFiscal = null, _chartAcoes = null;

// ============================================================
// MODAL ATUALIZAR AÇÃO
// ============================================================
function abrirModalAcao(id) {
  const insp = _todos.find(i => i.id === id);
  if (!insp) return;
  document.getElementById('modal-acao').style.display    = 'flex';
  document.getElementById('acao-uc-label').textContent   = `UC ${insp.uc}`;
  document.getElementById('acao-detalhe-label').textContent = `${ACOES_LABEL[insp.acao]||'—'} · Fiscal: ${insp.fiscal}`;
  document.getElementById('acao-insp-id').value          = id;
  document.getElementById('exec-por').value              = insp.acao_executada_por || '';
  document.getElementById('exec-obs').value              = insp.conclusao_obs || '';
  document.getElementById('exec-data').value             = insp.acao_executada_em
    ? new Date(insp.acao_executada_em).toISOString().slice(0,16) : '';

  // Marca radio correto
  const st = insp.acao_status || 'pendente';
  document.querySelectorAll('[name="acao-st"]').forEach(r => { r.checked = r.value === st; });
  toggleDataExec();
}

function fecharModalAcao() { document.getElementById('modal-acao').style.display = 'none'; }

function toggleDataExec() {
  const st = document.querySelector('[name="acao-st"]:checked')?.value || 'pendente';
  const show = st === 'concluida' || st === 'em_andamento';
  document.getElementById('exec-fields').style.display = show ? 'block' : 'none';
}

async function excluirInspecoesUC(uc) {
  if (!confirm(`Excluir TODAS as inspeções da UC ${uc}?

Essa ação é irreversível e a UC voltará a aparecer sem inspeção.`)) return;
  try {
    const { error } = await db.from('inspecoes').delete().eq('uc', uc);
    if (error) throw error;
    await carregar();
  } catch(err) {
    alert(`Erro ao excluir: ${err.message}`);
  }
}

async function salvarAcao() {
  const id     = parseInt(document.getElementById('acao-insp-id').value);
  const st     = document.querySelector('[name="acao-st"]:checked')?.value || 'pendente';
  const por    = document.getElementById('exec-por').value.trim() || null;
  const data   = document.getElementById('exec-data').value;
  const obs    = document.getElementById('exec-obs').value.trim() || null;
  const btn    = document.getElementById('btn-salvar-acao');
  btn.textContent = 'Salvando...'; btn.disabled = true;

  try {
    const { error } = await db.from('inspecoes').update({
      acao_status:          st,
      acao_executada_por:   por,
      acao_executada_em:    data ? new Date(data).toISOString() : null,
      conclusao_obs:        obs,
    }).eq('id', id);
    if (error) throw error;

    fecharModalAcao();
    await carregar();
  } catch(err) {
    alert(`Erro: ${err.message}`);
  } finally {
    btn.textContent = 'Salvar'; btn.disabled = false;
  }
}

// ============================================================
// FILTROS E RENDER
// ============================================================
function dadosFiltrados() {
  const fiscal    = document.getElementById('filtro-fiscal')?.value    || '';
  const status    = document.getElementById('filtro-status')?.value    || '';
  const acaoSt    = document.getElementById('filtro-acao-status')?.value || '';
  const buscaUC   = document.getElementById('busca-uc')?.value.trim().toLowerCase() || '';

  return _todos.filter(i => {
    if (fiscal  && i.fiscal  !== fiscal)  return false;
    if (status  && i.status  !== status)  return false;
    if (acaoSt  && i.acao_status !== acaoSt) return false;
    if (buscaUC && !i.uc.toLowerCase().includes(buscaUC)) return false;
    return true;
  });
}

function aplicarFiltros() {
  const lista = dadosFiltrados();
  renderTabela(lista);
  renderGraficos(lista);
  renderAcoesPendentes();
}

function renderKPIs(todos) {
  const acaoNec  = todos.filter(i => i.status === 'acao_necessaria');
  const concluidas = acaoNec.filter(i => i.acao_status === 'concluida');
  const pendAcao   = acaoNec.filter(i => i.acao_status === 'pendente' || !i.acao_status);

  // Tempo médio de resolução (apenas concluídas)
  const tempos = concluidas
    .filter(i => i.delegado_em && i.acao_executada_em)
    .map(i => Math.floor((new Date(i.acao_executada_em)-new Date(i.delegado_em))/86400000));
  const tempoMedio = tempos.length ? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : null;

  document.getElementById('kpi-container').innerHTML = `
    <div class="alert-stats" style="margin-bottom:20px">
      <div class="stat-card info">
        <div class="stat-value">${todos.length}</div>
        <div class="stat-label">Total de inspeções</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">${acaoNec.length}</div>
        <div class="stat-label">⚠ Ações necessárias</div>
      </div>
      <div class="stat-card danger">
        <div class="stat-value">${pendAcao.length}</div>
        <div class="stat-label">⏳ Ações pendentes</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${concluidas.length}</div>
        <div class="stat-label">✅ Ações concluídas</div>
      </div>
      <div class="stat-card info" style="border-color:var(--eq-blue)">
        <div class="stat-value">${tempoMedio !== null ? tempoMedio+'d' : '—'}</div>
        <div class="stat-label">Tempo médio de resolução</div>
      </div>
    </div>`;
}

function renderGraficos(lista) {
  const font = { family:"'Plus Jakarta Sans',sans-serif", size:11 };

  // Gráfico por fiscal
  const porFiscal = {};
  lista.forEach(i => { if(!porFiscal[i.fiscal]) porFiscal[i.fiscal]={ok:0,acao:0,pendente:0}; porFiscal[i.fiscal][i.status==='ok'?'ok':i.status==='acao_necessaria'?'acao':'pendente']++; });
  const fiscais = Object.keys(porFiscal);
  if (_chartFiscal) _chartFiscal.destroy();
  const ctx1 = document.getElementById('chart-fiscal')?.getContext('2d');
  if (ctx1) _chartFiscal = new Chart(ctx1, {
    type:'bar',
    data:{ labels:fiscais.map(f=>f.split(' ')[0]),
      datasets:[
        {label:'OK',data:fiscais.map(f=>porFiscal[f].ok),backgroundColor:'rgba(46,125,50,.8)'},
        {label:'Ação',data:fiscais.map(f=>porFiscal[f].acao),backgroundColor:'rgba(198,40,40,.8)'},
        {label:'Pendente',data:fiscais.map(f=>porFiscal[f].pendente),backgroundColor:'rgba(249,168,37,.8)'},
      ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font}}},scales:{x:{stacked:true,ticks:{font}},y:{stacked:true,ticks:{font}}}}
  });

  // Gráfico tipos de ação
  const porAcao = {};
  lista.filter(i=>i.acao).forEach(i=>{ porAcao[i.acao]=(porAcao[i.acao]||0)+1; });
  if (_chartAcoes) _chartAcoes.destroy();
  const ctx2 = document.getElementById('chart-acoes')?.getContext('2d');
  if (ctx2 && Object.keys(porAcao).length) _chartAcoes = new Chart(ctx2, {
    type:'doughnut',
    data:{
      labels:Object.keys(porAcao).map(k=>ACOES_LABEL[k]||k),
      datasets:[{data:Object.values(porAcao),backgroundColor:['#1565C0','#F9A825','#2E7D32','#757575']}]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font,boxWidth:12}}}}
  });
}

function renderAcoesPendentes() {
  const pendentes = _todos
    .filter(i => i.status==='acao_necessaria' && (i.acao_status==='pendente'||!i.acao_status))
    .sort((a,b) => new Date(a.delegado_em)-new Date(b.delegado_em));

  const el = document.getElementById('acoes-pendentes-container');
  if (!pendentes.length) { el.innerHTML=''; return; }

  el.innerHTML = `
    <div class="result-card" style="margin-bottom:20px;border-left:4px solid var(--eq-red)">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <span style="font-size:1.1rem">🚨</span>
        <div class="gantt-title" style="margin-bottom:0;color:var(--eq-red)">Ações Pendentes de Execução (${pendentes.length})</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${pendentes.map(i => {
          const diasAguardando = diasDesde(i.delegado_em);
          const urgencia = diasAguardando > 30 ? 'var(--eq-red)' : diasAguardando > 7 ? 'var(--eq-amber-dark)' : 'var(--eq-gray-600)';
          return `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:12px;background:var(--eq-gray-50);border-radius:10px;border:1px solid var(--eq-gray-100)">
            <div>
              <div style="font-weight:700;color:var(--eq-blue-dark)">UC ${i.uc}</div>
              <div style="font-size:.78rem;color:var(--eq-gray-600)">${ACOES_LABEL[i.acao]||'—'} · Fiscal: <strong>${i.fiscal}</strong></div>
              ${i.observacao ? `<div style="font-size:.75rem;color:var(--eq-gray-500);margin-top:2px;font-style:italic">"${i.observacao}"</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="text-align:right">
                <div style="font-size:.72rem;color:var(--eq-gray-400)">Aguardando há</div>
                <div style="font-weight:800;font-size:1.1rem;color:${urgencia}">${diasAguardando}d</div>
              </div>
              <div style="display:flex;gap:6px">
                <button onclick="abrirModalAcao(${i.id})" style="padding:6px 14px;border-radius:8px;border:none;background:var(--eq-blue);color:#fff;font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer;white-space:nowrap">Atualizar →</button>
                <button onclick="excluirInspecoesUC('${i.uc}')" title="Excluir inspeção" style="padding:6px 10px;border-radius:8px;border:1.5px solid var(--eq-red);background:transparent;color:var(--eq-red);font-size:.78rem;cursor:pointer">🗑</button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderTabela(lista) {
  const tbody = document.getElementById('tabela-body');
  if (!lista.length) {
    tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--eq-gray-400)">Nenhuma inspeção encontrada.</td></tr>';
    return;
  }
  const sorted = [...lista].sort((a,b)=>new Date(b.delegado_em)-new Date(a.delegado_em));
  tbody.innerHTML = sorted.map(i => {
    const st    = STATUS_LABEL[i.status]    || { label:i.status, cor:'var(--eq-gray-500)' };
    const acSt  = ACAO_ST_LABEL[i.acao_status] || { label:'—', cor:'var(--eq-gray-400)' };
    const btnAtualizar = i.status==='acao_necessaria'
      ? `<button onclick="abrirModalAcao(${i.id})" style="padding:4px 10px;border-radius:6px;border:1.5px solid var(--eq-blue);background:transparent;color:var(--eq-blue);font-family:inherit;font-size:.72rem;font-weight:700;cursor:pointer">Atualizar</button>`
      : '';
    return `<tr>
      <td><a href="pesquisa.html?uc=${i.uc}" style="color:var(--eq-blue-dark);font-weight:700">${i.uc}</a></td>
      <td>${i.fiscal}</td>
      <td><span style="font-size:.72rem;font-weight:700;color:${st.cor}">${st.label}</span></td>
      <td>${i.acao ? ACOES_LABEL[i.acao]||i.acao : '—'}</td>
      <td>${i.status==='acao_necessaria'?`<span style="font-size:.72rem;font-weight:700;color:${acSt.cor}">${acSt.label}</span>`:'—'}</td>
      <td style="font-size:.78rem">${fmtDate(i.delegado_em)}</td>
      <td style="font-size:.78rem">${fmtDate(i.acao_executada_em)}</td>
      <td style="text-align:center">${i.dias_restantes !== null && i.dias_restantes !== undefined ? `<span style="font-weight:700;color:${i.dias_restantes<=10?'var(--eq-red)':i.dias_restantes<=30?'var(--eq-amber-dark)':'var(--eq-green)'}">${i.dias_restantes}d</span>` : '—'}</td>
      <td style="max-width:200px;font-size:.75rem;color:var(--eq-gray-600)">${i.observacao||''} ${i.conclusao_obs?`<br><em style="color:var(--eq-green)">✓ ${i.conclusao_obs}</em>`:''}</td>
      <td style="display:flex;gap:6px">
        ${btnAtualizar}
        <button onclick="excluirInspecoesUC('${i.uc}')" title="Excluir todas inspeções desta UC" style="padding:4px 8px;border-radius:6px;border:1.5px solid var(--eq-red);background:transparent;color:var(--eq-red);font-family:inherit;font-size:.72rem;cursor:pointer">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function exportarCSV() {
  const lista = dadosFiltrados();
  const bom = '\uFEFF';
  const cabecalho = ['UC','Fiscal','Status','Ação','Status Ação','Executado por','Delegado em','Executado em','Dias restantes','Observação','Obs. conclusão'];
  const linhas = lista.map(i => [
    i.uc, i.fiscal,
    STATUS_LABEL[i.status]?.label||i.status,
    ACOES_LABEL[i.acao]||'—',
    ACAO_ST_LABEL[i.acao_status]?.label||'—',
    i.acao_executada_por||'—',
    fmtDate(i.delegado_em), fmtDate(i.acao_executada_em),
    i.dias_restantes??'—',
    i.observacao||'—', i.conclusao_obs||'—',
  ]);
  const csv = bom + [cabecalho,...linhas].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download = `inspecoes_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ============================================================
// EFETIVIDADE
// ============================================================
async function calcularEfetividade() {
  // Busca ocorrências recentes para detectar reincidência
  const { data: recentes } = await db
    .from('historico_recente')
    .select('uc,dt_inicio,finalizado')
    .eq('finalizado', true);

  const recentesPorUC = {};
  (recentes||[]).forEach(r => {
    if (!recentesPorUC[r.uc]) recentesPorUC[r.uc] = [];
    recentesPorUC[r.uc].push(r.dt_inicio);
  });

  const updates = [];
  const hoje = new Date();

  for (const i of _todos) {
    let efManutencao = i.efetividade_manutencao;
    let efInspecao   = i.efetividade_inspecao;
    let reincidenciaEm = i.reincidencia_em;
    let changed = false;

    // Efetividade de manutenção (90 dias após acao_executada_em)
    if (i.status === 'acao_necessaria' && i.acao_status === 'concluida' && i.acao_executada_em) {
      const dtExec    = new Date(i.acao_executada_em);
      const fim90     = new Date(dtExec.getTime() + 90*86400000);
      const ocorrs    = (recentesPorUC[i.uc]||[]).map(d => new Date(d)).filter(d => d > dtExec);
      const reincidiu = ocorrs.length > 0;

      const novaEf = reincidiu ? 'inefetiva' : hoje > fim90 ? 'efetiva' : 'monitorando';
      const novaReincidencia = reincidiu ? ocorrs.sort((a,b)=>a-b)[0].toISOString() : null;

      if (novaEf !== efManutencao || novaReincidencia !== reincidenciaEm) {
        efManutencao   = novaEf;
        reincidenciaEm = novaReincidencia;
        changed = true;
      }
    }

    // Efetividade de inspeção (30 dias após inspecionado_em)
    if (i.status === 'ok' && i.inspecionado_em) {
      const dtInsp = new Date(i.inspecionado_em);
      const fim30  = new Date(dtInsp.getTime() + 30*86400000);
      const ocorrs = (recentesPorUC[i.uc]||[]).map(d => new Date(d)).filter(d => d > dtInsp);
      const reincidiu = ocorrs.length > 0;

      const novaEf = reincidiu ? 'inefetiva' : hoje > fim30 ? 'efetiva' : 'monitorando';
      if (novaEf !== efInspecao) { efInspecao = novaEf; changed = true; }
    }

    if (changed) {
      updates.push({ id: i.id, efetividade_manutencao: efManutencao, efetividade_inspecao: efInspecao, reincidencia_em: reincidenciaEm });
      // Atualiza local
      i.efetividade_manutencao = efManutencao;
      i.efetividade_inspecao   = efInspecao;
      i.reincidencia_em        = reincidenciaEm;
    }
  }

  // Persiste atualizações no Supabase
  for (const u of updates) {
    await db.from('inspecoes').update({
      efetividade_manutencao: u.efetividade_manutencao,
      efetividade_inspecao:   u.efetividade_inspecao,
      reincidencia_em:        u.reincidencia_em,
    }).eq('id', u.id);
  }
}

function renderEfetividade() {
  const concluidas  = _todos.filter(i => i.status==='acao_necessaria' && i.acao_status==='concluida');
  const inspecoesOk = _todos.filter(i => i.status==='ok' && i.inspecionado_em);

  const efManut = {
    efetiva:    concluidas.filter(i=>i.efetividade_manutencao==='efetiva').length,
    inefetiva:  concluidas.filter(i=>i.efetividade_manutencao==='inefetiva').length,
    monitorando:concluidas.filter(i=>i.efetividade_manutencao==='monitorando'||!i.efetividade_manutencao).length,
  };
  const efInsp = {
    efetiva:    inspecoesOk.filter(i=>i.efetividade_inspecao==='efetiva').length,
    inefetiva:  inspecoesOk.filter(i=>i.efetividade_inspecao==='inefetiva').length,
    monitorando:inspecoesOk.filter(i=>i.efetividade_inspecao==='monitorando'||!i.efetividade_inspecao).length,
  };

  const pctManut = concluidas.length ? Math.round(efManut.efetiva/(concluidas.length-efManut.monitorando||1)*100) : null;
  const pctInsp  = inspecoesOk.length ? Math.round(efInsp.efetiva/(inspecoesOk.length-efInsp.monitorando||1)*100) : null;

  const inefetivas = _todos.filter(i => i.efetividade_manutencao==='inefetiva' || i.efetividade_inspecao==='inefetiva');

  const el = document.getElementById('efetividade-container');
  if (!el) return;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px" class="ef-grid">

      <!-- Efetividade manutenção -->
      <div class="result-card" style="border-left:4px solid var(--eq-blue)">
        <div class="gantt-title" style="margin-bottom:16px">🔧 Efetividade da Manutenção <span style="font-size:.72rem;color:var(--eq-gray-400);font-weight:400">(90 dias)</span></div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
          <div style="flex:1">
            <div style="height:10px;border-radius:99px;background:var(--eq-gray-100);overflow:hidden;display:flex">
              <div style="width:${pctManut??0}%;background:var(--eq-green);transition:width .5s"></div>
            </div>
            <div style="font-size:.72rem;color:var(--eq-gray-500);margin-top:4px">${concluidas.length} serviços concluídos</div>
          </div>
          <div style="font-size:1.6rem;font-weight:800;color:${pctManut>=80?'var(--eq-green)':pctManut>=50?'var(--eq-amber-dark)':'var(--eq-red)'}">${pctManut!==null?pctManut+'%':'—'}</div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:var(--eq-green)">${efManut.efetiva}</div><div style="font-size:.68rem;color:var(--eq-gray-400)">Efetivas</div></div>
          <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:var(--eq-red)">${efManut.inefetiva}</div><div style="font-size:.68rem;color:var(--eq-gray-400)">Reincidências</div></div>
          <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:var(--eq-blue)">${efManut.monitorando}</div><div style="font-size:.68rem;color:var(--eq-gray-400)">Monitorando</div></div>
        </div>
      </div>

      <!-- Efetividade inspeção -->
      <div class="result-card" style="border-left:4px solid var(--eq-green)">
        <div class="gantt-title" style="margin-bottom:16px">👁 Efetividade da Inspeção <span style="font-size:.72rem;color:var(--eq-gray-400);font-weight:400">(30 dias)</span></div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
          <div style="flex:1">
            <div style="height:10px;border-radius:99px;background:var(--eq-gray-100);overflow:hidden;display:flex">
              <div style="width:${pctInsp??0}%;background:var(--eq-green);transition:width .5s"></div>
            </div>
            <div style="font-size:.72rem;color:var(--eq-gray-500);margin-top:4px">${inspecoesOk.length} inspeções OK</div>
          </div>
          <div style="font-size:1.6rem;font-weight:800;color:${pctInsp>=80?'var(--eq-green)':pctInsp>=50?'var(--eq-amber-dark)':'var(--eq-red)'}">${pctInsp!==null?pctInsp+'%':'—'}</div>
        </div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:var(--eq-green)">${efInsp.efetiva}</div><div style="font-size:.68rem;color:var(--eq-gray-400)">Efetivas</div></div>
          <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:var(--eq-red)">${efInsp.inefetiva}</div><div style="font-size:.68rem;color:var(--eq-gray-400)">Reincidências</div></div>
          <div style="text-align:center"><div style="font-size:1.1rem;font-weight:800;color:var(--eq-blue)">${efInsp.monitorando}</div><div style="font-size:.68rem;color:var(--eq-gray-400)">Monitorando</div></div>
        </div>
      </div>
    </div>

    ${inefetivas.length ? `
    <div class="result-card" style="margin-bottom:20px;border-left:4px solid var(--eq-red)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span style="font-size:1rem">❌</span>
        <div class="gantt-title" style="margin-bottom:0;color:var(--eq-red)">Reincidências Detectadas (${inefetivas.length})</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${inefetivas.map(i => `
          <div style="padding:10px 14px;background:var(--eq-red-light);border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-weight:700;color:var(--eq-red)">UC ${i.uc}</div>
              <div style="font-size:.75rem;color:var(--eq-gray-600)">
                ${i.efetividade_manutencao==='inefetiva'?`🔧 Manutenção inefetiva (${ACOES_LABEL[i.acao]||'—'})`:''} 
                ${i.efetividade_inspecao==='inefetiva'?'👁 Inspeção inefetiva':''}
                · Fiscal: <strong>${i.fiscal}</strong>
              </div>
              ${i.reincidencia_em ? `<div style="font-size:.72rem;color:var(--eq-red)">Reincidência em: ${fmtDate(i.reincidencia_em)}</div>` : ''}
            </div>
            <a href="pesquisa.html?uc=${i.uc}" style="font-size:.75rem;font-weight:700;color:var(--eq-red);text-decoration:none">Ver histórico →</a>
          </div>`).join('')}
      </div>
    </div>` : ''}`;
}

// ============================================================
// CARREGAMENTO
// ============================================================
async function carregar() {
  try {
    async function fetchAll(q){
      let all=[],page=0;
      while(true){const{data}=await q.range(page*1000,page*1000+999);if(!data?.length)break;all=all.concat(data);if(data.length<1000)break;page++;}
      return all;
    }
    _todos = await fetchAll(db.from('inspecoes').select('*').order('delegado_em',{ascending:false}));
    await calcularEfetividade();
    renderKPIs(_todos);
    aplicarFiltros();
    renderAcoesPendentes();
    renderEfetividade();
  } catch(err) {
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carregar();
  document.getElementById('btn-refresh')?.addEventListener('click', carregar);
});
