// Estrutura principal: login, início por departamento e, dentro de cada departamento,
// o topo (Empresa, Mês, departamentos) e o menu lateral com as telas na ordem do trabalho.
import db from './db.js';
import { NOME_ESCRITORIO } from './config.js';
import { $, $$, esc, nomeComp, somaMes, compPadrao, aviso, atrasada } from './util.js';
import { S, carregarBase, mudarComp, mudarTodos, mudarEmpresa, tarefasDa, empresaAtual } from './estado.js';
import { ico } from './icones.js';

// Cada departamento: grupos do menu e as telas.
// [chave, nome, tela, oculta, ícone, precisaDeUmMês]
const T = (f) => () => import('./telas/' + f + '.js');
export const AREAS = {
  fiscal: { nome: 'Departamento Fiscal', curto: 'Fiscal', cor: '#2F5BEA', ct: '#EEF2FE', dep: 'fiscal', grupos: [
    ['Painel', [['visao', 'Visão geral', T('departamento'), false, 'inicio', true]]],
    ['Notas', [['painel', 'Painel Fiscal', T('painel-fiscal'), false, 'painel']]],
    ['Arquivos', [['importar', 'Importar arquivos', T('importador'), false, 'importar'], ['documentos', 'Documentos', T('documentos'), false, 'pasta']]],
  ] },
  pessoal: { nome: 'Departamento Pessoal', curto: 'Pessoal', cor: '#7A4FD6', ct: '#F3EEFC', dep: 'dp', grupos: [
    ['Painel', [['visao', 'Visão geral', T('dp-visao'), false, 'inicio'], ['indicadores', 'Indicadores', T('dp-indicadores'), false, 'grafico']]],
    ['Rotina do mês', [['importar', 'Importar arquivos', T('importador'), false, 'importar'], ['fechamento', 'Fechamento do mês', T('dp-fechamento'), false, 'fechamento'], ['ponto', 'Ponto e horas extras', T('dp-ponto'), false, 'relogio', true], ['vrvt', 'VR/VT', T('dp-vrvt'), false, 'cartao', true], ['conferencia', 'Conferência', T('dp-conferencia'), false, 'conferir'], ['guias', 'Guias e impostos', T('dp-guias'), false, 'guia'], ['obrigacoes', 'Obrigações', T('departamento'), false, 'calendarioOk', true]]],
    ['Colaboradores', [['colaboradores', 'Colaboradores', T('funcionarios'), false, 'pessoas'], ['colaborador', 'Ficha do colaborador', T('dp-colaborador'), true, 'pessoa'], ['ferias', 'Férias', T('dp-ferias'), false, 'ferias'], ['experiencia', 'Experiência', T('dp-experiencia'), false, 'ampulheta'], ['movimentacoes', 'Admissões e rescisões', T('dp-movimentacoes'), false, 'troca'], ['sst', 'Saúde e segurança', T('dp-sst'), false, 'saude']]],
    ['Empresas e clientes', [['empresas', 'Empresas', T('dp-empresas'), false, 'empresa'], ['portal', 'Portal do cliente', T('portal-equipe'), false, 'portal'], ['documentos', 'Documentos', T('documentos'), false, 'pasta']]],
    ['Ferramentas', [['simulador', 'Simulador', T('dp-simulador'), false, 'calculadora']]],
  ] },
  contabil: { nome: 'Contabilidade', curto: 'Contábil', cor: '#0E8A7E', ct: '#E6F4F2', dep: 'contabil', grupos: [
    ['Painel', [['visao', 'Visão geral', T('departamento'), false, 'inicio', true]]],
    ['Rotina do mês', [['extratos', 'Extratos bancários', T('contabil-extratos'), false, 'banco', true]]],
    ['Arquivos', [['importar', 'Importar arquivos', T('importador'), false, 'importar'], ['documentos', 'Documentos', T('documentos'), false, 'pasta']]],
  ] },
  cadastros: { nome: 'Cadastros e configurações', curto: 'Cadastros', cor: '#475467', ct: '#F2F4F7', dep: null, grupos: [
    ['Cadastros', [['clientes', 'Empresas (clientes)', T('clientes'), false, 'empresa'], ['empresa', 'Ficha da empresa', T('cliente'), true, 'empresa']]],
    ['Clientes', [['portal', 'Portal do cliente', T('portal-equipe'), false, 'portal']]],
    ['Regras e equipe', [['configuracoes', 'Obrigações, feriados e equipe', T('config'), false, 'regras'], ['auditoria', 'Auditoria', T('auditoria'), false, 'auditoria']]],
  ] },
};
const abaDe = (area, aba) => AREAS[area].grupos.flatMap((g) => g[1]).find((a) => a[0] === aba);

