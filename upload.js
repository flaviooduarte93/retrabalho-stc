// js/upload.js
// Lida com o upload e processamento dos dois tipos de arquivo Excel

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
    const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2}:\d{2})?/);
    if (m1) return new Date(`${m1[3]}-${m1[2]}-${m1[1]}T${m1[4] || '00:00:00'}`);
    const d2 = new Date(s);
    return isNaN(d2) ? null : d2;
  }
  return null;
}


// Limpa texto com encoding corrompido para exibição
// Ex: INSTALAC?O → INSTALAÇÃO, MEDIÇ?O → MEDIÇÃO
function sanitizeId(s) {
  // Firestore não aceita '/' em IDs de documento — substitui por '_'
  return String(s || '----').replace(/\//g, '_').replace(/\s+/g, '_').trim() || '----';
}

function limparTexto(s) {
  if (!s) return s;
  return String(s)
    .replace(/C\?O/gi,  'ÇÃO')
    .replace(/\?AO/gi,  'ÃO')
    .replace(/C\?O/gi,  'ÇÃO')
    .replace(/\?o/gi,   'ão')
    .replace(/\?A/gi,   'Ã')
    .replace(/\?a/gi,   'ã')
    .replace(/\?E/gi,   'Ê')
    .replace(/\?e/gi,   'ê')
    .replace(/\?I/gi,   'Í')
    .replace(/\?i/gi,   'í')
    .replace(/\?U/gi,   'Ú')
    .replace(/\?u/gi,   'ú')
    .replace(/\?C/gi,   'Ç')
    .replace(/\?c/gi,   'ç')
    .replace(/C\?/gi,   'Ç')
    .replace(/\?/g,     'Ã')   // fallback: ? isolado vira Ã
    .trim();
}

function setStatus(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'upload-status ' + (type || '');
}

async function deleteCollection(colName) {
  const BATCH_SIZE = 400;
  let snap = await db.collection(colName).limit(500).get();
  let toDelete = snap.docs.map(d => d.ref);
  while (toDelete.length) {
    const batch = db.batch();
    toDelete.splice(0, BATCH_SIZE).forEach(ref => batch.delete(ref));
    await batch.commit();
    const next = await db.collection(colName).limit(500).get();
    toDelete = next.docs.map(d => d.ref);
  }
}

// ============================================================
// BASE HISTÓRICA (Composição do Balde)
//
// Estrutura do arquivo: cada linha representa um PAR de atendimentos
//   OS_ORIGEM → OS  (o OS_ORIGEM gerou o retrabalho OS)
//
// Colunas:
//   OS_ORIGEM, PREFIXO_ORIGEM, TIPO_CONCLUSAO_ORIGEM
//   DATA_ORIGEM_1º ATEND., DATA_CONCLUSAO_1º ATEND.   ← dados do OS_ORIGEM
//   OS, PREFIXO, DATA_ORIGEM, OCO_DATA_CONCLUSAO       ← dados do OS (retrabalho)
//
// Quando uma UC tem 3 atendimentos (827→105929→149372):
//   Linha 1: OS_ORIGEM=827,    OS=105929
//   Linha 2: OS_ORIGEM=105929, OS=149372
//   → 105929 aparece duas vezes: como OS (linha1) e como OS_ORIGEM (linha2)
//   → Usar os dados de quando é OS_ORIGEM (linha2) para preencher 105929,
//     pois nessa linha as colunas DATA_ORIGEM_1º ATEND. têm as datas corretas dele.
// ============================================================

async function processHistorico(file) {
  setStatus('status-historico', '⏳ Lendo arquivo...', 'loading');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (!rows.length) { setStatus('status-historico', '❌ Arquivo vazio ou inválido.', 'error'); return; }
  if (!('UC' in rows[0]) || !('OS' in rows[0])) {
    setStatus('status-historico', '❌ Estrutura inválida. Verifique o arquivo.', 'error');
    return;
  }

  setStatus('status-historico', '⏳ Processando registros...', 'loading');

  // Agrupa por UC
  const byUC = {};
  for (const row of rows) {
    const uc = String(row['UC'] || '').trim();
    if (!uc) continue;
    if (!byUC[uc]) byUC[uc] = [];
    byUC[uc].push(row);
  }

  setStatus('status-historico', `⏳ Salvando ${Object.keys(byUC).length} UCs no Firebase...`, 'loading');

  await deleteCollection('historico');

  const BATCH_SIZE = 400;
  const ucKeys = Object.keys(byUC);
  let idx = 0;

  while (idx < ucKeys.length) {
    const batch = db.batch();
    const slice = ucKeys.slice(idx, idx + BATCH_SIZE);

    for (const uc of slice) {
      const registros = byUC[uc];

      // ----------------------------------------------------------------
      // MAPEAMENTO DA CADEIA DE ATENDIMENTOS
      //
      // Cada linha representa: OS_ORIGEM → OS  (OS_ORIGEM gerou o retrabalho OS)
      //
      // Para cada OS, os dados corretos são:
      //   - OS_ORIGEM: usa DATA_ORIGEM_1º ATEND. / DATA_CONCLUSAO_1º ATEND. /
      //                PREFIXO_ORIGEM / TIPO_CONCLUSAO_ORIGEM da MESMA linha
      //   - OS (último da cadeia, nunca vira OS_ORIGEM): usa DATA_ORIGEM /
      //                OCO_DATA_CONCLUSAO / PREFIXO / TIPO_CONCLUSAO_ORIGEM da mesma linha
      //
      // Exemplo: 88114 → 112 → 124546
      //   Linha 1: OS_ORIGEM=88114 → causa/datas do 88114 em DATA_ORIGEM_1º etc.
      //   Linha 2: OS_ORIGEM=112   → causa/datas do 112 em DATA_ORIGEM_1º etc.
      //            OS=124546       → causa/datas do 124546 em DATA_ORIGEM etc.
      // ----------------------------------------------------------------

      // Conjunto de OS que aparecem como OS_ORIGEM (não são o último da cadeia)
      const osQueEhOrigem = new Set(
        registros.map(r => String(r['OS_ORIGEM'] || '').trim()).filter(Boolean)
      );

      const osMap = {};

      for (const r of registros) {
        const osAtual  = String(r['OS'] || '').trim();
        const osOrigem = String(r['OS_ORIGEM'] || '').trim();

        // OS_ORIGEM desta linha: usa colunas 1º ATEND. e PREFIXO_ORIGEM
        // TIPO_CONCLUSAO_ORIGEM desta linha = causa do OS_ORIGEM
        if (osOrigem) {
          osMap[osOrigem] = {
            os:         osOrigem,
            dataOrigem: parseDate(r['DATA_ORIGEM_1º ATEND.'])?.toISOString() || null,
            dataConc:   parseDate(r['DATA_CONCLUSAO_1º ATEND.'])?.toISOString() || null,
            prefixo:    String(r['PREFIXO_ORIGEM'] || '') || '----',
            causa:      String(r['TIPO_CONCLUSAO_ORIGEM'] || '') || '----',
          };
        }

        // OS atual = último da cadeia (nunca aparece como OS_ORIGEM em outra linha)
        // Usa DATA_ORIGEM / OCO_DATA_CONCLUSAO / PREFIXO
        // Causa: coluna TIPO_CONCLUSAO (própria causa do último atendimento).
        // Fallback para TIPO_CONCLUSAO_ORIGEM caso a coluna não exista na base.
        if (osAtual && !osQueEhOrigem.has(osAtual)) {
          const causaFinal = limparTexto(String(r['TIPO_CONCLUSAO'] || r['TIPO_CONCLUSAO_ORIGEM'] || '')) || '----';
          osMap[osAtual] = {
            os:         osAtual,
            dataOrigem: parseDate(r['DATA_ORIGEM'])?.toISOString() || null,
            dataConc:   parseDate(r['OCO_DATA_CONCLUSAO'])?.toISOString() || null,
            prefixo:    String(r['PREFIXO'] || '') || '----',
            causa:      causaFinal,
          };
        }
      }

      // Ordena cronologicamente
      const historicoList = Object.values(osMap)
        .sort((a, b) => (a.dataOrigem || '') > (b.dataOrigem || '') ? 1 : -1);

      const qtdAtendimentos = historicoList.length;

      // Último atendimento = maior dataOrigem
      const ultimoAtend = [...historicoList]
        .sort((a, b) => (b.dataOrigem || '') > (a.dataOrigem || '') ? 1 : -1)[0] || {};

      const docData = {
        uc,
        ultimaOS:       ultimoAtend.os        || '----',
        dataOrigem:     ultimoAtend.dataOrigem || null,
        dataConc:       ultimoAtend.dataConc   || null,
        prefixo:        ultimoAtend.prefixo    || '----',
        causa:          ultimoAtend.causa      || '----',
        qtdAtendimentos,
        historico: historicoList
      };

      batch.set(db.collection('historico').doc(sanitizeId(uc)), docData);
    }

    await batch.commit();
    idx += BATCH_SIZE;
    setStatus('status-historico', `⏳ Salvando... ${Math.min(idx, ucKeys.length)}/${ucKeys.length}`, 'loading');
  }

  setStatus('status-historico', `✅ ${ucKeys.length} UCs salvas com sucesso!`, 'success');
}

// ============================================================
// BASE VISUALIZAÇÃO ATUAL (Decômetro)
// Filtro: somente Abrangência == "CR"
// ============================================================

async function processAtual(file) {
  setStatus('status-atual', '⏳ Lendo arquivo...', 'loading');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    if (allRows[i].some(c => String(c).trim() === 'Número')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    setStatus('status-atual', '❌ Cabeçalho não encontrado.', 'error'); return;
  }

  const headers = allRows[headerIdx].map(h => String(h).trim());
  let rows = allRows.slice(headerIdx + 1)
    .filter(r => r.some(c => c !== ''))
    .map(r => { const o = {}; headers.forEach((h, i) => { o[h] = r[i] ?? ''; }); return o; })
    .filter(r => String(r['Abrangência'] || '').trim().toUpperCase() === 'CR');

  if (!rows.length) {
    setStatus('status-atual', '❌ Nenhum registro CR encontrado.', 'error'); return;
  }

  setStatus('status-atual', `⏳ ${rows.length} registros — consultando histórico...`, 'loading');

  // Mês atual
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const uploadTs = hoje.toISOString(); // timestamp deste upload

  // Meses válidos para janela deslizante
  const mesesValidos = new Set([mesAtual]);
  for (let i = 1; i <= 3; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    mesesValidos.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  // Busca histórico SOMENTE das UCs presentes no arquivo (lotes de 30)
  const ucsNoArquivo = new Set();
  for (const row of rows) {
    const pe = String(row['Ponto Elétrico'] || '').trim();
    const m  = pe.match(/^(.+?)\s+-\s/);
    ucsNoArquivo.add(sanitizeId(m ? m[1].trim() : pe.split(' -')[0].trim()));
  }
  const ucsArr = [...ucsNoArquivo];
  const historicoMap = {};
  const chunks30 = [];
  for (let i = 0; i < ucsArr.length; i += 30) chunks30.push(ucsArr.slice(i, i+30));
  await Promise.all(chunks30.map(async chunk => {
    const snap = await db.collection('historico').where('__name__', 'in', chunk).get();
    snap.forEach(doc => { historicoMap[doc.id] = doc.data(); });
  }));

  setStatus('status-atual', '⏳ Processando e salvando...', 'loading');

  // Processa linhas e monta docs
  const docsRecente   = [];
  const docsAtivas    = [];
  const histUpdates   = {};

  for (const row of rows) {
    const ocorrencia = String(row['Número']        || '').trim();
    const estado     = String(row['Estado']         || '').trim();
    const pe         = String(row['Ponto Elétrico'] || '').trim();
    const equipe     = String(row['Equipe']         || '').trim();
    const dtInicio   = parseDate(row['Data Início']);
    const dtFim      = parseDate(row['Data Fim']);
    const seccional  = String(row['Seccional']      || '').trim();
    const municipio  = String(row['Município']       || '').trim();
    const motivo     = String(row['Motivo']         || '').trim();
    const causa      = String(row['Causa']          || '').trim();

    const m  = pe.match(/^(.+?)\s+-\s/);
    const uc = sanitizeId(m ? m[1].trim() : pe.split(' -')[0].trim());

    const causaFinal  = limparTexto(causa || motivo);
    const procedente  = isProcedente(causaFinal);
    const finalizado  = estado.toUpperCase().includes('FINALIZADA');
    const emHistorico = !!historicoMap[uc];

    const base = {
      ocorrencia, estado, pontoEletrico: pe, uc,
      equipe:   equipe   || '----',
      dtInicio: dtInicio ? dtInicio.toISOString() : null,
      dtFim:    dtFim    ? dtFim.toISOString()    : null,
      causa: causaFinal, seccional, municipio,
      mesAno: mesAtual, procedente, uploadTs
    };

    // Grava no historico_recente (set sobrescreve — sem deleção prévia)
    if (ocorrencia) {
      docsRecente.push({
        id: sanitizeId(`${mesAtual}_${ocorrencia}`),
        ...base,
        finalizado,
        ativo: !finalizado
      });
    }

    if (finalizado) {
      // Coleta update do histórico para aplicar em batch depois
      if (emHistorico && dtInicio) {
        const dtOrigHist = historicoMap[uc].dataOrigem ? new Date(historicoMap[uc].dataOrigem) : null;
        if (!dtOrigHist || dtInicio >= dtOrigHist) {
          histUpdates[uc] = {
            ultimaOS:   ocorrencia,
            dataOrigem: dtInicio.toISOString(),
            dataConc:   dtFim ? dtFim.toISOString() : null,
            prefixo:    equipe || '----',
            causa:      causaFinal || '----',
          };
          historicoMap[uc].dataOrigem = dtInicio.toISOString();
        }
      }
    } else if (ocorrencia) {
      docsAtivas.push({
        ...base,
        emHistorico,
        qtdAtendimentos: emHistorico ? (historicoMap[uc].qtdAtendimentos || 1) : 0,
        dataConc:        emHistorico ? (historicoMap[uc].dataConc || null)     : null,
        causaHistorico:  emHistorico ? (historicoMap[uc].causa    || '----')   : '----',
      });
    }
  }

  // Grava historico_recente e histórico em paralelo (set sobrescreve, sem deletar)
  setStatus('status-atual', `⏳ Gravando ${docsRecente.length} registros...`, 'loading');

  async function gravarBatch(colecao, docs, idFn) {
    for (let i = 0; i < docs.length; i += 400) {
      const b = db.batch();
      docs.slice(i, i+400).forEach(doc => {
        const { id, ...d } = doc;
        b.set(db.collection(colecao).doc(sanitizeId(idFn ? idFn(doc) : id)), d);
      });
      await b.commit();
    }
  }

  async function gravarHistUpdates() {
    const entries = Object.entries(histUpdates);
    for (let i = 0; i < entries.length; i += 400) {
      const b = db.batch();
      entries.slice(i, i+400).forEach(([uc, upd]) =>
        b.update(db.collection('historico').doc(sanitizeId(uc)), upd)
      );
      await b.commit();
    }
  }

  // Grava recente + hist em paralelo
  await Promise.all([
    gravarBatch('historico_recente', docsRecente, d => d.id),
    gravarHistUpdates(),
  ]);

  // Substitui visao_atual:
  // 1. Grava novos docs (rápido — set sobrescreve os existentes)
  // 2. Apaga docs que não vieram neste upload (IDs não presentes no novo conjunto)
  setStatus('status-atual', '⏳ Atualizando ocorrências ativas...', 'loading');

  const idsNovos = new Set(docsAtivas.map(d => sanitizeId(d.ocorrencia)));

  // Grava novos em paralelo com busca dos antigos
  const [, snapVisaoAtual] = await Promise.all([
    gravarBatch('visao_atual', docsAtivas, d => d.ocorrencia),
    db.collection('visao_atual').get()
  ]);

  // Apaga apenas os que não estão no novo upload
  const parasApagar = snapVisaoAtual.docs.filter(d => !idsNovos.has(d.id));
  for (let i = 0; i < parasApagar.length; i += 400) {
    const b = db.batch();
    parasApagar.slice(i, i+400).forEach(d => b.delete(d.ref));
    await b.commit();
  }

  // Remove meses expirados da janela (assíncrono, não bloqueia o feedback)
  (async () => {
    const snapMeta = await db.collection('historico_recente_meta').get();
    for (const doc of snapMeta.docs) {
      if (!mesesValidos.has(doc.id)) {
        let snap = await db.collection('historico_recente')
          .where('mesAno', '==', doc.id).limit(500).get();
        while (snap.size > 0) {
          const b = db.batch(); snap.docs.forEach(d => b.delete(d.ref)); await b.commit();
          snap = await db.collection('historico_recente').where('mesAno','==',doc.id).limit(500).get();
        }
        await db.collection('historico_recente_meta').doc(doc.id).delete();
      }
    }
  })();

  // Meta
  await db.collection('historico_recente_meta').doc(mesAtual).set({
    mesAno: mesAtual, arquivo: file.name,
    totalRegistros: rows.length,
    totalAtivas: docsAtivas.length,
    totalFinalizadas: docsRecente.length - docsAtivas.length,
    atualizadoEm: uploadTs
  });

  setStatus('status-atual',
    `✅ ${docsAtivas.length} ativas + ${docsRecente.length - docsAtivas.length} finalizadas!`,
    'success');
}


// ============================================================
// BIND DOS INPUTS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const fileHistorico = document.getElementById('file-historico');
  const fileAtual     = document.getElementById('file-atual');

  if (fileHistorico) {
    fileHistorico.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try { await processHistorico(file); }
      catch(err) { console.error(err); setStatus('status-historico', '❌ Erro: ' + err.message, 'error'); }
      e.target.value = '';
    });
  }

  if (fileAtual) {
    fileAtual.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try { await processAtual(file); }
      catch(err) { console.error(err); setStatus('status-atual', '❌ Erro: ' + err.message, 'error'); }
      e.target.value = '';
    });
  }
});
