// Lê os arquivos importados: XML de notas, planilhas de clientes e o nome de PDFs/outros.
import { soDigitos, semAcento, cnpjValido } from './util.js';

const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const tag = (raiz, ...nomes) => { for (const n of nomes) { const e = raiz.getElementsByTagNameNS('*', n)[0] || raiz.getElementsByTagName(n)[0]; if (e) return e; } return null; };
const txt = (raiz, ...caminhos) => {
  for (const c of caminhos) {
    let e = raiz; for (const p of c.split('/')) { e = e && tag(e, p); if (!e) break; }
    if (e && e.textContent.trim()) return e.textContent.trim();
  }
  return '';
};
const dataISO = (s) => { const m = String(s || '').match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; const b = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return b ? `${b[3]}-${b[2]}-${b[1]}` : null; };

const todas = (raiz, n) => [...raiz.getElementsByTagNameNS('*', n)];
const curto = (s, n = 60) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// ---------- XML: NF-e / NFC-e / CT-e / NFS-e, evento de cancelamento e inutilização ----------
// Devolve { tipo: 'nota' | 'cancelamento' | 'inutilizacao', ... } ou null se não reconhecer.
export function lerXML(texto) {
  const doc = new DOMParser().parseFromString(texto.replace(/^﻿/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;

  // Inutilização de numeração (procInutNFe)
  const inut = tag(doc, 'infInut');
  if (inut) {
    const ret = todas(doc, 'infInut')[1] || inut; // o 2º infInut é o retorno da SEFAZ
    return { tipo: 'inutilizacao', cnpj: soDigitos(txt(inut, 'CNPJ')), modelo: txt(inut, 'mod'), serie: String(+txt(inut, 'serie') || 0),
      n_ini: +txt(inut, 'nNFIni'), n_fin: +txt(inut, 'nNFFin'), data: dataISO(txt(ret, 'dhRecbto')) || (txt(inut, 'ano') ? `20${txt(inut, 'ano')}-01-01` : null), motivo: txt(inut, 'xJust') };
  }
  // Evento (procEventoNFe / procEventoCTe) sem a nota junto
  const ev = tag(doc, 'infEvento');
  if (ev && !tag(doc, 'infNFe') && !tag(doc, 'infCte')) {
    const tp = txt(ev, 'tpEvento'), desc = txt(ev, 'descEvento');
    if (tp === '110111' || tp === '110112' || /cancel/i.test(desc)) {
      return { tipo: 'cancelamento', chave: txt(ev, 'chNFe', 'chCTe'), cnpj: soDigitos(txt(ev, 'CNPJ')), data: dataISO(txt(ev, 'dhEvento')), motivo: txt(ev, 'xJust') || 'Não informado' };
    }
    return { tipo: 'evento', descricao: desc || 'Evento', chave: txt(ev, 'chNFe', 'chCTe'), cnpj: soDigitos(txt(ev, 'CNPJ')), data: dataISO(txt(ev, 'dhEvento')) };
  }

  const nfe = tag(doc, 'infNFe');
  if (nfe) {
    const tot = tag(nfe, 'ICMSTot') || nfe, ibs = tag(nfe, 'IBSCBSTot');
    const itens = todas(nfe, 'det').map((d) => ({ xProd: txt(d, 'prod/xProd'), cfop: txt(d, 'prod/CFOP'), ncm: txt(d, 'prod/NCM'), pICMS: txt(d, 'imposto/ICMS/pICMS', 'pICMS') }));
    const prot = txt(doc, 'protNFe/infProt/cStat');
    return {
      tipo: 'nota', modelo: txt(nfe, 'ide/mod') === '65' ? 'nfce' : 'nfe', tipo_documento: txt(nfe, 'ide/mod') === '65' ? 'NFC-e' : 'NF-e',
      chave: (nfe.getAttribute('Id') || '').replace(/^NFe/, '') || txt(doc, 'chNFe'),
      numero: txt(nfe, 'ide/nNF'), serie: txt(nfe, 'ide/serie'), data: dataISO(txt(nfe, 'ide/dhEmi', 'ide/dEmi')),
      tpNF: txt(nfe, 'ide/tpNF'), finalidade: txt(nfe, 'ide/finNFe') || '1', idDest: txt(nfe, 'ide/idDest'), indFinal: txt(nfe, 'ide/indFinal'),
      emit: { cnpj: soDigitos(txt(nfe, 'emit/CNPJ', 'emit/CPF')), nome: txt(nfe, 'emit/xNome'), uf: txt(nfe, 'emit/enderEmit/UF') },
      dest: { cnpj: soDigitos(txt(nfe, 'dest/CNPJ', 'dest/CPF', 'dest/idEstrangeiro')), nome: txt(nfe, 'dest/xNome'), uf: txt(nfe, 'dest/enderDest/UF') },
      itens,
      valor_nf: num(txt(tot, 'vNF')), valor_frete: num(txt(tot, 'vFrete')), valor_icms: num(txt(tot, 'vICMS')), valor_ipi: num(txt(tot, 'vIPI')),
      valor_pis: num(txt(tot, 'vPIS')), valor_cofins: num(txt(tot, 'vCOFINS')), valor_total_tributos: num(txt(tot, 'vTotTrib')),
      valor_difal: num(txt(tot, 'vICMSUFDest')), valor_fcp_difal: num(txt(tot, 'vFCPUFDest')),
      valor_ibs: ibs ? num(txt(ibs, 'gIBS/vIBS', 'vIBS')) : 0, valor_cbs: ibs ? num(txt(ibs, 'gCBS/vCBS', 'vCBS')) : 0,
      iss: num(txt(nfe, 'ISSQNtot/vISS')),
      cancelada: prot === '101' || prot === '151' || prot === '155',
    };
  }
  const cte = tag(doc, 'infCte');
  if (cte) {
    const dest = tag(cte, 'dest') || tag(cte, 'receb'), toma = tag(cte, 'toma3') || tag(cte, 'toma4') || tag(cte, 'toma');
    const papelToma = toma ? txt(toma, 'toma') : '';
    const tomador = papelToma === '0' ? tag(cte, 'rem') : papelToma === '1' ? tag(cte, 'exped') : papelToma === '2' ? tag(cte, 'receb') : papelToma === '3' ? dest : toma;
    return {
      tipo: 'nota', modelo: 'cte', tipo_documento: 'CT-e', chave: (cte.getAttribute('Id') || '').replace(/^CTe/, ''),
      numero: txt(cte, 'ide/nCT'), serie: txt(cte, 'ide/serie'), data: dataISO(txt(cte, 'ide/dhEmi')), tpNF: '1', finalidade: '1',
      emit: { cnpj: soDigitos(txt(cte, 'emit/CNPJ')), nome: txt(cte, 'emit/xNome'), uf: txt(cte, 'emit/enderEmit/UF') },
      dest: { cnpj: soDigitos(dest ? txt(dest, 'CNPJ', 'CPF') : ''), nome: dest ? txt(dest, 'xNome') : '', uf: txt(cte, 'ide/UFFim') },
      tomador: soDigitos(tomador ? txt(tomador, 'CNPJ', 'CPF') : ''), rem: soDigitos(txt(cte, 'rem/CNPJ', 'rem/CPF')),
      itens: [{ xProd: 'Frete/Transporte', cfop: txt(cte, 'ide/CFOP'), ncm: '', pICMS: txt(cte, 'imp/ICMS/pICMS', 'pICMS') }],
      valor_nf: num(txt(cte, 'vPrest/vTPrest')), valor_frete: num(txt(cte, 'vPrest/vTPrest')), valor_icms: num(txt(cte, 'imp/ICMS/vICMS', 'vICMS')),
      valor_ipi: 0, valor_pis: 0, valor_cofins: 0, valor_total_tributos: num(txt(cte, 'imp/vTotTrib')), valor_difal: 0, valor_fcp_difal: 0, valor_ibs: 0, valor_cbs: 0, iss: 0,
      cancelada: txt(doc, 'protCTe/infProt/cStat') === '101',
    };
  }
  // NFS-e: padrão nacional (infNFSe) e ABRASF (InfNfse), o mais comum nas prefeituras
  const nac = tag(doc, 'infNFSe'), ab = !nac && tag(doc, 'InfNfse', 'infNfse');
  if (nac || ab) {
    const r = nac || ab;
    const pcnpj = soDigitos(nac ? txt(nac, 'emit/CNPJ', 'emit/CPF') : txt(ab, 'PrestadorServico/IdentificacaoPrestador/CpfCnpj/Cnpj', 'PrestadorServico/IdentificacaoPrestador/Cnpj', 'Prestador/CpfCnpj/Cnpj', 'Prestador/Cnpj', 'IdentificacaoPrestador/Cnpj'));
    const numero = nac ? txt(nac, 'nNFSe') : txt(ab, 'Numero');
    return {
      tipo: 'nota', modelo: 'nfse', tipo_documento: 'NFS-e', chave: (nac && (nac.getAttribute('Id') || '').replace(/^NFS/, '')) || (pcnpj && numero ? `nfse-${pcnpj}-${numero}` : ''),
      numero, serie: '', data: dataISO(nac ? txt(doc, 'dhEmi', 'dhProc') : txt(ab, 'DataEmissao', 'Competencia')), tpNF: '1', finalidade: '1',
      emit: { cnpj: pcnpj, nome: nac ? txt(nac, 'emit/xNome') : txt(ab, 'PrestadorServico/RazaoSocial', 'RazaoSocial'), uf: nac ? txt(nac, 'emit/enderNac/UF') : txt(ab, 'PrestadorServico/Endereco/Uf') },
      dest: { cnpj: soDigitos(nac ? txt(doc, 'toma/CNPJ', 'toma/CPF') : txt(ab, 'TomadorServico/IdentificacaoTomador/CpfCnpj/Cnpj', 'TomadorServico/IdentificacaoTomador/CpfCnpj/Cpf', 'Tomador/CpfCnpj/Cnpj', 'Tomador/CpfCnpj/Cpf')),
        nome: nac ? txt(doc, 'toma/xNome') : txt(ab, 'TomadorServico/RazaoSocial', 'Tomador/RazaoSocial'), uf: nac ? txt(doc, 'toma/end/endNac/UF') : txt(ab, 'TomadorServico/Endereco/Uf') },
      itens: [{ xProd: curto(nac ? txt(doc, 'xDescServ') : txt(ab, 'Discriminacao'), 80) || 'Serviço', cfop: '', ncm: '', pICMS: '' }],
      valor_nf: num(nac ? txt(doc, 'vServPrest/vServ', 'vServ', 'vLiq') : txt(ab, 'Valores/ValorServicos', 'ValoresNfse/ValorLiquidoNfse', 'ValorServicos')),
      iss: num(nac ? txt(nac, 'vISSQN') : txt(ab, 'ValoresNfse/ValorIss', 'Valores/ValorIss', 'ValorIss')),
      valor_pis: num(nac ? txt(doc, 'vPis') : txt(ab, 'Valores/ValorPis')), valor_cofins: num(nac ? txt(doc, 'vCofins') : txt(ab, 'Valores/ValorCofins')),
      valor_frete: 0, valor_icms: 0, valor_ipi: 0, valor_total_tributos: 0, valor_difal: 0, valor_fcp_difal: 0, valor_ibs: 0, valor_cbs: 0,
      cancelada: !!tag(doc, 'NfseCancelamento'),
    };
  }
  return null;
}

// ---------- categoria da nota pelo CFOP, do ponto de vista do cliente (igual ao Painel Fiscal) ----------
const DEV_VENDA_ENTRADA = /^[12](201|202|203|204|410|411|503|504|553|660|661|662|918|919)$/; // nota de entrada própria de devolução
const DEV_COMPRA_SAIDA = /^[567](201|202|208|209|210|410|411|412|413|503|553|555|556|660|661|662|918|919)$/;
export function categoriaDaNota(x, ehEmitente) {
  if (x.modelo === 'cte') return 'CT-e (Frete)';
  const cfop = (x.itens[0]?.cfop || '').replace(/\D/g, ''), g = cfop.slice(1);
  if (x.modelo === 'nfse') return ehEmitente ? 'Venda' : 'Compra';
  if (x.modelo === 'nfce') return ehEmitente ? 'Venda' : 'Compra';
  if (ehEmitente) {
    if (/^[123]/.test(cfop)) return DEV_VENDA_ENTRADA.test(cfop) || x.finalidade === '4' ? 'Devolução' : 'Entrada própria';
    if (DEV_COMPRA_SAIDA.test(cfop) || x.finalidade === '4') return 'Devolução de compra';
    if (/^(906|907)$/.test(g)) return 'Retorno Simbólico';
    if (/^(1\d\d|4\d\d|501|502|932|933)$/.test(g)) return 'Venda';
    if (/^9\d\d$/.test(g)) return 'Remessa';
    return 'Outras saídas';
  }
  // nota recebida de terceiros
  if (DEV_COMPRA_SAIDA.test(cfop) || x.finalidade === '4') return 'Devolução'; // o cliente do nosso cliente devolveu
  if (/^(1\d\d|4\d\d)$/.test(g)) return 'Compra';
  return 'Entrada (outras)';
}
const pct = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(n) && v !== '' ? `${n.toFixed(2)}%` : ''; };

// Converte a nota lida do XML na linha que o Painel Fiscal usa, para um cliente (pelo CNPJ dele)
export function linhaPainel(x, cnpjCliente) {
  const raizC = (cnpjCliente || '').slice(0, 8);
  const ehEmit = !!cnpjCliente && (x.emit.cnpj === cnpjCliente || (raizC.length === 8 && x.emit.cnpj.slice(0, 8) === raizC));
  const outra = ehEmit ? x.dest : x.emit;
  const categoria = categoriaDaNota(x, ehEmit);
  const prods = [...new Set(x.itens.map((i) => i.xProd).filter(Boolean))];
  return {
    data: x.data, numero: x.numero, serie: x.serie, chave: x.chave || null, categoria, tipo_documento: x.tipo_documento,
    destinatario: outra.nome || '', doc_destinatario: outra.cnpj || '', uf_destino: (ehEmit ? x.dest.uf : x.emit.uf) || '',
    produto: prods.slice(0, 3).map((p) => curto(p, 60)).join('; ') + (prods.length > 3 ? `; +${prods.length - 3} itens` : ''),
    cfop: x.itens[0]?.cfop || '', ncm: x.itens[0]?.ncm || '', aliquota_icms: pct(x.itens[0]?.pICMS),
    valor_frete: x.valor_frete, valor_icms: x.valor_icms, valor_ipi: x.valor_ipi, valor_pis: x.valor_pis, valor_cofins: x.valor_cofins,
    valor_ibs: x.valor_ibs, valor_cbs: x.valor_cbs, valor_difal: ehEmit ? x.valor_difal : 0, valor_fcp_difal: ehEmit ? x.valor_fcp_difal : 0,
    valor_total_tributos: x.valor_total_tributos, valor_nf: x.valor_nf, iss: x.iss || 0,
    sentido: ehEmit && x.tpNF !== '0' ? 'saida' : 'entrada', emitente_proprio: ehEmit, finalidade: x.finalidade,
    cancelada: !!x.cancelada,
  };
}

// ---------- classifica um arquivo que não é XML (PDF, imagem, planilha...) pelo nome ----------
const REGRAS = [
  [/\bofx\b|extrato/, 'extrato'], [/holerite|contracheque|folha|recibo.?pagamento|pro.?labore/, 'holerite'], [/ponto|cartao.?ponto|espelho/, 'ponto'],
  [/atestado|declaracao.?de.?horas|aso\b|exame/, 'atestado'], [/\bdas\b|darf|gps|fgts|gare|dae|guia|boleto.?imposto|simples/, 'guia'],
  [/contrato|alteracao|social|procuracao/, 'contrato'], [/balancete|balanco|dre\b|razao/, 'balancete'], [/nfse|nfs-e/, 'nfse'], [/danfe|nfe|nota/, 'nfe'], [/cte|dacte/, 'cte'],
];
export function classificar(nome) {
  const n = semAcento(nome).replace(/[_.\-]+/g, ' ');
  const ext = nome.split('.').pop().toLowerCase();
  let tipo = 'outro';
  if (ext === 'ofx') tipo = 'extrato';
  else { for (const [re, t] of REGRAS) if (re.test(n)) { tipo = t; break; } }
  if (tipo === 'outro' && /^(xlsx?|csv|ods)$/.test(ext)) tipo = 'planilha';
  // CNPJ no nome: 14 dígitos seguidos ou com separadores; fica o primeiro com dígito verificador válido
  const cands = [...nome.replace(/\d{44}/g, '').matchAll(/(?<!\d)\d{2}[.\s_-]?\d{3}[.\s_-]?\d{3}[\s_-]?\d{4}[.\s_-]?\d{2}(?!\d)/g)].map((m) => soDigitos(m[0]));
  const cnpj = cands.find(cnpjValido) || cands[0] || '';
  const mm = n.match(/\b(20\d{2})[ \-]?(0[1-9]|1[0-2])\b/) || n.match(/\b(0[1-9]|1[0-2])[ \-]?(20\d{2})\b/);
  let competencia = mm ? (mm[1].length === 4 ? `${mm[1]}-${mm[2]}` : `${mm[2]}-${mm[1]}`) : null;
  const mn = !competencia && n.match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s?(20\d{2})\b/);
  if (mn) competencia = `${mn[2]}-${String(['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].indexOf(mn[1]) + 1).padStart(2, '0')}`;
  return { tipo, cnpj, competencia };
}

