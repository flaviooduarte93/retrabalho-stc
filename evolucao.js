// js/evolucao.js — Evolução do indicador de retrabalho

let _dados = [];
let _periodo = 30;
let _chartTotal = null;
let _chartStack = null;

function fmtDataBR(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function fmtDataCurta(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
}

function setPeriodo(dias) {
  _periodo = dias;
  document.querySelectorAll('[id^="p-"]').forEach(b => b.classList.remove('sort-btn--active'));
  document.getElementById(`p-${dias}`)?.classList.add('sort-btn--active');
  renderTudo();
}

function dadosFiltrados() {
  if (!_periodo) return [..._dados];
  const corte = new Date();
  corte.setDate(corte.getDate() - _periodo);
  return _dados.filter(d => new Date(d.data) >= corte);
}

function renderStats(dados) {
  if (!dados.length) return;
  const ultimo   = dados[dados.length - 1];
  const anterior = dados[dados.length - 2];
  const varTotal = anterior ? ultimo.total_ucs - anterior.total_ucs : 0;
  const maxTotal = Math.max(...dados.map(d => d.total_ucs));
  const minTotal = Math.min(...dados.map(d => d.total_ucs));
  const mediaTotal = Math.round(dados.reduce((s,d) => s+d.total_ucs, 0) / dados.length);
  const varSinal = varTotal > 0 ? `+${varTotal} ↑` : varTotal < 0 ? `${varTotal} ↓` : '= estável';
  const varCor   = varTotal > 0 ? 'var(--eq-red)' : varTotal < 0 ? 'var(--eq-green)' : 'var(--eq-gray-600)';

  document.getElementById('stats-container').innerHTML = `
    <div class="alert-stats" style="margin-bottom:20px">
      <div class="stat-card info">
        <div class="stat-value">${ultimo.total_ucs}</div>
        <div class="stat-label">UCs hoje</div>
        <div style="font-size:.72rem;font-weight:700;color:${varCor};margin-top:4px">${varSinal} vs ontem</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${ultimo.critico}</div>
        <div class="stat-label">🟢 Saindo em breve</div>
        <div style="font-size:.72rem;color:var(--eq-gray-500);margin-top:4px">saem em &lt;10 dias</div>
      </div>
      <div class="stat-card success">
        <div class="stat-value">${minTotal}</div>
        <div class="stat-label">Mínimo no período</div>
        <div style="font-size:.72rem;color:var(--eq-gray-500);margin-top:4px">menor balde registrado</div>
      </div>
      <div class="stat-card warning">
        <div class="stat-value">${maxTotal}</div>
        <div class="stat-label">Máximo no período</div>
        <div style="font-size:.72rem;color:var(--eq-gray-500);margin-top:4px">maior balde registrado</div>
      </div>
    </div>`;
}

function renderGraficos(dados) {
  const labels  = dados.map(d => fmtDataCurta(d.data));
  const total   = dados.map(d => d.total_ucs);
  const critico = dados.map(d => d.critico);
  const alerta  = dados.map(d => d.alerta);
  const ok      = dados.map(d => d.ok);

  const fontePadrao = { family: "'Plus Jakarta Sans', sans-serif", size: 11 };

  // ---- Gráfico linha: total ----
  if (_chartTotal) _chartTotal.destroy();
  const ctx1 = document.getElementById('chart-total').getContext('2d');
  _chartTotal = new Chart(ctx1, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Total', data:total,   borderColor:'#1565C0', backgroundColor:'rgba(21,101,192,.08)', fill:true, tension:.3, pointRadius:dados.length<=30?4:2, borderWidth:2 },
        { label:'<10d (saindo)', data:critico, borderColor:'#2E7D32', backgroundColor:'transparent', tension:.3, pointRadius:dados.length<=30?3:1, borderWidth:1.5, borderDash:[4,3] },
        { label:'10-30d',        data:alerta,  borderColor:'#F9A825', backgroundColor:'transparent', tension:.3, pointRadius:dados.length<=30?3:1, borderWidth:1.5, borderDash:[4,3] },
        { label:'>30d (longe)',  data:ok,      borderColor:'#C62828', backgroundColor:'transparent', tension:.3, pointRadius:dados.length<=30?3:1, borderWidth:1.5, borderDash:[4,3] },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { display:false },
        tooltip: { callbacks: { title: items => fmtDataBR(dados[items[0].dataIndex].data) } }
      },
      scales: {
        x: { ticks:{ font:fontePadrao, maxRotation:45 }, grid:{ color:'rgba(0,0,0,.05)' } },
        y: { ticks:{ font:fontePadrao }, grid:{ color:'rgba(0,0,0,.05)' }, beginAtZero:false }
      }
    }
  });

  // ---- Gráfico barras empilhadas ----
  if (_chartStack) _chartStack.destroy();
  const ctx2 = document.getElementById('chart-stack').getContext('2d');
  _chartStack = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'<10d (saindo)', data:critico, backgroundColor:'rgba(46,125,50,.85)',   stack:'s' },
        { label:'10-30d',        data:alerta,  backgroundColor:'rgba(249,168,37,.85)',  stack:'s' },
        { label:'>30d (longe)',  data:ok,      backgroundColor:'rgba(198,40,40,.80)',   stack:'s' },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { position:'bottom', labels:{ font:fontePadrao, boxWidth:12 } },
        tooltip: { callbacks: { title: items => fmtDataBR(dados[items[0].dataIndex].data) } }
      },
      scales: {
        x: { stacked:true, ticks:{ font:fontePadrao, maxRotation:45 }, grid:{ display:false } },
        y: { stacked:true, ticks:{ font:fontePadrao }, grid:{ color:'rgba(0,0,0,.05)' } }
      }
    }
  });
}

