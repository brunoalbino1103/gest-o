// Auditoria: tudo o que aconteceu no sistema (quem, quando, onde e o que mudou). Só administradores.
import db from '../db.js';
import { esc, semAcento, hojeISO, modal, baixarArquivo } from '../util.js';
import { S, eAdmin, nomeCliente } from '../estado.js';
import { topo } from '../app.js';

export const ASSUNTOS = {
  acao: 'Ação no sistema', clientes: 'Empresa (cadastro)', perfis: 'Equipe', obrigacoes: 'Obrigação', feriados: 'Feriado', tarefas: 'Tarefa do mês', documentos: 'Arquivo',
  notas: 'Nota fiscal', cancelamentos: 'Cancelamento de nota', inutilizacoes: 'Inutilização', funcionarios: 'Colaborador', ferias_marcacoes: 'Férias marcadas', faltas: 'Falta',
  movimentacoes: 'Admissão / rescisão', dp_empresas: 'Empresa no DP (convenção)', ferias_periodos: 'Períodos de férias', folha_resumos: 'Resumo da folha', folha_itens: 'Folha por colaborador',
  guias: 'Guia', ponto_cartoes: 'Cartão de ponto', funcionario_eventos: 'Evento do colaborador', empresa_documentos: 'Documento de SST', parametros: 'Configurações (tabelas)',
  portal_acessos: 'Acesso ao portal', solicitacoes: 'Pedido do cliente',
};
const COR = { criou: 'p-ok', alterou: 'p-at', gravou: 'p-at', excluiu: 'p-bad' };
const ROTULO = { criou: 'Criou', alterou: 'Alterou', gravou: 'Gravou', excluiu: 'Excluiu' };
const F = { de: '', ate: '', usuario: '', tabela: '', busca: '' };
const dataHora = (iso) => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
const valor = (v) => v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 300) : String(v).slice(0, 300);
// campos que mudaram numa alteração
export function mudancas(a) {
  if (!a.antes || !a.depois) return [];
  return [...new Set([...Object.keys(a.antes), ...Object.keys(a.depois)])].filter((k) => !['atualizado_em', 'id'].includes(k) && JSON.stringify(a.antes[k] ?? null) !== JSON.stringify(a.depois[k] ?? null)).map((k) => [k, a.antes[k], a.depois[k]]);
}

