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
      // PASSO 1: Monta mapa de atendimentos com desduplicação encadeada
      //
      // Para cada OS que aparece como OS_ORIGEM em alguma linha,
      // usamos os dados DESSA linha (colunas DATA_ORIGEM_1º ATEND. etc.)
      // porque elas representam com precisão as datas daquele atendimento.
      //
      // Para o último OS (nunca aparece como OS_ORIGEM), usamos as colunas
      // DATA_ORIGEM / OCO_DATA_CONCLUSAO / PREFIXO da própria linha.
      // ----------------------------------------------------------------

      // Conjunto de todas as OS que aparecem como OS_ORIGEM (atendimentos intermediários/primeiros)
      const osQueEhOrigem = new Set(registros.map(r => String(r['OS_ORIGEM'] || '').trim()).filter(Boolean));

      const osMap = {}; // chave: número da OS, valor: dados do atendimento

      for (const r of registros) {
        const osAtual  = String(r['OS'] || '').trim();
        const osOrigem = String(r['OS_ORIGEM'] || '').trim();

        // --- Registra o OS_ORIGEM (1º ou intermediário) ---
        // Sempre sobrescreve com dados desta linha, pois as colunas
        // DATA_ORIGEM_1º ATEND. / DATA_CONCLUSAO_1º ATEND. são as mais precisas
        // para este atendimento.
        if (osOrigem) {
          osMap[osOrigem] = {
            os:        osOrigem,
            dataOrigem: parseDate(r['DATA_ORIGEM_1º ATEND.'])?.toISOString() || null,
            dataConc:   parseDate(r['DATA_CONCLUSAO_1º ATEND.'])?.toISOString() || null,
            prefixo:   String(r['PREFIXO_ORIGEM'] || '') || '----',
            causa:     String(r['TIPO_CONCLUSAO_ORIGEM'] || '') || '----',
          };
        }

        // --- Registra o OS atual (último ou intermediário) ---
        // Só registra se esta OS NÃO aparece como OS_ORIGEM em nenhuma outra linha
        // (ou seja, é o atendimento mais recente / final da cadeia)
        // Se ela APARECE como origem em outra linha, os dados dela já foram/serão
        // preenchidos acima com mais precisão.
        if (osAtual && !osQueEhOrigem.has(osAtual)) {
          osMap[osAtual] = {
            os:        osAtual,
            dataOrigem: parseDate(r['DATA_ORIGEM'])?.toISOString() || null,
            dataConc:   parseDate(r['OCO_DATA_CONCLUSAO'])?.toISOString() || null,
            prefixo:   String(r['PREFIXO'] || '') || '----',
            causa:     String(r['TIPO_CONCLUSAO_ORIGEM'] || '') || '----',
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

      batch.set(db.collection('historico').doc(uc), docData);
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

  // Encontra linha de header (contém "Número")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    if (allRows[i].some(c => String(c).trim() === 'Número')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    setStatus('status-atual', '❌ Cabeçalho não encontrado. Verifique o arquivo.', 'error');
    return;
  }

  const headers  = allRows[headerIdx].map(h => String(h).trim());
  const dataRows = allRows.slice(headerIdx + 1);

  let rows = dataRows
    .filter(r => r.some(c => c !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });

  // *** FILTRO: somente Abrangência == "CR" ***
  rows = rows.filter(r => String(r['Abrangência'] || '').trim().toUpperCase() === 'CR');

  if (!rows.length) {
    setStatus('status-atual', '❌ Nenhum registro com Abrangência "CR" encontrado.', 'error');
    return;
  }

  setStatus('status-atual', `⏳ Processando ${rows.length} registros CR...`, 'loading');

  // Busca base histórica para merge
  const historicoSnap = await db.collection('historico').get();
  const historicoMap = {};
  historicoSnap.forEach(doc => { historicoMap[doc.id] = doc.data(); });

  await deleteCollection('visao_atual');

  const BATCH_SIZE = 400;
  let idx = 0;

  while (idx < rows.length) {
    const batch = db.batch();
    const slice = rows.slice(idx, idx + BATCH_SIZE);

    for (const row of slice) {
      const ocorrencia    = String(row['Número'] || '').trim();
      const estado        = String(row['Estado'] || '').trim();
      const pontoEletrico = String(row['Ponto Elétrico'] || '').trim();
      const equipe        = String(row['Equipe'] || '').trim();
      const dtInicio      = parseDate(row['Data Início']);
      const dtFim         = parseDate(row['Data Fim']);
      const seccional     = String(row['Seccional'] || '').trim();
      const municipio     = String(row['Município'] || '').trim();
      const motivo        = String(row['Motivo'] || '').trim();
      const causa         = String(row['Causa'] || '').trim();

      // Extrai UC: tudo antes do " - "
      const ucMatch = pontoEletrico.match(/^(.+?)\s+-\s/);
      const uc = ucMatch ? ucMatch[1].trim() : pontoEletrico.split(' -')[0].trim();

      const emHistorico = !!historicoMap[uc];

      // Se FINALIZADA: atualiza histórico se mais recente e não entra nos alertas
      if (estado === 'F-FINALIZADA') {
        if (emHistorico && dtInicio) {
          const dtOrigHist = historicoMap[uc].dataOrigem ? new Date(historicoMap[uc].dataOrigem) : null;
          if (!dtOrigHist || dtInicio >= dtOrigHist) {
            await db.collection('historico').doc(uc).update({
              ultimaOS:   ocorrencia,
              dataOrigem: dtInicio ? dtInicio.toISOString() : null,
              dataConc:   dtFim    ? dtFim.toISOString()    : null,
              prefixo:    equipe   || '----',
              causa:      causa || motivo || '----',
            });
          }
        }
        continue;
      }

      if (!ocorrencia) continue;

      batch.set(db.collection('visao_atual').doc(ocorrencia), {
        ocorrencia,
        estado,
        pontoEletrico,
        uc,
        equipe:          equipe   || '----',
        dtInicio:        dtInicio ? dtInicio.toISOString() : null,
        dtFim:           dtFim    ? dtFim.toISOString()    : null,
        seccional, municipio, motivo, causa,
        emHistorico,
        qtdAtendimentos: emHistorico ? (historicoMap[uc].qtdAtendimentos || 1) : 0,
        dataConc:        emHistorico ? (historicoMap[uc].dataConc || null)     : null,
        causaHistorico:  emHistorico ? (historicoMap[uc].causa    || '----')   : '----',
      });
    }

    await batch.commit();
    idx += BATCH_SIZE;
    setStatus('status-atual', `⏳ Salvando... ${Math.min(idx, rows.length)}/${rows.length}`, 'loading');
  }

  setStatus('status-atual', `✅ ${rows.length} ocorrências CR salvas!`, 'success');
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
