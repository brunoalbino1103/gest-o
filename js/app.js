// Estrutura principal: login, menu lateral, seletor de competência e troca de telas.
import db from './db.js';
import { NOME_ESCRITORIO } from './config.js';
import { $, $$, esc, DEPS, nomeComp, somaMes, compPadrao, aviso, atrasada } from './util.js';
import { S, carregarBase, mudarComp, tarefasDa } from './estado.js';

const TELAS = {
  painel: () => import('./telas/painel.js'),
  clientes: () => import('./telas/clientes.js'),
  cliente: () => import('./telas/cliente.js'),
  dep: () => import('./telas/departamento.js'),
  documentos: () => import('./telas/documentos.js'),
  funcionarios: () => import('./telas/funcionarios.js'),
  config: () => import('./telas/config.js'),
};
const IC = {
  painel: '<path d="M3 13h8V3H3zM13 21h8v-8h-8zM3 21h8v-6H3zM13 3v8h8V3z"/>',
  clientes: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  documentos: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
};
const icone = (k) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

// ---------------- login ----------------
function telaLogin(msg = '') {
  $('#raiz').innerHTML = `<div class="login"><form class="login-box" id="fLogin">
    <div class="marca"><div class="mark">SC</div><div><b>${esc(NOME_ESCRITORIO)}</b><div class="small muted">Sistema contábil · Fiscal, Pessoal e Contabilidade</div></div></div>
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

// ---------------- estrutura ----------------
function opcoesComp() {
  const base = compPadrao(); const l = []; for (let i = -12; i <= 2; i++) l.push(somaMes(base, i));
  if (!l.includes(S.comp)) l.push(S.comp);
  return l.sort().reverse().map((c) => `<option value="${c}" ${c === S.comp ? 'selected' : ''}>${nomeComp(c, true)}</option>`).join('');
}
function montarEstrutura() {
  const p = S.perfil;
  $('#raiz').innerHTML = `<div class="app" id="app">
   <aside class="lado" aria-label="Menu">
    <div class="marca"><div class="mark">SC</div><div><b>${esc(NOME_ESCRITORIO)}</b><span>Sistema contábil</span></div></div>
    <nav class="nav">
     <a href="#/painel" data-r="painel">${icone('painel')}Visão geral</a>
     <a href="#/clientes" data-r="clientes">${icone('clientes')}Clientes</a>
     <div class="nav-t">Departamentos</div>
     ${Object.entries(DEPS).map(([k, d]) => `<a href="#/dep/${k}" data-r="dep/${k}"><span class="dot" style="background:${d.cor}"></span>${d.longo}<span class="nb" id="nb-${k}" hidden></span></a>`).join('')}
     <div class="nav-t">Painéis</div>
     <a href="fiscal.html"><span class="dot" style="background:#0090D0"></span>Painel Fiscal</a>
     <a href="ferias.html"><span class="dot" style="background:#7A4FD6"></span>Painel de Férias</a>
     <a href="#/funcionarios" data-r="funcionarios">${icone('clientes')}Funcionários</a>
     <div class="nav-t">Arquivos</div>
     <a href="#/documentos" data-r="documentos">${icone('documentos')}Documentos</a>
     <a href="#/config" data-r="config">${icone('config')}Configurações</a>
    </nav>
    <div class="pe">
     ${db.demo ? '<div class="demo-tag">Modo demonstração: dados fictícios, só neste navegador.</div>' : ''}
     <div><b style="color:var(--ink)">${esc(p?.nome || '')}</b><br><span class="muted">${esc(p?.email || '')}</span></div>
     <button id="sair">Sair</button>
    </div>
   </aside>
   <div class="principal">
    <header class="topo"><div class="topo-in">
     <button class="menu-btn" id="menuBtn" aria-label="Abrir menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>
     <div><h1 id="tTitulo"></h1><div class="sub" id="tSub"></div></div>
     <div class="dir">
      <div class="comp" title="Competência (mês de referência)"><button id="cAnt" aria-label="Mês anterior">‹</button><label class="sr" for="cSel">Competência</label><select id="cSel">${opcoesComp()}</select><button id="cProx" aria-label="Mês seguinte">›</button></div>
     </div>
    </div></header>
    <main class="conteudo" id="conteudo"></main>
   </div></div>`;
  $('#sair').addEventListener('click', async () => { await db.sair(); telaLogin(); });
  $('#menuBtn').addEventListener('click', () => $('#app').classList.toggle('menu-aberto'));
  $('.lado').addEventListener('click', (e) => { if (e.target.closest('a')) $('#app').classList.remove('menu-aberto'); });
  const troca = (c) => { mudarComp(c); $('#cSel').innerHTML = opcoesComp(); rota(); };
  $('#cSel').addEventListener('change', (e) => troca(e.target.value));
  $('#cAnt').addEventListener('click', () => troca(somaMes(S.comp, -1)));
  $('#cProx').addEventListener('click', () => troca(somaMes(S.comp, 1)));
}
export function topo(titulo, sub = '') { $('#tTitulo').textContent = titulo; $('#tSub').innerHTML = sub; document.title = titulo + ' · Sistema Contábil'; }

export async function atualizarContadores() {
  try {
    const t = await tarefasDa(S.comp);
    for (const k of Object.keys(DEPS)) { const n = t.filter((x) => x.departamento === k && atrasada(x)).length; const e = $('#nb-' + k); if (e) { e.hidden = !n; e.textContent = n; e.title = n + ' tarefa(s) atrasada(s)'; } }
  } catch (e) { /* contador é opcional */ }
}

// ---------------- rotas ----------------
let rodando = 0;
async function rota() {
  const h = location.hash.replace(/^#\/?/, '') || 'painel';
  const [nome, ...resto] = h.split('/');
  const carregar = TELAS[nome] || TELAS.painel;
  $$('.nav a').forEach((a) => { const r = a.dataset.r; a.toggleAttribute('aria-current', r === h || (nome === 'cliente' && r === 'clientes') || (r === nome && !resto.length)); if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'page'); });
  // cada tela recebe um <main> novo, para não acumular eventos da tela anterior
  const velho = $('#conteudo'); const el = velho.cloneNode(false); velho.replaceWith(el); const minha = ++rodando;
  el.innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    const mod = await carregar(); if (minha !== rodando) return;
    await mod.default(el, resto, () => minha === rodando);
  } catch (e) {
    console.error(e); if (minha !== rodando) return;
    el.innerHTML = `<div class="card"><div class="vazio"><b>Não foi possível abrir esta tela</b>${esc(e.message)}</div></div>`;
  }
  atualizarContadores();
  window.scrollTo(0, 0);
}
export const irPara = (h) => { if (location.hash === h) rota(); else location.hash = h; };
export const recarregarTela = () => rota();

// ---------------- início ----------------
async function iniciar() {
  const u = await db.usuario(); if (!u) return telaLogin();
  try { await carregarBase(); } catch (e) { return telaLogin('Erro ao carregar os dados: ' + e.message); }
  if (!S.perfil) { await db.sair(); return telaLogin('Seu usuário ainda não está liberado. Peça ao administrador.'); }
  if (!S.perfil.ativo) { await db.sair(); return telaLogin('Seu usuário está desativado. Fale com o administrador.'); }
  montarEstrutura(); rota();
}
window.addEventListener('hashchange', () => { if ($('#conteudo')) rota(); });
db.aoMudarSessao((u) => { if (!u && $('#conteudo')) telaLogin('Sua sessão terminou. Entre de novo.'); });
iniciar();
