// js/upload-recente.js — Supabase version

function mesAnoKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
function setStatusRecente(msg, type) {
  const el = document.getElementById('status-recente');
  if (!el) return;
  el.textContent = msg;
  el.className = 'upload-status '+(type||'');
}
const ESTADOS_ATIVOS = ['PREPARAÇÃO','TRABALHANDO','DESLOCAMENTO','MULTIPLA'];

async function limparMesesAntigos() {
  const hoje = new Date();
  const mesesValidos = new Set([mesAnoKey(hoje)]);
  for (let i = 1; i <= 3; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth()-i, 1);
    mesesValidos.add(mesAnoKey(d));
  }
  const { data: metas } = await db.from('historico_recente_meta').select('mes_ano');
  const expirados = (metas||[]).map(m=>m.mes_ano).filter(m=>!mesesValidos.has(m));
  for (const mes of expirados) {
    await db.from('historico_recente').delete().eq('mes_ano', mes);
    await db.from('historico_recente_meta').delete().eq('mes_ano', mes);
  }
  return mesesValidos;
}

async function processarPlanilhaRecente(file, idx, total) {
  setStatusRecente(`⏳ Lendo arquivo ${idx+1}/${total}...`, 'loading');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data);
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, allRows.length); i++) {
    if (allRows[i].some(c => String(c).trim() === 'Número')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error(`${file.name}: cabeçalho não encontrado`);

  const headers = allRows[headerIdx].map(h => String(h).trim());
  const dataRows = allRows.slice(headerIdx+1)
    .filter(r => r.some(c => c !== ''))
    .map(r => { const o={}; headers.forEach((h,i)=>{ o[h]=r[i]??''; }); return o; })
    .filter(r => String(r['Abrangência']||'').trim().toUpperCase() === 'CR');

  if (!dataRows.length) throw new Error(`${file.name}: nenhum registro CR`);

  // Identifica mês do arquivo
  const freqMap = {};
  dataRows.forEach(r => {
    const d = parseDate(r['Data Início']);
    if (d) { const k = mesAnoKey(d); freqMap[k] = (freqMap[k]||0)+1; }
  });
  if (!Object.keys(freqMap).length) throw new Error(`${file.name}: sem datas válidas`);
  const mesAno = Object.entries(freqMap).sort((a,b)=>b[1]-a[1])[0][0];

  // Se mês atual, apaga antes
  const mesAtual = mesAnoKey(new Date());
  if (mesAno === mesAtual) {
    setStatusRecente(`⏳ Limpando mês atual...`, 'loading');
    await db.from('historico_recente').delete().eq('mes_ano', mesAno);
  }

  // Prepara e insere em lotes
  setStatusRecente(`⏳ Salvando ${dataRows.length} registros de ${mesAno}...`, 'loading');
  const docs = dataRows.map(row => {
    const ocorrencia = String(row['Número']||'').trim();
    const estado     = String(row['Estado']||'').trim();
    const pe         = String(row['Ponto Elétrico']||'').trim();
    const equipe     = String(row['Equipe']||'').trim();
    const dtInicio   = parseDate(row['Data Início']);
    const dtFim      = parseDate(row['Data Fim']);
    const seccional  = String(row['Seccional']||'').trim();
    const municipio  = String(row['Município']||'').trim();
    const causaFinal = limparTexto(String(row['Causa']||row['Motivo']||'').trim());
    const ucMatch    = pe.match(/^(.+?)\s+-\s/);
    const ucRaw      = ucMatch ? ucMatch[1].trim() : pe.split(' -')[0].trim();
    if (/[a-zA-Z]/.test(ucRaw)) continue; // ignora equipamentos não-numéricos
    const uc         = sanitizeId(ucRaw);
    const finalizado = estado.toUpperCase().includes('FINALIZADA');
    const ativo      = !finalizado && ESTADOS_ATIVOS.some(e => estado.toUpperCase().includes(e));

    return {
      id:             sanitizeId(`${mesAno}_${ocorrencia}`),
      ocorrencia:     sanitizeId(ocorrencia),
      estado, ponto_eletrico: pe, uc,
      equipe:   equipe   ||'----',
      dt_inicio: dtInicio ? dtInicio.toISOString() : null,
      dt_fim:    dtFim    ? dtFim.toISOString()    : null,
      causa: causaFinal, seccional, municipio,
      mes_ano: mesAno, finalizado, ativo,
      procedente: isProcedente(causaFinal)
    };
  }).filter(d => d.ocorrencia && d.ocorrencia !== '----');

  // Upsert em lotes de 800
  for (let i = 0; i < docs.length; i += 800) {
    const { error } = await db.from('historico_recente').upsert(docs.slice(i, i+800));
    if (error) throw new Error(error.message);
  }

  // Meta
  await db.from('historico_recente_meta').upsert({
    mes_ano: mesAno,
    arquivo: file.name,
    total_registros: docs.length,
    atualizado_em: new Date().toISOString()
  });

  return { mesAno, total: docs.length };
}

async function processarArquivosRecentes(files) {
  setStatusRecente('⏳ Iniciando...', 'loading');
  try {
    setStatusRecente('⏳ Verificando janela de meses...', 'loading');
    await limparMesesAntigos();

    const resultados = [];
    for (let i = 0; i < files.length; i++) {
      const r = await processarPlanilhaRecente(files[i], i, files.length);
      resultados.push(r);
    }
    const resumo = resultados.map(r=>`${r.mesAno} (${r.total} reg.)`).join(', ');
    setStatusRecente(`✅ Concluído! ${resumo}`, 'success');
  } catch(err) {
    console.error(err);
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
