// js/pesquisa.js — Supabase version

// ===== CAUSAS IMPROCEDENTES (local) =====
const _CAUSAS_IMP_NORM=['ACESSO IMPEDIDO','DISJUNTOR BT CLIENTE DESARMADO','DISJUNTOR MT GRUPO A DESARMADO','ENCONTRADO ENERGIA CORTADA CLIENTE','ENCONTRADO NORMAL UC','ENDERECO NAO LOCALIZADO','ILUMINACAO PUBLICA COM DEFEITO','INSTALACAO APOS MEDICAO COM DEFEITO CLIENTE','PORTEIRA TRANCADA','REDE TELEFONICA TV A CABO'];
const _CAUSAS_KW=[['INSTALAC','APOS','MEDIC','DEFEITO','CLIENTE'],['ILUMINAC','PUBLICA'],['ENCONTRADO','NORMAL'],['ENCONTRADO','ENERGIA','CORTADA'],['ACESSO','IMPEDIDO'],['DISJUNTOR','DESARMADO'],['ENDERECO','NAO','LOCALIZADO'],['PORTEIRA','TRANCADA'],['REDE','TELEFON']];
function _norm(s){if(!s)return'';let r=String(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');r=r.replace(/[^A-Z0-9]+/g,' ');return r.trim().replace(/\s+/g,' ');}
function _isProcedente(causa){const c=_norm(causa);if(!c||c==='----')return false;if(_CAUSAS_IMP_NORM.some(i=>c===i||c.includes(i)||i.includes(c)))return false;if(_CAUSAS_KW.some(kws=>kws.every(kw=>c.includes(kw))))return false;return true;}

function fmtDate(iso){if(!iso)return'----';return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function fmtDateShort(iso){if(!iso)return'----';return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});}
function calcRetrabalho(dc){if(!dc)return false;return new Date()<=new Date(new Date(dc).getTime()+91*86400000);}

// ===== GANTT =====
function renderGantt(historico){
  if(!historico||!historico.length)return'';
  const sorted=[...historico].filter(h=>h.data_origem||h.dataOrigem).map(h=>({...h,data_origem:h.data_origem||h.dataOrigem,data_conc:h.data_conc||h.dataConc})).sort((a,b)=>new Date(a.data_origem)-new Date(b.data_origem));
  if(!sorted.length)return'';
  const minDate=new Date(sorted[0].data_origem);
  const maxDate=new Date(sorted[sorted.length-1].data_origem);
  minDate.setDate(minDate.getDate()-7); maxDate.setDate(maxDate.getDate()+7);
  const totalMs=maxDate-minDate||1;
  const ticks=[];
  for(let i=0;i<=5;i++) ticks.push(new Date(minDate.getTime()+totalMs*i/5).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}));

  const markers=sorted.map((h,i)=>{
    const pos=((new Date(h.data_origem)-minDate)/totalMs*100).toFixed(2);
    let isRet=false;
    if(i>0){const curr=new Date(h.data_origem);for(let j=i-1;j>=0;j--){const ant=sorted[j];if(_isProcedente(ant.causa||ant.prefixo)&&(ant.data_conc||ant.dataConc)){const janela=new Date(new Date(ant.data_conc||ant.dataConc).getTime()+90*86400000);isRet=curr<=janela;break;}}}
    const color=isRet?'var(--eq-red)':'var(--eq-blue)';
    const causaTip=(h.causa||'----').substring(0,45)+((h.causa||'').length>45?'…':'');
    let diasBadge='';
    if(i<sorted.length-1){const next=new Date(sorted[i+1].data_origem);const dias=Math.round((next-new Date(h.data_origem))/86400000);const midPos=(((new Date(h.data_origem)-minDate)/totalMs*100+(next-minDate)/totalMs*100)/2).toFixed(2);diasBadge=`<div class="tl-dias-badge" style="left:${midPos}%">${dias}d</div>`;}
    return `<div class="tl-marker-wrap" style="left:${pos}%"><div class="tl-dot" style="background:${color};border-color:${color}"><span class="tl-dot-num">${i+1}</span><div class="tl-tooltip"><div class="tl-tooltip-num">Atendimento ${i+1}</div><div class="tl-tooltip-os">${h.os||'----'}</div><div class="tl-tooltip-row">📋 ${causaTip}</div><div class="tl-tooltip-row">▶ ${fmtDate(h.data_origem)}</div><div class="tl-tooltip-row">■ ${fmtDate(h.data_conc)}</div></div></div></div>${diasBadge}`;
  }).join('');

  return `<div class="gantt-section"><div class="gantt-title">Linha do Tempo de Atendimentos</div><div class="gantt-container"><div class="tl-chart"><div class="tl-line"></div>${markers}</div><div class="gantt-axis" style="margin-top:8px">${ticks.map(t=>`<div class="gantt-tick">${t}</div>`).join('')}</div></div></div>`;
}

