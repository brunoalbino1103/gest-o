// Simulador do DP: rescisão, férias e custo de contratação (estimativas para orientar o cliente; o oficial é o Domínio).
import db from '../db.js';
import { esc, brl, dataBR, hojeISO } from '../util.js';
import { S } from '../estado.js';
import { topo } from '../app.js';
import { simularRescisao, simularFerias, custoContratacao, TIPOS_RESCISAO, AVISOS, tabelas } from '../calculos.js';
import { situacaoFerias, nomeEmp } from './dp-comum.js';

let aba = 'rescisao', pid = '';
export const simuladorPara = (id, qual = 'rescisao') => { pid = id; aba = qual; };

const tabela = (r) => `<table class="t"><tbody>${r.linhas.map((l) => `<tr><td>${esc(l.rotulo)}${l.nota ? `<div class="small muted">${esc(l.nota)}</div>` : ''}</td><td class="r num" style="color:${l.desconto ? 'var(--bad)' : ''}">${l.desconto ? '−' : ''}${brl(l.valor)}</td></tr>`).join('')}
  ${r.bruto != null ? `<tr><td><b>Total bruto</b></td><td class="r num"><b>${brl(r.bruto)}</b></td></tr><tr><td><b>Descontos</b></td><td class="r num" style="color:var(--bad)"><b>−${brl(r.descontos)}</b></td></tr><tr style="background:var(--co-soft)"><td><b>Líquido estimado</b></td><td class="r num"><b>${brl(r.liquido)}</b></td></tr>` : ''}</tbody></table>`;

