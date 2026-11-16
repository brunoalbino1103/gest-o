// Estrutura principal: login, início por departamento e, dentro de cada departamento,
// o topo (Empresa, Mês, departamentos) e o menu lateral com as telas na ordem do trabalho.
import db from './db.js';
import { NOME_ESCRITORIO } from './config.js';
import { $, $$, esc, nomeComp, somaMes, compPadrao, aviso, atrasada, semAcento } from './util.js';
import { S, carregarBase, mudarComp, mudarTodos, mudarEmpresa, tarefasDa, empresaAtual } from './estado.js';
import { ico } from './icones.js';

// Cada departamento: grupos do menu e as telas.
// [chave, nome, tela, oculta, ícone, precisaDeUmMês]
// "familias": telas que aparecem como abas no topo, debaixo de um item do menu (ex.: Fechamento → Quadro, Conferência, Ponto...).
const T = (f) => () => import('./telas/' + f + '.js');
export const AREAS = {
  fiscal: { nome: 'Departamento Fiscal', curto: 'Fiscal', cor: '#4C6FE0', ct: '#EEF2FE', dep: 'fiscal', grupos: [
    ['', [['visao', 'Visão geral', T('departamento'), false, 'inicio', true], ['painel', 'Painel Fiscal', T('painel-fiscal'), false, 'painel'], ['documentos', 'Documentos', T('documentos'), false, 'pasta']]],
    ['', [['importar', 'Importar arquivos', T('importador'), true, 'importar']]],
  ] },
  pessoal: { nome: 'Departamento Pessoal', curto: 'Pessoal', cor: '#7B61D9', ct: '#F3EEFC', dep: 'dp', grupos: [
    ['', [['visao', 'Caixa de entrada', T('dp-visao'), false, 'caixa'], ['fechamento', 'Fechamento', T('dp-fechamento'), false, 'quadro'], ['colaboradores', 'Colaboradores', T('funcionarios'), false, 'pessoas'], ['empresas', 'Empresas', T('dp-empresas'), false, 'empresa']]],
    ['Análise', [['indicadores', 'Indicadores', T('dp-indicadores'), false, 'grafico'], ['simulador', 'Simulador', T('dp-simulador'), false, 'calculadora']]],
    ['', [['importar', 'Importar arquivos', T('importador'), true, 'importar'],
      ['conferencia', 'Conferência', T('dp-conferencia'), true, 'conferir'], ['ponto', 'Ponto e horas extras', T('dp-ponto'), true, 'relogio', true], ['vrvt', 'VR/VT', T('dp-vrvt'), true, 'cartao', true], ['guias', 'Guias e impostos', T('dp-guias'), true, 'guia'], ['obrigacoes', 'Obrigações', T('departamento'), true, 'calendarioOk', true],
      ['colaborador', 'Ficha do colaborador', T('dp-colaborador'), true, 'pessoa'], ['ferias', 'Férias', T('dp-ferias'), true, 'ferias'], ['experiencia', 'Experiência', T('dp-experiencia'), true, 'ampulheta'], ['movimentacoes', 'Admissões e rescisões', T('dp-movimentacoes'), true, 'troca'], ['sst', 'Saúde e segurança', T('dp-sst'), true, 'saude'],
      ['portal', 'Portal do cliente', T('portal-equipe'), true, 'portal'], ['documentos', 'Documentos', T('documentos'), true, 'pasta']]],
  ], familias: {
    fechamento: [['fechamento', 'Quadro'], ['conferencia', 'Conferência'], ['ponto', 'Ponto'], ['vrvt', 'VR/VT'], ['guias', 'Guias'], ['obrigacoes', 'Obrigações']],
    colaboradores: [['colaboradores', 'Todos'], ['ferias', 'Férias'], ['experiencia', 'Experiência'], ['movimentacoes', 'Admissões e rescisões'], ['sst', 'Saúde e segurança']],
    empresas: [['empresas', 'Empresas'], ['portal', 'Portal do cliente'], ['documentos', 'Documentos']],
  } },
  contabil: { nome: 'Contabilidade', curto: 'Contábil', cor: '#13917F', ct: '#E6F4F2', dep: 'contabil', grupos: [
    ['', [['visao', 'Visão geral', T('departamento'), false, 'inicio', true], ['extratos', 'Extratos bancários', T('contabil-extratos'), false, 'banco', true], ['documentos', 'Documentos', T('documentos'), false, 'pasta']]],
    ['', [['importar', 'Importar arquivos', T('importador'), true, 'importar']]],
  ] },
  cadastros: { nome: 'Cadastros e configurações', curto: 'Cadastros', cor: '#5B6270', ct: '#F2F4F7', dep: null, grupos: [
    ['', [['clientes', 'Empresas (clientes)', T('clientes'), false, 'empresa'], ['empresa', 'Ficha da empresa', T('cliente'), true, 'empresa'], ['portal', 'Portal do cliente', T('portal-equipe'), false, 'portal']]],
    ['Configurações', [['configuracoes', 'Obrigações, feriados e equipe', T('config'), false, 'regras'], ['auditoria', 'Auditoria', T('auditoria'), false, 'auditoria']]],
  ] },
};
const abaDe = (area, aba) => AREAS[area].grupos.flatMap((g) => g[1]).find((a) => a[0] === aba);
// telas de detalhe que pertencem a um item do menu
const PAI = { colaborador: 'colaboradores', empresa: 'clientes' };
// família (abas do topo) de uma tela: [chave do item do menu, abas]
function familiaDe(area, aba) {
  const f = AREAS[area].familias || {}; const k = PAI[aba] || aba;
  for (const [cab, l] of Object.entries(f)) if (l.some((x) => x[0] === k)) return [cab, l];
  return [k, null];
}

