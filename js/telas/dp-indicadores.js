// Indicadores do DP e provisões: custo da folha mês a mês, quadro de pessoal, rotatividade,
// horas extras, faltas e afastamentos, e a provisão de férias e 13º de cada colaborador.
import { ico } from '../icones.js';
import db from '../db.js';
import { esc, brl, nomeComp, somaMes, dataBR, hojeISO } from '../util.js';
import { S } from '../estado.js';
import { topo } from '../app.js';
import { situacaoFerias, nomeEmp, escolhaEmpresa, empresasDP } from './dp-comum.js';

const RE_HE = /HORA.{0,6}EXTRA|H\.\s?EXTRA|\bH\.?E\.?\s?\d|EXTRAS?\s\d{2,3}%/i;
const RE_AFAST = /AFAST|MATERNIDADE|DOENCA|ACIDENTE|AUXILIO/i;
const PATRONAL = 0.278; // 20% INSS + RAT 2% (médio) + terceiros 5,8% (empresas fora do Simples / Anexo IV)
const horas = (s) => { if (!s) return 0; const m = String(s).match(/(\d+):(\d{2})/); return m ? +m[1] + +m[2] / 60 : 0; };
const num = (s) => +String(s || '0').replace(/\./g, '').replace(',', '.') || 0;
const pct = (v) => (v * 100).toFixed(1).replace('.', ',') + '%';
const fimMes = (c) => { const [y, m] = c.split('-').map(Number); return `${c}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
// avos: meses com 15 dias ou mais trabalhados entre ini e fim
function avos(ini, fim) {
  if (!ini || ini > fim) return 0; let n = 0, c = ini.slice(0, 7);
  while (c <= fim.slice(0, 7)) { const a = c + '-01' < ini ? ini : c + '-01', b = fimMes(c) > fim ? fim : fimMes(c); if ((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5 + 1 >= 15) n++; c = somaMes(c, 1); }
  return n;
}
const aniversarioAntes = (adm, ref) => { let y = +ref.slice(0, 4); let d = y + adm.slice(4); if (d > ref) d = (y - 1) + adm.slice(4); return d < adm ? adm : d; };

export default async function indicadores(el, _r, vivo) {
  const emp = S.clientes.find((c) => c.id === S.empresa);
  topo('Indicadores e provisões', emp ? nomeEmp(emp) + ' · com base nas folhas e cartões de ponto importados' : 'Escolha uma empresa');
  if (!emp) { el.innerHTML = escolhaEmpresa('Escolha a empresa', empresasDP().filter((c) => c.tem_funcionarios), 'pessoal/indicadores'); return; }
  const cid = emp.id;
  const [res, itens, cartoes, funcs, marcs, fper] = await Promise.all([db.listar('folha_resumos', { cliente_id: cid }).catch(() => []), db.listar('folha_itens', { cliente_id: cid }).catch(() => []), db.listar('ponto_cartoes', { cliente_id: cid }).catch(() => []), db.funcionarios({ cliente_id: cid }), db.feriasMarcacoes(), db.listar('ferias_periodos', { cliente_id: cid }).catch(() => [])]);
  if (!vivo()) return;
  const patronal = emp.regime === 'simples' || emp.regime === 'mei' ? 0 : PATRONAL;

  // ---- mês a mês (últimos 12 até a competência escolhida) ----
  const meses = []; for (let i = 11; i >= 0; i--) meses.push(somaMes(S.comp, -i));
  if (S.todos) { const prim = [...res, ...itens].reduce((m, r) => (r.competencia < m ? r.competencia : m), meses[0]); while (meses[0] > prim) meses.unshift(somaMes(meses[0], -1)); }
  const contrib = new Set(funcs.filter((f) => f.contribuinte).map((f) => f.id));
  const linhas = meses.map((c) => {
    const r0 = res.find((x) => x.competencia === c);
    const its = itens.filter((x) => x.competencia === c);
    if (!r0 && !its.length) return { c };
    // sem Resumo da folha (ou resumo incompleto): soma o Extrato mensal / holerites de cada pessoa
    const ev = its.flatMap((i) => i.eventos || []);
    const deItens = { proventos: its.reduce((s, i) => s + (+i.proventos || 0), 0), fgts: its.reduce((s, i) => s + (+i.fgts || 0), 0), empregados: its.filter((i) => !contrib.has(i.funcionario_id)).length,
      admissoes: funcs.filter((f) => f.admissao?.startsWith(c)).length, demitidos: funcs.filter((f) => f.desligamento?.startsWith(c)).length };
    const r = { ...deItens, ...Object.fromEntries(Object.entries(r0 || {}).filter(([, v]) => v !== null && v !== 0 && v !== '')) };
    const rub = r0?.rubricas?.length ? r0.rubricas : ev.filter((x) => x.tipo !== 'D');
    const he = rub.filter((x) => RE_HE.test(x.descricao)).reduce((s, x) => s + (+x.valor || 0), 0);
    const afast = rub.filter((x) => RE_AFAST.test(x.descricao)).reduce((s, x) => s + num(x.referencia), 0);
    const enc = (+r.proventos || 0) * patronal;
    return { c, r, fonte: r0 ? 'resumo' : 'extrato', emp: +r.empregados || 0, adm: +r.admissoes || 0, dem: +r.demitidos || 0, prov: +r.proventos || 0, fgts: +r.fgts || 0, enc, custo: (+r.proventos || 0) + (+r.fgts || 0) + enc, he, afast };
  });
  const comDados = linhas.filter((l) => l.r);
  const atual = linhas[linhas.length - 1];
  const mediaEmp = comDados.length ? comDados.reduce((s, l) => s + l.emp, 0) / comDados.length : 0;
  const turnover = mediaEmp ? comDados.reduce((s, l) => s + (l.adm + l.dem) / 2, 0) / mediaEmp : 0;

  // ---- ponto da competência: faltas e horas extras em horas ----
  const cart = cartoes.filter((c) => c.competencia === S.comp);
  let hNorm = 0, hFalta = 0, hEx = 0, bCred = 0, bDeb = 0;
  cart.forEach((c) => (c.dias?.dias || c.dias || []).forEach?.((d) => { hNorm += horas(d.normais); hFalta += horas(d.faltas); hEx += horas(d.ex60) + horas(d.ex100); bCred += horas(d.bcred); bDeb += horas(d.bdeb); }));
  const absent = hNorm + hFalta ? hFalta / (hNorm + hFalta) : null;

  // ---- provisões na data de fim da competência ----
  const ref = fimMes(S.comp) < hojeISO() ? fimMes(S.comp) : hojeISO();
  const ativos = funcs.filter((f) => f.situacao !== 'desligado' && !f.contribuinte && f.admissao && f.admissao <= ref);
  const prov = ativos.map((f) => {
    const sal = +f.salario || +(itens.filter((i) => i.funcionario_id === f.id).sort((a, b) => b.competencia.localeCompare(a.competencia))[0]?.salario) || 0;
    const a13 = avos(f.admissao > ref.slice(0, 4) + '-01-01' ? f.admissao : ref.slice(0, 4) + '-01-01', ref);
    const imps = fper.filter((p) => p.funcionario_id === f.id); const base = imps.reduce((m, p) => (p.data_base > m ? p.data_base : m), '');
    const venc = imps.length ? imps.filter((p) => (!base || p.data_base === base) && p.fim && p.fim < ref).reduce((s, p) => s + (+p.dias_restantes || 0), 0) : situacaoFerias(f, marcs).abertos.reduce((s, p) => s + p.saldo, 0);
    const aP = avos(aniversarioAntes(f.admissao, ref), ref) % 12;
    const diasFer = venc + aP * 2.5;
    const v13 = sal / 12 * a13, vFer = sal / 30 * diasFer * 4 / 3;
    const encargos = (v13 + vFer) * (0.08 + patronal);
    return { f, sal, a13, venc, aP, diasFer, v13, vFer, encargos, total: v13 + vFer + encargos };
  }).sort((a, b) => a.f.nome.localeCompare(b.f.nome, 'pt'));
  const tot = (k) => prov.reduce((s, p) => s + p[k], 0);

  const kpi = (cls, l, v, s) => `<div class="kpi ${cls}"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  const max = Math.max(1, ...comDados.map((l) => l.custo));
  const grafico = `<div class="ind-graf" role="img" aria-label="Custo da folha por mês">${linhas.map((l) => `<div class="ind-col" title="${nomeComp(l.c, true)}: ${l.r ? brl(l.custo) : 'sem folha importada'}"><div class="ind-bar ${l.c === S.comp ? 'on' : ''}" style="height:${l.r ? Math.max(2, l.custo / max * 100) : 0}%"></div><span>${nomeComp(l.c, true).slice(0, 3)}</span></div>`).join('')}</div>`;

  el.innerHTML = `<style>.ind-graf{display:flex;align-items:flex-end;gap:2px;height:180px;padding:12px 18px 0}.ind-col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px;cursor:default}.ind-col span{font-size:11px;color:var(--muted)}.ind-bar{width:min(28px,70%);background:color-mix(in srgb,var(--c, #7A4FD6) 45%,transparent);border-radius:4px 4px 0 0}.ind-bar.on{background:var(--c, #7A4FD6)}.ind-col:hover .ind-bar{outline:2px solid var(--c, #7A4FD6)}</style>
    <div class="grid g4">${kpi('', 'Custo da folha', atual.r ? brl(atual.custo) : '—', atual.r ? `${nomeComp(S.comp, true)} · salários + FGTS${patronal ? ' + INSS patronal' : ''}` : 'folha do mês não importada')}
      ${kpi('', 'Colaboradores', atual.r ? atual.emp : ativos.length, atual.r ? `${atual.adm} admissão(ões) · ${atual.dem} desligamento(s)` : 'ativos no cadastro')}
      ${kpi(turnover > 0.05 ? 'at' : 'ok', 'Rotatividade (12 meses)', comDados.length ? pct(turnover) : '—', 'média de (admissões + desligamentos) ÷ 2 por pessoa')}
      ${kpi(absent != null && absent > 0.03 ? 'at' : 'ok', 'Faltas no ponto', absent != null ? pct(absent) : '—', absent != null ? `${hFalta.toFixed(1).replace('.', ',')} h de falta · ${hEx.toFixed(1).replace('.', ',')} h extras${bCred || bDeb ? ` · banco +${bCred.toFixed(1).replace('.', ',')} h / −${bDeb.toFixed(1).replace('.', ',')} h` : ''}` : 'cartões do mês não importados')}</div>
    <div class="card"><div class="card-h"><h2>Custo da folha por mês${S.todos ? ' · todo o histórico' : ' · últimos 12 meses'}</h2><span class="small muted">passe o mouse nas barras</span></div>${comDados.length ? grafico : ''}
      <div class="tw"><table class="t"><thead><tr><th>Mês</th><th class="r">Pessoas</th><th class="r">Adm.</th><th class="r">Desl.</th><th class="r">Salários e proventos</th><th class="r">FGTS</th>${patronal ? '<th class="r">INSS patronal (estim.)</th>' : ''}<th class="r">Custo total</th><th class="r">Horas extras (R$)</th><th class="r">Dias afastados</th></tr></thead><tbody>
      ${linhas.slice().reverse().map((l) => l.r ? `<tr ${l.c === S.comp ? 'style="background:var(--ct)"' : ''}><td>${nomeComp(l.c, true)}${l.fonte === 'extrato' ? '<div class="small muted">pelo extrato mensal</div>' : ''}</td><td class="r">${l.emp}</td><td class="r">${l.adm}</td><td class="r">${l.dem}</td><td class="r num">${brl(l.prov)}</td><td class="r num">${brl(l.fgts)}</td>${patronal ? `<td class="r num">${brl(l.enc)}</td>` : ''}<td class="r num"><b>${brl(l.custo)}</b></td><td class="r num">${l.he ? brl(l.he) : '—'}</td><td class="r">${l.afast || '—'}</td></tr>` : `<tr><td>${nomeComp(l.c, true)}</td><td colspan="${patronal ? 9 : 8}" class="small muted">sem folha importada</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card"><div class="card-h"><h2>Provisão de férias e 13º em ${dataBR(ref)}</h2><button class="btn sec mini" id="pCsv">${ico('baixar')}Planilha (CSV)</button></div>
      <div class="tw"><table class="t"><thead><tr><th>Colaborador</th><th class="r">Salário</th><th class="r">13º (avos)</th><th class="r">Provisão 13º</th><th class="r">Férias (dias)</th><th class="r">Provisão férias + 1/3</th><th class="r">FGTS${patronal ? ' + INSS' : ''}</th><th class="r">Total</th></tr></thead><tbody>
      ${prov.map((p) => `<tr><td><a href="#/pessoal/colaborador/${p.f.id}">${esc(p.f.nome)}</a><div class="small muted">admissão ${dataBR(p.f.admissao)}</div></td><td class="r num">${brl(p.sal)}</td><td class="r">${p.a13}/12</td><td class="r num">${brl(p.v13)}</td><td class="r" title="${p.venc} vencidos + ${p.aP}/12 proporcionais">${String(p.diasFer).replace('.', ',')}</td><td class="r num">${brl(p.vFer)}</td><td class="r num">${brl(p.encargos)}</td><td class="r num"><b>${brl(p.total)}</b></td></tr>`).join('') || '<tr><td colspan="8"><div class="vazio">Nenhum colaborador ativo com admissão.</div></td></tr>'}
      ${prov.length ? `<tr style="background:var(--ct)"><td><b>Total</b></td><td></td><td></td><td class="r num"><b>${brl(tot('v13'))}</b></td><td></td><td class="r num"><b>${brl(tot('vFer'))}</b></td><td class="r num"><b>${brl(tot('encargos'))}</b></td><td class="r num"><b>${brl(tot('total'))}</b></td></tr>` : ''}
      </tbody></table></div><p class="small muted" style="padding:10px 18px">Estimativa para o cliente e para a contabilidade: 13º = salário ÷ 12 × avos do ano; férias = salário ÷ 30 × dias (vencidos + 2,5 por mês do período atual) + 1/3; encargos = FGTS 8%${patronal ? ' + INSS patronal 27,8%' : ' (Simples: sem INSS patronal)'}. Não desconta parcelas já pagas.</p></div>`;

  el.querySelector('#pCsv').addEventListener('click', () => {
    const f2 = (v) => v.toFixed(2).replace('.', ',');
    const csv = ['Colaborador;Admissão;Salário;Avos 13º;Provisão 13º;Dias de férias;Provisão férias + 1/3;Encargos;Total', ...prov.map((p) => [p.f.nome, dataBR(p.f.admissao), f2(p.sal), p.a13, f2(p.v13), String(p.diasFer).replace('.', ','), f2(p.vFer), f2(p.encargos), f2(p.total)].join(';'))].join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `provisoes-${S.comp}.csv`; a.click();
  });
}
