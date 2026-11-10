// Estrutura principal: login, início por departamento e, dentro de cada departamento,
// a barra do topo (Empresa, Mês, abas) no mesmo estilo dos painéis de Ponto e Férias.
import db from './db.js';
import { NOME_ESCRITORIO } from './config.js';
import { $, $$, esc, nomeComp, somaMes, compPadrao, aviso, atrasada } from './util.js';
import { S, carregarBase, mudarComp, mudarEmpresa, tarefasDa, empresaAtual } from './estado.js';

const SVG = {
  fiscal: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  pessoal: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  contabil: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  cadastros: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.82 1.17V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-2.82-1.17l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6V3a2 2 0 114 0v.09A1.65 1.65 0 0015.4 6.6l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[k]}</svg>`;

// Cada departamento: abas agrupadas e a tela que cada aba abre
const T = (f) => () => import('./telas/' + f + '.js');
export const AREAS = {
  fiscal: { nome: 'Departamento Fiscal', curto: 'Fiscal', cor: '#2F5BEA', ct: '#EAF0FF', dep: 'fiscal', grupos: [
    ['Geral', [['visao', 'Visão geral', T('departamento')]]],
    ['Notas', [['painel', 'Painel Fiscal', T('painel-fiscal')], ['importar', 'Importar XML', T('documentos')]]],
    ['Arquivos', [['documentos', 'Documentos', T('documentos')]]],
  ] },
  pessoal: { nome: 'Departamento Pessoal', curto: 'Pessoal', cor: '#7A4FD6', ct: '#F1EBFC', dep: 'dp', grupos: [
    ['Geral', [['visao', 'Visão geral', T('dp-visao')]]],
    ['Cadastros', [['empresas', 'Empresas', T('dp-empresas')], ['colaboradores', 'Colaboradores', T('funcionarios')]]],
    ['Rotina do mês', [['fechamento', 'Fechamento do mês', T('dp-fechamento')], ['obrigacoes', 'Obrigações', T('departamento')], ['ponto', 'Ponto e horas extras', T('dp-ponto')], ['vrvt', 'VR/VT', T('dp-vrvt')]]],
    ['Acompanhar', [['ferias', 'Férias', T('dp-ferias')], ['experiencia', 'Experiência', T('dp-experiencia')], ['movimentacoes', 'Admissões e rescisões', T('dp-movimentacoes')]]],
    ['Arquivos', [['documentos', 'Documentos', T('documentos')]]],
  ] },
  contabil: { nome: 'Contabilidade', curto: 'Contábil', cor: '#0E8A7E', ct: '#E3F4F2', dep: 'contabil', grupos: [
    ['Geral', [['visao', 'Visão geral', T('departamento')]]],
    ['Rotina do mês', [['extratos', 'Extratos bancários', T('contabil-extratos')], ['importar', 'Importar arquivos', T('documentos')]]],
    ['Arquivos', [['documentos', 'Documentos', T('documentos')]]],
  ] },
  cadastros: { nome: 'Cadastros e configurações', curto: 'Cadastros', cor: '#475467', ct: '#F2F4F7', dep: null, grupos: [
    ['Cadastros', [['clientes', 'Empresas (clientes)', T('clientes')], ['empresa', 'Ficha da empresa', T('cliente'), true]]],
    ['Regras e equipe', [['configuracoes', 'Obrigações, feriados e equipe', T('config')]]],
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
      <div class="dir">${db.demo ? '<span class="demo-tag">Modo demonstração</span>' : ''}<span>${esc(p?.nome || '')}</span><button class="tb-sair" id="sair">Sair</button></div></div></div>
    <div class="inicio-corpo">
      <div><h2>Qual departamento?</h2><p class="dica">Cada departamento mostra só o que é dele. Dentro, escolha a empresa no topo.</p></div>
      <div class="deps-ini">${['fiscal', 'pessoal', 'contabil'].map((k) => { const a = AREAS[k]; return `<a class="dep-ini" href="#/${k}/visao" style="--c:${a.cor};--ct:${a.ct}">
        <span class="ic">${svg(k)}</span><b>${a.nome}</b>
        <p>${{ fiscal: 'Notas fiscais, Painel Fiscal por empresa, DIFAL, impostos e obrigações do mês.', pessoal: 'Colaboradores, férias, ponto, experiência, admissões e rescisões, VR/VT e o fechamento da folha.', contabil: 'Extratos bancários, conciliação, lançamentos e balancetes.' }[k]}</p>
        <span class="nums" data-nums="${a.dep}"><span>…</span></span></a>`; }).join('')}</div>
      <div class="atalhos"><a class="atalho" href="#/cadastros/clientes">${'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + SVG.cadastros + '</svg>'} Empresas e configurações</a></div>
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
  return l.sort().reverse().map((c) => `<option value="${c}" ${c === S.comp ? 'selected' : ''}>${nomeComp(c, true)}</option>`).join('');
}
function opcoesEmpresa() {
  const l = S.clientes.filter((c) => c.ativo).sort((a, b) => (a.nome_fantasia || a.razao_social).localeCompare(b.nome_fantasia || b.razao_social, 'pt'));
  return `<option value="">Todas as empresas</option>` + l.map((c) => `<option value="${c.id}" ${S.empresa === c.id ? 'selected' : ''}>${esc(c.nome_fantasia || c.razao_social)}</option>`).join('');
}
let areaMontada = null;
function montarArea(area) {
  const a = AREAS[area]; areaMontada = area;
  $('#raiz').innerHTML = `<div style="--c:${a.cor};--ct:${a.ct}">
    <header class="tb">
      <div class="tb-row tb-row1">
        <a class="tb-brand" href="#/" style="text-decoration:none" title="Voltar para os departamentos"><span class="dot-dep">${svg(area)}</span><div><h1>${a.nome}</h1><div class="tb-sub" id="tbSub"></div></div></a>
        <div class="tb-ctrls">
          ${area === 'cadastros' ? '' : `<div class="ctrl azul"><span class="ctrl-lab">Empresa</span><label class="sr" for="selEmp">Empresa</label><select id="selEmp">${opcoesEmpresa()}</select></div>
          <div class="ctrl"><span class="ctrl-lab">Mês</span><button id="cAnt" aria-label="Mês anterior">‹</button><label class="sr" for="cSel">Competência</label><select id="cSel">${opcoesComp()}</select><button id="cProx" aria-label="Mês seguinte">›</button></div>`}
          <nav class="tb-switch" aria-label="Departamentos">${['fiscal', 'pessoal', 'contabil'].map((k) => `<a href="#/${k}/visao" class="${k === area ? 'on' : ''}" style="--c:${AREAS[k].cor}">${AREAS[k].curto}</a>`).join('')}<a href="#/cadastros/clientes" class="${area === 'cadastros' ? 'on' : ''}" title="Empresas e configurações">⚙</a></nav>
          <button class="tb-sair" id="sair" title="${esc(S.perfil?.email || '')}">Sair</button>
        </div>
      </div>
      <div class="tb-row tb-row2"><nav class="navs">${a.grupos.map(([g, abas]) => `<div class="nav-group"><div class="nav-group-label">${g}</div><div class="abas">${abas.filter((x) => !x[3]).map(([k, t]) => `<a class="tab-btn" data-aba="${k}" href="#/${area}/${k}">${t}<span class="nb" id="nb-${k}"></span></a>`).join('')}</div></div>`).join('')}</nav></div>
    </header>
    <div class="conteudo">
      ${db.demo ? '<div class="demo-tag" style="margin-bottom:12px">Modo demonstração: dados fictícios, só neste navegador.</div>' : ''}
      <div class="cab" style="margin-bottom:14px"><div><div class="panel-title" id="tTitulo"></div><div class="panel-desc" id="tSub"></div></div></div>
      <main id="conteudo" style="display:flex;flex-direction:column;gap:16px"></main>
    </div></div>`;
  $('#sair').addEventListener('click', async () => { S.perfil = null; await db.sair(); areaMontada = null; telaLogin(); });
  if (area !== 'cadastros') {
    $('#selEmp').addEventListener('change', (e) => { mudarEmpresa(e.target.value); rota(); });
    const troca = (c) => { mudarComp(c); $('#cSel').innerHTML = opcoesComp(); rota(); };
    $('#cSel').addEventListener('change', (e) => troca(e.target.value));
    $('#cAnt').addEventListener('click', () => troca(somaMes(S.comp, -1)));
    $('#cProx').addEventListener('click', () => troca(somaMes(S.comp, 1)));
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

// ---------------- rotas ----------------
let rodando = 0;
async function rota() {
  const h = location.hash.replace(/^#\/?/, '');
  const [ar, aba0, ...resto] = h.split('/');
  if (!AREAS[ar]) { areaMontada = null; return telaInicio(); }
  const aba = abaDe(ar, aba0) ? aba0 : AREAS[ar].grupos[0][1][0][0];
  if (areaMontada !== ar) montarArea(ar);
  if ($('#selEmp')) $('#selEmp').innerHTML = opcoesEmpresa();
  $$('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.aba === aba));
  const emp = empresaAtual();
  $('#tbSub').textContent = ar === 'cadastros' ? NOME_ESCRITORIO : (emp ? (emp.nome_fantasia || emp.razao_social) : 'Todas as empresas') + ' · ' + nomeComp(S.comp, true);
  const velho = $('#conteudo'); const el = velho.cloneNode(false); velho.replaceWith(el); const minha = ++rodando;
  el.innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    const [, , carregar] = abaDe(ar, aba);
    const mod = await carregar(); if (minha !== rodando) return;
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
  if (!S.perfil) { await db.sair(); return telaLogin('Seu usuário ainda não está liberado. Peça ao administrador.'); }
  if (!S.perfil.ativo) { await db.sair(); return telaLogin('Seu usuário está desativado. Fale com o administrador.'); }
  areaMontada = null; rota();
}
window.addEventListener('hashchange', () => { if (S.perfil) rota(); });
// botões "escolher empresa" das telas que precisam de uma empresa só
document.addEventListener('click', (e) => { const b = e.target.closest('[data-escolhe]'); if (!b) return; mudarEmpresa(b.dataset.escolhe); rota(); });
db.aoMudarSessao((u) => { if (!u && S.perfil && $('#conteudo')) { S.perfil = null; areaMontada = null; telaLogin('Sua sessão terminou. Entre de novo.'); } });
iniciar();
