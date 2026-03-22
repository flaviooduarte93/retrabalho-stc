// js/upload.js — Supabase version

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

function setStatus(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'upload-status ' + (type||'');
}

// Upsert em lotes (Supabase aceita ~1000 por request)
async function upsertBatch(table, rows, chunkSize = 800) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + chunkSize));
    if (error) throw new Error(`Erro ao salvar em ${table}: ${error.message}`);
  }
}

// ============================================================
// BASE HISTÓRICA
// ============================================================
async function processHistorico(file) {
  setStatus('status-historico', '⏳ Lendo arquivo...', 'loading');
  const data = await file.arrayBuffer();
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

  const docs = [];
  for (const uc of ucKeys) {
    const registros = byUC[uc];
    const osQueEhOrigem = new Set(registros.map(r => String(r['OS_ORIGEM']||'').trim()).filter(Boolean));
    const osMap = {};

    for (const r of registros) {
      const osAtual  = String(r['OS']||'').trim();
      const osOrigem = String(r['OS_ORIGEM']||'').trim();
      if (osOrigem) {
        osMap[osOrigem] = {
          os: osOrigem,
          data_origem: parseDate(r['DATA_ORIGEM_1º ATEND.'])?.toISOString()||null,
          data_conc:   parseDate(r['DATA_CONCLUSAO_1º ATEND.'])?.toISOString()||null,
          prefixo: String(r['PREFIXO_ORIGEM']||'')||'----',
          causa:   limparTexto(String(r['TIPO_CONCLUSAO_ORIGEM']||''))||'----',
        };
      }
      if (osAtual && !osQueEhOrigem.has(osAtual)) {
        const causaFinal = limparTexto(String(r['TIPO_CONCLUSAO']||r['TIPO_CONCLUSAO_ORIGEM']||''))||'----';
        osMap[osAtual] = {
          os: osAtual,
          data_origem: parseDate(r['DATA_ORIGEM'])?.toISOString()||null,
          data_conc:   parseDate(r['OCO_DATA_CONCLUSAO'])?.toISOString()||null,
          prefixo: String(r['PREFIXO']||'')||'----',
          causa:   causaFinal,
        };
      }
    }

    const hist = Object.values(osMap).sort((a,b)=>(a.data_origem||'')>(b.data_origem||'')?1:-1);
    const ultimo = [...hist].sort((a,b)=>(b.data_origem||'')>(a.data_origem||'')?1:-1)[0]||{};

    docs.push({
      uc: sanitizeId(uc),
      ultima_os:        ultimo.os       ||'----',
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
  await upsertBatch('historico', docs);
  setStatus('status-historico', `✅ ${docs.length} UCs salvas!`, 'success');
}

// ============================================================
// OCORRÊNCIAS ATIVAS (Visão Atual)
// ============================================================
async function processAtual(file) {
  setStatus('status-atual', '⏳ Lendo arquivo...', 'loading');
  const data = await file.arrayBuffer();
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
    ucsSet.add(sanitizeId(m ? m[1].trim() : pe.split(' -')[0].trim()));
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
    const equipe    = String(row['Equipe']||'').trim();
    const dtInicio  = parseDate(row['Data Início']);
    const dtFim     = parseDate(row['Data Fim']);
    const seccional = String(row['Seccional']||'').trim();
    const municipio = String(row['Município']||'').trim();
    const causa     = limparTexto(String(row['Causa']||row['Motivo']||'').trim());
    const m  = pe.match(/^(.+?)\s+-\s/);
    const uc = sanitizeId(m ? m[1].trim() : pe.split(' -')[0].trim());
    const h  = historicoMap[uc];

    docs.push({
      ocorrencia: sanitizeId(ocorrencia),
      estado, ponto_eletrico: pe, uc,
      equipe:          equipe   ||'----',
      dt_inicio:       dtInicio ? dtInicio.toISOString() : null,
      dt_fim:          dtFim    ? dtFim.toISOString()    : null,
      causa, seccional, municipio,
      em_historico:    !!h,
      qtd_atendimentos: h ? (h.qtd_atendimentos||1) : 0,
      data_conc:        h ? (h.data_conc||null)     : null,
      causa_historico:  h ? (h.causa||'----')       : '----',
    });
  }

  setStatus('status-atual', `⏳ Salvando ${docs.length} ocorrências...`, 'loading');

  // Apaga tudo e reinsere — simples e rápido no Supabase
  await db.from('visao_atual').delete().neq('ocorrencia','__never__');
  await upsertBatch('visao_atual', docs);

  setStatus('status-atual', `✅ ${docs.length} ocorrências ativas salvas!`, 'success');
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
