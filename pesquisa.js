// js/pesquisa.js — Supabase version

// ===== CAUSAS IMPROCEDENTES (local) =====
const _CAUSAS_IMP_NORM=['ACESSO IMPEDIDO','DISJUNTOR BT CLIENTE DESARMADO','DISJUNTOR MT GRUPO A DESARMADO','ENCONTRADO ENERGIA CORTADA CLIENTE','ENCONTRADO NORMAL UC','ENDERECO NAO LOCALIZADO','ILUMINACAO PUBLICA COM DEFEITO','INSTALACAO APOS MEDICAO COM DEFEITO CLIENTE','PORTEIRA TRANCADA','REDE TELEFONICA TV A CABO'];
const _CAUSAS_KW=[['INSTALAC','APOS','MEDIC','DEFEITO','CLIENTE'],['ILUMINAC','PUBLICA'],['ENCONTRADO','NORMAL'],['ENCONTRADO','ENERGIA','CORTADA'],['ACESSO','IMPEDIDO'],['DISJUNTOR','DESARMADO'],['ENDERECO','NAO','LOCALIZADO'],['PORTEIRA','TRANCADA'],['REDE','TELEFON']];
function _norm(s){if(!s)return'';let r=String(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');r=r.replace(/[^A-Z0-9]+/g,' ');return r.trim().replace(/\s+/g,' ');}
function _isProcedente(causa){const c=_norm(causa);if(!c||c==='----')return false;if(_CAUSAS_IMP_NORM.some(i=>c===i||c.includes(i)||i.includes(c)))return false;if(_CAUSAS_KW.some(kws=>kws.every(kw=>c.includes(kw))))return false;return true;}

function fmtDate(iso){if(!iso)return'----';return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function fmtDateShort(iso){if(!iso)return'----';return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});}

// ===== JANELA 90 DIAS =====
function calcRetrabalho(dc){
  if(!dc)return false;
  return new Date() <= new Date(new Date(dc).getTime() + 90*86400000);
}

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
    if(i>0){
      const curr=new Date(h.data_origem);
      for(let j=i-1;j>=0;j--){
        const ant=sorted[j];
        if(_isProcedente(ant.causa||ant.prefixo)&&(ant.data_conc||ant.dataConc)){
          const janela=new Date(new Date(ant.data_conc||ant.dataConc).getTime()+90*86400000);
          isRet=curr<=janela;
          break;
        }
      }
    }
    const color=isRet?'var(--eq-red)':'var(--eq-blue)';
    const causaTip=(h.causa||'----').substring(0,45)+((h.causa||'').length>45?'…':'');
    return `<div class="tl-marker-wrap" style="left:${pos}%">
      <div class="tl-dot" style="background:${color};border-color:${color}">
        <span class="tl-dot-num">${i+1}</span>
        <div class="tl-tooltip">
          <div class="tl-tooltip-num">Atendimento ${i+1}</div>
          <div class="tl-tooltip-os">${h.os||'----'}</div>
          <div class="tl-tooltip-row">📋 ${causaTip}</div>
          <div class="tl-tooltip-row">▶ ${fmtDate(h.data_origem)}</div>
          <div class="tl-tooltip-row">■ ${fmtDate(h.data_conc)}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  return `<div class="gantt-section">
    <div class="gantt-title">Linha do Tempo de Atendimentos</div>
    <div class="gantt-container">
      <div class="tl-chart">
        <div class="tl-line"></div>${markers}
      </div>
      <div class="gantt-axis" style="margin-top:8px">
        ${ticks.map(t=>`<div class="gantt-tick">${t}</div>`).join('')}
      </div>
    </div>
  </div>`;
}

// ===== TABELA =====
function renderTabela(historico){
  if(!historico||!historico.length)return'';
  const sorted=[...historico].map(h=>({...h,data_origem:h.data_origem||h.dataOrigem,data_conc:h.data_conc||h.dataConc})).sort((a,b)=>(a.data_origem||'')>(b.data_origem||'')?1:-1);
  const rows=sorted.map((h,i)=>{
    let diasDesde='----';
    if(i>0){
      const dias=Math.round((new Date(h.data_origem)-new Date(sorted[i-1].data_origem))/86400000);
      diasDesde=`<span class="dias-entre-badge">${dias}d após atend. ${i}</span>`;
    }

    const ativa = !h.data_conc;
    const proc  = ativa ? true : _isProcedente(h.causa);

    let isRet=false;
    if(i>0&&!ativa){
      const curr=new Date(h.data_origem);
      for(let j=i-1;j>=0;j--){
        const ant=sorted[j];
        if(_isProcedente(ant.causa)&&ant.data_conc){
          isRet=curr<=new Date(new Date(ant.data_conc).getTime()+90*86400000);
          break;
        }
      }
    }

    const tipo = ativa?'ativa':!proc?'improcedente':isRet?'retrabalho':i===0?'primeiro':'procedente';
    const tipoLabel={'ativa':'🔵 Ativa','improcedente':'✗ Improcedente','retrabalho':'↩ Retrabalho','primeiro':'1º Atend.','procedente':'✓ Procedente'}[tipo];

    return `<tr>
      <td>${i+1}</td>
      <td>${h.os||'----'}</td>
      <td>${fmtDate(h.data_origem)}</td>
      <td>${fmtDate(h.data_conc)}</td>
      <td>${h.prefixo||'----'}</td>
      <td>${h.causa||'----'}</td>
      <td>${tipoLabel}</td>
      <td>${diasDesde}</td>
    </tr>`;
  }).join('');

  return `<div style="margin-top:24px">
    <div class="historico-table-wrap">
      <table class="historico-table">
        <thead>
          <tr>
            <th>#</th><th>OS</th><th>Data Início</th><th>Data Fim</th><th>Equipe</th><th>Causa</th><th>Tipo</th><th>Intervalo</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ===== PESQUISA =====
async function pesquisarUC(uc){
  const res=document.getElementById('resultado');
  res.innerHTML=`Consultando...`;
  uc=uc.trim();
  if(!uc){res.innerHTML=`Digite uma UC.`;return;}

  try {

    const [histDoc, recenteDocs, ativasDocs] = await Promise.all([
      db.from('historico').select('*').eq('uc', uc).maybeSingle(),
      db.from('historico_recente').select('*').eq('uc', uc),
      db.from('visao_atual').select('*').eq('uc', uc)
    ]);

    const historicoBase=histDoc.data?(histDoc.data.historico||[]):[];

    const recentesFinalizados=(recenteDocs.data||[])
      .filter(r=>r.finalizado&&r.dt_fim)
      .map(r=>({os:r.ocorrencia,data_origem:r.dt_inicio,data_conc:r.dt_fim,prefixo:r.equipe||'----',causa:r.causa||'----'}));

    const ativasFormatadas=(ativasDocs.data||[])
      .map(a=>({os:a.ocorrencia,data_origem:a.dt_inicio,data_conc:null,prefixo:a.equipe||'----',causa:a.causa||'----'}));

    const historicoCompleto=[...historicoBase,...recentesFinalizados,...ativasFormatadas]
      .sort((a,b)=>(a.data_origem||'')>(b.data_origem||'')?1:-1);

    const procedentesComData = historicoCompleto.filter(h => h.data_conc && _isProcedente(h.causa));

    // ===== RETRABALHO =====
    let isRet = false;
    for (let i = 1; i < procedentesComData.length; i++) {
      const ant = procedentesComData[i-1];
      const cur = procedentesComData[i];
      const diff = (new Date(cur.data_origem) - new Date(ant.data_conc)) / 86400000;
      if (diff <= 90) { isRet = true; break; }
    }

    // OS ativa dentro da janela
    const temAtiva = historicoCompleto.some(h => !h.data_conc);
    const ultimoProcedente = procedentesComData[procedentesComData.length-1];

    let isPossivel = false;
    if (!isRet && temAtiva && ultimoProcedente) {
      const limite = new Date(ultimoProcedente.data_conc).getTime() + (90 * 86400000);
      isPossivel = historicoCompleto.some(h => {
        if (h.data_conc) return false;
        const dataInicio = new Date(h.data_origem).getTime();
        return dataInicio <= limite;
      });
    }

    let dentroJanela = false;
    if (!isRet && !isPossivel && ultimoProcedente) {
      dentroJanela = calcRetrabalho(ultimoProcedente.data_conc);
    }

    let statusUC = "fora";
    if (isRet || isPossivel) statusUC = "retrabalho";
    else if (dentroJanela) statusUC = "janela";

    const dataConc = ultimoProcedente?.data_conc || null;
    const fimJanela = dataConc ? new Date(new Date(dataConc).getTime()+90*86400000) : null;
    const diasR = fimJanela ? Math.ceil((fimJanela-new Date())/86400000) : null;

    const ultimoGeral=historicoCompleto[historicoCompleto.length-1]||{};

    res.innerHTML=`
      <div class="result-card">
        <div class="result-header">
          <div class="result-uc">UC ${uc}</div>
          <div>
            ${statusUC === "retrabalho"
              ? `<span class="badge-retrabalho">⚠ Em Retrabalho</span>`
              : statusUC === "janela"
                ? `<span class="badge badge-amber">⏳ Dentro da Janela</span>`
                : `<span class="badge-ok">✓ Fora do Período</span>`
            }
          </div>
        </div>

        <div class="info-grid">
          <div>Total de Atendimentos: ${historicoCompleto.length}</div>
          <div>Última OS: ${ultimoGeral.os||'----'}</div>
          <div>Data Início: ${fmtDate(ultimoGeral.data_origem)}</div>
          <div>Data Fim: ${fmtDate(ultimoGeral.data_conc)}</div>
          <div>Equipe: ${ultimoGeral.prefixo||'----'}</div>
          <div>Causa: ${ultimoGeral.causa||'----'}</div>
          ${fimJanela?`<div>Sai do Retrabalho: ${fmtDateShort(fimJanela.toISOString())} (${diasR}d)</div>`:''}
        </div>
      </div>
      ${renderGantt(historicoCompleto)}
      ${renderTabela(historicoCompleto)}
    `;

  } catch(err){
    console.error(err);
    res.innerHTML=`Erro: ${err.message}`;
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  const btn=document.getElementById('search-btn');
  const input=document.getElementById('search-input');
  btn.addEventListener('click',()=>pesquisarUC(input.value));
  input.addEventListener('keydown',e=>{if(e.key==='Enter')pesquisarUC(input.value);});
});
