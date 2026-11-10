// Reconhece QUALQUER arquivo pelo conteúdo: o que é, de qual empresa (CNPJ), de qual mês e de qual departamento,
// e extrai os dados para preencher o sistema (colaboradores, férias, folha, guias, notas, ponto...).
import { soDigitos, semAcento } from './util.js';
import { lerXML, lerOFX, classificar } from './leitor.js';
import { textoPDF } from './leitor-pdf.js';

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const n = (s) => { const v = parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
const iso = (s) => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const comp = (mm, aaaa) => `${aaaa}-${String(mm).padStart(2, '0')}`;
const RE_CNPJ = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const RE_CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/;
const RE_VAL = /\d{1,3}(?:\.\d{3})*,\d{2}/;

// Tipos que o sistema conhece
export const TIPOS = {
  ferias_programacao: ['Programação de férias', 'dp'], folha_extrato: ['Folha de pagamento (extrato mensal)', 'dp'], folha_resumo: ['Resumo da folha', 'dp'],
  holerites: ['Recibos de pagamento (holerites)', 'dp'], liquidos: ['Relação de líquidos', 'dp'], guia_fgts: ['Guia do FGTS Digital', 'dp'], fgts_detalhe: ['Detalhe da guia do FGTS', 'dp'],
  guia_darf_dp: ['Guia DARF previdenciária (DCTFWeb)', 'dp'], recibo_dctfweb: ['Recibo da DCTFWeb', 'dp'], creditos_dctfweb: ['Relatório de créditos da DCTFWeb', 'dp'], extrato_dctfweb: ['Extrato de processamento da DCTFWeb', 'dp'],
  guia_sindical: ['Contribuição sindical / assistencial', 'dp'], cartao_ponto: ['Cartões de ponto', 'dp'], ficha_colaborador: ['Ficha do colaborador preenchida', 'dp'],
  guia_das: ['Guia do DAS (Simples Nacional)', 'fiscal'], guia_darf_fiscal: ['Guia DARF', 'fiscal'],
  nota: ['Nota fiscal (XML)', 'fiscal'], cancelamento: ['Cancelamento de nota (XML)', 'fiscal'], inutilizacao: ['Inutilização de numeração (XML)', 'fiscal'], evento: ['Evento de nota (XML)', 'fiscal'],
  extrato: ['Extrato bancário', 'contabil'], outro: ['Outro documento', null],
};

// --------------------------------- PDFs do Domínio, eSocial/DCTFWeb, FGTS Digital, Secullum ---------------------------------
function cabecalho(L) {
  const t = L.join('\n');
  const cnpjs = [...new Set((t.match(RE_CNPJ) || []).map(soDigitos))];
  const emp = t.match(/Empresa:\s*(?:(\d+)\s*-\s*)?(.+?)(?:\s+P[áa]gina:|$)/m);
  let c = null, m;
  if ((m = t.match(/Compet[êe]ncia:\s*(\d{2})\/(\d{4})/))) c = comp(m[1], m[2]);
  else if ((m = t.match(/Per[íi]odo de [Aa]pura[çc][ãa]o\s*:?\s*(\d{2})\/(\d{4})/))) c = comp(m[1], m[2]);
  else if ((m = t.match(/PA:\s*(\d{2})\/(\d{4})/))) c = comp(m[1], m[2]);
  else if ((m = semAcento(t).match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:\/|de)\s*(\d{4})/))) c = comp(MESES.indexOf(m[1]) + 1, m[2]);
  else if ((m = t.match(/Data base:\s*\d{2}\/(\d{2})\/(\d{4})/))) c = comp(m[1], m[2]);
  else if ((m = t.match(/Per[íi]odo:\s*\d{2}\/(\d{2})\/(\d{4})/))) c = comp(m[1], m[2]);
  else if ((m = t.match(/EXTRATO DO PROCESSAMENTO.*?(\d{2})\/(\d{4})/))) c = comp(m[1], m[2]);
  return { cnpjs, codigo: emp?.[1] || null, nomeEmpresa: (emp?.[2] || '').trim() || null, competencia: c };
}

