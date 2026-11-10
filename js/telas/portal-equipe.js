// Portal do cliente, lado do escritório: pedidos recebidos, arquivos enviados pelos clientes,
// protocolo do que foi publicado (aberto / pago) e quem tem acesso.
import db from '../db.js';
import { esc, brl, dataBR, nomeComp, aviso, modal, confirmar, hojeISO } from '../util.js';
import { S, nomeCliente } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { TIPOS_PEDIDO, ST_PEDIDO, GUIAS } from './portal.js';
import { TIPOS } from '../reconhecer.js';

let aba = 'pedidos';
const PUBLICAVEIS = [...GUIAS, 'holerites', 'liquidos', 'folha_resumo', 'folha_extrato', 'recibo_dctfweb', 'ferias_programacao'];

export default async function portalEquipe(el, _r, vivo) {
  const [peds, acessos, docs] = await Promise.all([db.listar('solicitacoes').catch(() => []), db.listar('portal_acessos').catch(() => []), db.documentos({})]);
  if (!vivo()) return;
  const daEmp = (id) => !S.empresa || id === S.empresa;
  const P = peds.filter((p) => daEmp(p.cliente_id)).sort((a, b) => (a.status === 'nova' ? 0 : 1) - (b.status === 'nova' ? 0 : 1) || b.criado_em.localeCompare(a.criado_em));
  const enviados = docs.filter((d) => d.origem === 'cliente' && daEmp(d.cliente_id));
  const pub = docs.filter((d) => d.visivel_cliente && daEmp(d.cliente_id));
  const naoPub = docs.filter((d) => !d.visivel_cliente && d.origem !== 'cliente' && PUBLICAVEIS.includes(d.tipo) && d.cliente_id && daEmp(d.cliente_id));
  topo('Portal do cliente', 'Pedidos e arquivos que os clientes mandam, e o que o escritório publica para eles');
  const nNovos = P.filter((p) => p.status === 'nova').length;
  const abas = [['pedidos', `Pedidos${nNovos ? ` (${nNovos} novo${nNovos > 1 ? 's' : ''})` : ''}`], ['recebidos', 'Arquivos recebidos'], ['publicados', 'Publicados (protocolo)'], ['acessos', 'Acessos']];
  const seg = `<div class="seg" role="group">${abas.map(([k, t]) => `<button data-sub="${k}" aria-pressed="${aba === k}">${t}</button>`).join('')}</div>`;
  let corpo = '';
  if (aba === 'pedidos') corpo = `<div class="card">${P.length ? `<div class="tw"><table class="t"><thead><tr><th>Pedido</th><th>Empresa</th><th>Recebido</th><th>Situação</th><th></th></tr></thead><tbody>${P.map((p) => `<tr><td><b>${esc(TIPOS_PEDIDO[p.tipo] || p.tipo)}</b><div class="small muted">${esc(p.titulo || '')}</div></td><td>${esc(nomeCliente(p.cliente_id))}</td><td>${dataBR(p.criado_em)}</td><td><span class="pill ${ST_PEDIDO[p.status][1]}">${ST_PEDIDO[p.status][0]}</span></td><td><button class="btn ${p.status === 'nova' ? '' : 'sec'} mini" data-ped="${p.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio"><b>Nenhum pedido</b>Quando um cliente pedir admissão, férias, desligamento etc. pelo portal, aparece aqui.</div>'}</div>`;
  if (aba === 'recebidos') corpo = `<div class="card">${enviados.length ? `<div class="tw"><table class="t"><thead><tr><th>Arquivo</th><th>Empresa</th><th>Assunto</th><th>Mês</th><th>Recebido</th><th></th></tr></thead><tbody>${enviados.map((d) => `<tr data-id="${d.id}"><td style="word-break:break-all">${esc(d.nome_arquivo)}${d.dados?.obs ? `<div class="small muted">${esc(d.dados.obs)}</div>` : ''}</td><td>${esc(nomeCliente(d.cliente_id))}</td><td>${esc(d.dados?.titulo || '')}</td><td>${d.competencia ? nomeComp(d.competencia, true) : ''}</td><td>${dataBR(d.enviado_em)}</td><td><button class="btn sec mini" data-abre>Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum arquivo recebido pelo portal.</div>'}</div>`;
  if (aba === 'publicados') corpo = `${naoPub.length ? `<div class="card"><div class="card-h"><h2>Prontos para publicar (${naoPub.length})</h2><button class="btn mini" id="pubTudo">Publicar todos</button></div><div class="tw"><table class="t"><tbody>${naoPub.slice(0, 100).map((d) => `<tr data-id="${d.id}"><td>${esc(TIPOS[d.tipo]?.[0] || d.tipo)}<div class="small muted" style="word-break:break-all">${esc(d.nome_arquivo)}</div></td><td>${esc(nomeCliente(d.cliente_id))}</td><td>${d.competencia ? nomeComp(d.competencia, true) : ''}</td><td class="num">${d.dados?.valor ? brl(d.dados.valor) : ''}</td><td><button class="btn sec mini" data-pub>Publicar</button></td></tr>`).join('')}</tbody></table></div><p class="small muted" style="padding:8px 18px">Guias, holerites e relatórios importados. Publicado, o cliente vê no portal.</p></div>` : ''}
    <div class="card"><div class="card-h"><h2>Publicados para o cliente</h2></div>${pub.length ? `<div class="tw"><table class="t"><thead><tr><th>Documento</th><th>Empresa</th><th>Mês</th><th>Valor</th><th>Protocolo</th><th></th></tr></thead><tbody>${pub.sort((a, b) => (b.competencia || '').localeCompare(a.competencia || '')).map((d) => `<tr data-id="${d.id}"><td>${esc(TIPOS[d.tipo]?.[0] || d.dados?.titulo || d.tipo)}<div class="small muted" style="word-break:break-all">${esc(d.nome_arquivo)}</div></td><td>${esc(nomeCliente(d.cliente_id))}</td><td>${d.competencia ? nomeComp(d.competencia, true) : ''}</td><td class="num">${d.dados?.valor ? brl(d.dados.valor) : ''}</td>
      <td>${d.pago_em ? `<span class="pill p-ok">Pago ${dataBR(d.pago_em)}</span>` : d.visto_em ? `<span class="pill p-na">Aberto ${dataBR(d.visto_em)}</span>` : '<span class="pill p-at">Não aberto</span>'}</td><td><button class="btn sec mini" data-despub>Tirar do portal</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nada publicado ainda.</div>'}</div>`;
  if (aba === 'acessos') corpo = `<div class="card"><div class="card-h"><h2>Quem acessa o portal</h2><button class="btn mini" id="aNovo">+ Acesso</button></div>${acessos.length ? `<div class="tw"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Empresa</th><th>Situação</th><th></th></tr></thead><tbody>${acessos.filter((a) => daEmp(a.cliente_id)).map((a) => `<tr><td>${esc(a.nome || '')}</td><td>${esc(a.email)}</td><td>${esc(nomeCliente(a.cliente_id))}</td><td>${a.ativo === false ? '<span class="pill p-na">Bloqueado</span>' : db.demo || a.usuario_id ? '<span class="pill p-ok">Ativo</span>' : '<span class="pill p-at">Falta criar o usuário</span>'}</td><td><button class="btn sec mini" data-ac="${a.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum acesso cadastrado.</div>'}
    <div class="card-b small muted" style="border-top:1px solid var(--line)">${db.demo ? 'Demonstração: cadastre um acesso, clique em Sair e entre com o e-mail cadastrado para ver o portal como o cliente.' : '<b>Depois de cadastrar aqui</b>, crie o usuário no Supabase: Authentication → Users → Add user, com o mesmo e-mail e uma senha (marque "Auto Confirm User"). Passe a senha ao cliente. Esse e-mail nunca vira usuário da equipe.'}</div></div>`;
  el.innerHTML = `<div class="card"><div class="card-b">${seg}</div></div>${corpo}`;

  el.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.sub; portalEquipe(el, _r, vivo); }));
  el.querySelectorAll('[data-ped]').forEach((b) => b.addEventListener('click', async () => { if (await abrirPedido(peds.find((p) => p.id === b.dataset.ped))) recarregarTela(); }));
  el.querySelector('#aNovo')?.addEventListener('click', async () => { if (await formAcesso({ cliente_id: S.empresa })) recarregarTela(); });
  el.querySelectorAll('[data-ac]').forEach((b) => b.addEventListener('click', async () => { if (await formAcesso(acessos.find((a) => a.id === b.dataset.ac))) recarregarTela(); }));
  el.querySelector('#pubTudo')?.addEventListener('click', async () => { for (const d of naoPub) await db.atualizarDocumento(d.id, { visivel_cliente: true }); aviso(`${naoPub.length} documento(s) publicados.`); recarregarTela(); });
  el.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return; const d = docs.find((x) => x.id === tr.dataset.id);
    try {
      if (e.target.closest('[data-abre]')) { const w = window.open('', '_blank'); const u = await db.abrirDocumento(d); if (w) w.location = u; }
      if (e.target.closest('[data-pub]')) { await db.atualizarDocumento(d.id, { visivel_cliente: true }); aviso('Publicado.'); recarregarTela(); }
      if (e.target.closest('[data-despub]')) { await db.atualizarDocumento(d.id, { visivel_cliente: false }); aviso('Retirado do portal.'); recarregarTela(); }
    } catch (er) { aviso(er.message, 'erro'); }
  });
}

// ---------- abrir e responder um pedido ----------
const ROTULOS = { nome: 'Nome', cpf: 'CPF', inicio: 'Início', cargo: 'Cargo', salario: 'Salário', horario: 'Horário', experiencia: 'Experiência', vt: 'Vale-transporte', aso: 'Exame admissional feito', funcionario_nome: 'Colaborador', tipo_rescisao: 'Tipo', aviso: 'Aviso prévio', ultimo_dia: 'Último dia', motivo: 'Motivo', dias: 'Dias', abono: 'Abono (vender 10 dias)', texto: 'Mensagem', assunto: 'Assunto' };
function abrirPedido(p) {
  const x = p.dados || {};
  const linhas = Object.entries(x).filter(([k, v]) => ROTULOS[k] && v).map(([k, v]) => `<tr><td class="muted">${ROTULOS[k]}</td><td><b>${esc(k === 'salario' ? brl(v) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? dataBR(v) : v)}</b></td></tr>`).join('');
  const movTipo = { admissao: 'admissao', rescisao: 'rescisao', afastamento: 'afastamento', alteracao: 'alteracao', ferias: 'ferias' }[p.tipo];
  return modal(`${TIPOS_PEDIDO[p.tipo]} · ${nomeCliente(p.cliente_id)}`, `<table class="t"><tbody>${linhas}</tbody></table>
    ${x.anexos?.length ? `<p class="small" style="margin:10px 0 4px"><b>Anexos:</b> ${x.anexos.map((a) => `<button class="btn sec mini" data-anexo="${a.id}">${esc(a.nome)}</button>`).join(' ')}</p>` : ''}
    <form class="form" id="fResp" style="margin-top:12px"><label class="f">Situação<select name="status">${Object.entries(ST_PEDIDO).map(([k, [t]]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${movTipo && p.status === 'nova' ? '<label class="chk" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="mov" checked> Criar a movimentação no DP (com checklist e prazo)</label>' : ''}
    <label class="f full">Resposta para o cliente<textarea name="resposta" rows="3">${esc(p.resposta || '')}</textarea></label>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" data-fecha>Fechar</button><button class="btn">Salvar</button></div></form>`, { largura: 640, aoAbrir: (m, fechar) => {
    m.querySelectorAll('[data-anexo]').forEach((b) => b.addEventListener('click', async () => { const w = window.open('', '_blank'); try { const d = await db.documento(b.dataset.anexo); const u = await db.abrirDocumento(d); if (w) w.location = u; } catch (er) { w?.close(); aviso(er.message, 'erro'); } }));
    m.querySelector('#fResp').addEventListener('submit', async (e) => {
      e.preventDefault(); const fm = e.target;
      try {
        let status = fm.status.value;
        if (fm.mov?.checked) {
          const data = x.inicio || x.ultimo_dia || hojeISO();
          const prazo = movTipo === 'rescisao' ? (() => { const d = new Date(data + 'T12:00:00'); d.setDate(d.getDate() + 10); return d.toLocaleDateString('sv-SE'); })() : movTipo === 'admissao' || movTipo === 'ferias' ? (() => { const d = new Date(data + 'T12:00:00'); d.setDate(d.getDate() - (movTipo === 'ferias' ? 30 : 1)); return d.toLocaleDateString('sv-SE'); })() : data;
          await db.salvarMovimentacao({ cliente_id: p.cliente_id, tipo: movTipo, nome: x.nome || x.funcionario_nome || p.titulo || TIPOS_PEDIDO[p.tipo], funcionario_id: x.funcionario_id || null, data_evento: data, prazo, observacao: `Pedido do portal em ${dataBR(p.criado_em)}`, detalhe: { ...x, origem: 'portal', solicitacao_id: p.id, tipo_rescisao: x.tipo_rescisao, aviso: x.aviso } });
          if (status === 'nova') status = 'andamento';
        }
        await db.alterar('solicitacoes', p.id, { status, resposta: fm.resposta.value || null });
        aviso('Pedido atualizado.'); fechar(true);
      } catch (er) { aviso(er.message, 'erro'); }
    });
  } });
}

// ---------- acesso ao portal ----------
function formAcesso(a) {
  const emps = S.clientes.filter((c) => c.ativo).sort((x, y) => (x.nome_fantasia || x.razao_social).localeCompare(y.nome_fantasia || y.razao_social, 'pt'));
  return modal(a.id ? 'Editar acesso' : 'Novo acesso ao portal', `<form class="form" id="fAc">
    <label class="f full">Empresa<select name="cliente_id" required><option value="">— escolha —</option>${emps.map((c) => `<option value="${c.id}" ${a.cliente_id === c.id ? 'selected' : ''}>${esc(c.nome_fantasia || c.razao_social)}</option>`).join('')}</select></label>
    <label class="f">Nome da pessoa<input name="nome" value="${esc(a.nome || '')}"></label><label class="f">E-mail<input type="email" name="email" value="${esc(a.email || '')}" required></label>
    <label class="chk full"><input type="checkbox" name="ativo" ${a.ativo === false ? '' : 'checked'}> Acesso liberado</label>
    <div class="acoes full" style="margin-top:0">${a.id ? '<button type="button" class="btn sec" id="acApaga" style="color:var(--bad);margin-right:auto">Excluir</button>' : ''}<button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { aoAbrir: (m, fechar) => {
    m.querySelector('#fAc').addEventListener('submit', async (e) => {
      e.preventDefault(); const fm = e.target; const x = { cliente_id: fm.cliente_id.value, nome: fm.nome.value || null, email: fm.email.value.trim().toLowerCase(), ativo: fm.ativo.checked };
      if (S.perfis.some((p) => (p.email || '').toLowerCase() === x.email)) { aviso('Este e-mail é de alguém da equipe. Use outro e-mail para o cliente.', 'erro'); return; }
      try { if (a.id) await db.alterar('portal_acessos', a.id, x); else await db.inserir('portal_acessos', x); aviso('Acesso salvo.'); fechar(true); } catch (er) { aviso(/duplicate|unique/i.test(er.message) ? 'Este e-mail já tem acesso.' : er.message, 'erro'); }
    });
    m.querySelector('#acApaga')?.addEventListener('click', async () => { if (await confirmar('Excluir acesso', 'O cliente deixa de entrar no portal. Continuar?', 'Excluir')) { await db.apagar('portal_acessos', a.id); fechar(true); } });
  } });
}