export default async function auditoria(el, _r, vivo) {
  topo('Auditoria', 'Tudo o que acontece no sistema fica registrado aqui: quem fez, quando, em qual empresa e o que mudou. Não dá para apagar nem alterar.');
  if (!eAdmin()) { el.innerHTML = '<div class="card"><div class="vazio"><b>Só administradores</b>Peça a um administrador para consultar a auditoria.</div></div>'; return; }
  if (!F.de) { const d = new Date(); d.setDate(d.getDate() - 30); F.de = d.toLocaleDateString('sv-SE'); F.ate = hojeISO(); }
  let L = [];
  try { L = await db.auditoria({ de: F.de, ate: F.ate, usuario: F.usuario || undefined, tabela: F.tabela || undefined, cliente_id: S.empresa || undefined }); }
  catch (er) { el.innerHTML = `<div class="card"><div class="vazio"><b>Auditoria ainda não ligada</b>Rode a atualização <code>supabase/atualizacao-05-auditoria.sql</code> no Supabase (SQL Editor) e abra esta tela de novo.<br><span class="small muted">${esc(er.message)}</span></div></div>`; return; }
  if (!vivo()) return;
  const nomeQuem = (a) => S.perfis.find((p) => p.id === a.usuario)?.nome || a.email || (a.usuario?.startsWith?.('portal:') ? 'Cliente (portal)' : 'Sistema');
  const q = semAcento(F.busca);
  const V = L.filter((a) => !q || semAcento([nomeQuem(a), a.acao, ASSUNTOS[a.tabela] || a.tabela, a.descricao, a.cliente_id ? nomeCliente(a.cliente_id) : ''].join(' ')).includes(q));
  const cont = (k) => L.filter((a) => (k === 'acao' ? a.tabela === 'acao' : a.acao === k)).length;
  const kpi = (l, v) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span></div>`;
  el.innerHTML = `<div class="grid g4">${kpi('Criações', cont('criou') + cont('gravou'))}${kpi('Alterações', cont('alterou'))}${kpi('Exclusões', cont('excluiu'))}${kpi('Ações (entrar, abrir…)', cont('acao'))}</div>
    <div class="card"><div class="card-h"><h2>Registros ${S.empresa ? '· ' + esc(nomeCliente(S.empresa)) : ''}</h2>
      <div class="barra-f">
        <label class="small">De <input type="date" id="aDe" value="${F.de}"></label><label class="small">até <input type="date" id="aAte" value="${F.ate}"></label>
        <label class="sr" for="aUsu">Pessoa</label><select id="aUsu"><option value="">Todas as pessoas</option>${S.perfis.map((p) => `<option value="${p.id}" ${F.usuario === p.id ? 'selected' : ''}>${esc(p.nome || p.email)}</option>`).join('')}</select>
        <label class="sr" for="aTab">Assunto</label><select id="aTab"><option value="">Todos os assuntos</option>${Object.entries(ASSUNTOS).map(([k, t]) => `<option value="${k}" ${F.tabela === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <label class="sr" for="aBusca">Buscar</label><input type="search" id="aBusca" placeholder="Buscar" value="${esc(F.busca)}">
        <button class="btn sec mini" id="aExp">Exportar (planilha)</button>
      </div></div>
      ${V.length ? `<div class="tw" style="max-height:68vh;overflow:auto"><table class="t"><thead><tr><th>Quando</th><th>Quem</th><th>O que fez</th><th>Onde</th><th>Item</th>${S.empresa ? '' : '<th>Empresa</th>'}<th></th></tr></thead><tbody>
      ${V.slice(0, 1000).map((a, i) => { const m = mudancas(a); return `<tr><td class="small num" style="white-space:nowrap">${dataHora(a.em)}</td><td>${esc(nomeQuem(a))}</td>
        <td>${a.tabela === 'acao' ? `<span class="pill p-na">${esc(a.acao)}</span>` : `<span class="pill ${COR[a.acao] || 'p-na'}">${ROTULO[a.acao] || esc(a.acao)}</span>`}</td>
        <td>${a.tabela === 'acao' ? '' : esc(ASSUNTOS[a.tabela] || a.tabela)}</td>
        <td style="max-width:380px"><span style="word-break:break-word">${esc(a.descricao || '')}</span>${m.length ? `<div class="small muted">mudou: ${m.slice(0, 4).map(([k]) => esc(k)).join(', ')}${m.length > 4 ? '…' : ''}</div>` : ''}</td>
        ${S.empresa ? '' : `<td class="small">${a.cliente_id ? esc(nomeCliente(a.cliente_id)) : ''}</td>`}
        <td>${a.antes || a.depois ? `<button class="btn sec mini" data-ver="${i}">Detalhes</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>${V.length > 1000 ? `<p class="small muted" style="padding:10px 18px">Mostrando 1.000 de ${V.length}. Use os filtros ou exporte a planilha.</p>` : ''}` : '<div class="vazio">Nenhum registro com esses filtros.</div>'}
    </div>`;
  const recarrega = () => auditoria(el, _r, vivo);
  el.querySelector('#aDe').addEventListener('change', (e) => { F.de = e.target.value; recarrega(); });
  el.querySelector('#aAte').addEventListener('change', (e) => { F.ate = e.target.value; recarrega(); });
  el.querySelector('#aUsu').addEventListener('change', (e) => { F.usuario = e.target.value; recarrega(); });
  el.querySelector('#aTab').addEventListener('change', (e) => { F.tabela = e.target.value; recarrega(); });
  el.querySelector('#aBusca').addEventListener('change', (e) => { F.busca = e.target.value; recarrega(); });
  el.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => detalhes(V[+b.dataset.ver], nomeQuem)));
  el.querySelector('#aExp').addEventListener('click', () => {
    const lin = [['Quando', 'Quem', 'O que fez', 'Onde', 'Item', 'Empresa', 'Campos alterados'], ...V.map((a) => [dataHora(a.em), nomeQuem(a), a.tabela === 'acao' ? a.acao : ROTULO[a.acao] || a.acao, a.tabela === 'acao' ? '' : ASSUNTOS[a.tabela] || a.tabela, a.descricao || '', a.cliente_id ? nomeCliente(a.cliente_id) : '', mudancas(a).map(([k, x, y]) => `${k}: ${valor(x)} → ${valor(y)}`).join(' | ')])];
    baixarArquivo(`auditoria_${F.de}_a_${F.ate}.csv`, '﻿' + lin.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n'));
  });
}

function detalhes(a, nomeQuem) {
  const m = mudancas(a);
  const tabela = (o) => `<table class="t"><tbody>${Object.entries(o || {}).filter(([k]) => k !== 'atualizado_em').map(([k, v]) => `<tr><td class="small muted" style="width:34%">${esc(k)}</td><td class="small" style="word-break:break-word">${esc(valor(v))}</td></tr>`).join('')}</tbody></table>`;
  modal(`${a.tabela === 'acao' ? a.acao : (ROTULO[a.acao] || a.acao) + ' · ' + (ASSUNTOS[a.tabela] || a.tabela)}`, `<p class="small muted mt0">${dataHora(a.em)} · ${esc(nomeQuem(a))}${a.cliente_id ? ' · ' + esc(nomeCliente(a.cliente_id)) : ''}</p>
    ${m.length ? `<h3 style="font-size:14px;margin:12px 0 6px">O que mudou</h3><table class="t"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${m.map(([k, x, y]) => `<tr><td class="small">${esc(k)}</td><td class="small" style="color:var(--bad);word-break:break-word">${esc(valor(x))}</td><td class="small" style="color:var(--ok);word-break:break-word">${esc(valor(y))}</td></tr>`).join('')}</tbody></table>`
      : a.acao === 'excluiu' ? `<h3 style="font-size:14px;margin:12px 0 6px">Como estava antes de excluir</h3>${tabela(a.antes)}` : `<h3 style="font-size:14px;margin:12px 0 6px">Dados</h3>${tabela(a.depois)}`}
    <div class="acoes"><button class="btn sec" data-fecha>Fechar</button></div>`, { largura: 720 });
}
