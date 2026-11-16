// Cálculos ESTIMADOS do DP (rescisão, férias, custo de contratação). O cálculo oficial é sempre o do Domínio.
// As tabelas ficam em Configurações (podem ser atualizadas todo ano); estes são os valores padrão.
export const TABELAS_PADRAO = {
  ano: 2026,
  salario_minimo: 1518.0,
  inss: [[1518.0, 0.075], [2793.88, 0.09], [4190.83, 0.12], [8157.41, 0.14]],             // faixas progressivas (teto na última)
  irrf: [[2428.8, 0, 0], [2826.65, 0.075, 182.16], [3751.05, 0.15, 394.16], [4664.68, 0.225, 675.49], [Infinity, 0.275, 908.73]], // [até, alíquota, parcela a deduzir]
  irrf_dependente: 189.59, irrf_desconto_simplificado: 607.2,
  irrf_reducao_2026: true,                                                                // isenção até R$ 5.000 e redução até R$ 7.350 (Lei 15.270/2025)
  fgts: 0.08, inss_patronal: 0.2, rat: 0.02, terceiros: 0.058,
};
let T = { ...TABELAS_PADRAO };
export const usarTabelas = (t) => { T = { ...TABELAS_PADRAO, ...(t || {}) }; };
export const tabelas = () => T;

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
export function inss(base) {
  let ant = 0, tot = 0;
  for (const [ate, al] of T.inss) { if (base <= ant) break; tot += (Math.min(base, ate) - ant) * al; ant = ate; }
  return r2(tot);
}
export function irrf(bruto, inssDesc, dependentes = 0) {
  const legal = bruto - inssDesc - dependentes * T.irrf_dependente, simpl = bruto - T.irrf_desconto_simplificado;
  const base = Math.max(0, Math.min(legal, simpl));
  const f = T.irrf.find(([ate]) => base <= ate); let imp = Math.max(0, base * f[1] - f[2]);
  if (T.irrf_reducao_2026) { if (bruto <= 5000) imp = 0; else if (bruto <= 7350) imp = Math.max(0, imp - Math.max(0, 978.62 - 0.133145 * bruto)); }
  return r2(imp);
}
const d = (s) => new Date(s + 'T12:00:00');
const dataCurta = (s) => s.split('-').reverse().join('/');
const meses = (a, b) => { const x = d(a), y = d(b); return (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth(); };
// avos: mês com 15 dias ou mais trabalhados conta 1/12
function avos(ini, fim) {
  let n = 0; const a = d(ini), b = d(fim);
  for (let y = a.getFullYear(), m = a.getMonth(); y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth()); m++) {
    if (m > 11) { m = 0; y++; if (y > b.getFullYear()) break; }
    const ini_ = Math.max(+new Date(y, m, 1, 12), +a), fim_ = Math.min(+new Date(y, m + 1, 0, 12), +b);
    if ((fim_ - ini_) / 864e5 + 1 >= 15) n++;
  }
  return n;
}
const somaDias = (s, n) => { const x = d(s); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE'); };
// soma meses mantendo o dia (31/01 + 1 mês = 28/02)
export function somaMeses(s, n) { const x = d(s), dd = x.getDate(); x.setDate(1); x.setMonth(x.getMonth() + n); x.setDate(Math.min(dd, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return x.toLocaleDateString('sv-SE'); }
// avos de férias: meses contados a partir do aniversário da admissão; sobra de 15 dias ou mais conta 1/12
function avosAniv(ini, fim) {
  let n = 0; while (n < 12 && somaDias(somaMeses(ini, n + 1), -1) <= fim) n++;
  if (n < 12 && (d(fim) - d(somaMeses(ini, n))) / 864e5 + 1 >= 15) n++;
  return n;
}
// períodos aquisitivos da admissão até a data (com o fim do prazo para tirar = período concessivo)
export function periodosAquisitivos(admissao, ate) {
  const per = [];
  for (let k = 0; k < 60; k++) {
    const ini = somaMeses(admissao, 12 * k); if (ini > ate) break;
    per.push({ ini, fim: somaDias(somaMeses(admissao, 12 * (k + 1)), -1), limite: somaDias(somaMeses(admissao, 12 * (k + 2)), -1) });
  }
  return per.map((p) => ({ ...p, completo: p.fim <= ate }));
}
// domingos e dias úteis do mês (para o DSR das horas extras)
function domingosDoMes(s) { const x = d(s), tot = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); let dom = 0; for (let i = 1; i <= tot; i++) if (new Date(x.getFullYear(), x.getMonth(), i).getDay() === 0) dom++; return { dom, uteis: tot - dom }; }
// dias de segunda a sexta do mês: total e os que vêm depois da data
function diasSemana(s) { const x = d(s), tot = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); let t = 0, dep = 0; for (let i = 1; i <= tot; i++) { const w = new Date(x.getFullYear(), x.getMonth(), i).getDay(); if (w && w < 6) { t++; if (i > x.getDate()) dep++; } } return { t, dep }; }

export const TIPOS_RESCISAO = {
  sem_justa: 'Dispensa sem justa causa', pedido: 'Pedido de demissão', acordo: 'Acordo entre as partes (art. 484-A)', justa_causa: 'Dispensa por justa causa',
  fim_experiencia: 'Término do contrato de experiência', antecipada_empregador: 'Experiência encerrada antes pelo empregador (art. 479)', antecipada_empregado: 'Experiência encerrada antes pelo empregado (art. 480)',
};
export const AVISOS = { indenizado: 'Indenizado', trabalhado: 'Trabalhado (ou dispensado do restante: use a data final do aviso)', dispensado: 'Dispensado / não se aplica' };

// ---------- rescisão ----------
// Médias: horas extras (2 percentuais) + DSR automático + outras variáveis. Entram no aviso, 13º e férias — nunca no saldo de salário.
export function mediasVariaveis({ salario, jornada = 220, heHoras1 = 0, hePerc1 = 60, heHoras2 = 0, hePerc2 = 100, outrasMedias = 0, medias = 0, mesRef }) {
  const hora = (+salario || 0) / (+jornada || 220);
  const he = hora * ((+heHoras1 || 0) * (1 + (+hePerc1 || 0) / 100) + (+heHoras2 || 0) * (1 + (+hePerc2 || 0) / 100));
  const { dom, uteis } = domingosDoMes(mesRef || new Date().toLocaleDateString('sv-SE'));
  const dsr = he ? he * dom / uteis : 0;
  return { he: r2(he), dsr: r2(dsr), dom, uteis, outras: r2(+outrasMedias || 0), total: r2(he + dsr + (+outrasMedias || 0) + (+medias || 0)) };
}

export function simularRescisao({ salario, admissao, desligamento, tipo, aviso = 'indenizado', feriasTiradas = null, feriasVencidasDias = 0, saldoFgts = null, dependentes = 0, fimExperiencia = null,
  medias = 0, jornada = 220, heHoras1 = 0, hePerc1 = 60, heHoras2 = 0, hePerc2 = 100, outrasMedias = 0, variaveisMes = 0,
  consignado = 0, beneficioValor = 0, beneficioUsouAte = null, outrosDescontos = 0 }) {
  const sal0 = +salario || 0;
  const M = mediasVariaveis({ salario: sal0, jornada, heHoras1, hePerc1, heHoras2, hePerc2, outrasMedias, medias, mesRef: desligamento });
  const rem = sal0 + M.total, dia = rem / 30;
  let anos = 0; while (anos < 40 && somaMeses(admissao, 12 * (anos + 1)) <= desligamento) anos++; // anos completos de casa
  // trib: 'sal' = com o salário do mês (INSS/IRRF), '13' = com o 13º; sem trib = indenizado (sem INSS/IRRF)
  const L = [], add = (rotulo, v, nota = '', desconto = false, trib = null) => { if (v) L.push({ rotulo, valor: r2(v), nota, desconto, trib }); };
  const notaMed = M.total ? `com médias de ${(M.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês` : '';
  // saldo de salário: só o salário (mês cheio = 30 dias)
  const x = d(desligamento), ultimo = x.getDate() === new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  const diasMes = ultimo ? 30 : Math.min(30, x.getDate()); add(`Saldo de salário (${diasMes} dia(s))`, sal0 / 30 * diasMes, '', false, 'sal');
  add('Horas extras e variáveis do mês da saída', +variaveisMes || 0, 'o que foi feito no próprio mês', false, 'sal');
  // aviso prévio (Lei 12.506: 30 dias + 3 por ano completo, até 90 — o proporcional só vale quando a empresa dispensa)
  const diasAviso = tipo === 'pedido' ? 30 : Math.min(90, 30 + 3 * Math.max(0, anos));
  let projecao = desligamento;
  if (['sem_justa', 'acordo'].includes(tipo) && aviso === 'indenizado') { const dAv = tipo === 'acordo' ? diasAviso / 2 : diasAviso; add(`Aviso prévio indenizado (${dAv} dias)`, dia * dAv, [tipo === 'acordo' ? 'metade no acordo' : `30 + 3 por ano (${anos} ano(s))`, notaMed].filter(Boolean).join(' · ')); projecao = somaDias(desligamento, diasAviso); }
  // aviso trabalhado: só 30 dias são trabalhados; os dias a mais (3 por ano) são indenizados
  if (tipo === 'sem_justa' && aviso === 'trabalhado' && diasAviso > 30) { add(`Aviso prévio indenizado (${diasAviso - 30} dias além dos 30 trabalhados)`, dia * (diasAviso - 30), '3 por ano de casa'); projecao = somaDias(desligamento, diasAviso - 30); }
  if (tipo === 'pedido' && aviso === 'indenizado') add('Desconto do aviso prévio não cumprido (30 dias)', sal0, 'quando o empregado não cumpre o aviso', true);
  // 13º proporcional (ano da saída)
  const inicioAno = `${desligamento.slice(0, 4)}-01-01`; const av13 = tipo === 'justa_causa' ? 0 : avos(admissao > inicioAno ? admissao : inicioAno, projecao);
  add(`13º salário proporcional (${av13}/12)`, rem / 12 * av13, notaMed, false, '13');
  // férias: períodos completos (vencidas, em dobro se passou o prazo para tirar) + proporcionais desde o último aniversário
  const per = periodosAquisitivos(admissao, projecao), feriasDet = [];
  if (feriasTiradas == null) { if (feriasVencidasDias) add(`Férias vencidas (${feriasVencidasDias} dias) + 1/3`, dia * feriasVencidasDias * 4 / 3, notaMed); }
  else {
    let tir = Math.max(0, +feriasTiradas || 0);
    for (const p of per.filter((p) => p.completo)) {
      const usa = Math.min(30, tir); tir -= usa; const resta = 30 - usa;
      const dobro = p.limite < desligamento;
      feriasDet.push({ ...p, tiradas: usa, resta, dobro });
      if (resta) add(`Férias vencidas ${dataCurta(p.ini)} a ${dataCurta(p.fim)} (${resta} dias) + 1/3${dobro ? ' · EM DOBRO' : ''}`, dia * resta * 4 / 3 * (dobro ? 2 : 1), [dobro ? `o prazo para tirar acabou em ${dataCurta(p.limite)} (art. 137)` : `prazo para tirar até ${dataCurta(p.limite)}`, notaMed].filter(Boolean).join(' · '));
    }
  }
  const atual = per.find((p) => !p.completo);
  if (tipo !== 'justa_causa' && atual) {
    const avF = avosAniv(atual.ini, projecao);
    add(`Férias proporcionais (${avF}/12) + 1/3`, rem / 12 * avF * 4 / 3, [`período desde ${dataCurta(atual.ini)}${projecao !== desligamento ? ', contando o aviso' : ''}`, notaMed].filter(Boolean).join(' · '));
  }
  // experiência encerrada antes do fim
  if (tipo === 'antecipada_empregador' && fimExperiencia) { const rest = Math.max(0, (d(fimExperiencia) - d(desligamento)) / 864e5); add(`Indenização art. 479 (metade de ${Math.round(rest)} dias restantes)`, dia * rest / 2); }
  if (tipo === 'antecipada_empregado' && fimExperiencia) { const rest = Math.max(0, (d(fimExperiencia) - d(desligamento)) / 864e5); add(`Indenização art. 480 (até metade de ${Math.round(rest)} dias)`, dia * rest / 2, 'limitada ao prejuízo do empregador', true); }
  // descontos legais estimados
  const sal = L.filter((x) => !x.desconto && x.trib === 'sal').reduce((s, x) => s + x.valor, 0), dec = L.filter((x) => !x.desconto && x.trib === '13').reduce((s, x) => s + x.valor, 0);
  const inssSal = inss(sal), inss13 = inss(dec);
  add('INSS sobre o saldo de salário (estimado)', inssSal, '', true); add('INSS sobre o 13º (estimado)', inss13, '', true);
  add('IRRF (estimado)', irrf(sal, inssSal, dependentes) + irrf(dec, inss13, dependentes), 'saldo e 13º tributados separadamente', true);
  // outros descontos
  if (+beneficioValor && beneficioUsouAte) { const { t, dep } = diasSemana(beneficioUsouAte); add(`Benefício creditado e não usado (${dep} de ${t} dias úteis)`, +beneficioValor * dep / t, `VA/VR/VT creditado no mês; usado até ${dataCurta(beneficioUsouAte)}`, true); }
  add('Outros descontos', +outrosDescontos || 0, 'adiantamentos, faltas, convênios etc.', true);
  const brutoA = L.filter((x) => !x.desconto).reduce((s, x) => s + x.valor, 0), legais = L.filter((x) => x.desconto && /INSS|IRRF/.test(x.rotulo)).reduce((s, x) => s + x.valor, 0);
  let consig = null;
  if (+consignado) { const lim = r2((brutoA - legais) * 0.35), val = Math.min(+consignado, lim); consig = { saldo: +consignado, limite: lim, descontado: r2(val), restante: r2(+consignado - val) };
    add('Empréstimo consignado (quitação)', val, `limite de 35% das verbas rescisórias = ${lim.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${consig.restante > 0 ? ` · o restante (${consig.restante.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) continua com o banco` : ''}`, true); }
  const bruto = L.filter((x) => !x.desconto).reduce((s, x) => s + x.valor, 0), desc = L.filter((x) => x.desconto).reduce((s, x) => s + x.valor, 0);
  // FGTS
  const fgtsEst = saldoFgts != null && saldoFgts !== '' ? +saldoFgts : rem * T.fgts * Math.max(1, meses(admissao, desligamento));
  const multa = tipo === 'sem_justa' || tipo === 'antecipada_empregador' ? 0.4 : tipo === 'acordo' ? 0.2 : 0;
  const saque = tipo === 'sem_justa' || tipo === 'antecipada_empregador' || tipo === 'fim_experiencia' ? 'Pode sacar 100% do FGTS' : tipo === 'acordo' ? 'Pode sacar 80% do FGTS' : 'Não saca o FGTS';
  const seguro = tipo === 'sem_justa' || tipo === 'antecipada_empregador' ? 'Tem direito ao seguro-desemprego (se cumprir as carências)' : 'Sem seguro-desemprego';
  return { linhas: L, bruto: r2(bruto), descontos: r2(desc), liquido: r2(bruto - desc), diasAviso, anos, projecao, fgtsEstimado: r2(fgtsEst), multaFgts: r2(fgtsEst * multa), percMulta: multa * 100, saque, seguro,
    medias: M, ferias: feriasDet, consignado: consig,
    prazoPagamento: somaDias(desligamento, 10), fgtsRescisorio: r2((L.filter((x) => /Aviso prévio indenizado/.test(x.rotulo)).reduce((s, x) => s + x.valor, 0) + sal + dec) * T.fgts) };
}

// ---------- férias ----------
export function simularFerias({ salario, medias = 0, dias = 30, abono = 0, adiantar13 = false, dependentes = 0, inicio }) {
  const rem = (+salario || 0) + (+medias || 0), dia = rem / 30;
  const ferias = dia * dias, terco = ferias / 3, ab = dia * abono, abTerco = ab / 3;
  const inssF = inss(ferias + terco), irrfF = irrf(ferias + terco, inssF, dependentes);
  const L = [{ rotulo: `Férias (${dias} dias)`, valor: r2(ferias) }, { rotulo: '1/3 constitucional', valor: r2(terco) }];
  if (abono) L.push({ rotulo: `Abono pecuniário (${abono} dias vendidos)`, valor: r2(ab), nota: 'sem INSS e IRRF' }, { rotulo: '1/3 do abono', valor: r2(abTerco) });
  if (adiantar13) L.push({ rotulo: 'Adiantamento da 1ª parcela do 13º', valor: r2(rem / 2), nota: 'pedido até janeiro' });
  L.push({ rotulo: 'INSS (estimado)', valor: inssF, desconto: true }, { rotulo: 'IRRF (estimado)', valor: irrfF, desconto: true });
  const bruto = L.filter((x) => !x.desconto).reduce((s, x) => s + x.valor, 0), desc = L.filter((x) => x.desconto).reduce((s, x) => s + x.valor, 0);
  const fim = inicio ? somaDias(inicio, dias - 1) : null;
  return { linhas: L, bruto: r2(bruto), descontos: r2(desc), liquido: r2(bruto - desc), fim, retorno: fim ? somaDias(fim, 1) : null, pagamentoAte: inicio ? somaDias(inicio, -2) : null, avisoAte: inicio ? somaDias(inicio, -30) : null };
}

// ---------- custo de contratação ----------
export function custoContratacao({ salario, regime = 'simples', anexoIV = false, vtDia = 0, vrDia = 0, diasMes = 22, outros = 0 }) {
  const s = +salario || 0;
  const patronal = regime === 'simples' && !anexoIV ? 0 : s * (T.inss_patronal + T.rat + T.terceiros);
  const fgts = s * T.fgts, dec = s / 12, ferias = s / 12 * 4 / 3;
  const encProv = (dec + ferias) * (T.fgts + (regime === 'simples' && !anexoIV ? 0 : T.inss_patronal + T.rat + T.terceiros));
  const vt = Math.max(0, vtDia * diasMes - s * 0.06), vr = vrDia * diasMes;
  const L = [['Salário', s], ['FGTS (8%)', fgts], ['13º salário (1/12 por mês)', dec], ['Férias + 1/3 (1/12 por mês)', ferias], ['Encargos sobre 13º e férias', encProv],
    [regime === 'simples' && !anexoIV ? 'INSS patronal (Simples: já no DAS)' : 'INSS patronal + RAT + terceiros', patronal], ['Vale-transporte (parte da empresa)', vt], ['Vale-refeição / alimentação', vr], ['Outros benefícios', +outros || 0]]
    .map(([rotulo, valor]) => ({ rotulo, valor: r2(valor) }));
  const mensal = L.reduce((t, x) => t + x.valor, 0);
  return { linhas: L, mensal: r2(mensal), anual: r2(mensal * 12), multiplicador: s ? r2(mensal / s) : 0 };
}
