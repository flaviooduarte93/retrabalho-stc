// ============================================================
//  tr.js — envia as ocorrências TF (transformadores) ao painel
//  de Reincidência, a partir da MESMA planilha do decômetro que o
//  Retrabalho já sobe.
//
//  COMO FUNCIONA (versão robusta)
//  Em vez de depender do id de um input específico (que mudou de
//  file-atual para file-recente e pode mudar de novo), este script
//  escuta o evento 'change' de QUALQUER <input type=file> na página
//  (event delegation no document). Ao receber um arquivo, ele checa
//  se a planilha tem a cara do decômetro (coluna 'Abrangência') e,
//  se tiver, extrai as ocorrências TF ativas e grava no painel.
//  Assim funciona não importa por qual botão o arquivo suba.
//
//  REGIONAL: lida do sessionStorage('regional') — 'goiania' | 'metropolitana'.
//  Um único arquivo serve as duas regionais.
//
//  INSTALAR: no index.html, DEPOIS do supabase-js e do upload-recente.js:
//     <script src="tr.js"></script>
//  Pré-requisitos no Supabase do painel: add_tempo_real.sql + add_regional.sql.
// ============================================================

(function () {
  'use strict';

  const LOG = '[tr.js->painel]';

  // ---- Regional pela seleção do sistema (sessionStorage) ----
  function regionalDaPagina() {
    let sel = '';
    try { sel = String(sessionStorage.getItem('regional') || '').toLowerCase(); } catch (e) {}
    return sel.startsWith('metro') ? 'METRO' : 'GYN';
  }

  // ---- Cliente Supabase do PAINEL DE REINCIDENCIA (reinc_trafo) ----
  const REINC_URL = 'https://lektklczuglajpdehqov.supabase.co';
  const REINC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3RrbGN6dWdsYWpwZGVocW92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzA3MDQsImV4cCI6MjA5NTkwNjcwNH0._VKvOdcaBtkPEF0FjE9yr94O9qoRyS4BQA7Nuvw9uCo';

  let sbReinc = null;
  function getReincClient() {
    if (sbReinc) return sbReinc;
    var lib = null;
    if (window.supabase && window.supabase.createClient) lib = window.supabase;
    else if (window.supabaseJs && window.supabaseJs.createClient) lib = window.supabaseJs;
    else if (typeof supabase !== 'undefined' && supabase && supabase.createClient) lib = supabase;
    if (!lib) {
      console.error(LOG + ' Biblioteca supabase-js nao encontrada. Confirme que <script src="tr.js"> vem DEPOIS do supabase-js.');
      return null;
    }
    try { sbReinc = lib.createClient(REINC_URL, REINC_KEY); return sbReinc; }
    catch (e) { console.error(LOG + ' Falha ao criar cliente do painel:', e.message); return null; }
  }

  // ---- Helpers ----
  function parseDataTF(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') { var d = new Date((v - 25569) * 86400 * 1000); return isNaN(d) ? null : d; }
    var s = String(v).trim();
    var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0), +(m[6]||0));
    var d2 = new Date(s); return isNaN(d2) ? null : d2;
  }
  var num  = function(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; };
  var int  = function(v){ var n = parseInt(v);   return isNaN(n) ? 0 : n; };
  var txt  = function(v){ return String(v == null ? '' : v).trim(); };
  var semTraco = function(v){ return txt(v).replace(/^-+$/, ''); };

  // Le uma planilha (ArrayBuffer) e devolve {header, rows}.
  function lerPlanilha(buf) {
    var wb = XLSX.read(buf);
    var allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' });
    var hIdx = -1;
    for (var i = 0; i < Math.min(8, allRows.length); i++) {
      if (allRows[i].some(function(c){ return String(c).trim() === 'Número'; })) { hIdx = i; break; }
    }
    if (hIdx === -1) return { header: [], rows: [] };
    var header = allRows[hIdx].map(function(h){ return String(h).trim(); });
    var rows = allRows.slice(hIdx + 1)
      .filter(function(r){ return r.some(function(c){ return c !== ''; }); })
      .map(function(r){ var o = {}; header.forEach(function(h, i){ o[h] = r[i] == null ? '' : r[i]; }); return o; });
    return { header: header, rows: rows };
  }

  // ---- Envia as TF ativas ao painel ----
  async function enviarTFparaPainel(rowsObj, origem) {
    var db = getReincClient();
    if (!db) return;
    var regional = regionalDaPagina();

    var tf = rowsObj.filter(function(r){
      var ab = txt(r['Abrangência']).toUpperCase();
      var es = txt(r['Estado']).toUpperCase();
      return ab === 'TF' && es && es.indexOf('F-') !== 0;
    });

    console.log(LOG + ' regional=' + regional + ' | ' + tf.length + ' TF ativas (de ' + rowsObj.length + ' linhas) | origem: ' + origem);

    if (!tf.length) {
      try {
        var r0 = await db.from('tempo_real_ocorrencias').delete().eq('regional', regional);
        if (r0.error) console.warn(LOG + ' aviso ao limpar:', r0.error.message);
        else console.log(LOG + ' nenhuma TF ativa - tabela da regional ' + regional + ' zerada.');
      } catch (e) { console.warn(LOG + ' erro ao limpar:', e.message); }
      return;
    }

    var importadoEm = new Date().toISOString();
    var registros = tf.map(function(r){
      var ini = parseDataTF(r['Data Início']);
      return {
        oe: txt(r['Número']), estado: txt(r['Estado']),
        inicio: ini ? ini.toISOString() : null,
        duracao_arq: txt(r['Duração']), conjunto: txt(r['Conjunto Elétrico']),
        trafo: txt(r['Ponto Elétrico']).toUpperCase(),
        clientes: int(r['Clts > 3 min']), clts_max: int(r['Clts Af Max']),
        equipe: semTraco(r['Equipe']) || null, chi: num(r['CHI']), dec: num(r['DEC']),
        causa: semTraco(r['Causa']) || null, motivo: txt(r['Motivo']) || null,
        seccional: txt(r['Seccional']) || null, municipio: txt(r['Município']) || null,
        perimetro: txt(r['Perímetro']) || null, prioridade: txt(r['Prioridade']) || null,
        avisos: int(r['Avisos']), natureza: txt(r['Natureza']) || null,
        ocorrencia_id: txt(r['Ocorrência ID']) || null,
        importado_em: importadoEm, regional: regional
      };
    }).filter(function(x){ return x.oe && x.trafo; });

    try {
      var del = await db.from('tempo_real_ocorrencias').delete().eq('regional', regional);
      if (del.error) {
        console.error(LOG + ' erro ao limpar regional ' + regional + ':', del.error.message);
        if (/relation.*does not exist|could not find the table/i.test(del.error.message))
          console.error(LOG + '   -> rode add_tempo_real.sql no painel (reinc_trafo).');
        if (/column .*regional.* does not exist/i.test(del.error.message))
          console.error(LOG + '   -> rode add_regional.sql no painel (reinc_trafo).');
        return;
      }
      var salvos = 0;
      for (var i = 0; i < registros.length; i += 100) {
        var lote = registros.slice(i, i + 100);
        var res = await db.from('tempo_real_ocorrencias').insert(lote);
        if (res.error) {
          console.error(LOG + ' erro ao inserir lote ' + i + ':', res.error.message);
          if (/column .*regional.* does not exist/i.test(res.error.message))
            console.error(LOG + '   -> rode add_regional.sql no painel (reinc_trafo).');
          return;
        }
        salvos += lote.length;
      }
      console.log(LOG + ' OK: ' + salvos + ' ocorrencias TF (' + regional + ') enviadas ao painel.');
    } catch (e) {
      console.error(LOG + ' excecao ao enviar:', e.message);
    }
  }

  // ---- Processa um FileList (um ou varios arquivos) ----
  async function processarArquivos(files, origem) {
    var todas = [];
    var temDecometro = false;
    for (var k = 0; k < files.length; k++) {
      try {
        var buf = await files[k].arrayBuffer();
        var parsed = lerPlanilha(buf);
        if (parsed.header.indexOf('Abrangência') !== -1) { temDecometro = true; todas = todas.concat(parsed.rows); }
      } catch (e) {
        console.warn(LOG + ' nao consegui ler ' + files[k].name + ':', e.message);
      }
    }
    if (!temDecometro) return;  // arquivo nao e o decometro (ex.: base historica) - ignora
    await enviarTFparaPainel(todas, origem);
  }

  // ---- Event delegation: captura QUALQUER input de arquivo ----
  // Nao dependemos do id (file-atual / file-recente / futuro). Fase de
  // captura (true) garante que rodamos mesmo se o handler do sistema
  // parar a propagacao.
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'INPUT' || t.type !== 'file') return;
    var files = Array.prototype.slice.call(t.files || []);
    if (!files.length) return;
    var origem = t.id || t.name || 'input-arquivo';
    processarArquivos(files, origem);
  }, true);

  console.log(LOG + ' pronto (regional atual: ' + regionalDaPagina() + '). Escutando uploads de planilha do decometro.');
})();
