// Acesso aos dados no Supabase (banco, login e arquivos).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { tarefasParaGerar, OBRIGACOES_PADRAO } from './regras.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = 'documentos';

const ok = ({ data, error }) => { if (error) throw new Error(traduz(error.message)); return data; };
function traduz(m) {
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado.';
  if (/duplicate key.*cnpj/i.test(m)) return 'Já existe um cliente com esse CNPJ.';
  if (/row-level security|permission denied|sem permissão/i.test(m)) return 'Seu usuário não tem permissão para isso.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return m;
}
// O Supabase devolve no máximo 1000 linhas por vez: busca em páginas.
async function todas(montar) {
  const out = []; const T = 1000;
  for (let i = 0; ; i += T) { const d = ok(await montar().range(i, i + T - 1)); out.push(...d); if (d.length < T) return out; }
}
const limpa = (o) => { const r = { ...o }; Object.keys(r).forEach((k) => { if (k.startsWith('_')) delete r[k]; if (r[k] === '') r[k] = null; }); return r; };
let uid = null;

export default {
  demo: false,
  // ---------- login ----------
  async usuario() { const { data } = await sb.auth.getSession(); uid = data.session?.user?.id || null; return data.session?.user || null; },
  aoMudarSessao(cb) { sb.auth.onAuthStateChange((_e, s) => { uid = s?.user?.id || null; cb(s?.user || null); }); },
  async entrar(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); },
  async sair() { await sb.auth.signOut(); },
  async trocarSenha(nova) { ok(await sb.auth.updateUser({ password: nova })); },
  async esqueciSenha(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },

  // ---------- equipe ----------
  async meuPerfil() { return ok(await sb.from('perfis').select('*').eq('id', uid).maybeSingle()); },
  async perfis() { return ok(await sb.from('perfis').select('*').order('nome')); },
  async salvarPerfil(p) { return ok(await sb.from('perfis').update(limpa({ nome: p.nome, departamento: p.departamento, ativo: p.ativo })).eq('id', p.id).select().single()); },

  // ---------- clientes ----------
  async clientes() { return todas(() => sb.from('clientes').select('*').order('razao_social')); },
  async salvarCliente(c) {
    const d = limpa(c);
    if (d.id) return ok(await sb.from('clientes').update(d).eq('id', d.id).select().single());
    delete d.id; return ok(await sb.from('clientes').insert(d).select().single());
  },
  async importarClientes(lista) {
    const atuais = await this.clientes(); const porCnpj = new Map(atuais.filter((c) => c.cnpj).map((c) => [c.cnpj, c]));
    let novos = 0, atualizados = 0;
    for (let i = 0; i < lista.length; i += 200) {
      const lote = lista.slice(i, i + 200).map(limpa);
      const ins = lote.filter((c) => !c.cnpj || !porCnpj.has(c.cnpj));
      const upd = lote.filter((c) => c.cnpj && porCnpj.has(c.cnpj));
      if (ins.length) { ok(await sb.from('clientes').insert(ins)); novos += ins.length; }
      for (const c of upd) { const campos = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null && v !== undefined)); ok(await sb.from('clientes').update(campos).eq('cnpj', c.cnpj)); atualizados++; }
    }
    return { novos, atualizados };
  },
  async excluirCliente(id) { ok(await sb.from('clientes').delete().eq('id', id)); },

  // ---------- obrigações ----------
  async obrigacoes() { return ok(await sb.from('obrigacoes').select('*').order('departamento').order('ordem')); },
  async salvarObrigacao(o) {
    const d = limpa(o); if (d.id) return ok(await sb.from('obrigacoes').update(d).eq('id', d.id).select().single());
    delete d.id; return ok(await sb.from('obrigacoes').insert(d).select().single());
  },
  async excluirObrigacao(id) { ok(await sb.from('obrigacoes').delete().eq('id', id)); },

  // ---------- tarefas ----------
  async tarefas({ competencia, cliente_id } = {}) {
    return todas(() => { let q = sb.from('tarefas').select('*'); if (competencia) q = q.eq('competencia', competencia); if (cliente_id) q = q.eq('cliente_id', cliente_id); return q.order('vencimento').order('id'); });
  },
  async atualizarTarefa(id, campos) {
    const d = limpa(campos);
    if (d.status) { d.concluida_em = d.status === 'concluida' ? new Date().toISOString() : null; d.concluida_por = d.status === 'concluida' ? uid : null; }
    return ok(await sb.from('tarefas').update(d).eq('id', id).select().single());
  },
  async gerarTarefas(competencia) {
    const [cli, obr, exist] = await Promise.all([this.clientes(), this.obrigacoes(), this.tarefas({ competencia })]);
    const novas = tarefasParaGerar(competencia, cli, obr, exist);
    for (let i = 0; i < novas.length; i += 500) ok(await sb.from('tarefas').upsert(novas.slice(i, i + 500), { onConflict: 'cliente_id,obrigacao_id,competencia', ignoreDuplicates: true }));
    return novas.length;
  },
  async carregarObrigacoesPadrao() { ok(await sb.from('obrigacoes').insert(OBRIGACOES_PADRAO)); },

  // ---------- feriados extras ----------
  async feriados() { return ok(await sb.from('feriados').select('*').order('data')); },
  async salvarFeriado(f) { ok(await sb.from('feriados').upsert(f)); },
  async excluirFeriado(data) { ok(await sb.from('feriados').delete().eq('data', data)); },

  // ---------- documentos ----------
  async documentos({ competencia, cliente_id, departamento } = {}) {
    return todas(() => { let q = sb.from('documentos').select('*'); if (competencia) q = q.eq('competencia', competencia); if (cliente_id) q = q.eq('cliente_id', cliente_id); if (departamento) q = q.eq('departamento', departamento); return q.order('enviado_em', { ascending: false }); });
  },
  async enviarDocumento(arquivo, meta) {
    const seguro = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);
    const caminho = `${meta.cliente_id || 'sem-cliente'}/${meta.competencia || 'sem-competencia'}/${crypto.randomUUID()}-${seguro}`;
    ok(await sb.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || 'application/octet-stream' }));
    try {
      return ok(await sb.from('documentos').insert(limpa({ ...meta, nome_arquivo: arquivo.name, caminho, tamanho: arquivo.size, mime: arquivo.type, enviado_por: uid })).select().single());
    } catch (e) { await sb.storage.from(BUCKET).remove([caminho]); throw e; }
  },
  async documento(id) { return ok(await sb.from('documentos').select('*').eq('id', id).maybeSingle()); },
  async linkDocumento(doc) { return ok(await sb.storage.from(BUCKET).createSignedUrl(doc.caminho, 300, { download: doc.nome_arquivo })).signedUrl; },
  async abrirDocumento(doc) { return ok(await sb.storage.from(BUCKET).createSignedUrl(doc.caminho, 300)).signedUrl; },
  async excluirDocumento(doc) { ok(await sb.from('documentos').delete().eq('id', doc.id)); await sb.storage.from(BUCKET).remove([doc.caminho]); },
  async atualizarDocumento(id, campos) { return ok(await sb.from('documentos').update(limpa(campos)).eq('id', id).select().single()); },

  // ---------- notas fiscais ----------
  async notas({ competencia, cliente_id } = {}) {
    return todas(() => { let q = sb.from('notas').select('*'); if (competencia) q = q.eq('competencia', competencia); if (cliente_id) q = q.eq('cliente_id', cliente_id); return q.order('data').order('id'); });
  },
  // devolve "cliente_id|chave" das notas que já existem
  async chavesExistentes(chaves) {
    const out = new Set();
    for (let i = 0; i < chaves.length; i += 150) { const d = ok(await sb.from('notas').select('cliente_id,chave').in('chave', chaves.slice(i, i + 150))); d.forEach((r) => out.add(r.cliente_id + '|' + r.chave)); }
    return out;
  },
  async inserirNota(n) { return ok(await sb.from('notas').insert(limpa(n)).select().single()); },
  async atualizarNota(id, campos) { return ok(await sb.from('notas').update(limpa(campos)).eq('id', id).select().single()); },
  async cancelamentosDe(chaves) {
    const out = [];
    for (let i = 0; i < chaves.length; i += 150) out.push(...ok(await sb.from('cancelamentos').select('*').in('chave', chaves.slice(i, i + 150))));
    return out;
  },
  async inserirCancelamento(c) {
    ok(await sb.from('cancelamentos').upsert(limpa(c)));
    ok(await sb.from('notas').update({ cancelada: true }).eq('chave', c.chave));
  },
  async inutilizacoes({ cliente_id } = {}) { let q = sb.from('inutilizacoes').select('*'); if (cliente_id) q = q.eq('cliente_id', cliente_id); return ok(await q); },
  async inserirInutilizacao(i) { ok(await sb.from('inutilizacoes').upsert(limpa(i), { onConflict: 'cliente_id,modelo,serie,n_ini,n_fin', ignoreDuplicates: true })); },

  // ---------- Departamento Pessoal ----------
  async funcionarios({ cliente_id } = {}) { return todas(() => { let q = sb.from('funcionarios').select('*'); if (cliente_id) q = q.eq('cliente_id', cliente_id); return q.order('nome').order('id'); }); },
  async salvarFuncionario(f) {
    const d = limpa(f); if (d.id) return ok(await sb.from('funcionarios').update(d).eq('id', d.id).select().single());
    delete d.id; return ok(await sb.from('funcionarios').insert(d).select().single());
  },
  async importarFuncionarios(lista) { for (let i = 0; i < lista.length; i += 200) ok(await sb.from('funcionarios').insert(lista.slice(i, i + 200).map(limpa))); return lista.length; },
  async excluirFuncionario(id) { ok(await sb.from('funcionarios').delete().eq('id', id)); },
  async feriasMarcacoes() { return todas(() => sb.from('ferias_marcacoes').select('*').order('id')); },
  async salvarMarcacao(m) { ok(await sb.from('ferias_marcacoes').upsert(limpa({ ...m, atualizado_por: uid, atualizado_em: new Date().toISOString() }))); },
  async excluirMarcacao(id) { ok(await sb.from('ferias_marcacoes').delete().eq('id', id)); },
  async faltas({ cliente_id } = {}) { return todas(() => { let q = sb.from('faltas').select('*'); if (cliente_id) q = q.eq('cliente_id', cliente_id); return q.order('data').order('id'); }); },
  async salvarFalta(f) { return ok(await sb.from('faltas').insert(limpa(f)).select().single()); },
  async excluirFalta(id) { ok(await sb.from('faltas').delete().eq('id', id)); },
  async registrarLink(meta) { return ok(await sb.from('documentos').insert(limpa({ ...meta, caminho: 'link:' + crypto.randomUUID(), enviado_por: uid })).select().single()); },

  async dpEmpresas() { return ok(await sb.from('dp_empresas').select('*')); },
  async salvarDpEmpresa(o) { return ok(await sb.from('dp_empresas').upsert(limpa({ ...o, atualizado_em: new Date().toISOString() })).select().single()); },
  async movimentacoes({ cliente_id } = {}) { return todas(() => { let q = sb.from('movimentacoes').select('*'); if (cliente_id) q = q.eq('cliente_id', cliente_id); return q.order('prazo').order('id'); }); },
  async salvarMovimentacao(m) {
    const d = limpa(m); if (d.id) return ok(await sb.from('movimentacoes').update(d).eq('id', d.id).select().single());
    delete d.id; return ok(await sb.from('movimentacoes').insert({ ...d, criado_por: uid }).select().single());
  },
  async excluirMovimentacao(id) { ok(await sb.from('movimentacoes').delete().eq('id', id)); },

  // ---------- tabelas preenchidas pela importação automática ----------
  async listar(tabela, filtros = {}) { return todas(() => { let q = sb.from(tabela).select('*'); Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q = q.eq(k, v); }); return q.order('id'); }); },
  async gravar(tabela, linhas, conflito) {
    const L = (Array.isArray(linhas) ? linhas : [linhas]).map((l) => ({ ...limpa(l), atualizado_em: new Date().toISOString() }));
    for (let i = 0; i < L.length; i += 300) ok(await sb.from(tabela).upsert(L.slice(i, i + 300), { onConflict: conflito }));
  },

  // ---------- histórico ----------
  async historico({ cliente_id, limite = 50 } = {}) {
    let q = sb.from('historico').select('*').order('em', { ascending: false }).limit(limite); if (cliente_id) q = q.eq('cliente_id', cliente_id); return ok(await q);
  },
  async registrar(acao, detalhe, cliente_id) { try { await sb.from('historico').insert({ acao, detalhe, cliente_id: cliente_id || null, usuario: uid }); } catch (e) { /* histórico nunca bloqueia */ } },
};
