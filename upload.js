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
          const causaFinal = String(r['TIPO_CONCLUSAO'] || r['TIPO_CONCLUSAO_ORIGEM'] || '') || '----';
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

  // Identifica o mês atual para gravar no historico_recente
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;

  // Apaga mês atual do historico_recente (será reescrito com dados frescos)
  setStatus('status-atual', '⏳ Atualizando janela do histórico recente...', 'loading');
  const snapMesAtual = await db.collection('historico_recente')
    .where('mesAno', '==', mesAtual).limit(500).get();
  let toDelRec = snapMesAtual.docs.map(d => d.ref);
  while (toDelRec.length) {
    const b = db.batch();
    toDelRec.splice(0, 400).forEach(ref => b.delete(ref));
    await b.commit();
    const nx = await db.collection('historico_recente')
      .where('mesAno', '==', mesAtual).limit(500).get();
    toDelRec = nx.docs.map(d => d.ref);
  }

  // Também limpa meses fora da janela de 3 meses fechados + atual
  const mesesValidos = new Set([mesAtual]);
  for (let i = 1; i <= 3; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    mesesValidos.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const snapMeta = await db.collection('historico_recente_meta').get();
  for (const doc of snapMeta.docs) {
    if (!mesesValidos.has(doc.id)) {
      // Deleta ocorrências desse mês expirado
      let expSnap = await db.collection('historico_recente')
        .where('mesAno', '==', doc.id).limit(500).get();
      let expDocs = expSnap.docs.map(d => d.ref);
      while (expDocs.length) {
        const b = db.batch(); expDocs.splice(0,400).forEach(r=>b.delete(r)); await b.commit();
        expSnap = await db.collection('historico_recente').where('mesAno','==',doc.id).limit(500).get();
        expDocs = expSnap.docs.map(d=>d.ref);
      }
      await db.collection('historico_recente_meta').doc(doc.id).delete();
    }
  }

  await deleteCollection('visao_atual');

  const BATCH_SIZE = 400;
  let idx = 0;
  let totalAtivas = 0, totalFinalizadas = 0;

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

      const emHistorico  = !!historicoMap[uc];
      const causaFinal   = causa || motivo;
      const procedente   = isProcedente(causaFinal);
      const finalizado   = estado.toUpperCase().includes('FINALIZADA');

      // ── F-FINALIZADA: entra no historico_recente (mês atual) + atualiza base histórica ──
      if (finalizado) {
        totalFinalizadas++;

        // Grava no historico_recente como registro do mês atual
        // (substitui meses fechados conforme a janela anda)
        if (ocorrencia) {
          const recRef = db.collection('historico_recente').doc(`${mesAtual}_${ocorrencia}`);
          batch.set(recRef, {
            ocorrencia, estado, pontoEletrico, uc,
            equipe:    equipe    || '----',
            dtInicio:  dtInicio  ? dtInicio.toISOString()  : null,
            dtFim:     dtFim     ? dtFim.toISOString()     : null,
            causa: causaFinal, seccional, municipio,
            mesAno: mesAtual, finalizado: true, ativo: false, procedente
          });
        }

        // Atualiza base histórica se for mais recente
        if (emHistorico && dtInicio) {
          const dtOrigHist = historicoMap[uc].dataOrigem
            ? new Date(historicoMap[uc].dataOrigem) : null;
          if (!dtOrigHist || dtInicio >= dtOrigHist) {
            await db.collection('historico').doc(uc).update({
              ultimaOS:   ocorrencia,
              dataOrigem: dtInicio ? dtInicio.toISOString() : null,
              dataConc:   dtFim    ? dtFim.toISOString()    : null,
              prefixo:    equipe   || '----',
              causa:      causaFinal || '----',
            });
          }
        }
        continue;
      }

      // ── OCORRÊNCIAS ATIVAS: entram na visao_atual ──
      if (!ocorrencia) continue;
      totalAtivas++;

      // Também grava ocorrências ativas no historico_recente do mês atual
      // para análise de possível retrabalho em tempo real
      const recRefAtiva = db.collection('historico_recente').doc(`${mesAtual}_${ocorrencia}`);
      batch.set(recRefAtiva, {
        ocorrencia, estado, pontoEletrico, uc,
        equipe:   equipe   || '----',
        dtInicio: dtInicio ? dtInicio.toISOString() : null,
        dtFim:    dtFim    ? dtFim.toISOString()    : null,
        causa: causaFinal, seccional, municipio,
        mesAno: mesAtual, finalizado: false, ativo: true, procedente
      });

      batch.set(db.collection('visao_atual').doc(ocorrencia), {
        ocorrencia, estado, pontoEletrico, uc,
        equipe:          equipe   || '----',
        dtInicio:        dtInicio ? dtInicio.toISOString() : null,
        dtFim:           dtFim    ? dtFim.toISOString()    : null,
        seccional, municipio, motivo, causa: causaFinal,
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

  // Atualiza meta do mês atual no historico_recente
  await db.collection('historico_recente_meta').doc(mesAtual).set({
    mesAno:          mesAtual,
    arquivo:         file.name,
    totalRegistros:  rows.length,
    totalAtivas,
    totalFinalizadas,
    atualizadoEm:    new Date().toISOString()
  });

  setStatus('status-atual',
    `✅ ${totalAtivas} ocorrências ativas + ${totalFinalizadas} finalizadas processadas para ${mesAtual}!`,
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
