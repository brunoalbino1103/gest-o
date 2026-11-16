// Visão geral do Departamento Pessoal: o que precisa de atenção (férias, experiência, admissões/rescisões, fechamento, obrigações).
import db from '../db.js';
import { esc, dataBR, brl, nomeComp, atrasada, diasAte } from '../util.js';
import { S, tarefasDa } from '../estado.js';
import { topo } from '../app.js';
import { experiencia, situacaoFerias, nivelFerias, ITENS_FECHAMENTO, tipoFechamento, empresasDP, nomeEmp, PORTES, ATIVIDADES } from './dp-comum.js';

export default async function visaoDP(el, _r, vivo) {
  const [funcs, marcs, movs, docs, cfgs, tarefas, evs, edocs, peds] = await Promise.all([db.funcionarios(), db.feriasMarcacoes(), db.movimentacoes(), db.documentos({ competencia: S.comp, departamento: 'dp' }), db.dpEmpresas(), tarefasDa(S.comp), db.listar('funcionario_eventos').catch(() => []), db.listar('empresa_documentos').catch(() => []), db.listar('solicitacoes', { status: 'nova' }).catch(() => [])]);
  if (!vivo()) return;
  const daEmp = (id) => !S.empresa || id === S.empresa;
  const emps = empresasDP().filter((c) => c.tem_funcionarios && daEmp(c.id));
  const ativos = funcs.filter((f) => f.situacao !== 'desligado' && !f.contribuinte && daEmp(f.cliente_id));
  const nomeC = (id) => nomeEmp(S.clientes.find((c) => c.id === id));
  // férias
  const fer = ativos.map((f) => ({ f, p: situacaoFerias(f, marcs).pior })).filter((x) => x.p).map((x) => ({ ...x, n: nivelFerias(x.p) }));
  const ferAlert = fer.filter((x) => x.n === 'vencida' || x.n === 'urgente');
  // experiência
  const exp = ativos.map((f) => ({ f, x: experiencia(f) })).filter((r) => r.x && r.x.fase !== 'encerrada' && r.x.dias <= 15);
  // movimentações
  const movAb = movs.filter((m) => daEmp(m.cliente_id) && (m.status === 'pendente' || m.status === 'andamento'));
  // fechamento
  const recebidos = (cid) => new Set(docs.filter((d) => d.cliente_id === cid).map((d) => tipoFechamento(d.nome_arquivo, d.tipo)).filter(Boolean));
  const fechadas = emps.filter((c) => ITENS_FECHAMENTO.filter(([k]) => k !== 'sindical').every(([k]) => recebidos(c.id).has(k))).length;
  // obrigações do DP
  const obr = tarefas.filter((t) => t.departamento === 'dp' && daEmp(t.cliente_id));
  const obrAt = obr.filter(atrasada);
  // SST: último ASO de cada ativo e programas (PGR, PCMSO...) vencendo em 30 dias
  const ultAso = (fid) => evs.filter((e) => e.tipo === 'aso' && e.funcionario_id === fid).sort((a, b) => b.data.localeCompare(a.data))[0];
  const asoAlert = ativos.map((f) => ({ f, u: ultAso(f.id) })).filter((x) => x.u?.vencimento && diasAte(x.u.vencimento) <= 30);
  const docAlert = edocs.filter((d) => daEmp(d.cliente_id) && d.validade && diasAte(d.validade) <= 30);
  const emp = S.empresa ? S.clientes.find((c) => c.id === S.empresa) : null; const cfg = emp ? cfgs.find((c) => c.cliente_id === emp.id) : null;

  topo('Caixa de entrada', `${emp ? nomeEmp(emp) : 'Todas as empresas'} · tudo o que precisa de ação, do mais urgente para o mais tranquilo`);
  const TIPO_MOV = { admissao: 'Admissão', rescisao: 'Rescisão', afastamento: 'Afastamento', alteracao: 'Alteração', ferias: 'Férias' };
  const TIPO_PED = { admissao: 'admissão', rescisao: 'desligamento', ferias: 'férias', alteracao: 'alteração', afastamento: 'afastamento', outro: 'outro assunto' };
  // fechamento: prazo = dia 20 do mês seguinte (FGTS e DCTFWeb)
  const [ay, am] = S.comp.split('-').map(Number); const prazoFech = new Date(ay, am, 20).toLocaleDateString('sv-SE');
  const faltando = emps.filter((c) => !ITENS_FECHAMENTO.filter(([k]) => k !== 'sindical').every(([k]) => recebidos(c.id).has(k)));
  const L = [
    ...peds.filter((p) => daEmp(p.cliente_id)).map((p) => ({ ord: Math.min(0, diasAte(p.criado_em.slice(0, 10))), st: 'co', cat: 'Portal', t: `Pedido de ${TIPO_PED[p.tipo] || p.tipo}${p.titulo ? ': ' + p.titulo : ''}`, s: nomeC(p.cliente_id), d: 'novo', href: '#/pessoal/portal' })),
    ...movAb.filter((m) => m.prazo).map((m) => ({ ord: diasAte(m.prazo), cat: TIPO_MOV[m.tipo] || 'Movimentação', t: `${TIPO_MOV[m.tipo] || ''} de ${m.nome}`, s: nomeC(m.cliente_id), href: '#/pessoal/movimentacoes' })),
    ...ferAlert.map((x) => ({ ord: x.p.diasLimite, cat: 'Férias', t: `Férias ${x.n === 'vencida' ? 'vencidas' : 'a marcar'} de ${x.f.nome}`, s: nomeC(x.f.cliente_id), href: '#/pessoal/ferias' })),
    ...exp.map(({ f, x }) => ({ ord: x.dias, cat: 'Experiência', t: `${x.fase === '1º período' ? 'Prorrogar ou desligar' : 'Efetivar ou desligar'} ${f.nome}`, s: nomeC(f.cliente_id), href: '#/pessoal/experiencia' })),
    ...asoAlert.map(({ f, u }) => ({ ord: diasAte(u.vencimento), cat: 'SST', t: `ASO ${diasAte(u.vencimento) < 0 ? 'vencido' : 'vencendo'} de ${f.nome}`, s: nomeC(f.cliente_id), href: '#/pessoal/sst' })),
    ...docAlert.map((d) => ({ ord: diasAte(d.validade), cat: 'SST', t: `${d.tipo.toUpperCase()} ${diasAte(d.validade) < 0 ? 'vencido' : 'vencendo'}`, s: nomeC(d.cliente_id), href: '#/pessoal/sst' })),
    ...obrAt.map((t) => ({ ord: diasAte(t.vencimento), cat: 'Obrigação', t: `${t.titulo} atrasada`, s: nomeC(t.cliente_id), href: '#/pessoal/obrigacoes' })),
    ...(!S.todos && faltando.length ? [{ ord: diasAte(prazoFech), cat: 'Fechamento', st: 'co', t: `Fechamento de ${nomeComp(S.comp, true)}: ${faltando.length} empresa(s) com arquivos faltando`, s: faltando.slice(0, 3).map(nomeEmp).join(', ') + (faltando.length > 3 ? '…' : ''), href: '#/pessoal/fechamento' }] : []),
  ].sort((a, b) => a.ord - b.ord);
  const quando = (o) => o.d || (o.ord < 0 ? `${-o.ord}d atrás` : o.ord === 0 ? 'hoje' : o.ord === 1 ? 'amanhã' : o.ord <= 7 ? `em ${o.ord} dias` : dataBR(new Date(Date.now() + o.ord * 864e5).toLocaleDateString('sv-SE')).slice(0, 5));
  const secoes = [['Atrasado', (o) => o.ord < 0], ['Hoje e próximos 7 dias', (o) => o.ord >= 0 && o.ord <= 7], ['Próximos 30 dias', (o) => o.ord > 7 && o.ord <= 30], ['Mais adiante', (o) => o.ord > 30]];
  const linha = (o) => `<a class="cx-r" href="${o.href}"><span class="cx-st ${o.st || (o.ord < 0 ? 'bad' : o.ord <= 7 ? 'at' : '')}"></span><span class="cx-t"><b>${esc(o.t)}</b><small>${esc(o.s)}</small></span><span class="cx-tag">${o.cat}</span><span class="cx-d ${o.ord < 0 && !o.d ? 'bad' : ''}">${quando(o)}</span></a>`;
  const chip = (cls, v, l, href) => `<a class="${cls}" href="${href}"><b>${v}</b>${l}</a>`;
  const okObr = obr.filter((t) => t.status === 'concluida').length, totObr = obr.filter((t) => t.status !== 'nao_aplica').length;

  el.innerHTML = `<div class="cx-resumo">
      ${chip('', ativos.length, 'colaboradores ativos', '#/pessoal/colaboradores')}
      ${chip(fechadas < emps.length ? 'at' : '', `${fechadas}/${emps.length}`, `fechamentos de ${nomeComp(S.comp, true)}`, '#/pessoal/fechamento')}
      ${chip(obrAt.length ? 'bad' : '', `${okObr}/${totObr}`, `obrigações concluídas${obrAt.length ? ` · ${obrAt.length} atrasada(s)` : ''}`, '#/pessoal/obrigacoes')}
      ${chip(ferAlert.length ? 'bad' : '', ferAlert.length, 'férias a resolver', '#/pessoal/ferias')}
      ${chip(movAb.length ? 'at' : '', movAb.length, 'admissões e rescisões abertas', '#/pessoal/movimentacoes')}
    </div>
    <div class="cx">${L.length ? secoes.map(([t, f]) => { const l = L.filter(f); return l.length ? `<div class="cx-g">${t}<span>${l.length}</span></div>${l.slice(0, 40).map(linha).join('')}` : ''; }).join('')
      : '<div class="cx-vazio"><b>Tudo em dia</b>Nenhuma férias, experiência, movimentação, pedido ou obrigação precisando de ação.</div>'}</div>
    ${emp ? `<div class="card"><div class="card-h"><h2>${esc(nomeEmp(emp))}</h2><a class="btn sec mini" href="#/pessoal/empresas">Abrir cadastro</a></div><div class="card-b small" style="display:flex;flex-direction:column;gap:4px">
      <span>${emp.porte ? PORTES[emp.porte] : 'Porte não informado'} · ${emp.atividade ? ATIVIDADES[emp.atividade] : 'atividade não informada'}</span>
      <span>${cfg?.sindicato ? esc(cfg.sindicato) : '<span style="color:var(--at-ink)">Convenção coletiva não cadastrada</span>'}${cfg?.cct_vigencia_fim ? ` · vigência até ${dataBR(cfg.cct_vigencia_fim)}` : ''}${cfg?.piso_salarial ? ' · piso ' + brl(cfg.piso_salarial) : ''}</span></div></div>` : ''}`;
}