function renderTabela(dados) {
  const tbody = document.getElementById('tabela-body');
  const linhas = [...dados].reverse(); // mais recente primeiro
  tbody.innerHTML = linhas.map((d, i) => {
    const ant = linhas[i+1];
    const varT = ant ? d.total_ucs - ant.total_ucs : null;
    const varStr = varT === null ? '—' : varT > 0 ? `<span style="color:var(--eq-red)">+${varT} ↑</span>` : varT < 0 ? `<span style="color:var(--eq-green)">${varT} ↓</span>` : '<span style="color:var(--eq-gray-400)">= —</span>';
    return `<tr>
      <td><strong>${fmtDataBR(d.data)}</strong></td>
      <td><strong>${d.total_ucs}</strong></td>
      <td style="color:var(--eq-green);font-weight:600">${d.critico}</td>
      <td style="color:var(--eq-amber-dark);font-weight:600">${d.alerta}</td>
      <td style="color:var(--eq-red);font-weight:600">${d.ok}</td>
      <td>${varStr}</td>
    </tr>`;
  }).join('');
}

function renderTudo() {
  const dados = dadosFiltrados();
  if (!dados.length) return;
  renderStats(dados);
  renderGraficos(dados);
  renderTabela(dados);
}

function exportarCSV() {
  const dados = dadosFiltrados();
  const bom = '\uFEFF';
  const linhas = [['Data','Total UCs','Crítico (<10d)','Alerta (10-30d)','OK (>30d)','Variação Total']];
  dados.reverse().forEach((d,i,arr) => {
    const ant = arr[i+1];
    const varT = ant ? d.total_ucs - ant.total_ucs : '';
    linhas.push([fmtDataBR(d.data), d.total_ucs, d.critico, d.alerta, d.ok, varT]);
  });
  const csv = bom + linhas.map(r => r.map(v => `"${v}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  a.download = `evolucao_retrabalho_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

async function carregar() {
  try {
    const { data, error } = await db
      .from('historico_snapshots')
      .select('*')
      .order('data', { ascending: true });

    if (error) throw error;
    _dados = data || [];

    if (!_dados.length) {
      document.getElementById('stats-container').innerHTML = `
        <div class="alert-info-box" style="margin-bottom:20px">
          <strong>ℹ Nenhum dado ainda.</strong> Os snapshots são gerados automaticamente a cada upload da Base Histórica. Faça um upload para começar o acompanhamento.
        </div>`;
      return;
    }

    renderTudo();
  } catch(err) {
    console.error(err);
    document.getElementById('stats-container').innerHTML =
      `<div class="no-results"><p>Erro: ${err.message}</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carregar();
  document.getElementById('btn-refresh')?.addEventListener('click', carregar);
});
