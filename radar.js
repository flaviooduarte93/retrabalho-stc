// ============================================================
//  radar.js — envia o decômetro subido no Sistema de Retrabalho
//  para o RADAR DA OPERAÇÃO (Superintendência Centro).
//
//  REGIONAL = A DA PÁGINA (login), não a coluna do arquivo.
//   - Senha eqtlstcgyn26   -> sessionStorage 'goiania'       -> GYN
//   - Senha eqtlstcmetro26 -> sessionStorage 'metropolitana' -> METRO
//  Cada upload substitui SOMENTE o retrato da regional da página.
//  Assim o envio de Goiânia nunca apaga o da Metropolitana e vice-versa,
//  mesmo que o arquivo traga alguma linha com cadastro de outra regional.
//
//  A cada upload (qualquer botão; vários arquivos de uma vez também):
//   1. Reconhece o decômetro pela coluna "Abrangência".
//   2. Descarta abrangência CR.
//   3. Não finalizadas -> radar_tempo_real (aba "Tempo real" do Radar).
//   4. Finalizadas     -> radar_ocorrencias (histórico), sem sobrescrever
//      versões salvas a partir de extração mais nova.
//   Mostra um aviso no canto da tela com o resultado.
//
//  INSTALAR no index.html do Retrabalho, DEPOIS do tr.js:
//     <script src="radar.js"></script>
// ============================================================
(function () {
  'use strict';
  const LOG = '[radar.js->radar]';
  const SB_URL = 'https://aqflmeyugixcjjirzzsm.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZmxtZXl1Z2l4Y2pqaXJ6enNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NjU1MDgsImV4cCI6MjEwNjQ0MTUwOH0.m4p0IEHuu0nLWhebuSFLozGpEI8lBZwPA_q7fDFqw9Q';
  const DAY = 86400000;
  const NOME = {GYN:'Goiânia', METRO:'Metropolitana'};
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const isFinal = e => norm(e).includes('FINALIZ');

  function regionalDaPagina(){
    let s=''; try{ s=String(sessionStorage.getItem('regional')||'').toLowerCase(); }catch(e){}
    if(!s && typeof window.getRegionalKey==='function'){ try{ s=String(window.getRegionalKey()||'').toLowerCase(); }catch(e){} }
    return s.startsWith('metro') ? 'METRO' : 'GYN';
  }

  // ---- aviso visual na página do Retrabalho ----
  function aviso(msg, tipo){
    let el=document.getElementById('radar-aviso');
    if(!el){ el=document.createElement('div'); el.id='radar-aviso';
      el.style.cssText='position:fixed;left:16px;bottom:16px;z-index:99999;max-width:min(420px,calc(100vw - 32px));padding:12px 16px;border-radius:10px;font:600 13px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer';
      el.title='Clique para fechar'; el.onclick=()=>el.remove(); document.body.appendChild(el); }
    el.style.background = tipo==='erro' ? '#C0331B' : tipo==='ok' ? '#1E1760' : '#4B4970';
    el.innerHTML = msg; clearTimeout(aviso._t);
    if(tipo!=='aguarde') aviso._t=setTimeout(()=>el && el.remove(), tipo==='erro'?15000:8000);
  }

  function garantirXLSX(){
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, err) => { const s=document.createElement('script'); s.charset='utf-8'; s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=ok; s.onerror=()=>err(new Error('não consegui carregar a biblioteca XLSX')); document.head.appendChild(s); });
  }
  async function sb(path, method, body, prefer){
    const r = await fetch(SB_URL+'/rest/v1/'+path, {method, headers:{apikey:SB_KEY, Authorization:'Bearer '+SB_KEY, 'Content-Type':'application/json', Prefer: prefer||'return=minimal'}, body: body?JSON.stringify(body):undefined});
    if(!r.ok){ const t=await r.text().catch(()=>''); throw new Error(`${method} ${path.split('?')[0]} -> ${r.status} ${t.slice(0,200)}`); }
    return r;
  }
  async function upsert(table, rows){ for(let i=0;i<rows.length;i+=500) await sb(`${table}?on_conflict=ocorrencia_id`,'POST',rows.slice(i,i+500),'resolution=merge-duplicates,return=minimal'); }

  // ---- mesmo leitor do Radar ----
  const COLS = {
    numero:'NUMERO', abrangencia:'ABRANGENCIA', estado:'ESTADO', ini:'DATA INICIO', fim:'DATA FIM',
    regional:'REGIONAL', seccional:'SECCIONAL', municipio:'MUNICIPIO', natureza:'NATUREZA', causa:'CAUSA', sub_causa:'SUB CAUSA',
    clientes:'CLTS > 3 MIN', clientes_af_max:'CLTS AF MAX', chi:'CHI', dec:'DEC', fec:'FEC', conjunto_eletrico:'CONJUNTO ELETRICO', conjunto_geografico:'CONJUNTO GEOGRAFICO',
    oco_id:'OCORRENCIA ID', se:'SE', al:'AL', ponto_eletrico:'PONTO ELETRICO', tipo_ponto:'TIPO PONTO ELETRICO', equipe:'EQUIPE',
    tmp:'TMP', tmd:'TMD', tme:'TME', tma:'TMA', r90:'R90'
  };
  function pNum(v){ if(v==null||v==='') return null; if(typeof v==='number') return v; let s=String(v).trim(); if(!s||s==='-'||s==='---') return null; if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.'); const n=parseFloat(s); return isNaN(n)?null:n; }
  function pDate(v){
    if(v==null||v==='') return null;
    let y,mo,d,h=0,mi=0,se=0;
    if(typeof v==='number'){ // serial Excel (horário local)
      const ms=Math.round((v-25569)*DAY); const dt=new Date(ms);
      y=dt.getUTCFullYear(); mo=dt.getUTCMonth()+1; d=dt.getUTCDate(); h=dt.getUTCHours(); mi=dt.getUTCMinutes(); se=dt.getUTCSeconds();
    } else if(v instanceof Date){ return v.toISOString(); }
    else { const m=String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/); if(!m) return null; d=+m[1];mo=+m[2];y=+m[3];h=+(m[4]||0);mi=+(m[5]||0);se=+(m[6]||0); }
    const p=n=>String(n).padStart(2,'0');
    return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(se)}-03:00`;
  }
  const clean = v => { const s=String(v??'').trim(); return (s===''||s==='---'||s==='-'||s==='N/D')?null:s; };
  function normEquipe(s){ s=String(s||'').trim().toUpperCase(); if(!s||s==='---'||s==='-') return null; const p=s.split('-'); return p.length>=3 ? p[1]+p[2] : s; }
  function regionalCod(s){ const n=norm(s); if(n.startsWith('GOIANIA')) return 'GYN'; if(n.startsWith('METRO')) return 'METRO'; return null; }
  
  function parseDecometro(buf, forceReg){
    const wb = XLSX.read(buf, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:''});
    let hi=-1; for(let i=0;i<Math.min(15,rows.length);i++){ const nr=rows[i].map(norm); if(nr.includes('ABRANGENCIA') && nr.includes('NUMERO')){hi=i;break;} }
    if(hi<0) throw new Error('Não encontrei o cabeçalho do decômetro (colunas "Número" e "Abrangência").');
    const hdr = rows[hi].map(norm); const ix={};
    for(const [k,n] of Object.entries(COLS)) ix[k]=hdr.indexOf(n);
    const falta=['numero','abrangencia','ini',...(forceReg?[]:['regional']),'ponto_eletrico'].filter(k=>ix[k]<0);
    if(falta.length) throw new Error('Colunas obrigatórias ausentes: '+falta.map(k=>COLS[k]).join(', '));
    const g=(r,k)=> ix[k]>=0 ? r[ix[k]] : '';
    const out=[]; const regsNoArquivo=new Set(); let cr=0, fora=0;
    for(let i=hi+1;i<rows.length;i++){
      const r=rows[i]; const numero=clean(g(r,'numero')); if(!numero) continue;
      const regLinha=regionalCod(g(r,'regional')); const reg=forceReg||regLinha; if(!reg){fora++;continue;} if(forceReg && regLinha && regLinha!==forceReg) fora++;
      regsNoArquivo.add(reg);
      const abr=norm(g(r,'abrangencia')); if(abr==='CR'){cr++;continue;}
      const ini=pDate(g(r,'ini')); if(!ini) continue;
      const fim=pDate(g(r,'fim'));
      const dur = fim ? (new Date(fim)-new Date(ini))/60000 : null;
      out.push({
        ocorrencia_id: clean(g(r,'oco_id')) || ('N'+numero), numero, abrangencia: abr, estado: clean(g(r,'estado')),
        data_inicio: ini, data_fim: fim, duracao_min: dur!=null?Math.round(dur):null, regional: reg,
        seccional: clean(g(r,'seccional')), municipio: clean(norm(g(r,'municipio'))), natureza: clean(norm(g(r,'natureza'))),
        causa: clean(String(g(r,'causa')).replace(/\s+/g,' ').trim()), sub_causa: clean(g(r,'sub_causa')),
        clientes: pNum(g(r,'clientes')), clientes_af_max: pNum(g(r,'clientes_af_max')), chi: pNum(g(r,'chi')), dec: pNum(g(r,'dec')), fec: pNum(g(r,'fec')),
        conjunto_eletrico: clean(norm(g(r,'conjunto_eletrico'))), conjunto_geografico: clean(norm(g(r,'conjunto_geografico'))),
        se: clean(g(r,'se')), al: clean(g(r,'al')), ponto_eletrico: clean(String(g(r,'ponto_eletrico')).trim().toUpperCase()),
        tipo_ponto: clean(g(r,'tipo_ponto')), equipe: normEquipe(g(r,'equipe')),
        tmp: pNum(g(r,'tmp')), tmd: pNum(g(r,'tmd')), tme: pNum(g(r,'tme')), tma: pNum(g(r,'tma')), r90: pNum(g(r,'r90'))
      });
    }
    // dedup por ocorrencia_id (última vence)
    const m=new Map(); out.forEach(o=>m.set(o.ocorrencia_id,o));
    return {rows:[...m.values()], regs:[...regsNoArquivo], cr, fora};
  }
  async function ehDecometro(buf){
    const wb = XLSX.read(buf, {type:'array', sheetRows:15});
    const head = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:''}).flat().map(norm);
    return head.includes('ABRANGENCIA');
  }

  async function processar(files, origem){
    const reg = regionalDaPagina();
    try{
      await garantirXLSX();
      const lidos=[];
      for(const f of files){
        const buf=await f.arrayBuffer();
        if(!(await ehDecometro(buf))) continue;            // não é decômetro: ignora
        const p=parseDecometro(buf, reg);                  // todas as linhas = regional da página
        lidos.push({f, p, ext:new Date(f.lastModified||Date.now()).toISOString()});
      }
      if(!lidos.length) return;
      aviso(`Radar da Operação: enviando ocorrências de ${NOME[reg]}…`,'aguarde');
      const ts=new Date().toISOString();
      // junta os arquivos do mesmo upload (o mais recente vence)
      lidos.sort((a,b)=>a.ext.localeCompare(b.ext));
      const mapa=new Map(); let cr=0, outra=0;
      for(const x of lidos){ cr+=x.p.cr; outra+=x.p.fora; x.p.rows.forEach(r=>mapa.set(r.ocorrencia_id,{...r, extraido_em:x.ext})); }
      const todas=[...mapa.values()];
      const abertas = todas.filter(r=>!isFinal(r.estado)).map(r=>({...r, regional:reg, enviado_em:ts, origem:'retrabalho'}));
      let finalizadas = todas.filter(r=>isFinal(r.estado)).map(r=>({...r, importado_em:ts}));
      // não sobrescreve histórico salvo a partir de extração mais nova
      const maisNovos=new Set();
      const extMap=new Map(finalizadas.map(r=>[r.ocorrencia_id,r.extraido_em]));
      for(let i=0;i<finalizadas.length;i+=150){
        const ids=finalizadas.slice(i,i+150).map(r=>r.ocorrencia_id);
        const r=await fetch(`${SB_URL}/rest/v1/radar_ocorrencias?select=ocorrencia_id,extraido_em&ocorrencia_id=in.(${encodeURIComponent(ids.map(id=>`"${id}"`).join(','))})`,{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});
        if(r.ok) (await r.json()).forEach(x=>{ if(x.extraido_em && x.extraido_em>extMap.get(x.ocorrencia_id)) maisNovos.add(x.ocorrencia_id); });
      }
      finalizadas = finalizadas.filter(r=>!maisNovos.has(r.ocorrencia_id));

      // substitui SOMENTE o retrato da regional da página
      await sb(`radar_tempo_real?regional=eq.${reg}`,'DELETE');
      // se alguma ocorrência aberta estava no retrato da outra regional, ela passa para esta
      if(abertas.length) await upsert('radar_tempo_real', abertas);
      if(finalizadas.length) await upsert('radar_ocorrencias', finalizadas);
      await sb('radar_importacoes','POST',[{tipo:'tempo_real',arquivo:lidos.map(x=>x.f.name).join(', '),linhas:abertas.length,regionais:reg}]);
      if(finalizadas.length){ const ds=finalizadas.map(r=>r.data_inicio).sort(); await sb('radar_importacoes','POST',[{tipo:'retrabalho',arquivo:lidos.map(x=>x.f.name).join(', '),linhas:finalizadas.length,regionais:reg,periodo_ini:ds[0],periodo_fim:ds[ds.length-1]}]); }
      console.log(`${LOG} OK ${reg} | ${abertas.length} em aberto -> tempo real | ${finalizadas.length} finalizadas -> histórico | ${cr} CR ignoradas | ${outra} linhas com outra regional no cadastro (tratadas como ${reg}) | origem: ${origem}`);
      aviso(`Radar da Operação: ${NOME[reg]} atualizada. ${abertas.length} ocorrência(s) em aberto enviadas${finalizadas.length?` e ${finalizadas.length} finalizada(s) no histórico`:''}.`,'ok');
    }catch(e){
      console.error(LOG,'falhou:', e.message);
      aviso(`Radar da Operação: falha ao enviar ${NOME[reg]}. ${String(e.message).slice(0,160)}`,'erro');
    }
  }
  document.addEventListener('change', function(e){
    const t=e.target; if(!t || t.tagName!=='INPUT' || t.type!=='file') return;
    const files=Array.from(t.files||[]).filter(f=>/\.xlsx?$/i.test(f.name)); if(!files.length) return;
    processar(files, t.id||t.name||'input-arquivo');
  }, true);
  console.log(`${LOG} pronto. Regional desta página: ${regionalDaPagina()}. Escutando uploads do decômetro.`);
})();
