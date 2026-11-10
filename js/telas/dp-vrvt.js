// VR/VT do mês: dias úteis menos férias e faltas, vezes o valor por dia do cadastro da empresa.
import db from '../db.js';
import { esc, brl, nomeComp, baixarArquivo } from '../util.js';
import { S } from '../estado.js';
import { topo } from '../app.js';
import { eDiaUtil } from '../regras.js';
import { nomeEmp, empresasDP } from './dp-comum.js';

const diasDoMes = (comp) => { const [y, m] = comp.split('-').map(Number); const n = new Date(y, m, 0).getDate(); return Array.from({ length: n }, (_, i) => `${comp}-${String(i + 1).padStart(2, '0')}`); };
const ajustes = {}; // ajuste manual por colaborador (só nesta tela)

export default async function vrvt(el, _r, vivo) {
  const [funcs, cfgs, marcs, faltas] = await Promise.all([db.funcionarios(), db.dpEmpresas(), db.feriasMarcacoes(), db.faltas()]); if (!vivo()) return;
  const cfg = new Map(cfgs.map((c) => [c.cliente_id, c]));
  const uteis = diasDoMes(S.comp).filter(eDiaUtil);
  const emps = empresasDP().filter((c) => (!S.empresa || c.id === S.empresa) && c.tem_funcionarios);
  topo('VR/VT', `${nomeComp(S.comp)} · ${uteis.length} dias úteis. Desconta férias e faltas do mês; os valores por dia vêm do cadastro da empresa (aba Empresas).`);
  const dia = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
  const linhas = [];
  emps.forEach((c) => {
    const d = cfg.get(c.id) || {};
    funcs.filter((f) => f.cliente_id === c.id && f.situacao === 'ativo' && !f.contribuinte && (!f.admissao || f.admissao <= uteis[uteis.length - 1])).forEach((f) => {
      const fer = new Set(); marcs.filter((m) => m.funcionario_id === f.id && !m.oculta && m.inicio).forEach((m) => { for (let i = 0; i < (+m.dias || 0); i++) fer.add(dia(m.inicio, i)); });
      const antes = f.admissao ? uteis.filter((u) => u < f.admissao).length : 0;
      const nFer = uteis.filter((u) => fer.has(u)).length;
      const nFal = faltas.filter((x) => x.funcionario_id === f.id && x.data.startsWith(S.comp)).reduce((s, x) => s + (+x.quantidade || 0), 0);
      const aj = +ajustes[f.id] || 0;
      const dias = Math.max(0, uteis.length - antes - nFer - nFal + aj);
      linhas.push({ c, f, d, antes, nFer, nFal, aj, dias, vr: dias * (+d.vr_dia || 0), vt: dias * (+d.vt_dia || 0) });
    });
  });
  const tot = linhas.reduce((t, l) => ({ vr: t.vr + l.vr, vt: t.vt + l.vt }), { vr: 0, vt: 0 });
  const semValor = emps.filter((c) => !(cfg.get(c.id)?.vr_dia || cfg.get(c.id)?.vt_dia));
  el.innerHTML = `${semValor.length ? `<div class="banner at"><span>${semValor.length} empresa(s) sem valor de VR/VT cadastrado: ${semValor.map((c) => esc(nomeEmp(c))).join(', ')}.</span><a class="btn sec mini" href="#/pessoal/empresas">Cadastrar valores</a></div>` : ''}
    <div class="grid g3"><div class="kpi"><span class="l">VR / VA do mês</span><span class="v">${brl(tot.vr)}</span><span class="s">${linhas.length} colaborador(es)</span></div><div class="kpi"><span class="l">VT do mês</span><span class="v">${brl(tot.vt)}</span><span class="s">antes do desconto de 6% em folha</span></div><div class="kpi"><span class="l">Dias úteis</span><span class="v">${uteis.length}</span><span class="s">seg. a sex., sem feriados</span></div></div>
    <div class="card"><div class="card-h"><h2>Por colaborador</h2><button class="btn sec mini" id="vExp">Exportar (Excel)</button></div>
    <div class="tw"><table class="t"><thead><tr><th>Colaborador</th>${S.empresa ? '' : '<th>Empresa</th>'}<th class="r">Dias úteis</th><th class="r">Férias</th><th class="r">Faltas</th><th class="r">Ajuste</th><th class="r">Dias a pagar</th><th class="r">VR / VA</th><th class="r">VT</th></tr></thead><tbody>
    ${linhas.map((l) => `<tr><td><b>${esc(l.f.nome)}</b>${l.antes ? `<div class="small muted">admitido em ${l.f.admissao.split('-').reverse().join('/')}</div>` : ''}</td>${S.empresa ? '' : `<td>${esc(nomeEmp(l.c))}</td>`}<td class="r num">${uteis.length - l.antes}</td><td class="r num">${l.nFer ? '−' + l.nFer : ''}</td><td class="r num">${l.nFal ? '−' + l.nFal : ''}</td>
      <td class="r"><input type="number" data-aj="${l.f.id}" value="${l.aj || ''}" placeholder="0" style="width:70px;min-height:30px;padding:3px 6px;text-align:right" aria-label="Ajuste de dias"></td><td class="r num"><b>${l.dias}</b></td><td class="r num">${brl(l.vr)}</td><td class="r num">${brl(l.vt)}</td></tr>`).join('') || '<tr><td colspan="9"><div class="vazio">Nenhum colaborador ativo.</div></td></tr>'}
    </tbody></table></div></div>`;
  el.querySelectorAll('[data-aj]').forEach((i) => i.addEventListener('change', () => { ajustes[i.dataset.aj] = +i.value || 0; vrvt(el, _r, vivo); }));
  el.querySelector('#vExp').addEventListener('click', () => {
    const rows = [['Empresa', 'Colaborador', 'Dias úteis', 'Férias', 'Faltas', 'Ajuste', 'Dias a pagar', 'VR/VA', 'VT']].concat(linhas.map((l) => [nomeEmp(l.c), l.f.nome, uteis.length - l.antes, l.nFer, l.nFal, l.aj, l.dias, l.vr.toFixed(2).replace('.', ','), l.vt.toFixed(2).replace('.', ',')]));
    baixarArquivo(`vr_vt_${S.comp}.csv`, '﻿' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  });
}
