// js/detalhamento.js

const FISCAIS = (typeof getRegional === 'function' ? getRegional().fiscais : ['Hugo Leonardo','Rogério Machado','Cainan Ataides','Francisco Pereira','Paulo Henrique']);
const ACOES   = [
  { value: 'troca_conector', label: 'Troca de conector' },
  { value: 'troca_ramal',    label: 'Troca do ramal' },
  { value: 'poda_arvore',    label: 'Poda de árvore' },
  { value: 'outros',         label: 'Outros' },
];

function fmtDate(iso){if(!iso)return'----';return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function fmtDateShort(iso){if(!iso)return'----';return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function diasRestantes(dc){if(!dc)return null;return Math.ceil((new Date(new Date(dc).getTime()+91*86400000)-new Date())/86400000);}
function calcPct90(dc){if(!dc)return 0;const ini=new Date(dc),fim=new Date(ini.getTime()+91*86400000),hoje=new Date();if(hoje>=fim)return 100;if(hoje<=ini)return 0;return Math.min(100,Math.round((hoje-ini)/(fim-ini)*100));}

let _lista=[], _criterio='menor-tempo', _filtro='', _filtroCard='todos', _filtroInsp='todos';
let _paginaAtual=1, _porPagina=20, _filtroMunicipio='';
let _histTodos=[], _chartReincidencia=null;
let _inspecoesMap = {}; // uc → inspecao mais recente

// ============================================================
// MODAL DE DELEGAÇÃO
// ============================================================
function abrirModalDelegar(uc, dias, dataSaida) {
  const insp = _inspecoesMap[uc];
  document.getElementById('modal-delegar').style.display = 'flex';
  document.getElementById('modal-uc-label').textContent   = `UC ${uc}`;
  document.getElementById('modal-dias-label').textContent = dias !== null ? `${dias} dias restantes · Sai em ${dataSaida}` : '';
  document.getElementById('modal-uc-val').value   = uc;
  document.getElementById('modal-dias-val').value = dias ?? '';
  document.getElementById('modal-saida-val').value = dataSaida ?? '';

  // Pré-preenche se já tem delegação
  const statusAtual = insp?.status || 'pendente';
  document.getElementById('sel-fiscal').value = insp?.fiscal || '';
  document.getElementById('sel-status').value = statusAtual;
  document.getElementById('sel-acao').value   = insp?.acao   || '';
  document.getElementById('txt-obs').value    = insp?.observacao || '';
  // Marca o radio correto
  document.querySelectorAll('[name="status-insp"]').forEach(r => { r.checked = r.value === statusAtual; });
  toggleAcao();

  // Mostra histórico de delegação anterior se existir
  const hist = document.getElementById('modal-historico');
  if (insp) {
    const statusLabel = { pendente:'⏳ Pendente', ok:'✅ Tudo OK', acao_necessaria:'⚠ Ação necessária' };
    const acaoLabel   = ACOES.find(a => a.value === insp.acao)?.label || '';
    hist.innerHTML = `
      <div style="background:var(--eq-gray-50);border-radius:8px;padding:12px;font-size:.8rem;border:1px solid var(--eq-gray-200)">
        <div style="font-weight:700;color:var(--eq-gray-700);margin-bottom:6px">📋 Última delegação</div>
        <div>Fiscal: <strong>${insp.fiscal}</strong></div>
        <div>Status: <strong>${statusLabel[insp.status]||insp.status}</strong></div>
        ${insp.acao ? `<div>Ação: <strong>${acaoLabel}</strong></div>` : ''}
        ${insp.observacao ? `<div>Obs: <em>${insp.observacao}</em></div>` : ''}
        <div style="color:var(--eq-gray-500);margin-top:4px">Delegado em: ${fmtDate(insp.delegado_em)}</div>
        ${insp.inspecionado_em ? `<div style="color:var(--eq-gray-500)">Inspecionado em: ${fmtDate(insp.inspecionado_em)}</div>` : ''}
      </div>
      <a href="inspecoes.html" style="font-size:.78rem;font-weight:700;color:var(--eq-blue);text-decoration:none;white-space:nowrap">📊 Ver painel de inspeções →</a>
      </div>`;
    hist.style.display = 'block';
  } else {
    hist.innerHTML = '';
    hist.style.display = 'none';
  }
}

function fecharModalDelegar() {
  document.getElementById('modal-delegar').style.display = 'none';
}

async function cancelarDelegacao(uc, btnEl) {
  const insp = _inspecoesMap[uc];
  if (!insp) return;

  // Primeiro clique → muda para "Confirmar?" (evita window.confirm bloqueado)
  if (btnEl.dataset.confirming !== '1') {
    btnEl.dataset.confirming = '1';
    btnEl.textContent = 'Confirmar?';
    btnEl.style.background = 'var(--eq-red,#C62828)';
    btnEl.style.color = '#fff';
    btnEl.style.borderColor = 'var(--eq-red,#C62828)';
    // Volta ao estado original após 3 s sem segundo clique
    setTimeout(() => {
      if (btnEl.dataset.confirming === '1') {
        btnEl.dataset.confirming = '0';
        btnEl.textContent = '✕ Cancelar';
        btnEl.style.background = '#fff';
        btnEl.style.color = 'var(--eq-red,#C62828)';
        btnEl.style.borderColor = 'var(--eq-red,#C62828)';
      }
    }, 3000);
    return;
  }

  // Segundo clique → executa cancelamento
  btnEl.textContent = 'Cancelando...';
  btnEl.disabled = true;

  try {
    let error;
    if (insp.id) {
      ({ error } = await db.from('inspecoes').delete().eq('id', insp.id));
    } else {
      // Fallback: apaga por uc (caso id seja nulo por schema antigo)
      ({ error } = await db.from('inspecoes').delete().eq('uc', uc));
    }
    if (error) throw error;
    delete _inspecoesMap[uc];
    aplicarFiltroOrdem();
  } catch(err) {
    console.error('Erro ao cancelar delegação:', err);
    btnEl.textContent = '❌ Erro';
    setTimeout(() => { aplicarFiltroOrdem(); }, 2000);
  }
}

function toggleAcao() {
  const status = document.getElementById('sel-status').value;
  const acaoRow = document.getElementById('acao-row');
  acaoRow.style.display = status === 'acao_necessaria' ? 'block' : 'none';
}

async function salvarDelegacao() {
  const uc       = document.getElementById('modal-uc-val').value;
  const dias     = parseInt(document.getElementById('modal-dias-val').value) || null;
  const saida    = document.getElementById('modal-saida-val').value || null;
  const fiscal   = document.getElementById('sel-fiscal').value;
  const status   = document.getElementById('sel-status').value;
  const acao     = document.getElementById('sel-acao').value || null;
  const obs      = document.getElementById('txt-obs').value.trim() || null;

  if (!fiscal) { alert('Selecione um fiscal.'); return; }

  const btn = document.getElementById('btn-salvar-delegacao');
  btn.textContent = 'Salvando...'; btn.disabled = true;

  try {
    const payload = {
      uc, fiscal, status, acao, observacao: obs,
      dias_restantes: dias, data_saida: saida,
      inspecionado_em: status !== 'pendente' ? new Date().toISOString() : null,
    };

    const existente = _inspecoesMap[uc];
    let error;

    if (existente?.id) {
      // Atualiza registro existente
      ({ error } = await db.from('inspecoes').update(payload).eq('id', existente.id));
    } else {
      // Insere novo registro
      payload.delegado_em = new Date().toISOString();
      ({ error } = await db.from('inspecoes').insert(payload));
    }
    if (error) throw error;

    // Atualiza mapa local
    _inspecoesMap[uc] = { ...existente, ...payload };

    fecharModalDelegar();

    // Ação necessária → redireciona para o painel de inspeções
    if (status === 'acao_necessaria') {
      window.location.href = 'inspecoes.html';
      return;
    }

    aplicarFiltroOrdem();
  } catch(err) {
    alert(`Erro ao salvar: ${err.message}`);
  } finally {
    btn.textContent = 'Salvar'; btn.disabled = false;
  }
}

// ============================================================
// STATUS BADGE DE INSPEÇÃO
// ============================================================
function badgeInspecao(uc) {
  const i = _inspecoesMap[uc];
  const h = _lista.find(x => x.uc === uc);
  const dias    = diasRestantes(h?.data_conc) ?? 'null';
  const saida   = h ? fmtDateShort(h.fim90.toISOString()) : '';
  const btnDel  = `<button class="btn-delegar btn-delegar--small" onclick="abrirModalDelegar('${uc}',${dias},'${saida}')">✏ Atualizar</button>`;
  const btnNovo = `<button class="btn-delegar" onclick="abrirModalDelegar('${uc}',${dias},'${saida}')">👁 Delegar inspeção</button>`;

  if (!i) return btnNovo;

  const acaoLabel = ACOES.find(a => a.value === i.acao)?.label || '';

  // Serviço concluído
  if (i.status === 'acao_necessaria' && i.acao_status === 'concluida') {
    const ef = i.efetividade_manutencao;
    const efBadge = ef === 'efetiva'   ? `<span style="font-size:.68rem;font-weight:700;color:var(--eq-green);background:var(--eq-green-light);padding:1px 7px;border-radius:20px">✅ Manutenção efetiva</span>` :
                   ef === 'inefetiva'  ? `<span style="font-size:.68rem;font-weight:700;color:var(--eq-red);background:var(--eq-red-light);padding:1px 7px;border-radius:20px">❌ Reinciência detectada</span>` :
                   `<span style="font-size:.68rem;font-weight:700;color:var(--eq-blue);background:var(--eq-blue-pale);padding:1px 7px;border-radius:20px">🔍 Monitorando 90 dias</span>`;
    return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px">
      <span style="font-size:.72rem;font-weight:700;color:var(--eq-green)">🔧 Serviço concluído</span>
      <span style="font-size:.7rem;color:var(--eq-gray-500)">${acaoLabel}</span>
      <span style="font-size:.7rem;color:var(--eq-gray-400)">— ${i.fiscal}</span>
      ${efBadge}
      <a href="inspecoes.html" style="font-size:.68rem;color:var(--eq-blue);font-weight:600">Ver painel →</a>
    </div>`;
  }

  const cores  = { pendente:'var(--eq-amber-dark)', ok:'var(--eq-green)', acao_necessaria:'var(--eq-red)' };
  const icons  = { pendente:'⏳', ok:'✅', acao_necessaria:'⚠' };
  const labels = { pendente:'Inspeção pendente', ok:'Tudo OK', acao_necessaria:'Ação necessária' };

  // Inspeção OK — monitorar efetividade
  if (i.status === 'ok') {
    const ef = i.efetividade_inspecao;
    const efBadge = ef === 'efetiva'   ? `<span style="font-size:.68rem;color:var(--eq-green)">✅ Efetiva</span>` :
                   ef === 'inefetiva'  ? `<span style="font-size:.68rem;color:var(--eq-red)">❌ Reincidência</span>` :
                   `<span style="font-size:.68rem;color:var(--eq-blue)">🔍 30 dias</span>`;
    return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px">
      <span style="font-size:.72rem;font-weight:700;color:var(--eq-green)">✅ Tudo OK — ${i.fiscal}</span>
      ${efBadge} ${btnDel}
    </div>`;
  }

  const btnCancel = i.status === 'pendente'
    ? `<button class="btn-delegar btn-delegar--cancel" onclick="event.stopPropagation();cancelarDelegacao('${uc}',this)" style="padding:4px 10px;border-radius:20px;border:1.5px solid var(--eq-red,#C62828);background:#fff;color:var(--eq-red,#C62828);font-family:inherit;font-size:.72rem;font-weight:700;cursor:pointer;transition:all .15s">✕ Cancelar</button>`
    : '';

  return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px">
    <span style="font-size:.72rem;font-weight:700;color:${cores[i.status]}">${icons[i.status]} ${labels[i.status]}</span>
    ${i.acao ? `<span style="font-size:.7rem;color:var(--eq-gray-500)">${acaoLabel}</span>` : ''}
    <span style="font-size:.7rem;color:var(--eq-gray-400)">— ${i.fiscal}</span>
    ${btnDel}
    ${btnCancel}
  </div>`;
}

// ============================================================
// RENDER DA LISTA
// ============================================================
function filtrarMunicipio(v) {
  _paginaAtual = 1;
  _filtroMunicipio = v;
  aplicarFiltroOrdem();
}

function filtrarInsp(tipo) {
  _paginaAtual = 1;
  _filtroInsp = _filtroInsp === tipo ? 'todos' : tipo;
  // Atualiza visual dos badges
  document.querySelectorAll('[data-filtro-insp]').forEach(el => {
    el.classList.toggle('insp-filtro--active', el.dataset.filtroInsp === _filtroInsp);
  });
  aplicarFiltroOrdem();
}

// ============================================================
// PAGINAÇÃO
// ============================================================
function irPagina(p) {
  _paginaAtual = p;
  aplicarFiltroOrdem();
  document.querySelector('.dropdown-list')?.scrollIntoView({ behavior:'smooth', block:'start' });
}
function alterarPorPagina(n) {
  _porPagina   = parseInt(n);
  _paginaAtual = 1;
  aplicarFiltroOrdem();
}

// ============================================================
// GRÁFICO DE REINCIDÊNCIA
// ============================================================
function popularFiltroMes() {
  const sel = document.getElementById('filtro-mes-grafico');
  if (!sel) return null;
  const meses = new Set();
  for (const h of _histTodos) {
    for (const at of (h.historico||[])) {
      const d = at.data_origem || at.dataOrigem;
      if (d) meses.add(d.slice(0,7));
    }
  }
  const sorted   = [...meses].sort().reverse();
  const hoje     = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  // Usa mês atual se existir, senão o mais recente disponível
  const mesDefault = sorted.includes(mesAtual) ? mesAtual : (sorted[0] || mesAtual);

  sel.innerHTML = sorted.map(m => {
    const [y,mo] = m.split('-');
    const label  = new Date(y, mo-1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    return `<option value="${m}" ${m===mesDefault?'selected':''}>${label.charAt(0).toUpperCase()+label.slice(1)}</option>`;
  }).join('');

  sel.value = mesDefault; // força o valor selecionado
  return mesDefault;      // retorna para uso imediato
}

// Armazena dados por faixa para uso no click
let _dadosFaixas = { '1-3d':[], '4-7d':[], '8-12d':[], '>12d':[] };

function renderGraficoReincidencia(mesSel) {
  // Usa valor do select se não receber parâmetro
  if (!mesSel) mesSel = document.getElementById('filtro-mes-grafico')?.value;
  if (!mesSel || !_histTodos.length) return;

  const faixas = { '1-3d':[], '4-7d':[], '8-12d':[], '>12d':[] };

  // Normaliza causa para verificar procedência
  function _norm(s) {
    return String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,' ').trim();
  }
  const IMP_KW = [['INSTALAC','APOS','MEDIC','DEFEITO','CLIENTE'],['ILUMINAC','PUBLICA'],
    ['ENCONTRADO','NORMAL'],['ENCONTRADO','ENERGIA','CORTADA'],['ACESSO','IMPEDIDO'],
    ['DISJUNTOR','DESARMADO'],['ENDERECO','NAO','LOCALIZADO'],['PORTEIRA','TRANCADA'],
    ['REDE','TELEFON'],['DISJUNTOR','BT','CLIENTE','COM','DEFEITO'],['RAMAL','ENTRADA','DEFEITO','CLIENTE']];
  function _isProcedente(causa) {
    const c = _norm(causa);
    if (!c || c==='----') return false;
    if (IMP_KW.some(kws => kws.every(kw => c.includes(kw)))) return false;
    return true;
  }

  for (const h of _histTodos) {
    const atends = (h.historico||[])
      .filter(a => a.data_origem||a.dataOrigem)
      .sort((a,b) => (a.data_origem||a.dataOrigem) > (b.data_origem||b.dataOrigem) ? 1 : -1);

    for (let i = 1; i < atends.length; i++) {
      const cur       = atends[i];
      const ant       = atends[i-1];
      const dtCur     = cur.data_origem || cur.dataOrigem;
      const dtAntConc = ant.data_conc   || ant.dataConc;
      if (!dtCur || !dtAntConc) continue;
      if (dtCur.slice(0,7) !== mesSel) continue;

      // Só conta se o atendimento atual for procedente
      if (!_isProcedente(cur.causa)) continue;

      const dias = Math.round((new Date(dtCur) - new Date(dtAntConc)) / 86400000);
      if (dias < 1) continue;

      const registro = {
        uc:       h.uc,
        equipe:   cur.prefixo || '----',
        dtFim:    cur.data_conc || cur.dataConc,
        ocorrencia: cur.os     || '----',
        causa:    cur.causa    || '----',
        dias,
      };

      if      (dias <= 3)  faixas['1-3d'].push(registro);
      else if (dias <= 7)  faixas['4-7d'].push(registro);
      else if (dias <= 12) faixas['8-12d'].push(registro);
      else                 faixas['>12d'].push(registro);
    }
  }

  _dadosFaixas = faixas;

  const labels = ['1 a 3 dias','4 a 7 dias','8 a 12 dias','Mais de 12 dias'];
  const chaves = ['1-3d','4-7d','8-12d','>12d'];
  const valores = chaves.map(k => faixas[k].length);
  const cores   = ['#C62828','#E53935','#F9A825','#1565C0'];
  const total   = valores.reduce((a,b)=>a+b,0);

  if (_chartReincidencia) _chartReincidencia.destroy();
  const ctx = document.getElementById('chart-reincidencia')?.getContext('2d');
  if (!ctx) return;

  _chartReincidencia = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'UCs em retrabalho',
        data:  valores,
        backgroundColor: cores,
        borderRadius: 8,
        borderSkipped: false,
        hoverBackgroundColor: cores.map(c => c + 'CC'),
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cursor: 'pointer',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total ? ((ctx.raw/total)*100).toFixed(1) : 0;
              return ` ${ctx.raw} UCs (${pct}%) — clique para ver detalhes`;
            }
          }
        }
      },
      scales: {
        x: { grid:{ display:false }, ticks:{ font:{ family:"'Plus Jakarta Sans',sans-serif", size:12 } } },
        y: { beginAtZero:true, ticks:{ stepSize:1, font:{ family:"'Plus Jakarta Sans',sans-serif", size:11 } }, grid:{ color:'rgba(0,0,0,.05)' } }
      },
      onClick(evt) {
        const pts = _chartReincidencia.getElementsAtEventForMode(evt,'nearest',{intersect:true},true);
        if (!pts.length) return;
        const idx = pts[0].index;
        abrirDetalhesFaixa(chaves[idx], labels[idx]);
      }
    }
  });
}

function abrirDetalhesFaixa(chave, label) {
  const dados = _dadosFaixas[chave] || [];
  const el    = document.getElementById('detalhe-faixa');
  const titulo= document.getElementById('detalhe-faixa-titulo');
  if (!el || !titulo) return;

  titulo.textContent = `Reincidências — ${label} (${dados.length} UCs)`;

  if (!dados.length) {
    el.querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--eq-gray-400)">Nenhuma UC nesta faixa.</td></tr>';
  } else {
    const sorted = [...dados].sort((a,b) => a.dias - b.dias);
    el.querySelector('tbody').innerHTML = sorted.map(d => `<tr>
      <td><a href="pesquisa.html?uc=${d.uc}" style="color:var(--eq-blue-dark);font-weight:700">${d.uc}</a></td>
      <td>${d.equipe}</td>
      <td style="font-size:.78rem">${d.dtFim ? new Date(d.dtFim).toLocaleDateString('pt-BR') : '----'}</td>
      <td><strong>${d.ocorrencia}</strong></td>
      <td style="max-width:200px;font-size:.78rem">${d.causa}</td>
    </tr>`).join('');
  }

  el.style.display = 'block';
  el.scrollIntoView({ behavior:'smooth', block:'start' });
}

function toggleDropdown(uid){const body=document.getElementById('body_'+uid),icon=document.getElementById('icon_'+uid),item=document.getElementById('item_'+uid);if(!body)return;const open=body.style.display!=='none';body.style.display=open?'none':'block';if(icon)icon.textContent=open?'▾':'▴';if(item)item.classList.toggle('dropdown-open',!open);}

function renderLista(lista){
  const el=document.querySelector('.dropdown-list');
  if(!el)return;
  if(!lista.length){el.innerHTML=`<div class="no-results" style="padding:32px 0"><p>Nenhuma UC encontrada.</p></div>`;return;}
  el.innerHTML=lista.map(h=>{
    const pct=calcPct90(h.data_conc),dias=diasRestantes(h.data_conc);
    const barCls=pct>=80?'danger':pct>=50?'warning':'safe';
    const diasCls=dias<=10?'dias-critico':dias<=30?'dias-alerta':'dias-ok';
    const uid=h.uc.replace(/\W/g,'_');
    const hist=(h.historico||[]).sort((a,b)=>(a.data_origem||'')>(b.data_origem||'')?1:-1);
    const rows=hist.map((at,i)=>`<tr><td><span class="atend-num-badge">${i+1}</span></td><td><strong>${at.os||'----'}</strong></td><td>${fmtDate(at.data_origem)}</td><td>${fmtDate(at.data_conc)}</td><td>${at.prefixo||'----'}</td><td>${at.causa||'----'}</td><td>${badgeProcedencia(at.causa)}</td></tr>`).join('');
    const dataSaida = fmtDateShort(h.fim90.toISOString());
    return `<div class="dropdown-item" id="item_${uid}">
      <div class="dropdown-header" onclick="toggleDropdown('${uid}')">
        <div class="dropdown-header-left">
          <div class="dropdown-uc">UC ${h.uc}</div>
          <div class="dropdown-meta">${h.municipio?`<span style='font-size:.68rem;color:var(--eq-gray-400);font-weight:600'>${h.municipio}</span> · `:''} ${h.qtd_atendimentos||1} atend. · OS: <strong>${h.ultima_os||'----'}</strong> · <strong>${h.prefixo||'----'}</strong><br><span style="margin-top:4px;display:inline-block">${badgeProcedencia(h.causa)}</span></div>
          ${badgeInspecao(h.uc)}
        </div>
        <div class="dropdown-header-right">
          <div class="dropdown-progress">
            <div class="dropdown-progress-label"><span style="font-size:.72rem;color:var(--eq-gray-500)">Período</span><span style="font-size:.72rem;font-weight:700">${pct}%</span></div>
            <div class="dias-bar-outer" style="height:6px"><div class="dias-bar-inner ${barCls}" style="width:${pct}%"></div></div>
          </div>
          <div class="dropdown-dias-badge ${diasCls}"><span class="dropdown-dias-num">${dias}</span><span class="dropdown-dias-label">dias restantes</span></div>
          <div class="dropdown-saida"><span style="font-size:.68rem;color:var(--eq-gray-400);display:block">Sai em</span><span style="font-size:.78rem;font-weight:700;color:${dias<=10?'var(--eq-red)':dias<=30?'var(--eq-amber-dark)':'var(--eq-green)'}">${dataSaida}</span></div>
          <span class="dropdown-chevron" id="icon_${uid}">▾</span>
        </div>
      </div>
      <div class="dropdown-body" id="body_${uid}" style="display:none">
        <div class="historico-table-wrap" style="margin:0;border-radius:0">
          <table class="historico-table"><thead><tr><th>#</th><th>OS</th><th>Data Início</th><th>Data Fim</th><th>Equipe</th><th>Causa</th><th>Procedência</th></tr></thead>
          <tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--eq-gray-400)">Sem registros</td></tr>'}</tbody></table>
        </div>
        <div class="dropdown-footer"><a href="pesquisa.html?uc=${encodeURIComponent(h.uc)}&from=detalhamento" class="dropdown-link">Ver histórico completo →</a></div>
      </div>
    </div>`;
  }).join('');
}

function listaFiltrada(){
  let lista=[..._lista];
  if(_filtroCard==='critico') lista=lista.filter(h=>diasRestantes(h.data_conc)<=10);
  else if(_filtroCard==='alerta') lista=lista.filter(h=>{const d=diasRestantes(h.data_conc);return d>10&&d<=30;});
  else if(_filtroCard==='ok') lista=lista.filter(h=>diasRestantes(h.data_conc)>30);
  if(_filtro.trim()) lista=lista.filter(h=>h.uc.toLowerCase().includes(_filtro.trim().toLowerCase()));
  if(_filtroMunicipio) lista=lista.filter(h=>h.municipio===_filtroMunicipio);
  // Filtro por status de inspeção
  if(_filtroInsp === 'delegadas') lista=lista.filter(h=>!!_inspecoesMap[h.uc]);
  else if(_filtroInsp === 'ok')              lista=lista.filter(h=>_inspecoesMap[h.uc]?.status==='ok');
  else if(_filtroInsp === 'acao_necessaria') lista=lista.filter(h=>_inspecoesMap[h.uc]?.status==='acao_necessaria');
  else if(_filtroInsp === 'pendente')        lista=lista.filter(h=>_inspecoesMap[h.uc]?.status==='pendente');
  else if(_filtroInsp === 'sem_inspecao')   lista=lista.filter(h=>!_inspecoesMap[h.uc]);
  if(_criterio==='maior-tempo') lista.sort((a,b)=>diasRestantes(b.data_conc)-diasRestantes(a.data_conc));
  if(_criterio==='menor-tempo') lista.sort((a,b)=>diasRestantes(a.data_conc)-diasRestantes(b.data_conc));
  if(_criterio==='mais-atend')  lista.sort((a,b)=>(b.qtd_atendimentos||1)-(a.qtd_atendimentos||1));
  return lista;
}

function aplicarFiltroOrdem(){
  const lista     = listaFiltrada();
  const totalPags = Math.ceil(lista.length / _porPagina);
  _paginaAtual    = Math.min(_paginaAtual, Math.max(1, totalPags));
  const inicio    = (_paginaAtual - 1) * _porPagina;
  const pagina    = lista.slice(inicio, inicio + _porPagina);

  const c=document.getElementById('filtro-count');
  if(c)c.textContent=lista.length+' UC'+(lista.length!==1?'s':'');

  renderLista(pagina);

  // Paginação
  const pelDiv = document.getElementById('paginacao-det');
  if (!pelDiv) return;
  if (totalPags <= 1) { pelDiv.innerHTML=''; return; }

  const btnCls  = 'style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--eq-gray-200);background:#fff;font-family:inherit;font-size:.78rem;cursor:pointer"';
  const btnAtivo= 'style="padding:6px 12px;border-radius:8px;border:none;background:var(--eq-blue);color:#fff;font-family:inherit;font-size:.78rem;font-weight:700;cursor:pointer"';
  const btnDis  = 'style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--eq-gray-100);background:var(--eq-gray-50);font-family:inherit;font-size:.78rem;color:var(--eq-gray-300);cursor:default"';

  let pMin = Math.max(1, _paginaAtual-2);
  let pMax = Math.min(totalPags, pMin+4);
  pMin     = Math.max(1, pMax-4);

  const btns = [];
  btns.push(`<button ${_paginaAtual===1?btnDis:btnCls} onclick="irPagina(${_paginaAtual-1})">‹</button>`);
  if (pMin>1) btns.push(`<button ${btnCls} onclick="irPagina(1)">1</button><span style="font-size:.78rem;color:var(--eq-gray-400);padding:0 2px">…</span>`);
  for (let p=pMin; p<=pMax; p++) btns.push(`<button ${p===_paginaAtual?btnAtivo:btnCls} onclick="irPagina(${p})">${p}</button>`);
  if (pMax<totalPags) btns.push(`<span style="font-size:.78rem;color:var(--eq-gray-400);padding:0 2px">…</span><button ${btnCls} onclick="irPagina(${totalPags})">${totalPags}</button>`);
  btns.push(`<button ${_paginaAtual===totalPags?btnDis:btnCls} onclick="irPagina(${_paginaAtual+1})">›</button>`);

  // Seletor de itens por página
  const opcs = [10,20,50,100].map(n=>`<option value="${n}" ${n===_porPagina?'selected':''}>${n} por página</option>`).join('');

  pelDiv.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:14px;padding:0 4px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:.78rem;color:var(--eq-gray-400)">${inicio+1}–${Math.min(inicio+_porPagina,lista.length)} de ${lista.length} UCs</span>
        <select onchange="alterarPorPagina(this.value)" style="padding:5px 8px;border-radius:8px;border:1.5px solid var(--eq-gray-200);font-family:inherit;font-size:.75rem;cursor:pointer">${opcs}</select>
      </div>
      <div style="display:flex;gap:4px;align-items:center">${btns.join('')}</div>
    </div>`;
}

function filtrarCard(tipo){
  _paginaAtual=1;
  _filtroCard=_filtroCard===tipo?'todos':tipo;
  document.querySelectorAll('.stat-card[data-filtro]').forEach(el=>{el.classList.toggle('stat-card--active',el.dataset.filtro===_filtroCard);});
  aplicarFiltroOrdem();
}

function filtrarUC(v){_paginaAtual=1;_filtro=v;const c=document.getElementById('filtro-clear');if(c)c.style.display=v?'flex':'none';aplicarFiltroOrdem();}
function limparFiltro(){_paginaAtual=1;_filtro='';const i=document.getElementById('filtro-uc');if(i)i.value='';const c=document.getElementById('filtro-clear');if(c)c.style.display='none';aplicarFiltroOrdem();}
function ordenarLista(criterio){_paginaAtual=1;_criterio=criterio;document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('sort-btn--active'));document.getElementById('sort-'+criterio)?.classList.add('sort-btn--active');aplicarFiltroOrdem();}

