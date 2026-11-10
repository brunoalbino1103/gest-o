// Ficha do colaborador: tudo de uma pessoa em um lugar (resumo, dados, contrato, folha, férias, ponto, histórico, documentos).
import db from '../db.js';
import { esc, dataBR, brl, nomeComp, aviso, modal, confirmar, hojeISO, soDigitos, fmtCNPJ } from '../util.js';
import { S, mudarEmpresa, mudarComp } from '../estado.js';
import { topo, recarregarTela, irPara } from '../app.js';
import { analisar, hm } from '../ponto.js';
import { experiencia, situacaoFerias, nivelFerias, nomeEmp, diasEntre } from './dp-comum.js';

export const TIPOS_CONTRATO = { indeterminado: 'Prazo indeterminado', experiencia: 'Experiência', temporario: 'Temporário', aprendiz: 'Aprendiz', estagio: 'Estágio', intermitente: 'Intermitente' };
export const TIPOS_EVENTO = { admissao: 'Admissão', reajuste: 'Reajuste salarial', cargo: 'Mudança de cargo', horario: 'Mudança de horário/jornada', ferias: 'Férias', afastamento: 'Afastamento', retorno: 'Retorno ao trabalho', atestado: 'Atestado', advertencia: 'Advertência', suspensao: 'Suspensão', aso: 'Exame (ASO)', acidente: 'Acidente de trabalho (CAT)', treinamento: 'Treinamento', elogio: 'Elogio / reconhecimento', desligamento: 'Desligamento', outro: 'Outro' };
const ABAS = [['resumo', 'Resumo'], ['dados', 'Dados pessoais'], ['contrato', 'Contrato'], ['folha', 'Folha'], ['ferias', 'Férias'], ['ponto', 'Ponto'], ['historico', 'Histórico'], ['documentos', 'Documentos']];
let aba = 'resumo';
const tempoCasa = (adm) => { if (!adm) return '—'; const d = diasEntre(adm, hojeISO()); const a = Math.floor(d / 365.25), m = Math.floor((d - a * 365.25) / 30.44); return a ? `${a} ano${a > 1 ? 's' : ''}${m ? ` e ${m} mes${m > 1 ? 'es' : ''}` : ''}` : `${m} mes${m === 1 ? '' : 'es'}`; };
const campo = (rot, v) => `<div><div class="small muted">${rot}</div><div style="white-space:pre-wrap">${v || '<span class="muted">—</span>'}</div></div>`;

