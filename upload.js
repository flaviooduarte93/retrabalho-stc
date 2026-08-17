// js/upload.js — Supabase version

// ============================================================
// NORMALIZAÇÃO DE PREFIXO / EQUIPE
// GO-GOO-E027T  ->  GOOE027T   (junta 2ª e 3ª partes, descarta a 1ª)
// Formatos diferentes (já normalizados, '----', vazios) passam intactos.
// ============================================================
function normPrefixo(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = s.match(/^[^-\s]+-([^-\s]+)-([^-\s]+)$/);
  return m ? (m[1] + m[2]).toUpperCase() : s;
}

// ============================================================
// HELPERS
// ============================================================
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return isNaN(d) ? null : d;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2}:\d{2})?/);
    if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]||'00:00:00'}`);
    const d2 = new Date(s);
    return isNaN(d2) ? null : d2;
  }
  return null;
}

function sanitizeId(s) {
  return String(s||'----').replace(/[\/\s]+/g,'_').trim()||'----';
}

function limparTexto(s) {
  if (!s) return s;
  return String(s)
    .replace(/C\?O/gi,'ÇÃO').replace(/\?AO/gi,'ÃO').replace(/\?o\b/gi,'ão')
    .replace(/C\?/gi,'Ç').replace(/\?A/gi,'Ã').replace(/\?E/gi,'Ê')
    .replace(/\?I/gi,'Í').replace(/\?U/gi,'Ú').replace(/\?/g,'Ã').trim();
}

function setStatus(elId, msg, type, pct = null) {
  const el = document.getElementById(elId);
  if (!el) return;
  const progressId = elId + '-progress';
  let progressHtml = '';
  if (type === 'loading' && pct !== null) {
    progressHtml = `
      <div class="upload-progress-bar-outer">
        <div class="upload-progress-bar-inner" style="width:${pct}%"></div>
      </div>
      <div class="upload-progress-pct">${pct}%</div>`;
  } else if (type === 'loading') {
    progressHtml = `
      <div class="upload-progress-bar-outer">
        <div class="upload-progress-bar-indeterminate"></div>
      </div>`;
  }
  el.innerHTML = `<span>${msg}</span>${progressHtml}`;
  el.className = 'upload-status ' + (type||'');
}

// Mantém a aba ativa durante uploads (evita ERR_NETWORK_IO_SUSPENDED)
let _wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch(e) { /* navegador não suporta — sem problema */ }
}
function releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release(); _wakeLock = null; }
}

// Upsert em lotes com progresso visual
async function upsertBatch(table, rows, chunkSize = 800, statusEl = null) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + chunkSize));
    if (error) throw new Error(`Erro ao salvar em ${table}: ${error.message}`);
    if (statusEl) {
      const pct = Math.round(((i + chunkSize) / rows.length) * 100);
      setStatus(statusEl, `⏳ Salvando ${Math.min(i + chunkSize, rows.length)}/${rows.length} registros...`, 'loading', Math.min(pct, 100));
    }
  }
}

function diasRestantesSnap(dc) {
  if (!dc) return null;
  return Math.ceil((new Date(new Date(dc).getTime() + 91*86400000) - new Date()) / 86400000);
}

// ============================================================
// BASE HISTÓRICA
// ============================================================
async function processHistorico(file) {
  // Lê o arquivo ANTES de qualquer operação async para evitar NotReadableError
  const data = await file.arrayBuffer();
  await requestWakeLock();
  setStatus('status-historico', '⏳ Lendo arquivo...', 'loading');
  const wb = XLSX.read(data);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

  if (!rows.length || !('UC' in rows[0]) || !('OS' in rows[0])) {
    setStatus('status-historico', '❌ Estrutura inválida.', 'error'); return;
  }

  setStatus('status-historico', '⏳ Processando...', 'loading');

  const byUC = {};
  for (const row of rows) {
    const uc = String(row['UC']||'').trim();
    if (!uc) continue;
    if (!byUC[uc]) byUC[uc] = [];
    byUC[uc].push(row);
  }

  const ucKeys = Object.keys(byUC);
  setStatus('status-historico', `⏳ Processando ${ucKeys.length} UCs...`, 'loading');

  // Salva alimentador e municipio ANTES de apagar — serão restaurados no insert
  const _rc = typeof getRegional === 'function' ? getRegional() : null;
  const _savedAlim = {}, _savedMuni = {};
  try {
    let _page = 0, _savedAll = [];
    while (true) {
      const { data: _s } = await db.from('historico').select('uc,alimentador,municipio')
        .range(_page * 1000, _page * 1000 + 999);
      if (!_s?.length) break;
      _savedAll = _savedAll.concat(_s);
      if (_s.length < 1000) break;
      _page++;
    }
    _savedAll.forEach(h => {
      if (h.alimentador) _savedAlim[h.uc] = h.alimentador;
      if (h.municipio)   _savedMuni[h.uc] = h.municipio;
    });
    console.log(`ℹ Preservando: ${Object.keys(_savedAlim).length} alimentadores, ${Object.keys(_savedMuni).length} municípios`);
  } catch(e) { console.warn('Aviso ao salvar alimentador/municipio:', e.message); }

  const docs = [];
  for (const uc of ucKeys) {
    const registros = byUC[uc];
    const osQueEhOrigem = new Set(registros.map(r => String(r['OS_ORIGEM']||'').trim()).filter(Boolean));
    const osMap = {};

    for (const r of registros) {
      const osAtual  = String(r['OS']||'').trim();
      const osOrigem = String(r['OS_ORIGEM']||'').trim();
      function chaveOS(osStr, dataStr) {
        const num = String(osStr||'').trim().replace(/^\d{4}-\d+-/, '');
        if (!dataStr) return osStr;
        const d = new Date(dataStr);
        if (isNaN(d)) return osStr;
        const mesAno = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        return `${mesAno}-${num}`;
      }
      function duracao(rec) {
        if (!rec.data_origem || !rec.data_conc) return 0;
        return new Date(rec.data_conc) - new Date(rec.data_origem);
      }
      function setOsMap(key, rec) {
        if (!osMap[key] || duracao(rec) > duracao(osMap[key])) osMap[key] = rec;
      }

      if (osOrigem) {
        const dtOrig = parseDate(r['DATA_ORIGEM_1º ATEND.'])?.toISOString()||null;
        const rec = {
          os: osOrigem,
          data_origem: dtOrig,
          data_conc:   parseDate(r['DATA_CONCLUSAO_1º ATEND.'])?.toISOString()||null,
          prefixo: normPrefixo(r['PREFIXO_ORIGEM'])||'----',
          causa:   limparTexto(String(r['TIPO_CONCLUSAO_ORIGEM']||''))||'----',
        };
        setOsMap(chaveOS(osOrigem, dtOrig), rec);
      }
      if (osAtual && !osQueEhOrigem.has(osAtual)) {
        const causaFinal = limparTexto(String(r['TIPO_CONCLUSAO']||r['TIPO_CONCLUSAO_ORIGEM']||''))||'----';
        const dtAtual = parseDate(r['DATA_ORIGEM'])?.toISOString()||null;
        const rec = {
          os: osAtual,
          data_origem: dtAtual,
          data_conc:   parseDate(r['OCO_DATA_CONCLUSAO'])?.toISOString()||null,
          prefixo: normPrefixo(r['PREFIXO'])||'----',
          causa:   causaFinal,
        };
        setOsMap(chaveOS(osAtual, dtAtual), rec);
      }
    }

    const hist   = Object.values(osMap).sort((a,b)=>(a.data_origem||'')>(b.data_origem||'')?1:-1);
    const ultimo = [...hist].sort((a,b)=>(b.data_origem||'')>(a.data_origem||'')?1:-1)[0]||{};
    const ucId   = sanitizeId(uc);

    // Município: vem do arquivo (Metropolitana) ou do salvo anteriormente
    const municipioArquivo = registros
      .map(r => String(r['Município']||r['Municipio']||r['MUNICIPIO']||r['MUNICÍPIO']||'').trim())
      .find(m => m) || null;
    const municipioFinal = municipioArquivo || _savedMuni[ucId] || null;

    docs.push({
      uc:               ucId,
      // alimentador: preservado do historico anterior (Goiânia)
      ...(_rc?.features?.alimentador && _savedAlim[ucId] ? { alimentador: _savedAlim[ucId] } : {}),
      // municipio: do arquivo ou preservado (Metropolitana)
      ...(_rc?.features?.municipio && municipioFinal ? { municipio: municipioFinal } : {}),
      ultima_os:        ultimo.os        ||'----',
      data_origem:      ultimo.data_origem||null,
      data_conc:        ultimo.data_conc  ||null,
      prefixo:          ultimo.prefixo   ||'----',
      causa:            ultimo.causa     ||'----',
      qtd_atendimentos: hist.length,
      historico:        hist,
    });
  }

  // Apaga tudo e reinsere
  setStatus('status-historico', '⏳ Limpando base anterior...', 'loading');
  const { error: delErr } = await db.from('historico').delete().neq('uc','__never__');
  if (delErr) throw new Error(delErr.message);

  setStatus('status-historico', `⏳ Salvando ${docs.length} UCs...`, 'loading');
  await upsertBatch('historico', docs, 200, 'status-historico');

  // Salva meta da base histórica
  await db.from('historico_meta')
    .upsert({
      id: 'principal',
      atualizado_em: new Date().toISOString(),
      total_ucs: docs.length,
      arquivo: file.name
    }, { onConflict: 'id', ignoreDuplicates: false });

  // Snapshot diário — conta apenas UCs DENTRO da janela de 90 dias
  function _diasR(dc) {
    if (!dc) return null;
    return Math.ceil((new Date(new Date(dc).getTime()+91*86400000) - new Date()) / 86400000);
  }
  const _agora    = new Date();
  const _brasilia = new Date(_agora.getTime() - 3*60*60*1000);
  const dataHoje  = _brasilia.toISOString().slice(0,10);
  const snapCritico = docs.filter(d => { const r=_diasR(d.data_conc); return r!==null&&r>0&&r<=10; }).length;
  const snapAlerta  = docs.filter(d => { const r=_diasR(d.data_conc); return r!==null&&r>10&&r<=30; }).length;
  const snapOk      = docs.filter(d => { const r=_diasR(d.data_conc); return r!==null&&r>30; }).length;
  const snapTotal   = snapCritico + snapAlerta + snapOk;
  await db.from('historico_snapshots').delete().eq('data', dataHoje);
  await db.from('historico_snapshots').insert({
    data: dataHoje, total_ucs: snapTotal,
    critico: snapCritico, alerta: snapAlerta, ok: snapOk
  });

  releaseWakeLock();
  setStatus('status-historico', `✅ ${docs.length} UCs salvas!`, 'success');
  if (window.atualizarStatusBases) window.atualizarStatusBases();
}

// ============================================================
// OCORRÊNCIAS ATIVAS (Visão Atual)
// ============================================================
async function processAtual(file) {
  // Lê o arquivo ANTES de qualquer operação async para evitar NotReadableError
  const data = await file.arrayBuffer();
  await requestWakeLock();
  setStatus('status-atual', '⏳ Lendo arquivo...', 'loading');
  const wb   = XLSX.read(data);
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    if (allRows[i].some(c => String(c).trim() === 'Número')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) { setStatus('status-atual','❌ Cabeçalho não encontrado.','error'); return; }

  const headers = allRows[headerIdx].map(h => String(h).trim());
  const rows = allRows.slice(headerIdx+1)
    .filter(r => r.some(c => c !== ''))
    .map(r => { const o={}; headers.forEach((h,i)=>{ o[h]=r[i]??''; }); return o; })
    .filter(r => {
      const ab = String(r['Abrangência']||'').trim().toUpperCase();
      const es = String(r['Estado']||'').trim().toUpperCase();
      return ab === 'CR' && !es.includes('FINALIZADA');
    });

  if (!rows.length) { setStatus('status-atual','❌ Nenhuma ocorrência ativa CR.','error'); return; }

  setStatus('status-atual', `⏳ ${rows.length} ocorrências — consultando histórico...`, 'loading');

  // Extrai UCs únicas
  const ucsSet = new Set();
  for (const row of rows) {
    const pe = String(row['Ponto Elétrico']||'').trim();
    const m  = pe.match(/^(.+?)\s+-\s/);
    const ucRaw0 = m ? m[1].trim() : pe.split(' -')[0].trim();
    if (/[a-zA-Z]/.test(ucRaw0)) continue;
    ucsSet.add(sanitizeId(ucRaw0));
  }
  const ucsArr = [...ucsSet];

  // Busca histórico das UCs em lotes de 200 (Supabase suporta 'in' com muitos valores)
  const historicoMap = {};
  for (let i = 0; i < ucsArr.length; i += 200) {
    const { data: hist } = await db.from('historico')
      .select('uc,qtd_atendimentos,data_conc,causa')
      .in('uc', ucsArr.slice(i, i+200));
    (hist||[]).forEach(h => { historicoMap[h.uc] = h; });
  }

  // Monta docs
  const docs = [];
  for (const row of rows) {
    const ocorrencia = String(row['Número']||'').trim();
    if (!ocorrencia) continue;
    const estado    = String(row['Estado']||'').trim();
    const pe        = String(row['Ponto Elétrico']||'').trim();
    const equipe    = normPrefixo(row['Equipe']);
    const dtInicio  = parseDate(row['Data Início']);
    const dtFim     = parseDate(row['Data Fim']);
    const seccional = String(row['Seccional']||'').trim();
    const municipio = String(row['Município']||'').trim();
    const causa     = limparTexto(String(row['Causa']||row['Motivo']||'').trim());
    const m  = pe.match(/^(.+?)\s+-\s/);
    const ucRaw = m ? m[1].trim() : pe.split(' -')[0].trim();
    // UC válida é numérica pura — ignora equipamentos (TR..., GN..., etc.)
    const uc = /[a-zA-Z]/.test(ucRaw) ? null : sanitizeId(ucRaw);
    if (!uc) continue; // descarta registros com UC não-numérica
    const h  = historicoMap[uc];

    // em_historico só é true se UC está no histórico E ainda dentro dos 90 dias
    const dentroJanela90 = h?.data_conc
      ? new Date() <= new Date(new Date(h.data_conc).getTime() + 91*86400000)
      : false;

    docs.push({
      ocorrencia: sanitizeId(ocorrencia),
      estado, ponto_eletrico: pe, uc,
      equipe:          equipe   ||'----',
      dt_inicio:       dtInicio ? dtInicio.toISOString() : null,
      dt_fim:          dtFim    ? dtFim.toISOString()    : null,
      causa, seccional, municipio,
      em_historico:    !!h && dentroJanela90,
      qtd_atendimentos: h ? (h.qtd_atendimentos||1) : 0,
      data_conc:        h ? (h.data_conc||null)     : null,
      causa_historico:  h ? (h.causa||'----')       : '----',
    });
  }

  setStatus('status-atual', `⏳ Salvando ${docs.length} ocorrências...`, 'loading');

  // Apaga tudo e reinsere — simples e rápido no Supabase
  await db.from('visao_atual').delete().neq('ocorrencia','__never__');
  await upsertBatch('visao_atual', docs, 200, 'status-atual');

  // Salva meta das ocorrências ativas — tabela própria (independente do histórico recente)
  await db.from('historico_meta')
    .upsert({
      id: 'visao_atual',
      arquivo: file.name,
      total_ucs: docs.length,
      atualizado_em: new Date().toISOString()
    }, { onConflict: 'id', ignoreDuplicates: false });

  releaseWakeLock();
  setStatus('status-atual', `✅ ${docs.length} ocorrências ativas salvas!`, 'success');
  if (window.atualizarStatusBases) window.atualizarStatusBases();
}

// ============================================================
// BIND
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const fh = document.getElementById('file-historico');
  const fa = document.getElementById('file-atual');

  if (fh) fh.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { await processHistorico(file); }
    catch(err) { console.error(err); setStatus('status-historico','❌ '+err.message,'error'); }
    e.target.value = '';
  });

  if (fa) fa.addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { await processAtual(file); }
    catch(err) { console.error(err); setStatus('status-atual','❌ '+err.message,'error'); }
    e.target.value = '';
  });
});

// ============================================================
//  PATCH — envia as ocorrências TF (transformadores) ao painel
//  de Reincidência, na MESMA planilha que o Retrabalho já sobe.
//
//  O upload.js do Retrabalho filtra Abrangência = 'CR' (por UC).
//  O painel de Reincidência precisa de 'TF' (por transformador).
//  São recortes disjuntos da mesma extração — então dá para
//  separar os dois na mesma passada, sem subir o arquivo 2x.
//
//  COMO INSTALAR
//  1. Rode add_tempo_real.sql no Supabase do painel (reinc_trafo),
//     se ainda não rodou.
//  2. Cole este arquivo DEPOIS do upload.js (ou cole o conteúdo no
//     final dele). Ele não altera nada do que já existe.
//  3. Confirme que o SheetJS (XLSX) já está carregado na página —
//     o upload.js usa, então já deve estar.
//
//  Nenhuma outra mudança é necessária: o patch se pendura no
//  mesmo <input id="file-atual"> que o Retrabalho já escuta.
// ============================================================

(function () {
  'use strict';

  // ---- Cliente do Supabase do PAINEL DE REINCIDÊNCIA (reinc_trafo) ----
  // Projeto diferente do Retrabalho, por isso um cliente próprio.
  const REINC_URL = 'https://lektklczuglajpdehqov.supabase.co';
  const REINC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3RrbGN6dWdsYWpwZGVocW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzA3MDQsImV4cCI6MjA5NTkwNjcwNH0._VKvOdcaBtkPEF0FjE9yr94O9qoRyS4BQA7Nuvw9uCo';

  // Reusa o supabase-js global já carregado pela página.
  let sbReinc = null;
  function getReincClient() {
    if (sbReinc) return sbReinc;
    const lib = window.supabase;
    if (!lib || !lib.createClient) {
      console.warn('[TF→painel] supabase-js não encontrado na página. O envio TF foi ignorado.');
      return null;
    }
    sbReinc = lib.createClient(REINC_URL, REINC_KEY);
    return sbReinc;
  }

  // ---- Parsing de data do decômetro: "24/07/2026 10:05:25" → Date local ----
  function parseDataTF(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') {           // serial do Excel
      const d = new Date((v - 25569) * 86400 * 1000);
      return isNaN(d) ? null : d;
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0));
    const d2 = new Date(s);
    return isNaN(d2) ? null : d2;
  }

  const num  = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const int  = v => { const n = parseInt(v);   return isNaN(n) ? 0 : n; };
  const txt  = v => String(v ?? '').trim();
  const semTraco = v => txt(v).replace(/^-+$/, '');

  // ---- Processa as linhas TF da MESMA planilha e grava no painel ----
  //  Recebe `rowsObj`: array de objetos {coluna: valor}, já com o
  //  cabeçalho resolvido (o upload.js monta isso na função processAtual).
  async function enviarTFparaPainel(rowsObj, fileName) {
    const db = getReincClient();
    if (!db) return;

    // Mesmo filtro do painel: Abrangência TF e estado não finalizado.
    const tf = rowsObj.filter(r => {
      const ab = txt(r['Abrangência']).toUpperCase();
      const es = txt(r['Estado']).toUpperCase();
      return ab === 'TF' && es && !es.startsWith('F-');
    });

    console.log(`[TF→painel] ${tf.length} ocorrências TF ativas encontradas na planilha.`);
    if (!tf.length) {
      // Sem TF ativa: zera a tabela para o painel não mostrar dado velho.
      try { await db.from('tempo_real_ocorrencias').delete().neq('id', 0); } catch (e) {}
      return;
    }

    const importadoEm = new Date().toISOString();
    const registros = tf.map(r => {
      const ini = parseDataTF(r['Data Início']);
      return {
        oe:            txt(r['Número']),
        estado:        txt(r['Estado']),
        inicio:        ini ? ini.toISOString() : null,
        duracao_arq:   txt(r['Duração']),
        conjunto:      txt(r['Conjunto Elétrico']),
        trafo:         txt(r['Ponto Elétrico']).toUpperCase(),
        clientes:      int(r['Clts > 3 min']),
        clts_max:      int(r['Clts Af Max']),
        equipe:        semTraco(r['Equipe']) || null,
        chi:           num(r['CHI']),
        dec:           num(r['DEC']),
        causa:         semTraco(r['Causa']) || null,
        motivo:        txt(r['Motivo']) || null,
        seccional:     txt(r['Seccional']) || null,
        municipio:     txt(r['Município']) || null,
        perimetro:     txt(r['Perímetro']) || null,
        prioridade:    txt(r['Prioridade']) || null,
        avisos:        int(r['Avisos']),
        natureza:      txt(r['Natureza']) || null,
        ocorrencia_id: txt(r['Ocorrência ID']) || null,
        importado_em:  importadoEm,
      };
    }).filter(x => x.oe && x.trafo);   // descarta linhas sem OE ou sem trafo

    try {
      // A extração é um retrato do momento: apaga a anterior e insere a atual.
      await db.from('tempo_real_ocorrencias').delete().neq('id', 0);

      let salvos = 0;
      for (let i = 0; i < registros.length; i += 100) {
        const lote = registros.slice(i, i + 100);
        const { error } = await db.from('tempo_real_ocorrencias').insert(lote);
        if (error) {
          console.warn('[TF→painel] falha ao salvar lote:', error.message);
          if (/relation.*does not exist|could not find the table/i.test(error.message)) {
            console.warn('  → tabela tempo_real_ocorrencias não existe. Rode add_tempo_real.sql no reinc_trafo.');
            return;
          }
        } else salvos += lote.length;
      }
      console.log(`[TF→painel] ✅ ${salvos} ocorrências TF enviadas ao painel de reincidência.`);
    } catch (e) {
      console.warn('[TF→painel] erro ao enviar:', e.message);
    }
  }

  // ---- Pendura no mesmo input do Retrabalho (file-atual) ----
  //  Roda em paralelo ao processAtual: lê a planilha por conta própria,
  //  extrai as TF e envia. Não interfere no fluxo CR existente.
  function bind() {
    const fa = document.getElementById('file-atual');
    if (!fa) { console.warn('[TF→painel] input #file-atual não encontrado.'); return; }

    fa.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      // clona o arquivo em memória: o upload.js também vai lê-lo, e um
      // File só pode ser lido uma vez por stream — o arrayBuffer é seguro.
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' });

        // Acha a linha de cabeçalho (a que tem "Número"), igual ao processAtual.
        let hIdx = -1;
        for (let i = 0; i < Math.min(6, allRows.length); i++) {
          if (allRows[i].some(c => String(c).trim() === 'Número')) { hIdx = i; break; }
        }
        if (hIdx === -1) { console.warn('[TF→painel] cabeçalho não encontrado.'); return; }

        const headers = allRows[hIdx].map(h => String(h).trim());
        const rowsObj = allRows.slice(hIdx + 1)
          .filter(r => r.some(c => c !== ''))
          .map(r => { const o = {}; headers.forEach((h, i) => { o[h] = r[i] ?? ''; }); return o; });

        await enviarTFparaPainel(rowsObj, file.name);
      } catch (err) {
        console.warn('[TF→painel] erro ao processar planilha:', err.message);
      }
      // NÃO limpa e.target.value aqui — deixa o handler do Retrabalho cuidar disso.
    });

    console.log('[TF→painel] pronto: as ocorrências TF desta planilha irão ao painel de reincidência.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