function exportarExcel(){
  const lista=listaFiltrada();
  if(!lista.length){alert('Nenhuma UC para exportar.');return;}
  const linhas=[['UC','Data Último Atendimento','Procedência','Causa','Dias Restantes','Sai do Retrabalho em','Fiscal','Status Inspeção','Ação','Observação']];
  for(const h of lista){
    const proc=isProcedente?isProcedente(h.causa):(h.causa&&h.causa!=='----');
    const insp=_inspecoesMap[h.uc];
    const statusLabel={pendente:'Pendente',ok:'Tudo OK',acao_necessaria:'Ação necessária'};
    const acaoLabel=ACOES.find(a=>a.value===insp?.acao)?.label||'';
    linhas.push([
      h.uc,
      h.data_conc?new Date(h.data_conc).toLocaleDateString('pt-BR'):'----',
      proc?'Procedente':'Improcedente',
      h.causa||'----',
      diasRestantes(h.data_conc)??'----',
      fmtDateShort(h.fim90.toISOString()),
      insp?.fiscal||'—',
      statusLabel[insp?.status]||'—',
      acaoLabel||'—',
      insp?.observacao||'—',
    ]);
  }
  const bom='\uFEFF';
  const csv=bom+linhas.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=`retrabalho_${_filtroCard}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ============================================================
// CARREGAMENTO
// ============================================================
async function carregar(){
  document.getElementById('det-container').innerHTML=`<div class="loading-state"><div class="spinner"></div><br>Carregando...</div>`;
  try {
    async function fetchAll(query){
      let all=[],page=0;
      while(true){const{data}=await query.range(page*1000,page*1000+999);if(!data||!data.length)break;all=all.concat(data);if(data.length<1000)break;page++;}
      return all;
    }

    const [ativas, hist, inspecoes] = await Promise.all([
      fetchAll(db.from('visao_atual').select('uc,em_historico')),
      fetchAll(db.from('historico').select('uc,ultima_os,data_origem,data_conc,prefixo,causa,qtd_atendimentos,historico,alimentador,municipio,alimentador_log')),
      fetchAll(db.from('inspecoes').select('*').order('delegado_em',{ascending:false})),
    ]);

    // Monta mapa de inspeções — mantém só a mais recente por UC
    _inspecoesMap = {};
    for (const i of inspecoes) {
      if (!_inspecoesMap[i.uc]) _inspecoesMap[i.uc] = i;
    }

    const ucsComAlerta=new Set((ativas||[]).filter(o=>o.em_historico).map(o=>o.uc));
    _histTodos = hist||[]; // guarda para o gráfico
    const mesGrafico = popularFiltroMes();
    const hoje=new Date();
    _lista=(hist||[]).filter(h=>{
      if(!h.data_conc)return false;
      const fim90=new Date(new Date(h.data_conc).getTime()+91*86400000);
      return fim90>hoje&&!ucsComAlerta.has(h.uc);
    }).map(h=>({...h,fim90:new Date(new Date(h.data_conc).getTime()+91*86400000)}));
    _lista.sort((a,b)=>diasRestantes(a.data_conc)-diasRestantes(b.data_conc));

    const total=_lista.length;
    const critico=_lista.filter(h=>diasRestantes(h.data_conc)<=10).length;
    const alerta=_lista.filter(h=>{const d=diasRestantes(h.data_conc);return d>10&&d<=30;}).length;
    const ok=_lista.filter(h=>diasRestantes(h.data_conc)>30).length;
    const delegadas=Object.keys(_inspecoesMap).filter(uc=>_lista.some(h=>h.uc===uc)).length;

    document.getElementById('stats-det').innerHTML=`
      <div class="alert-stats" style="margin-bottom:24px">
        <div class="stat-card info" data-filtro="todos" onclick="filtrarCard('todos')" style="cursor:pointer">
          <div class="stat-value">${total}</div><div class="stat-label">UCs em Retrabalho sem Ocorrência Ativa</div>
        </div>
        <div class="stat-card danger" data-filtro="critico" onclick="filtrarCard('critico')" style="cursor:pointer">
          <div class="stat-value">${critico}</div><div class="stat-label">Saem em menos de 10 dias</div>
        </div>
        <div class="stat-card warning" data-filtro="alerta" onclick="filtrarCard('alerta')" style="cursor:pointer">
          <div class="stat-value">${alerta}</div><div class="stat-label">Saem em 10 a 30 dias</div>
        </div>
        <div class="stat-card success" data-filtro="ok" onclick="filtrarCard('ok')" style="cursor:pointer">
          <div class="stat-value">${ok}</div><div class="stat-label">Saem em mais de 30 dias</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <span style="font-size:.75rem;color:var(--eq-gray-400)">Filtrar por inspeção:</span>
        <button class="insp-badge-btn" data-filtro-insp="delegadas" onclick="filtrarInsp('delegadas')">
          👁 <strong>${delegadas}</strong> Delegadas
        </button>
        <button class="insp-badge-btn insp-ok" data-filtro-insp="ok" onclick="filtrarInsp('ok')">
          ✅ <strong>${Object.values(_inspecoesMap).filter(i=>i.status==='ok'&&_lista.some(h=>h.uc===i.uc)).length}</strong> OK
        </button>
        <button class="insp-badge-btn insp-acao" data-filtro-insp="acao_necessaria" onclick="filtrarInsp('acao_necessaria')">
          ⚠ <strong>${Object.values(_inspecoesMap).filter(i=>i.status==='acao_necessaria'&&_lista.some(h=>h.uc===i.uc)).length}</strong> Ação necessária
        </button>
        <button class="insp-badge-btn insp-pendente" data-filtro-insp="pendente" onclick="filtrarInsp('pendente')">
          ⏳ <strong>${Object.values(_inspecoesMap).filter(i=>i.status==='pendente'&&_lista.some(h=>h.uc===i.uc)).length}</strong> Pendentes
        </button>
        <button class="insp-badge-btn insp-sem" data-filtro-insp="sem_inspecao" onclick="filtrarInsp('sem_inspecao')">
          — <strong>${_lista.filter(h=>!_inspecoesMap[h.uc]).length}</strong> Sem inspeção
        </button>
      </div>`;

    document.getElementById('det-container').innerHTML=`
      <div class="historico-toolbar">
        <div class="filtro-uc-wrap">
          <svg class="filtro-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.6"/><line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input id="filtro-uc" type="text" class="filtro-uc-input" placeholder="Buscar UC..." oninput="filtrarUC(this.value)" autocomplete="off"/>
          <button class="filtro-clear" id="filtro-clear" onclick="limparFiltro()" style="display:none">✕</button>
          <span class="filtro-count" id="filtro-count"></span>
        </div>
        <div class="sort-group">
          <span class="sort-label">Ordenar:</span>
          <button id="sort-menor-tempo" class="sort-btn sort-btn--active" onclick="ordenarLista('menor-tempo')">⏱ Menor tempo</button>
          <button id="sort-maior-tempo" class="sort-btn" onclick="ordenarLista('maior-tempo')">📅 Maior tempo</button>
          <button id="sort-mais-atend" class="sort-btn" onclick="ordenarLista('mais-atend')">🔁 Mais atendimentos</button>
          <button class="sort-btn" onclick="exportarExcel()" style="background:var(--eq-green);color:white;border-color:var(--eq-green)">⬇ Exportar Excel</button>
        </div>
      </div>
      <div class="dropdown-list"></div>
      <div id="paginacao-det"></div>`;
    aplicarFiltroOrdem();
    if (mesGrafico) renderGraficoReincidencia(mesGrafico);
  } catch(err){
    console.error(err);
    document.getElementById('det-container').innerHTML=`<div class="no-results"><p>Erro: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', carregar);
