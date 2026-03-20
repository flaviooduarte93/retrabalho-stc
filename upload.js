// js/upload.js
// Lida com o upload e processamento dos dois tipos de arquivo Excel

// ============================================================
// HELPERS
// ============================================================

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date((val - 25569) * 86400 * 1000);
    return isNaN(d) ? null : d;
  }
  if (typeof val === 'string') {
    // dd/mm/yyyy hh:mm:ss  or  yyyy-mm-dd...
    const s = val.trim();
    const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2}:\d{2})?/);
    if (m1) return new Date(`${m1[3]}-${m1[2]}-${m1[1]}T${m1[4] || '00:00:00'}`);
    const d2 = new Date(s);
    return isNaN(d2) ? null : d2;
  }
  return null;
}

function fmtDate(d) {
  if (!d) return '';
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function setStatus(elId, msg, type) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className = 'upload-status ' + (type || '');
}

// ============================================================
// BASE HISTÓRICA (Composição do Balde)
// Colunas relevantes: UC, OS, DATA_ORIGEM, OCO_DATA_CONCLUSAO, PREFIXO,
//                     TIPO_CONCLUSAO_ORIGEM, OS_ORIGEM
// ============================================================

async function processHistorico(file) {
  setStatus('status-historico', '⏳ Lendo arquivo...', 'loading');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (!rows.length) {
    setStatus('status-historico', '❌ Arquivo vazio ou inválido.', 'error');
    return;
  }

  // Validação mínima das colunas esperadas
  const r0 = rows[0];
  if (!('UC' in r0) || !('OS' in r0)) {
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

  // Apaga coleção anterior e recria
  // Para não exceder cotas, usa batch writes
  const BATCH_SIZE = 400;

  // 1. Deleta todos os docs da coleção historico
  const snapshot = await db.collection('historico').limit(500).get();
  let toDelete = snapshot.docs.map(d => d.ref);
  while (toDelete.length) {
    const batch = db.batch();
    toDelete.splice(0, BATCH_SIZE).forEach(ref => batch.delete(ref));
    await batch.commit();
    // Verifica se há mais
    const next = await db.collection('historico').limit(500).get();
    toDelete = next.docs.map(d => d.ref);
  }

  // 2. Grava novos docs
  const ucKeys = Object.keys(byUC);
  let idx = 0;
  while (idx < ucKeys.length) {
    const batch = db.batch();
    const slice = ucKeys.slice(idx, idx + BATCH_SIZE);
    for (const uc of slice) {
      const registros = byUC[uc];

      // Conta total de atendimentos (OS únicas na UC)
      const osSet = new Set();
      for (const r of registros) {
        if (r['OS']) osSet.add(String(r['OS']));
        if (r['OS_ORIGEM']) osSet.add(String(r['OS_ORIGEM']));
      }
      const qtdAtendimentos = osSet.size;

      // Último atendimento = maior DATA_ORIGEM
      let ultimoReg = registros[0];
      for (const r of registros) {
        const d1 = parseDate(r['DATA_ORIGEM']);
        const d2 = parseDate(ultimoReg['DATA_ORIGEM']);
        if (d1 && d2 && d1 > d2) ultimoReg = r;
      }

      const dtOrigem = parseDate(ultimoReg['DATA_ORIGEM']);
      const dtConc   = parseDate(ultimoReg['OCO_DATA_CONCLUSAO']);

      const docData = {
        uc,
        ultimaOS:        String(ultimoReg['OS'] || ''),
        dataOrigem:      dtOrigem ? dtOrigem.toISOString() : null,
        dataConc:        dtConc   ? dtConc.toISOString()   : null,
        prefixo:         String(ultimoReg['PREFIXO'] || ''),
        causa:           String(ultimoReg['TIPO_CONCLUSAO_ORIGEM'] || ''),
        qtdAtendimentos,
        historico: registros.map(r => ({
          os:        String(r['OS'] || ''),
          osOrigem:  String(r['OS_ORIGEM'] || ''),
          dataOrigem: parseDate(r['DATA_ORIGEM'])?.toISOString() || null,
          dataConc:   parseDate(r['OCO_DATA_CONCLUSAO'])?.toISOString() || null,
          prefixo:   String(r['PREFIXO'] || ''),
          causa:     String(r['TIPO_CONCLUSAO_ORIGEM'] || ''),
        }))
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
// Header real começa na linha 1 (índice 1 do array), dados a partir da linha 2
// Colunas: Número (ocorrência), Estado (situação), Ponto Elétrico, Equipe, Data Início, Data Fim
// ============================================================

async function processAtual(file) {
  setStatus('status-atual', '⏳ Lendo arquivo...', 'loading');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // O arquivo tem 2 linhas de cabeçalho; a linha 1 (índice 0) é título e linha 2 (índice 1) é o header real
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Encontra a linha de header (contém "Número")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    if (allRows[i].some(c => String(c).trim() === 'Número')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    setStatus('status-atual', '❌ Cabeçalho não encontrado. Verifique o arquivo.', 'error');
    return;
  }

  const headers = allRows[headerIdx].map(h => String(h).trim());
  const dataRows = allRows.slice(headerIdx + 1);

  const rows = dataRows
    .filter(r => r.some(c => c !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });

  if (!rows.length) {
    setStatus('status-atual', '❌ Sem dados no arquivo.', 'error');
    return;
  }

  setStatus('status-atual', `⏳ Processando ${rows.length} registros...`, 'loading');

  // Busca base histórica para merge
  const historicoSnap = await db.collection('historico').get();
  const historicoMap = {};
  historicoSnap.forEach(doc => {
    historicoMap[doc.id] = doc.data();
  });

  // Apaga visao_atual existente
  const BATCH_SIZE = 400;
  const snapAtual = await db.collection('visao_atual').limit(500).get();
  let toDelete = snapAtual.docs.map(d => d.ref);
  while (toDelete.length) {
    const batch = db.batch();
    toDelete.splice(0, BATCH_SIZE).forEach(ref => batch.delete(ref));
    await batch.commit();
    const next = await db.collection('visao_atual').limit(500).get();
    toDelete = next.docs.map(d => d.ref);
  }

  // Processa e salva
  let idx = 0;
  while (idx < rows.length) {
    const batch = db.batch();
    const slice = rows.slice(idx, idx + BATCH_SIZE);

    for (const row of slice) {
      const ocorrencia = String(row['Número'] || '').trim();
      const estado     = String(row['Estado'] || '').trim();
      const pontoEletrico = String(row['Ponto Elétrico'] || '').trim();
      const equipe     = String(row['Equipe'] || '').trim();
      const dtInicio   = parseDate(row['Data Início']);
      const dtFim      = parseDate(row['Data Fim']);
      const seccional  = String(row['Seccional'] || '').trim();
      const municipio  = String(row['Município'] || '').trim();
      const motivo     = String(row['Motivo'] || '').trim();
      const causa      = String(row['Causa'] || '').trim();

      // Extrai UC do Ponto Elétrico (tudo antes do " -")
      const ucMatch = pontoEletrico.match(/^(.+?)\s*-/);
      const uc = ucMatch ? ucMatch[1].trim() : pontoEletrico;

      // Verifica se está no histórico
      const emHistorico = !!historicoMap[uc];

      // Se FINALIZADA e está no histórico, verifica se deve atualizar histórico
      if (estado === 'F-FINALIZADA' && emHistorico && dtInicio) {
        const dtOrigHist = historicoMap[uc].dataOrigem ? new Date(historicoMap[uc].dataOrigem) : null;
        if (dtOrigHist && dtInicio >= dtOrigHist) {
          // Atualiza histórico com esta ocorrência mais recente
          const histRef = db.collection('historico').doc(uc);
          await histRef.update({
            ultimaOS: ocorrencia,
            dataOrigem: dtInicio ? dtInicio.toISOString() : null,
            dataConc: dtFim ? dtFim.toISOString() : null,
            prefixo: equipe,
            causa: causa || motivo,
          });
        }
        // Não adiciona à visao_atual se finalizada
        continue;
      }

      if (!ocorrencia) continue;

      const docRef = db.collection('visao_atual').doc(ocorrencia);
      batch.set(docRef, {
        ocorrencia,
        estado,
        pontoEletrico,
        uc,
        equipe,
        dtInicio: dtInicio ? dtInicio.toISOString() : null,
        dtFim:    dtFim    ? dtFim.toISOString()    : null,
        seccional, municipio, motivo, causa,
        emHistorico,
        qtdAtendimentos: emHistorico ? historicoMap[uc].qtdAtendimentos : 0,
        dataConc: emHistorico ? historicoMap[uc].dataConc : null,
        causaHistorico: emHistorico ? historicoMap[uc].causa : '',
      });
    }

    await batch.commit();
    idx += BATCH_SIZE;
    setStatus('status-atual', `⏳ Salvando... ${Math.min(idx, rows.length)}/${rows.length}`, 'loading');
  }

  setStatus('status-atual', `✅ ${rows.length} ocorrências salvas!`, 'success');
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
