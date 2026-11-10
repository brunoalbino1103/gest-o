// Ponto e horas extras: lê os cartões importados (Secullum) da empresa no mês e mostra ocorrências, dia a dia, cartão e fechamento.
import db from '../db.js';
import { esc, nomeComp, dataBR, baixarArquivo } from '../util.js';
import { S } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { analisar, hm, hmin, CLASSE, TIPO_OC, STATUS_RELOGIO } from '../ponto.js';
import { empresasDP, nomeEmp, escolhaEmpresa } from './dp-comum.js';

const ABAS = [['geral', 'Visão geral'], ['ocorrencias', 'Ocorrências'], ['diaadia', 'Dia a dia'], ['cartao', 'Cartão'], ['fechamento', 'Fechamento']];
let aba = 'geral', tipoOc = '', pessoa = '';
const ICO = { ok: ['✓', 'st-concluida'], atraso: ['!', 'st-andamento'], falta: ['×', 'st-atraso'], batida: ['?', 'st-atraso'], folga: ['', 'st-nao_aplica'], ferias: ['F', 'st-pendente'], atestado: ['A', 'st-pendente'], vazio: ['', ''] };
const h0 = (v) => (v ? hm(v) : '—');

export default async function ponto(el, _r, vivo) {
  if (!S.empresa) {
    const cards = (await db.listar('ponto_cartoes').catch(() => [])).filter((c) => c.competencia === S.comp); if (!vivo()) return;
    const emps = empresasDP().filter((c) => c.tem_funcionarios);
    topo('Ponto e horas extras', `${nomeComp(S.comp)} · escolha uma empresa`);
    el.innerHTML = `<div class="card"><div class="tw"><table class="t"><thead><tr><th>Empresa</th><th class="r">Cartões no mês</th><th class="r">Com ocorrência</th><th></th></tr></thead><tbody>
      ${emps.map((c) => { const l = cards.filter((x) => x.cliente_id === c.id); const irr = l.filter((x) => analisar(x).tot.irreg).length; return `<tr><td><b>${esc(nomeEmp(c))}</b></td><td class="r num">${l.length || '<span class="pill p-at">nenhum</span>'}</td><td class="r num">${l.length ? irr : ''}</td><td><button class="btn sec mini" data-escolhe="${c.id}">Abrir</button></td></tr>`; }).join('') || '<tr><td colspan="4"><div class="vazio">Nenhuma empresa com funcionários.</div></td></tr>'}
    </tbody></table></div></div>`;
    return;
  }
  const [cards0, funcs] = await Promise.all([db.listar('ponto_cartoes', { cliente_id: S.empresa }).catch(() => []), db.funcionarios({ cliente_id: S.empresa })]); if (!vivo()) return;
  const emp = S.clientes.find((c) => c.id === S.empresa);
  const cards = cards0.filter((c) => c.competencia === S.comp);
  const nomeF = (id) => funcs.find((f) => f.id === id)?.nome || '—';
  const P = cards.map((c) => ({ c, f: funcs.find((f) => f.id === c.funcionario_id), a: analisar(c) })).sort((x, y) => nomeF(x.c.funcionario_id).localeCompare(nomeF(y.c.funcionario_id), 'pt'));
  const per = cards[0] ? `${dataBR(cards[0].periodo_ini)} a ${dataBR(cards[0].periodo_fim)}` : '';
  topo('Ponto e horas extras', `${nomeEmp(emp)} · ${nomeComp(S.comp)}${per ? ' · período ' + per : ''}`);
  if (!P.length) {
    const outros = [...new Set(cards0.map((c) => c.competencia))].sort().reverse();
    el.innerHTML = `<div class="card"><div class="vazio"><b>Nenhum cartão de ponto de ${nomeComp(S.comp)}</b>Importe os cartões do relógio em <a href="#/pessoal/importar">Importar arquivos</a>.${outros.length ? `<br>Meses com cartão: ${outros.map((m) => nomeComp(m, true)).join(', ')}.` : ''}</div></div>`;
    return;
  }
  const T = P.reduce((s, { a }) => { Object.entries(a.tot).forEach(([k, v]) => { if (typeof v === 'number') s[k] = (s[k] || 0) + v; }); return s; }, {});
  const tabs = `<div class="seg" role="group" aria-label="Visão">${ABAS.map(([k, t]) => `<button data-sub="${k}" aria-pressed="${aba === k}">${t}</button>`).join('')}</div>`;
  let corpo = '';

  if (aba === 'geral') {
    const kpi = (cls, l, v, s, ir) => `<button class="kpi ${cls}" ${ir ? `data-ir="${ir}"` : ''}><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></button>`;
    corpo = `<div class="grid g4">
        ${kpi(T.atrasos ? 'at' : 'ok', 'Atrasos na entrada', T.atrasos || 0, T.atrasoMin ? 'somando ' + hmin(T.atrasoMin) : 'nenhum', 'atraso')}
        ${kpi(T.almocoCurto ? 'bad' : 'ok', 'Almoço / intervalo curto', T.almocoCurto || 0, T.almocoGrave ? `${T.almocoGrave} grave(s): 54 min ou menos` : 'abaixo do previsto', 'almoco')}
        ${kpi(T.faltas ? 'bad' : 'ok', 'Faltas', T.faltas || 0, T.faltasHoras ? hm(T.faltasHoras) + ' de faltas no relógio' : 'dias sem batida', 'falta')}
        ${kpi(T.batidas ? 'at' : 'ok', 'Batidas faltando', T.batidas || 0, 'dias para ajustar', 'batida')}
        ${kpi('', 'Saídas antecipadas', T.saidas || 0, T.saidaMin ? 'somando ' + hmin(T.saidaMin) : 'nenhuma', 'saida')}
        ${kpi('', 'Banco de horas no período', hm((T.bcred || 0) - (T.bdeb || 0)), `+${hm(T.bcred || 0)} crédito · −${hm(T.bdeb || 0)} débito`)}
        ${kpi('', 'Horas extras', hm((T.ex60 || 0) + (T.ex100 || 0)), `60%: ${hm(T.ex60 || 0)} · 100%: ${hm(T.ex100 || 0)}`)}
        ${kpi(T.manuais ? 'at' : '', 'Batidas lançadas à mão', T.manuais || 0, 'conferir justificativa', 'manual')}
      </div>
      <div class="card"><div class="card-h"><h2>Colaboradores</h2><span class="small muted">clique no nome para ver o cartão</span></div><div class="tw"><table class="t"><thead><tr><th>Colaborador</th><th>Situação</th><th class="r">Atrasos</th><th class="r">Almoço curto</th><th class="r">Saídas antec.</th><th class="r">Faltas</th><th class="r">Batidas faltando</th><th class="r">Banco no período</th><th class="r">Saldo do banco</th><th class="r">Extras</th></tr></thead><tbody>
        ${P.map(({ c, a }) => `<tr><td><button class="lk" data-pessoa="${c.funcionario_id}" style="border:0;background:none;padding:0;color:var(--co-dk);font-weight:600;text-align:left">${esc(nomeF(c.funcionario_id))}</button><div class="small muted">${esc(a.funcao || '')}</div>${a.tot.deslocamento ? `<div class="small" style="color:var(--at-ink)">entra ${a.tot.deslocamento > 0 ? 'depois' : 'antes'} do horário do relógio (${hm(Math.abs(a.tot.deslocamento))}): atualizar o cadastro no relógio</div>` : ''}</td>
          <td><span class="pill ${CLASSE[a.tot.classe][1]}">${CLASSE[a.tot.classe][0]}</span></td><td class="r num">${a.tot.atrasos ? `${a.tot.atrasos} <span class="small muted">(${hmin(a.tot.atrasoMin)})</span>` : ''}</td>
          <td class="r num">${a.tot.almocoCurto || ''}${a.tot.almocoGrave ? ' <span class="pill p-bad">grave</span>' : ''}</td><td class="r num">${a.tot.saidas || ''}</td><td class="r num">${a.tot.faltas || ''}</td><td class="r num">${a.tot.batidas || ''}</td>
          <td class="r num">${hm(a.tot.bcred - a.tot.bdeb)}</td><td class="r num">${a.tot.bsaldo ? hm(a.tot.bsaldo) : '—'}</td><td class="r num">${a.tot.ex60 + a.tot.ex100 ? hm(a.tot.ex60 + a.tot.ex100) : ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  if (aba === 'ocorrencias') {
    const L = P.flatMap(({ c, a }) => a.dias.flatMap((d) => d.oc.map((o) => ({ ...o, d, nome: nomeF(c.funcionario_id), pid: c.funcionario_id }))));
    const tipos = [...new Set(L.map((o) => (o.t === 'intervalo' ? 'almoco' : o.t)))];
    const F = L.filter((o) => !tipoOc || (tipoOc === 'almoco' ? /almoco|intervalo/.test(o.t) : o.t === tipoOc)).sort((x, y) => x.d.data.localeCompare(y.d.data) || x.nome.localeCompare(y.nome));
    corpo = `<div class="card"><div class="card-h"><div class="seg" role="group" aria-label="Tipo"><button data-tipo="" aria-pressed="${!tipoOc}">Todas (${L.length})</button>${tipos.map((t) => `<button data-tipo="${t}" aria-pressed="${tipoOc === t}">${TIPO_OC[t]} (${L.filter((o) => (t === 'almoco' ? /almoco|intervalo/.test(o.t) : o.t === t)).length})</button>`).join('')}</div></div>
      <div class="tw" style="max-height:65vh;overflow:auto"><table class="t"><thead><tr><th>Data</th><th>Colaborador</th><th>Tipo</th><th>O que aconteceu</th><th>Batidas do dia</th></tr></thead><tbody>
      ${F.map((o) => `<tr><td class="num">${dataBR(o.d.data)} <span class="small muted">${o.d.dia}</span></td><td><button class="lk" data-pessoa="${o.pid}" style="border:0;background:none;padding:0;color:var(--co-dk);font-weight:600">${esc(o.nome)}</button></td><td><span class="pill ${o.t === 'falta' || o.grave ? 'p-bad' : o.t === 'manual' || o.t === 'volta' ? 'p-co' : 'p-at'}">${TIPO_OC[o.t]}${o.grave ? ' · grave' : ''}</span></td><td>${esc(o.txt)}</td><td class="num small">${o.d.bat.join(' · ') || '—'}</td></tr>`).join('') || '<tr><td colspan="5"><div class="vazio">Nenhuma ocorrência.</div></td></tr>'}
      </tbody></table></div></div>`;
  }

  if (aba === 'diaadia') {
    const datas = [...new Set(P.flatMap(({ a }) => a.dias.map((d) => d.data)))].sort();
    const est = (d) => !d ? 'vazio' : d.ferias ? 'ferias' : d.atestado ? 'atestado' : d.folga ? 'folga' : d.oc.some((o) => o.t === 'falta') ? 'falta' : d.oc.some((o) => o.t === 'batida') ? 'batida' : d.oc.some((o) => /atraso|saida|almoco|intervalo/.test(o.t)) ? 'atraso' : 'ok';
    corpo = `<div class="card"><div class="card-b leg" style="font-size:12.5px">${[['ok', 'Normal'], ['atraso', 'Atraso, saída cedo ou almoço curto'], ['falta', 'Falta'], ['batida', 'Batida faltando'], ['folga', 'Folga / DSR'], ['ferias', 'Férias'], ['atestado', 'Atestado / abono']].map(([k, t]) => `<span><span class="st ${ICO[k][1]}" style="display:inline-grid;width:22px;height:20px;min-width:0;margin-right:5px">${ICO[k][0]}</span>${t}</span>`).join('')}</div>
      <div class="tw" style="max-height:70vh;overflow:auto"><table class="t mx"><thead><tr><th style="min-width:190px">Colaborador</th>${datas.map((d) => `<th class="ob" style="min-width:34px;text-align:center">${d.slice(8)}<br><span style="font-weight:400">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][new Date(d + 'T12:00:00').getDay()]}</span></th>`).join('')}</tr></thead><tbody>
      ${P.map(({ c, a }) => `<tr><td><button class="lk" data-pessoa="${c.funcionario_id}" style="border:0;background:none;padding:0;color:var(--co-dk);font-weight:600;text-align:left">${esc(nomeF(c.funcionario_id))}</button></td>${datas.map((dt) => { const d = a.dias.find((x) => x.data === dt); const e = est(d); return `<td class="cel"><span class="st ${ICO[e][1]}" style="display:grid;min-width:30px;height:28px" title="${dataBR(dt)}${d ? ': ' + (d.bat.join(' ') || d.st || 'sem batida') + (d.oc.length ? ' · ' + d.oc.map((o) => o.txt).join('; ') : '') : ''}">${ICO[e][0]}</span></td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
  }

  if (aba === 'cartao') {
    if (!P.some((x) => x.c.funcionario_id === pessoa)) pessoa = P[0].c.funcionario_id;
    const { a } = P.find((x) => x.c.funcionario_id === pessoa);
    corpo = `<div class="card"><div class="card-h"><label class="f" style="flex-direction:row;align-items:center;gap:8px">Colaborador <select id="pPessoa" style="width:auto">${P.map(({ c }) => `<option value="${c.funcionario_id}" ${c.funcionario_id === pessoa ? 'selected' : ''}>${esc(nomeF(c.funcionario_id))}</option>`).join('')}</select></label>
        <span class="pill ${CLASSE[a.tot.classe][1]}">${CLASSE[a.tot.classe][0]}</span>${a.tot.deslocamento ? `<span class="small" style="color:var(--at-ink)">Horário praticado ${a.tot.deslocamento > 0 ? '+' : '−'}${hm(Math.abs(a.tot.deslocamento))} em relação ao cadastrado no relógio: os atrasos são medidos pelo horário que a pessoa cumpre.</span>` : ''}</div>
      <div class="tw" style="max-height:68vh;overflow:auto"><table class="t"><thead><tr><th>Data</th><th>Previsto</th><th>Batidas</th><th class="r">Normais</th><th class="r">Banco</th><th class="r">Extras</th><th>Ocorrências</th></tr></thead><tbody>
      ${a.dias.map((d) => { const tarde = new Set(d.oc.filter((o) => o.t === 'atraso').map(() => d.bat[0])); const cedo = d.oc.some((o) => o.t === 'saida') ? d.bat[d.bat.length - 1] : null;
        return `<tr style="${d.folga && !d.bat.length ? 'background:#fafbfd' : ''}"><td class="num">${dataBR(d.data)} <span class="small muted">${d.dia}</span></td><td class="num small muted">${d.prev.join(' ') || 'folga'}</td>
        <td class="num">${d.bat.length ? d.bat.map((b) => `<span style="${tarde.has(b) || b === cedo ? 'color:var(--bad);font-weight:600' : ''}">${b}${d.manual?.includes(b) ? '*' : ''}</span>`).join(' · ') : `<span class="muted">${esc(STATUS_RELOGIO[d.st] || d.st || '—')}</span>`}</td>
        <td class="r num">${d.normais ? hm(d.normais) : ''}</td><td class="r num" style="color:${d.bcred ? 'var(--ok)' : d.bdeb ? 'var(--bad)' : ''}">${d.bcred ? '+' + hm(d.bcred) : d.bdeb ? '−' + hm(d.bdeb) : ''}</td><td class="r num">${d.ex60 + d.ex100 ? hm(d.ex60 + d.ex100) : ''}</td>
        <td class="small">${d.oc.map((o) => `<span class="pill ${o.t === 'falta' || o.grave ? 'p-bad' : o.t === 'manual' || o.t === 'volta' ? 'p-co' : 'p-at'}" style="margin:1px">${esc(o.txt)}</span>`).join('')}</td></tr>`; }).join('')}
      <tr><td colspan="3"><b>Totais do relógio</b></td><td class="r num"><b>${hm(a.tot.normais)}</b></td><td class="r num"><b>${hm(a.tot.bcred - a.tot.bdeb)}</b><div class="small muted">saldo ${a.tot.bsaldo ? hm(a.tot.bsaldo) : '—'}</div></td><td class="r num"><b>${hm(a.tot.ex60 + a.tot.ex100)}</b></td><td class="small muted">${a.tot.dsrdeb ? 'DSR descontado: ' + hm(a.tot.dsrdeb) : ''}</td></tr>
      </tbody></table></div><p class="small muted" style="padding:10px 18px">* batida lançada manualmente no relógio. Em vermelho: entrada atrasada ou saída antecipada (tolerância de 5 minutos).</p></div>`;
  }

  if (aba === 'fechamento') {
    corpo = `<div class="card"><div class="card-h"><div><h2>Fechamento do ponto · ${nomeComp(S.comp)}</h2><p class="small muted">Totais do relógio para lançar na folha.</p></div><button class="btn sec mini" id="pExp">Exportar (Excel)</button></div>
      <div class="tw"><table class="t"><thead><tr><th>Colaborador</th><th class="r">Normais</th><th class="r">Faltas (h)</th><th class="r">Atrasos</th><th class="r">Extra 60%</th><th class="r">Extra 100%</th><th class="r">Banco: crédito</th><th class="r">Banco: débito</th><th class="r">Banco: saldo</th><th class="r">DSR descontado</th></tr></thead><tbody>
      ${P.map(({ c, a }) => `<tr><td><b>${esc(nomeF(c.funcionario_id))}</b></td><td class="r num">${h0(a.tot.normais)}</td><td class="r num">${h0(a.tot.faltasHoras)}</td><td class="r num">${a.tot.atrasoMin ? hmin(a.tot.atrasoMin) : '—'}</td><td class="r num">${h0(a.tot.ex60)}</td><td class="r num">${h0(a.tot.ex100)}</td><td class="r num">${h0(a.tot.bcred)}</td><td class="r num">${h0(a.tot.bdeb)}</td><td class="r num"><b>${a.tot.bsaldo ? hm(a.tot.bsaldo) : '—'}</b></td><td class="r num">${h0(a.tot.dsrdeb)}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td class="r num"><b>${h0(T.normais)}</b></td><td class="r num"><b>${h0(T.faltasHoras)}</b></td><td class="r num"><b>${T.atrasoMin ? hmin(T.atrasoMin) : '—'}</b></td><td class="r num"><b>${h0(T.ex60)}</b></td><td class="r num"><b>${h0(T.ex100)}</b></td><td class="r num"><b>${h0(T.bcred)}</b></td><td class="r num"><b>${h0(T.bdeb)}</b></td><td></td><td class="r num"><b>${h0(T.dsrdeb)}</b></td></tr>
      </tbody></table></div></div>`;
  }

  el.innerHTML = `<div class="card"><div class="card-b" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${tabs}<span class="small muted" style="margin-left:auto">${P.length} cartão(ões) · tolerância de 5 min por marcação</span></div></div>${corpo}`;
  el.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.sub; recarregarTela(); }));
  el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => { tipoOc = b.dataset.tipo; recarregarTela(); }));
  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => { tipoOc = b.dataset.ir; aba = 'ocorrencias'; recarregarTela(); }));
  el.querySelectorAll('[data-pessoa]').forEach((b) => b.addEventListener('click', () => { pessoa = b.dataset.pessoa; aba = 'cartao'; recarregarTela(); }));
  el.querySelector('#pPessoa')?.addEventListener('change', (e) => { pessoa = e.target.value; recarregarTela(); });
  el.querySelector('#pExp')?.addEventListener('click', () => {
    const rows = [['Colaborador', 'Normais', 'Faltas (h)', 'Atrasos (min)', 'Extra 60%', 'Extra 100%', 'Banco crédito', 'Banco débito', 'Banco saldo', 'DSR descontado']].concat(P.map(({ c, a }) => [nomeF(c.funcionario_id), hm(a.tot.normais), hm(a.tot.faltasHoras), a.tot.atrasoMin, hm(a.tot.ex60), hm(a.tot.ex100), hm(a.tot.bcred), hm(a.tot.bdeb), a.tot.bsaldo ? hm(a.tot.bsaldo) : '', hm(a.tot.dsrdeb)]));
    baixarArquivo(`ponto_${nomeEmp(emp).replace(/\W+/g, '_')}_${S.comp}.csv`, '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  });
}