function programacaoFerias(L) {
  const out = []; let cur = null;
  const RES = /^(.*?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+(\S+)$/;
  for (const l of L) {
    let m = l.match(/^(\d+)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.*)$/);
    if (m) { cur = { codigo: m[1], nome: m[2].trim(), admissao: iso(m[3]), periodos: [] }; out.push(cur); addPer(cur, iso(m[7]), iso(m[8]), m[9]); continue; }
    if (cur && (m = l.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.*)$/))) addPer(cur, iso(m[1]), iso(m[2]), m[3]);
  }
  function addPer(c, ini, fim, resto) {
    const r = resto.match(RES); if (!r) return;
    const goz = r[1].match(/(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(\d+)/);
    c.periodos.push({ inicio: ini, fim, dias_direito: n(r[2]), dias_gozados: n(r[3]), dias_restantes: n(r[4]), limite: iso(r[5]), faltas: n(r[7]) || 0, afastamento: n(r[6]) || 0,
      gozo_inicio: goz ? iso(goz[1]) : null, gozo_dias: goz ? +goz[2] : null, gozo_abono: goz ? +goz[3] : null });
  }
  return out;
}

function folhaExtrato(L) {
  const out = []; let cur = null;
  const EV = /(\d{2,5})\s+([A-ZÀ-Ú0-9][^]*?)\s+([\d:.,]+)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+([PDI])\b/g;
  for (const l of L) {
    let m = l.match(/^(?:Empr|Contr)\.?:\s*(\d+)\s+(.+?)\s+Situa[çc][ãa]o:\s*(.+?)\s+CPF:\s*([\d.\-]+)\s+Adm:\s*(\d{2}\/\d{2}\/\d{4})/);
    if (m) { cur = { codigo: m[1], nome: m[2].trim(), situacao_folha: m[3].trim(), cpf: soDigitos(m[4]), admissao: iso(m[5]), contribuinte: /^Contr/.test(l), eventos: [] }; out.push(cur); continue; }
    if (!cur) continue;
    if ((m = l.match(/V[íi]nculo:\s*(.+?)\s+CC:.*Horas M[êe]s:\s*([\d,]+)/))) { cur.vinculo = m[1].trim(); cur.horas_mes = n(m[2]); continue; }
    if ((m = l.match(/Cargo:\s*\d*\s*(.+?)\s+C\.?B\.?O:?\s*(\d+).*Sal[áa]rio:\s*([\d.,]+)/))) { cur.cargo = m[1].trim(); cur.cbo = m[2]; cur.salario = n(m[3]); continue; }
    if ((m = l.match(/Proventos:\s*([\d.,]+)\s+Descontos:\s*([\d.,]+).*L[íi]quido:\s*([\d.,]+)/))) { cur.proventos = n(m[1]); cur.descontos = n(m[2]); cur.liquido = n(m[3]); continue; }
    if ((m = l.match(/Valor FGTS:\s*([\d.,]+)/))) { cur.fgts = n(m[1]); continue; }
    let e; EV.lastIndex = 0; while ((e = EV.exec(l))) cur.eventos.push({ codigo: e[1], descricao: e[2].trim(), referencia: e[3], valor: n(e[4]), tipo: e[5] });
  }
  return out;
}

function holerites(L) {
  const out = new Map(); let cur = null, esperaSal = false;
  for (let i = 0; i < L.length; i++) {
    const l = L[i]; let m;
    if ((m = l.match(/^(\d+)\s+(.+?)\s+(\d{6})\s+\S+\s+\S+$/)) && /C[óo]digo Nome do Funcion/i.test(L[i - 1] || '')) {
      cur = out.get(m[1]) || { codigo: m[1], nome: m[2].trim(), cbo: m[3] }; out.set(m[1], cur);
      const p = (L[i + 1] || '').match(/^(.*?)\s*Admiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4})/); if (p) { cur.cargo = p[1].trim() || cur.cargo; cur.admissao = iso(p[2]); }
      continue;
    }
    if (!cur) continue;
    if ((m = l.match(/Valor L[íi]quido\s+([\d.,]+)/))) cur.liquido = n(m[1]);
    if (/^Sal[áa]rio Base/.test(l)) { esperaSal = true; continue; }
    if (esperaSal && (m = l.match(/^([\d.]+,\d{2})/))) { cur.salario = n(m[1]); esperaSal = false; }
  }
  return [...out.values()];
}

