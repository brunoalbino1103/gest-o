// Portal do cliente: o que o cliente da empresa vê ao entrar (só os dados da empresa dele).
// Ele envia documentos, faz pedidos ao DP e baixa as guias e holerites que o escritório publicou.
import { ico } from '../icones.js';
import db from '../db.js';
import { NOME_ESCRITORIO } from '../config.js';
import { $, esc, brl, dataBR, nomeComp, compPadrao, hojeISO, diasAte, aviso, tamanho } from '../util.js';
import { TIPOS_RESCISAO, AVISOS } from '../calculos.js';
import { baixarFicha } from '../ficha-modelo.js';

export const TIPOS_PEDIDO = { admissao: 'Admissão', rescisao: 'Desligamento', ferias: 'Férias', alteracao: 'Alteração (salário, cargo, horário)', afastamento: 'Atestado / afastamento', outro: 'Outro assunto' };
export const ST_PEDIDO = { nova: ['Recebido', 'p-at'], andamento: ['Em andamento', 'p-at'], concluida: ['Concluído', 'p-ok'], recusada: ['Não aprovado', 'p-bad'] };
export const GUIAS = ['guia_fgts', 'guia_darf_dp', 'guia_sindical', 'guia_das', 'guia_darf_fiscal'];
const CATEGORIAS = { ponto: ['Cartão de ponto / horas', 'dp'], atestado: ['Atestados e documentos de colaboradores', 'dp'], notas: ['Notas fiscais', 'fiscal'], extratos: ['Extratos bancários', 'contabil'], outros: ['Outros', 'dp'] };
const NOME_TIPO = { guia_fgts: 'Guia do FGTS', guia_darf_dp: 'DARF INSS/IRRF', guia_sindical: 'Contribuição sindical', guia_das: 'DAS (Simples)', guia_darf_fiscal: 'DARF', holerites: 'Holerites', liquidos: 'Relação de líquidos', folha_resumo: 'Resumo da folha', folha_extrato: 'Folha de pagamento', recibo_dctfweb: 'Recibo da DCTFWeb', ferias_programacao: 'Programação de férias' };