// ---------------- login ----------------
function telaLogin(msg = '') {
  $('#raiz').innerHTML = `<div class="login"><form class="login-box" id="fLogin">
    <div class="marca"><div class="mark">SC</div><div><b>${esc(NOME_ESCRITORIO)}</b><div class="small muted">Fiscal · Pessoal · Contabilidade</div></div></div>
    <h1>Entrar</h1>
    ${db.demo ? '<div class="demo-tag">Modo demonstração: os dados são fictícios e ficam só neste navegador. Clique em Entrar com qualquer e-mail.</div>' : ''}
    <label class="f">E-mail<input type="email" name="email" autocomplete="username" ${db.demo ? 'value="demo@escritorio.test"' : 'required'}></label>
    <label class="f">Senha<input type="password" name="senha" autocomplete="current-password" ${db.demo ? '' : 'required'}></label>
    <p class="small" style="color:var(--bad)" id="lErro">${esc(msg)}</p>
    <button class="btn" style="justify-content:center">Entrar</button>
    ${db.demo ? '' : '<button type="button" class="btn sec" id="esqueci" style="justify-content:center">Esqueci a senha</button>'}
  </form></div>`;
  $('#fLogin').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target); const b = e.target.querySelector('.btn'); b.disabled = true; b.textContent = 'Entrando…';
    try { await db.entrar(f.get('email'), f.get('senha')); await iniciar(); } catch (er) { $('#lErro').textContent = er.message; b.disabled = false; b.textContent = 'Entrar'; }
  });
  $('#esqueci')?.addEventListener('click', async () => {
    const email = $('#fLogin [name=email]').value.trim(); if (!email) { $('#lErro').textContent = 'Digite seu e-mail acima primeiro.'; return; }
    try { await db.esqueciSenha(email); $('#lErro').textContent = ''; aviso('Enviamos um link para trocar a senha para ' + email); } catch (er) { $('#lErro').textContent = er.message; }
  });
}

// ---------------- início: escolher o departamento ----------------
async function telaInicio() {
  document.title = 'Sistema Contábil';
  const p = S.perfil;
  $('#raiz').innerHTML = `<div class="inicio">
    <div class="inicio-topo"><div class="in"><div class="mark">SC</div><div><h1>${esc(NOME_ESCRITORIO)}</h1><div class="sub">Sistema contábil</div></div>
      <div class="dir">${db.demo ? '<span class="demo-tag">Modo demonstração</span>' : ''}<span>${esc(p?.nome || '')}</span><button class="topo-sair" id="sair" title="Sair" aria-label="Sair">${ico('sair')}</button></div></div></div>
    <div class="inicio-corpo">
      <div><h2>Qual departamento?</h2><p class="dica">Cada departamento mostra só o que é dele. Dentro, escolha a empresa no topo.</p></div>
      <div class="deps-ini">${['fiscal', 'pessoal', 'contabil'].map((k) => { const a = AREAS[k]; return `<a class="dep-ini" href="#/${k}/visao" style="--c:${a.cor};--ct:${a.ct}">
        <span class="ic">${ico(k)}</span><b>${a.nome}</b>
        <p>${{ fiscal: 'Notas fiscais, Painel Fiscal por empresa, DIFAL, impostos e obrigações do mês.', pessoal: 'Colaboradores, férias, ponto, experiência, admissões e rescisões, VR/VT e o fechamento da folha.', contabil: 'Extratos bancários, conciliação, lançamentos e balancetes.' }[k]}</p>
        <span class="nums" data-nums="${a.dep}"><span>…</span></span></a>`; }).join('')}</div>
      <div class="atalhos"><a class="atalho prim" href="#/pessoal/importar">${ico('importar')} Importar arquivos <span class="small">o sistema reconhece sozinho</span></a><a class="atalho" href="#/cadastros/clientes">${ico('engrenagem')} Empresas e configurações</a></div>
    </div></div>`;
  $('#sair').addEventListener('click', async () => { S.perfil = null; await db.sair(); telaLogin(); });
  try {
    const t = await tarefasDa(S.comp);
    $$('[data-nums]').forEach((el) => {
      const l = t.filter((x) => x.departamento === el.dataset.nums && x.status !== 'nao_aplica'); const at = l.filter(atrasada).length, ok = l.filter((x) => x.status === 'concluida').length;
      el.innerHTML = `<span><b>${l.length ? Math.round(ok / l.length * 100) : 0}%</b>concluído em ${nomeComp(S.comp, true)}</span><span class="${at ? 'bad' : ''}"><b>${at}</b>atrasada${at === 1 ? '' : 's'}</span>`;
    });
  } catch (e) { /* números são opcionais */ }
}

