// Painel Fiscal original. Os dados (window.__MONTHS_RAW) vêm do sistema: js/fiscal/carregar.js
// Bloqueia a tradução automática do navegador diretamente no <html> real
// (o mais forte dos sinais — funciona mesmo se este fragmento for embrulhado
// por outro documento), além do atributo/classe já no HTML acima.
document.documentElement.setAttribute('translate', 'no');
document.documentElement.classList.add('notranslate');
document.documentElement.lang = 'pt-BR';

const MONTHS_RAW = window.__MONTHS_RAW;
const MONTHS = MONTHS_RAW.data;
const NOTE_FIELDS = MONTHS_RAW.fields;
const NOTE_INTERNED = MONTHS_RAW.interned;
const NOTE_STRINGS = MONTHS_RAW.strings;
let currentMonthKey = null;
let SUMMARY = {};
let NOTES = [];
let NOTES_ATIVAS = [];
const chartRegistry = {};

function mkChart(canvasId, config) {
  if (chartRegistry[canvasId]) chartRegistry[canvasId].destroy();
  chartRegistry[canvasId] = new Chart(document.getElementById(canvasId), config);
  return chartRegistry[canvasId];
}

function fmtBRL(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Converte um caminho local do Windows (ex: E:\pasta\arquivo.pdf) numa URL file:// clicável.
function fileUrl(docId) {
  return docId ? 'abrir.html?doc=' + encodeURIComponent(docId) : '#';
}

// ---------- Ranking visual (Top 10) reusado em Canceladas e Devoluções ----------
// items: [{ titulo, sub, valorRaw, valueLabel, idx? }] já ordenado do maior pro menor.
// idx (opcional) é o índice em NOTES — quando presente, o item vira clicável e abre o detalhe da nota.
function renderRankList(containerId, items) {
  const el = document.getElementById(containerId);
  if (!items.length) {
    el.innerHTML = '<p style="font-size:12px; color:#9ca3af; margin:4px 0;">Nenhum registro no período.</p>';
    return;
  }
  const maxV = Math.max(...items.map(it => it.valorRaw), 0);
  el.innerHTML = items.map((it, i) => {
    const sev = maxV > 0 && it.valorRaw >= maxV * 0.66 ? 'alta' : (maxV > 0 && it.valorRaw >= maxV * 0.33 ? 'media' : 'baixa');
    const sevLabel = sev === 'alta' ? 'Alto' : sev === 'media' ? 'Médio' : 'Normal';
    return `<div class="rank-item sev-${sev}" ${it.idx !== undefined ? `data-idx="${it.idx}"` : ''}>
      <div class="rank-num">${i + 1}</div>
      <div class="rank-main">
        <div class="rank-title">${it.titulo}</div>
        <div class="rank-sub">${it.sub}</div>
      </div>
      <div class="rank-side">
        <span class="rank-tag ${sev}">${sevLabel}</span>
        <div class="rank-value ${sev === 'alta' ? 'alerta' : ''}">${it.valueLabel}</div>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('.rank-item[data-idx]').forEach(node => {
    node.addEventListener('click', () => openDetalhe(parseInt(node.dataset.idx, 10)));
  });
}

// Banner de alerta amarelo/vermelho — some quando não há nada fora do padrão a destacar.
function showAlerta(elId, html) {
  const el = document.getElementById(elId);
  if (html) { el.innerHTML = html; el.classList.add('show'); }
  else { el.classList.remove('show'); el.innerHTML = ''; }
}

// Dentro de um Top 10 (já formado pelos maiores valores), aponta só quem realmente
// destoa do restante da própria lista — comparar com a média geral soaria alarme
// para quase todo o Top 10, já que ele é sempre a ponta mais cara por definição.
function findValueOutliers(rankedItems) {
  if (rankedItems.length < 4) return [];
  const baseline = rankedItems.slice(3).reduce((a, it) => a + it.valorRaw, 0) / rankedItems.slice(3).length;
  if (baseline <= 0) return [];
  return rankedItems.filter(it => it.valorRaw >= baseline * 2.5);
}

// ---------- Agregação client-side (permite trocar/combinar meses sem reprocessar no servidor) ----------
function computeSummary(notes, periodoLabel) {
  const ativas = notes.filter(n => !n.cancelada);
  const diasMap = new Map();
  for (const n of ativas) {
    if (!diasMap.has(n.data)) diasMap.set(n.data, { venda: 0, devolucao: 0, icms_venda: 0, trib_venda: 0, qtd_venda: 0 });
    const d = diasMap.get(n.data);
    if (n.categoria === 'Venda') {
      d.venda += n.valor_nf || 0;
      d.icms_venda += n.valor_icms || 0;
      d.trib_venda += n.valor_total_tributos || 0;
      d.qtd_venda += 1;
    } else if (n.categoria === 'Devolução') {
      d.devolucao += n.valor_nf || 0;
    }
  }
  const dias = Array.from(diasMap.keys()).sort().map(data => {
    const d = diasMap.get(data);
    return { data, venda: d.venda, devolucao: d.devolucao, liquido: d.venda - d.devolucao,
      icms_venda: d.icms_venda, trib_venda: d.trib_venda, qtd_venda: d.qtd_venda };
  });

  const categorias = {};
  for (const n of ativas) {
    if (!categorias[n.categoria]) categorias[n.categoria] = { qtd: 0, valor: 0, icms: 0, trib: 0 };
    const c = categorias[n.categoria];
    c.qtd += 1; c.valor += n.valor_nf || 0; c.icms += n.valor_icms || 0; c.trib += n.valor_total_tributos || 0;
  }

  const uf = {};
  for (const n of ativas) {
    if (n.categoria !== 'Venda' || !n.uf_destino) continue;
    if (!uf[n.uf_destino]) uf[n.uf_destino] = { qtd: 0, valor: 0, icms: 0 };
    const u = uf[n.uf_destino];
    u.qtd += 1; u.valor += n.valor_nf || 0; u.icms += n.valor_icms || 0;
  }

  const vendas = ativas.filter(n => n.categoria === 'Venda');
  let maior = null;
  for (const n of vendas) if (!maior || (n.valor_nf || 0) > (maior.valor_nf || 0)) maior = n;
  let melhorDia = null, piorDia = null;
  for (const d of dias) {
    if (!melhorDia || d.liquido > melhorDia.liquido) melhorDia = d;
    if (!piorDia || d.liquido < piorDia.liquido) piorDia = d;
  }
  const prodCnt = new Map();
  for (const n of vendas) {
    const p = (n.produto || 'Sem descrição').split(';')[0].trim();
    prodCnt.set(p, (prodCnt.get(p) || 0) + 1);
  }
  const topProdutos = Array.from(prodCnt.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([produto, qtd]) => ({ produto, qtd }));

  const canceladas = notes.filter(n => n.cancelada);
  const vendaCanc = canceladas.filter(n => n.categoria === 'Venda');
  const motivosCnt = {};
  for (const n of canceladas) {
    const mo = n.motivo_cancelamento || 'Não informado';
    motivosCnt[mo] = (motivosCnt[mo] || 0) + 1;
  }
  const catCancCnt = {};
  for (const n of canceladas) catCancCnt[n.categoria] = (catCancCnt[n.categoria] || 0) + 1;
  const porDia = {};
  for (const n of canceladas) porDia[n.data] = (porDia[n.data] || 0) + 1;

  const datas = notes.map(n => n.data).filter(Boolean).sort();

  return {
    gerado_em: datas.length ? datas[datas.length - 1] : '',
    periodo: periodoLabel || '',
    dias, categorias, uf,
    destaques: {
      maior_nota: maior ? { numero: maior.numero, valor: maior.valor_nf, produto: maior.produto, data: maior.data, destinatario: maior.destinatario } : null,
      top_produtos: topProdutos,
      melhor_dia: melhorDia || { data: '', venda: 0, devolucao: 0, liquido: 0, icms_venda: 0, trib_venda: 0, qtd_venda: 0 },
      pior_dia: piorDia || { data: '', venda: 0, devolucao: 0, liquido: 0, icms_venda: 0, trib_venda: 0, qtd_venda: 0 },
    },
    canceladas: {
      total: canceladas.length,
      total_vendas: vendaCanc.length,
      valor_vendas_cancelado: vendaCanc.reduce((a, n) => a + (n.valor_nf || 0), 0),
      por_categoria: catCancCnt,
      por_motivo: motivosCnt,
      por_dia: porDia,
    },
  };
}

// Notas vêm como arrays posicionais, com os campos de texto mais repetitivos
// (categoria, produto, UF, destinatário etc.) trocados por um índice num
// dicionário compartilhado — economiza muito espaço no HTML embutido.
// Expandimos aqui para objetos com os nomes completos usados pelo resto do código.
function expandNote(arr) {
  const o = {};
  for (let i = 0; i < NOTE_FIELDS.length; i++) {
    const v = arr[i];
    o[NOTE_FIELDS[i]] = NOTE_INTERNED[i] ? NOTE_STRINGS[v] : v;
  }
  return o;
}

// Cache por mês: expandir 51 mil notas e recalcular o resumo é um trabalho
// não-trivial, então guardamos o resultado da primeira vez que cada período
// é visitado. Trocar entre meses já vistos fica instantâneo.
const monthDataCache = {};

// Comparativo mês a mês: lê direto dos arrays posicionais (sem expandNote,
// que é caro para 51 mil linhas) só os 2 campos que precisamos (categoria e
// cancelada), então isso é sempre rápido mesmo sem cache.
let comparativoCache = null;
function computeComparativo() {
  if (comparativoCache) return comparativoCache;
  const CAT_I = NOTE_FIELDS.indexOf('categoria');
  const DATA_I = NOTE_FIELDS.indexOf('data');
  const CANC_I = NOTE_FIELDS.indexOf('cancelada');
  const keys = Object.keys(MONTHS).sort();
  const out = keys.map(key => {
    const label = MONTHS[key].label;
    let venda = 0, devolucao = 0, cancelada = 0;
    for (const arr of MONTHS[key].notes) {
      const dataStr = NOTE_STRINGS[arr[DATA_I]];
      if (!dataStr || !dataStr.startsWith(key)) continue;
      const isCanc = arr[CANC_I] === 1;
      if (isCanc) { cancelada++; continue; }
      const cat = NOTE_STRINGS[arr[CAT_I]];
      if (cat === 'Venda') venda++;
      else if (cat === 'Devolução') devolucao++;
    }
    const total = venda + devolucao + cancelada;
    return { key, label, venda, devolucao, cancelada, pctCancelamento: total ? (cancelada / total * 100) : 0 };
  });
  comparativoCache = out;
  return out;
}

function renderComparativo() {
  const rows = computeComparativo();
  mkChart('chartComparativo', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.label),
      datasets: [
        { label: 'Vendas', data: rows.map(r => r.venda), backgroundColor: '#0090D0' },
        { label: 'Devoluções', data: rows.map(r => r.devolucao), backgroundColor: '#F59E0B' },
        { label: 'Canceladas', data: rows.map(r => r.cancelada), backgroundColor: '#DC2626' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { legend: { position: 'bottom' } },
    },
  });
  document.getElementById('tblComparativo').innerHTML = rows.map(r =>
    `<tr><td>${r.label}</td><td>${r.venda}</td><td>${r.devolucao}</td><td>${r.cancelada}</td><td>${r.pctCancelamento.toFixed(1)}%</td></tr>`
  ).join('');
}

function setMonth(key) {
  currentMonthKey = key;
  if (monthDataCache[key]) {
    NOTES = monthDataCache[key].notes;
    SUMMARY = monthDataCache[key].summary;
  } else {
    if (key === 'todos') {
      NOTES = Object.values(MONTHS).flatMap(m => m.notes.map(expandNote));
    } else {
      // Alguns documentos ficam gravados na pasta de um dia com data de emissão
      // já no mês seguinte (ex.: emissão perto da meia-noite do último dia).
      // Ao ver "só Junho", mantemos apenas datas que realmente são de junho.
      NOTES = MONTHS[key].notes.map(expandNote).filter(n => (n.data || '').startsWith(key));
    }
    NOTES.forEach((n, idx) => { n._idx = idx; });
    const label = key === 'todos' ? 'Todos os períodos' : MONTHS[key].label;
    SUMMARY = computeSummary(NOTES, label);
    monthDataCache[key] = { notes: NOTES, summary: SUMMARY };
  }
  NOTES_ATIVAS = NOTES.filter(n => !n.cancelada);

  abcRendered = false;
  devRendered = false;
  difalRendered = false;
  qualidadeRendered = false;
  fretesRendered = false;
  canceladasRendered = false;
  comparativoRendered = false;
  faltantesRendered = false;

  renderVisaoGeral();
  buildFilters();
  applyFilters();

  const activeBtn = document.querySelector('.tab-btn.active');
  const activeTab = activeBtn ? activeBtn.dataset.tab : 'visao';
  if (activeTab === 'comparativo') { comparativoRendered = true; renderComparativo(); }
  if (activeTab === 'abc') { abcRendered = true; renderABC(); }
  if (activeTab === 'devolucoes') { devRendered = true; renderDevolucoes(); }
  if (activeTab === 'difal') { difalRendered = true; renderDifal(); }
  if (activeTab === 'qualidade') { qualidadeRendered = true; renderQualidade(); }
  if (activeTab === 'fretes') { fretesRendered = true; renderFretes(); }
  if (activeTab === 'canceladas') { canceladasRendered = true; renderCanceladas(); }
  if (activeTab === 'faltantes') { faltantesRendered = true; renderNotasFaltando(); }
}

function buildMonthSelector() {
  const sel = document.getElementById('filtroMes');
  const keys = Object.keys(MONTHS).sort();
  const options = keys.map(k => `<option value="${k}">${MONTHS[k].label}</option>`);
  options.push(`<option value="todos">Todos os períodos</option>`);
  sel.innerHTML = options.join('');
  sel.value = keys[keys.length - 1];
  sel.addEventListener('change', () => setMonth(sel.value));
  setMonth(sel.value);
}

// ---------- Tabs ----------
let abcRendered = false;
let devRendered = false;
let difalRendered = false;
let qualidadeRendered = false;
let fretesRendered = false;
let canceladasRendered = false;
let comparativoRendered = false;
let faltantesRendered = false;
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'comparativo' && !comparativoRendered) {
      comparativoRendered = true;
      renderComparativo();
    }
    if (btn.dataset.tab === 'abc' && !abcRendered) {
      abcRendered = true;
      renderABC();
    }
    if (btn.dataset.tab === 'devolucoes' && !devRendered) {
      devRendered = true;
      renderDevolucoes();
    }
    if (btn.dataset.tab === 'difal' && !difalRendered) {
      difalRendered = true;
      renderDifal();
    }
    if (btn.dataset.tab === 'qualidade' && !qualidadeRendered) {
      qualidadeRendered = true;
      renderQualidade();
    }
    if (btn.dataset.tab === 'fretes' && !fretesRendered) {
      fretesRendered = true;
      renderFretes();
    }
    if (btn.dataset.tab === 'canceladas' && !canceladasRendered) {
      canceladasRendered = true;
      renderCanceladas();
    }
    if (btn.dataset.tab === 'faltantes' && !faltantesRendered) {
      faltantesRendered = true;
      renderNotasFaltando();
    }
  });
});

// ---------- Visão Geral ----------
function renderVisaoGeral() {
  const dias = SUMMARY.dias;
  const cats = SUMMARY.categorias;
  const ufs = SUMMARY.uf;

  document.getElementById('subtitle').textContent =
    `Período: ${SUMMARY.periodo} · Dados processados em ${SUMMARY.gerado_em} · ${dias.length} dias · ${NOTES.length} documentos`;

  const totalVenda = cats['Venda'] ? cats['Venda'].valor : 0;
  const totalDev = cats['Devolução'] ? cats['Devolução'].valor : 0;
  const totalLiquido = totalVenda - totalDev;
  const totalICMS = cats['Venda'] ? cats['Venda'].icms : 0;
  const qtdVenda = cats['Venda'] ? cats['Venda'].qtd : 0;

  const canc = SUMMARY.canceladas || { total_vendas: 0, valor_vendas_cancelado: 0 };
  const kpis = [
    { label: 'Vendas (bruto, sem canceladas)', value: fmtBRL(totalVenda), cls: 'venda' },
    { label: 'Devoluções', value: fmtBRL(totalDev), cls: 'devolucao' },
    { label: 'Líquido do período', value: fmtBRL(totalLiquido), cls: 'liquido' },
    { label: `ICMS vendas / ${qtdVenda} notas`, value: fmtBRL(totalICMS), cls: 'icms' },
    { label: 'Notas canceladas', value: fmtBRL(canc.valor_vendas_cancelado), sub: `${canc.total_vendas} vendas · clique para ver`, cls: 'cancelada', tab: 'canceladas' },
  ];
  document.getElementById('kpis').innerHTML = kpis.map(k =>
    `<div class="kpi ${k.cls}" ${k.tab ? `data-goto="${k.tab}"` : ''}><div class="label">${k.label}</div><div class="value">${k.value}</div>${k.sub ? `<div class="sub">${k.sub}</div>` : ''}</div>`
  ).join('');
  document.querySelectorAll('#kpis [data-goto]').forEach(el => {
    el.addEventListener('click', () => {
      const btn = document.querySelector(`.tab-btn[data-tab="${el.dataset.goto}"]`);
      if (btn) btn.click();
    });
  });

  // Destaques
  const dq = SUMMARY.destaques;
  if (!(dq && dq.melhor_dia && dq.pior_dia && dq.maior_nota)) document.getElementById('destaques').innerHTML = '';
  else {
    const destaquesHtml = [
      { label: 'Melhor dia', value: `${fmtBRL(dq.melhor_dia.liquido)}`, sub: `${dq.melhor_dia.data.slice(8)}/${dq.melhor_dia.data.slice(5,7)} · ${dq.melhor_dia.qtd_venda} vendas` },
      { label: 'Dia mais fraco', value: `${fmtBRL(dq.pior_dia.liquido)}`, sub: `${dq.pior_dia.data.slice(8)}/${dq.pior_dia.data.slice(5,7)} · ${dq.pior_dia.qtd_venda} vendas` },
      { label: 'Maior nota do mês', value: fmtBRL(dq.maior_nota.valor), sub: `Nº ${dq.maior_nota.numero} · ${dq.maior_nota.produto.slice(0,32)}` },
      { label: 'Produto mais vendido', value: dq.top_produtos[0] ? `${dq.top_produtos[0].qtd}x` : '—', sub: dq.top_produtos[0] ? dq.top_produtos[0].produto.slice(0,34) : '' },
    ];
    document.getElementById('destaques').innerHTML = destaquesHtml.map(d =>
      `<div class="destaque-card"><div class="label">${d.label}</div><div class="value">${d.value}</div><div class="sub">${d.sub}</div></div>`
    ).join('');
  }

  const tbody = document.getElementById('tblDiario');
  tbody.innerHTML = dias.map(d => {
    const cls = d.liquido >= 0 ? 'pos' : 'neg';
    return `<tr>
      <td>${d.data.slice(5)}</td>
      <td>${fmtBRL(d.venda)}</td>
      <td>${fmtBRL(d.devolucao)}</td>
      <td><span class="badge ${cls}">${fmtBRL(d.liquido)}</span></td>
      <td>${d.qtd_venda}</td>
    </tr>`;
  }).join('');

  mkChart('chartDiario', {
    type: 'bar',
    data: {
      labels: dias.map(d => d.data.slice(8) + '/' + d.data.slice(5,7)),
      datasets: [{
        label: 'Líquido do dia (R$)',
        data: dias.map(d => d.liquido),
        backgroundColor: dias.map(d => d.liquido >= 0 ? '#0090D0' : '#b91c1c'),
        borderRadius: 3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } } }
    }
  });

  const catNames = Object.keys(cats);
  mkChart('chartCategoria', {
    type: 'bar',
    data: {
      labels: catNames,
      datasets: [{
        label: 'Valor total (R$)',
        data: catNames.map(c => cats[c].valor),
        backgroundColor: ['#0090D0', '#b91c1c', '#9ca3af', '#d97706', '#065f46'],
        borderRadius: 3,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } } }
    }
  });

  const ufNames = Object.keys(ufs).sort((a,b) => ufs[b].valor - ufs[a].valor).slice(0, 12);
  mkChart('chartUF', {
    type: 'bar',
    data: {
      labels: ufNames,
      datasets: [{
        label: 'ICMS (R$)',
        data: ufNames.map(u => ufs[u].icms),
        backgroundColor: '#92400e',
        borderRadius: 3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: v => 'R$ ' + v.toFixed(0) } } }
    }
  });

  document.getElementById('footerNote').textContent =
    'Fonte: XML de NF-e, NFC-e, NFS-e e CT-e importados no sistema. Clique na aba "Notas Fiscais" para ver nota por nota.';
}

// ---------- Notas (grid + modal) ----------
let gridInstance = null;

function openDetalhe(idx) {
  const n = NOTES[idx];
  const backdrop = document.getElementById('modalBackdrop');
  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <button class="modal-close" onclick="closeDetalhe()">✕</button>
    <h3>${n.categoria} · Nº ${n.numero} ${n.cancelada ? '<span class="badge neg" style="margin-left:8px; vertical-align:middle;">CANCELADA</span>' : ''}</h3>
    <div class="modal-sub">${n.tipo_documento} · Chave: ${n.chave}</div>
    ${n.cancelada ? `
      <div style="background:#fef2f2; border:1px solid #fecaca; color:#991b1b; padding:10px 14px; border-radius:8px; font-size:12px; margin-bottom:14px;">
        <strong>Cancelada em ${(n.data_cancelamento || '').slice(0,10) || '—'}</strong><br>
        ${(n.motivo_cancelamento || 'Motivo não informado').replace('Motivo do cancelamento: ', '')}
      </div>
    ` : ''}

    <div class="modal-grid">
      <div class="modal-field"><div class="fl">Data</div><div class="fv">${n.data}</div></div>
      <div class="modal-field"><div class="fl">UF Destino</div><div class="fv">${n.uf_destino || '—'}</div></div>
      <div class="modal-field"><div class="fl">Destinatário</div><div class="fv">${n.destinatario || '—'}</div></div>
      <div class="modal-field"><div class="fl">CNPJ/CPF</div><div class="fv">${n.doc_destinatario || '—'}</div></div>
      <div class="modal-field" style="grid-column: span 2;"><div class="fl">Produto / Serviço</div><div class="fv">${n.produto || '—'}</div></div>
      <div class="modal-field"><div class="fl">CFOP</div><div class="fv">${n.cfop || '—'}</div></div>
      <div class="modal-field"><div class="fl">NCM</div><div class="fv">${n.ncm || '—'}</div></div>
      <div class="modal-field"><div class="fl">Alíquota ICMS</div><div class="fv">${n.aliquota_icms || '—'}</div></div>
      <div class="modal-field"><div class="fl">Valor Total</div><div class="fv">${fmtBRL(n.valor_nf)}</div></div>
    </div>

    <div class="modal-section-title">Impostos</div>
    <div class="tax-grid">
      <div class="tax-chip"><div class="fl">ICMS</div><div class="fv">${fmtBRL(n.valor_icms)}</div></div>
      <div class="tax-chip"><div class="fl">IPI</div><div class="fv">${fmtBRL(n.valor_ipi)}</div></div>
      <div class="tax-chip"><div class="fl">PIS</div><div class="fv">${fmtBRL(n.valor_pis)}</div></div>
      <div class="tax-chip"><div class="fl">COFINS</div><div class="fv">${fmtBRL(n.valor_cofins)}</div></div>
      <div class="tax-chip"><div class="fl">IBS</div><div class="fv">${fmtBRL(n.valor_ibs)}</div></div>
      <div class="tax-chip"><div class="fl">CBS</div><div class="fv">${fmtBRL(n.valor_cbs)}</div></div>
      <div class="tax-chip"><div class="fl">Frete</div><div class="fv">${fmtBRL(n.valor_frete)}</div></div>
      <div class="tax-chip"><div class="fl">Total Tributos</div><div class="fv">${fmtBRL(n.valor_total_tributos)}</div></div>
      <div class="tax-chip" style="border-color:#0090D0;"><div class="fl">DIFAL</div><div class="fv">${n.difal_pendente ? 'Pendente' : fmtBRL(n.valor_difal)}</div></div>
      <div class="tax-chip" style="border-color:#0090D0;"><div class="fl">FCP (DIFAL)</div><div class="fv">${n.difal_pendente ? 'Pendente' : fmtBRL(n.valor_fcp_difal)}</div></div>
      ${(!n.difal_pendente && ((n.valor_difal||0) > 0 || (n.valor_fcp_difal||0) > 0)) ? `
      <div class="tax-chip" style="border-color:#0090D0;"><div class="fl">Pagamento DIFAL</div><div class="fv">${n.difal_pago ? 'Pago' + (n.difal_data_pagamento ? ' em ' + n.difal_data_pagamento : '') : 'Não Pago'}</div></div>
      ${n.difal_pago && (n.difal_juros || n.difal_multa) ? `<div class="tax-chip" style="border-color:#d97706;"><div class="fl">Juros</div><div class="fv">${fmtBRL(n.difal_juros||0)}</div></div>
      <div class="tax-chip" style="border-color:#d97706;"><div class="fl">Multa</div><div class="fv">${fmtBRL(n.difal_multa||0)}</div></div>` : ''}
      ${n.difal_comprovante ? `<div class="tax-chip" style="border-color:#0090D0; grid-column: span 2;"><div class="fl">Comprovante</div><div class="fv"><a href="${fileUrl(n.difal_comprovante)}" target="_blank" rel="noopener">Abrir comprovante</a></div></div>` : ''}
      ` : ''}
    </div>
  `;
  backdrop.classList.add('show');
}
function closeDetalhe() {
  document.getElementById('modalBackdrop').classList.remove('show');
}
document.getElementById('modalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modalBackdrop') closeDetalhe();
});

function buildFilters() {
  const cats = ['(Todas categorias)', ...Array.from(new Set(NOTES.map(n => n.categoria))).sort()];
  const ufs = ['(Todas UFs)', ...Array.from(new Set(NOTES.map(n => n.uf_destino).filter(Boolean))).sort()];
  const selCat = document.getElementById('filtroCategoria');
  const selUF = document.getElementById('filtroUF');
  selCat.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  selUF.innerHTML = ufs.map(u => `<option value="${u}">${u}</option>`).join('');
  if (cats.includes('Venda')) selCat.value = 'Venda';
  selCat.addEventListener('change', applyFilters);
  selUF.addEventListener('change', applyFilters);
  document.getElementById('filtroSoDifal').addEventListener('change', applyFilters);
  document.getElementById('filtroStatus').addEventListener('change', applyFilters);
}

function applyFilters() {
  const cat = document.getElementById('filtroCategoria').value;
  const uf = document.getElementById('filtroUF').value;
  const somenteDifal = document.getElementById('filtroSoDifal').checked;
  const status = document.getElementById('filtroStatus').value;
  // NOTES já vem com _idx atribuído em setMonth(); evitamos clonar os até 51 mil
  // objetos a cada troca de filtro (isso sozinho já deixava o painel lento).
  let filtered = NOTES;
  if (cat && !cat.startsWith('(')) filtered = filtered.filter(n => n.categoria === cat);
  if (uf && !uf.startsWith('(')) filtered = filtered.filter(n => n.uf_destino === uf);
  if (somenteDifal) filtered = filtered.filter(n => (n.valor_difal || 0) > 0 || n.difal_pendente);
  if (status === 'ativas') filtered = filtered.filter(n => !n.cancelada);
  else if (status === 'canceladas') filtered = filtered.filter(n => n.cancelada);
  document.getElementById('notesCount').textContent = `${filtered.length} de ${NOTES.length} documentos`;
  renderGrid(filtered);
}

function fmtDifalCell(n) {
  if (n.categoria !== 'Venda') return '—';
  if (n.difal_pendente) return 'Pendente';
  return fmtBRL(n.valor_difal || 0);
}

function renderGrid(rows) {
  const data = rows.map(n => [
    n.data, n.categoria, n.numero, n.destinatario || '—',
    (n.produto || '—').slice(0, 60), fmtBRL(n.valor_nf), n.uf_destino || '—',
    fmtDifalCell(n), n.cancelada ? 'Cancelada' : '—', n._idx
  ]);

  if (gridInstance) {
    gridInstance.updateConfig({ data }).forceRender();
    return;
  }

  gridInstance = new gridjs.Grid({
    columns: [
      { name: 'Data', width: '90px' },
      { name: 'Categoria', width: '110px' },
      { name: 'Número', width: '90px' },
      { name: 'Destinatário' },
      { name: 'Produto' },
      { name: 'Valor', width: '110px' },
      { name: 'UF', width: '55px' },
      { name: 'DIFAL', width: '100px' },
      { name: 'Status', width: '90px' },
      { name: 'idx', hidden: true },
    ],
    data,
    search: true,
    sort: true,
    pagination: { limit: 20 },
    className: { table: 'gridjs-table' },
  }).render(document.getElementById('gridNotas'));

  document.getElementById('gridNotas').addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;
    const idx = parseInt(cells[cells.length - 1].textContent, 10);
    if (!isNaN(idx)) openDetalhe(idx);
  });
}

