// Alimenta o Painel Fiscal original com as notas do cliente escolhido.
// Monta o mesmo formato que o painel sempre usou (MONTHS_RAW: campos, textos internados e meses).
import db from '../db.js';

const CAMPOS = ['data', 'numero', 'chave', 'categoria', 'tipo_documento', 'destinatario', 'doc_destinatario', 'uf_destino', 'produto', 'cfop', 'ncm', 'aliquota_icms',
  'valor_frete', 'valor_icms', 'valor_ipi', 'valor_pis', 'valor_cofins', 'valor_ibs', 'valor_cbs', 'valor_difal', 'valor_fcp_difal', 'valor_total_tributos', 'valor_nf',
  'cancelada', 'data_cancelamento', 'motivo_cancelamento', 'difal_pendente', 'difal_pago', 'difal_data_pagamento', 'difal_comprovante', 'difal_juros', 'difal_multa'];
const TEXTO = new Set(['data', 'categoria', 'tipo_documento', 'destinatario', 'doc_destinatario', 'uf_destino', 'produto', 'cfop', 'ncm', 'aliquota_icms', 'data_cancelamento', 'motivo_cancelamento', 'difal_data_pagamento', 'difal_comprovante']);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const rotulo = (k) => `${MESES[+k.slice(5, 7) - 1]}/${k.slice(0, 4)}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function montar(notas, cancel, inut, compPadrao) {
  const strings = [], idx = new Map();
  const s = (v) => { v = v == null ? '' : String(v); let i = idx.get(v); if (i === undefined) { i = strings.length; strings.push(v); idx.set(v, i); } return i; };
  const canc = new Map(cancel.map((c) => [c.chave, c]));
  const data = {};
  for (const n of notas) {
    if (!n.data) continue;
    const k = String(n.data).slice(0, 7);
    const c = canc.get(n.chave);
    const cancelada = n.cancelada || !!c;
    const difal = (+n.valor_difal || 0) + (+n.valor_fcp_difal || 0);
    const v = { ...n, data: String(n.data).slice(0, 10), cancelada: cancelada ? 1 : 0, data_cancelamento: c?.data || '', motivo_cancelamento: cancelada ? (c?.motivo || 'Não informado') : '',
      // no painel, "pendente" = DIFAL ainda não calculado (o XML sempre traz o valor, então fica 0)
      difal_pago: n.difal_pago && difal > 0 ? 1 : 0, difal_pendente: 0, difal_data_pagamento: n.difal_data_pagamento || '', difal_comprovante: n.difal_comprovante || '' };
    (data[k] ||= { label: rotulo(k), notes: [], inut: [] }).notes.push(CAMPOS.map((f) => TEXTO.has(f) ? s(v[f]) : (f === 'numero' || f === 'chave' ? String(v[f] ?? '') : (+v[f] || 0))));
  }
  for (const i of inut) {
    const k = i.competencia || (i.data ? String(i.data).slice(0, 7) : null); if (!k) continue;
    (data[k] ||= { label: rotulo(k), notes: [], inut: [] }).inut.push({ serie: i.serie, nIni: i.n_ini, nFin: i.n_fin });
  }
  if (!Object.keys(data).length) data[compPadrao] = { label: rotulo(compPadrao), notes: [], inut: [] };
  return { fields: CAMPOS, interned: CAMPOS.map((f) => TEXTO.has(f)), strings, data };
}

async function iniciar() {
  const u = await db.usuario();
  if (!u) { location.href = 'index.html'; return; }
  const clientes = (await db.clientes()).filter((c) => c.ativo);
  const params = new URLSearchParams(location.search);
  let cid = params.get('cliente');
  if (!clientes.some((c) => c.id === cid)) cid = clientes[0]?.id;
  const sel = document.getElementById('filtroCliente');
  sel.innerHTML = clientes.map((c) => `<option value="${c.id}" ${c.id === cid ? 'selected' : ''}>${esc(c.nome_fantasia || c.razao_social)}</option>`).join('') || '<option>Nenhum cliente</option>';
  sel.addEventListener('change', () => { location.search = '?cliente=' + sel.value; });
  const cli = clientes.find((c) => c.id === cid);
  document.getElementById('nomeCliente').textContent = cli ? cli.razao_social : '';
  document.title = `Painel Fiscal · ${cli ? (cli.nome_fantasia || cli.razao_social) : ''}`;

  const notas = cli ? await db.notas({ cliente_id: cli.id }) : [];
  const chaves = notas.map((n) => n.chave).filter(Boolean);
  const [cancel, inut] = await Promise.all([chaves.length ? db.cancelamentosDe(chaves) : [], cli ? db.inutilizacoes({ cliente_id: cli.id }) : []]);
  const hoje = new Date(); hoje.setMonth(hoje.getMonth() - 1);
  window.__MONTHS_RAW = montar(notas, cancel, inut, hoje.toISOString().slice(0, 7));

  if (!notas.length) {
    const av = document.createElement('div'); av.className = 'aviso-vazio';
    av.innerHTML = `<span><b>${esc(cli ? (cli.nome_fantasia || cli.razao_social) : 'Este cliente')}</b> ainda não tem XML importado. Importe as notas (NF-e, NFC-e, NFS-e, CT-e, cancelamentos e inutilizações) e o painel se monta sozinho.</span><a href="index.html#/documentos">Importar XML</a>`;
    document.querySelector('.main-content').prepend(av);
  }
  const sc = document.createElement('script'); sc.src = 'js/fiscal/painel.js';
  sc.onload = () => document.getElementById('carregandoFiscal').remove();
  sc.onerror = () => { document.getElementById('carregandoFiscal').textContent = 'Não foi possível abrir o painel.'; };
  document.body.append(sc);
}
iniciar().catch((e) => { document.getElementById('carregandoFiscal').textContent = 'Erro ao carregar: ' + e.message; });
