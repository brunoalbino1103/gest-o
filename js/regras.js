// Regras de prazo: dias úteis, feriados, periodicidade e geração das tarefas do mês.
// É usado tanto no modo demonstração quanto com o Supabase (a geração roda no navegador).
import { somaMes } from './util.js';

const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dt = (s) => new Date(s + 'T12:00:00');
const mais = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };

// Domingo de Páscoa (algoritmo de Meeus/Butcher)
export function pascoa(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
const cacheFer = new Map();
// Feriados nacionais + dias sem expediente bancário (Carnaval). Extras (municipais/estaduais) vêm do cadastro.
export function feriadosNacionais(y) {
  if (cacheFer.has(y)) return cacheFer.get(y);
  const p = pascoa(y);
  const m = new Map([
    [`${y}-01-01`, 'Confraternização Universal'], [mais(p, -48), 'Carnaval'], [mais(p, -47), 'Carnaval'], [mais(p, -2), 'Sexta-feira Santa'],
    [`${y}-04-21`, 'Tiradentes'], [`${y}-05-01`, 'Dia do Trabalho'], [mais(p, 60), 'Corpus Christi'], [`${y}-09-07`, 'Independência'],
    [`${y}-10-12`, 'Nossa Senhora Aparecida'], [`${y}-11-02`, 'Finados'], [`${y}-11-15`, 'Proclamação da República'],
    [`${y}-11-20`, 'Dia da Consciência Negra'], [`${y}-12-25`, 'Natal'],
  ]);
  cacheFer.set(y, m); return m;
}
let extras = new Map(); // data ISO -> nome
export function definirFeriadosExtras(lista) { extras = new Map((lista || []).map((f) => [f.data, f.nome])); }
export function nomeFeriado(s) { return feriadosNacionais(+s.slice(0, 4)).get(s) || extras.get(s) || null; }
export function eDiaUtil(s) { const w = dt(s).getDay(); return w !== 0 && w !== 6 && !nomeFeriado(s); }
const ultimoDia = (comp) => { const [y, m] = comp.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export function nesimoDiaUtil(comp, n) { let d = comp + '-01', k = 0; for (let i = 0; i < 40; i++) { if (eDiaUtil(d)) { k++; if (k === n) return d; } d = mais(d, 1); } return d; }
export function ultimoDiaUtil(comp) { let d = comp + '-' + String(ultimoDia(comp)).padStart(2, '0'); while (!eDiaUtil(d)) d = mais(d, -1); return d; }
export function proximoDiaUtil(s) { let d = mais(s, 1); while (!eDiaUtil(d)) d = mais(d, 1); return d; }
export function ajustar(s, modo) { if (modo === 'nenhum' || eDiaUtil(s)) return s; const p = modo === 'antecipa' ? -1 : 1; while (!eDiaUtil(s)) s = mais(s, p); return s; }

export const PERIODOS = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };
export const TIPOS_DIA = { corrido: 'Dia do mês', util: 'Dia útil', ultimo_util: 'Último dia útil' };
export const AJUSTES = { antecipa: 'Antecipa para o dia útil anterior', prorroga: 'Prorroga para o próximo dia útil', nenhum: 'Não ajusta' };

// A obrigação vale para esta competência? (trimestral: mar/jun/set/dez; anual: só no mês escolhido)
export function valeNaCompetencia(o, comp) {
  const m = +comp.slice(5, 7);
  if (o.periodicidade === 'trimestral') return m % 3 === 0;
  if (o.periodicidade === 'anual') return m === (+o.mes_ref || 12);
  return true;
}
// Vencimento de uma obrigação na competência
export function vencimentoDe(o, comp) {
  const alvo = somaMes(comp, o.meses_depois ?? (o.mes_seguinte === false ? 0 : 1));
  if (o.tipo_dia === 'util') return nesimoDiaUtil(alvo, Math.max(1, +o.dia_vencimento || 1));
  if (o.tipo_dia === 'ultimo_util') return ultimoDiaUtil(alvo);
  const d = alvo + '-' + String(Math.min(+o.dia_vencimento || 1, ultimoDia(alvo))).padStart(2, '0');
  return ajustar(d, o.ajuste || 'nenhum');
}
export function descreverPrazo(o) {
  const quando = (o.meses_depois ?? 1) === 0 ? 'do próprio mês' : (o.meses_depois ?? 1) === 1 ? 'do mês seguinte' : `do ${o.meses_depois}º mês seguinte`;
  const base = o.tipo_dia === 'util' ? `${o.dia_vencimento}º dia útil ${quando}` : o.tipo_dia === 'ultimo_util' ? `último dia útil ${quando}` : `dia ${o.dia_vencimento} ${quando}`;
  const aj = o.tipo_dia === 'corrido' && o.ajuste && o.ajuste !== 'nenhum' ? (o.ajuste === 'antecipa' ? ' (antecipa)' : ' (prorroga)') : '';
  return base + aj;
}
export function descreverPeriodo(o) {
  if (o.periodicidade === 'trimestral') return 'Trimestral (mar, jun, set, dez)';
  if (o.periodicidade === 'anual') return 'Anual, na competência de ' + ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][(+o.mes_ref || 12) - 1];
  return 'Mensal';
}