export default async function simulador(el, _r, vivo) {
  const funcs = (await db.funcionarios()).filter((f) => f.situacao !== 'desligado' && !f.contribuinte && (!S.empresa || f.cliente_id === S.empresa)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  const marcs = await db.feriasMarcacoes(); if (!vivo()) return;
  const f = funcs.find((x) => x.id === pid) || null;
  const emp = f ? S.clientes.find((c) => c.id === f.cliente_id) : S.clientes.find((c) => c.id === S.empresa);
  topo('Simulador', `Estimativas para orientar o cliente · tabelas de ${tabelas().ano} (editáveis em Configurações). O cálculo oficial é o do Domínio.`);
  // férias vencidas: pela Programação de Férias importada do Domínio; se não houver, pelo cálculo da admissão
  const imps = f ? await db.listar('ferias_periodos', { funcionario_id: f.id }).catch(() => []) : [];
  const base = imps.reduce((m, p) => (p.data_base > m ? p.data_base : m), '');
  const hoje = hojeISO();
  const vencidas = !f ? 0 : imps.length ? imps.filter((p) => (!base || p.data_base === base) && p.fim && p.fim < hoje).reduce((s, p) => s + (+p.dias_restantes || 0), 0)
    : situacaoFerias(f, marcs).abertos.reduce((s, p) => s + p.saldo, 0);
  const seg = `<div class="seg" role="group">${[['rescisao', 'Rescisão'], ['ferias', 'Férias'], ['custo', 'Custo de contratação']].map(([k, t]) => `<button data-sub="${k}" aria-pressed="${aba === k}">${t}</button>`).join('')}</div>`;
  const selF = `<label class="f">Colaborador (preenche os dados)<select id="sF"><option value="">— digitar manualmente —</option>${funcs.map((x) => `<option value="${x.id}" ${x.id === pid ? 'selected' : ''}>${esc(x.nome)}${S.empresa ? '' : ' · ' + esc(nomeEmp(S.clientes.find((c) => c.id === x.cliente_id)))}</option>`).join('')}</select></label>`;
  const dep = f ? (f.dependentes || []).filter((x) => x.ir).length : 0;
  let form = '';
  if (aba === 'rescisao') form = `${selF}
    <label class="f">Salário (R$)<input type="number" step="0.01" name="salario" value="${f?.salario || ''}" required></label>
    <label class="f">Médias de variáveis (R$)<input type="number" step="0.01" name="medias" value="0" title="média de horas extras, comissões etc."></label>
    <label class="f">Admissão<input type="date" name="admissao" value="${f?.admissao || ''}" required></label>
    <label class="f">Último dia trabalhado<input type="date" name="desligamento" value="${hojeISO()}" required></label>
    <label class="f full">Tipo de rescisão<select name="tipo">${Object.entries(TIPOS_RESCISAO).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
    <label class="f">Aviso prévio<select name="aviso">${Object.entries(AVISOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
    <label class="f">Dias de férias vencidas<input type="number" name="feriasVencidasDias" value="${vencidas}"></label>
    <label class="f">Saldo do FGTS (se souber)<input type="number" step="0.01" name="saldoFgts" placeholder="em branco = estimado"></label>
    <label class="f">Fim da experiência (se houver)<input type="date" name="fimExperiencia" value="${f?.exp_dias_total && f?.admissao ? (() => { const x = new Date(f.admissao + 'T12:00:00'); x.setDate(x.getDate() + f.exp_dias_total - 1); return x.toLocaleDateString('sv-SE'); })() : ''}"></label>
    <label class="f">Dependentes para IR<input type="number" name="dependentes" value="${dep}"></label>`;
  if (aba === 'ferias') form = `${selF}
    <label class="f">Salário (R$)<input type="number" step="0.01" name="salario" value="${f?.salario || ''}" required></label>
    <label class="f">Médias de variáveis (R$)<input type="number" step="0.01" name="medias" value="0"></label>
    <label class="f">Início das férias<input type="date" name="inicio"></label>
    <label class="f">Dias de férias<select name="dias">${[30, 20, 15, 14, 10, 5].map((x) => `<option>${x}</option>`).join('')}</select></label>
    <label class="f">Dias vendidos (abono)<select name="abono"><option value="0">Nenhum</option><option value="10">10 dias</option></select></label>
    <label class="chk" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="adiantar13"> Adiantar a 1ª parcela do 13º</label>
    <label class="f">Dependentes para IR<input type="number" name="dependentes" value="${dep}"></label>`;
  if (aba === 'custo') form = `<label class="f">Salário (R$)<input type="number" step="0.01" name="salario" value="${f?.salario || ''}" required></label>
    <label class="f">Regime da empresa<select name="regime"><option value="simples" ${emp?.regime === 'simples' || emp?.regime === 'mei' ? 'selected' : ''}>Simples Nacional</option><option value="outro" ${emp && !['simples', 'mei'].includes(emp.regime) ? 'selected' : ''}>Presumido / Real</option></select></label>
    <label class="chk" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="anexoIV"> Simples no Anexo IV (paga INSS patronal)</label>
    <label class="f">VT por dia (R$)<input type="number" step="0.01" name="vtDia" value="0"></label>
    <label class="f">VR/VA por dia (R$)<input type="number" step="0.01" name="vrDia" value="0"></label>
    <label class="f">Dias trabalhados no mês<input type="number" name="diasMes" value="22"></label>
    <label class="f">Outros benefícios por mês (R$)<input type="number" step="0.01" name="outros" value="0"></label>`;
  el.innerHTML = `<div class="card"><div class="card-b" style="display:flex;gap:10px;align-items:center">${seg}</div></div>
    <div class="lado-a-lado"><div class="grow card"><div class="card-b"><form class="form" id="sim">${form}<div class="acoes full" style="margin-top:4px"><button class="btn">Calcular</button></div></form></div></div>
    <div class="aside card"><div class="card-h"><h2>Resultado</h2><button class="btn sec mini" id="sImp" hidden>Imprimir</button></div><div id="sRes"><div class="vazio">Preencha e clique em Calcular.</div></div></div></div>`;
  el.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.sub; simulador(el, _r, vivo); }));
  el.querySelector('#sF')?.addEventListener('change', (e) => { pid = e.target.value; simulador(el, _r, vivo); });
  const fm = el.querySelector('#sim');
  const calcular = () => {
    const x = Object.fromEntries(new FormData(fm)); ['salario', 'medias', 'feriasVencidasDias', 'dependentes', 'dias', 'abono', 'vtDia', 'vrDia', 'diasMes', 'outros'].forEach((k) => { if (k in x) x[k] = +x[k] || 0; });
    x.adiantar13 = !!fm.adiantar13?.checked; x.anexoIV = !!fm.anexoIV?.checked; if (x.saldoFgts === '') x.saldoFgts = null;
    let html = '';
    if (aba === 'rescisao') { const r = simularRescisao(x); html = `${tabela(r)}<div class="card-b small" style="display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--line)">
        <span><b>Pagar até:</b> ${dataBR(r.prazoPagamento)} (10 dias após o término)</span><span><b>Aviso prévio:</b> ${r.diasAviso} dias · projeção até ${dataBR(r.projecao)}</span>
        <span><b>FGTS:</b> saldo ${x.saldoFgts != null ? '' : 'estimado '}${brl(r.fgtsEstimado)}${r.percMulta ? ` · multa de ${r.percMulta}% = <b>${brl(r.multaFgts)}</b> (paga pela empresa na guia rescisória)` : ''} · FGTS do mês da rescisão ≈ ${brl(r.fgtsRescisorio)}</span>
        <span>${r.saque} · ${r.seguro}</span></div>`; }
    if (aba === 'ferias') { const r = simularFerias(x); html = `${tabela(r)}${x.inicio ? `<div class="card-b small" style="display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--line)"><span><b>Aviso de férias até:</b> ${dataBR(r.avisoAte)} (30 dias antes)</span><span><b>Pagar até:</b> ${dataBR(r.pagamentoAte)} (2 dias antes)</span><span><b>Férias:</b> ${dataBR(x.inicio)} a ${dataBR(r.fim)} · <b>volta</b> ${dataBR(r.retorno)}</span></div>` : ''}`; }
    if (aba === 'custo') { const r = custoContratacao(x); html = `<table class="t"><tbody>${r.linhas.map((l) => `<tr><td>${esc(l.rotulo)}</td><td class="r num">${brl(l.valor)}</td></tr>`).join('')}<tr style="background:var(--co-soft)"><td><b>Custo mensal</b></td><td class="r num"><b>${brl(r.mensal)}</b></td></tr><tr><td>Custo anual</td><td class="r num">${brl(r.anual)}</td></tr></tbody></table><div class="card-b small muted">Cada R$ 1,00 de salário custa cerca de <b>R$ ${String(r.multiplicador).replace('.', ',')}</b> para a empresa.</div>`; }
    el.querySelector('#sRes').innerHTML = html + '<p class="small muted" style="padding:10px 18px">Estimativa. Confira sempre com o cálculo do Domínio.</p>';
    el.querySelector('#sImp').hidden = false;
  };
  fm.addEventListener('submit', (e) => { e.preventDefault(); calcular(); });
  if (fm.salario?.value) calcular();
  el.querySelector('#sImp').addEventListener('click', () => {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Simulação</title><style>body{font:14px Arial,sans-serif;margin:32px;color:#111}table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid #ddd}.r{text-align:right}h1{font-size:18px}.small{font-size:12px;color:#555}</style></head><body><h1>Simulação · ${{ rescisao: 'Rescisão', ferias: 'Férias', custo: 'Custo de contratação' }[aba]}</h1><p>${esc(f?.nome || '')}${emp ? ' · ' + esc(emp.razao_social) : ''} · ${dataBR(hojeISO())}</p>${el.querySelector('#sRes').innerHTML.replace(/class="t"/g, '')}</body></html>`);
    w.document.close(); w.print();
  });
}
