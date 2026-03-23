// js/pesquisa.js

// ===== CAUSAS IMPROCEDENTES =====
const _CAUSAS_IMP_NORM = [
  'ACESSO IMPEDIDO','DISJUNTOR BT CLIENTE DESARMADO','DISJUNTOR MT GRUPO A DESARMADO',
  'ENCONTRADO ENERGIA CORTADA CLIENTE','ENCONTRADO NORMAL UC','ENDERECO NAO LOCALIZADO',
  'ILUMINACAO PUBLICA COM DEFEITO','INSTALACAO APOS MEDICAO COM DEFEITO CLIENTE',
  'PORTEIRA TRANCADA','REDE TELEFONICA TV A CABO'
];

const _CAUSAS_KW = [
  ['INSTALAC','APOS','MEDIC','DEFEITO','CLIENTE'],
  ['ILUMINAC','PUBLICA'],
  ['ENCONTRADO','NORMAL'],
  ['ENCONTRADO','ENERGIA','CORTADA'],
  ['ACESSO','IMPEDIDO'],
  ['DISJUNTOR','DESARMADO'],
  ['ENDERECO','NAO','LOCALIZADO'],
  ['PORTEIRA','TRANCADA'],
  ['REDE','TELEFON']
];

function _norm(s){
  if(!s) return '';
  let r = String(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  r = r.replace(/[^A-Z0-9]+/g,' ');
  return r.trim().replace(/\s+/g,' ');
}

function _isProcedente(causa){
  const c = _norm(causa);
  if(!c || c === '----') return false;
  if(_CAUSAS_IMP_NORM.some(i => c === i || c.includes(i) || i.includes(c))) return false;
  if(_CAUSAS_KW.some(kws => kws.every(kw => c.includes(kw)))) return false;
  return true;
}

function fmtDate(iso){
  if(!iso) return '----';
  return new Date(iso).toLocaleString('pt-BR',{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
  });
}

function fmtDateShort(iso){
  if(!iso) return '----';
  return new Date(iso).toLocaleDateString('pt-BR',{
    day:'2-digit',month:'2-digit',year:'numeric'
  });
}

// ===== JANELA 90 DIAS =====
function dentroJanela(dataConclusao){
  if(!dataConclusao) return false;
  const limite = new Date(new Date(dataConclusao).getTime() + 90*86400000);
  return new Date() <= limite;
}

// ===== PESQUISA =====
async function pesquisarUC(uc){
  const res = document.getElementById('resultado');
  res.innerHTML = `Consultando...`;

  uc = uc.trim();
  if(!uc){
    res.innerHTML = `Digite uma UC.`;
    return;
  }

  try {

    const [histDoc, recenteDocs, ativasDocs] = await Promise.all([
      db.from('historico').select('*').eq('uc', uc).maybeSingle(),
      db.from('historico_recente').select('*').eq('uc', uc),
      db.from('visao_atual').select('*').eq('uc', uc)
    ]);

    const historicoBase = histDoc.data ? (histDoc.data.historico || []) : [];

    const recentesFinalizados = (recenteDocs.data || [])
      .filter(r => r.finalizado && r.dt_fim)
      .map(r => ({
        os: r.ocorrencia,
        data_origem: r.dt_inicio,
        data_conc: r.dt_fim,
        prefixo: r.equipe || '----',
        causa: r.causa || '----'
      }));

    const ativasFormatadas = (ativasDocs.data || [])
      .map(a => ({
        os: a.ocorrencia,
        data_origem: a.dt_inicio,
        data_conc: null,
        prefixo: a.equipe || '----',
        causa: a.causa || '----'
      }));

    const historicoCompleto = [
      ...historicoBase,
      ...recentesFinalizados,
      ...ativasFormatadas
    ].sort((a,b)=> new Date(a.data_origem) - new Date(b.data_origem));

    const procedentes = historicoCompleto.filter(h => h.data_conc && _isProcedente(h.causa));

    // ===== RETRABALHO =====
    let emRetrabalho = false;
    for(let i=1;i<procedentes.length;i++){
      const ant = procedentes[i-1];
      const cur = procedentes[i];
      const diff = (new Date(cur.data_origem) - new Date(ant.data_conc)) / 86400000;
      if(diff <= 90){
        emRetrabalho = true;
        break;
      }
    }

    // ===== POSSÍVEL RETRABALHO =====
    let possivelRetrabalho = false;
    const ultimoProcedente = procedentes[procedentes.length-1];
    const temAtiva = historicoCompleto.some(h => !h.data_conc);

    if(!emRetrabalho && ultimoProcedente && temAtiva){
      const limite = new Date(ultimoProcedente.data_conc).getTime() + 90*86400000;
      possivelRetrabalho = historicoCompleto.some(h => {
        if(h.data_conc) return false;
        return new Date(h.data_origem).getTime() <= limite;
      });
    }

    // ===== DENTRO DA JANELA =====
    let dentroDaJanela = false;
    if(!emRetrabalho && !possivelRetrabalho && ultimoProcedente){
      dentroDaJanela = dentroJanela(ultimoProcedente.data_conc);
    }

    // ===== STATUS FINAL =====
    let statusUC = "fora";

    if (emRetrabalho) {
      statusUC = "retrabalho";
    }
    else if (possivelRetrabalho) {
      statusUC = "possivel";
    }
    else if (dentroDaJanela) {
      statusUC = "janela";
    }
    else {
      statusUC = "fora";
    }

    const dataConc = ultimoProcedente?.data_conc || null;
    const fimJanela = dataConc ? new Date(new Date(dataConc).getTime()+90*86400000) : null;
    const diasR = fimJanela ? Math.ceil((fimJanela-new Date())/86400000) : null;

    const ultimo = historicoCompleto[historicoCompleto.length-1] || {};

    res.innerHTML = `
      <div class="result-card">
        <div class="result-header">
          <div class="result-uc">UC ${uc}</div>
          <div>
            ${statusUC === "retrabalho"
              ? `<span class="badge-retrabalho">🔴 Em Retrabalho</span>`
              : statusUC === "possivel"
                ? `<span class="badge badge-amber">🟡 Possível Retrabalho</span>`
                : statusUC === "janela"
                  ? `<span class="badge badge-orange">🟠 Dentro da Janela</span>`
                  : `<span class="badge-ok">🟢 Fora do Período</span>`
            }
          </div>
        </div>

        <div class="info-grid">
          <div>Total de Atendimentos: ${historicoCompleto.length}</div>
          <div>Última OS: ${ultimo.os || '----'}</div>
          <div>Data Início: ${fmtDate(ultimo.data_origem)}</div>
          <div>Data Fim: ${fmtDate(ultimo.data_conc)}</div>
          <div>Equipe: ${ultimo.prefixo || '----'}</div>
          <div>Causa: ${ultimo.causa || '----'}</div>
          ${fimJanela ? `<div>Sai da Janela: ${fmtDateShort(fimJanela)} (${diasR}d)</div>` : ''}
        </div>
      </div>

      ${renderGantt(historicoCompleto)}
      ${renderTabela(historicoCompleto)}
    `;

  } catch(err){
    console.error(err);
    res.innerHTML = `Erro: ${err.message}`;
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  const btn = document.getElementById('search-btn');
  const input = document.getElementById('search-input');

  btn.addEventListener('click',()=>pesquisarUC(input.value));
  input.addEventListener('keydown',e=>{
    if(e.key === 'Enter') pesquisarUC(input.value);
  });
});
