// Ficha do cliente: tudo de um cliente em um lugar (tarefas do mês, documentos, notas, dados e histórico).
import db from '../db.js';
import { esc, DEPS, REGIMES, TIPOS_DOC, nomeComp, somaMes,fmtCNPJ, iniciais, dataBR, tamanho, brl, num, situacao, SIT, aviso, confirmar } from '../util.js';
import { S, cliente as achaCliente, nomePerfil, eAdmin, recarregarClientes, tarefasDa, limparCacheTarefas } from '../estado.js';
import { topo, irPara } from '../app.js';
import { abrirTarefa, prazoTxt, rotStatus, clsStatus } from './comum.js';
import { formCliente } from './clientes.js';
import { areaImportacao } from './importacao.js';
import { editarDocumento, resumoDados } from './documentos.js';

let aba = 'mes';

export default async function fichaCliente(el, [id], vivo) {
  const c = achaCliente(id); if (!c) { el.innerHTML = '<div class="card"><div class="vazio"><b>Cliente não encontrado</b><a href="#/clientes">Voltar para a lista</a></div></div>'; return; }
  topo(c.nome_fantasia || c.razao_social, `<a href="#/clientes">Clientes</a> › ${esc(c.razao_social)}`);
  const T = (await tarefasDa(S.comp)).filter((t) => t.cliente_id === id); if (!vivo()) return;

  el.innerHTML = `<div class="card">
    <div class="card-b" style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <span class="av" style="width:48px;height:48px;font-size:16px;border-radius:12px">${esc(iniciais(c.nome_fantasia || c.razao_social))}</span>
      <div style="flex:1;min-width:220px;display:flex;flex-direction:column;gap:6px">
        <h2 style="font-size:19px">${esc(c.razao_social)}</h2>
        <div class="leg" style="font-size:13px;color:var(--ink-2)"><span class="num">${esc(fmtCNPJ(c.cnpj)) || 'sem CNPJ'}</span><span class="pill p-co">${REGIMES[c.regime]}</span>${c.tem_funcionarios ? '<span class="pill p-dp">Com funcionários</span>' : ''}${c.ativo ? '' : '<span class="pill p-na">Inativo</span>'}</div>
        <div class="small muted">${['fiscal', 'dp', 'contabil'].map((k) => `${DEPS[k].nome}: <b style="color:var(--ink-2);font-weight:500">${esc(nomePerfil(c['resp_' + k]))}</b>`).join(' · ')}</div>
      </div>
      <div style="display:flex;gap:8px"><button class="btn sec" id="fEdita">Editar</button>${eAdmin() ? '<button class="btn sec" id="fApaga" style="color:var(--bad)">Excluir</button>' : ''}</div>
    </div>
    <div class="grid g3" style="padding:0 18px 16px">${Object.entries(DEPS).map(([k, d]) => { const l = T.filter((t) => t.departamento === k); const s = situacao(l); const v = l.filter((t) => t.status !== 'nao_aplica'); return `<div class="cel-b c-${SIT[s].cls}" style="min-height:52px"><span class="shape s-${SIT[s].cls}">${SIT[s].ic}</span><span><b>${d.longo}</b><small>${SIT[s].rot}${v.length ? ` · ${v.filter((t) => t.status === 'concluida').length} de ${v.length}` : ''}</small></span></div>`; }).join('')}</div>
    <div class="tabs" role="tablist">${[['mes', 'Tarefas de ' + nomeComp(S.comp, true)], ['docs', 'Documentos'], ['notas', 'Notas fiscais'], ['dados', 'Dados cadastrais'], ['hist', 'Histórico']].map(([k, t]) => `<button role="tab" data-aba="${k}" aria-selected="${aba === k}">${t}</button>`).join('')}</div>
    <div id="fAba"></div></div>`;
  const $c = (s) => el.querySelector(s);

  const abas = {
    mes() {
      if (!T.length) return `<div class="vazio"><b>Sem tarefas em ${nomeComp(S.comp)}</b>${S.clientes.length ? 'Gere as tarefas do mês na Visão geral ou confira as obrigações em Configurações.' : ''}</div>`;
      return `<div class="grid g3" style="padding:16px 18px;align-items:start">${Object.entries(DEPS).map(([k, d]) => { const l = T.filter((t) => t.departamento === k); return `<div class="card" style="border-top:3px solid ${d.cor}"><div class="card-h" style="padding:10px 14px"><h2 style="font-size:14px">${d.longo}</h2><span class="small muted">${l.length} tarefa(s)</span></div><div class="lista">${l.map((t) => `<button class="item" data-tarefa="${t.id}" style="padding:10px 14px"><div style="flex:1;min-width:0"><b>${esc(t.titulo)}</b><small>${esc(prazoTxt(t))}${t.responsavel ? ' · ' + esc(nomePerfil(t.responsavel)) : ''}</small>${t.observacao ? `<small style="color:var(--ink-2)">“${esc(t.observacao)}”</small>` : ''}</div><span class="pill ${clsStatus(t)}">${rotStatus(t)}</span></button>`).join('') || '<div class="vazio small" style="padding:18px">Nada neste mês.</div>'}</div></div>`; }).join('')}</div>`;
    },
    async docs() {
      setTimeout(async () => {
        const area = $c('#fImp'); if (!area) return;
        areaImportacao(area, { cliente: c, aoTerminar: () => listaDocs() });
        listaDocs();
      });
      return `<div class="card-b"><div id="fImp"></div></div><div id="fDocs"><div class="carregando">Carregando…</div></div>`;
    },
    async notas() {
      const N = await db.notas({ cliente_id: id });
      const ab = `<a class="btn" href="fiscal.html?cliente=${id}">Abrir o Painel Fiscal deste cliente</a>`;
      if (!N.length) return `<div class="vazio"><b>Nenhuma nota importada ainda</b><p style="margin:6px 0 14px">Importe os XML na aba Documentos e o Painel Fiscal se monta sozinho.</p>${ab}</div>`;
      const mes = N.filter((n) => String(n.data || '').startsWith(S.comp) && !n.cancelada), soma = (l) => l.reduce((a, n) => a + (+n.valor_nf || 0), 0);
      const vend = mes.filter((n) => n.categoria === 'Venda'), dev = mes.filter((n) => n.categoria === 'Devolução');
      // faturamento dos 12 meses anteriores (base do RBT12 do Simples)
      const ini = somaMes(S.comp, -12), rbt = N.filter((n) => !n.cancelada && n.competencia >= ini && n.competencia < S.comp);
      const rbt12 = soma(rbt.filter((n) => n.categoria === 'Venda')) - soma(rbt.filter((n) => n.categoria === 'Devolução'));
      const mesesCom = new Set(rbt.map((n) => n.competencia)).size;
      return `<div class="grid g4" style="padding:16px 18px">
        <div class="kpi"><span class="l">Vendas em ${nomeComp(S.comp, true)}</span><span class="v">${brl(soma(vend))}</span><span class="s">${num(vend.length)} nota(s)</span></div>
        <div class="kpi"><span class="l">Devoluções</span><span class="v">${brl(soma(dev))}</span><span class="s">${num(dev.length)} nota(s)</span></div>
        <div class="kpi"><span class="l">Líquido do mês</span><span class="v">${brl(soma(vend) - soma(dev))}</span><span class="s">vendas − devoluções, sem canceladas</span></div>
        <div class="kpi ${mesesCom < 12 ? 'at' : ''}"><span class="l">RBT12 (12 meses anteriores)</span><span class="v">${brl(rbt12)}</span><span class="s">${mesesCom < 12 ? `só ${mesesCom} de 12 meses com XML importado` : 'base para a alíquota do Simples'}</span></div></div>
        <div style="padding:0 18px 18px">${ab}</div>`;
    },
    dados() {
      const L = [['Razão social', c.razao_social], ['Nome fantasia', c.nome_fantasia], ['CNPJ / CPF', fmtCNPJ(c.cnpj)], ['Regime', REGIMES[c.regime]], ['Inscrição estadual', c.inscricao_estadual], ['Inscrição municipal', c.inscricao_municipal], ['E-mail principal', c.email], ['E-mail do DP', c.email_dp], ['E-mail financeiro', c.email_financeiro], ['Telefone', c.telefone], ['Tem funcionários', c.tem_funcionarios ? 'Sim' : 'Não'], ['Cadastrado em', dataBR(c.criado_em)], ['Observações', c.observacoes]];
      return `<div class="card-b"><div class="form">${L.map(([k, v]) => `<div class="${k === 'Observações' ? 'full' : ''}"><div class="small muted">${k}</div><div style="white-space:pre-wrap">${esc(v || '—')}</div></div>`).join('')}</div></div>`;
    },
    async hist() {
      const H = await db.historico({ cliente_id: id, limite: 100 });
      return H.length ? `<div class="lista">${H.map((h) => `<div class="item"><div><b>${esc(h.acao)}</b><span>${esc(h.detalhe || '')}</span><small>${new Date(h.em).toLocaleString('pt-BR')} · ${esc(nomePerfil(h.usuario))}</small></div></div>`).join('')}</div>` : '<div class="vazio">Nada registrado ainda.</div>';
    },
  };
  async function listaDocs() {
    const box = $c('#fDocs'); if (!box) return;
    const D = await db.documentos({ cliente_id: id }); if (!$c('#fDocs')) return;
    const porComp = {}; D.forEach((d) => { (porComp[d.competencia || 'sem'] ||= []).push(d); });
    box.innerHTML = D.length ? Object.keys(porComp).sort().reverse().map((k) => `<div style="padding:4px 18px 0" class="small muted"><b>${k === 'sem' ? 'Sem competência' : nomeComp(k)}</b> · ${porComp[k].length} arquivo(s)</div>
      <div class="tw"><table class="t"><tbody>${porComp[k].map((d) => `<tr data-id="${d.id}"><td style="width:45%"><button data-abre style="border:0;background:none;padding:0;color:var(--co-dk);text-align:left;word-break:break-all;font-weight:500">${esc(d.nome_arquivo)}</button><div class="small muted">${tamanho(d.tamanho || 0)}${d.dados?.tipo === 'nota' ? ' · ' + resumoDados(d.dados) : ''}</div></td><td>${d.departamento ? `<span class="pill p-${d.departamento}">${DEPS[d.departamento].nome}</span>` : ''}</td><td>${TIPOS_DOC[d.tipo] || esc(d.tipo)}</td><td class="small muted">${dataBR(d.enviado_em)} · ${esc(nomePerfil(d.enviado_por))}</td><td style="white-space:nowrap;text-align:right"><button class="btn sec mini" data-baixa>Baixar</button> <button class="btn sec mini" data-edita>Editar</button></td></tr>`).join('')}</tbody></table></div>`).join('')
      : '<div class="vazio">Nenhum documento deste cliente ainda.</div>';
    box.onclick = async (e) => {
      const tr = e.target.closest('[data-id]'); if (!tr) return; const d = D.find((x) => x.id === tr.dataset.id);
      try {
        if (e.target.closest('[data-abre]')) { const w = window.open('', '_blank'); const u = await db.abrirDocumento(d); if (w) w.location = u; else location.href = u; }
        if (e.target.closest('[data-baixa]')) { const u = await db.linkDocumento(d); const a = document.createElement('a'); a.href = u; a.download = d.nome_arquivo; a.click(); }
        if (e.target.closest('[data-edita]')) { if (await editarDocumento(d)) listaDocs(); }
      } catch (er) { aviso(er.message, 'erro'); }
    };
  }
  const mostra = async () => { $c('#fAba').innerHTML = '<div class="carregando">Carregando…</div>'; const h = await abas[aba](); if (vivo()) $c('#fAba').innerHTML = h; };
  await mostra();

  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { aba = b.dataset.aba; el.querySelectorAll('[data-aba]').forEach((x) => x.setAttribute('aria-selected', x === b)); mostra(); }));
  $c('#fAba').addEventListener('click', (e) => { const b = e.target.closest('.item[data-tarefa]'); if (b) { const t = T.find((x) => x.id === b.dataset.tarefa); abrirTarefa(b, t, () => fichaCliente(el, [id], vivo)); } });
  $c('#fEdita').addEventListener('click', async () => { if (await formCliente(c)) fichaCliente(el, [id], vivo); });
  $c('#fApaga')?.addEventListener('click', async () => {
    if (!(await confirmar('Excluir cliente', `Excluir ${c.razao_social}? Saem também as tarefas e as notas dele. Os arquivos ficam em Documentos como "Sem cliente". Prefira marcar como inativo se o cliente só saiu do escritório.`, 'Excluir cliente'))) return;
    try { await db.excluirCliente(id); await db.registrar('Excluiu cliente', c.razao_social); await recarregarClientes(); limparCacheTarefas(); aviso('Cliente excluído.'); irPara('#/clientes'); } catch (er) { aviso(er.message, 'erro'); }
  });
}
