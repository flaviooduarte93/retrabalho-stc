// js/upload-recente.js
// Upload das planilhas de histórico recente (últimos 3 meses + mês atual)
// Lógica: janela deslizante — mantém mês atual + 3 meses fechados anteriores
//         ao subir nova planilha, deleta automaticamente meses fora da janela

// ===== HELPERS =====
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
    if (m1) return new Date(`${m1[3]}-${m1[2]}-${m1[1]}T${m1[4]||'00:00:00'}`);
    const d2 = new Date(s);
    return isNaN(d2) ? null : d2;
  }
  return null;
}

function mesAnoKey(date) {
  // Retorna string "YYYY-MM" para identificar o mês
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function setStatusRecente(msg, type) {
  const el = document.getElementById('status-recente');
  if (!el) return;
  el.textContent = msg;
  el.className = 'upload-status ' + (type||'');
}

const ESTADOS_ATIVOS = ['E-PREPARAÇÃO','T-TRABALHANDO','A-EM DESLOCAMENTO','B-ATRIB. MULTIPLA'];
function isAtivo(estado) {
  return ESTADOS_ATIVOS.some(e => (estado||'').toUpperCase().includes(e.toUpperCase().replace('E-','').replace('T-','').replace('A-','').replace('B-','')))
    || ESTADOS_ATIVOS.some(e => (estado||'').toUpperCase() === e.toUpperCase());
}

// ===== JANELA DESLIZANTE: apaga meses fora dos últimos 3 fechados + atual =====
async function limparMesesAntigos() {
  const hoje = new Date();
  const mesAtual = mesAnoKey(hoje);

  const mesesValidos = new Set([mesAtual]);
  for (let i = 1; i <= 3; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    mesesValidos.add(mesAnoKey(d));
  }

  const snap = await db.collection('historico_recente_meta').get();
  const mesesExpirados = snap.docs.map(d => d.id).filter(id => !mesesValidos.has(id));

  // Deleta meses expirados em paralelo
  await Promise.all(mesesExpirados.map(async mes => {
    const ocSnap = await db.collection('historico_recente').where('mesAno', '==', mes).get();
    if (!ocSnap.empty) {
      const ps = [], refs = ocSnap.docs.map(d => d.ref);
      for (let i = 0; i < refs.length; i += 400) {
        const b = db.batch();
        refs.slice(i, i+400).forEach(r => b.delete(r));
        ps.push(b.commit());
      }
      await Promise.all(ps);
    }
    await db.collection('historico_recente_meta').doc(mes).delete();
  }));

  return mesesValidos;
}

// ===== PROCESSA UMA PLANILHA =====
async function processarPlanilhaRecente(file, fileIndex, totalFiles) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Acha header
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    if (allRows[i].some(c => String(c).trim() === 'Número')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error(`Arquivo ${file.name}: cabeçalho não encontrado`);

  const headers  = allRows[headerIdx].map(h => String(h).trim());
  const dataRows = allRows.slice(headerIdx + 1)
    .filter(r => r.some(c => c !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    })
    .filter(r => String(r['Abrangência']||'').trim().toUpperCase() === 'CR');

  if (!dataRows.length) throw new Error(`Arquivo ${file.name}: nenhum registro CR`);

  // Identifica o mês predominante das datas do arquivo
  const datas = dataRows
    .map(r => parseDate(r['Data Início']))
    .filter(Boolean);
  if (!datas.length) throw new Error(`Arquivo ${file.name}: sem datas válidas`);

  // Mês mais frequente
  const freqMap = {};
  datas.forEach(d => {
    const k = mesAnoKey(d);
    freqMap[k] = (freqMap[k]||0) + 1;
  });
  const mesAno = Object.entries(freqMap).sort((a,b) => b[1]-a[1])[0][0];

  // Se é o mês atual, apaga antes de reinserir
  const hoje = new Date();
  const mesAtual = mesAnoKey(hoje);
  if (mesAno === mesAtual) {
    // Apaga mês atual de uma vez com batches paralelos
    const existing = await db.collection('historico_recente')
      .where('mesAno', '==', mesAno).get();
    if (!existing.empty) {
      const ps = [];
      const refs = existing.docs.map(d => d.ref);
      for (let i = 0; i < refs.length; i += 400) {
        const b = db.batch();
        refs.slice(i, i+400).forEach(ref => b.delete(ref));
        ps.push(b.commit());
      }
      await Promise.all(ps);
    }
  }

  // Salva ocorrências em batch
  const BATCH_SIZE = 400;
  let idx = 0;
  while (idx < dataRows.length) {
    const batch = db.batch();
    const slice = dataRows.slice(idx, idx + BATCH_SIZE);
    for (const row of slice) {
      const ocorrencia = String(row['Número']||'').trim();
      if (!ocorrencia) continue;
      const estado     = String(row['Estado']||'').trim();
      const pontoEl    = String(row['Ponto Elétrico']||'').trim();
      const equipe     = String(row['Equipe']||'').trim();
      const dtInicio   = parseDate(row['Data Início']);
      const dtFim      = parseDate(row['Data Fim']);
      const causa      = String(row['Causa']||'').trim();
      const motivo     = String(row['Motivo']||'').trim();
      const seccional  = String(row['Seccional']||'').trim();
      const municipio  = String(row['Município']||'').trim();

      const ucMatch = pontoEl.match(/^(.+?)\s+-\s/);
      const uc = ucMatch ? ucMatch[1].trim() : pontoEl.split(' -')[0].trim();

      const finalizado = estado.toUpperCase().includes('FINALIZADA');
      const ativo      = !finalizado && ESTADOS_ATIVOS.some(e =>
        estado.toUpperCase().includes(e.replace(/^[A-Z]-/,'').toUpperCase()));
      const causaFinal = limparTexto(causa || motivo);
      const procedente = isProcedente(causaFinal);

      const ref = db.collection('historico_recente').doc(sanitizeId(`${mesAno}_${ocorrencia}`));
      batch.set(ref, {
        ocorrencia, estado, pontoEletrico: pontoEl, uc, equipe,
        dtInicio:  dtInicio ? dtInicio.toISOString() : null,
        dtFim:     dtFim    ? dtFim.toISOString()    : null,
        causa: limparTexto(causaFinal), seccional, municipio,
        mesAno, finalizado, ativo, procedente
      });
    }
    await batch.commit();
    idx += BATCH_SIZE;
  }

  // Salva meta do mês
  await db.collection('historico_recente_meta').doc(mesAno).set({
    mesAno,
    arquivo: file.name,
    totalRegistros: dataRows.length,
    atualizadoEm: new Date().toISOString()
  });

  return { mesAno, total: dataRows.length };
}

// ===== UPLOAD MÚLTIPLO =====
async function processarArquivosRecentes(files) {
  setStatusRecente('⏳ Iniciando...', 'loading');

  try {
    // 1. Limpa meses fora da janela
    setStatusRecente('⏳ Verificando janela de 3 meses...', 'loading');
    await limparMesesAntigos();

    // 2. Processa cada arquivo
    const resultados = [];
    for (let i = 0; i < files.length; i++) {
      setStatusRecente(`⏳ Processando arquivo ${i+1}/${files.length}: ${files[i].name}...`, 'loading');
      const r = await processarPlanilhaRecente(files[i], i, files.length);
      resultados.push(r);
    }

    const resumo = resultados.map(r => `${r.mesAno} (${r.total} reg.)`).join(', ');
    setStatusRecente(`✅ Concluído! Meses salvos: ${resumo}`, 'success');

  } catch(err) {
    console.error(err);
    setStatusRecente(`❌ Erro: ${err.message}`, 'error');
  }
}

// ===== BIND =====
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('file-recente');
  if (!fileInput) return;

  fileInput.addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    await processarArquivosRecentes(files);
    e.target.value = '';
  });
});