// ===== TABELA =====
function renderTabela(historico){
  if(!historico||!historico.length)return'';
  const sorted=[...historico].map(h=>({...h,data_origem:h.data_origem||h.dataOrigem,data_conc:h.data_conc||h.dataConc})).sort((a,b)=>(a.data_origem||'')>(b.data_origem||'')?1:-1);
  const rows=sorted.map((h,i)=>{
    let diasDesde='----';
    if(i>0){const dias=Math.round((new Date(h.data_origem)-new Date(sorted[i-1].data_origem))/86400000);diasDesde=`<span class="dias-entre-badge">${dias}d após atend. ${i}</span>`;}
    // Ocorrência sem data_fim = ainda ativa, não classifica como improcedente
    const ativa = !h.data_conc;
    const proc  = ativa ? true : _isProcedente(h.causa);
    let isRet=false;
    if(i>0&&!ativa){const curr=new Date(h.data_origem);for(let j=i-1;j>=0;j--){const ant=sorted[j];if(_isProcedente(ant.causa)&&ant.data_conc){isRet=curr<=new Date(new Date(ant.data_conc).getTime()+90*86400000);break;}}}
    const tipo = ativa?'ativa':!proc?'improcedente':isRet?'retrabalho':i===0?'primeiro':'procedente';
    const rowClass={'ativa':'row-primeiro','improcedente':'row-improcedente','retrabalho':'row-retrabalho','primeiro':'row-primeiro','procedente':'row-primeiro'}[tipo];
    const numColor={'ativa':'var(--eq-blue-mid)','improcedente':'var(--eq-gray-400)','retrabalho':'var(--eq-red)','primeiro':'var(--eq-blue)','procedente':'var(--eq-blue)'}[tipo];
    const tipoLabel={'ativa':'🔵 Ativa','improcedente':'✗ Improcedente','retrabalho':'↩ Retrabalho','primeiro':'1º Atend.','procedente':'✓ Procedente'}[tipo];
    return `<tr class="${rowClass}" data-tipo="${tipo}"><td><span class="atend-num-badge" style="background:${numColor}">${i+1}</span></td><td><strong>${h.os||'----'}</strong></td><td>${fmtDate(h.data_origem)}</td><td>${fmtDate(h.data_conc)}</td><td>${h.prefixo||'----'}</td><td>${h.causa||'----'}</td><td><span class="tipo-badge tipo-${tipo}">${tipoLabel}</span></td><td>${diasDesde}</td></tr>`;
  }).join('');

  // Legenda dinâmica baseada nos tipos presentes
  const tiposPresentes=[...new Set(sorted.map((_,i)=>{
    const h=sorted[i];
    const ativa=!h.data_conc;
    const proc=ativa?true:_isProcedente(h.causa);
    let isRet=false;
    if(i>0&&!ativa){const curr=new Date(h.data_origem);for(let j=i-1;j>=0;j--){const ant=sorted[j];if(_isProcedente(ant.causa)&&ant.data_conc){isRet=curr<=new Date(new Date(ant.data_conc).getTime()+90*86400000);break;}}}
    return ativa?'ativa':!proc?'improcedente':isRet?'retrabalho':i===0?'primeiro':'procedente';
  }))];
  const legendaMap={
    'primeiro':   {color:'var(--eq-blue)',       label:'1º Atendimento'},
    'procedente': {color:'var(--eq-blue)',        label:'Procedente'},
    'retrabalho': {color:'var(--eq-red)',         label:'Retrabalho'},
    'improcedente':{color:'var(--eq-gray-400)',   label:'Improcedente'},
    'ativa':      {color:'var(--eq-blue-mid)',    label:'Ocorrência Ativa'},
  };
  const legenda=tiposPresentes.map(t=>`<span style="display:inline-flex;align-items:center;gap:5px;font-size:.75rem;color:var(--eq-gray-700)"><span style="width:10px;height:10px;border-radius:50%;background:${legendaMap[t].color};display:inline-block"></span>${legendaMap[t].label}</span>`).join('');

  return `<div style="margin-top:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
      <div class="gantt-title" style="margin-bottom:0">Todos os Atendimentos</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">${legenda}</div>
    </div>
    <div class="historico-table-wrap"><table class="historico-table"><thead><tr>
      <th style="width:40px">#</th><th>OS</th><th>Data Início</th><th>Data Fim</th><th>Equipe</th><th>Causa</th><th>Tipo</th><th>Intervalo</th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ===== PESQUISA =====
async function pesquisarUC(uc){
  const res=document.getElementById('resultado');
  res.innerHTML=`<div class="loading-state"><div class="spinner"></div><br>Consultando todas as bases...</div>`;
  uc=uc.trim();
  if(!uc){res.innerHTML=`<div class="no-results"><p>Digite uma UC.</p></div>`;return;}

  try {
    const ucSanitized = uc.replace(/[\/\s]+/g,'_').trim();

    const [
      {data:histDoc},
      {data:recenteDocs},
      {data:ativasDocs}
    ] = await Promise.all([
      db.from('historico').select('*').eq('uc', ucSanitized).maybeSingle(),
      db.from('historico_recente').select('*').eq('uc', ucSanitized),
      db.from('visao_atual').select('*').eq('uc', ucSanitized)
    ]);

    if(!histDoc && !recenteDocs?.length && !ativasDocs?.length){
      res.innerHTML=`<div class="no-results"><svg width="60" height="60" viewBox="0 0 60 60" fill="none"><circle cx="30" cy="30" r="28" stroke="#C8D6E5" stroke-width="2"/><path d="M20 30h20M30 20v20" stroke="#C8D6E5" stroke-width="2" stroke-linecap="round"/></svg><p>UC <strong>${uc}</strong> não encontrada em nenhuma base.</p></div>`;
      return;
    }

    // Monta histórico unificado com deduplicação
    // Chave: número final da OS + mês/ano da data_origem
    function chaveOS(osStr, dataStr) {
      const num = String(osStr||'').trim().replace(/^\d{4}-\d+-/, '');
      if (!dataStr) return String(osStr||'').trim();
      const d = new Date(dataStr);
      if (isNaN(d)) return String(osStr||'').trim();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${num}`;
    }
    function duracao(h) {
      if (!h.data_origem || !h.data_conc) return 0;
      return new Date(h.data_conc) - new Date(h.data_origem);
    }

    const historicoBase=histDoc?(histDoc.historico||[]):[];

    const recentesFinalizados=(recenteDocs||[])
      .filter(r=>r.finalizado&&r.dt_fim)
      .map(r=>({os:r.ocorrencia,data_origem:r.dt_inicio,data_conc:r.dt_fim,prefixo:r.equipe||'----',causa:r.causa||'----',fonte:'recente'}));

    const ativasFormatadas=(ativasDocs||[])
      .map(a=>({os:a.ocorrencia,data_origem:a.dt_inicio,data_conc:a.dt_fim||null,prefixo:a.equipe||'----',causa:a.causa||'----',fonte:'ativa',estado:a.estado}));

    // Deduplicação: agrupa por chave, mantém maior duração
    const deduMap = {};
    for (const h of [...historicoBase, ...recentesFinalizados, ...ativasFormatadas]) {
      const k = chaveOS(h.os, h.data_origem);
      if (!deduMap[k] || duracao(h) > duracao(deduMap[k])) deduMap[k] = h;
    }
    const historicoCompleto = Object.values(deduMap).sort((a,b)=>(a.data_origem||'')>(b.data_origem||'')?1:-1);

    const ultimoComConc=[...historicoCompleto].filter(h=>h.data_conc).sort((a,b)=>(b.data_conc||'')>(a.data_conc||'')?1:-1)[0];
    const ultimoGeral=historicoCompleto[historicoCompleto.length-1]||{};
    const dataConc=ultimoComConc?.data_conc||null;
    const isRet=calcRetrabalho(dataConc);
    const fim90=dataConc?new Date(new Date(dataConc).getTime()+91*86400000):null;
    const diasR=fim90?Math.ceil((fim90-new Date())/86400000):null;

    const fontes=[];
    if(histDoc) fontes.push('Base Histórica');
    if(recentesFinalizados.length) fontes.push('Histórico Recente');
    if(ativasFormatadas.length) fontes.push('Ocorrências Ativas');

    res.innerHTML=`
      <div class="result-card">
        <div class="result-header">
          <div class="result-uc">UC ${uc}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${isRet?`<span class="badge-retrabalho">⚠ Em Retrabalho</span>`:`<span class="badge-ok">✓ Fora do Período</span>`}
            ${ativasFormatadas.length?`<span class="badge badge-amber">🔴 ${ativasFormatadas.length} ativa(s)</span>`:''}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
          ${fontes.map(f=>`<span style="font-size:.7rem;background:var(--eq-blue-pale);color:var(--eq-blue-dark);padding:2px 10px;border-radius:20px;font-weight:600">📂 ${f}</span>`).join('')}
        </div>
        <div class="info-grid">
          <div class="info-item"><div class="info-label">Total de Atendimentos</div><div class="info-value highlight">${historicoCompleto.length}</div></div>
          <div class="info-item"><div class="info-label">Última OS</div><div class="info-value">${ultimoGeral.os||'----'}</div></div>
          <div class="info-item"><div class="info-label">Data Início</div><div class="info-value">${fmtDate(ultimoGeral.data_origem)}</div></div>
          <div class="info-item"><div class="info-label">Data Fim</div><div class="info-value">${fmtDate(ultimoGeral.data_conc)}</div></div>
          <div class="info-item"><div class="info-label">Equipe</div><div class="info-value">${ultimoGeral.prefixo||'----'}</div></div>
          <div class="info-item"><div class="info-label">Causa</div><div class="info-value">${ultimoGeral.causa||'----'}</div></div>
          ${fim90?`<div class="info-item"><div class="info-label">Sai do Retrabalho</div><div class="info-value" style="color:${isRet?'var(--eq-red)':'var(--eq-green)'}">
            ${fmtDateShort(fim90.toISOString())} <span style="font-size:.8rem;font-weight:400;margin-left:6px">(${diasR>0?diasR+'d restantes':'encerrado'})</span>
          </div></div>`:''}
        </div>
      </div>
      ${renderGantt(historicoCompleto)}
      ${renderTabela(historicoCompleto)}`;

  } catch(err){
    console.error(err);
    res.innerHTML=`<div class="no-results"><p>Erro: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.getElementById('search-btn');
  const input=document.getElementById('search-input');
  btn.addEventListener('click',()=>pesquisarUC(input.value));
  input.addEventListener('keydown',e=>{if(e.key==='Enter')pesquisarUC(input.value);});

  // Breadcrumb
  const params=new URLSearchParams(window.location.search);
  const uc=params.get('uc'), from=params.get('from');
  const nav=document.getElementById('topbar-nav');
  const origens={alertas:{label:'Alertas',href:'alertas.html'},detalhamento:{label:'UCs em Retrabalho',href:'detalhamento.html'}};
  if(nav){
    const o=origens[from];
    nav.innerHTML=o
      ?`<a href="index.html" class="topbar-navitem">Início</a><span class="topbar-navsep">›</span><a href="${o.href}" class="topbar-navitem topbar-navitem--active">${o.label}</a><span class="topbar-navsep">›</span><span class="topbar-navitem topbar-navitem--current">Pesquisa</span>`
      :`<a href="index.html" class="topbar-navitem">Início</a><span class="topbar-navsep">›</span><span class="topbar-navitem topbar-navitem--current">Pesquisa</span>`;
  }

  document.addEventListener('mousemove',e=>{
    const tt=document.querySelector('.tl-dot:hover .tl-tooltip');
    if(!tt)return;
    const tw=220,margin=12;
    let x=e.clientX-tw/2, y=e.clientY-120-margin;
    if(x+tw>window.innerWidth-8)x=window.innerWidth-tw-8;
    if(x<8)x=8;
    if(y<8)y=e.clientY+margin;
    tt.style.left=x+'px'; tt.style.top=y+'px';
  });

  if(uc){input.value=uc; pesquisarUC(uc);}
});
