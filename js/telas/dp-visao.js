// Visão geral do Departamento Pessoal: o que precisa de atenção (férias, experiência, admissões/rescisões, fechamento, obrigações).
import db from '../db.js';
import { esc, dataBR, brl, nomeComp, atrasada, diasAte } from '../util.js';
import { S, tarefasDa } from '../estado.js';
import { topo } from '../app.js';
import { experiencia, situacaoFerias, nivelFerias, ITENS_FECHAMENTO, tipoFechamento, empresasDP, nomeEmp, PORTES, ATIVIDADES } from './dp-comum.js';

export default async function visaoDP(el, _r, vivo) {
  const [funcs, marcs, movs, docs, cfgs, tarefas] = await Promise.all([db.funcionarios(), db.feriasMarcacoes(), db.movimentacoes(), db.documentos({ competencia: S.comp, departamento: 'dp' }), db.dpEmpresas(), tarefasDa(S.comp)]);
  if (!vivo()) return;
  const daEmp = (id) => !S.empresa || id === S.empresa;
  const emps = empresasDP().filter((c) => c.tem_funcionarios && daEmp(c.id));
  const ativos = funcs.filter((f) => f.situacao !== 'desligado' && daEmp(f.cliente_id));
  const nomeC = (id) => nomeEmp(S.clientes.find((c) => c.id === id));
  // férias
  const fer = ativos.map((f) => ({ f, p: situacaoFerias(f, marcs).pior })).filter((x) => x.p).map((x) => ({ ...x, n: nivelFerias(x.p) }));
  const ferAlert = fer.filter((x) => x.n === 'vencida' || x.n === 'urgente');
  // experiência
  const exp = ativos.map((f) => ({ f, x: experiencia(f) })).filter((r) => r.x && r.x.fase !== 'encerrada' && r.x.dias <= 15);
  // movimentações
  const movAb = movs.filter((m) => daEmp(m.cliente_id) && (m.status === 'pendente' || m.status === 'andamento'));
  // fechamento
  const recebidos = (cid) => new Set(docs.filter((d) => d.cliente_id === cid).map((d) => tipoFechamento(d.nome_arquivo)).filter(Boolean));
  const fechadas = emps.filter((c) => ITENS_FECHAMENTO.filter(([k]) => k !== 'sindical').every(([k]) => recebidos(c.id).has(k))).length;
  // obrigações do DP
  const obr = tarefas.filter((t) => t.departamento === 'dp' && daEmp(t.cliente_id));
  const obrAt = obr.filter(atrasada);
  const emp = S.empresa ? S.clientes.find((c) => c.id === S.empresa) : null; const cfg = emp ? cfgs.find((c) => c.cliente_id === emp.id) : null;

  topo('Visão geral', `${emp ? nomeEmp(emp) : 'Todas as empresas'} · ${nomeComp(S.comp)}`);
  const kpi = (cls, l, v, s, href) => `<a class="kpi ${cls}" href="${href}" style="text-decoration:none;color:inherit"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></a>`;
  const prior = [
    ...ferAlert.map((x) => ({ ord: x.p.diasLimite, tag: x.n === 'vencida' ? 'bad' : 'at', t: `Férias ${x.n === 'vencida' ? 'vencidas' : 'a marcar'}: ${x.f.nome}`, s: `${nomeC(x.f.cliente_id)} · limite para sair ${dataBR(x.p.limite)}`, href: '#/pessoal/ferias' })),
    ...exp.map(({ f, x }) => ({ ord: x.dias, tag: x.dias <= 7 ? 'bad' : 'at', t: `Experiência: ${f.nome}`, s: `${nomeC(f.cliente_id)} · ${x.fase === '1º período' ? 'prorrogar ou desligar' : 'efetivar ou desligar'} até ${dataBR(x.prox)}`, href: '#/pessoal/experiencia' })),
    ...movAb.filter((m) => m.prazo).map((m) => ({ ord: diasAte(m.prazo), tag: diasAte(m.prazo) <= 3 ? 'bad' : 'at', t: `${{ admissao: 'Admissão', rescisao: 'Rescisão', afastamento: 'Afastamento', alteracao: 'Alteração', ferias: 'Férias' }[m.tipo]}: ${m.nome}`, s: `${nomeC(m.cliente_id)} · prazo ${dataBR(m.prazo)}`, href: '#/pessoal/movimentacoes' })),
    ...obrAt.map((t) => ({ ord: diasAte(t.vencimento), tag: 'bad', t: `${t.titulo} atrasada`, s: `${nomeC(t.cliente_id)} · venceu ${dataBR(t.vencimento)}`, href: '#/pessoal/obrigacoes' })),
  ].sort((a, b) => a.ord - b.ord);

  el.innerHTML = `<div class="grid g4">
      ${kpi('', 'Colaboradores ativos', ativos.length, `${emps.length} empresa(s) com funcionários`, '#/pessoal/colaboradores')}
      ${kpi(ferAlert.length ? 'bad' : 'ok', 'Férias vencidas ou a marcar', ferAlert.length, 'limite em até 90 dias, sem data', '#/pessoal/ferias')}
      ${kpi(exp.length ? 'at' : '', 'Experiências vencendo', exp.length, 'nos próximos 15 dias', '#/pessoal/experiencia')}
      ${kpi(movAb.length ? 'at' : '', 'Admissões e rescisões', movAb.length, 'em aberto', '#/pessoal/movimentacoes')}
    </div>
    <div class="lado-a-lado">
      <div class="grow card"><div class="card-h"><h2>Resolver primeiro</h2><span class="small muted">${prior.length} item(ns)</span></div>
        <div class="lista">${prior.slice(0, 30).map((p) => `<a class="item" href="${p.href}" style="text-decoration:none;color:inherit"><span class="rk ${p.tag === 'at' ? 'at' : ''}">${p.ord < 0 ? p.ord + 'd' : p.ord === 0 ? 'hoje' : '+' + p.ord + 'd'}</span><div><b>${esc(p.t)}</b><small>${esc(p.s)}</small></div></a>`).join('') || '<div class="vazio"><b>Nada urgente</b>Sem férias vencendo, experiências, movimentações ou obrigações atrasadas.</div>'}</div></div>
      <div class="aside" style="display:flex;flex-direction:column;gap:16px">
        <a class="card" href="#/pessoal/fechamento" style="text-decoration:none;color:inherit"><div class="card-h"><h2>Fechamento de ${nomeComp(S.comp, true)}</h2></div><div class="card-b"><div class="kpi" style="border:0;padding:0"><span class="v">${fechadas}/${emps.length}</span><span class="s">empresa(s) com o pacote do mês completo</span></div></div></a>
        <a class="card" href="#/pessoal/obrigacoes" style="text-decoration:none;color:inherit"><div class="card-h"><h2>Obrigações do mês</h2></div><div class="card-b"><div class="kpi" style="border:0;padding:0"><span class="v" style="color:${obrAt.length ? 'var(--bad)' : 'var(--ok)'}">${obr.filter((t) => t.status === 'concluida').length}/${obr.filter((t) => t.status !== 'nao_aplica').length}</span><span class="s">concluídas${obrAt.length ? ` · ${obrAt.length} atrasada(s)` : ''}</span></div></div></a>
        ${emp ? `<a class="card" href="#/pessoal/empresas" style="text-decoration:none;color:inherit"><div class="card-h"><h2>Cadastro da empresa</h2></div><div class="card-b small" style="display:flex;flex-direction:column;gap:4px">
          <span><b>${emp.porte ? PORTES[emp.porte] : 'Porte não informado'}</b> · ${emp.atividade ? ATIVIDADES[emp.atividade] : 'atividade não informada'}</span>
          <span>${cfg?.sindicato ? esc(cfg.sindicato) : '<span style="color:var(--at-ink)">Convenção coletiva não cadastrada</span>'}</span>
          ${cfg?.cct_vigencia_fim ? `<span class="muted">Vigência até ${dataBR(cfg.cct_vigencia_fim)}${cfg.piso_salarial ? ' · piso ' + brl(cfg.piso_salarial) : ''}</span>` : ''}</div></a>` : ''}
      </div></div>`;
}
