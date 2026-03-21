// js/alertas.js — 3 visões: Retrabalho Confirmado / Possível Retrabalho / Primeiro Atendimento

function fmtDate(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDateShort(iso) {
  if (!iso) return '----';
  return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function diasRestantes(dataConc) {
  if (!dataConc) return null;
  return Math.ceil((new Date(new Date(dataConc).getTime()+91*86400000)-new Date())/86400000);
}
function calcPct90(dataConc) {
  if (!dataConc) return 0;
  const ini=new Date(dataConc), fim=new Date(ini.getTime()+91*86400000), hoje=new Date();
  if(hoje>=fim) return 100; if(hoje<=ini) return 0;
  return Math.min(100,Math.round((hoje-ini)/(fim-ini)*100));
}
function estadoBadge(estado) {
  const e=(estado||'').toUpperCase();
  if(e.includes('TRABALHANDO')) return 'badge-red';
  if(e.includes('DESLOCAMENTO')) return 'badge-amber';
  if(e.includes('MULTIPLA')) return 'badge-blue';
  if(e.includes('PREPARA')) return 'badge-gray';
  return 'badge-gray';
}

// ===== TOGGLE DROPDOWN =====
function toggleDropdown(uid) {
  const body=document.getElementById('body_'+uid);
  const icon=document.getElementById('icon_'+uid);
  const item=document.getElementById('item_'+uid);
  if(!body) return;
  const isOpen=body.style.display!=='none';
  body.style.display=isOpen?'none':'block';
  if(icon) icon.textContent=isOpen?'▾':'▴';
  if(item) item.classList.toggle('dropdown-open',!isOpen);
}

// ===== ORDENAÇÃO =====
let _ucsSemAlerta=[], _criterioAtual='menor-tempo', _filtroUC='';

function aplicarFiltroOrdem() {
  let lista=[..._ucsSemAlerta];
  if(_filtroUC.trim()) lista=lista.filter(h=>h.uc.toLowerCase().includes(_filtroUC.trim().toLowerCase()));
  if(_criterioAtual==='maior-tempo') lista.sort((a,b)=>diasRestantes(b.dataConc)-diasRestantes(a.dataConc));
  if(_criterioAtual==='menor-tempo') lista.sort((a,b)=>diasRestantes(a.dataConc)-diasRestantes(b.dataConc));
  if(_criterioAtual==='mais-atend')  lista.sort((a,b)=>(b.qtdAtendimentos||1)-(a.qtdAtendimentos||1));
  const counter=document.getElementById('filtro-count');
  if(counter) counter.textContent=lista.length+' UC'+(lista.length!==1?'s':'');
  renderDropdowns(lista);
}
function filtrarUC(v){_filtroUC=v;const c=document.getElementById('filtro-clear');if(c)c.style.display=v?'flex':'none';aplicarFiltroOrdem();}
function limparFiltro(){_filtroUC='';const i=document.getElementById('filtro-uc');if(i)i.value='';const c=document.getElementById('filtro-clear');if(c)c.style.display='none';aplicarFiltroOrdem();}
function ordenarLista(criterio){_criterioAtual=criterio;document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('sort-btn--active'));document.getElementById('sort-'+criterio)?.classList.add('sort-btn--active');aplicarFiltroOrdem();}

// ===== VISÃO ATIVA =====
let _visaoAtiva = 'retrabalho';

function mudarVisao(visao) {
  _visaoAtiva = visao;
  document.querySelectorAll('.visao-btn').forEach(b => b.classList.remove('visao-btn--active'));
  document.getElementById('visao-'+visao)?.classList.add('visao-btn--active');
  renderVisao();
}

// ===== DADOS GLOBAIS =====
let _dados = { retrabalho:[], possivel:[], primeiro:[] };

function renderVisao() {
  const el = document.getElementById('alertas-container');
  if (_visaoAtiva === 'retrabalho') renderRetrabalho(el);
  else if (_visaoAtiva === 'possivel') renderPossivel(el);
  else renderPrimeiro(el);
}

// ===== RENDER RETRABALHO CONFIRMADO =====
function renderRetrabalho(el) {
  const lista = _dados.retrabalho;
  const ordemEstado = e => {
    const u=(e||'').toUpperCase();
    if(u.includes('TRABALHANDO')) return 0;
    if(u.includes('DESLOCAMENTO')) return 1;
    if(u.includes('MULTIPLA')) return 2;
    if(u.includes('PREPARA')) return 3;
    return 4;
  };
  lista.sort((a,b)=>ordemEstado(a.estado)-ordemEstado(b.estado));

  if(!lista.length){el.innerHTML=`<div class="no-results" style="padding:48px 0"><p>Nenhuma ocorrência ativa em UC com retrabalho confirmado.</p></div>`;return;}

  el.innerHTML = `<div class="alert-list">${lista.map(o=>{
    const dias=diasRestantes(o.dataConc);
    const equipeStr=(o.estado||'').toUpperCase().startsWith('E-')?'':` · Equipe: ${o.equipe||'----'}`;
    return `
      <div class="alert-item retrabalho-ativo">
        <div class="alert-oc">#${o.ocorrencia}</div>
        <div class="alert-body">
          <div class="alert-uc">
            <a href="pesquisa.html?uc=${encodeURIComponent(o.uc)}&from=alertas" style="color:var(--eq-blue-dark);text-decoration:none;font-weight:700">UC ${o.uc}</a>
          </div>
          <div class="alert-detail">${o.pontoEletrico||o.uc}${equipeStr} · ${fmtDate(o.dtInicio)}</div>
          ${o.motivo?`<div class="alert-detail" style="margin-top:2px">${o.motivo}</div>`:''}
          <div style="margin-top:6px">${badgeProcedencia(o.causaHistorico)}</div>
        </div>
        <div class="alert-badges">
          <span class="badge ${estadoBadge(o.estado)}">${o.estado||'----'}</span>
          <span class="badge badge-red">Retrabalho</span>
          <span class="badge badge-360">⚡ Atendimento 360° recomendado</span>
          ${o.qtdAtendimentos>1?`<span class="badge badge-blue">${o.qtdAtendimentos}x atend.</span>`:''}
          ${dias!==null?`<span class="badge badge-amber">${dias}d restantes</span>`:''}
        </div>
      </div>`;
  }).join('')}</div>`;
}

// ===== RENDER POSSÍVEL RETRABALHO =====
function renderPossivel(el) {
  const lista = _dados.possivel;
  if(!lista.length){el.innerHTML=`<div class="no-results" style="padding:48px 0"><p>Nenhuma UC com possibilidade de retrabalho identificada.</p></div>`;return;}

  el.innerHTML = `
    <div class="alert-info-box" style="margin-bottom:16px">
      <strong>⚠ Possível Retrabalho:</strong> UCs que tiveram um atendimento procedente (F-FINALIZADA) 
      nos últimos 90 dias e possuem uma ocorrência ativa agora. O relógio dos 90 dias já está correndo.
    </div>
    <div class="alert-list">${lista.map(o=>{
      const diasR = o.dtFimProcedente ? diasRestantes(o.dtFimProcedente) : null;
      const equipeStr=(o.estado||'').toUpperCase().startsWith('E-')?'':` · Equipe: ${o.equipe||'----'}`;
      return `
        <div class="alert-item" style="border-left-color:var(--eq-amber)">
          <div class="alert-oc" style="color:var(--eq-amber-dark)">#${o.ocorrencia}</div>
          <div class="alert-body">
            <div class="alert-uc">UC ${o.uc}</div>
            <div class="alert-detail">${o.pontoEletrico||o.uc}${equipeStr} · ${fmtDate(o.dtInicio)}</div>
            <div class="alert-detail" style="margin-top:4px">
              🕐 1º atend. procedente: <strong>${fmtDate(o.dtFimProcedente)}</strong> 
              · OS: <strong>${o.osProcedente||'----'}</strong>
            </div>
            <div style="margin-top:6px">${badgeProcedencia(o.causaProcedente)} <span style="font-size:0.75rem;color:var(--eq-gray-600);margin-left:6px">${o.causaProcedente||'----'}</span></div>
          </div>
          <div class="alert-badges">
            <span class="badge ${estadoBadge(o.estado)}">${o.estado||'----'}</span>
            <span class="badge badge-amber">⚠ Possível Retrabalho</span>
            ${diasR!==null?`<span class="badge badge-amber">${diasR}d p/ confirmar</span>`:''}
          </div>
        </div>`;
    }).join('')}</div>`;
}

// ===== RENDER PRIMEIRO ATENDIMENTO =====
function renderPrimeiro(el) {
  const lista = _dados.primeiro;
  if(!lista.length){el.innerHTML=`<div class="no-results" style="padding:48px 0"><p>Nenhuma UC identificada como primeiro atendimento.</p></div>`;return;}

  el.innerHTML = `
    <div class="alert-info-box" style="margin-bottom:16px;border-color:var(--eq-green);background:var(--eq-green-light)">
      <strong style="color:var(--eq-green)">ℹ Primeiro Atendimento:</strong> UCs com ocorrência ativa sem histórico de atendimento anterior nos últimos 90 dias. Ainda não impactam no retrabalho.
    </div>
    <div class="alert-list">${lista.map(o=>{
      const equipeStr=(o.estado||'').toUpperCase().startsWith('E-')?'':` · Equipe: ${o.equipe||'----'}`;
      return `
        <div class="alert-item" style="border-left-color:var(--eq-green)">
          <div class="alert-oc" style="color:var(--eq-green)">#${o.ocorrencia}</div>
          <div class="alert-body">
            <div class="alert-uc">UC ${o.uc}</div>
            <div class="alert-detail">${o.pontoEletrico||o.uc}${equipeStr} · ${fmtDate(o.dtInicio)}</div>
          </div>
          <div class="alert-badges">
            <span class="badge ${estadoBadge(o.estado)}">${o.estado||'----'}</span>
            <span class="badge" style="background:var(--eq-green-light);color:var(--eq-green)">1º Atendimento</span>
          </div>
        </div>`;
    }).join('')}</div>`;
}

// ===== RENDER DROPDOWNS UC SEM ALERTA (página de detalhamento separada) =====
function renderDropdowns(lista) {
  const el = document.querySelector('.dropdown-list');
  if (!el) return;
  if(!lista.length){el.innerHTML=`<div class="no-results" style="padding:32px 0"><p>Nenhuma UC encontrada.</p></div>`;return;}
  el.innerHTML = lista.map(h=>{
    const pct=calcPct90(h.dataConc), dias=diasRestantes(h.dataConc);
    const barCls=pct>=80?'danger':pct>=50?'warning':'safe';
    const diasCls=dias<=10?'dias-critico':dias<=30?'dias-alerta':'dias-ok';
    const uid=h.uc.replace(/\W/g,'_');
    const atendRows=(h.historico||[])
      .sort((a,b)=>(a.dataOrigem||'')>(b.dataOrigem||'')?1:-1)
      .map((at,i)=>`
        <tr>
          <td><span class="atend-num-badge">${i+1}</span></td>
          <td><strong>${at.os||'----'}</strong></td>
          <td>${fmtDate(at.dataOrigem)}</td>
          <td>${fmtDate(at.dataConc)}</td>
          <td>${at.prefixo||'----'}</td>
          <td>${at.causa||'----'}</td>
          <td>${badgeProcedencia(at.causa)}</td>
        </tr>`).join('');
    return `
      <div class="dropdown-item" id="item_${uid}">
        <div class="dropdown-header" onclick="toggleDropdown('${uid}')">
          <div class="dropdown-header-left">
            <div class="dropdown-uc">UC ${h.uc}</div>
            <div class="dropdown-meta">${h.qtdAtendimentos||1} atendimento(s) · Última OS: <strong>${h.ultimaOS||'----'}</strong> · Equipe: <strong>${h.prefixo||'----'}</strong></div>
          </div>
          <div class="dropdown-header-right">
            <div class="dropdown-progress">
              <div class="dropdown-progress-label">
                <span style="font-size:.72rem;color:var(--eq-gray-500)">Período de retrabalho</span>
                <span style="font-size:.72rem;font-weight:700;color:var(--eq-gray-700)">${pct}%</span>
              </div>
              <div class="dias-bar-outer" style="height:6px"><div class="dias-bar-inner ${barCls}" style="width:${pct}%"></div></div>
            </div>
            <div class="dropdown-dias-badge ${diasCls}">
              <span class="dropdown-dias-num">${dias}</span>
              <span class="dropdown-dias-label">dias restantes</span>
            </div>
            <div class="dropdown-saida">
              <span style="font-size:.68rem;color:var(--eq-gray-400);display:block">Sai do retrabalho</span>
              <span style="font-size:.78rem;font-weight:700;color:${dias<=10?'var(--eq-red)':dias<=30?'var(--eq-amber-dark)':'var(--eq-green)'}">${fmtDateShort(h.fim90.toISOString())}</span>
            </div>
            <span class="dropdown-chevron" id="icon_${uid}">▾</span>
          </div>
        </div>
        <div class="dropdown-body" id="body_${uid}" style="display:none">
          <div class="historico-table-wrap" style="margin:0;border-radius:0">
            <table class="historico-table">
              <thead><tr><th>#</th><th>OS</th><th>Data Início</th><th>Data Fim</th><th>Equipe</th><th>Causa</th><th>Procedência</th></tr></thead>
              <tbody>${atendRows||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--eq-gray-400)">Sem registros</td></tr>'}</tbody>
            </table>
          </div>
          <div class="dropdown-footer">
            <a href="pesquisa.html?uc=${encodeURIComponent(h.uc)}&from=alertas" class="dropdown-link">Ver histórico completo →</a>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ===== CARREGAR TUDO =====
async function carregarAlertas() {
  document.getElementById('alertas-container').innerHTML=`<div class="loading-state"><div class="spinner"></div><br>Carregando...</div>`;
  document.getElementById('stats-container').innerHTML='';

  try {
    const hoje = new Date();
    const limite90 = new Date(hoje.getTime()-90*86400000);

    // 1. Visão atual (ocorrências ativas — já salvas no Firebase)
    const snapAtual = await db.collection('visao_atual').get();
    const ativas = [];
    snapAtual.forEach(doc=>ativas.push(doc.data()));

    // 2. Histórico recente (planilhas dos últimos 3 meses + atual)
    const snapRecente = await db.collection('historico_recente').get();
    const recentes = [];
    snapRecente.forEach(doc=>recentes.push(doc.data()));

    // 3. Base histórica (retrabalho confirmado)
    const snapHist = await db.collection('historico').get();
    const historicoMap={};
    snapHist.forEach(doc=>{historicoMap[doc.id]=doc.data();});

    // 4. UCs sem alerta ativo (para detalhamento)
    const ucsComAlerta=new Set(ativas.filter(o=>o.emHistorico).map(o=>o.uc));
    _ucsSemAlerta=[];
    snapHist.forEach(doc=>{
      const d=doc.data();
      if(!d.dataConc) return;
      const fim90=new Date(new Date(d.dataConc).getTime()+91*86400000);
      if(fim90>hoje&&!ucsComAlerta.has(doc.id)){
        _ucsSemAlerta.push({uc:doc.id,...d,fim90});
      }
    });
    _ucsSemAlerta.sort((a,b)=>diasRestantes(a.dataConc)-diasRestantes(b.dataConc));

    // ===== CLASSIFICA ALERTAS =====
    // Retrabalho confirmado = ativa + UC na base histórica
    const retrabalho = ativas.filter(o=>o.emHistorico);

    // Monta mapa de F-FINALIZADA procedentes no histórico recente, por UC
    const finalProcMap={}; // uc -> [{dtFim, os, causa}]
    for(const r of recentes){
      if(!r.finalizado||!r.procedente) continue;
      const dtFim=r.dtFim?new Date(r.dtFim):null;
      if(!dtFim||dtFim<limite90) continue; // fora dos 90 dias
      if(!finalProcMap[r.uc]) finalProcMap[r.uc]=[];
      finalProcMap[r.uc].push({dtFim,os:r.ocorrencia,causa:r.causa});
    }

    // Possível retrabalho = ativa (não em histMap) + UC tem F-FINALIZADA procedente nos últimos 90 dias no recente
    // Primeiro atendimento = ativa + UC NÃO tem nenhum F-FINALIZADA procedente nos 90 dias + não está no histMap
    const possivel=[], primeiro=[];
    for(const o of ativas){
      if(o.emHistorico) continue; // já está no retrabalho confirmado
      const hist=finalProcMap[o.uc];
      if(hist&&hist.length){
        // Pega o mais recente procedente
        hist.sort((a,b)=>b.dtFim-a.dtFim);
        possivel.push({
          ...o,
          dtFimProcedente: hist[0].dtFim.toISOString(),
          osProcedente:    hist[0].os,
          causaProcedente: hist[0].causa
        });
      } else {
        primeiro.push(o);
      }
    }

    // Ordena possível e primeiro pelo estado
    const ordemEstado=e=>{const u=(e||'').toUpperCase();if(u.includes('TRABALHANDO'))return 0;if(u.includes('DESLOCAMENTO'))return 1;if(u.includes('MULTIPLA'))return 2;if(u.includes('PREPARA'))return 3;return 4;};
    possivel.sort((a,b)=>ordemEstado(a.estado)-ordemEstado(b.estado));
    primeiro.sort((a,b)=>ordemEstado(a.estado)-ordemEstado(b.estado));

    _dados = { retrabalho, possivel, primeiro };

    // ===== STATS =====
    document.getElementById('stats-container').innerHTML=`
      <div class="alert-stats">
        <div class="stat-card danger">
          <div class="stat-value">${retrabalho.length}</div>
          <div class="stat-label">Retrabalho Confirmado</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-value">${possivel.length}</div>
          <div class="stat-label">Possível Retrabalho</div>
        </div>
        <div class="stat-card info">
          <div class="stat-value">${primeiro.length}</div>
          <div class="stat-label">Primeiro Atendimento</div>
        </div>
        <div class="stat-card success">
          <div class="stat-value">${_ucsSemAlerta.length+retrabalho.length}</div>
          <div class="stat-label">UCs nos 90 dias</div>
        </div>
      </div>`;

    renderVisao();

  } catch(err){
    console.error(err);
    document.getElementById('alertas-container').innerHTML=`<div class="no-results"><p>Erro: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  carregarAlertas();
  document.getElementById('btn-refresh')?.addEventListener('click',carregarAlertas);
});
