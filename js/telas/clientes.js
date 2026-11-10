// Lista de clientes, cadastro e importação por planilha.
import db from '../db.js';
import { esc, REGIMES, fmtCNPJ, soDigitos, cnpjValido, semAcento, iniciais, aviso, modal, baixarArquivo, DEPS } from '../util.js';
import { S, recarregarClientes, nomePerfil, limparCacheTarefas } from '../estado.js';
import { topo, irPara } from '../app.js';
import { lerPlanilha, mapearColunas, linhasParaClientes } from '../leitor.js';

let busca = '', reg = '', sit = 'ativos';

export default async function clientes(el) {
  topo('Empresas (clientes)', `${S.clientes.filter((c) => c.ativo).length} ativos · ${S.clientes.length} no total`);
  el.innerHTML = `<div class="card">
    <div class="card-h"><div class="barra-f">
      <label class="sr" for="cBusca">Buscar</label><input type="search" id="cBusca" placeholder="Nome, fantasia ou CNPJ" value="${esc(busca)}">
      <label class="sr" for="cReg">Regime</label><select id="cReg"><option value="">Todos os regimes</option>${Object.entries(REGIMES).map(([k, v]) => `<option value="${k}" ${reg === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="Situação">${[['ativos', 'Ativos'], ['inativos', 'Inativos'], ['todos', 'Todos']].map(([k, t]) => `<button data-sit="${k}" aria-pressed="${sit === k}">${t}</button>`).join('')}</div>
     </div>
     <div class="barra-f"><button class="btn sec" id="cExp">Exportar</button><button class="btn sec" id="cImp">Importar planilha</button><button class="btn" id="cNovo">+ Novo cliente</button></div></div>
    <div class="tw"><table class="t"><thead><tr><th>Cliente</th><th>CNPJ / CPF</th><th>Regime</th><th>Funcionários</th><th>Responsáveis</th><th>E-mail</th></tr></thead><tbody id="cCorpo"></tbody></table></div>
  </div>`;
  const $c = (s) => el.querySelector(s);
  const corpo = () => {
    const q = semAcento(busca), qd = soDigitos(busca);
    const L = S.clientes.filter((c) => (sit === 'todos' || (sit === 'ativos') === !!c.ativo) && (!reg || c.regime === reg) && (!q || semAcento(c.razao_social + ' ' + (c.nome_fantasia || '')).includes(q) || (qd.length >= 3 && (c.cnpj || '').includes(qd))));
    $c('#cCorpo').innerHTML = L.map((c) => `<tr class="lk" data-id="${c.id}">
      <td><div class="co"><span class="av">${esc(iniciais(c.nome_fantasia || c.razao_social))}</span><div><b>${esc(c.razao_social)}</b><span>${esc(c.nome_fantasia || '')}${c.ativo ? '' : ' · <em>inativo</em>'}</span></div></div></td>
      <td class="num small">${esc(fmtCNPJ(c.cnpj)) || '<span class="muted">—</span>'}</td>
      <td><span class="pill p-co">${REGIMES[c.regime]}</span></td>
      <td>${c.tem_funcionarios ? 'Sim' : '<span class="muted">Não</span>'}</td>
      <td class="small">${['fiscal', 'dp', 'contabil'].map((k) => c['resp_' + k] ? `<span title="${DEPS[k].longo}">${DEPS[k].nome}: ${esc(nomePerfil(c['resp_' + k]))}</span>` : '').filter(Boolean).join('<br>') || '<span class="muted">—</span>'}</td>
      <td class="small">${esc(c.email || '')}</td></tr>`).join('')
      || `<tr><td colspan="6"><div class="vazio">${S.clientes.length ? 'Nenhum cliente com esse filtro.' : '<b>Nenhum cliente ainda</b>Clique em "Importar planilha" para trazer a lista do escritório de uma vez, ou cadastre um por um.'}</div></td></tr>`;
  };
  corpo();
  $c('#cBusca').addEventListener('input', (e) => { busca = e.target.value; corpo(); });
  $c('#cReg').addEventListener('change', (e) => { reg = e.target.value; corpo(); });
  el.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', () => { sit = b.dataset.sit; el.querySelectorAll('[data-sit]').forEach((x) => x.setAttribute('aria-pressed', x === b)); corpo(); }));
  $c('#cCorpo').addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) irPara('#/cadastros/empresa/' + r.dataset.id); });
  $c('#cNovo').addEventListener('click', async () => { const n = await formCliente(); if (n) irPara('#/cadastros/empresa/' + n.id); });
  $c('#cImp').addEventListener('click', async () => { if (await importarPlanilha()) clientes(el); });
  $c('#cExp').addEventListener('click', () => {
    const cab = ['Razão social', 'Nome fantasia', 'CNPJ', 'Regime', 'Inscrição estadual', 'Inscrição municipal', 'E-mail', 'E-mail DP', 'E-mail financeiro', 'Telefone', 'Funcionários', 'Ativo', 'Observações'];
    const l = S.clientes.map((c) => [c.razao_social, c.nome_fantasia, fmtCNPJ(c.cnpj), REGIMES[c.regime], c.inscricao_estadual, c.inscricao_municipal, c.email, c.email_dp, c.email_financeiro, c.telefone, c.tem_funcionarios ? 'Sim' : 'Não', c.ativo ? 'Sim' : 'Não', c.observacoes]);
    baixarArquivo('clientes.csv', '﻿' + [cab, ...l].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  });
}

// ---------- formulário de cliente (novo ou edição) ----------
export function formCliente(c = {}) {
  const v = (k) => esc(c[k] ?? '');
  const resp = (k) => `<select name="resp_${k}"><option value="">—</option>${S.perfis.filter((p) => p.ativo).map((p) => `<option value="${p.id}" ${c['resp_' + k] === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>`;
  return modal(c.id ? 'Editar cliente' : 'Novo cliente', `<form class="form" id="fCli" novalidate>
    <label class="f full">Razão social *<input name="razao_social" required value="${v('razao_social')}"></label>
    <label class="f">Nome fantasia<input name="nome_fantasia" value="${v('nome_fantasia')}"></label>
    <label class="f">CNPJ ou CPF<input name="cnpj" inputmode="numeric" value="${esc(fmtCNPJ(c.cnpj))}" placeholder="00.000.000/0000-00"></label>
    <label class="f">Regime *<select name="regime">${Object.entries(REGIMES).map(([k, t]) => `<option value="${k}" ${(c.regime || 'simples') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Telefone<input name="telefone" value="${v('telefone')}"></label>
    <label class="f">Inscrição estadual<input name="inscricao_estadual" value="${v('inscricao_estadual')}"></label>
    <label class="f">Inscrição municipal<input name="inscricao_municipal" value="${v('inscricao_municipal')}"></label>
    <label class="f">E-mail principal<input type="email" name="email" value="${v('email')}"></label>
    <label class="f">E-mail do DP / RH<input type="email" name="email_dp" value="${v('email_dp')}"></label>
    <label class="f">E-mail financeiro<input type="email" name="email_financeiro" value="${v('email_financeiro')}"></label>
    <label class="chk" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="tem_funcionarios" ${c.tem_funcionarios ? 'checked' : ''}> Tem funcionários (gera tarefas do DP)</label>
    <label class="f">Responsável Fiscal${resp('fiscal')}</label>
    <label class="f">Responsável Pessoal${resp('dp')}</label>
    <label class="f">Responsável Contábil${resp('contabil')}</label>
    <label class="chk" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="ativo" ${c.ativo !== false ? 'checked' : ''}> Cliente ativo</label>
    <label class="f full">Observações<textarea name="observacoes">${v('observacoes')}</textarea></label>
    <p class="full small" id="fErro" style="color:var(--bad)"></p>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div>
  </form>`, { largura: 720, aoAbrir: (m, fechar) => {
    const f = m.querySelector('#fCli');
    f.cnpj.addEventListener('blur', () => { f.cnpj.value = fmtCNPJ(f.cnpj.value); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const erro = m.querySelector('#fErro');
      const d = Object.fromEntries(new FormData(f)); d.tem_funcionarios = f.tem_funcionarios.checked; d.ativo = f.ativo.checked; d.cnpj = soDigitos(d.cnpj) || null;
      ['resp_fiscal', 'resp_dp', 'resp_contabil'].forEach((k) => { d[k] = d[k] || null; });
      if (!d.razao_social.trim()) { erro.textContent = 'Informe a razão social.'; return; }
      if (d.cnpj && !cnpjValido(d.cnpj)) { erro.textContent = 'CNPJ inválido: confira os números.'; return; }
      const b = f.querySelector('button:not([type])'); b.disabled = true;
      try {
        const n = await db.salvarCliente({ ...(c.id ? { id: c.id } : {}), ...d });
        await db.registrar(c.id ? 'Editou cliente' : 'Cadastrou cliente', n.razao_social, n.id);
        await recarregarClientes(); limparCacheTarefas(); aviso('Cliente salvo.'); fechar(n);
      } catch (er) { erro.textContent = er.message; b.disabled = false; }
    });
  } });
}

// ---------- importação de clientes por planilha ----------
export function importarPlanilha() {
  return modal('Importar clientes de planilha', `
    <p class="mt0 small" style="margin-bottom:12px">Envie um arquivo Excel (.xlsx) ou CSV com uma linha por cliente. O sistema reconhece as colunas pelo nome:
    <b>Razão social</b>, <b>CNPJ</b>, <b>Regime</b> (MEI, Simples, Presumido, Real), Nome fantasia, Inscrição estadual e municipal, E-mail, E-mail DP, E-mail financeiro, Telefone, Funcionários (Sim/Não) e Observações.
    Clientes com CNPJ que já existe são <b>atualizados</b>; os outros são criados.</p>
    <div class="drop" id="iDrop"><b>Arraste a planilha aqui</b><span class="small muted">ou</span><label class="btn sec">Escolher arquivo<input type="file" accept=".xlsx,.xls,.csv,.ods,.txt" hidden id="iArq"></label>
    <button type="button" class="btn sec mini" id="iModelo" style="margin-top:6px">Baixar planilha modelo</button></div>
    <div id="iPrev"></div>`, { largura: 860, aoAbrir: (m, fechar) => {
    const prev = m.querySelector('#iPrev'), drop = m.querySelector('#iDrop');
    m.querySelector('#iModelo').addEventListener('click', () => baixarArquivo('modelo_clientes.csv', '﻿' + 'Razão social;Nome fantasia;CNPJ;Regime;Inscrição estadual;Inscrição municipal;E-mail;E-mail DP;E-mail financeiro;Telefone;Funcionários;Observações\r\nEmpresa Exemplo Ltda;Exemplo;11.222.333/0001-81;Simples;;;contato@exemplo.com;;;(11) 99999-0000;Sim;\r\n'));
    const ler = async (arq) => {
      prev.innerHTML = '<div class="carregando">Lendo planilha…</div>';
      try {
        const linhas = await lerPlanilha(arq);
        let ic = linhas.findIndex((l) => l.some((x) => /raz[aã]o|cnpj|empresa|cliente|nome/i.test(String(x))));
        if (ic < 0) ic = 0;
        const cab = linhas[ic].map(String); const mapa = mapearColunas(cab);
        if (mapa.razao_social === undefined) { prev.innerHTML = '<p style="color:var(--bad);margin-top:12px">Não achei a coluna com o nome do cliente (Razão social). Confira o cabeçalho da planilha.</p>'; return; }
        const { clientes: L, erros } = linhasParaClientes(linhas.slice(ic + 1), mapa);
        const invalidos = L.filter((c) => c.cnpj && !cnpjValido(c.cnpj));
        const existe = new Set(S.clientes.map((c) => c.cnpj).filter(Boolean));
        const atualiza = L.filter((c) => c.cnpj && existe.has(c.cnpj)).length;
        prev.innerHTML = `<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
          <div class="leg" style="font-size:13px"><span class="pill p-ok">${L.length - atualiza} novos</span><span class="pill p-co">${atualiza} já existem (serão atualizados)</span>${invalidos.length ? `<span class="pill p-at">${invalidos.length} com CNPJ inválido</span>` : ''}${erros.length ? `<span class="pill p-bad">${erros.length} aviso(s)</span>` : ''}</div>
          <div class="small muted">Colunas reconhecidas: ${Object.keys(mapa).map((k) => `<b>${esc(cab[mapa[k]])}</b>`).join(', ')}</div>
          ${erros.length ? `<details><summary class="small">Ver avisos</summary><ul class="small">${erros.slice(0, 50).map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>` : ''}
          <div class="tw card" style="max-height:300px;overflow:auto"><table class="t"><thead><tr><th>Razão social</th><th>CNPJ</th><th>Regime</th><th>Func.</th><th>E-mail</th></tr></thead><tbody>
          ${L.slice(0, 300).map((c) => `<tr><td>${esc(c.razao_social)}</td><td class="num small" style="${c.cnpj && !cnpjValido(c.cnpj) ? 'color:var(--bad)' : ''}">${esc(fmtCNPJ(c.cnpj))}</td><td>${REGIMES[c.regime] || '<span class="muted">Simples</span>'}</td><td>${c.tem_funcionarios === undefined ? '' : c.tem_funcionarios ? 'Sim' : 'Não'}</td><td class="small">${esc(c.email || '')}</td></tr>`).join('')}</tbody></table></div>
          ${L.length > 300 ? `<p class="small muted">Mostrando 300 de ${L.length}.</p>` : ''}
          <div class="acoes" style="margin-top:0"><button class="btn sec" data-fecha>Cancelar</button><button class="btn" id="iOk" ${L.length ? '' : 'disabled'}>Importar ${L.length} cliente(s)</button></div></div>`;
        prev.querySelector('#iOk').addEventListener('click', async (e) => {
          e.target.disabled = true; e.target.textContent = 'Importando…';
          try { const r = await db.importarClientes(L); await db.registrar('Importou clientes', `${r.novos} novos, ${r.atualizados} atualizados (${arq.name})`); await recarregarClientes(); limparCacheTarefas(); aviso(`${r.novos} cliente(s) criados e ${r.atualizados} atualizados.`); fechar(true); }
          catch (er) { aviso(er.message, 'erro'); e.target.disabled = false; e.target.textContent = 'Tentar de novo'; }
        });
      } catch (er) { prev.innerHTML = `<p style="color:var(--bad);margin-top:12px">${esc(er.message)}</p>`; }
    };
    m.querySelector('#iArq').addEventListener('change', (e) => e.target.files[0] && ler(e.target.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('on'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('on'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('on'); if (e.dataTransfer.files[0]) ler(e.dataTransfer.files[0]); });
  } });
}
