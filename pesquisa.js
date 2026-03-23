// js/pesquisa.js — Supabase version

// ===== CAUSAS IMPROCEDENTES (local) =====
const _CAUSAS_IMP_NORM=['ACESSO IMPEDIDO','DISJUNTOR BT CLIENTE DESARMADO','DISJUNTOR MT GRUPO A DESARMADO','ENCONTRADO ENERGIA CORTADA CLIENTE','ENCONTRADO NORMAL UC','ENDERECO NAO LOCALIZADO','ILUMINACAO PUBLICA COM DEFEITO','INSTALACAO APOS MEDICAO COM DEFEITO CLIENTE','PORTEIRA TRANCADA','REDE TELEFONICA TV A CABO'];
const _CAUSAS_KW=[['INSTALAC','APOS','MEDIC','DEFEITO','CLIENTE'],['ILUMINAC','PUBLICA'],['ENCONTRADO','NORMAL'],['ENCONTRADO','ENERGIA','CORTADA'],['ACESSO','IMPEDIDO'],['DISJUNTOR','DESARMADO'],['ENDERECO','NAO','LOCALIZADO'],['PORTEIRA','TRANCADA'],['REDE','TELEFON']];
function _norm(s){if(!s)return'';let r=String(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');r=r.replace(/[^A-Z0-9]+/g,' ');return r.trim().replace(/\s+/g,' ');}
function _isProcedente(causa){const c=_norm(causa);if(!c||c==='----')return false;if(_CAUSAS_IMP_NORM.some(i=>c===i||c.includes(i)||i.includes(c)))return false;if(_CAUSAS_KW.some(kws=>kws.every(kw=>c.includes(kw))))return false;return true;}

function fmtDate(iso){if(!iso)return'----';return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function fmtDateShort(iso){if(!iso)return'----';return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});}

// ===== REGRA JANELA 90 DIAS =====
function calcDentroJanela(dc){
  if(!dc) return false;
  const limite = new Date(dc).getTime() + (90 * 86400000);
  return new Date().getTime() <= limite;
}

// ===== PESQUISA =====
async function pesquisarUC(uc){
  const res=document.getElementById('resultado');
  res.innerHTML=`<div class="loading-state"><div class="spinner"></div><br>Consultando todas as bases...</div>`;
  uc=uc.trim();
  if(!uc){res.innerHTML=`<div class="no-results"><p>Digite uma UC.</p></div>`;return;}

  try {
    const ucSanitized = uc.replace(/[\/\s]+/g,'_').trim();
    const ucVariants = [...new Set([ucSanitized, uc.trim()])];

    let histDoc = null, recenteDocs = [], ativasDocs = [];
    for (const ucVar of ucVariants) {
      const [h, r, a] = await Promise.all([
        db.from('historico').select('*').eq('uc', ucVar).maybeSingle(),
        db.from('historico_recente').select('*').eq('uc', ucVar),
        db.from('visao_atual').select('*').eq('uc', ucVar)
      ]);
      if (h.data && !histDoc) histDoc = h.data;
      if (r.data?.length) recenteDocs = [...recenteDocs, ...r.data];
      if (a.data?.length) ativasDocs = [...ativasDocs, ...a.data];
    }

    recenteDocs = recenteDocs.filter((r,i,arr)=>arr.findIndex(x=>x.id===r.id)===i);
    ativasDocs  = ativasDocs.filter((a,i,arr)=>arr.findIndex(x=>x.ocorrencia===a.ocorrencia)===i);

    if(!histDoc && !recenteDocs?.length && !ativasDocs?.length){
      res.innerHTML=`<div class="no-results"><p>UC <strong>${uc}</strong> não encontrada.</p></div>`;
      return;
    }

    const historicoBase=histDoc?(histDoc.historico||[]):[];

    const recentesFinalizados=(recenteDocs||[])
      .filter(r=>r.finalizado&&r.dt_fim)
      .map(r=>({os:r.ocorrencia,data_origem:r.dt_inicio,data_conc:r.dt_fim,prefixo:r.equipe||'----',causa:r.causa||'----'}));

    const ativasFormatadas=(ativasDocs||[])
      .map(a=>({os:a.ocorrencia,data_origem:a.dt_inicio,data_conc:null,prefixo:a.equipe||'----',causa:a.causa||'----'}));

    const historicoCompleto = [...historicoBase, ...recentesFinalizados, ...ativasFormatadas]
      .sort((a,b)=>(a.data_origem||'')>(b.data_origem||'')?1:-1);

    const procedentesComData = historicoCompleto.filter(h => h.data_conc && _isProcedente(h.causa));

    // ===== RETRABALHO =====
    let isRet = false;
    for (let i = 1; i < procedentesComData.length; i++) {
      const ant = procedentesComData[i-1];
      const cur = procedentesComData[i];
      const diff = (new Date(cur.data_origem) - new Date(ant.data_conc)) / 86400000;
      if (diff <= 90) { 
        isRet = true; 
        break; 
      }
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
      dentroJanela = calcDentroJanela(ultimoProcedente.data_conc);
    }

    // Status final
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
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${statusUC === "retrabalho"
              ? `<span class="badge-retrabalho">⚠ Em Retrabalho</span>`
              : statusUC === "janela"
                ? `<span class="badge badge-amber">⏳ Dentro da Janela</span>`
                : `<span class="badge-ok">✓ Fora do Período</span>`
            }
            ${ativasFormatadas.length?`<span class="badge badge-amber">🔴 ${ativasFormatadas.length} ativa(s)</span>`:''}
          </div>
        </div>

        <div class="info-grid">
          <div class="info-item"><div class="info-label">Total de Atendimentos</div><div class="info-value highlight">${historicoCompleto.length}</div></div>
          <div class="info-item"><div class="info-label">Última OS</div><div class="info-value">${ultimoGeral.os||'----'}</div></div>
          <div class="info-item"><div class="info-label">Data Início</div><div class="info-value">${fmtDate(ultimoGeral.data_origem)}</div></div>
          <div class="info-item"><div class="info-label">Data Fim</div><div class="info-value">${fmtDate(ultimoGeral.data_conc)}</div></div>
          <div class="info-item"><div class="info-label">Equipe</div><div class="info-value">${ultimoGeral.prefixo||'----'}</div></div>
          <div class="info-item"><div class="info-label">Causa</div><div class="info-value">${ultimoGeral.causa||'----'}</div></div>

          ${fimJanela?`<div class="info-item">
            <div class="info-label">Sai do Retrabalho</div>
            <div class="info-value">
              ${fmtDateShort(fimJanela.toISOString())}
              <span style="font-size:.8rem;margin-left:6px">
                (${diasR>0?diasR+'d restantes':'encerrado'})
              </span>
            </div>
          </div>`:''}
        </div>
      </div>
    `;

  } catch(err){
    console.error(err);
    res.innerHTML=`<div class="no-results"><p>Erro: ${err.message}</p></div>`;
  }
}