let aba = 'inicio';
export async function telaPortal(acesso) {
  const [clis, funcs] = await Promise.all([db.clientes(), db.funcionarios({ cliente_id: acesso.cliente_id }).catch(() => [])]);
  const emp = clis.find((c) => c.id === acesso.cliente_id) || { razao_social: 'Sua empresa' };
  const ativos = funcs.filter((f) => f.situacao !== 'desligado' && !f.contribuinte);
  const nomeE = emp.nome_fantasia || emp.razao_social;
  document.title = 'Portal · ' + nomeE;
  const desenhar = async () => {
    const [docs, peds] = await Promise.all([db.documentos({ cliente_id: acesso.cliente_id }), db.listar('solicitacoes', { cliente_id: acesso.cliente_id }).catch(() => [])]);
    const meus = docs.filter((d) => d.origem === 'cliente'), pub = docs.filter((d) => d.visivel_cliente);
    const aPagar = pub.filter((d) => GUIAS.includes(d.tipo) && !d.pago_em), novos = pub.filter((d) => !d.visto_em);
    const abertos = peds.filter((p) => p.status === 'nova' || p.status === 'andamento');
    const abas = [['inicio', 'Início', 'inicio'], ['documentos', `Do escritório${novos.length ? ` <span class="nb red">${novos.length}</span>` : ''}`, 'pasta'], ['enviar', 'Enviar arquivos', 'importar'], ['pedidos', 'Pedidos ao DP', 'nota']];
    $('#raiz').innerHTML = `<div class="app portal" style="--c:#7A4FD6;--ct:#F3EEFC">
      <header class="topo">
        <span class="topo-marca"><span class="dot-dep">${ico('empresa')}</span><span><b>${esc(nomeE)}</b><small>Portal do cliente · ${esc(NOME_ESCRITORIO)}</small></span></span>
        <span class="topo-quem">${db.demo ? '<span class="demo-tag">Demonstração</span>' : ''}<span>${esc(acesso.nome || acesso.email)}</span></span>
        <button class="topo-sair" id="sair" title="Sair" aria-label="Sair">${ico('sair')}</button>
      </header>
      <nav class="abas-linha" aria-label="Portal">${abas.map(([k, t, ic]) => `<button class="${aba === k ? 'on' : ''}" data-p="${k}">${ico(ic)}<span>${t}</span></button>`).join('')}</nav>
      <div class="conteudo"><main id="conteudo" style="display:flex;flex-direction:column;gap:16px"></main></div></div>`;
    $('#sair').addEventListener('click', async () => { await db.sair(); location.hash = ''; location.reload(); });
    document.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.p; desenhar(); }));
    const el = $('#conteudo');
    const abrir = async (d) => { const w = window.open('', '_blank'); try { const u = await db.abrirDocumento(d); await db.portalMarcar(d.id, 'visto').catch(() => {}); if (w) w.location = u; else location.href = u; } catch (er) { w?.close(); aviso(er.message, 'erro'); } };
    const linhaDoc = (d) => { const g = GUIAS.includes(d.tipo); const v = d.dados?.vencimento; const venc = v && !d.pago_em ? diasAte(v) : null;
      return `<tr data-id="${d.id}"><td><b>${esc(NOME_TIPO[d.tipo] || d.dados?.titulo || 'Documento')}</b><div class="small muted" style="word-break:break-all">${esc(d.nome_arquivo)}</div></td><td>${d.competencia ? nomeComp(d.competencia, true) : ''}</td>
        <td class="num">${g && d.dados?.valor ? brl(d.dados.valor) : ''}${v ? `<div class="small ${venc != null && venc < 0 ? '' : 'muted'}" style="${venc != null && venc < 0 ? 'color:var(--bad)' : ''}">vence ${dataBR(v)}</div>` : ''}</td>
        <td>${d.pago_em ? `<span class="pill p-ok">Pago ${dataBR(d.pago_em)}</span>` : d.visto_em ? `<span class="pill p-na">Aberto ${dataBR(d.visto_em)}</span>` : '<span class="pill p-at">Novo</span>'}</td>
        <td style="white-space:nowrap"><button class="btn sec mini" data-abre>Abrir</button>${g && !d.pago_em ? ' <button class="btn mini" data-pago>Já paguei</button>' : ''}</td></tr>`; };
    const tabelaDocs = (L, vazio) => L.length ? `<div class="tw"><table class="t"><thead><tr><th>Documento</th><th>Mês</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${L.map(linhaDoc).join('')}</tbody></table></div>` : `<div class="vazio">${vazio}</div>`;
    const kpi = (cls, l, v, s) => `<div class="kpi ${cls}"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;

    if (aba === 'inicio') {
      el.innerHTML = `<div class="grid g4">${kpi(aPagar.some((d) => d.dados?.vencimento && diasAte(d.dados.vencimento) < 0) ? 'bad' : aPagar.length ? 'at' : 'ok', 'Guias a pagar', aPagar.length, aPagar.length ? 'total ' + brl(aPagar.reduce((s, d) => s + (+d.dados?.valor || 0), 0)) : 'nada pendente')}
        ${kpi(novos.length ? 'at' : 'ok', 'Documentos novos', novos.length, 'publicados pelo escritório')}${kpi('', 'Pedidos em aberto', abertos.length, 'admissões, férias, desligamentos')}${kpi('', 'Colaboradores', ativos.length, 'ativos')}</div>
        <div class="card"><div class="card-h"><h2>Guias a pagar</h2></div>${tabelaDocs(aPagar.sort((a, b) => (a.dados?.vencimento || '9').localeCompare(b.dados?.vencimento || '9')), 'Nenhuma guia pendente.')}</div>
        <div class="card"><div class="card-h"><h2>Pedir ao Departamento Pessoal</h2></div><div class="card-b" style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(TIPOS_PEDIDO).map(([k, t]) => `<button class="btn sec" data-novo="${k}">${t}</button>`).join('')}</div></div>`;
    }
    if (aba === 'documentos') {
      const porComp = {}; pub.forEach((d) => (porComp[d.competencia || ''] ||= []).push(d));
      el.innerHTML = Object.keys(porComp).sort().reverse().map((c) => `<div class="card"><div class="card-h"><h2>${c ? nomeComp(c) : 'Sem mês'}</h2></div>${tabelaDocs(porComp[c], '')}</div>`).join('') || '<div class="card"><div class="vazio"><b>Nenhum documento ainda</b>Quando o escritório publicar guias, holerites e relatórios, eles aparecem aqui.</div></div>';
    }
    if (aba === 'enviar') {
      el.innerHTML = `<div class="card"><div class="card-h"><h2>Enviar arquivos para o escritório</h2></div><div class="card-b"><form class="form" id="fEnv">
          <label class="f">Assunto<select name="cat">${Object.entries(CATEGORIAS).map(([k, [t]]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
          <label class="f">Mês de referência<input type="month" name="comp" value="${compPadrao()}" required></label>
          <label class="f full">Arquivos<input type="file" name="arqs" multiple required></label>
          <label class="f full">Observação (opcional)<input name="obs" placeholder="Ex.: atestado da Maria, dias 03 e 04"></label>
          <div class="acoes full" style="margin-top:0"><button class="btn">Enviar</button></div></form></div></div>
        <div class="card"><div class="card-h"><h2>Arquivos que você enviou</h2></div>${meus.length ? `<div class="tw"><table class="t"><thead><tr><th>Arquivo</th><th>Assunto</th><th>Mês</th><th>Enviado em</th></tr></thead><tbody>${meus.map((d) => `<tr><td style="word-break:break-all">${esc(d.nome_arquivo)}<div class="small muted">${tamanho(d.tamanho || 0)}${d.dados?.obs ? ' · ' + esc(d.dados.obs) : ''}</div></td><td>${esc(CATEGORIAS[d.dados?.categoria]?.[0] || '')}</td><td>${d.competencia ? nomeComp(d.competencia, true) : ''}</td><td>${dataBR(d.enviado_em)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nada enviado ainda.</div>'}</div>`;
      el.querySelector('#fEnv').addEventListener('submit', async (e) => {
        e.preventDefault(); const fm = e.target; const b = fm.querySelector('.btn'); const [titulo, dep] = CATEGORIAS[fm.cat.value]; b.disabled = true;
        try {
          for (const arq of fm.arqs.files) { b.textContent = 'Enviando ' + arq.name + '…'; await db.enviarDocumento(arq, { cliente_id: acesso.cliente_id, departamento: dep, competencia: fm.comp.value, tipo: 'outro', origem: 'cliente', dados: { categoria: fm.cat.value, titulo, obs: fm.obs.value || null } }); }
          aviso('Arquivos enviados. O escritório já pode ver.'); desenhar();
        } catch (er) { aviso(er.message, 'erro'); b.disabled = false; b.textContent = 'Enviar'; }
      });
    }
    if (aba === 'pedidos') {
      el.innerHTML = `<div class="card"><div class="card-h"><h2>Novo pedido</h2><button class="btn sec mini" id="pFicha">${ico('baixar')}Ficha de admissão para preencher</button></div><div class="card-b" style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(TIPOS_PEDIDO).map(([k, t]) => `<button class="btn sec" data-novo="${k}">${t}</button>`).join('')}</div></div>
        <div class="card"><div class="card-h"><h2>Seus pedidos</h2></div>${peds.length ? `<div class="tw"><table class="t"><thead><tr><th>Pedido</th><th>Feito em</th><th>Situação</th><th>Resposta do escritório</th></tr></thead><tbody>${peds.sort((a, b) => b.criado_em.localeCompare(a.criado_em)).map((p) => `<tr><td><b>${esc(TIPOS_PEDIDO[p.tipo] || p.tipo)}</b><div class="small muted">${esc(p.titulo || '')}</div></td><td>${dataBR(p.criado_em)}</td><td><span class="pill ${ST_PEDIDO[p.status][1]}">${ST_PEDIDO[p.status][0]}</span></td><td class="small">${esc(p.resposta || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nenhum pedido feito.</div>'}</div>`;
      el.querySelector('#pFicha').addEventListener('click', () => baixarFicha(emp));
    }
    el.addEventListener('click', async (e) => {
      const nv = e.target.closest('[data-novo]'); if (nv) { if (await novoPedido(nv.dataset.novo, acesso, ativos)) { aba = 'pedidos'; desenhar(); } return; }
      const tr = e.target.closest('tr[data-id]'); if (!tr) return; const d = docs.find((x) => x.id === tr.dataset.id);
      if (e.target.closest('[data-abre]')) { await abrir(d); setTimeout(desenhar, 600); }
      if (e.target.closest('[data-pago]')) { await db.portalMarcar(d.id, 'pago'); aviso('Obrigado! Marcado como pago.'); desenhar(); }
    });
  };
  await desenhar();
}

// ---------- formulário de pedido ----------
async function novoPedido(tipo, acesso, ativos) {
  const { modal } = await import('../util.js');
  const selF = `<label class="f full">Colaborador<select name="funcionario_id" required><option value="">— escolha —</option>${ativos.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></label>`;
  const campos = {
    admissao: `<label class="f full">Nome completo<input name="nome" required></label><label class="f">CPF<input name="cpf" inputmode="numeric"></label><label class="f">Data de início<input type="date" name="inicio" required></label>
      <label class="f">Cargo / função<input name="cargo" required></label><label class="f">Salário (R$)<input type="number" step="0.01" name="salario" required></label>
      <label class="f">Horário de trabalho<input name="horario" placeholder="Ex.: seg a sex 8h–18h, sáb 8h–12h"></label><label class="f">Contrato de experiência<select name="experiencia"><option>45 + 45 dias</option><option>30 + 60 dias</option><option>90 dias</option><option>Sem experiência</option></select></label>
      <label class="f">Vale-transporte<select name="vt"><option>Sim</option><option>Não</option></select></label><label class="f">Exame admissional já feito?<select name="aso"><option>Não</option><option>Sim</option></select></label>
      <label class="f full">Documentos do colaborador (RG, CPF, CTPS, comprovante, ficha preenchida…)<input type="file" name="anexos" multiple></label>`,
    rescisao: `${selF}<label class="f">Tipo<select name="tipo_rescisao">${Object.entries(TIPOS_RESCISAO).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label><label class="f">Aviso prévio<select name="aviso">${Object.entries(AVISOS).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
      <label class="f">Último dia de trabalho<input type="date" name="ultimo_dia" required></label><label class="f full">Motivo / observações<textarea name="motivo" rows="3"></textarea></label><label class="f full">Carta de pedido de demissão / anexos<input type="file" name="anexos" multiple></label>`,
    ferias: `${selF}<label class="f">Início das férias<input type="date" name="inicio" required></label><label class="f">Dias<select name="dias"><option>30</option><option>20</option><option>15</option><option>10</option></select></label><label class="f">Vender 10 dias (abono)?<select name="abono"><option>Não</option><option>Sim</option></select></label>`,
    alteracao: `${selF}<label class="f">A partir de<input type="date" name="inicio" required></label><label class="f full">O que muda?<textarea name="texto" rows="3" required placeholder="Ex.: salário para R$ 2.300,00; novo horário 9h–18h"></textarea></label>`,
    afastamento: `${selF}<label class="f">Primeiro dia<input type="date" name="inicio" required></label><label class="f">Quantos dias<input type="number" name="dias" min="1" required></label><label class="f full">Atestado (arquivo)<input type="file" name="anexos" multiple></label><label class="f full">Observação<input name="texto"></label>`,
    outro: `<label class="f full">Assunto<input name="assunto" required></label><label class="f full">Mensagem<textarea name="texto" rows="4" required></textarea></label><label class="f full">Anexos<input type="file" name="anexos" multiple></label>`,
  }[tipo];
  return modal('Pedido · ' + TIPOS_PEDIDO[tipo], `<form class="form" id="fPed">${campos}<p class="full small muted">O escritório recebe o pedido na hora e responde por aqui.</p>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Enviar pedido</button></div></form>`, { largura: 680, aoAbrir: (m, fechar) => {
    m.querySelector('#fPed').addEventListener('submit', async (e) => {
      e.preventDefault(); const fm = e.target; const b = fm.querySelector('.btn:not(.sec)'); b.disabled = true;
      const x = Object.fromEntries([...new FormData(fm)].filter(([k]) => k !== 'anexos'));
      const f = ativos.find((a) => a.id === x.funcionario_id); if (f) x.funcionario_nome = f.nome;
      try {
        const anexos = [];
        for (const arq of fm.anexos?.files || []) { const d = await db.enviarDocumento(arq, { cliente_id: acesso.cliente_id, departamento: 'dp', competencia: hojeISO().slice(0, 7), tipo: 'outro', origem: 'cliente', dados: { categoria: 'pedido', titulo: TIPOS_PEDIDO[tipo] } }); anexos.push({ id: d.id, nome: arq.name }); }
        const titulo = x.nome || x.funcionario_nome || x.assunto || '';
        await db.inserir('solicitacoes', { cliente_id: acesso.cliente_id, tipo, titulo, dados: { ...x, anexos }, status: 'nova', criado_em: new Date().toISOString() });
        aviso('Pedido enviado ao escritório.'); fechar(true);
      } catch (er) { aviso(er.message, 'erro'); b.disabled = false; }
    });
  } });
}