// ---------------- dentro de um departamento ----------------
function opcoesComp() {
  const base = compPadrao(); const l = []; for (let i = -12; i <= 2; i++) l.push(somaMes(base, i));
  if (!l.includes(S.comp)) l.push(S.comp);
  return `<option value="todos" ${S.todos ? 'selected' : ''}>Todos os meses</option>` + l.sort().reverse().map((c) => `<option value="${c}" ${!S.todos && c === S.comp ? 'selected' : ''}>${nomeComp(c, true)}</option>`).join('');
}
function opcoesEmpresa() {
  const l = S.clientes.filter((c) => c.ativo).sort((a, b) => (a.nome_fantasia || a.razao_social).localeCompare(b.nome_fantasia || b.razao_social, 'pt'));
  return `<option value="">Todas as empresas</option>` + l.map((c) => `<option value="${c.id}" ${S.empresa === c.id ? 'selected' : ''}>${esc(c.nome_fantasia || c.razao_social)}</option>`).join('');
}
let areaMontada = null;
function montarArea(area) {
  const a = AREAS[area]; areaMontada = area;
  const filtros = area === 'cadastros' ? '' : `<div class="topo-filtros">
      <label class="ctrl"><span class="ctrl-lab">Empresa</span><select id="selEmp" aria-label="Empresa">${opcoesEmpresa()}</select></label>
      <div class="ctrl"><span class="ctrl-lab">Mês</span><button id="cAnt" aria-label="Mês anterior">${ico('voltar')}</button><select id="cSel" aria-label="Competência">${opcoesComp()}</select><button id="cProx" aria-label="Mês seguinte">${ico('avancar')}</button></div>
    </div>`;
  $('#raiz').innerHTML = `<div class="app" style="--c:${a.cor};--ct:${a.ct}">
    <header class="topo">
      <button class="topo-menu" id="mMenu" aria-label="Abrir menu">${ico('menu')}</button>
      <a class="topo-marca" href="#/" title="Voltar para os departamentos"><span class="dot-dep">${ico(area)}</span><span><b>${a.nome}</b><small id="tbSub"></small></span></a>
      ${filtros}
      <nav class="topo-deps" aria-label="Departamentos">${['fiscal', 'pessoal', 'contabil'].map((k) => `<a href="#/${k}/visao" class="${k === area ? 'on' : ''}" style="--c:${AREAS[k].cor}">${AREAS[k].curto}</a>`).join('')}<a href="#/cadastros/clientes" class="ic ${area === 'cadastros' ? 'on' : ''}" title="Empresas e configurações" aria-label="Empresas e configurações">${ico('engrenagem')}</a></nav>
      <button class="topo-sair" id="sair" title="Sair · ${esc(S.perfil?.email || '')}" aria-label="Sair">${ico('sair')}</button>
    </header>
    <div class="corpo">
      <aside class="lateral" id="lateral">
        <div class="lat-ctrl"><button id="latMini" title="Minimizar menu (só ícones)" aria-label="Minimizar menu">${ico('minimizar')}</button><button id="latOcultar" title="Ocultar menu" aria-label="Ocultar menu">${ico('ocultar')}</button></div>
        <nav aria-label="${esc(a.nome)}">${a.grupos.map(([g, abas]) => `<div class="lat-g"><div class="lat-t">${g}</div>${abas.filter((x) => !x[3]).map(([k, t, , , ic]) => `<a class="lat-i" data-aba="${k}" href="#/${area}/${k}" title="${t}">${ico(ic)}<span class="lat-n">${t}</span><span class="nb" id="nb-${k}"></span></a>`).join('')}</div>`).join('')}</nav></aside>
      <button class="lat-abrir" id="latAbrir" title="Mostrar menu" aria-label="Mostrar menu">${ico('mostrar')}</button>
      <div class="lat-fundo" id="latFundo"></div>
      <div class="conteudo">
        ${db.demo ? '<div class="demo-tag" style="margin-bottom:12px">Modo demonstração: dados fictícios, só neste navegador.</div>' : ''}
        <div class="cab"><div><h1 class="panel-title" id="tTitulo"></h1><div class="panel-desc" id="tSub"></div></div></div>
        <main id="conteudo" style="display:flex;flex-direction:column;gap:16px"></main>
      </div>
    </div></div>`;
  const app = $('.app');
  $('#mMenu').addEventListener('click', () => app.classList.toggle('menu-aberto'));
  $('#latFundo').addEventListener('click', () => app.classList.remove('menu-aberto'));
  $('#lateral').addEventListener('click', (e) => { if (e.target.closest('.lat-i')) app.classList.remove('menu-aberto'); });
  // menu lateral: normal, minimizado (só ícones) ou oculto; a escolha fica guardada neste navegador
  const modoMenu = (m) => {
    app.classList.toggle('lat-mini', m === 'mini'); app.classList.toggle('lat-oculta', m === 'oculto');
    const b = $('#latMini'); b.innerHTML = ico(m === 'mini' ? 'expandir' : 'minimizar'); b.title = m === 'mini' ? 'Expandir menu' : 'Minimizar menu (só ícones)'; b.setAttribute('aria-label', b.title);
    try { localStorage.setItem('contabil_menu', m); } catch (e) { /* sem storage */ }
  };
  let m0 = 'normal'; try { m0 = localStorage.getItem('contabil_menu') || 'normal'; } catch (e) { /* ok */ }
  modoMenu(m0);
  $('#latMini').addEventListener('click', () => modoMenu(app.classList.contains('lat-mini') ? 'normal' : 'mini'));
  $('#latOcultar').addEventListener('click', () => modoMenu('oculto'));
  $('#latAbrir').addEventListener('click', () => modoMenu('normal'));
  $('#sair').addEventListener('click', async () => { S.perfil = null; await db.sair(); areaMontada = null; telaLogin(); });
  if (area !== 'cadastros') {
    $('#selEmp').addEventListener('change', (e) => { mudarEmpresa(e.target.value); rota(); });
    const troca = (c) => { if (c === 'todos') mudarTodos(true); else mudarComp(c); $('#cSel').innerHTML = opcoesComp(); rota(); };
    $('#cSel').addEventListener('change', (e) => troca(e.target.value));
    $('#cAnt').addEventListener('click', () => troca(S.todos ? S.comp : somaMes(S.comp, -1)));
    $('#cProx').addEventListener('click', () => troca(S.todos ? S.comp : somaMes(S.comp, 1)));
  }
}
export function topo(titulo, sub = '') { const t = $('#tTitulo'); if (!t) return; t.textContent = titulo; $('#tSub').innerHTML = sub; document.title = titulo + ' · Sistema Contábil'; }
export const area = () => AREAS[location.hash.replace(/^#\/?/, '').split('/')[0]] || null;

export async function atualizarContadores() {
  const a = area(); if (!a?.dep) return;
  try {
    const t = (await tarefasDa(S.comp)).filter((x) => x.departamento === a.dep && (!S.empresa || x.cliente_id === S.empresa));
    const n = t.filter(atrasada).length; const e = $('#nb-' + (a.dep === 'dp' ? 'obrigacoes' : 'visao'));
    if (e) { e.textContent = n || ''; e.className = 'nb red'; e.title = n + ' tarefa(s) atrasada(s)'; }
  } catch (e) { /* opcional */ }
}

// Tela que trabalha com um mês só, aberta em "Todos os meses": pede o mês
function escolherMes(el, nome) {
  topo(nome, 'Esta tela mostra um mês por vez. Escolha o mês:');
  const l = []; for (let i = 0; i < 12; i++) l.push(somaMes(S.comp, -i));
  el.innerHTML = `<div class="card"><div class="card-b"><div class="meses">${l.map((c) => `<button data-mes="${c}"><b>${nomeComp(c, true)}</b><span>${nomeComp(c).split(' de ')[0]}</span></button>`).join('')}</div></div></div>`;
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { mudarComp(b.dataset.mes); rota(); }));
}

