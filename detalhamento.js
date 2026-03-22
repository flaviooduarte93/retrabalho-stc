// js/detalhamento.js — Supabase version

function fmtDate(iso){if(!iso)return'----';return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function fmtDateShort(iso){if(!iso)return'----';return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function diasRestantes(dc){if(!dc)return null;return Math.ceil((new Date(new Date(dc).getTime()+91*86400000)-new Date())/86400000);}
function calcPct90(dc){if(!dc)return 0;const ini=new Date(dc),fim=new Date(ini.getTime()+91*86400000),hoje=new Date();if(hoje>=fim)return 100;if(hoje<=ini)return 0;return Math.min(100,Math.round((hoje-ini)/(fim-ini)*100));}

let _lista=[],_criterio='menor-tempo',_filtro='';

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
    return `<div class="dropdown-item" id="item_${uid}">
      <div class="dropdown-header" onclick="toggleDropdown('${uid}')">
        <div class="dropdown-header-left">
          <div class="dropdown-uc">UC ${h.uc}</div>
          <div class="dropdown-meta">${h.qtd_atendimentos||1} atend. · OS: <strong>${h.ultima_os||'----'}</strong> · <strong>${h.prefixo||'----'}</strong> · ${h.causa||'----'} <span style="margin-left:6px">${badgeProcedencia(h.causa)}</span></div>
        </div>
        <div class="dropdown-header-right">
          <div class="dropdown-progress">
            <div class="dropdown-progress-label"><span style="font-size:.72rem;color:var(--eq-gray-500)">Período</span><span style="font-size:.72rem;font-weight:700">${pct}%</span></div>
            <div class="dias-bar-outer" style="height:6px"><div class="dias-bar-inner ${barCls}" style="width:${pct}%"></div></div>
          </div>
          <div class="dropdown-dias-badge ${diasCls}"><span class="dropdown-dias-num">${dias}</span><span class="dropdown-dias-label">dias restantes</span></div>
          <div class="dropdown-saida"><span style="font-size:.68rem;color:var(--eq-gray-400);display:block">Sai em</span><span style="font-size:.78rem;font-weight:700;color:${dias<=10?'var(--eq-red)':dias<=30?'var(--eq-amber-dark)':'var(--eq-green)'}">${fmtDateShort(h.fim90.toISOString())}</span></div>
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

function aplicarFiltroOrdem(){
  let lista=[..._lista];
  if(_filtro.trim()) lista=lista.filter(h=>h.uc.toLowerCase().includes(_filtro.trim().toLowerCase()));
  if(_criterio==='maior-tempo') lista.sort((a,b)=>diasRestantes(b.data_conc)-diasRestantes(a.data_conc));
  if(_criterio==='menor-tempo') lista.sort((a,b)=>diasRestantes(a.data_conc)-diasRestantes(b.data_conc));
  if(_criterio==='mais-atend')  lista.sort((a,b)=>(b.qtd_atendimentos||1)-(a.qtd_atendimentos||1));
  const c=document.getElementById('filtro-count');
  if(c)c.textContent=lista.length+' UC'+(lista.length!==1?'s':'');
  renderLista(lista);
}
function filtrarUC(v){_filtro=v;const c=document.getElementById('filtro-clear');if(c)c.style.display=v?'flex':'none';aplicarFiltroOrdem();}
function limparFiltro(){_filtro='';const i=document.getElementById('filtro-uc');if(i)i.value='';const c=document.getElementById('filtro-clear');if(c)c.style.display='none';aplicarFiltroOrdem();}
function ordenarLista(criterio){_criterio=criterio;document.querySelectorAll('.sort-btn').forEach(b=>b.classList.remove('sort-btn--active'));document.getElementById('sort-'+criterio)?.classList.add('sort-btn--active');aplicarFiltroOrdem();}

async function carregar(){
  document.getElementById('det-container').innerHTML=`<div class="loading-state"><div class="spinner"></div><br>Carregando...</div>`;
  try {
    const { data: ativas } = await db.from('visao_atual').select('uc');
    const ucsComAlerta = new Set((ativas||[]).filter(o=>o.em_historico).map(o=>o.uc));
    const { data: hist } = await db.from('historico').select('*');
    const hoje=new Date();
    _lista=(hist||[]).filter(h=>{
      if(!h.data_conc)return false;
      const fim90=new Date(new Date(h.data_conc).getTime()+91*86400000);
      return fim90>hoje&&!ucsComAlerta.has(h.uc);
    }).map(h=>({...h,fim90:new Date(new Date(h.data_conc).getTime()+91*86400000)}));
    _lista.sort((a,b)=>diasRestantes(a.data_conc)-diasRestantes(b.data_conc));

    document.getElementById('stats-det').innerHTML=`
      <div class="alert-stats" style="margin-bottom:24px">
        <div class="stat-card info"><div class="stat-value">${_lista.length}</div><div class="stat-label">UCs em Retrabalho sem Ocorrência Ativa</div></div>
        <div class="stat-card danger"><div class="stat-value">${_lista.filter(h=>diasRestantes(h.data_conc)<=10).length}</div><div class="stat-label">Saem em menos de 10 dias</div></div>
        <div class="stat-card warning"><div class="stat-value">${_lista.filter(h=>{const d=diasRestantes(h.data_conc);return d>10&&d<=30;}).length}</div><div class="stat-label">Saem em 10 a 30 dias</div></div>
        <div class="stat-card success"><div class="stat-value">${_lista.filter(h=>diasRestantes(h.data_conc)>30).length}</div><div class="stat-label">Saem em mais de 30 dias</div></div>
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
        </div>
      </div>
      <div class="dropdown-list"></div>`;
    aplicarFiltroOrdem();
  } catch(err){
    console.error(err);
    document.getElementById('det-container').innerHTML=`<div class="no-results"><p>Erro: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', carregar);
