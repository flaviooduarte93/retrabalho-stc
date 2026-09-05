// ============================================================
//  PATCH — envia as ocorrências TF (transformadores) ao painel
//  de Reincidência, na MESMA planilha que o Retrabalho já sobe.
//
//  O upload.js do Retrabalho filtra Abrangência = 'CR' (por UC).
//  O painel de Reincidência precisa de 'TF' (por transformador).
//  São recortes disjuntos da mesma extração — então dá para
//  separar os dois na mesma passada, sem subir o arquivo 2x.
//
//  ┌──────────────────────────────────────────────────────────┐
//  │  IMPORTANTE — DEFINA A REGIONAL DESTA PÁGINA (abaixo)      │
//  │                                                            │
//  │  O Retrabalho tem uma página de Goiânia e outra da         │
//  │  Metropolitana. A regional NÃO é adivinhada pelo conteúdo  │
//  │  da planilha — é definida pela PÁGINA. Por isso, na página │
//  │  de Goiânia use REGIONAL = 'GYN'; na da Metropolitana,     │
//  │  REGIONAL = 'METRO'. Cada página carrega a sua cópia deste │
//  │  arquivo com o valor certo.                                │
//  └──────────────────────────────────────────────────────────┘
//
//  COMO INSTALAR
//  1. Rode add_tempo_real.sql no Supabase do painel (reinc_trafo),
//     se ainda não rodou.
//  2. Copie este arquivo para CADA página do Retrabalho, trocando
//     só a linha REGIONAL abaixo (GYN na de Goiânia, METRO na da
//     Metropolitana). Cole DEPOIS do upload.js.
//  3. Confirme que o SheetJS (XLSX) já está na página (o upload.js
//     usa, então já deve estar).
// ============================================================

(function () {
  'use strict';

  // ⇩⇩⇩ TROQUE AQUI POR PÁGINA: 'GYN' (Goiânia) ou 'METRO' (Metropolitana) ⇩⇩⇩
  const REGIONAL = 'GYN';
  // ⇧⇧⇧ ————————————————————————————————————————————————————————————— ⇧⇧⇧

  // Se a página do Retrabalho já expõe getRegional(), tenta usar como
  // reforço — mas a constante REGIONAL acima sempre tem a palavra final.
  function regionalDaPagina() {
    return (REGIONAL === 'METRO') ? 'METRO' : 'GYN';
  }

  // ---- Cliente do Supabase do PAINEL DE REINCIDÊNCIA (reinc_trafo) ----
  // Mesmo banco para as duas regionais; a separação é pela coluna 'regional'.
  const REINC_URL = 'https://lektklczuglajpdehqov.supabase.co';
  const REINC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3RrbGN6dWdsYWpwZGVocW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzA3MDQsImV4cCI6MjA5NTkwNjcwNH0._VKvOdcaBtkPEF0FjE9yr94O9qoRyS4BQA7Nuvw9uCo';

  let sbReinc = null;
  function getReincClient() {
    if (sbReinc) return sbReinc;
    const lib = window.supabase;
    if (!lib || !lib.createClient) {
      console.warn('[TF→painel] supabase-js não encontrado na página. Envio TF ignorado.');
      return null;
    }
    sbReinc = lib.createClient(REINC_URL, REINC_KEY);
    return sbReinc;
  }

  // ---- Parsing de data do decômetro: "24/07/2026 10:05:25" → Date local ----
  function parseDataTF(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') {
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
  async function enviarTFparaPainel(rowsObj, fileName) {
    const db = getReincClient();
    if (!db) return;
    const regional = regionalDaPagina();

    // Filtro do painel: TF ativa (não finalizada). A regional vem da PÁGINA,
    // não do conteúdo — a página de Goiânia grava GYN, a da Metro grava METRO.
    const tf = rowsObj.filter(r => {
      const ab = txt(r['Abrangência']).toUpperCase();
      const es = txt(r['Estado']).toUpperCase();
      return ab === 'TF' && es && !es.startsWith('F-');
    });

    console.log(`[TF→painel/${regional}] ${tf.length} ocorrências TF ativas na planilha.`);
    if (!tf.length) {
      // Sem TF ativa: zera SÓ a regional desta página (não toca na outra).
      try {
        await db.from('tempo_real_ocorrencias').delete().eq('regional', regional);
      } catch (e) {}
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
        regional:      regional,   // ← carimbo da PÁGINA
      };
    }).filter(x => x.oe && x.trafo);

    try {
      // A extração é um retrato do momento: apaga só a regional desta página
      // e insere a atual. A outra regional fica intacta.
      await db.from('tempo_real_ocorrencias').delete().eq('regional', regional);

      let salvos = 0;
      for (let i = 0; i < registros.length; i += 100) {
        const lote = registros.slice(i, i + 100);
        const { error } = await db.from('tempo_real_ocorrencias').insert(lote);
        if (error) {
          console.warn(`[TF→painel/${regional}] falha ao salvar lote:`, error.message);
          if (/relation.*does not exist|could not find the table/i.test(error.message)) {
            console.warn('  → tabela tempo_real_ocorrencias não existe. Rode add_tempo_real.sql no reinc_trafo.');
            return;
          }
          if (/column .*regional.* does not exist/i.test(error.message)) {
            console.warn('  → a coluna "regional" não existe na tabela. Rode add_regional.sql no reinc_trafo.');
            return;
          }
        } else salvos += lote.length;
      }
      console.log(`[TF→painel/${regional}] ✅ ${salvos} ocorrências TF enviadas ao painel.`);
    } catch (e) {
      console.warn(`[TF→painel/${regional}] erro ao enviar:`, e.message);
    }
  }

  // ---- Pendura no mesmo input do Retrabalho (file-atual) ----
  function bind() {
    const fa = document.getElementById('file-atual');
    if (!fa) { console.warn('[TF→painel] input #file-atual não encontrado.'); return; }

    fa.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' });

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
      // NÃO limpa e.target.value — deixa o handler do Retrabalho cuidar disso.
    });

    console.log(`[TF→painel/${regionalDaPagina()}] pronto: ocorrências TF desta planilha irão ao painel de reincidência.`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
