// Funcionários dos clientes: cadastro, importação por planilha e faltas. Alimenta o painel de Férias.
import { ico } from '../icones.js';
import db from '../db.js';
import { esc, dataBR, semAcento, soDigitos, aviso, modal, confirmar, baixarArquivo } from '../util.js';
import { S, nomeCliente } from '../estado.js';
import { topo, recarregarTela, irPara } from '../app.js';
import { lerPlanilha } from '../leitor.js';

let filtroCli = '', busca = '', sit = 'ativos';
const SIT = { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' };

export default async function funcionarios(el, _p, vivo) {
  filtroCli = S.empresa || '';
  topo('Colaboradores', 'Cadastro dos colaboradores · base das Férias, Experiência e VR/VT');
  const [L, F] = await Promise.all([db.funcionarios(), db.faltas()]); if (!vivo()) return;
  const clis = S.clientes.filter((c) => c.ativo).sort((a, b) => (a.nome_fantasia || a.razao_social).localeCompare(b.nome_fantasia || b.razao_social));
  el.innerHTML = `<div class="card"><div class="card-h"><div class="barra-f">
      <label class="sr" for="fuCli">Cliente</label><select id="fuCli" hidden><option value="">Todos os clientes</option>${clis.map((c) => `<option value="${c.id}" ${filtroCli === c.id ? 'selected' : ''}>${esc(c.nome_fantasia || c.razao_social)}</option>`).join('')}</select>
      <label class="sr" for="fuBusca">Buscar</label><input type="search" id="fuBusca" placeholder="Nome, cargo ou setor" value="${esc(busca)}">
      <div class="seg" role="group" aria-label="Situação">${[['ativos', 'Ativos'], ['desligados', 'Desligados'], ['todos', 'Todos']].map(([k, t]) => `<button data-sit="${k}" aria-pressed="${sit === k}">${t}</button>`).join('')}</div></div>
     <div class="barra-f"><button class="btn sec" id="fuFicha" title="Planilha para o colaborador preencher; depois é só arrastar em Importar arquivos">${ico('baixar')}Ficha para preencher</button><a class="btn sec" id="fuFerias" href="#/pessoal/ferias">Ver férias</a><button class="btn sec" id="fuImp">Importar planilha</button><button class="btn" id="fuNovo">+ Novo colaborador</button></div></div>
    <div class="tw"><table class="t"><thead><tr><th>Funcionário</th><th>Cliente</th><th>Cargo · setor</th><th>Admissão</th><th>Férias quitadas até</th><th>Faltas</th><th>Situação</th></tr></thead><tbody id="fuCorpo"></tbody></table></div></div>`;
  const $c = (s) => el.querySelector(s);
  const corpo = () => {
    const q = semAcento(busca);
    const l = L.filter((f) => (!filtroCli || f.cliente_id === filtroCli) && (sit === 'todos' || (sit === 'ativos') === (f.situacao !== 'desligado')) && (!q || semAcento(`${f.nome} ${f.cargo || ''} ${f.setor || ''}`).includes(q)));
    $c('#fuCorpo').innerHTML = l.map((f) => { const nf = F.filter((x) => x.funcionario_id === f.id).reduce((s, x) => s + (+x.quantidade || 0), 0); return `<tr class="lk" data-id="${f.id}"><td><b>${esc(f.nome)}</b>${f.codigo ? `<div class="small muted">cód. ${esc(f.codigo)}</div>` : ''}</td><td>${esc(nomeCliente(f.cliente_id))}</td><td>${esc(f.cargo || '—')}<div class="small muted">${esc(f.setor || '')}</div></td><td class="num">${f.admissao ? dataBR(f.admissao) : '<span class="pill p-bad">falta</span>'}</td><td class="num">${f.ferias_ate ? dataBR(f.ferias_ate) : '<span class="muted">—</span>'}</td><td class="num">${nf || ''}</td><td>${f.contribuinte ? '<span class="pill p-co">Pró-labore</span> ' : ''}<span class="pill ${f.situacao === 'ativo' ? 'p-ok' : f.situacao === 'afastado' ? 'p-at' : 'p-na'}">${SIT[f.situacao]}</span></td></tr>`; }).join('')
      || `<tr><td colspan="7"><div class="vazio">${L.length ? 'Nenhum funcionário com esse filtro.' : '<b>Nenhum funcionário cadastrado</b>Cadastre um por um ou importe uma planilha com todos de uma vez.'}</div></td></tr>`;
  };
  corpo();
  $c('#fuCli').addEventListener('change', (e) => { filtroCli = e.target.value; corpo(); });
  $c('#fuBusca').addEventListener('input', (e) => { busca = e.target.value; corpo(); });
  el.querySelectorAll('[data-sit]').forEach((b) => b.addEventListener('click', () => { sit = b.dataset.sit; el.querySelectorAll('[data-sit]').forEach((x) => x.setAttribute('aria-pressed', x === b)); corpo(); }));
  $c('#fuCorpo').addEventListener('click', (e) => { const r = e.target.closest('[data-id]'); if (r) irPara('#/pessoal/colaborador/' + r.dataset.id); });
  $c('#fuNovo').addEventListener('click', async () => { if (await formFuncionario({ cliente_id: filtroCli }, F)) recarregarTela(); });
  window.__formFuncionario = formFuncionario;
  $c('#fuFicha').addEventListener('click', async () => {
    const emp = S.clientes.find((c) => c.id === S.empresa);
    if (!emp) return aviso('Escolha a empresa no topo: a ficha sai com o nome e o CNPJ dela.', 'erro');
    try { const { baixarFicha } = await import('../ficha-modelo.js'); await baixarFicha(emp); aviso('Ficha baixada. Depois de preenchida, arraste em Importar arquivos.'); } catch (er) { aviso(er.message, 'erro'); }
  });
  $c('#fuImp').addEventListener('click', async () => { if (await importar(clis)) recarregarTela(); });
}

function formFuncionario(f, faltas) {
  const v = (k) => esc(f[k] ?? '');
  const minhas = faltas.filter((x) => x.funcionario_id === f.id);
  return modal(f.id ? 'Editar colaborador' : 'Novo colaborador', `<form class="form" id="fFu">
    <label class="f full">Cliente *<select name="cliente_id" required><option value="">Escolha…</option>${S.clientes.filter((c) => c.ativo).map((c) => `<option value="${c.id}" ${f.cliente_id === c.id ? 'selected' : ''}>${esc(c.nome_fantasia || c.razao_social)}</option>`).join('')}</select></label>
    <label class="f full">Nome completo *<input name="nome" required value="${v('nome')}"></label>
    <label class="f">CPF<input name="cpf" inputmode="numeric" value="${v('cpf')}"></label>
    <label class="f">Código na folha<input name="codigo" value="${v('codigo')}"></label>
    <label class="f">Cargo<input name="cargo" value="${v('cargo')}"></label>
    <label class="f">Setor<input name="setor" value="${v('setor')}"></label>
    <label class="f">Admissão *<input type="date" name="admissao" value="${v('admissao')}"></label>
    <label class="f">Férias quitadas até<input type="date" name="ferias_ate" value="${v('ferias_ate')}"><span class="small muted" style="font-weight:400">Fim do último período aquisitivo já gozado. Os anteriores contam como quitados.</span></label>
    <label class="f">Contrato de experiência<select name="exp">${[['', 'Sem experiência'], ['45/90', '45 + 45 dias'], ['30/90', '30 + 60 dias'], ['/90', '90 dias direto'], ['30/60', '30 + 30 dias'], ['/45', '45 dias'], ['/30', '30 dias']].map(([k, t]) => `<option value="${k}" ${(f.exp_dias_total ? `${f.exp_dias_1 || ''}/${f.exp_dias_total}` : '') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Salário (R$)<input type="number" step="0.01" name="salario" value="${v('salario')}"></label>
    <label class="f">Situação<select name="situacao">${Object.entries(SIT).map(([k, t]) => `<option value="${k}" ${(f.situacao || 'ativo') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Desligamento<input type="date" name="desligamento" value="${v('desligamento')}"></label>
    <label class="f full">Observações<textarea name="observacoes" style="min-height:56px">${v('observacoes')}</textarea></label>
    ${f.id ? `<fieldset class="full" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px"><legend class="small" style="padding:0 6px">Faltas sem justificativa (reduzem as férias, art. 130 da CLT)</legend>
      <div class="leg" style="font-size:13px;margin-bottom:8px">${minhas.map((x) => `<span class="pill p-at">${dataBR(x.data)} · ${x.quantidade} falta(s) <button type="button" data-delfalta="${x.id}" style="border:0;background:none;padding:0 0 0 4px;color:inherit" aria-label="Remover">×</button></span>`).join('') || '<span class="muted">Nenhuma falta registrada.</span>'}</div>
      <div class="barra-f"><input type="date" id="faData" style="width:160px" aria-label="Data da falta"><input type="number" id="faQtd" min="1" value="1" style="width:80px" aria-label="Quantidade"><button type="button" class="btn sec mini" id="faAdd">Lançar falta</button></div></fieldset>` : ''}
    <p class="full small" id="fuErro" style="color:var(--bad)"></p>
    <div class="acoes full" style="margin-top:0">${f.id ? '<button type="button" class="btn sec" id="fuApaga" style="color:var(--bad);margin-right:auto">Excluir</button>' : ''}<button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { largura: 680, aoAbrir: (m, fechar) => {
    const fm = m.querySelector('#fFu');
    fm.addEventListener('submit', async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(fm));
      if (!d.cliente_id || !d.nome.trim()) return (m.querySelector('#fuErro').textContent = 'Informe o cliente e o nome.');
      if (!d.admissao) return (m.querySelector('#fuErro').textContent = 'Informe a data de admissão (sem ela não dá para calcular as férias).');
      const [e1, et] = (d.exp || '').split('/'); d.exp_dias_1 = +e1 || null; d.exp_dias_total = +et || null; delete d.exp;
      d.salario = d.salario === '' ? null : +d.salario;
      d.cpf = soDigitos(d.cpf); Object.keys(d).forEach((k) => { if (d[k] === '') d[k] = null; });
      try { await db.salvarFuncionario({ ...(f.id ? { id: f.id } : {}), ...d }); await db.registrar(f.id ? 'Editou funcionário' : 'Cadastrou funcionário', d.nome, d.cliente_id); aviso('Funcionário salvo.'); fechar(true); }
      catch (er) { m.querySelector('#fuErro').textContent = er.message; }
    });
    m.querySelector('#faAdd')?.addEventListener('click', async () => {
      const data = m.querySelector('#faData').value; if (!data) return aviso('Escolha a data da falta.', 'erro');
      try { await db.salvarFalta({ funcionario_id: f.id, cliente_id: f.cliente_id, data, quantidade: +m.querySelector('#faQtd').value || 1, fonte: 'Lançado no sistema' }); aviso('Falta lançada.'); fechar(true); } catch (er) { aviso(er.message, 'erro'); }
    });
    m.querySelectorAll('[data-delfalta]').forEach((b) => b.addEventListener('click', async () => { try { await db.excluirFalta(b.dataset.delfalta); fechar(true); } catch (er) { aviso(er.message, 'erro'); } }));
    m.querySelector('#fuApaga')?.addEventListener('click', async () => {
      if (!(await confirmar('Excluir funcionário', `Excluir ${f.nome}? Saem também as férias marcadas e as faltas dele. Se a pessoa só saiu da empresa, prefira marcar como Desligado.`, 'Excluir'))) return;
      try { await db.excluirFuncionario(f.id); aviso('Funcionário excluído.'); fechar(true); } catch (er) { aviso(er.message, 'erro'); }
    });
  } });
}

// Planilha: Cliente (nome ou CNPJ), Nome, CPF, Cargo, Setor, Admissão, Código, Férias quitadas até
const dataDe = (v) => { v = String(v || '').trim(); let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return null; };
function importar(clis) {
  return modal('Importar funcionários de planilha', `<p class="mt0 small" style="margin-bottom:12px">Uma linha por funcionário. Colunas reconhecidas: <b>Cliente</b> (nome ou CNPJ), <b>Nome</b>, <b>Admissão</b>, CPF, Cargo, Setor, Código e Férias quitadas até. Datas como 26/07/2024.</p>
    <div class="drop"><b>Escolha a planilha (Excel ou CSV)</b><label class="btn sec">Escolher arquivo<input type="file" accept=".xlsx,.xls,.csv,.txt" hidden id="iFu"></label>
    <button type="button" class="btn sec mini" id="iFuMod">Baixar planilha modelo</button></div><div id="iFuPrev"></div>`, { largura: 820, aoAbrir: (m, fechar) => {
    m.querySelector('#iFuMod').addEventListener('click', () => baixarArquivo('modelo_funcionarios.csv', '﻿Cliente;Nome;CPF;Cargo;Setor;Admissão;Código;Férias quitadas até\r\nEmpresa Exemplo Ltda;Maria da Silva;12345678909;Vendedora;Comercial;26/07/2024;17;25/07/2025\r\n'));
    m.querySelector('#iFu').addEventListener('change', async (e) => {
      const arq = e.target.files[0]; if (!arq) return; const prev = m.querySelector('#iFuPrev');
      try {
        const linhas = await lerPlanilha(arq); const cab = linhas[0].map((c) => semAcento(String(c)).replace(/[^a-z ]/g, '').trim());
        const col = (...n) => cab.findIndex((c) => n.some((x) => c === x || c.startsWith(x)));
        const iC = col('cliente', 'empresa', 'cnpj'), iN = col('nome', 'funcionario', 'colaborador'), iA = col('admissao', 'data de admissao'), iCpf = col('cpf'), iCa = col('cargo', 'funcao'), iS = col('setor', 'departamento'), iCo = col('codigo', 'matricula'), iF = col('ferias quitadas', 'ferias ate');
        if (iN < 0) { prev.innerHTML = '<p style="color:var(--bad)">Não achei a coluna Nome.</p>'; return; }
        const acha = (v) => { const d = soDigitos(v); v = semAcento(v); return clis.find((c) => (d.length >= 11 && c.cnpj === d) || semAcento(c.razao_social) === v || semAcento(c.nome_fantasia || '') === v); };
        const ok = [], erros = [];
        linhas.slice(1).forEach((l, i) => {
          const nome = String(l[iN] || '').trim(); if (!nome) return;
          const c = iC >= 0 ? acha(l[iC]) : clis.length === 1 ? clis[0] : null;
          if (!c) { erros.push(`Linha ${i + 2}: cliente "${iC >= 0 ? l[iC] : ''}" não encontrado (${nome})`); return; }
          ok.push({ cliente_id: c.id, nome, admissao: iA >= 0 ? dataDe(l[iA]) : null, cpf: iCpf >= 0 ? soDigitos(l[iCpf]) || null : null, cargo: iCa >= 0 ? String(l[iCa] || '').trim() || null : null, setor: iS >= 0 ? String(l[iS] || '').trim() || null : null, codigo: iCo >= 0 ? String(l[iCo] || '').trim() || null : null, ferias_ate: iF >= 0 ? dataDe(l[iF]) : null, situacao: 'ativo' });
        });
        prev.innerHTML = `<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px"><div class="leg"><span class="pill p-ok">${ok.length} funcionário(s)</span>${erros.length ? `<span class="pill p-bad">${erros.length} com problema</span>` : ''}${ok.filter((x) => !x.admissao).length ? `<span class="pill p-at">${ok.filter((x) => !x.admissao).length} sem admissão</span>` : ''}</div>
          ${erros.length ? `<ul class="small">${erros.slice(0, 30).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          <div class="acoes" style="margin-top:0"><button class="btn sec" data-fecha>Cancelar</button><button class="btn" id="iFuOk" ${ok.length ? '' : 'disabled'}>Importar ${ok.length}</button></div></div>`;
        prev.querySelector('#iFuOk').addEventListener('click', async () => { try { await db.importarFuncionarios(ok); await db.registrar('Importou funcionários', `${ok.length} (${arq.name})`); aviso(`${ok.length} funcionário(s) importados.`); fechar(true); } catch (er) { aviso(er.message, 'erro'); } });
      } catch (er) { prev.innerHTML = `<p style="color:var(--bad)">${esc(er.message)}</p>`; }
    });
  } });
}