// ---------- Curva ABC ----------
let abcData = null;
let gridABCInstance = null;

function computeABC() {
  const prodStats = new Map();
  for (const n of NOTES_ATIVAS) {
    if (n.categoria !== 'Venda') continue;
    const nome = (n.produto || 'Sem descrição').split(';')[0].trim();
    if (!prodStats.has(nome)) prodStats.set(nome, { qtd: 0, valor: 0 });
    const s = prodStats.get(nome);
    s.qtd += 1;
    s.valor += (n.valor_nf || 0);
  }
  const ranked = Array.from(prodStats.entries())
    .map(([produto, s]) => ({ produto, qtd: s.qtd, valor: s.valor }))
    .sort((a, b) => b.valor - a.valor);

  const total = ranked.reduce((acc, r) => acc + r.valor, 0);
  let cum = 0;
  for (const r of ranked) {
    cum += r.valor;
    r.pctCum = total ? (cum / total * 100) : 0;
    r.classe = r.pctCum <= 80 ? 'A' : (r.pctCum <= 95 ? 'B' : 'C');
  }
  return { ranked, total };
}

function renderABC() {
  abcData = computeABC();
  const { ranked, total } = abcData;
  const byClasse = { A: [], B: [], C: [] };
  ranked.forEach(r => byClasse[r.classe].push(r));

  const kpis = ['A', 'B', 'C'].map(c => {
    const items = byClasse[c];
    const valor = items.reduce((a, r) => a + r.valor, 0);
    const pct = total ? (valor / total * 100) : 0;
    return { label: `Classe ${c}`, value: `${items.length} produtos`, sub: `${fmtBRL(valor)} · ${pct.toFixed(1)}% do faturamento` };
  });
  const topQtd = [...ranked].sort((a, b) => b.qtd - a.qtd)[0];
  kpis.push({ label: 'Mais vendido (quantidade)', value: topQtd ? `${topQtd.qtd}x` : '—', sub: topQtd ? topQtd.produto.slice(0, 40) : '' });

  document.getElementById('abcKpis').innerHTML = kpis.map(k =>
    `<div class="destaque-card"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`
  ).join('');

  // Pareto chart (top 30 produtos)
  const top30 = ranked.slice(0, 30);
  mkChart('chartPareto', {
    data: {
      labels: top30.map((r, i) => r.produto.length > 18 ? r.produto.slice(0, 18) + '…' : r.produto),
      datasets: [
        {
          type: 'bar', label: 'Valor (R$)', data: top30.map(r => r.valor),
          backgroundColor: top30.map(r => r.classe === 'A' ? '#0090D0' : r.classe === 'B' ? '#909090' : '#d1d5db'),
          yAxisID: 'y',
        },
        {
          type: 'line', label: '% acumulado', data: top30.map(r => r.pctCum),
          borderColor: '#d97706', backgroundColor: '#d97706', yAxisID: 'y1',
          tension: 0.2, pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxRotation: 60, minRotation: 60, font: { size: 9 } } },
        y: { position: 'left', ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } },
        y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { callback: v => v + '%' } },
      },
    },
  });

  // Distribuição por classe (contagem de produtos)
  mkChart('chartABCDist', {
    type: 'doughnut',
    data: {
      labels: ['Classe A', 'Classe B', 'Classe C'],
      datasets: [{
        data: ['A', 'B', 'C'].map(c => byClasse[c].length),
        backgroundColor: ['#0090D0', '#909090', '#d1d5db'],
      }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  applyABCFilter();
}

function applyABCFilter() {
  const classe = document.getElementById('filtroABC').value;
  const filtered = classe ? abcData.ranked.filter(r => r.classe === classe) : abcData.ranked;
  document.getElementById('abcCount').textContent = `${filtered.length} de ${abcData.ranked.length} produtos`;

  const data = filtered.map((r, i) => [
    abcData.ranked.indexOf(r) + 1, r.classe, r.produto, r.qtd, fmtBRL(r.valor), r.pctCum.toFixed(1) + '%',
  ]);

  if (gridABCInstance) {
    gridABCInstance.updateConfig({ data }).forceRender();
    return;
  }
  gridABCInstance = new gridjs.Grid({
    columns: [
      { name: '#', width: '50px' },
      { name: 'Classe', width: '70px' },
      { name: 'Produto' },
      { name: 'Qtd', width: '70px' },
      { name: 'Valor', width: '110px' },
      { name: '% Acum.', width: '80px' },
    ],
    data,
    search: true,
    sort: true,
    pagination: { limit: 20 },
  }).render(document.getElementById('gridABC'));
}
document.getElementById('filtroABC').addEventListener('change', applyABCFilter);

// ---------- Devoluções por produto ----------
let devData = null;
let gridDevInstance = null;

function computeDevolucoes() {
  const vendaStats = new Map();
  const devStats = new Map();
  for (const n of NOTES_ATIVAS) {
    const nome = (n.produto || 'Sem descrição').split(';')[0].trim();
    if (n.categoria === 'Venda') {
      if (!vendaStats.has(nome)) vendaStats.set(nome, { qtd: 0, valor: 0 });
      const s = vendaStats.get(nome);
      s.qtd += 1; s.valor += (n.valor_nf || 0);
    } else if (n.categoria === 'Devolução') {
      if (!devStats.has(nome)) devStats.set(nome, { qtd: 0, valor: 0, bestIdx: null, bestValor: -1 });
      const s = devStats.get(nome);
      s.qtd += 1; s.valor += (n.valor_nf || 0);
      // guarda a devolução de maior valor do produto para permitir clicar e ir direto ao detalhe
      if ((n.valor_nf || 0) > s.bestValor) { s.bestValor = n.valor_nf || 0; s.bestIdx = n._idx; }
    }
  }
  const produtos = [];
  for (const [nome, dev] of devStats.entries()) {
    const venda = vendaStats.get(nome) || { qtd: 0, valor: 0 };
    produtos.push({
      produto: nome, devQtd: dev.qtd, devValor: dev.valor,
      vendaQtd: venda.qtd, vendaValor: venda.valor,
      taxa: venda.qtd ? (dev.qtd / venda.qtd * 100) : null,
      devIdx: dev.bestIdx,
    });
  }
  const totalDevQtd = Array.from(devStats.values()).reduce((a, s) => a + s.qtd, 0);
  const totalDevValor = Array.from(devStats.values()).reduce((a, s) => a + s.valor, 0);
  const totalVendaQtd = Array.from(vendaStats.values()).reduce((a, s) => a + s.qtd, 0);
  return { produtos, totalDevQtd, totalDevValor, totalVendaQtd };
}

function renderDevolucoes() {
  devData = computeDevolucoes();
  const { produtos, totalDevQtd, totalDevValor, totalVendaQtd } = devData;
  const taxaGeral = totalVendaQtd ? (totalDevQtd / totalVendaQtd * 100) : 0;
  const piorTaxa = [...produtos].filter(p => p.vendaQtd >= 3 && p.taxa !== null).sort((a, b) => b.taxa - a.taxa)[0];
  const piorQtd = [...produtos].sort((a, b) => b.devQtd - a.devQtd)[0];

  const kpis = [
    { label: 'Total devolvido', value: fmtBRL(totalDevValor), sub: `${totalDevQtd} devoluções no mês` },
    { label: 'Taxa geral de devolução', value: `${taxaGeral.toFixed(1)}%`, sub: `${totalDevQtd} de ${totalVendaQtd} vendas` },
    { label: 'Mais devolvido (quantidade)', value: piorQtd ? `${piorQtd.devQtd}x` : '—', sub: piorQtd ? piorQtd.produto.slice(0, 36) : '' },
    { label: 'Maior taxa de devolução', value: piorTaxa ? `${piorTaxa.taxa.toFixed(0)}%` : '—', sub: piorTaxa ? `${piorTaxa.devQtd}/${piorTaxa.vendaQtd} · ${piorTaxa.produto.slice(0,28)}` : '' },
  ];
  document.getElementById('devKpis').innerHTML = kpis.map(k =>
    `<div class="destaque-card"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`
  ).join('');

  const top10Taxa = [...produtos].filter(p => p.vendaQtd >= 3 && p.taxa !== null)
    .sort((a, b) => b.taxa - a.taxa).slice(0, 10)
    .map(p => ({
      titulo: p.produto,
      sub: `${p.devQtd} devolvidas de ${p.vendaQtd} vendidas · ${fmtBRL(p.devValor)}`,
      valorRaw: p.taxa,
      valueLabel: `${p.taxa.toFixed(1)}%`,
      idx: p.devIdx,
    }));
  renderRankList('rankDevTaxa', top10Taxa);

  // Ranking por quantidade absoluta devolvida — não usa taxa, então não é dominado por
  // produtos com amostra minúscula (1 venda + 1 devolução = 100%, mas não diz muita coisa sozinho).
  const top10Qtd = [...produtos]
    .sort((a, b) => b.devQtd - a.devQtd).slice(0, 10)
    .map(p => ({
      titulo: p.produto,
      sub: `${p.devQtd} devolvidas de ${p.vendaQtd} vendidas · ${fmtBRL(p.devValor)}${p.taxa !== null ? ' · ' + p.taxa.toFixed(1) + '% de taxa' : ''}`,
      valorRaw: p.devQtd,
      valueLabel: `${p.devQtd}x`,
      idx: p.devIdx,
    }));
  renderRankList('rankDevQtd', top10Qtd);

  showAlerta('devAlerta', '');

  renderGridDevNotas();

  const top15 = [...produtos].filter(p => p.vendaQtd >= 3 && p.taxa !== null)
    .sort((a, b) => b.taxa - a.taxa).slice(0, 15);
  mkChart('chartDevTaxa', {
    type: 'bar',
    data: {
      labels: top15.map(p => p.produto.length > 22 ? p.produto.slice(0, 22) + '…' : p.produto),
      datasets: [{
        label: 'Taxa de devolução (%)',
        data: top15.map(p => p.taxa),
        backgroundColor: top15.map(p => p.taxa >= 40 ? '#b91c1c' : p.taxa >= 20 ? '#d97706' : '#0090D0'),
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { callback: v => v + '%' } } },
    },
  });

  renderGridDev('qtd');
}

function renderGridDev(sortBy) {
  const arr = [...devData.produtos];
  if (sortBy === 'taxa') arr.sort((a, b) => (b.taxa ?? -1) - (a.taxa ?? -1));
  else if (sortBy === 'valor') arr.sort((a, b) => b.devValor - a.devValor);
  else arr.sort((a, b) => b.devQtd - a.devQtd);

  document.getElementById('devCount').textContent = `${arr.length} produtos com devolução`;

  const data = arr.map(p => [
    p.produto, p.devQtd, p.vendaQtd, p.taxa !== null ? p.taxa.toFixed(1) + '%' : '—', fmtBRL(p.devValor),
  ]);

  if (gridDevInstance) {
    gridDevInstance.updateConfig({ data }).forceRender();
    return;
  }
  gridDevInstance = new gridjs.Grid({
    columns: [
      { name: 'Produto' },
      { name: 'Devolvidos', width: '100px' },
      { name: 'Vendidos (mês)', width: '110px' },
      { name: 'Taxa', width: '80px' },
      { name: 'Valor Devolvido', width: '130px' },
    ],
    data,
    search: true,
    sort: true,
    pagination: { limit: 20 },
  }).render(document.getElementById('gridDev'));
}
document.getElementById('ordenarDev').addEventListener('change', (e) => renderGridDev(e.target.value));

let gridDevNotasInstance = null;
function renderGridDevNotas() {
  const devNotes = [...NOTES_ATIVAS].filter(n => n.categoria === 'Devolução').sort((a, b) => (b.valor_nf || 0) - (a.valor_nf || 0));
  document.getElementById('devNotasCount').textContent = `${devNotes.length} devoluções no período`;

  // Produto vai inteiro na coluna (não truncado) — o formatter abaixo só encurta a exibição.
  // Antes o texto já chegava cortado em 50 caracteres e a busca da tabela não encontrava
  // nada que estivesse depois do corte (ex.: "Moldura 9 Polegadas Citroen C4 Cactus C4 Lounge...").
  const data = devNotes.map(n => [
    n.data, n.numero, n.destinatario || '—', n.produto || '—', fmtBRL(n.valor_nf), n.uf_destino || '—', n._idx,
  ]);

  if (gridDevNotasInstance) {
    gridDevNotasInstance.updateConfig({ data }).forceRender();
    return;
  }
  gridDevNotasInstance = new gridjs.Grid({
    columns: [
      { name: 'Data', width: '90px' },
      { name: 'Número', width: '90px' },
      { name: 'Destinatário' },
      { name: 'Produto', formatter: (cell) => cell && cell.length > 50 ? cell.slice(0, 50) + '…' : (cell || '—') },
      { name: 'Valor', width: '110px' },
      { name: 'UF', width: '60px' },
      { name: 'idx', hidden: true },
    ],
    data,
    search: true, sort: true, pagination: { limit: 20 },
  }).render(document.getElementById('gridDevNotas'));

  document.getElementById('gridDevNotas').addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;
    const idx = parseInt(cells[cells.length - 1].textContent, 10);
    if (!isNaN(idx)) openDetalhe(idx);
  });
}

// ---------- DIFAL por estado ----------
let difalDataCache = null;

function computeDifal() {
  const byUF = new Map();
  let pendentes = 0;
  for (const n of NOTES_ATIVAS) {
    if (n.categoria !== 'Venda') continue;
    if (n.difal_pendente) { pendentes++; continue; }
    if (!((n.valor_difal || 0) > 0 || (n.valor_fcp_difal || 0) > 0)) continue;
    const uf = n.uf_destino || '—';
    if (!byUF.has(uf)) byUF.set(uf, { qtd: 0, difal: 0, fcp: 0, pago: 0, pendente: 0 });
    const s = byUF.get(uf);
    s.qtd += 1;
    s.difal += (n.valor_difal || 0);
    s.fcp += (n.valor_fcp_difal || 0);
    const total = (n.valor_difal || 0) + (n.valor_fcp_difal || 0);
    if (n.difal_pago) s.pago += total; else s.pendente += total;
  }
  const list = Array.from(byUF.entries()).map(([uf, s]) => ({
    uf, qtd: s.qtd, difal: s.difal, fcp: s.fcp, total: s.difal + s.fcp,
    pago: s.pago, pendente: s.pendente,
  })).sort((a, b) => b.total - a.total);
  return { list, pendentes };
}

// Resumo de juros e multa efetivamente pagos, extraídos dos comprovantes (2026).
function computeDifalEncargos() {
  let juros = 0, multa = 0, qtdComEncargo = 0, qtdPagas = 0;
  for (const n of NOTES_ATIVAS) {
    if (n.categoria !== 'Venda') continue;
    if (!n.difal_pago) continue;
    qtdPagas++;
    const j = n.difal_juros || 0, m = n.difal_multa || 0;
    juros += j; multa += m;
    if (j > 0 || m > 0) qtdComEncargo++;
  }
  return { juros, multa, qtdComEncargo, qtdPagas };
}

function renderDifalEncargos() {
  const { juros, multa, qtdComEncargo, qtdPagas } = computeDifalEncargos();
  const kpis = [
    { label: 'Juros pagos', value: fmtBRL(juros), sub: `${qtdPagas} notas com DIFAL pago` },
    { label: 'Multa paga', value: fmtBRL(multa), sub: `${qtdComEncargo} notas com juros e/ou multa` },
    { label: 'Total de encargos', value: fmtBRL(juros + multa), sub: 'juros + multa, nas notas pagas' },
  ];
  document.getElementById('difalEncargosKpis').innerHTML = kpis.map(k =>
    `<div class="destaque-card"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`
  ).join('');
}

function renderDifal() {
  difalDataCache = computeDifal();
  const { list, pendentes } = difalDataCache;
  const totalDifal = list.reduce((a, r) => a + r.difal, 0);
  const totalFcp = list.reduce((a, r) => a + r.fcp, 0);
  const totalGeral = totalDifal + totalFcp;
  const pagoTotal = list.reduce((a, r) => a + r.pago, 0);

  const kpis = [
    { label: 'DIFAL total', value: fmtBRL(totalDifal), sub: `${list.length} estados` },
    { label: 'FCP total', value: fmtBRL(totalFcp), sub: 'Fundo de combate à pobreza' },
    { label: 'Total DIFAL + FCP', value: fmtBRL(totalGeral), sub: `${fmtBRL(pagoTotal)} já pago` },
    { label: 'Pendente de pagamento', value: fmtBRL(totalGeral - pagoTotal), sub: `nota a nota, veja abaixo` },
  ];
  document.getElementById('difalKpis').innerHTML = kpis.map(k =>
    `<div class="destaque-card"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`
  ).join('');

  const alerta = document.getElementById('difalAlerta');
  if (pendentes > 0) {
    alerta.style.display = 'block';
    alerta.textContent = `⚠ ${pendentes} vendas ainda sem cálculo de DIFAL (dias cuja pasta de origem ficou indisponível). Os totais acima ainda não refletem o mês inteiro.`;
  } else {
    alerta.style.display = 'none';
  }

  mkChart('chartDifal', {
    type: 'bar',
    data: {
      labels: list.map(r => r.uf),
      datasets: [
        { label: 'DIFAL (R$)', data: list.map(r => r.difal), backgroundColor: '#0090D0', borderRadius: 3, stack: 's' },
        { label: 'FCP (R$)', data: list.map(r => r.fcp), backgroundColor: '#d97706', borderRadius: 3, stack: 's' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => 'R$ ' + v.toFixed(0) } } },
    },
  });

  const selUF = document.getElementById('filtroDifalUF');
  selUF.innerHTML = '<option value="">(Todas UFs)</option>' + list.map(r => `<option value="${r.uf}">${r.uf}</option>`).join('');
  selUF.addEventListener('change', applyDifalFilter);

  applyDifalFilter();
  renderDifalNotasHierarquia();
  renderDifalEncargos();
}