// ---------- extrato OFX: período e conta ----------
export function lerOFX(texto) {
  const pega = (t) => (texto.match(new RegExp('<' + t + '>([^<\\r\\n]+)', 'i')) || [])[1]?.trim() || '';
  const ini = pega('DTSTART'), fim = pega('DTEND');
  return { banco: pega('BANKID') || pega('ORG'), conta: pega('ACCTID'), inicio: ini ? `${ini.slice(0, 4)}-${ini.slice(4, 6)}-${ini.slice(6, 8)}` : null, fim: fim ? `${fim.slice(0, 4)}-${fim.slice(4, 6)}-${fim.slice(6, 8)}` : null, lancamentos: (texto.match(/<STMTTRN>/gi) || []).length };
}

// ---------- planilhas (CSV ou Excel) ----------
let xlsxPromessa = null;
const carregaXLSX = () => xlsxPromessa ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Não consegui carregar o leitor de Excel. Salve a planilha como CSV e tente de novo.')); document.head.append(s); });

function lerCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const prim = texto.split(/\r?\n/)[0] || '';
  const sep = (prim.match(/;/g) || []).length >= (prim.match(/,/g) || []).length ? ';' : (prim.includes('\t') ? '\t' : ',');
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c; }
    else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; linha.push(campo); campo = ''; if (linha.some((x) => x.trim())) linhas.push(linha); linha = []; }
    else campo += c;
  }
  linha.push(campo); if (linha.some((x) => x.trim())) linhas.push(linha);
  return linhas;
}
export async function lerPlanilha(arquivo) {
  const ext = arquivo.name.split('.').pop().toLowerCase();
  if (ext === 'csv' || ext === 'txt') {
    const buf = await arquivo.arrayBuffer(); let t = new TextDecoder('utf-8').decode(buf);
    if (t.includes('�')) t = new TextDecoder('windows-1252').decode(buf); // CSV salvo pelo Excel em português
    return lerCSV(t);
  }
  const X = await carregaXLSX(); const wb = X.read(await arquivo.arrayBuffer(), { type: 'array' });
  return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
}

