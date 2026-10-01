// ============================================================
//  radar.js — envia o decômetro subido no Sistema de Retrabalho
//  para o RADAR DA OPERAÇÃO (Superintendência Centro).
//
//  O que faz, a cada upload de planilha no Retrabalho:
//   1. Reconhece o decômetro pela coluna "Abrangência" (qualquer botão de upload).
//   2. Descarta abrangência CR.
//   3. Ocorrências NÃO finalizadas  -> tabela radar_tempo_real (substitui o
//      retrato da regional enviada). Alimentam a aba "Tempo real" do Radar.
//   4. Ocorrências finalizadas      -> tabela radar_ocorrencias (upsert),
//      mantendo o histórico do Radar em dia sem importação manual.
//  Regional: pela coluna "Regional" do próprio arquivo; se não houver,
//  usa sessionStorage('regional') do Retrabalho.
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
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
  const isFinal = e => norm(e).includes('FINALIZ');

  function regionalSessao(){ let s=''; try{ s=String(sessionStorage.getItem('regional')||'').toLowerCase(); }catch(e){} return s.startsWith('metro')?'METRO':(s?'GYN':null); }

  function garantirXLSX(){
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, err) => { const s=document.createElement('script'); s.charset='utf-8'; s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=ok; s.onerror=()=>err(new Error('não consegui carregar a biblioteca XLSX')); document.head.appendChild(s); });
  }
  async function sb(path, method, body, prefer){
    const r = await fetch(SB_URL+'/rest/v1/'+path, {method, headers:{apikey:SB_KEY, Authorization:'Bearer '+SB_KEY, 'Content-Type':'application/json', Prefer: prefer||'return=minimal'}, body: body?JSON.stringify(body):undefined});
    if(!r.ok){ const t=await r.text().catch(()=>''); throw new Error(`${method} ${path.split('?')[0]} -> ${r.status} ${t.slice(0,200)}`); }
  }
  async function upsert(table, rows){ for(let i=0;i<rows.length;i+=500) await sb(`${table}?on_conflict=ocorrencia_id`,'POST',rows.slice(i,i+500),'resolution=merge-duplicates,return=minimal'); }

  // ---- mesmo leitor do Radar ----
  const COLS = {
    numero:'NUMERO', abrangencia:'ABRANGENCIA', estado:'ESTADO', ini:'DATA INICIO', fim:'DATA FIM',
    regional:'REGIONAL', seccional:'SECCIONAL', municipio:'MUNICIPIO', natureza:'NATUREZA', causa:'CAUSA', sub_causa:'SUB CAUSA',
    clientes:'CLTS > 3 MIN', chi:'CHI', dec:'DEC', fec:'FEC', conjunto_eletrico:'CONJUNTO ELETRICO', conjunto_geografico:'CONJUNTO GEOGRAFICO',
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
  
  function parseDecometro(buf){
    const wb = XLSX.read(buf, {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:''});
    let hi=-1; for(let i=0;i<Math.min(15,rows.length);i++){ const nr=rows[i].map(norm); if(nr.includes('ABRANGENCIA') && nr.includes('NUMERO')){hi=i;break;} }
    if(hi<0) throw new Error('Não encontrei o cabeçalho do decômetro (colunas "Número" e "Abrangência").');
    const hdr = rows[hi].map(norm); const ix={};
    for(const [k,n] of Object.entries(COLS)) ix[k]=hdr.indexOf(n);
    const falta=['numero','abrangencia','ini','regional','ponto_eletrico'].filter(k=>ix[k]<0);
    if(falta.length) throw new Error('Colunas obrigatórias ausentes: '+falta.map(k=>COLS[k]).join(', '));
    const g=(r,k)=> ix[k]>=0 ? r[ix[k]] : '';
    const out=[]; const regsNoArquivo=new Set(); let cr=0, fora=0;
    for(let i=hi+1;i<rows.length;i++){
      const r=rows[i]; const numero=clean(g(r,'numero')); if(!numero) continue;
      const reg=regionalCod(g(r,'regional')); if(!reg){fora++;continue;}
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
        clientes: pNum(g(r,'clientes')), chi: pNum(g(r,'chi')), dec: pNum(g(r,'dec')), fec: pNum(g(r,'fec')),
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
  async function processar(file, origem){
    try{
      await garantirXLSX();
      const buf = await file.arrayBuffer();
      // assinatura do decômetro
      const wb = XLSX.read(buf, {type:'array', sheetRows:15});
      const head = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:''}).flat().map(norm);
      if(!head.includes('ABRANGENCIA')) return; // não é decômetro: ignora em silêncio
      let p = parseDecometro(buf);
      if(!p.regs.length){ const r=regionalSessao(); if(r) p.regs=[r]; }
      if(!p.regs.length){ console.warn(LOG,'regional não identificada; nada enviado.'); return; }
      const ts = new Date().toISOString();
      const ext = new Date(file.lastModified||Date.now()).toISOString();
      const abertas = p.rows.filter(r=>!isFinal(r.estado)).map(r=>({...r, enviado_em:ts, extraido_em:ext, origem:'retrabalho'}));
      let finalizadas = p.rows.filter(r=>isFinal(r.estado)).map(r=>({...r, importado_em:ts, extraido_em:ext}));
      // não sobrescreve o que já está salvo a partir de uma extração mais nova
      const maisNovos = new Set();
      for(let i=0;i<finalizadas.length;i+=150){
        const ch=finalizadas.slice(i,i+150).map(r=>`"${r.ocorrencia_id}"`).join(',');
        const r=await fetch(`${SB_URL}/rest/v1/radar_ocorrencias?select=ocorrencia_id,extraido_em&ocorrencia_id=in.(${encodeURIComponent(ch)})`,{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});
        if(r.ok) (await r.json()).forEach(x=>{ if(x.extraido_em && x.extraido_em>ext) maisNovos.add(x.ocorrencia_id); });
      }
      finalizadas = finalizadas.filter(r=>!maisNovos.has(r.ocorrencia_id));
      await sb(`radar_tempo_real?regional=in.(${p.regs.join(',')})`,'DELETE');
      if(abertas.length) await upsert('radar_tempo_real', abertas);
      if(finalizadas.length) await upsert('radar_ocorrencias', finalizadas);
      await sb('radar_importacoes','POST',[{tipo:'tempo_real',arquivo:file.name,linhas:abertas.length,regionais:p.regs.join(',')}]);
      if(finalizadas.length){ const ds=finalizadas.map(r=>r.data_inicio).sort(); await sb('radar_importacoes','POST',[{tipo:'retrabalho',arquivo:file.name,linhas:finalizadas.length,regionais:p.regs.join(','),periodo_ini:ds[0],periodo_fim:ds[ds.length-1]}]); }
      console.log(`${LOG} OK (${p.regs.join('+')}) | ${abertas.length} em aberto -> tempo real | ${finalizadas.length} finalizadas -> histórico | ${p.cr} CR ignoradas | origem: ${origem}`);
    }catch(e){ console.error(LOG,'falhou:', e.message); }
  }
  document.addEventListener('change', function(e){
    const t=e.target; if(!t || t.tagName!=='INPUT' || t.type!=='file') return;
    const files=Array.from(t.files||[]); if(!files.length) return;
    const origem=t.id||t.name||'input-arquivo';
    files.forEach(f=>{ if(/\.xlsx?$/i.test(f.name)) processar(f, origem); });
  }, true);
  console.log(`${LOG} pronto (regional da sessão: ${regionalSessao()||'—'}). Escutando uploads do decômetro.`);
})();
