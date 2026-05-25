// js/upload-recente.js — Supabase version

// ============================================================
// ALIMENTADOR — Goiânia / MUNICÍPIO — Metropolitana
// ============================================================
function _ignorarAlimentador(val) {
  if (!val) return true;
  const v = String(val).trim();
  return !v || /^[-\s]+$/.test(v) || v === '----' || v.length < 3;
}

async function rastrearAlimentador(docs, mesAno, alimentadorMap = {}) {
  const ucs = [...new Set(docs.map(d => d.uc))];
  if (!ucs.length) return;
  const { data: histAtual } = await db.from('historico').select('uc,alimentador,alimentador_log').in('uc', ucs);
  const mapAtual = {};
  (histAtual||[]).forEach(h => { mapAtual[h.uc] = h; });

  const agora   = new Date().toISOString();
  const updates = [];
  for (const d of docs) {
    const novoAlim = alimentadorMap[d.uc] || null;
    if (!novoAlim) continue;
    const atual            = mapAtual[d.uc];
    const alimentadorAtual = atual?.alimentador;
    const log              = Array.isArray(atual?.alimentador_log) ? atual.alimentador_log : [];
    if (!alimentadorAtual || alimentadorAtual !== novoAlim) {
      if (alimentadorAtual && alimentadorAtual !== novoAlim) {
        log.push({ de: alimentadorAtual, para: novoAlim, mes_ano: mesAno, em: agora });
      }
      updates.push({ uc: d.uc, alimentador: novoAlim, alimentador_log: log });
    }
  }
  for (const u of updates) {
    await db.from('historico').update({ alimentador: u.alimentador, alimentador_log: u.alimentador_log }).eq('uc', u.uc);
  }
  if (updates.length) console.log(`Alimentador: ${updates.length} UCs atualizadas`);
}

function mesAnoKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function setStatusRecente(msg, type, pct = null) {
  const el = document.getElementById('status-recente');
  if (!el) return;
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
  el.className = 'upload-status ' + (type || '');
}

const ESTADOS_ATIVOS = ['PREPARAÇÃO', 'TRABALHANDO', 'DESLOCAMENTO', 'MULTIPLA'];

async function limparMesesAntigos() {
  const hoje = new Date();
  const mesesValidos = new Set([mesAnoKey(hoje)]);
  for (let i = 1; i <= 3; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    mesesValidos.add(mesAnoKey(d));
  }
  const { data: metas } = await db.from('historico_recente_meta').select('mes_ano');
  const expirados = (metas || []).map(m => m.mes_ano).filter(m => !mesesValidos.has(m));
  for (const mes of expirados) {
    await db.from('historico_recente').delete().eq('mes_ano', mes);
    await db.from('historico_recente_meta').delete().eq('mes_ano', mes);
  }
  return mesesValidos;
}