let gridDifalInstance = null;
function applyDifalFilter() {
  const uf = document.getElementById('filtroDifalUF').value;
  let filtered = difalDataCache.list;
  if (uf) filtered = filtered.filter(r => r.uf === uf);
  document.getElementById('difalCount').textContent = `${filtered.length} de ${difalDataCache.list.length} estados`;

  const data = filtered.map(r => [
    r.uf, r.qtd, fmtBRL(r.difal), fmtBRL(r.fcp), fmtBRL(r.total), fmtBRL(r.pago), fmtBRL(r.pendente),
  ]);

  if (gridDifalInstance) {
    gridDifalInstance.updateConfig({ data }).forceRender();
    return;
  }
  gridDifalInstance = new gridjs.Grid({
    columns: [
      { name: 'UF', width: '60px' },
      { name: 'Qtde Vendas', width: '100px' },
      { name: 'DIFAL', width: '100px' },
      { name: 'FCP', width: '100px' },
      { name: 'Total', width: '100px' },
      { name: 'Pago', width: '100px' },
      { name: 'Pendente', width: '100px' },
    ],
    data,
    search: true,
    sort: true,
    pagination: { limit: 20 },
  }).render(document.getElementById('gridDifal'));
}

// ---------- DIFAL nota a nota — por mês e por dia ----------
let difalNotasFlatCache = null;

