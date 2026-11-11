// Tela de um departamento: matriz clientes x obrigações da competência.
import db from '../db.js';
import { esc, DEPS, REGIMES, nomeComp, atrasada, diasAte, semAcento, iniciais, brl, num, dataBR, aviso, confirmar, baixarArquivo, STATUS, TIPOS_DOC } from '../util.js';
import { S, tarefasDa, ativos, nomeCliente, nomePerfil, trocarTarefaNoCache, daEmpresa } from '../estado.js';
import { topo, irPara, recarregarTela, atualizarContadores } from '../app.js';
import { bannerGerar, abrirTarefa, prazoTxt, rotStatus, clsStatus } from './comum.js';

const F = {}; // filtros por departamento: { busca, sit, resp, regime, vista }
const ICS = { concluida: '✓', andamento: '◐', pendente: '○', nao_aplica: '–' };

export default async function departamento(el, _r, vivo, ctx = {}) {
  const dep = ctx.dep; const area = ctx.area;
  if (!DEPS[dep]) return irPara('#/');
  const f = F[dep] ||= { busca: '', sit: 'todos', resp: '', regime: '', vista: 'matriz' };
  topo(dep === 'dp' ? 'Obrigações do mês' : 'Visão geral', `Tarefas de ${nomeComp(S.comp)}${S.empresa ? '' : ' · todas as empresas'}`);
  const [todas, docs0, notas] = await Promise.all([tarefasDa(S.comp), db.documentos({ competencia: S.comp, departamento: dep }), dep === 'fiscal' ? db.notas({ competencia: S.comp }) : []]);
  if (!vivo()) return;
  const T = todas.filter((t) => t.departamento === dep && daEmpresa(t.cliente_id));
  const cli = ativos().filter((c) => daEmpresa(c.id));

  // colunas = obrigações que existem nas tarefas do mês (na ordem cadastrada)
  const ordem = new Map(S.obrigacoes.map((o, i) => [o.id, o.ordem * 1000 + i]));
  const cols = []; const vistos = new Set();
  T.slice().sort((a, b) => (ordem.get(a.obrigacao_id) ?? 1e9) - (ordem.get(b.obrigacao_id) ?? 1e9)).forEach((t) => { const k = t.obrigacao_id || t.titulo; if (!vistos.has(k)) { vistos.add(k); cols.push({ k, nome: t.titulo }); } });
  const chave = (t) => t.obrigacao_id || t.titulo;
  const porCli = new Map(); T.forEach((t) => { let m = porCli.get(t.cliente_id); if (!m) porCli.set(t.cliente_id, (m = new Map())); m.set(chave(t), t); });

  el.innerHTML = `${bannerGerar(todas, recarregarTela)}
   <div class="grid g4" id="dKpis"></div>
   <div class="card">
    <div class="card-h"><h2>Tarefas de ${nomeComp(S.comp)}</h2>
     <div class="barra-f">
      <label class="sr" for="dBusca">Buscar</label><input type="search" id="dBusca" placeholder="Buscar cliente ou CNPJ" value="${esc(f.busca)}">
      <div class="seg" role="group" aria-label="Situação">${[['todos', 'Todos'], ['aberto', 'Pendentes'], ['atraso', 'Atrasados']].map(([k, t]) => `<button data-sit="${k}" aria-pressed="${f.sit === k}">${t}</button>`).join('')}</div>
      <label class="sr" for="dResp">Responsável</label><select id="dResp"><option value="">Todos os responsáveis</option>${S.perfis.filter((p) => p.ativo).map((p) => `<option value="${p.id}" ${f.resp === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      <label class="sr" for="dReg">Regime</label><select id="dReg"><option value="">Todos os regimes</option>${Object.entries(REGIMES).map(([k, v]) => `<option value="${k}" ${f.regime === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Visualização">${[['matriz', 'Por cliente'], ['lista', 'Por prazo']].map(([k, t]) => `<button data-vista="${k}" aria-pressed="${f.vista === k}">${t}</button>`).join('')}</div>
      <button class="btn sec mini" id="dExp">Exportar</button>
     </div></div>
    <div class="leg" style="padding:10px 18px 0">${Object.entries(ICS).map(([k, i]) => `<span><span class="st st-${k}" style="display:inline-grid;width:26px;height:22px;min-width:0;margin-right:5px">${i}</span>${STATUS[k]}</span>`).join('')}<span><span class="st st-atraso" style="display:inline-grid;width:26px;height:22px;min-width:0;margin-right:5px">!</span>Atrasada</span><span class="muted">Clique numa célula para mudar a situação.</span></div>
    <div class="tw" style="max-height:70vh;overflow:auto;margin-top:8px" id="dCorpo"></div>
   </div>
   ${dep === 'fiscal' ? '<div class="card" id="dNotas"></div>' : ''}
   ${dep === 'dp' ? '' : '<div class="card" id="dDocs"></div>'}`;
  const $c = (s) => el.querySelector(s);

  const filtrados = () => {
    const q = semAcento(f.busca), qd = f.busca.replace(/\D/g, '');
    return cli.filter((c) => {
      const m = porCli.get(c.id); if (!m) return false;
      const l = [...m.values()];
      if (f.sit === 'atraso' && !l.some(atrasada)) return false;
      if (f.sit === 'aberto' && !l.some((t) => t.status === 'pendente' || t.status === 'andamento')) return false;
      if (f.resp && !l.some((t) => t.responsavel === f.resp)) return false;
      if (f.regime && c.regime !== f.regime) return false;
      if (q && !semAcento(c.razao_social + ' ' + (c.nome_fantasia || '')).includes(q) && !(qd && (c.cnpj || '').includes(qd))) return false;
      return true;
    });
  };
  const kpis = () => {
    const v = T.filter((t) => t.status !== 'nao_aplica'); const ok = v.filter((t) => t.status === 'concluida').length; const at = v.filter(atrasada);
    const sem = v.filter((t) => !atrasada(t) && t.status !== 'concluida' && t.vencimento && diasAte(t.vencimento) <= 7).length;
    const p = v.length ? Math.round(ok / v.length * 100) : 0;
    const pend = new Set(v.filter((t) => t.status !== 'concluida').map((t) => t.cliente_id)).size;
    $c('#dKpis').innerHTML = `<div class="kpi ${p >= 80 ? 'ok' : p >= 50 ? 'at' : 'bad'}"><span class="l">Concluído</span><span class="v">${p}%</span><span class="s">${ok} de ${v.length} tarefas</span></div>
      <button class="kpi ${at.length ? 'bad' : 'ok'}" data-sit2="atraso"><span class="l">Atrasadas</span><span class="v">${at.length}</span><span class="s">clique para ver só elas</span></button>
      <div class="kpi ${sem ? 'at' : ''}"><span class="l">Vencem em 7 dias</span><span class="v">${sem}</span><span class="s">ainda não concluídas</span></div>
      <button class="kpi" data-sit2="aberto"><span class="l">Clientes com pendência</span><span class="v">${pend}</span><span class="s">de ${porCli.size} com tarefas</span></button>`;
  };
  const celula = (t) => {
    if (!t) return '<td class="cel"></td>';
    const cls = atrasada(t) ? 'atraso' : t.status;
    return `<td class="cel"><button class="st st-${cls}" data-tarefa="${t.id}" title="${esc(t.titulo)}: ${esc(rotStatus(t))} · ${esc(prazoTxt(t))}${t.observacao ? '\n' + esc(t.observacao) : ''}">${atrasada(t) ? '!' : ICS[t.status]}${t.observacao ? '<sup style="font-size:9px">•</sup>' : ''}</button></td>`;
  };
  const corpo = () => {
    const L = filtrados();
    if (!T.length) { $c('#dCorpo').innerHTML = '<div class="vazio"><b>Sem tarefas neste mês</b>Gere as tarefas da competência para começar.</div>'; return; }
    if (f.vista === 'lista') {
      const ids = new Set(L.map((c) => c.id));
      const ts = T.filter((t) => ids.has(t.cliente_id) && (f.sit !== 'atraso' || atrasada(t)) && (f.sit !== 'aberto' || t.status === 'pendente' || t.status === 'andamento') && (!f.resp || t.responsavel === f.resp))
        .sort((a, b) => (a.status === 'concluida') - (b.status === 'concluida') || (a.vencimento || '').localeCompare(b.vencimento || ''));
      $c('#dCorpo').innerHTML = `<table class="t"><thead><tr><th>Vencimento</th><th>Cliente</th><th>Tarefa</th><th>Responsável</th><th>Situação</th><th>Observação</th></tr></thead><tbody>${ts.map((t) => `<tr class="lk" data-tarefa="${t.id}"><td class="num">${dataBR(t.vencimento)}</td><td><b>${esc(nomeCliente(t.cliente_id))}</b></td><td>${esc(t.titulo)}</td><td>${esc(nomePerfil(t.responsavel))}</td><td><span class="pill ${clsStatus(t)}">${rotStatus(t)}</span></td><td class="small muted">${esc(t.observacao || '')}</td></tr>`).join('') || '<tr><td colspan="6"><div class="vazio">Nenhuma tarefa com esse filtro.</div></td></tr>'}</tbody></table>`;
      return;
    }
    $c('#dCorpo').innerHTML = `<table class="t mx"><thead><tr><th style="min-width:220px">Cliente · ${L.length}</th>${cols.map((c) => `<th class="ob" title="${esc(c.nome)}"><button class="btn-col" data-col="${esc(c.k)}" style="border:0;background:none;padding:0;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;text-align:left;cursor:pointer" title="Ações para a coluna">${esc(c.nome)} ▾</button></th>`).join('')}</tr></thead>
      <tbody>${L.map((c) => { const m = porCli.get(c.id); return `<tr><td><a class="co" href="#/cadastros/empresa/${c.id}" style="text-decoration:none;color:inherit"><span class="av">${esc(iniciais(c.nome_fantasia || c.razao_social))}</span><div><b>${esc(c.nome_fantasia || c.razao_social)}</b><span>${REGIMES[c.regime]}</span></div></a></td>${cols.map((col) => celula(m.get(col.k))).join('')}</tr>`; }).join('') || `<tr><td colspan="${cols.length + 1}"><div class="vazio">Nenhum cliente com esse filtro.</div></td></tr>`}</tbody></table>`;
  };
  const tudo = () => { kpis(); corpo(); atualizarContadores(); };
  tudo();

  // eventos
  $c('#dBusca').addEventListener('input', (e) => { f.busca = e.target.value; corpo(); });
  $c('#dResp').addEventListener('change', (e) => { f.resp = e.target.value; corpo(); });
  $c('#dReg').addEventListener('change', (e) => { f.regime = e.target.value; corpo(); });
  const setSit = (s) => { f.sit = s; el.querySelectorAll('[data-sit]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.sit === s)); corpo(); };
  el.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', () => setSit(b.dataset.sit)));
  el.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => { f.vista = b.dataset.vista; el.querySelectorAll('[data-vista]').forEach((x) => x.setAttribute('aria-pressed', x === b)); corpo(); }));
  el.addEventListener('click', async (e) => {
    const k2 = e.target.closest('[data-sit2]'); if (k2) return setSit(k2.dataset.sit2);
    const b = e.target.closest('[data-tarefa]');
    if (b) { const t = T.find((x) => x.id === b.dataset.tarefa); if (t) abrirTarefa(b, t, (n) => { Object.assign(t, n); tudo(); }); return; }
    const col = e.target.closest('[data-col]');
    if (col) {
      const ids = new Set(filtrados().map((c) => c.id));
      const alvo = T.filter((t) => chave(t) === col.dataset.col && ids.has(t.cliente_id) && t.status !== 'concluida' && t.status !== 'nao_aplica');
      const nome = cols.find((c) => c.k === col.dataset.col)?.nome;
      if (!alvo.length) return aviso(`"${nome}": nada em aberto para os clientes da lista.`);
      if (!(await confirmar('Concluir em lote', `Marcar "${nome}" como concluída para ${alvo.length} cliente(s) que aparecem na lista agora?`, 'Marcar como concluída'))) return;
      let n = 0; for (const t of alvo) { try { const x = await db.atualizarTarefa(t.id, { status: 'concluida' }); Object.assign(t, x); trocarTarefaNoCache(x); n++; } catch (er) { aviso(er.message, 'erro'); break; } }
      db.registrar('Concluiu em lote', `${nome}: ${n} clientes (${nomeComp(S.comp)})`); aviso(`${n} tarefa(s) concluída(s).`); tudo();
    }
  });
  $c('#dExp').addEventListener('click', () => {
    const L = filtrados(); const linhas = [['Cliente', 'CNPJ', 'Regime', ...cols.map((c) => c.nome)]];
    L.forEach((c) => { const m = porCli.get(c.id); linhas.push([c.razao_social, c.cnpj || '', REGIMES[c.regime], ...cols.map((col) => { const t = m.get(col.k); return t ? rotStatus(t) : ''; })]); });
    baixarArquivo(`${dep}_${S.comp}.csv`, '﻿' + linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  });

  // notas fiscais (só Fiscal)
  if (dep === 'fiscal') {
    // mesmo critério do Painel Fiscal: Venda − Devolução, canceladas fora
    const ag = new Map();
    notas.filter((n) => daEmpresa(n.cliente_id)).forEach((n) => {
      const a = ag.get(n.cliente_id) || { qv: 0, v: 0, d: 0, canc: 0, difal: 0, frete: 0, icms: 0, iss: 0 };
      if (n.cancelada) a.canc++;
      else {
        if (n.categoria === 'Venda') { a.qv++; a.v += +n.valor_nf || 0; a.icms += +n.valor_icms || 0; a.iss += +n.iss || 0; a.difal += (+n.valor_difal || 0) + (+n.valor_fcp_difal || 0); }
        if (n.categoria === 'Devolução') a.d += +n.valor_nf || 0;
        if (n.categoria === 'CT-e (Frete)') a.frete += +n.valor_nf || 0;
      }
      ag.set(n.cliente_id, a);
    });
    const tot = [...ag.values()].reduce((t, a) => { Object.keys(a).forEach((k) => { t[k] = (t[k] || 0) + a[k]; }); return t; }, {});
    $c('#dNotas').innerHTML = `<div class="card-h"><h2>Resumo das notas · ${nomeComp(S.comp)}</h2><div class="barra-f"><a class="btn sec mini" href="#/${area}/importar">Importar XML</a><a class="btn mini" href="#/fiscal/painel">Abrir Painel Fiscal</a></div></div>
      ${ag.size ? `<div class="tw"><table class="t"><thead><tr><th>Cliente</th><th class="r">Vendas</th><th class="r">Valor vendas</th><th class="r">Devoluções</th><th class="r">Líquido</th><th class="r">ICMS</th><th class="r">ISS</th><th class="r">DIFAL + FCP</th><th class="r">Fretes</th><th class="r">Canceladas</th><th></th></tr></thead><tbody>
      ${[...ag.entries()].sort((a, b) => b[1].v - a[1].v).map(([cid, a]) => `<tr><td><b>${esc(nomeCliente(cid))}</b></td><td class="r num">${num(a.qv)}</td><td class="r num">${brl(a.v)}</td><td class="r num">${brl(a.d)}</td><td class="r num"><b>${brl(a.v - a.d)}</b></td><td class="r num">${brl(a.icms)}</td><td class="r num">${brl(a.iss)}</td><td class="r num">${brl(a.difal)}</td><td class="r num">${brl(a.frete)}</td><td class="r num">${a.canc || ''}</td><td><a class="btn sec mini" href="#/fiscal/painel/${cid}">Painel Fiscal</a></td></tr>`).join('')}
      <tr><td><b>Total</b></td><td class="r num"><b>${num(tot.qv)}</b></td><td class="r num"><b>${brl(tot.v)}</b></td><td class="r num"><b>${brl(tot.d)}</b></td><td class="r num"><b>${brl(tot.v - tot.d)}</b></td><td class="r num"><b>${brl(tot.icms)}</b></td><td class="r num"><b>${brl(tot.iss)}</b></td><td class="r num"><b>${brl(tot.difal)}</b></td><td class="r num"><b>${brl(tot.frete)}</b></td><td class="r num"><b>${tot.canc || ''}</b></td><td></td></tr></tbody></table></div>`
      : '<div class="vazio"><b>Nenhuma nota importada neste mês</b>Importe os XML na tela Documentos: o sistema identifica o cliente pelo CNPJ e monta o Painel Fiscal dele.</div>'}`;
  }

  // documentos do mês deste departamento (no DP eles ficam no Fechamento do mês)
  if (dep === 'dp') return;
  const docs = docs0.filter((d) => daEmpresa(d.cliente_id));
  const porTipo = {}; docs.forEach((d) => { porTipo[d.tipo] = (porTipo[d.tipo] || 0) + 1; });
  $c('#dDocs').innerHTML = `<div class="card-h"><h2>Documentos recebidos · ${nomeComp(S.comp)}</h2><a class="btn sec mini" href="#/${area}/importar">Importar documentos</a></div>
    ${docs.length ? `<div class="card-b leg" style="font-size:13px">${Object.entries(porTipo).map(([t, n]) => `<span class="pill p-${dep}">${n} · ${TIPOS_DOC[t] || t}</span>`).join('')}</div>
    <div class="tw" style="max-height:360px;overflow:auto"><table class="t"><thead><tr><th>Arquivo</th><th>Cliente</th><th>Tipo</th><th>Enviado</th></tr></thead><tbody>${docs.slice(0, 200).map((d) => `<tr><td>${esc(d.nome_arquivo)}</td><td>${esc(nomeCliente(d.cliente_id))}</td><td>${TIPOS_DOC[d.tipo] || d.tipo}</td><td class="small muted">${dataBR(d.enviado_em)} · ${esc(nomePerfil(d.enviado_por))}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="vazio">Nenhum documento deste departamento em ' + nomeComp(S.comp) + '.</div>'}`;
}
