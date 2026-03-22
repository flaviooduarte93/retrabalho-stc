// js/alertas.js — Supabase version

function fmtDate(iso){if(!iso)return'----';return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function fmtDateShort(iso){if(!iso)return'----';return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function diasRestantes(dc){if(!dc)return null;return Math.ceil((new Date(new Date(dc).getTime()+91*86400000)-new Date())/86400000);}
function calcPct90(dc){if(!dc)return 0;const ini=new Date(dc),fim=new Date(ini.getTime()+91*86400000),hoje=new Date();if(hoje>=fim)return 100;if(hoje<=ini)return 0;return Math.min(100,Math.round((hoje-ini)/(fim-ini)*100));}
function estadoBadge(e){const u=(e||'').toUpperCase();if(u.includes('TRABALHANDO'))return'badge-red';if(u.includes('DESLOCAMENTO'))return'badge-amber';if(u.includes('MULTIPLA'))return'badge-blue';return'badge-gray';}

function toggleDropdown(uid){
  const body=document.getElementById('body_'+uid),icon=document.getElementById('icon_'+uid),item=document.getElementById('item_'+uid);
  if(!body)return;
  const open=body.style.display!=='none';
  body.style.display=open?'none':'block';
  if(icon)icon.textContent=open?'▾':'▴';
  if(item)item.classList.toggle('dropdown-open',!open);
}

let _ucsSemAlerta=[],_criterio='menor-tempo',_filtroUC='',_visaoAtiva='retrabalho';
let _dados={retrabalho:[],possivel:[],primeiro:[]};

function mudarVisao(v){
  _visaoAtiva=v;
  document.querySelectorAll('.visao-btn').forEach(b=>b.classList.remove('visao-btn--active'));
  document.getElementById('visao-'+v)?.classList.add('visao-btn--active');
  renderVisao();
}
function aplicarFiltroOrdem(){
  let lista=[..._ucsSemAlerta];
  if(_filtroUC.trim()) lista=lista.filter(h=>h.uc.toLowerCase().includes(_filtroUC.trim().toLowerCase()));
  if(_criterio==='maior-tempo') lista.sort((a,b)=>diasRestantes(b.data_conc)-diasRestantes(a.data_conc));
  if(_criterio==='menor-tempo') lista.sort((a,b)=>diasRestantes(a.data_conc)-diasRestantes(b.data_conc));
  if(_criterio==='mais-atend')  lista.sort((a,b)=>(b.qtd_atendimentos||1)-(a.qtd_atendimentos||1));
  const c=document.getElementById('filtro-count');
  if(c)c.textContent=lista.length+' UC'+(lista.length!==1?'s':'');
  renderDropdowns(lista);
}
function filtrarUC(v){_filtroUC=v;const c=document.getElementById('filtro-clear');if(c)c.style.display=v?'flex':'none';aplicarFiltroOrdem();}
function limparFiltro(){_filtroUC='';const i=document.getElementById('filtro-uc');if(i)i.value='';const c=document.getElementById('filtro-clear');if(c)c.style.display='none';aplicarFiltroOrdem();}
function ordenarLista(criterio){_criterio=criterio;document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('sort-btn--active'));document.getElementById('sort-'+criterio)?.classList.add('sort-btn--active');aplicarFiltroOrdem();}

function renderVisao(){
  const el=document.getElementById('alertas-container');
  if(_visaoAtiva==='retrabalho') renderRetrabalho(el);
  else if(_visaoAtiva==='possivel') renderPossivel(el);
  else renderPrimeiro(el);
}

function renderRetrabalho(el){
  const lista=[..._dados.retrabalho];
  const ord=e=>{const u=(e||'').toUpperCase();if(u.includes('TRABALHANDO'))return 0;if(u.includes('DESLOCAMENTO'))return 1;if(u.includes('MULTIPLA'))return 2;return 3;};
  lista.sort((a,b)=>ord(a.estado)-ord(b.estado));
  if(!lista.length){el.innerHTML=`<div class="no-results" style="padding:48px 0"><p>Nenhuma ocorrência com retrabalho confirmado.</p></div>`;return;}
  el.innerHTML=`<div class="alert-list">${lista.map(o=>{
    const dias=diasRestantes(o.data_conc);
    const eq=(o.estado||'').toUpperCase().startsWith('E-')?'':` · Equipe: ${o.equipe||'----'}`;
    return `<div class="alert-item retrabalho-ativo">
      <div class="alert-oc">#${o.ocorrencia}</div>
      <div class="alert-body">
        <div class="alert-uc"><a href="pesquisa.html?uc=${encodeURIComponent(o.uc)}&from=alertas" style="color:var(--eq-blue-dark);text-decoration:none;font-weight:700">UC ${o.uc}</a></div>
        <div class="alert-detail">${o.ponto_eletrico||o.uc}${eq} · ${fmtDate(o.dt_inicio)}</div>
        <div style="margin-top:6px">${badgeProcedencia(o.causa_historico)}</div>
      </div>
      <div class="alert-badges">
        <span class="badge ${estadoBadge(o.estado)}">${o.estado||'----'}</span>
        <span class="badge badge-red">Retrabalho</span>
        <span class="badge badge-360">⚡ Atendimento 360° recomendado</span>
        ${o.qtd_atendimentos>1?`<span class="badge badge-blue">${o.qtd_atendimentos}x atend.</span>`:''}
        ${dias!==null?`<span class="badge badge-amber">${dias}d restantes</span>`:''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function renderPossivel(el){
  const lista=_dados.possivel;
  if(!lista.length){el.innerHTML=`<div class="no-results" style="padding:48px 0"><p>Nenhuma UC com possibilidade de retrabalho.</p></div>`;return;}
  el.innerHTML=`
    <div class="alert-info-box" style="margin-bottom:16px">
      <strong>⚠ Possível Retrabalho:</strong> UCs com atendimento procedente (F-FINALIZADA) nos últimos 90 dias e ocorrência ativa agora.
    </div>
    <div class="alert-list">${lista.map(o=>{
      const dias=diasRestantes(o.dt_fim_procedente);
      const eq=(o.estado||'').toUpperCase().startsWith('E-')?'':` · Equipe: ${o.equipe||'----'}`;
      return `<div class="alert-item" style="border-left-color:var(--eq-amber)">
        <div class="alert-oc" style="color:var(--eq-amber-dark)">#${o.ocorrencia}</div>
        <div class="alert-body">
          <div class="alert-uc">UC ${o.uc}</div>
          <div class="alert-detail">${o.ponto_eletrico||o.uc}${eq} · ${fmtDate(o.dt_inicio)}</div>
          <div class="alert-detail" style="margin-top:4px">🕐 1º atend. procedente: <strong>${fmtDate(o.dt_fim_procedente)}</strong> · OS: <strong>${o.os_procedente||'----'}</strong></div>
          <div style="margin-top:6px">${badgeProcedencia(o.causa_procedente)} <span style="font-size:.75rem;color:var(--eq-gray-600);margin-left:6px">${o.causa_procedente||'----'}</span></div>
        </div>
        <div class="alert-badges">
          <span class="badge ${estadoBadge(o.estado)}">${o.estado||'----'}</span>
          <span class="badge badge-amber">⚠ Possível Retrabalho</span>
          ${dias!==null?`<span class="badge badge-amber">${dias}d p/ confirmar</span>`:''}
        </div>
      </div>`;
    }).join('')}</div>`;
}

function renderPrimeiro(el){
  const lista=_dados.primeiro;
  if(!lista.length){el.innerHTML=`<div class="no-results" style="padding:48px 0"><p>Nenhum primeiro atendimento identificado.</p></div>`;return;}
  el.innerHTML=`
    <div class="alert-info-box" style="margin-bottom:16px;border-color:var(--eq-green);background:var(--eq-green-light)">
      <strong style="color:var(--eq-green)">ℹ Primeiro Atendimento:</strong> Ocorrência ativa sem histórico de atendimento procedente nos últimos 90 dias.
    </div>
    <div class="alert-list">${lista.map(o=>{
      const eq=(o.estado||'').toUpperCase().startsWith('E-')?'':` · Equipe: ${o.equipe||'----'}`;
      return `<div class="alert-item" style="border-left-color:var(--eq-green)">
        <div class="alert-oc" style="color:var(--eq-green)">#${o.ocorrencia}</div>
        <div class="alert-body">
          <div class="alert-uc">UC ${o.uc}</div>
          <div class="alert-detail">${o.ponto_eletrico||o.uc}${eq} · ${fmtDate(o.dt_inicio)}</div>
        </div>
        <div class="alert-badges">
          <span class="badge ${estadoBadge(o.estado)}">${o.estado||'----'}</span>
          <span class="badge" style="background:var(--eq-green-light);color:var(--eq-green)">1º Atendimento</span>
        </div>
      </div>`;
    }).join('')}</div>`;
}

function renderDropdowns(lista){
  const el=document.querySelector('.dropdown-list');
  if(!el)return;
  if(!lista.length){el.innerHTML=`<div class="no-results" style="padding:32px 0"><p>Nenhuma UC encontrada.</p></div>`;return;}
  el.innerHTML=lista.map(h=>{
    const pct=calcPct90(h.data_conc),dias=diasRestantes(h.data_conc);
    const barCls=pct>=80?'danger':pct>=50?'warning':'safe';
    const diasCls=dias<=10?'dias-critico':dias<=30?'dias-alerta':'dias-ok';
    const uid=h.uc.replace(/\W/g,'_');
    const hist=(h.historico||[]).sort((a,b)=>(a.data_origem||'')>(b.data_origem||'')?1:-1);
    const rows=hist.map((at,i)=>`<tr>
      <td><span class="atend-num-badge">${i+1}</span></td>
      <td><strong>${at.os||'----'}</strong></td>
      <td>${fmtDate(at.data_origem)}</td>
      <td>${fmtDate(at.data_conc)}</td>
      <td>${at.prefixo||'----'}</td>
      <td>${at.causa||'----'}</td>
      <td>${badgeProcedencia(at.causa)}</td>
    </tr>`).join('');
    return `<div class="dropdown-item" id="item_${uid}">
      <div class="dropdown-header" onclick="toggleDropdown('${uid}')">
        <div class="dropdown-header-left">
          <div class="dropdown-uc">UC ${h.uc}</div>
          <div class="dropdown-meta">${h.qtd_atendimentos||1} atend. · OS: <strong>${h.ultima_os||'----'}</strong> · <strong>${h.prefixo||'----'}</strong></div>
        </div>
        <div class="dropdown-header-right">
          <div class="dropdown-progress">
            <div class="dropdown-progress-label">
              <span style="font-size:.72rem;color:var(--eq-gray-500)">Período de retrabalho</span>
              <span style="font-size:.72rem;font-weight:700">${pct}%</span>
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
            <tbody>${rows||'<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--eq-gray-400)">Sem registros</td></tr>'}</tbody>
          </table>
        </div>
        <div class="dropdown-footer">
          <a href="pesquisa.html?uc=${encodeURIComponent(h.uc)}&from=alertas" class="dropdown-link">Ver histórico completo →</a>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function carregarAlertas(){
  document.getElementById('alertas-container').innerHTML=`<div class="loading-state"><div class="spinner"></div><br>Carregando...</div>`;
  document.getElementById('stats-container').innerHTML='';

  try {
    const hoje = new Date();
    const limite90 = new Date(hoje.getTime()-90*86400000).toISOString();

    // Busca tudo em paralelo
    const [
      { data: ativas },
      { data: histData },
      { data: recenteProc }
    ] = await Promise.all([
      db.from('visao_atual').select('*'),
      db.from('historico').select('uc,ultima_os,data_conc,prefixo,causa,qtd_atendimentos,historico'),
      db.from('historico_recente')
        .select('uc,ocorrencia,dt_fim,causa,procedente')
        .eq('finalizado', true)
        .eq('procedente', true)
        .gte('dt_fim', limite90)
    ]);

    const historicoMap = {};
    (histData||[]).forEach(h => { historicoMap[h.uc] = h; });

    // Classifica alertas
    const comRetrabalho = (ativas||[]).filter(o => o.em_historico);
    const ucsComAlerta  = new Set(comRetrabalho.map(o => o.uc));

    // Mapa de F-FINALIZADA procedentes por UC (histórico recente)
    const finalProcMap = {};
    (recenteProc||[]).forEach(r => {
      if (!finalProcMap[r.uc] || new Date(r.dt_fim) > new Date(finalProcMap[r.uc].dt_fim)) {
        finalProcMap[r.uc] = r;
      }
    });

    const possivel=[], primeiro=[];
    (ativas||[]).filter(o=>!o.em_historico).forEach(o => {
      const fp = finalProcMap[o.uc];
      if (fp) possivel.push({ ...o, dt_fim_procedente: fp.dt_fim, os_procedente: fp.ocorrencia, causa_procedente: fp.causa });
      else    primeiro.push(o);
    });

    const ord=e=>{const u=(e||'').toUpperCase();if(u.includes('TRABALHANDO'))return 0;if(u.includes('DESLOCAMENTO'))return 1;if(u.includes('MULTIPLA'))return 2;return 3;};
    possivel.sort((a,b)=>ord(a.estado)-ord(b.estado));
    primeiro.sort((a,b)=>ord(a.estado)-ord(b.estado));
    _dados = { retrabalho: comRetrabalho, possivel, primeiro };

    // UCs em retrabalho sem alerta ativo
    _ucsSemAlerta = (histData||[]).filter(h => {
      if (!h.data_conc) return false;
      const fim90 = new Date(new Date(h.data_conc).getTime()+91*86400000);
      return fim90 > hoje && !ucsComAlerta.has(h.uc);
    }).map(h => ({ ...h, fim90: new Date(new Date(h.data_conc).getTime()+91*86400000) }));
    _ucsSemAlerta.sort((a,b)=>diasRestantes(a.data_conc)-diasRestantes(b.data_conc));

    // Stats
    document.getElementById('stats-container').innerHTML=`
      <div class="alert-stats">
        <div class="stat-card danger"><div class="stat-value">${comRetrabalho.length}</div><div class="stat-label">Retrabalho Confirmado</div></div>
        <div class="stat-card warning"><div class="stat-value">${possivel.length}</div><div class="stat-label">Possível Retrabalho</div></div>
        <div class="stat-card info"><div class="stat-value">${primeiro.length}</div><div class="stat-label">Primeiro Atendimento</div></div>
        <div class="stat-card success"><div class="stat-value">${_ucsSemAlerta.length+comRetrabalho.length}</div><div class="stat-label">UCs nos 90 dias</div></div>
      </div>`;

    renderVisao();

    // Seção de UCs sem alerta foi movida para a página de Detalhamento
    const el = document.getElementById('historico-container');
    if (el) el.innerHTML = '';

  } catch(err) {
    console.error(err);
    document.getElementById('alertas-container').innerHTML=`<div class="no-results"><p>Erro: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  carregarAlertas();
  document.getElementById('btn-refresh')?.addEventListener('click', carregarAlertas);
});