// Lista das tarefas que faltam criar numa competência
export function tarefasParaGerar(comp, clientes, obrigacoes, existentes) {
  const ja = new Set(existentes.map((t) => t.cliente_id + '|' + t.obrigacao_id));
  const out = [];
  for (const o of obrigacoes) {
    if (!o.ativo || !valeNaCompetencia(o, comp)) continue;
    const venc = vencimentoDe(o, comp);
    for (const c of clientes) {
      if (!c.ativo || !o.regimes.includes(c.regime) || (o.exige_funcionarios && !c.tem_funcionarios) || ja.has(c.id + '|' + o.id)) continue;
      out.push({ cliente_id: c.id, obrigacao_id: o.id, departamento: o.departamento, competencia: comp, titulo: o.nome, vencimento: venc, status: 'pendente', responsavel: c['resp_' + o.departamento] || null });
    }
  }
  return out;
}

// Obrigações sugeridas (CONFIRA os prazos do seu município/estado e mudanças na legislação)
const T = ['mei', 'simples', 'presumido', 'real'], SPR = ['simples', 'presumido', 'real'], PR = ['presumido', 'real'];
export const OBRIGACOES_PADRAO = [
  // departamento, nome, periodicidade, mes_ref, meses_depois, tipo_dia, dia, ajuste, regimes, exige_funcionarios, ordem
  ['fiscal', 'Captar notas de entrada e saída', 'mensal', null, 1, 'corrido', 5, 'nenhum', T, false, 10],
  ['fiscal', 'PGDAS-D e guia do DAS', 'mensal', null, 1, 'corrido', 20, 'prorroga', ['simples'], false, 20],
  ['fiscal', 'DAS-MEI', 'mensal', null, 1, 'corrido', 20, 'prorroga', ['mei'], false, 20],
  ['fiscal', 'Apuração de ISS', 'mensal', null, 1, 'corrido', 10, 'prorroga', PR, false, 30],
  ['fiscal', 'Apuração de ICMS', 'mensal', null, 1, 'corrido', 20, 'prorroga', PR, false, 40],
  ['fiscal', 'PIS e COFINS', 'mensal', null, 1, 'corrido', 25, 'antecipa', PR, false, 50],
  ['fiscal', 'EFD ICMS/IPI (SPED Fiscal)', 'mensal', null, 1, 'corrido', 20, 'nenhum', PR, false, 60],
  ['fiscal', 'EFD-Contribuições', 'mensal', null, 2, 'util', 10, 'nenhum', PR, false, 70],
  ['fiscal', 'IRPJ e CSLL trimestral', 'trimestral', null, 1, 'ultimo_util', 1, 'nenhum', PR, false, 80],
  ['fiscal', 'DEFIS (declaração anual do Simples)', 'anual', 2, 1, 'corrido', 31, 'antecipa', ['simples'], false, 90],
  ['fiscal', 'DASN-SIMEI (declaração anual do MEI)', 'anual', 4, 1, 'corrido', 31, 'antecipa', ['mei'], false, 95],
  ['dp', 'Receber ponto e variáveis', 'mensal', null, 1, 'util', 1, 'nenhum', T, true, 10],
  ['dp', 'Folha de pagamento e holerites', 'mensal', null, 1, 'util', 5, 'nenhum', T, true, 20],
  ['dp', 'Pró-labore', 'mensal', null, 1, 'util', 5, 'nenhum', SPR, false, 25],
  ['dp', 'eSocial (fechamento da folha)', 'mensal', null, 1, 'corrido', 15, 'antecipa', SPR, false, 30],
  ['dp', 'DCTFWeb', 'mensal', null, 1, 'ultimo_util', 1, 'nenhum', SPR, false, 35],
  ['dp', 'FGTS Digital', 'mensal', null, 1, 'corrido', 20, 'antecipa', T, true, 40],
  ['dp', 'DARF previdenciário (INSS/IRRF)', 'mensal', null, 1, 'corrido', 20, 'antecipa', SPR, false, 50],
  ['dp', '13º salário · 1ª parcela', 'anual', 11, 0, 'corrido', 30, 'antecipa', T, true, 60],
  ['dp', '13º salário · 2ª parcela', 'anual', 12, 0, 'corrido', 20, 'antecipa', T, true, 61],
  ['contabil', 'Receber extratos bancários', 'mensal', null, 1, 'corrido', 10, 'nenhum', SPR, false, 10],
  ['contabil', 'Conciliação bancária', 'mensal', null, 1, 'corrido', 20, 'nenhum', SPR, false, 20],
  ['contabil', 'Lançamentos contábeis', 'mensal', null, 1, 'corrido', 25, 'nenhum', SPR, false, 30],
  ['contabil', 'Balancete mensal', 'mensal', null, 1, 'corrido', 28, 'nenhum', PR, false, 40],
  ['contabil', 'ECD (escrituração contábil digital)', 'anual', 12, 6, 'ultimo_util', 1, 'nenhum', PR, false, 50],
  ['contabil', 'ECF (escrituração contábil fiscal)', 'anual', 12, 7, 'ultimo_util', 1, 'nenhum', PR, false, 60],
].map(([departamento, nome, periodicidade, mes_ref, meses_depois, tipo_dia, dia_vencimento, ajuste, regimes, exige_funcionarios, ordem]) =>
  ({ departamento, nome, periodicidade, mes_ref, meses_depois, tipo_dia, dia_vencimento, ajuste, regimes, exige_funcionarios, ordem, ativo: true }));