function liquidos(L) {
  const out = []; let sec = 'empregado';
  for (const l of L) {
    if (/^Empregados$/i.test(l)) sec = 'empregado'; else if (/^Contribuintes$/i.test(l)) sec = 'contribuinte'; else if (/^Estagi/i.test(l)) sec = 'estagiario';
    const m = l.match(/^(\d+)\s+(.+?)\s+(?:(\S+)\s+)?(\d{1,3}(?:\.\d{3})*,\d{2})$/);
    if (m && !/Total|Empregados:/i.test(l)) { let nome = m[2].trim(); if (m[3] && !/^\d/.test(m[3])) nome += ' ' + m[3]; out.push({ codigo: m[1], nome, liquido: n(m[4]), contribuinte: sec === 'contribuinte' }); }
  }
  return out;
}

function resumoFolha(L) {
  const t = L.join('\n'); const r = { rubricas: [] };
  const totais = [...t.matchAll(/^Total:\s*([\d.,]+)$/gm)].map((m) => n(m[1]));
  r.proventos = totais[0] || 0; r.descontos = totais[1] || 0; r.informativa = totais[2] || 0;
  const g = (re) => { const m = t.match(re); return m ? n(m[1]) : 0; };
  r.liquido = g(/L[íi]quido Geral:\s*([\d.,]+)/); r.fgts = g(/Valor do FGTS:\s*([\d.,]+)/); r.inss = g(/Total INSS:\s*([\d.,]+)/); r.irrf = g(/Valor Total do IRRF:\s*([\d.,]+)/);
  r.base_inss = g(/Base total:\s*([\d.,]+)/); r.base_fgts = g(/Base do FGTS:\s*([\d.,]+)/);
  // deduções que reduzem o DARF previdenciário (a guia sai com INSS − salário-família − salário-maternidade + IRRF)
  r.sal_familia = g(/\(-\)\s*Sal[áa]rio Fam[íi]lia:\s*([\d.,]+)/); r.sal_maternidade = g(/\(-\)\s*Sal[áa]rio Maternidade:\s*([\d.,]+)/);
  r.empregados = g(/No\.? Empregados:\s*(\d+)/); r.contribuintes = g(/No\.? Contribuintes:\s*(\d+)/); r.admissoes = g(/Admiss[õo]es:\s*(\d+)/); r.demitidos = g(/Demitido:\s*(\d+)/); r.ferias = g(/F[ée]rias:\s*(\d+)/);
  for (const l of L) { const m = l.match(/^(\d{2,5})\s+(.+?)\s+(\d+)\s+([\d:.,]+)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*\*?$/); if (m) r.rubricas.push({ codigo: m[1], descricao: m[2], pessoas: +m[3], referencia: m[4], valor: n(m[5]) }); }
  return r;
}