// ---------------- login ----------------
function telaLogin(msg = '') {
  $('#raiz').innerHTML = `<div class="login"><form class="login-box" id="fLogin">
    <div class="marca"><div class="mark">P</div><div><b>${esc(NOME_ESCRITORIO)}</b><div class="small muted">Fiscal · Pessoal · Contabilidade</div></div></div>
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
  document.title = NOME_ESCRITORIO;
  const p = S.perfil;
  $('#raiz').innerHTML = `<div class="inicio">
    <div class="inicio-topo"><div class="in"><div class="mark">P</div><div><h1>${esc(NOME_ESCRITORIO)}</h1><div class="sub">Sistema contábil</div></div>
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
  const filtros = area === 'cadastros' ? '' : `<div class="filtros">
      <label class="ctrl" title="Empresa">${ico('empresa')}<select id="selEmp" aria-label="Empresa">${opcoesEmpresa()}</select></label>
      <div class="ctrl" title="Mês">${ico('calendario')}<select id="cSel" aria-label="Mês">${opcoesComp()}</select><button id="cAnt" aria-label="Mês anterior">${ico('voltar')}</button><button id="cProx" aria-label="Mês seguinte">${ico('avancar')}</button></div>
    </div>`;
  const temImportar = !!abaDe(area, 'importar');
  const ini = (S.perfil?.nome || S.perfil?.email || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  $('#raiz').innerHTML = `<div class="app" style="--c:${a.cor};--ct:${a.ct}">
    <aside class="lateral" id="lateral">
      <div class="lat-topo"><button class="dep-sel" id="depSel" aria-haspopup="true" aria-expanded="false" title="Trocar de departamento"><span class="dep-ic">${ico(area)}</span><b>${a.curto}</b>${ico('abaixo')}</button></div>
      <div class="dep-menu" id="depMenu" hidden>${['fiscal', 'pessoal', 'contabil'].map((k) => `<a href="#/${k}/visao" class="${k === area ? 'on' : ''}"><span class="q" style="background:${AREAS[k].cor}">${ico(k)}</span>${AREAS[k].nome}</a>`).join('')}<hr><a href="#/cadastros/clientes" class="${area === 'cadastros' ? 'on' : ''}"><span class="q" style="background:${AREAS.cadastros.cor}">${ico('engrenagem')}</span>Cadastros e configurações</a><a href="#/"><span class="q" style="background:var(--na)">${ico('inicio')}</span>Tela inicial</a></div>
      <button class="busca-bt" id="buscaBt" title="Buscar (Ctrl+K)">${ico('busca')}<span>Buscar</span><kbd>Ctrl K</kbd></button>
      ${temImportar ? `<a class="lat-acao" href="#/${area}/importar" title="Importar arquivos">${ico('importar')}<span>Importar arquivos</span></a>` : ''}
      <nav aria-label="${esc(a.nome)}">${a.grupos.map(([g, abas]) => { const vis = abas.filter((x) => !x[3]); return vis.length ? `<div class="lat-g">${g ? `<div class="lat-t">${g}</div>` : ''}${vis.map(([k, t, , , ic]) => `<a class="lat-i" data-aba="${k}" href="#/${area}/${k}" title="${t}">${ico(ic)}<span class="lat-n">${t}</span><span class="nb" id="nb-${k}"></span></a>`).join('')}</div>` : ''; }).join('')}</nav>
      <div class="lat-pe"><span class="quem" title="${esc(S.perfil?.email || '')}"><span class="av">${esc(ini)}</span><span>${esc(S.perfil?.nome || S.perfil?.email || '')}</span></span>
        <button class="lat-bt" id="latMini" title="Minimizar menu" aria-label="Minimizar menu">${ico('minimizar')}</button><button class="lat-bt" id="latOcultar" title="Ocultar menu" aria-label="Ocultar menu">${ico('ocultar')}</button><button class="lat-bt" id="sair" title="Sair" aria-label="Sair">${ico('sair')}</button></div>
    </aside>
    <button class="lat-abrir" id="latAbrir" title="Mostrar menu" aria-label="Mostrar menu">${ico('mostrar')}</button>
    <div class="lat-fundo" id="latFundo"></div>
    <div class="principal">
      <header class="barra-topo">
        <button class="topo-menu" id="mMenu" aria-label="Abrir menu">${ico('menu')}</button>
        <div class="trilha" id="trilha"></div>
        <nav class="subabas" id="subabas" aria-label="Seções"></nav>
        ${filtros}
      </header>
      <div class="conteudo">
        ${db.demo ? '<div class="demo-tag" style="margin-bottom:12px">Modo demonstração: dados fictícios, só neste navegador.</div>' : ''}
        <div class="cab"><div><h1 class="panel-title" id="tTitulo"></h1><div class="panel-desc" id="tSub"></div></div></div>
        <main id="conteudo" style="display:flex;flex-direction:column;gap:16px"></main>
      </div>
    </div></div>`;
  const app = $('.app');
  const dm = $('#depMenu'), ds = $('#depSel');
  ds.addEventListener('click', (e) => { e.stopPropagation(); dm.hidden = !dm.hidden; ds.setAttribute('aria-expanded', String(!dm.hidden)); });
  $('#buscaBt').addEventListener('click', () => abrirBusca());
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
export function topo(titulo, sub = '') { const t = $('#tTitulo'); if (!t) return; t.textContent = titulo; $('#tSub').innerHTML = sub; document.title = titulo + ' · ' + NOME_ESCRITORIO; }
export const area = () => AREAS[location.hash.replace(/^#\/?/, '').split('/')[0]] || null;

export async function atualizarContadores() {
  const a = area(); if (!a?.dep) return;
  try {
    const t = (await tarefasDa(S.comp)).filter((x) => x.departamento === a.dep && (!S.empresa || x.cliente_id === S.empresa));
    const n = t.filter(atrasada).length;
    [$('#nb-' + (a.dep === 'dp' ? 'fechamento' : 'visao')), $('#sb-obrigacoes')].forEach((e) => { if (e) { e.textContent = n || ''; e.className = 'nb red'; e.title = n + ' obrigação(ões) atrasada(s)'; } });
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
  const [cab, fam] = familiaDe(ar, aba);
  $$('.lat-i').forEach((b) => b.classList.toggle('on', b.dataset.aba === cab));
  const itemCab = abaDe(ar, cab) || abaDe(ar, aba);
  $('#trilha').innerHTML = `<b>${esc(itemCab[1])}</b>`;
  $('#subabas').innerHTML = fam ? fam.map(([k, t]) => `<a href="#/${ar}/${k}" class="${k === aba || PAI[aba] === k ? 'on' : ''}">${t}<span class="nb" id="sb-${k}"></span></a>`).join('') : '';
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
// fecha o menu de departamentos ao clicar fora
document.addEventListener('click', (e) => { const dm = $('#depMenu'); if (dm && !dm.hidden && !e.target.closest('#depMenu')) { dm.hidden = true; $('#depSel')?.setAttribute('aria-expanded', 'false'); } });

// ---------------- busca rápida (Ctrl+K): telas, empresas e colaboradores ----------------
let funcsCache = null;
async function abrirBusca() {
  if ($('.cmdk-fundo') || !S.perfil) return;
  const ar = location.hash.replace(/^#\/?/, '').split('/')[0];
  const fundo = document.createElement('div'); fundo.className = 'cmdk-fundo';
  fundo.innerHTML = `<div class="cmdk" role="dialog" aria-label="Buscar"><input id="ckQ" placeholder="Buscar empresa, colaborador ou tela" autocomplete="off" aria-label="Buscar"><div class="cmdk-l" id="ckL" role="listbox"></div></div>`;
  document.body.appendChild(fundo);
  const q = fundo.querySelector('#ckQ'), L = fundo.querySelector('#ckL');
  const fechar = () => fundo.remove();
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
  const telas = Object.entries(AREAS).flatMap(([k, a]) => a.grupos.flatMap((g) => g[1]).filter((x) => !PAI[x[0]]).map((x) => ({ t: x[1], s: a.curto, ic: x[4], ir: () => { location.hash = `#/${k}/${x[0]}`; }, prio: k === ar ? 0 : 1 })));
  const emps = S.clientes.filter((c) => c.ativo).map((c) => ({ t: c.nome_fantasia || c.razao_social, s: c.cnpj || 'Empresa', ic: 'empresa', ir: () => { mudarEmpresa(c.id); if (!AREAS[ar] || ar === 'cadastros') location.hash = '#/pessoal/visao'; else rota(); } }));
  let funcs = [];
  const montar = () => {
    const termos = semAcento(q.value.trim()).split(/\s+/).filter(Boolean);
    const bate = (o) => termos.every((t) => semAcento(o.t + ' ' + o.s).includes(t));
    const secs = [['Telas', telas.filter(bate).sort((a, b) => a.prio - b.prio).slice(0, termos.length ? 6 : 8)], ['Empresas', termos.length ? emps.filter(bate).slice(0, 6) : []], ['Colaboradores', termos.length ? funcs.filter(bate).slice(0, 6) : []]].filter(([, l]) => l.length);
    const todos = secs.flatMap(([, l]) => l);
    L.innerHTML = secs.length ? secs.map(([t, l]) => `<div class="cmdk-t">${t}</div>${l.map((o) => `<button class="cmdk-i" role="option" data-i="${todos.indexOf(o)}">${ico(o.ic)}<span>${esc(o.t)}</span><small>${esc(o.s)}</small></button>`).join('')}`).join('') : '<div class="cmdk-v">Nada encontrado.</div>';
    L._todos = todos; marcar(0);
  };
  let sel = 0;
  const marcar = (i) => { const bs = [...L.querySelectorAll('.cmdk-i')]; if (!bs.length) return; sel = (i + bs.length) % bs.length; bs.forEach((b, j) => b.classList.toggle('on', j === sel)); bs[sel].scrollIntoView({ block: 'nearest' }); };
  const escolher = (i) => { const o = L._todos?.[i]; if (!o) return; fechar(); o.ir(); };
  L.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) escolher(+b.dataset.i); });
  L.addEventListener('mousemove', (e) => { const b = e.target.closest('[data-i]'); if (b) marcar([...L.querySelectorAll('.cmdk-i')].indexOf(b)); });
  q.addEventListener('input', montar);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); marcar(sel + 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(sel - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(+(L.querySelectorAll('.cmdk-i')[sel]?.dataset.i ?? -1)); } else if (e.key === 'Escape') fechar();
  });
  montar(); q.focus();
  try {
    funcsCache ||= await db.funcionarios();
    const nomeC = (id) => { const c = S.clientes.find((x) => x.id === id); return c ? (c.nome_fantasia || c.razao_social) : ''; };
    funcs = funcsCache.filter((f) => !f.contribuinte).map((f) => ({ t: f.nome, s: nomeC(f.cliente_id) + (f.situacao === 'desligado' ? ' · desligado' : ''), ic: 'pessoa', ir: () => { location.hash = `#/pessoal/colaborador/${f.id}`; } }));
    if (document.body.contains(fundo) && q.value.trim()) montar();
  } catch (e) { /* colaboradores são opcionais na busca */ }
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { if (!$('.app')) return; e.preventDefault(); abrirBusca(); }
});

// botões "escolher empresa" das telas que precisam de uma empresa só
document.addEventListener('click', (e) => { const b = e.target.closest('[data-escolhe]'); if (!b) return; mudarEmpresa(b.dataset.escolhe); rota(); });
db.aoMudarSessao((u) => { if (!u && S.perfil && $('#conteudo')) { S.perfil = null; areaMontada = null; telaLogin('Sua sessão terminou. Entre de novo.'); } });
iniciar();
