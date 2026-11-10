// Dados compartilhados entre as telas (carregados uma vez e atualizados quando mudam).
import db from './db.js';
import { compPadrao } from './util.js';
import { definirFeriadosExtras } from './regras.js';
import { usarTabelas } from './calculos.js';

const COMP_KEY = 'contabil_competencia';
let compSalva = null; try { compSalva = sessionStorage.getItem(COMP_KEY); } catch (e) { /* sem storage */ }

export const S = {
  perfil: null, perfis: [], clientes: [], obrigacoes: [],
  comp: compSalva || compPadrao(),
  _tarefas: new Map(),
};

export async function carregarBase() {
  let fer;
  [S.perfil, S.perfis, S.clientes, S.obrigacoes, fer] = await Promise.all([db.meuPerfil(), db.perfis(), db.clientes(), db.obrigacoes(), db.feriados().catch(() => [])]);
  S.feriados = fer; definirFeriadosExtras(fer);
  // tabelas de INSS/IRRF do ano (Configurações); sem cadastro, valem as padrão
  try { const par = await db.listar('parametros', {}, 'chave'); S.parametros = par; usarTabelas(par.find((p) => p.chave === 'tabelas')?.valor); } catch (e) { S.parametros = []; }
}
export async function recarregarFeriados() { S.feriados = await db.feriados(); definirFeriadosExtras(S.feriados); }
export async function recarregarClientes() { S.clientes = await db.clientes(); }
export async function recarregarObrigacoes() { S.obrigacoes = await db.obrigacoes(); }

export async function tarefasDa(comp = S.comp, forcar = false) {
  if (forcar || !S._tarefas.has(comp)) S._tarefas.set(comp, await db.tarefas({ competencia: comp }));
  return S._tarefas.get(comp);
}
export function trocarTarefaNoCache(t) { const l = S._tarefas.get(t.competencia); if (!l) return; const i = l.findIndex((x) => x.id === t.id); if (i >= 0) l[i] = t; }
export function limparCacheTarefas() { S._tarefas.clear(); }

export function mudarComp(c) { S.comp = c; try { sessionStorage.setItem(COMP_KEY, c); } catch (e) { /* ok */ } }
// empresa escolhida no topo ('' = todas)
try { S.empresa = sessionStorage.getItem('contabil_empresa') || ''; } catch (e) { S.empresa = ''; }
export function mudarEmpresa(id) { S.empresa = id || ''; try { sessionStorage.setItem('contabil_empresa', S.empresa); } catch (e) { /* ok */ } }
export const empresaAtual = () => (S.empresa ? S.clientes.find((c) => c.id === S.empresa) || null : null);
export const daEmpresa = (cliente_id) => !S.empresa || cliente_id === S.empresa;

export const cliente = (id) => S.clientes.find((c) => c.id === id);
export const nomeCliente = (id) => { const c = cliente(id); return c ? (c.nome_fantasia || c.razao_social) : 'Sem cliente'; };
export const nomePerfil = (id) => S.perfis.find((p) => p.id === id)?.nome || '—';
export const ativos = () => S.clientes.filter((c) => c.ativo);
export const eAdmin = () => S.perfil?.departamento === 'admin';