function computeDifalNotasFlat() {
  // Reaproveita NOTES (já expandido e com _idx atribuído em setMonth — respeita o
  // #filtroMes: um mês específico, ou "todos" quando NOTES já vem de todos os meses
  // combinados). Isso garante que _idx bata certinho com o array que openDetalhe usa.
  return NOTES
    .filter(n => !n.cancelada && n.categoria === 'Venda' &&
      (n.difal_pendente || (n.valor_difal || 0) > 0 || (n.valor_fcp_difal || 0) > 0))
    .map(n => { n._mes = (n.data || '').slice(0, 7); return n; });
}

function renderDifalNotasHierarquia() {
  difalNotasFlatCache = computeDifalNotasFlat();
  const ufs = Array.from(new Set(difalNotasFlatCache.map(n => n.uf_destino).filter(Boolean))).sort();
  const selUF = document.getElementById('filtroDifalNotaUF');
  selUF.innerHTML = '<option value="">(Todas UFs)</option>' + ufs.map(u => `<option value="${u}">${u}</option>`).join('');
  selUF.onchange = applyDifalNotaHierarquia;
  document.getElementById('filtroDifalNotaStatus').onchange = applyDifalNotaHierarquia;
  applyDifalNotaHierarquia();
}

function applyDifalNotaHierarquia() {
  const uf = document.getElementById('filtroDifalNotaUF').value;
  const status = document.getElementById('filtroDifalNotaStatus').value;
  let filtered = difalNotasFlatCache;
  if (uf) filtered = filtered.filter(n => n.uf_destino === uf);
  if (status) filtered = filtered.filter(n => (n.difal_pago ? 'Pago' : 'Não Pago') === status);

  document.getElementById('difalNotaCount').textContent = `${filtered.length} de ${difalNotasFlatCache.length} vendas com DIFAL`;

  // Restringe aos meses relevantes: se um mês específico está selecionado no filtro
  // global, mostra só ele (mês>dia>nota vira dia>nota); se "todos", mostra mês>dia>nota.
  const showAllMonths = currentMonthKey === 'todos';
  const monthsToShow = showAllMonths ? Array.from(new Set(filtered.map(n => n._mes))).sort().reverse()
                                      : [currentMonthKey];

  const container = document.getElementById('difalNotasHierarquia');
  if (!filtered.length) {
    container.innerHTML = '<p style="color:#6b7280; font-size:13px;">Nenhuma venda com DIFAL encontrada para esse filtro.</p>';
    return;
  }

  const CHEVRON = '<svg class="difal-chevron" viewBox="0 0 20 20" fill="none"><path d="M7 5l6 5-6 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const WEEKDAYS = ['dom','seg','ter','qua','qui','sex','sáb'];
  function fmtDiaCurto(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return iso || '—';
    const wd = WEEKDAYS[new Date(iso + 'T00:00:00').getDay()];
    return { curto: `${m[3]}/${m[2]}`, weekday: wd };
  }
  function pagoPill(pagas, total) {
    const cls = pagas === 0 ? 'none-paid' : (pagas === total ? 'all-paid' : 'partial-paid');
    return `<span class="difal-pago-pill ${cls}">${pagas}/${total} pagas</span>`;
  }

  let html = '';
  for (const mkey of monthsToShow) {
    const notesDoMes = filtered.filter(n => n._mes === mkey);
    if (!notesDoMes.length) continue;
    const mLabel = (MONTHS[mkey] && MONTHS[mkey].label) || mkey;
    const mTotal = notesDoMes.reduce((a, n) => a + (n.valor_difal || 0) + (n.valor_fcp_difal || 0), 0);
    const mPago = notesDoMes.filter(n => n.difal_pago).length;

    const byDay = new Map();
    for (const n of notesDoMes) {
      const day = n.data || '—';
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(n);
    }
    const days = Array.from(byDay.keys()).sort().reverse();

    let daysHtml = '';
    for (const day of days) {
      const notesDoDia = byDay.get(day).sort((a, b) => ((b.valor_difal||0)+(b.valor_fcp_difal||0)) - ((a.valor_difal||0)+(a.valor_fcp_difal||0)));
      const dTotal = notesDoDia.reduce((a, n) => a + (n.valor_difal || 0) + (n.valor_fcp_difal || 0), 0);
      const dPago = notesDoDia.filter(n => n.difal_pago).length;
      const { curto, weekday } = fmtDiaCurto(day);
      const rows = notesDoDia.map(n => {
        const total = (n.valor_difal || 0) + (n.valor_fcp_difal || 0);
        const statusBadge = n.difal_pendente
          ? `<span class="badge neg">Sem cálculo</span>`
          : (n.difal_pago ? `<span class="badge pos">Pago</span>` : `<span class="badge neg">Não Pago</span>`);
        return `<tr class="difal-nota-row" data-idx="${n._idx}">
          <td>${n.numero}</td>
          <td>${(n.destinatario || '—').replace(/</g,'&lt;')}</td>
          <td>${n.uf_destino || '—'}</td>
          <td>${n.difal_pendente ? '—' : fmtBRL(n.valor_difal || 0)}</td>
          <td>${n.difal_pendente ? '—' : fmtBRL(n.valor_fcp_difal || 0)}</td>
          <td>${n.difal_pendente ? '—' : fmtBRL(total)}</td>
          <td>${statusBadge}</td>
          <td>${n.difal_comprovante ? `<a href="${fileUrl(n.difal_comprovante)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Ver comprovante</a>` : '—'}</td>
        </tr>`;
      }).join('');

      daysHtml += `
        <details class="difal-day-group">
          <summary>
            <span class="difal-summary-left">
              ${CHEVRON}
              <span class="difal-day-date">${curto}<span class="difal-day-weekday">${weekday}</span></span>
              <span class="difal-day-qtd">${notesDoDia.length} nota${notesDoDia.length===1?'':'s'}</span>
            </span>
            <span class="difal-summary-right">
              <span class="difal-total-amount">${fmtBRL(dTotal)}</span>
              ${pagoPill(dPago, notesDoDia.length)}
            </span>
          </summary>
          <table class="difal-nota-table">
            <thead><tr>
              <th>Número</th><th>Destinatário</th><th>UF</th><th>DIFAL</th><th>FCP</th><th>Total</th><th>Status</th><th>Comprovante</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </details>`;
    }

    html += `
      <details class="difal-month-group" ${showAllMonths ? '' : 'open'}>
        <summary>
          <span class="difal-summary-left">
            ${CHEVRON}
            <span class="difal-month-label">${mLabel}</span>
            <span class="difal-day-qtd">${notesDoMes.length} nota${notesDoMes.length===1?'':'s'}</span>
          </span>
          <span class="difal-summary-right">
            <span class="difal-total-amount">${fmtBRL(mTotal)}</span>
            ${pagoPill(mPago, notesDoMes.length)}
          </span>
        </summary>
        <div class="difal-days-wrap">${daysHtml}</div>
      </details>`;
  }

  container.innerHTML = html;
  container.querySelectorAll('.difal-nota-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.idx, 10);
      if (!isNaN(idx)) openDetalhe(idx);
    });
  });
}

// ---------- Qualidade de Dados ----------
let gridNcmInstance = null;
let gridQualidadeInstance = null;
let qualidadeIssuesCache = null;

function computeQualidade() {
  // 1) NCM divergente pro mesmo produto (só notas de item único, sem virgula no NCM)
  const ncmByProd = new Map();
  for (const n of NOTES_ATIVAS) {
    if (n.categoria !== 'Venda') continue;
    const ncm = n.ncm || '';
    if (ncm.includes(',')) continue;
    const p = (n.produto || '').split(';')[0].trim();
    if (!p) continue;
    if (!ncmByProd.has(p)) ncmByProd.set(p, new Map());
    const m = ncmByProd.get(p);
    m.set(ncm, (m.get(ncm) || 0) + 1);
  }
  const ncmDivergentes = [];
  for (const [produto, counts] of ncmByProd.entries()) {
    if (counts.size > 1) {
      const detalhe = Array.from(counts.entries()).map(([ncm, qtd]) => `${ncm} (${qtd}x)`).join(' vs ');
      ncmDivergentes.push({ produto, detalhe, total: Array.from(counts.values()).reduce((a,b)=>a+b,0) });
    }
  }
  ncmDivergentes.sort((a, b) => b.total - a.total);

  // 2) notas com campos faltando ou valores fora do padrao
  const issues = [];
  for (const n of NOTES) {
    const problems = [];
    if (n.categoria === 'Venda' || n.categoria === 'Devolução') {
      if (!n.uf_destino) problems.push('Sem UF de destino');
      if (!n.cfop) problems.push('Sem CFOP');
      if (!n.ncm) problems.push('Sem NCM');
      if (!n.valor_nf || n.valor_nf <= 0) problems.push('Valor zerado ou negativo');
      if (!n.chave || n.chave.length !== 44) problems.push('Chave de acesso inválida');
    }
    for (const p of problems) {
      issues.push({ tipo: p, data: n.data, categoria: n.categoria, numero: n.numero, produto: (n.produto||'').slice(0,50), valor: n.valor_nf });
    }
  }
  return { ncmDivergentes, issues };
}

function renderQualidade() {
  const { ncmDivergentes, issues } = computeQualidade();
  qualidadeIssuesCache = issues;

  const tipos = Array.from(new Set(issues.map(i => i.tipo)));
  const kpis = [
    { label: 'Produtos c/ NCM divergente', value: ncmDivergentes.length, sub: 'mesmo produto, códigos diferentes' },
    { label: 'Notas com pendências', value: issues.length, sub: `de ${NOTES.length} documentos verificados` },
    { label: 'Tipos de problema encontrados', value: tipos.length, sub: tipos.slice(0,2).join(', ') || '—' },
    { label: 'Notas OK', value: (NOTES.length - new Set(issues.map(i=>i.numero+i.data)).size), sub: 'sem pendências identificadas' },
  ];
  document.getElementById('qualidadeKpis').innerHTML = kpis.map(k =>
    `<div class="destaque-card"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`
  ).join('');

  const ncmData = ncmDivergentes.map(d => [d.produto, d.detalhe, d.total]);
  if (gridNcmInstance) {
    gridNcmInstance.updateConfig({ data: ncmData }).forceRender();
  } else {
    gridNcmInstance = new gridjs.Grid({
      columns: [{ name: 'Produto' }, { name: 'NCMs encontrados' }, { name: 'Qtde Vendas', width: '110px' }],
      data: ncmData,
      search: true, sort: true, pagination: { limit: 10 },
    }).render(document.getElementById('gridNcm'));
  }

  const selTipo = document.getElementById('filtroQualidadeTipo');
  selTipo.innerHTML = '<option value="">(Todos os tipos)</option>' + tipos.map(t => `<option value="${t}">${t}</option>`).join('');
  selTipo.addEventListener('change', applyQualidadeFilter);
  applyQualidadeFilter();
}

function applyQualidadeFilter() {
  const tipo = document.getElementById('filtroQualidadeTipo').value;
  const filtered = tipo ? qualidadeIssuesCache.filter(i => i.tipo === tipo) : qualidadeIssuesCache;
  document.getElementById('qualidadeCount').textContent = `${filtered.length} de ${qualidadeIssuesCache.length} pendências`;
  const data = filtered.map(i => [i.data, i.categoria, i.numero, i.tipo, i.produto, fmtBRL(i.valor)]);
  if (gridQualidadeInstance) {
    gridQualidadeInstance.updateConfig({ data }).forceRender();
    return;
  }
  gridQualidadeInstance = new gridjs.Grid({
    columns: [
      { name: 'Data', width: '90px' }, { name: 'Categoria', width: '110px' }, { name: 'Número', width: '90px' },
      { name: 'Problema', width: '160px' }, { name: 'Produto' }, { name: 'Valor', width: '110px' },
    ],
    data, search: true, sort: true, pagination: { limit: 20 },
  }).render(document.getElementById('gridQualidade'));
}

// ---------- Fretes por Estado ----------
let gridFretesInstance = null;

function computeFretes() {
  const byUF = new Map();
  for (const n of NOTES) {
    if (n.categoria !== 'CT-e (Frete)') continue;
    const uf = n.uf_destino || '—';
    if (!byUF.has(uf)) byUF.set(uf, { qtd: 0, valor: 0, icms: 0 });
    const s = byUF.get(uf);
    s.qtd += 1;
    s.valor += (n.valor_nf || 0);
    s.icms += (n.valor_icms || 0);
  }
  return Array.from(byUF.entries()).map(([uf, s]) => ({
    uf, qtd: s.qtd, valor: s.valor, icms: s.icms, media: s.qtd ? s.valor / s.qtd : 0,
  })).sort((a, b) => b.valor - a.valor);
}

function renderFretes() {
  const list = computeFretes();
  const totalValor = list.reduce((a, r) => a + r.valor, 0);
  const totalQtd = list.reduce((a, r) => a + r.qtd, 0);
  const totalIcms = list.reduce((a, r) => a + r.icms, 0);
  const media = totalQtd ? totalValor / totalQtd : 0;

  const kpis = [
    { label: 'Total em fretes (CT-e)', value: fmtBRL(totalValor), sub: `${totalQtd} conhecimentos de transporte` },
    { label: 'ICMS sobre fretes', value: fmtBRL(totalIcms), sub: `${list.length} estados atendidos` },
    { label: 'Frete médio por envio', value: fmtBRL(media), sub: 'média simples do período' },
    { label: 'Estado com maior custo', value: list[0] ? list[0].uf : '—', sub: list[0] ? fmtBRL(list[0].valor) : '' },
  ];
  document.getElementById('fretesKpis').innerHTML = kpis.map(k =>
    `<div class="destaque-card"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`
  ).join('');

  mkChart('chartFretes', {
    type: 'bar',
    data: {
      labels: list.map(r => r.uf),
      datasets: [{ label: 'Frete (R$)', data: list.map(r => r.valor), backgroundColor: '#909090', borderRadius: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: v => 'R$ ' + v.toFixed(0) } } },
    },
  });

  document.getElementById('fretesCount').textContent = `${list.length} estados`;
  const data = list.map(r => [r.uf, r.qtd, fmtBRL(r.valor), fmtBRL(r.media), fmtBRL(r.icms)]);
  if (gridFretesInstance) {
    gridFretesInstance.updateConfig({ data }).forceRender();
  } else {
    gridFretesInstance = new gridjs.Grid({
      columns: [
        { name: 'UF', width: '60px' }, { name: 'Qtde CT-e', width: '100px' },
        { name: 'Valor Total', width: '120px' }, { name: 'Valor Médio', width: '120px' }, { name: 'ICMS', width: '110px' },
      ],
      data, search: true, sort: true, pagination: { limit: 20 },
    }).render(document.getElementById('gridFretes'));
  }
}

// ---------- Notas Faltando ----------
// Controle de "buraco na numeração": para cada série de NF-e (derivada da chave
// de acesso, posições 22-25), olha a faixa entre o menor e o maior número
// emitido NO MÊS analisado e aponta os números que não aparecem nem como nota
// emitida nem como Inutilização declarada na SEFAZ (MONTHS[mes].inut).
// CT-e fica de fora: numeração é controlada pelo transportador, não pela empresa.
// Quando "Todos os períodos" está selecionado, cada mês é analisado com o seu
// próprio inut (evitar misturar séries de meses diferentes na mesma faixa).
let gridFaltantesInstance = null;

function computeNotasFaltando() {
  const monthKeys = currentMonthKey === 'todos' ? Object.keys(MONTHS).sort() : [currentMonthKey];
  const resultado = [];
  for (const mk of monthKeys) {
    const mesInfo = MONTHS[mk];
    if (!mesInfo) continue;
    const monthNotes = mesInfo.notes.map(expandNote).filter(n => (n.data || '').startsWith(mk));
    const inutList = mesInfo.inut || [];
    const bySerie = {};
    for (const n of monthNotes) {
      if (n.tipo_documento !== 'NF-e') continue;
      if (!n.chave || n.chave.length < 34) continue;
      const serie = String(parseInt(n.chave.substring(22, 25), 10));
      const numero = parseInt(n.chave.substring(25, 34), 10);
      if (Number.isNaN(numero)) continue;
      if (!bySerie[serie]) bySerie[serie] = [];
      bySerie[serie].push(numero);
    }
    for (const serie of Object.keys(bySerie).sort()) {
      const nums = bySerie[serie].sort((a, b) => a - b);
      const min = nums[0], max = nums[nums.length - 1];
      const presentes = new Set(nums);
      const inutSet = new Set();
      for (const i of inutList) {
        if (String(parseInt(i.serie, 10)) !== serie) continue;
        const ini = parseInt(i.nIni, 10), fin = parseInt(i.nFin, 10);
        for (let x = ini; x <= fin; x++) inutSet.add(x);
      }
      const faltando = [], explicadas = [];
      for (let x = min; x <= max; x++) {
        if (presentes.has(x)) continue;
        if (inutSet.has(x)) explicadas.push(x); else faltando.push(x);
      }
      resultado.push({
        mes: mk, label: mesInfo.label, serie, min, max,
        total_emitidas: nums.length, total_inutilizadas: explicadas.length,
        total_faltando: faltando.length, faltando, explicadas,
      });
    }
  }
  return resultado;
}

function renderNotasFaltando() {
  const dados = computeNotasFaltando();
  const totalEmitidas = dados.reduce((a, d) => a + d.total_emitidas, 0);
  const totalInut = dados.reduce((a, d) => a + d.total_inutilizadas, 0);
  const totalFaltando = dados.reduce((a, d) => a + d.total_faltando, 0);
  const base = totalInut + totalFaltando;
  const pctExplicado = base ? (totalInut / base * 100) : 100;

  const kpis = [
    { label: 'Notas emitidas no período', value: totalEmitidas, sub: `${dados.length} série(s)/mês(es) analisados` },
    { label: 'Números inutilizados (explicados)', value: totalInut, sub: 'declarados na SEFAZ' },
    { label: 'Números faltando (sem explicação)', value: totalFaltando, sub: totalFaltando > 0 ? 'precisa verificar' : 'tudo explicado' },
    { label: '% da numeração explicada', value: `${pctExplicado.toFixed(1)}%`, sub: 'emitidas + inutilizadas / total de buracos' },
  ];
  document.getElementById('faltantesKpis').innerHTML = kpis.map(k =>
    `<div class="destaque-card"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`
  ).join('');

  const resumoRows = dados.map(d => `
    <tr>
      <td>${currentMonthKey === 'todos' ? d.label + ' — ' : ''}Série ${d.serie}</td>
      <td>${d.min} a ${d.max}</td>
      <td>${d.total_emitidas}</td>
      <td>${d.total_inutilizadas}</td>
      <td style="${d.total_faltando > 0 ? 'color:#9c0006;font-weight:600;' : 'color:#059669;'}">${d.total_faltando}</td>
    </tr>
  `).join('');
  document.getElementById('tblFaltantesResumo').innerHTML = resumoRows ||
    '<tr><td colspan="5">Nenhuma NF-e no período selecionado.</td></tr>';

  const detalhe = [];
  for (const d of dados) {
    for (const num of d.faltando) {
      detalhe.push([d.label, `Série ${d.serie}`, num]);
    }
  }
  document.getElementById('faltantesCount').textContent = `${detalhe.length} número(s) sem explicação`;
  if (gridFaltantesInstance) {
    gridFaltantesInstance.updateConfig({ data: detalhe }).forceRender();
  } else {
    gridFaltantesInstance = new gridjs.Grid({
      columns: [{ name: 'Mês', width: '140px' }, { name: 'Série', width: '100px' }, { name: 'Número' }],
      data: detalhe, search: true, sort: true, pagination: { limit: 20 },
    }).render(document.getElementById('gridFaltantes'));
  }
}

// ---------- Notas Canceladas ----------
let canceladasCache = [];
let gridCanceladasInstance = null;

function renderCanceladas() {
  const canc = SUMMARY.canceladas || { total: 0, total_vendas: 0, valor_vendas_cancelado: 0, por_categoria: {}, por_motivo: {}, por_dia: {} };
  // NOTES já tem _idx; evita o antigo NOTES.indexOf(n) dentro do map (O(n²)).
  canceladasCache = NOTES.filter(n => n.cancelada);

  const kpis = [
    { label: 'Total de documentos cancelados', value: canc.total, sub: 'em todas as categorias' },
    { label: 'Vendas canceladas', value: canc.total_vendas, sub: 'excluídas do faturamento' },
    { label: 'Valor de vendas canceladas', value: fmtBRL(canc.valor_vendas_cancelado), sub: 'já fora dos KPIs de receita' },
    { label: 'Motivo mais comum', value: Object.entries(canc.por_motivo).sort((a,b)=>b[1]-a[1])[0]?.[1] ?? '—',
      sub: (Object.entries(canc.por_motivo).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '').replace('Motivo do cancelamento: ', '') },
  ];
  document.getElementById('canceladasKpis').innerHTML = kpis.map(k =>
    `<div class="destaque-card"><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`
  ).join('');

  const topValorCanc = [...canceladasCache].sort((a, b) => (b.valor_nf || 0) - (a.valor_nf || 0)).slice(0, 10)
    .map(n => ({
      titulo: `${n.categoria} · Nº ${n.numero} · ${n.destinatario || 'Sem destinatário'}`,
      sub: `${n.data} · ${(n.produto || 'Sem descrição').slice(0, 55)}`,
      valorRaw: n.valor_nf || 0,
      valueLabel: fmtBRL(n.valor_nf),
      idx: n._idx,
    }));
  renderRankList('rankCanceladasValor', topValorCanc);

  const outliersCanc = findValueOutliers(topValorCanc);
  if (outliersCanc.length) {
    showAlerta('canceladasAlerta', `<span class="ico">⚠️</span><span>
      <b>${outliersCanc.length} ${outliersCanc.length > 1 ? 'notas canceladas destoam' : 'nota cancelada destoa'} bastante das demais do Top 10</b>
      — vale conferir se está tudo certo. Destaque: <b>${outliersCanc[0].titulo}</b> — ${outliersCanc[0].valueLabel}.
    </span>`);
  } else {
    showAlerta('canceladasAlerta', '');
  }

  const diaEntries = Object.entries(canc.por_dia).sort((a,b) => a[0] < b[0] ? -1 : 1);
  mkChart('chartCanceladasDia', {
    type: 'bar',
    data: {
      labels: diaEntries.map(([d]) => d.slice(8) + '/' + d.slice(5,7)),
      datasets: [{ label: 'Cancelamentos', data: diaEntries.map(([,q]) => q), backgroundColor: '#b91c1c', borderRadius: 3 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
  });

  const motivoEntries = Object.entries(canc.por_motivo).map(([m,q]) => [m.replace('Motivo do cancelamento: ', ''), q]);
  mkChart('chartCanceladasMotivo', {
    type: 'doughnut',
    data: {
      labels: motivoEntries.map(([m]) => m),
      datasets: [{ data: motivoEntries.map(([,q]) => q), backgroundColor: ['#0090D0', '#d97706', '#909090', '#b91c1c'] }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  const selCat = document.getElementById('filtroCanceladasCategoria');
  const cats = Array.from(new Set(canceladasCache.map(n => n.categoria))).sort();
  selCat.innerHTML = '<option value="">(Todas categorias)</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  selCat.addEventListener('change', applyCanceladasFilter);
  applyCanceladasFilter();
}

function applyCanceladasFilter() {
  const cat = document.getElementById('filtroCanceladasCategoria').value;
  const filtered = cat ? canceladasCache.filter(n => n.categoria === cat) : canceladasCache;
  document.getElementById('canceladasCount').textContent = `${filtered.length} de ${canceladasCache.length} documentos cancelados`;

  const data = filtered.map(n => [
    n.data, n.categoria, n.numero, n.destinatario || '—',
    (n.produto || '—').slice(0, 50), fmtBRL(n.valor_nf),
    (n.data_cancelamento || '').slice(0, 10),
    (n.motivo_cancelamento || '').replace('Motivo do cancelamento: ', ''),
    n._idx,
  ]);

  if (gridCanceladasInstance) {
    gridCanceladasInstance.updateConfig({ data }).forceRender();
    return;
  }
  gridCanceladasInstance = new gridjs.Grid({
    columns: [
      { name: 'Data', width: '90px' },
      { name: 'Categoria', width: '110px' },
      { name: 'Número', width: '90px' },
      { name: 'Destinatário' },
      { name: 'Produto' },
      { name: 'Valor', width: '110px' },
      { name: 'Cancelada em', width: '100px' },
      { name: 'Motivo', width: '140px' },
      { name: 'idx', hidden: true },
    ],
    data,
    search: true, sort: true, pagination: { limit: 20 },
  }).render(document.getElementById('gridCanceladas'));

  document.getElementById('gridCanceladas').addEventListener('click', (e) => {
    const row = e.target.closest('tr');
    if (!row) return;
    const cells = row.querySelectorAll('td');
    if (!cells.length) return;
    const idx = parseInt(cells[cells.length - 1].textContent, 10);
    if (!isNaN(idx)) openDetalhe(idx);
  });
}

buildMonthSelector();