// ---------------- rotas ----------------
let rodando = 0;
async function rota() {
  const h = location.hash.replace(/^#\/?/, '');
  const [ar, aba0, ...resto] = h.split('/');
  if (!AREAS[ar]) { areaMontada = null; return telaInicio(); }
  const aba = abaDe(ar, aba0) ? aba0 : AREAS[ar].grupos[0][1][0][0];
  if (areaMontada !== ar) montarArea(ar);
  if ($('#selEmp')) $('#selEmp').innerHTML = opcoesEmpresa();
  if ($('#cSel')) $('#cSel').innerHTML = opcoesComp();
  $$('.lat-i').forEach((b) => b.classList.toggle('on', b.dataset.aba === aba || (aba === 'colaborador' && b.dataset.aba === 'colaboradores') || (aba === 'empresa' && b.dataset.aba === 'clientes')));
  const emp = empresaAtual();
  $('#tbSub').textContent = ar === 'cadastros' ? NOME_ESCRITORIO : (emp ? (emp.nome_fantasia || emp.razao_social) : 'Todas as empresas') + ' · ' + (S.todos ? 'todos os meses' : nomeComp(S.comp, true));
  const velho = $('#conteudo'); const el = velho.cloneNode(false); velho.replaceWith(el); const minha = ++rodando;
  el.innerHTML = '<div class="carregando">Carregando…</div>';
  const def = abaDe(ar, aba);
  if (S.todos && def[5]) { escolherMes(el, def[1]); atualizarContadores(); return; }
  try {
    const mod = await def[2](); if (minha !== rodando) return;
    await mod.default(el, resto, () => minha === rodando, { area: ar, dep: AREAS[ar].dep, aba });
  } catch (e) {
    console.error(e); if (minha !== rodando) return;
    el.innerHTML = `<div class="card"><div class="vazio"><b>Não foi possível abrir esta tela</b>${esc(e.message)}</div></div>`;
  }
  atualizarContadores();
}
export const irPara = (h) => { if (location.hash === h) rota(); else location.hash = h; };
export const recarregarTela = () => rota();

// ---------------- início ----------------
async function iniciar() {
  const u = await db.usuario(); if (!u) return telaLogin();
  try { await carregarBase(); } catch (e) { return telaLogin('Erro ao carregar os dados: ' + e.message); }
  if (!S.perfil) {
    // cliente do escritório: abre só o portal da empresa dele
    const acesso = await db.meuPortal().catch(() => null);
    if (acesso && acesso.ativo !== false) { const { telaPortal } = await import('./telas/portal.js'); return telaPortal(acesso); }
    await db.sair(); return telaLogin('Seu usuário ainda não está liberado. Peça ao administrador.');
  }
  if (!S.perfil.ativo) { await db.sair(); return telaLogin('Seu usuário está desativado. Fale com o administrador.'); }
  areaMontada = null; rota();
}
window.addEventListener('hashchange', () => { if (S.perfil) rota(); });
// botões "escolher empresa" das telas que precisam de uma empresa só
document.addEventListener('click', (e) => { const b = e.target.closest('[data-escolhe]'); if (!b) return; mudarEmpresa(b.dataset.escolhe); rota(); });
db.aoMudarSessao((u) => { if (!u && S.perfil && $('#conteudo')) { S.perfil = null; areaMontada = null; telaLogin('Sua sessão terminou. Entre de novo.'); } });
iniciar();