export default async function ficha(el, [fid], vivo) {
  const f = (await db.funcionarios()).find((x) => x.id === fid);
  if (!f) { el.innerHTML = '<div class="card"><div class="vazio"><b>Colaborador não encontrado</b><a href="#/pessoal/colaboradores">Voltar</a></div></div>'; return; }
  const [itens, pers, marcs, cartoes, evs, movs, docs] = await Promise.all([
    db.listar('folha_itens', { funcionario_id: fid }).catch(() => []), db.listar('ferias_periodos', { funcionario_id: fid }).catch(() => []), db.feriasMarcacoes(),
    db.listar('ponto_cartoes', { funcionario_id: fid }).catch(() => []), db.listar('funcionario_eventos', { funcionario_id: fid }).catch(() => []), db.movimentacoes({ cliente_id: f.cliente_id }), db.documentos({ cliente_id: f.cliente_id, departamento: 'dp' })]);
  if (!vivo()) return;
  const emp = S.clientes.find((c) => c.id === f.cliente_id);
  const minhas = marcs.filter((m) => m.funcionario_id === fid && !m.oculta);
  const folha = itens.sort((a, b) => b.competencia.localeCompare(a.competencia));
  const ult = folha[0];
  const fer = situacaoFerias(f, marcs); const nf = nivelFerias(fer.pior);
  const exp = experiencia(f);
  const ponto = cartoes.map((c) => ({ c, a: analisar(c) })).sort((x, y) => y.c.competencia.localeCompare(x.c.competencia));
  topo(f.nome, `<a href="#/pessoal/colaboradores">Colaboradores</a> › ${esc(nomeEmp(emp))}`);

  // histórico: eventos lançados + o que o sistema já sabe (admissão, reajustes da folha, férias, movimentações, desligamento)
  const hist = [];
  if (f.admissao) hist.push({ data: f.admissao, tipo: 'admissao', descricao: `Admissão${f.cargo ? ' como ' + f.cargo : ''}`, auto: true });
  const porComp = folha.slice().reverse(); porComp.forEach((it, i) => { const ant = porComp[i - 1]; if (ant && it.salario && ant.salario && +it.salario !== +ant.salario) hist.push({ data: it.competencia + '-01', tipo: 'reajuste', descricao: `Salário de ${brl(ant.salario)} para ${brl(it.salario)} (${(((it.salario - ant.salario) / ant.salario) * 100).toFixed(1).replace('.', ',')}%) · pela folha`, valor: it.salario, auto: true }); });
  minhas.forEach((m) => hist.push({ data: m.inicio, tipo: 'ferias', descricao: `Férias: ${m.dias} dia(s)${+m.abono ? ` + ${m.abono} vendido(s)` : ''}${m.obs ? ' · ' + m.obs : ''}`, auto: true }));
  movs.filter((m) => m.funcionario_id === fid || (m.nome && m.nome === f.nome)).forEach((m) => hist.push({ data: m.data_evento, tipo: m.tipo === 'rescisao' ? 'desligamento' : m.tipo, descricao: `${{ admissao: 'Admissão', rescisao: 'Rescisão', afastamento: 'Afastamento', alteracao: 'Alteração contratual', ferias: 'Férias' }[m.tipo]} · ${m.status}${m.observacao ? ' · ' + m.observacao : ''}`, auto: true }));
  evs.forEach((e) => hist.push({ ...e, manual: true }));
  if (f.desligamento) hist.push({ data: f.desligamento, tipo: 'desligamento', descricao: 'Desligamento', auto: true });
  hist.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const proxVenc = [
    exp && exp.fase !== 'encerrada' ? { d: exp.prox, t: exp.fase === '1º período' ? 'Fim do 1º período de experiência' : 'Fim da experiência' } : null,
    fer.pior ? { d: fer.pior.limite, t: 'Limite para sair de férias' } : null,
    ...evs.filter((e) => e.vencimento && e.vencimento >= hojeISO()).map((e) => ({ d: e.vencimento, t: `${TIPOS_EVENTO[e.tipo] || e.tipo}: vence` })),
  ].filter(Boolean).sort((a, b) => a.d.localeCompare(b.d));

  let corpo = '';
  if (aba === 'resumo') {
    const kpi = (l, v, s, cls = '') => `<div class="kpi ${cls}"><span class="l">${l}</span><span class="v" style="font-size:20px">${v}</span><span class="s">${s}</span></div>`;
    const ultPonto = ponto[0]?.a.tot;
    corpo = `<div class="grid g4">
        ${kpi('Tempo de casa', tempoCasa(f.admissao), f.admissao ? 'desde ' + dataBR(f.admissao) : 'sem admissão cadastrada')}
        ${kpi('Salário', f.salario ? brl(f.salario) : '—', ult?.liquido ? `líquido de ${nomeComp(ult.competencia, true)}: ${brl(ult.liquido)}` : 'sem folha importada')}
        ${kpi('Férias', fer.pior ? `${fer.pior.saldo} dias` : 'em dia', fer.pior ? `sair até ${dataBR(fer.pior.limite)}` : (fer.abertos.length ? '' : 'nenhum período vencido'), nf === 'vencida' ? 'bad' : nf === 'urgente' ? 'at' : '')}
        ${kpi('Banco de horas', ultPonto?.bsaldo ? hm(ultPonto.bsaldo) : '—', ponto[0] ? `saldo no cartão de ${nomeComp(ponto[0].c.competencia, true)}` : 'sem cartão de ponto')}
      </div>
      <div class="lado-a-lado"><div class="grow card"><div class="card-h"><h2>Próximos vencimentos</h2></div><div class="lista">${proxVenc.map((p) => `<div class="item"><span class="rk ${diasEntre(hojeISO(), p.d) <= 30 ? '' : 'at'}">${diasEntre(hojeISO(), p.d)}d</span><div><b>${esc(p.t)}</b><small>${dataBR(p.d)}</small></div></div>`).join('') || '<div class="vazio">Nada vencendo.</div>'}</div></div>
      <div class="aside card"><div class="card-h"><h2>Últimos acontecimentos</h2></div><div class="lista">${hist.slice(0, 6).map((h) => `<div class="item"><div><b>${esc(TIPOS_EVENTO[h.tipo] || h.tipo)}</b><span>${esc(h.descricao || '')}</span><small>${dataBR(h.data)}</small></div></div>`).join('') || '<div class="vazio">Sem histórico.</div>'}</div></div></div>`;
  }
  if (aba === 'dados') corpo = `<div class="card"><div class="card-h"><h2>Dados pessoais</h2><button class="btn sec mini" data-editar>Editar</button></div><div class="card-b form">
      ${campo('Nome completo', esc(f.nome))}${campo('CPF', esc(f.cpf ? f.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : ''))}${campo('RG', esc(f.rg))}${campo('PIS / NIS', esc(f.pis))}${campo('CTPS', esc(f.ctps))}${campo('Nascimento', f.data_nascimento ? `${dataBR(f.data_nascimento)} (${Math.floor(diasEntre(f.data_nascimento, hojeISO()) / 365.25)} anos)` : '')}
      ${campo('Sexo', esc(f.sexo))}${campo('Estado civil', esc(f.estado_civil))}${campo('Escolaridade', esc(f.escolaridade))}${campo('Telefone', esc(f.telefone))}${campo('E-mail', esc(f.email))}
      <div class="full">${campo('Endereço', esc([f.endereco, f.cidade, f.uf, f.cep].filter(Boolean).join(' · ')))}</div>
      ${campo('Banco / agência / conta', esc([f.banco, f.agencia, f.conta].filter(Boolean).join(' · ')))}${campo('PIX', esc(f.pix))}
      <div class="full"><div class="small muted">Dependentes</div>${(f.dependentes || []).length ? `<table class="t" style="margin-top:4px"><thead><tr><th>Nome</th><th>Parentesco</th><th>Nascimento</th><th>CPF</th><th>IR</th><th>Sal.-família</th></tr></thead><tbody>${f.dependentes.map((d) => `<tr><td>${esc(d.nome)}</td><td>${esc(d.parentesco)}</td><td>${dataBR(d.nascimento)}</td><td>${esc(d.cpf || '')}</td><td>${d.ir ? 'Sim' : 'Não'}</td><td>${d.salario_familia ? 'Sim' : 'Não'}</td></tr>`).join('')}</tbody></table>` : '<span class="muted">Nenhum</span>'}</div>
    </div></div>`;
  if (aba === 'contrato') corpo = `<div class="card"><div class="card-h"><h2>Contrato de trabalho</h2><button class="btn sec mini" data-editar>Editar</button></div><div class="card-b form">
      ${campo('Empresa', esc(nomeEmp(emp)) + (emp?.cnpj ? ' · ' + fmtCNPJ(emp.cnpj) : ''))}${campo('Código na folha', esc(f.codigo))}${campo('Admissão', dataBR(f.admissao))}${campo('Tipo de contrato', esc(TIPOS_CONTRATO[f.tipo_contrato] || f.tipo_contrato || (f.exp_dias_total ? 'Experiência' : '')))}
      ${campo('Cargo', esc(f.cargo))}${campo('CBO', esc(f.cbo))}${campo('Setor', esc(f.setor))}${campo('Vínculo', esc(f.vinculo))}${campo('Salário', f.salario ? brl(f.salario) : '')}${campo('Horas no mês', f.horas_mes ? String(f.horas_mes).replace('.', ',') : '')}
      ${campo('Jornada', esc(f.jornada))}${campo('Horário', esc(f.horario))}${campo('Experiência', exp ? `${f.exp_dias_1 ? f.exp_dias_1 + ' + ' + (f.exp_dias_total - f.exp_dias_1) : f.exp_dias_total} dias · termina ${dataBR(exp.v2)}` : 'Sem contrato de experiência')}${campo('Situação', esc({ ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' }[f.situacao]) + (f.desligamento ? ' em ' + dataBR(f.desligamento) : ''))}
      ${campo('Pró-labore / sócio', f.contribuinte ? 'Sim' : 'Não')}${campo('Férias quitadas até', dataBR(f.ferias_ate))}
      <div class="full">${campo('Observações', esc(f.observacoes))}</div></div></div>`;
  if (aba === 'folha') corpo = `<div class="card"><div class="card-h"><h2>Folha mês a mês</h2><span class="small muted">vem dos relatórios importados do Domínio</span></div><div class="tw"><table class="t"><thead><tr><th>Competência</th><th class="r">Salário</th><th class="r">Proventos</th><th class="r">Descontos</th><th class="r">Líquido</th><th class="r">FGTS</th><th>Eventos</th></tr></thead><tbody>
      ${folha.map((it) => `<tr><td><b>${nomeComp(it.competencia, true)}</b></td><td class="r num">${it.salario ? brl(it.salario) : ''}</td><td class="r num">${it.proventos != null ? brl(it.proventos) : ''}</td><td class="r num">${it.descontos != null ? brl(it.descontos) : ''}</td><td class="r num"><b>${it.liquido != null ? brl(it.liquido) : ''}</b></td><td class="r num">${it.fgts != null ? brl(it.fgts) : ''}</td><td class="small">${(it.eventos || []).map((e) => `<span class="pill ${e.tipo === 'D' ? 'p-at' : e.tipo === 'P' ? 'p-ok' : 'p-na'}" style="margin:1px" title="${esc(e.referencia)}">${esc(e.descricao)} ${brl(e.valor)}</span>`).join('')}</td></tr>`).join('') || '<tr><td colspan="7"><div class="vazio">Nenhuma folha importada para esta pessoa.</div></td></tr>'}
      </tbody></table></div></div>`;
  if (aba === 'ferias') corpo = `<div class="card"><div class="card-h"><h2>Períodos aquisitivos</h2><a class="btn sec mini" href="#/pessoal/ferias">Abrir painel de Férias</a></div><div class="tw"><table class="t"><thead><tr><th>Período</th><th class="r">Direito</th><th class="r">Gozados</th><th class="r">Saldo</th><th>Limite para sair</th><th>Origem</th></tr></thead><tbody>
      ${(pers.length ? pers.sort((a, b) => b.inicio.localeCompare(a.inicio)).map((p) => `<tr><td>${dataBR(p.inicio)} a ${dataBR(p.fim)}</td><td class="r num">${String(p.dias_direito).replace('.', ',')}</td><td class="r num">${String(p.dias_gozados).replace('.', ',')}</td><td class="r num"><b>${String(p.dias_restantes).replace('.', ',')}</b></td><td>${dataBR(p.limite)}</td><td class="small muted">Programação de férias${p.data_base ? ' de ' + dataBR(p.data_base) : ''}</td></tr>`)
        : fer.abertos.map((p) => `<tr><td>${dataBR(p.ini)} a ${dataBR(p.fim)}</td><td class="r num">30</td><td class="r num">${30 - p.saldo}</td><td class="r num"><b>${p.saldo}</b></td><td>${dataBR(p.limite)}</td><td class="small muted">calculado pela admissão</td></tr>`)).join('') || '<tr><td colspan="6"><div class="vazio">Nenhum período em aberto.</div></td></tr>'}
      </tbody></table></div></div>
      <div class="card"><div class="card-h"><h2>Férias marcadas e gozadas</h2></div><div class="tw"><table class="t"><thead><tr><th>Início</th><th class="r">Dias</th><th class="r">Vendidos</th><th>Observação</th></tr></thead><tbody>${minhas.sort((a, b) => b.inicio.localeCompare(a.inicio)).map((m) => `<tr><td>${dataBR(m.inicio)}</td><td class="r num">${m.dias}</td><td class="r num">${m.abono || 0}</td><td class="small">${esc(m.obs || '')}</td></tr>`).join('') || '<tr><td colspan="4"><div class="vazio">Nenhuma.</div></td></tr>'}</tbody></table></div></div>`;
  if (aba === 'ponto') corpo = `<div class="card"><div class="card-h"><h2>Ponto mês a mês</h2><span class="small muted">dos cartões importados</span></div><div class="tw"><table class="t"><thead><tr><th>Competência</th><th class="r">Dias trabalhados</th><th class="r">Atrasos</th><th class="r">Almoço curto</th><th class="r">Faltas</th><th class="r">Banco no mês</th><th class="r">Saldo do banco</th><th class="r">Extras</th><th></th></tr></thead><tbody>
      ${ponto.map(({ c, a }) => `<tr><td><b>${nomeComp(c.competencia, true)}</b><div class="small muted">${dataBR(c.periodo_ini)} a ${dataBR(c.periodo_fim)}</div></td><td class="r num">${a.tot.diasTrab}</td><td class="r num">${a.tot.atrasos || ''}</td><td class="r num">${a.tot.almocoCurto || ''}${a.tot.almocoGrave ? ' <span class="pill p-bad">grave</span>' : ''}</td><td class="r num">${a.tot.faltas || ''}</td><td class="r num">${hm(a.tot.bcred - a.tot.bdeb)}</td><td class="r num">${a.tot.bsaldo ? hm(a.tot.bsaldo) : '—'}</td><td class="r num">${a.tot.ex60 + a.tot.ex100 ? hm(a.tot.ex60 + a.tot.ex100) : ''}</td><td><button class="btn sec mini" data-cartao="${c.competencia}">Ver cartão</button></td></tr>`).join('') || '<tr><td colspan="9"><div class="vazio">Nenhum cartão de ponto importado.</div></td></tr>'}
      </tbody></table></div></div>`;
  if (aba === 'historico') corpo = `<div class="card"><div class="card-h"><h2>Histórico</h2><button class="btn mini" data-evento>+ Lançar evento</button></div>
      <ol class="tl" style="margin:12px 18px 18px;padding-left:22px">${hist.map((h) => `<li style="padding:6px 0 12px 12px"><b>${esc(TIPOS_EVENTO[h.tipo] || h.tipo)}</b> <span class="small muted">· ${dataBR(h.data)}${h.auto ? ' · automático' : ''}</span><div class="small">${esc(h.descricao || '')}${h.valor && h.tipo !== 'reajuste' ? ' · ' + brl(h.valor) : ''}${h.vencimento ? ` · vence ${dataBR(h.vencimento)}` : ''}</div>${h.manual ? `<button class="btn-x" data-apaga-ev="${h.id}" style="width:24px;height:24px;font-size:13px" aria-label="Apagar">×</button>` : ''}</li>`).join('') || '<li class="muted">Sem histórico.</li>'}</ol></div>`;
  if (aba === 'documentos') {
    const meus = docs.filter((d) => d.dados?.pid === fid || (d.nome_arquivo && f.nome && d.nome_arquivo.toUpperCase().includes(f.nome.split(' ')[0].toUpperCase())));
    corpo = `<div class="card"><div class="card-h"><h2>Documentos</h2></div><div class="tw"><table class="t"><tbody>${meus.map((d) => `<tr><td><b>${esc(d.dados?.titulo || d.nome_arquivo)}</b><div class="small muted">${esc(d.dados?.tipoDoc || d.tipo || '')}</div></td><td class="small muted">${dataBR(d.enviado_em)}</td><td><button class="btn sec mini" data-abre="${d.id}">Abrir</button></td></tr>`).join('') || '<tr><td><div class="vazio">Nenhum documento desta pessoa. Os documentos de férias anexados no painel de Férias aparecem aqui.</div></td></tr>'}</tbody></table></div></div>`;
  }

  const sit = { ativo: ['Ativo', 'p-ok'], afastado: ['Afastado', 'p-at'], desligado: ['Desligado', 'p-na'] }[f.situacao] || ['Ativo', 'p-ok'];
  el.innerHTML = `<div class="card"><div class="card-b" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <span class="av" style="width:52px;height:52px;font-size:17px;border-radius:14px">${esc(f.nome.split(' ').filter(Boolean).map((x) => x[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join(''))}</span>
      <div style="flex:1;min-width:220px"><h2 style="font-size:19px">${esc(f.nome)}</h2><div class="leg" style="font-size:13px;color:var(--ink-2);margin-top:4px"><span class="pill ${sit[1]}">${sit[0]}</span>${f.contribuinte ? '<span class="pill p-co">Pró-labore</span>' : ''}<span>${esc(f.cargo || 'sem cargo')}</span>${f.codigo ? `<span class="muted">cód. ${esc(f.codigo)}</span>` : ''}<span class="muted">${esc(nomeEmp(emp))}</span></div></div>
      <div class="barra-f"><button class="btn sec" data-editar>Editar dados</button><button class="btn" data-evento>+ Lançar evento</button></div></div>
    <div class="tabs" role="tablist">${ABAS.map(([k, t]) => `<button role="tab" data-sub="${k}" aria-selected="${aba === k}">${t}</button>`).join('')}</div></div>${corpo}`;
  el.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.sub; recarregarTela(); }));
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', async () => { if (await editarFicha(f)) recarregarTela(); }));
  el.querySelectorAll('[data-evento]').forEach((b) => b.addEventListener('click', async () => { if (await lancarEvento(f)) { aba = 'historico'; recarregarTela(); } }));
  el.querySelectorAll('[data-apaga-ev]').forEach((b) => b.addEventListener('click', async () => { if (await confirmar('Apagar evento', 'Apagar este evento do histórico?', 'Apagar')) { await db.apagar('funcionario_eventos', b.dataset.apagaEv); recarregarTela(); } }));
  el.querySelectorAll('[data-cartao]').forEach((b) => b.addEventListener('click', () => { mudarEmpresa(f.cliente_id); mudarComp(b.dataset.cartao); irPara('#/pessoal/ponto'); }));
  el.querySelectorAll('[data-abre]').forEach((b) => b.addEventListener('click', async () => { try { const w = window.open('', '_blank'); const u = await db.abrirDocumento(docs.find((d) => d.id === b.dataset.abre)); if (w) w.location = u; } catch (er) { aviso(er.message, 'erro'); } }));
}