function guiaFGTS(L) {
  const t = L.join('\n'); const r = {};
  r.vencimento = iso((t.match(/Pagar este documento at[ée][\s\S]{0,120}?(\d{2}\/\d{2}\/\d{4})/) || [])[1]);
  r.valor = n((t.match(/Total da Guia:\s*([\d.,]+)/) || t.match(/Valor a recolher\s*\n?\s*([\d.,]+)/) || [])[1]);
  const c = t.match(/^(\d{2})\/(\d{4})\s+(\d+)\s+[\d.,]+/m); if (c) { r.competencia = comp(c[1], c[2]); r.trabalhadores = +c[3]; }
  r.raiz = soDigitos((t.match(/\b(\d{2}\.\d{3}\.\d{3})\b(?!\/)/) || [])[1]);
  r.identificador = (t.match(/\b(\d{16}-\d)\b/) || [])[1] || null;
  return r;
}
function darf(L) {
  const t = L.join('\n'); const r = { codigos: [] };
  const pv = t.match(/Per[íi]odo de Apura[çc][ãa]o.*\n\s*(\S+\/\d{4}|\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})(?:\s+([\d.\-]+))?/);
  if (pv) { r.vencimento = iso(pv[2]); r.numero = pv[3] || null; }
  if (!r.vencimento) r.vencimento = iso((t.match(/Pagar (?:este documento )?at[ée]:?\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1]);
  r.valor = n((t.match(/Valor Total do Documento\s*\n?\s*([\d.,]+)/) || t.match(/Valor:\s*([\d.,]+)/) || [])[1]);
  for (const l of L) { const m = l.match(/^(\d{4})\s+(.+?)\s+((?:\d{1,3}(?:\.\d{3})*,\d{2}\s*)+)$/); if (m) { const vs = m[3].trim().split(/\s+/); r.codigos.push({ codigo: m[1], descricao: m[2], valor: n(vs[vs.length - 1]) }); } }
  return r;
}
function boletoSindical(L) {
  const t = L.join('\n'); const r = {};
  const cb = t.match(/\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+(\d{4})(\d{10})/); if (cb) r.valor = +cb[2] / 100;
  const v = t.match(/Vencimento[\s\S]{0,200}?(\d{2}\/\d{2}\/\d{4})(?![\s\S]{0,5}\d)/); r.vencimento = iso(v?.[1]);
  const datas = [...t.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map((m) => m[1]); if (!r.vencimento && datas.length) r.vencimento = iso(datas[datas.length - 1]);
  r.beneficiario = (t.match(/(SINDICATO[^\n]*?)(?:\s+RG|\s+RECIBO|\n)/) || [])[1]?.trim() || null;
  const ref = semAcento(t).match(/referente\s+(?:a\s+)?(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/); if (ref) r.competencia = comp(MESES.indexOf(ref[1]) + 1, ref[2]);
  return r;
}
// Cartão de ponto (Secullum e parecidos): cada coluna é achada pela posição do cabeçalho
const COLS = [[/^DATA$/, 'data'], [/^ENTRADA\s*(\d)$/, 'e'], [/^SA[ÍI]DA\s*(\d)$/, 's'], [/^NORMAIS$/, 'normais'], [/^FALTAS?$/, 'faltas'], [/^BSALDO$/, 'bsaldo'], [/^BTOTAL$/, 'btotal'],
  [/^BCRED\.?$/, 'bcred'], [/^BDEB\.?$/, 'bdeb'], [/^EX(\d+)%$/, 'ex'], [/^DSR\.DEB$/, 'dsrdeb'], [/^DSR$/, 'dsr'], [/^ATRASOS?$/, 'atrasos'], [/^AD\.?\s*NOT(URNO)?\.?$/, 'adnot'], [/^NOTURNO$/, 'adnot']];
function colunasDoCabecalho(itens) {
  const nomes = []; // [{chave, x}]
  const RE = /DATA|ENTRADA\s*\d|SA[ÍI]DA\s*\d|NORMAIS|FALTAS?|BSALDO|BTOTAL|BCRED\.?|BDEB\.?|EX\d+%|DSR\.DEB|DSR|ATRASOS?|AD\.?\s*NOT(?:URNO)?\.?|NOTURNO/g;
  const soltos = itens.filter((i) => (i.s.match(RE) || []).length === 1);
  const passos = soltos.slice(1).map((i, k) => i.x - soltos[k].x).filter((d) => d > 15 && d < 80).sort((a, b) => a - b);
  const passo = passos[Math.floor(passos.length / 2)] || 38;
  for (const it of itens) (it.s.match(RE) || []).forEach((nm, k) => {
    const c = COLS.find(([re]) => re.test(nm.trim())); if (!c) return; const m = nm.trim().match(c[0]);
    nomes.push({ chave: c[1] === 'e' || c[1] === 's' || c[1] === 'ex' ? c[1] + m[1] : c[1], x: it.x + k * passo });
  });
  return nomes;
}
function porColuna(itens, cols) {
  const out = {};
  for (const it of itens) {
    const toks = it.s.split(/\s+/).filter(Boolean);
    let ci = cols.reduce((b, c, i) => (Math.abs(c.x - it.x) < Math.abs(cols[b].x - it.x) ? i : b), 0);
    for (const t of toks) { if (ci >= cols.length) break; const k = cols[ci].chave; out[k] = out[k] ? out[k] + ' ' + t : t; ci++; }
  }
  return out;
}
const DSEM = { SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6, 'SÁB': 6, DOM: 0 };
function cartaoPonto(pags) {
  const out = []; let periodo = null;
  for (const p of pags) {
    const L = p.linhas, t = L.join('\n'); if (!/CART[ÃA]O PONTO|ESPELHO DE PONTO/i.test(t)) continue;
    const pr = t.match(/Per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*at[ée]\s*(\d{2}\/\d{2}\/\d{4})/); if (pr) periodo = { ini: iso(pr[1]), fim: iso(pr[2]) };
    const iN = L.findIndex((l) => /^NOME:/.test(l)); if (iN < 0) continue;
    const cand = [L[iN].replace(/^NOME:\s*/, ''), ...L.slice(iN + 1, iN + 5)].find((x) => x && /^[A-ZÀ-Ú][A-ZÀ-Ú' ]{4,}$/.test(x) && !/^(SEG|TER|QUA|QUI|SEX|SAB|S[ÁA]B|DOM)\b/.test(x)) || '';
    const nome = cand.replace(/\s+[A-Z]{2,3}$/, (s) => (/^(SJC|SP|RJ|MG|SJ|BH)$/.test(s.trim()) ? '' : s)).trim();
    const la = L.find((l) => /^\d{2}\/\d{2}\/\d{4}\s+\d{3}\.\d{3}\.\d{3}-\d{2}/.test(l)) || '';
    const lf = L.find((l) => /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(l) && /[A-Z]{3,}/.test(l.replace(/[\d./-]+/g, ''))) || '';
    const palavras = lf.replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/, '').replace(/[\d.]{9,}/g, '').trim().split(/\s+/);
    // horário de trabalho previsto por dia da semana
    const horario = {};
    for (const l of L) { const m = l.match(/\b(SEG|TER|QUA|QUI|SEX|SAB|SÁB|DOM)\s+((?:\d{2}:\d{2}|Folga|FOLGA)(?:\s+(?:\d{2}:\d{2}|Folga|FOLGA))*)/); if (m && !/^\d{2}\/\d{2}\/\d{4}/.test(l)) horario[DSEM[m[1]]] = m[2].split(/\s+/).filter((x) => /^\d{2}:\d{2}$/.test(x)); }
    // colunas pela posição do cabeçalho
    const iH = p.linhas.findIndex((l) => /^DATA\b.*ENTRADA/.test(l)); const cols = iH >= 0 ? colunasDoCabecalho(p.itens[iH]) : [];
    const dias = [], totais = {};
    p.linhas.forEach((l, k) => {
      if (/^\d{2}\/\d{2}\/\d{4}\s*-\s*\S{3}/.test(l) && cols.length) {
        const its = p.itens[k]; const m = its[0].s.match(/^(\d{2}\/\d{2}\/\d{4})\s*-\s*(\S{3})/);
        const v = porColuna(its.slice(1), cols.filter((c) => c.chave !== 'data'));
        const bat = [], manual = []; let st = '';
        ['e1', 's1', 'e2', 's2', 'e3', 's3', 'e4', 's4'].forEach((c) => { const x = v[c]; if (!x) return; if (/^\d{2}:\d{2}/.test(x)) { bat.push(x.slice(0, 5)); if (/[*¨^]/.test(x)) manual.push(x.slice(0, 5)); } else if (!st) st = x.toUpperCase(); });
        dias.push({ data: iso(m[1]), dia: m[2], bat, manual, st, normais: v.normais || '', faltas: v.faltas || '', bsaldo: v.bsaldo || '', btotal: v.btotal || '', bcred: v.bcred || '', bdeb: v.bdeb || '', ex60: v.ex60 || v.ex50 || '', ex100: v.ex100 || '', dsr: v.dsr || '', dsrdeb: v.dsrdeb || '', adnot: v.adnot || '' });
      } else if (/^TOTAIS\b/.test(l) && cols.length) Object.assign(totais, porColuna(p.itens[k].filter((i) => !/^TOTAIS$/.test(i.s)).map((i) => ({ ...i, s: i.s.replace(/^TOTAIS\s*/, '') })), cols.filter((c) => !/^(data|e\d|s\d)$/.test(c.chave))));
    });
    let c = out.find((x) => x.nome === nome);
    if (!c) { c = { nome, cpf: soDigitos((la.match(RE_CPF) || [])[0]), admissao: iso((la.match(/\d{2}\/\d{2}\/\d{4}/) || [])[0]), nFolha: (la.match(/(\d+)\s*$/) || [])[1] || null, funcao: palavras.slice(-1)[0] || null, departamento: palavras.length > 1 ? palavras.slice(-2, -1)[0] : null, horario, dias: [], totais: {} }; out.push(c); }
    c.dias.push(...dias); Object.assign(c.totais, totais);
  }
  return { periodo, colaboradores: out };
}
function cartaoPontoAntigo(pags) {
  const out = []; let periodo = null;
  for (const p of pags) {
    const L = p.linhas, t = L.join('\n');
    const pr = t.match(/Per[íi]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*at[ée]\s*(\d{2}\/\d{2}\/\d{4})/); if (pr) periodo = { ini: iso(pr[1]), fim: iso(pr[2]) };
    const iN = L.findIndex((l) => /^NOME:/.test(l)); if (iN < 0) continue;
    // o nome vem logo depois de "NOME:", pulando as linhas do horário (SEG 10:00 ...)
    const cand = [L[iN].replace(/^NOME:\s*/, ''), ...L.slice(iN + 1, iN + 5)].find((x) => x && /^[A-ZÀ-Ú][A-ZÀ-Ú' ]{4,}$/.test(x) && !/^(SEG|TER|QUA|QUI|SEX|SAB|S[ÁA]B|DOM)\b/.test(x)) || '';
    const nome = cand.replace(/\s+[A-Z]{2,3}$/, (s) => (/^(SJC|SP|RJ|MG|SJ|BH)$/.test(s.trim()) ? '' : s)).trim();
    const la = L.find((l) => /^\d{2}\/\d{2}\/\d{4}\s+\d{3}\.\d{3}\.\d{3}-\d{2}/.test(l)) || '';
    const fu = L.find((l) => RE_CNPJ.test(l) && /[A-Z]{3,}/.test(l.replace(RE_CNPJ, ''))) || ''; RE_CNPJ.lastIndex = 0;
    const funcao = fu.replace(RE_CNPJ, '').replace(/[\d.]{9,}/g, '').trim().split(/\s+/).slice(-1)[0] || null; RE_CNPJ.lastIndex = 0;
    const dias = L.filter((l) => /^\d{2}\/\d{2}\/\d{4}\s*-\s*\w{3}/.test(l)).map((l) => { const m = l.match(/^(\d{2}\/\d{2}\/\d{4})\s*-\s*(\w{3})\s*(.*)$/); return { data: iso(m[1]), dia: m[2], resto: m[3] }; });
    let c = out.find((x) => x.nome === nome); if (!c) { c = { nome, cpf: soDigitos((la.match(RE_CPF) || [])[0]), admissao: iso((la.match(/\d{2}\/\d{2}\/\d{4}/) || [])[0]), funcao, dias: [] }; out.push(c); }
    c.dias.push(...dias);
  }
  return { periodo, colaboradores: out };
}

// --------------------------------- reconhecer um arquivo ---------------------------------
export async function reconhecer(arquivo) {
  const ext = arquivo.name.split('.').pop().toLowerCase();
  const base = { arquivo, nome: arquivo.name, tipo: 'outro', departamento: null, competencia: null, cnpjs: [], dados: null, resumo: '' };
  try {
    if (ext === 'xml') {
      const x = lerXML(await arquivo.text());
      if (!x) return { ...base, resumo: 'XML que não é nota fiscal' };
      if (x.tipo === 'nota') return { ...base, tipo: 'nota', departamento: 'fiscal', competencia: x.data?.slice(0, 7), cnpjs: [x.emit.cnpj, x.dest.cnpj, x.tomador].filter(Boolean), dados: x, chave: x.chave };
      if (x.tipo === 'cancelamento') return { ...base, tipo: 'cancelamento', departamento: 'fiscal', competencia: x.data?.slice(0, 7), cnpjs: [x.cnpj], dados: x };
      if (x.tipo === 'inutilizacao') return { ...base, tipo: 'inutilizacao', departamento: 'fiscal', competencia: x.data?.slice(0, 7), cnpjs: [x.cnpj], dados: x };
      return { ...base, tipo: 'evento', departamento: 'fiscal', competencia: x.data?.slice(0, 7), cnpjs: [x.cnpj], dados: x };
    }
    // ficha do colaborador preenchida (modelo gerado pelo sistema) ou outras planilhas
    if (/^(xlsx|xls|csv|ods)$/.test(ext)) {
      const { lerPlanilha } = await import('./leitor.js'); const { ehFicha, lerFicha } = await import('./ficha-modelo.js');
      const linhas = await lerPlanilha(arquivo);
      if (ehFicha(linhas)) { const fi = lerFicha(linhas); return { ...base, tipo: 'ficha_colaborador', departamento: 'dp', competencia: (fi.colaborador.admissao || new Date().toISOString()).slice(0, 7), cnpjs: fi.cnpj ? [fi.cnpj] : [], nomeEmpresa: fi.empresa, dados: fi }; }
      return { ...base, departamento: depPeloNome(arquivo.name), competencia: classificar(arquivo.name).competencia, resumo: 'Planilha (guardada em Documentos)' };
    }
    if (ext === 'ofx') { const o = lerOFX(await arquivo.text()); return { ...base, tipo: 'extrato', departamento: 'contabil', competencia: o.fim?.slice(0, 7) || null, dados: o, cnpjs: [] }; }
    if (ext === 'pdf') {
      const pdf = await textoPDF(arquivo);
      const L = pdf.paginas.flatMap((p) => p.linhas), t = L.join('\n'), h = cabecalho(L.slice(0, 40)), T = semAcento(t);
      const compNome = classificar(arquivo.name).competencia;
      const r = (tipo, dados, extra = {}) => ({ ...base, tipo, departamento: TIPOS[tipo][1], competencia: extra.competencia || h.competencia || compNome, cnpjs: extra.cnpjs || h.cnpjs, codigoEmpresa: h.codigo, nomeEmpresa: limpaNome(extra.nomeEmpresa || h.nomeEmpresa) || nomeDoTopo(L), dados, paginas: pdf.total });
      // PDF escaneado (imagem, sem texto): reconhece pelo nome do arquivo e só guarda
      if (L.join('').replace(/[_\s]/g, '').length < 40) {
        const tn = tipoPeloNome(arquivo.name);
        return { ...base, tipo: tn, departamento: TIPOS[tn][1] || depPeloNome(arquivo.name), competencia: compNome, semTexto: true, paginas: pdf.total, resumo: 'PDF escaneado (imagem): guardado, sem leitura dos dados' };
      }
      if (/PROGRAMA[ÇC][ÃA]O DE F[ÉE]RIAS/.test(t)) return r('ferias_programacao', { colaboradores: programacaoFerias(L), data_base: iso((t.match(/Data base:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1]) });
      if (/RESUMO DA FOLHA/.test(t)) return r('folha_resumo', resumoFolha(L));
      if (/EXTRATO MENSAL/.test(t) && /Empr\.?:/.test(t)) return r('folha_extrato', { colaboradores: folhaExtrato(L) });
      if (/RELA[ÇC][ÃA]O GERAL DOS L[ÍI]QUIDOS/.test(t)) return r('liquidos', { colaboradores: liquidos(L) });
      if (/Declaro ter recebido a import[âa]ncia l[íi]quida/i.test(t)) return r('holerites', { colaboradores: holerites(L) });
      if (/Guia do FGTS Digital/i.test(t)) { const g = guiaFGTS(L); return r('guia_fgts', g, { competencia: g.competencia || h.competencia, cnpjs: h.cnpjs.length ? h.cnpjs : [g.raiz] }); }
      if (/Rela[çc][ãa]o de Trabalhadores/i.test(t) && /FGTS/.test(t)) return r('fgts_detalhe', {});
      if (/Recibo de Entrega da Declara[çc][ãa]o de D[ée]bitos e Cr[ée]ditos Tribut[áa]rios Federais\s*-\s*DCTFWeb/i.test(t)) return r('recibo_dctfweb', { debitos: n((t.match(/Contribui[çc][ãa]o Previdenci[áa]ria Segurados R\$\s*([\d.,]+)/) || [])[1]) });
      if (/RELAT[ÓO]RIO DE CR[ÉE]DITOS\s*-\s*DCTFWeb/i.test(t)) return r('creditos_dctfweb', {});
      if (/EXTRATO DO PROCESSAMENTO/i.test(t) && /DCTFWeb/i.test(t)) return r('extrato_dctfweb', {});
      if (/Documento de Arrecada[çc][ãa]o do Simples Nacional/i.test(t)) { const d = darf(L); return r('guia_das', d); }
      if (/Documento de Arrecada[çc][ãa]o\s*\n?\s*de Receitas Federais/i.test(t) || /Documento de Arrecada[çc][ãa]o de Receitas Federais/i.test(t)) {
        const d = darf(L); const prev = d.codigos.some((c) => /^(1082|1099|1138|1141|1646|1170|1176|1191|1196|1200|1213|1218|2985|2991|1162|1186|1201)$/.test(c.codigo)) || /CONTR PREV|CP SEGURADOS|PREVIDENCI/i.test(t);
        return r(prev ? 'guia_darf_dp' : 'guia_darf_fiscal', d);
      }
      if (/CONTRIBUI[ÇC][ÃA]O ASSISTENCIAL|CONTRIBUI[ÇC][ÃA]O SINDICAL|SINDICATO/.test(t) && /Vencimento/i.test(t)) { const b = boletoSindical(L); return r('guia_sindical', b, { competencia: b.competencia || h.competencia }); }
      // o cartão vale para o mês em que o período termina (ex.: 21/06 a 20/07 = julho)
      if (/CART[ÃA]O PONTO|ESPELHO DE PONTO/i.test(t)) { const c = cartaoPonto(pdf.paginas); return r('cartao_ponto', c, { competencia: (c.periodo?.fim || c.periodo?.ini)?.slice(0, 7) || h.competencia }); }
      if (/\bSALDO\b/.test(T.toUpperCase()) && /EXTRATO/.test(T.toUpperCase()) && /AGENCIA|CONTA/.test(T.toUpperCase())) return r('extrato', {});
      return { ...r('outro', null), departamento: depPeloNome(arquivo.name), resumo: 'PDF não reconhecido' };
    }
    return { ...base, departamento: depPeloNome(arquivo.name), competencia: classificar(arquivo.name).competencia, resumo: 'Tipo de arquivo não lido automaticamente' };
  } catch (e) {
    return { ...base, erro: 'Não consegui ler: ' + e.message, departamento: depPeloNome(arquivo.name) };
  }
}
export function limpaNome(s) {
  if (!s) return null;
  return s.replace(RE_CNPJ, ' ').replace(/\s+P[áa]gina:.*$/, '').replace(/\bCNPJ\b.*$/i, '').replace(/^.*?(Empresa:|Nome\/Raz[ãa]o Social|Nome do Contribuinte|Nome\/Raz[ãa]o Social do Empregador|Nome)\s*/i, '')
    .replace(/^[\d.\/\-\s]+/, '').replace(/^\d+\s*-\s*/, '').replace(/\.$/, '').replace(/\s+/g, ' ').trim() || null;
}
function nomeDoTopo(L) { const l = L.find((x) => /(LTDA|EIRELI|S\.?A\.?|ME|EPP|MEI)\b/.test(x) && !/SINDICATO|BENEFICI|CAIXA|BANCO/i.test(x)); RE_CNPJ.lastIndex = 0; return limpaNome(l); }
function tipoPeloNome(nome) {
  const s = semAcento(nome).replace(/[_.\-]+/g, ' ');
  if (/ponto|espelho/.test(s)) return 'cartao_ponto';
  if (/assist|sindic/.test(s)) return 'guia_sindical';
  if (/detalhe.{0,6}fgts|re fgts/.test(s)) return 'fgts_detalhe';
  if (/fgts/.test(s)) return 'guia_fgts';
  if (/darf/.test(s)) return 'guia_darf_dp';
  if (/\bdas\b/.test(s)) return 'guia_das';
  if (/dctf/.test(s)) return 'recibo_dctfweb';
  if (/holerite|recibo.{0,4}pagamento|contracheque/.test(s)) return 'holerites';
  if (/liquido/.test(s)) return 'liquidos';
  if (/resumo/.test(s)) return 'folha_resumo';
  if (/folha|extrato mensal/.test(s)) return 'folha_extrato';
  if (/ferias/.test(s)) return 'ferias_programacao';
  if (/extrato/.test(s)) return 'extrato';
  return 'outro';
}
function depPeloNome(nome) {
  const c = classificar(nome).tipo;
  return { holerite: 'dp', ponto: 'dp', atestado: 'dp', guia: 'fiscal', extrato: 'contabil', contrato: 'contabil', balancete: 'contabil', nfe: 'fiscal', nfse: 'fiscal', cte: 'fiscal' }[c] || null;
}