async function processarPlanilhaRecente(file, idx, total) {
  setStatusRecente(`⏳ Lendo arquivo ${idx + 1}/${total}...`, 'loading');
  const data    = await file.arrayBuffer();
  const wb      = XLSX.read(data);
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

  // ── Localiza cabeçalho ─────────────────────────────────────
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    if (allRows[i].some(c => String(c).trim() === 'Número')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error(`${file.name}: cabeçalho não encontrado`);

  const headers  = allRows[headerIdx].map(h => String(h).trim());
  const dataRows = allRows.slice(headerIdx + 1)
    .filter(r => r.some(c => c !== ''))
    .map(r => { const o = {}; headers.forEach((h, i) => { o[h] = r[i] ?? ''; }); return o; })
    .filter(r => String(r['Abrangência'] || '').trim().toUpperCase() === 'CR');

  if (!dataRows.length) throw new Error(`${file.name}: nenhum registro CR`);

  // ── Identifica mês predominante ────────────────────────────
  const freqMap = {};
  dataRows.forEach(r => {
    const d = parseDate(r['Data Início']);
    if (d) { const k = mesAnoKey(d); freqMap[k] = (freqMap[k] || 0) + 1; }
  });
  if (!Object.keys(freqMap).length) throw new Error(`${file.name}: sem datas válidas`);
  const mesAno = Object.entries(freqMap).sort((a, b) => b[1] - a[1])[0][0];

  // ── Monta docs (com correção do TDZ: uc declarada ANTES de _alimentadorMap) ─
  const docs           = [];
  const _alimentadorMap = {};

  for (const row of dataRows) {
    const ocorrencia = String(row['Número'] || '').trim();
    if (!ocorrencia) continue;

    const estado    = String(row['Estado'] || '').trim();
    const pe        = String(row['Ponto Elétrico'] || '').trim();
    const equipe    = String(row['Equipe'] || '').trim();
    const dtInicio  = parseDate(row['Data Início']);
    const dtFim     = parseDate(row['Data Fim']);
    const seccional = String(row['Seccional'] || '').trim();
    const municipio = String(row['Município'] || '').trim();
    const causaFinal = limparTexto(String(row['Causa'] || row['Motivo'] || '').trim());

    // Extração de UC: tudo antes de " -" no Ponto Elétrico
    const ucMatch = pe.match(/^(.+?)\s+-\s/);
    const ucRaw   = ucMatch ? ucMatch[1].trim() : pe.split(' -')[0].trim();

    // Ignora equipamentos não-numéricos (TR..., GN..., etc.)
    if (!ucRaw || /[a-zA-Z]/.test(ucRaw)) continue;

    const uc = sanitizeId(ucRaw);
    if (!uc) continue;

    // Alimentador — declarado APÓS uc (evita TDZ)
    const _alimentRaw = String(row['AL'] || row['Al'] || row['Alimentador'] || '').trim();
    const alimentador = (_alimentRaw && !/^[-\s]+$/.test(_alimentRaw) && _alimentRaw.length >= 3)
      ? _alimentRaw : null;
    if (alimentador) _alimentadorMap[uc] = alimentador;

    const finalizado = estado.toUpperCase().includes('FINALIZADA');
    const ativo      = !finalizado && ESTADOS_ATIVOS.some(e => estado.toUpperCase().includes(e));

    docs.push({
      id:             sanitizeId(`${mesAno}_${ocorrencia}`),
      ocorrencia:     sanitizeId(ocorrencia),
      estado,
      ponto_eletrico: pe,
      uc,
      equipe:         equipe || '----',
      dt_inicio:      dtInicio ? dtInicio.toISOString() : null,
      dt_fim:         dtFim   ? dtFim.toISOString()    : null,
      causa:          causaFinal,
      seccional,
      municipio,
      alimentador,          // ← salvo direto em historico_recente
      mes_ano:        mesAno,
      finalizado,
      ativo,
      procedente:     isProcedente(causaFinal)
    });
  }

  if (!docs.length) throw new Error(`${file.name}: nenhum registro válido após filtros`);

  // ── DELETE do mês inteiro antes de inserir (evita conflitos silenciosos) ────
  setStatusRecente(`⏳ Limpando dados de ${mesAno}...`, 'loading');
  const { error: delError } = await db.from('historico_recente').delete().eq('mes_ano', mesAno);
  if (delError) throw new Error(`Erro ao limpar ${mesAno}: ${delError.message}`);

  // ── INSERT em lotes (mais seguro que upsert sem onConflict explícito) ────────
  const BATCH = 500;
  for (let i = 0; i < docs.length; i += BATCH) {
    const lote = docs.slice(i, i + BATCH);
    const { error } = await db.from('historico_recente').insert(lote);
    if (error) throw new Error(`Erro ao inserir registros de ${mesAno}: ${error.message}`);

    const pct = Math.round(((i + lote.length) / docs.length) * 100);
    setStatusRecente(
      `⏳ Salvando ${Math.min(i + lote.length, docs.length)}/${docs.length} registros de ${mesAno}...`,
      'loading', pct
    );
  }

  // ── Verificação: confirma que os dados foram gravados ─────────────────────
  const { count, error: countError } = await db
    .from('historico_recente')
    .select('*', { count: 'exact', head: true })
    .eq('mes_ano', mesAno);

  if (countError) throw new Error(`Erro ao verificar gravação: ${countError.message}`);
  if (!count || count === 0) {
    throw new Error(
      `Os dados foram enviados mas não foram gravados no banco. ` +
      `Verifique as políticas de acesso (RLS) da tabela historico_recente no Supabase.`
    );
  }
  console.log(`✅ ${mesAno}: ${count} registros confirmados no banco.`);

  // ── Meta (delete + insert para evitar problema de unique constraint) ─────
  await db.from('historico_recente_meta').delete().eq('mes_ano', mesAno);
  const { error: metaError } = await db.from('historico_recente_meta').insert({
    mes_ano:         mesAno,
    arquivo:         file.name,
    total_registros: count,
    atualizado_em:   new Date().toISOString()
  });
  if (metaError) console.warn(`Aviso meta (${mesAno}): ${metaError.message}`);

  // ── Rastrear alimentador em background (não bloqueia o retorno) ──────────
  const _regCfg = typeof getRegional === 'function' ? getRegional() : null;
  if (_regCfg?.features?.alimentador) {
    rastrearAlimentador(docs, mesAno, _alimentadorMap).catch(e =>
      console.warn('rastrearAlimentador:', e.message)
    );
  }

  return { mesAno, total: count };
}

async function processarArquivosRecentes(files) {
  await requestWakeLock();
  setStatusRecente('⏳ Iniciando...', 'loading');
  try {
    setStatusRecente('⏳ Verificando janela de meses...', 'loading');
    await limparMesesAntigos();

    const resultados = [];
    for (let i = 0; i < files.length; i++) {
      const r = await processarPlanilhaRecente(files[i], i, files.length);
      resultados.push(r);
    }

    const resumo = resultados.map(r => `${r.mesAno} (${r.total} reg.)`).join(', ');
    releaseWakeLock();
    setStatusRecente(`✅ Concluído! ${resumo}`, 'success');
    setTimeout(() => setStatusRecente('', ''), 6000);
    if (window.atualizarStatusBases) window.atualizarStatusBases();

  } catch (err) {
    console.error(err);
    releaseWakeLock();
    setStatusRecente(`❌ Erro: ${err.message}`, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const fi = document.getElementById('file-recente');
  if (!fi) return;
  fi.addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    await processarArquivosRecentes(files);
    e.target.value = '';
  });
});