// ---------- editar todos os dados da ficha ----------
export function editarFicha(f) {
  const v = (k) => esc(f[k] ?? '');
  const sel = (nome, op, atual) => `<select name="${nome}"><option value="">—</option>${Object.entries(op).map(([k, t]) => `<option value="${k}" ${atual === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  let deps = (f.dependentes || []).map((d) => ({ ...d }));
  const sec = (t) => `<div class="full secao-t" style="padding:10px 0 0">${t}</div>`;
  return modal('Ficha · ' + f.nome, `<form class="form" id="fFi">
    ${sec('Identificação')}
    <label class="f full">Nome completo<input name="nome" value="${v('nome')}" required></label>
    <label class="f">CPF<input name="cpf" value="${v('cpf')}" inputmode="numeric"></label><label class="f">RG<input name="rg" value="${v('rg')}"></label>
    <label class="f">PIS / NIS<input name="pis" value="${v('pis')}"></label><label class="f">CTPS<input name="ctps" value="${v('ctps')}"></label>
    <label class="f">Nascimento<input type="date" name="data_nascimento" value="${v('data_nascimento')}"></label><label class="f">Sexo${sel('sexo', { F: 'Feminino', M: 'Masculino' }, f.sexo)}</label>
    <label class="f">Estado civil${sel('estado_civil', { solteiro: 'Solteiro(a)', casado: 'Casado(a)', uniao: 'União estável', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)' }, f.estado_civil)}</label>
    <label class="f">Escolaridade${sel('escolaridade', { fundamental: 'Fundamental', medio: 'Médio', tecnico: 'Técnico', superior: 'Superior', pos: 'Pós-graduação' }, f.escolaridade)}</label>
    ${sec('Contato e endereço')}
    <label class="f">Telefone<input name="telefone" value="${v('telefone')}"></label><label class="f">E-mail<input type="email" name="email" value="${v('email')}"></label>
    <label class="f full">Endereço<input name="endereco" value="${v('endereco')}"></label>
    <label class="f">Cidade<input name="cidade" value="${v('cidade')}"></label><label class="f">UF / CEP<span style="display:flex;gap:6px"><input name="uf" value="${v('uf')}" maxlength="2" style="width:70px"><input name="cep" value="${v('cep')}"></span></label>
    ${sec('Contrato')}
    <label class="f">Código na folha<input name="codigo" value="${v('codigo')}"></label><label class="f">Admissão<input type="date" name="admissao" value="${v('admissao')}"></label>
    <label class="f">Tipo de contrato${sel('tipo_contrato', TIPOS_CONTRATO, f.tipo_contrato)}</label>
    <label class="f">Experiência<select name="exp">${[['', 'Sem experiência'], ['45/90', '45 + 45 dias'], ['30/90', '30 + 60 dias'], ['/90', '90 dias direto'], ['30/60', '30 + 30 dias'], ['/45', '45 dias'], ['/30', '30 dias']].map(([k, t]) => `<option value="${k}" ${(f.exp_dias_total ? `${f.exp_dias_1 || ''}/${f.exp_dias_total}` : '') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Cargo<input name="cargo" value="${v('cargo')}"></label><label class="f">CBO<input name="cbo" value="${v('cbo')}"></label>
    <label class="f">Setor<input name="setor" value="${v('setor')}"></label><label class="f">Salário (R$)<input type="number" step="0.01" name="salario" value="${v('salario')}"></label>
    <label class="f">Jornada<input name="jornada" value="${v('jornada')}" placeholder="Ex.: 44h semanais"></label><label class="f">Horário<input name="horario" value="${v('horario')}" placeholder="Ex.: seg a sex 08:00-17:00"></label>
    <label class="f">Situação${sel('situacao', { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' }, f.situacao || 'ativo')}</label><label class="f">Desligamento<input type="date" name="desligamento" value="${v('desligamento')}"></label>
    <label class="f">Férias quitadas até<input type="date" name="ferias_ate" value="${v('ferias_ate')}"></label><label class="chk" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="contribuinte" ${f.contribuinte ? 'checked' : ''}> Sócio / pró-labore</label>
    ${sec('Pagamento')}
    <label class="f">Banco<input name="banco" value="${v('banco')}"></label><label class="f">Agência / conta<span style="display:flex;gap:6px"><input name="agencia" value="${v('agencia')}" style="width:100px"><input name="conta" value="${v('conta')}"></span></label>
    <label class="f full">PIX<input name="pix" value="${v('pix')}"></label>
    ${sec('Dependentes')}
    <div class="full" id="deps"></div>
    <label class="f full">Observações<textarea name="observacoes" style="min-height:56px">${v('observacoes')}</textarea></label>
    <p class="full small" id="fiErro" style="color:var(--bad)"></p>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { largura: 820, aoAbrir: (m, fechar) => {
    const fm = m.querySelector('#fFi');
    const desenhaDeps = () => {
      m.querySelector('#deps').innerHTML = deps.map((d, i) => `<div class="barra-f" style="margin-bottom:6px"><input data-d="${i}" data-k="nome" value="${esc(d.nome || '')}" placeholder="Nome" style="flex:2;min-width:160px"><select data-d="${i}" data-k="parentesco" style="width:auto">${['Filho(a)', 'Cônjuge', 'Companheiro(a)', 'Enteado(a)', 'Pai/Mãe', 'Outro'].map((p) => `<option ${d.parentesco === p ? 'selected' : ''}>${p}</option>`).join('')}</select><input type="date" data-d="${i}" data-k="nascimento" value="${d.nascimento || ''}" style="width:150px"><label class="chk small"><input type="checkbox" data-d="${i}" data-k="ir" ${d.ir ? 'checked' : ''}> IR</label><label class="chk small"><input type="checkbox" data-d="${i}" data-k="salario_familia" ${d.salario_familia ? 'checked' : ''}> Sal.-família</label><button type="button" class="btn-x" data-tira="${i}" aria-label="Tirar">×</button></div>`).join('') + '<button type="button" class="btn sec mini" id="addDep">+ Dependente</button>';
      m.querySelector('#addDep').onclick = () => { deps.push({ parentesco: 'Filho(a)' }); desenhaDeps(); };
      m.querySelectorAll('[data-tira]').forEach((b) => { b.onclick = () => { deps.splice(+b.dataset.tira, 1); desenhaDeps(); }; });
      m.querySelectorAll('[data-d]').forEach((i) => { i.onchange = () => { deps[+i.dataset.d][i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; }; });
    };
    desenhaDeps();
    fm.addEventListener('submit', async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(fm));
      const [e1, et] = (d.exp || '').split('/'); d.exp_dias_1 = +e1 || null; d.exp_dias_total = +et || null; delete d.exp;
      d.contribuinte = fm.contribuinte.checked; d.salario = d.salario === '' ? null : +d.salario; d.cpf = soDigitos(d.cpf) || null;
      Object.keys(d).forEach((k) => { if (d[k] === '') d[k] = null; });
      d.dependentes = deps.filter((x) => x.nome);
      try {
        // reajuste ou mudança de cargo feitos aqui viram evento no histórico
        if (d.salario && f.salario && +d.salario !== +f.salario) await db.inserir('funcionario_eventos', { cliente_id: f.cliente_id, funcionario_id: f.id, data: hojeISO(), tipo: 'reajuste', descricao: `Salário de ${brl(f.salario)} para ${brl(d.salario)}`, valor: d.salario }).catch(() => {});
        if (d.cargo && f.cargo && d.cargo !== f.cargo) await db.inserir('funcionario_eventos', { cliente_id: f.cliente_id, funcionario_id: f.id, data: hojeISO(), tipo: 'cargo', descricao: `De ${f.cargo} para ${d.cargo}` }).catch(() => {});
        await db.salvarFuncionario({ id: f.id, ...d }); await db.registrar('Editou ficha do colaborador', d.nome, f.cliente_id); aviso('Ficha salva.'); fechar(true);
      } catch (er) { m.querySelector('#fiErro').textContent = er.message; }
    });
  } });
}

// ---------- lançar um evento no histórico ----------
export function lancarEvento(f, tipoInicial = 'advertencia') {
  return modal('Lançar evento · ' + f.nome, `<form class="form" id="fEv">
    <label class="f">Tipo<select name="tipo">${Object.entries(TIPOS_EVENTO).map(([k, t]) => `<option value="${k}" ${k === tipoInicial ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Data<input type="date" name="data" value="${hojeISO()}" required></label>
    <label class="f full">Descrição<textarea name="descricao" style="min-height:60px" placeholder="O que aconteceu"></textarea></label>
    <label class="f" data-valor><span id="rotValor">Valor (R$)</span><input type="number" step="0.01" name="valor"></label>
    <label class="f" data-venc><span id="rotVenc">Vencimento</span><input type="date" name="vencimento"></label>
    <label class="f full">Anexo (opcional)<input type="file" name="anexo"></label>
    <label class="chk full" data-imp><input type="checkbox" name="imprimir" checked> Imprimir o documento para assinatura ao lançar</label>
    <p class="full small muted" id="evDica"></p><p class="full small" id="evErro" style="color:var(--bad)"></p>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Lançar</button></div></form>`, { largura: 620, aoAbrir: (m, fechar) => {
    const fm = m.querySelector('#fEv');
    const ajusta = () => {
      const t = fm.tipo.value;
      m.querySelector('[data-imp]').hidden = !['advertencia', 'suspensao'].includes(t);
      m.querySelector('[data-valor]').hidden = !['reajuste', 'suspensao'].includes(t); m.querySelector('#rotValor').textContent = t === 'reajuste' ? 'Novo salário (R$)' : 'Dias de suspensão';
      m.querySelector('[data-venc]').hidden = !['aso', 'afastamento', 'atestado', 'treinamento', 'suspensao'].includes(t); m.querySelector('#rotVenc').textContent = t === 'aso' ? 'Próximo exame' : t === 'treinamento' ? 'Validade do treinamento' : 'Até (fim)';
      m.querySelector('#evDica').textContent = { reajuste: 'O salário da ficha é atualizado.', cargo: 'Escreva o novo cargo na descrição; ele vai para a ficha.', afastamento: 'A pessoa fica como "Afastado" até lançar o retorno.', retorno: 'A pessoa volta a "Ativo".', desligamento: 'A pessoa fica como "Desligado" (use Admissões e rescisões para controlar o prazo da rescisão).', aso: 'Informe a data do próximo exame para o sistema avisar antes de vencer.' }[t] || '';
    };
    fm.tipo.addEventListener('change', ajusta); ajusta();
    fm.addEventListener('submit', async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(fm)); const arq = fm.anexo.files[0];
      try {
        let doc = null; if (arq) doc = await db.enviarDocumento(arq, { cliente_id: f.cliente_id, departamento: 'dp', competencia: d.data.slice(0, 7), tipo: 'outro', dados: { pid: f.id, tipoDoc: TIPOS_EVENTO[d.tipo], titulo: arq.name } });
        await db.inserir('funcionario_eventos', { cliente_id: f.cliente_id, funcionario_id: f.id, data: d.data, tipo: d.tipo, descricao: d.descricao || null, valor: d.valor ? +d.valor : null, vencimento: d.vencimento || null, documento_id: doc?.id || null });
        const mud = {};
        if (d.tipo === 'reajuste' && d.valor) mud.salario = +d.valor;
        if (d.tipo === 'cargo' && d.descricao) mud.cargo = d.descricao.trim().slice(0, 80);
        if (d.tipo === 'afastamento') mud.situacao = 'afastado';
        if (d.tipo === 'retorno') mud.situacao = 'ativo';
        if (d.tipo === 'desligamento') { mud.situacao = 'desligado'; mud.desligamento = d.data; }
        if (Object.keys(mud).length) await db.salvarFuncionario({ id: f.id, ...mud });
        if (['advertencia', 'suspensao'].includes(d.tipo) && fm.imprimir.checked) {
          const { imprimir } = await import('../modelos-doc.js');
          imprimir(d.tipo, { empresa: S.clientes.find((c) => c.id === f.cliente_id), func: f, dados: { data: d.data, dataFato: d.data, motivo: d.descricao, dias: d.valor || 1, inicio: d.data, fim: d.vencimento } });
        }
        await db.registrar('Evento: ' + TIPOS_EVENTO[d.tipo], f.nome, f.cliente_id); aviso('Evento lançado.'); fechar(true);
      } catch (er) { m.querySelector('#evErro').textContent = er.message; }
    });
  } });
}