// ---------- transforma linhas de planilha em clientes ----------
const COLUNAS = {
  razao_social: ['razao social', 'razao', 'nome empresarial', 'empresa', 'nome', 'cliente'],
  nome_fantasia: ['nome fantasia', 'fantasia', 'apelido'],
  cnpj: ['cnpj', 'cpf/cnpj', 'cnpj/cpf', 'documento', 'cpf'],
  regime: ['regime', 'regime tributario', 'tributacao', 'enquadramento'],
  inscricao_estadual: ['inscricao estadual', 'ie', 'insc estadual'],
  inscricao_municipal: ['inscricao municipal', 'im', 'insc municipal', 'ccm'],
  email: ['email', 'e-mail', 'email principal', 'e-mail principal'],
  email_dp: ['email dp', 'e-mail dp', 'email rh', 'e-mail rh', 'email departamento pessoal'],
  email_financeiro: ['email financeiro', 'e-mail financeiro'],
  telefone: ['telefone', 'fone', 'celular', 'whatsapp'],
  tem_funcionarios: ['funcionarios', 'tem funcionarios', 'empregados', 'qtd funcionarios', 'possui funcionarios'],
  observacoes: ['observacoes', 'observacao', 'obs'],
};
export function regimeDe(v) {
  const s = semAcento(v);
  if (/mei|microempreendedor/.test(s)) return 'mei';
  if (/simples/.test(s)) return 'simples';
  if (/presumido/.test(s)) return 'presumido';
  if (/real/.test(s)) return 'real';
  return null;
}
const normCol = (c) => semAcento(c).replace(/[_\-.:]+/g, ' ').replace(/\be ?mail\b/g, 'email').replace(/\s+/g, ' ').trim();
export function mapearColunas(cab) {
  const norm = cab.map(normCol);
  const mapa = {};
  const usado = (i) => Object.values(mapa).includes(i);
  // 1ª passada: nome exato da coluna; 2ª: coluna que contém o nome (ex.: "Razão social do cliente")
  for (const exato of [true, false]) {
    for (const [campo, nomes0] of Object.entries(COLUNAS)) {
      if (mapa[campo] !== undefined) continue;
      const nomes = nomes0.map(normCol);
      const i = norm.findIndex((c, ix) => !usado(ix) && (exato ? nomes.includes(c) : nomes.some((n) => n.length > 3 && c.includes(n))));
      if (i >= 0) mapa[campo] = i;
    }
  }
  return mapa;
}
export function linhasParaClientes(linhas, mapa) {
  const out = [], erros = [], vistos = new Set();
  linhas.forEach((l, ix) => {
    const g = (k) => mapa[k] === undefined ? '' : String(l[mapa[k]] ?? '').trim();
    const razao = g('razao_social'); if (!razao) return;
    const cnpj = soDigitos(g('cnpj'));
    if (cnpj && vistos.has(cnpj)) { erros.push(`Linha ${ix + 2}: CNPJ repetido na planilha (${razao})`); return; }
    if (cnpj) vistos.add(cnpj);
    const f = semAcento(g('tem_funcionarios'));
    const c = { razao_social: razao, cnpj: cnpj || null };
    for (const k of ['nome_fantasia', 'inscricao_estadual', 'inscricao_municipal', 'email', 'email_dp', 'email_financeiro', 'telefone', 'observacoes']) if (g(k)) c[k] = g(k);
    const r = regimeDe(g('regime')); if (r) c.regime = r; else if (mapa.regime !== undefined && g('regime')) erros.push(`Linha ${ix + 2}: regime "${g('regime')}" não reconhecido (${razao}), ficou Simples`);
    if (mapa.tem_funcionarios !== undefined && f) c.tem_funcionarios = /^(s|sim|x|true|1)/.test(f) || +f > 0;
    out.push(c);
  });
  return { clientes: out, erros };
}
