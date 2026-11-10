// Pega o que foi reconhecido nos arquivos e preenche o sistema sozinho.
import db from './db.js';
import { soDigitos, semAcento, nomeComp } from './util.js';
import { S, recarregarClientes, limparCacheTarefas } from './estado.js';
import { linhaPainel } from './leitor.js';
import { TIPOS } from './reconhecer.js';

const norm = (s) => semAcento(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const fmtVal = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtD = (s) => (s ? s.split('-').reverse().join('/') : '');

// ---------- 1. qual empresa é ----------
export function acharEmpresa(a) {
  const cl = S.clientes;
  if (a.tipo === 'nota') { // nota: o cliente é quem emitiu ou quem recebeu
    const x = a.dados; for (const c of [x.emit.cnpj, x.dest.cnpj, x.tomador]) { const k = c && cl.find((y) => y.cnpj === c || (c.length === 14 && y.cnpj?.slice(0, 8) === c.slice(0, 8))); if (k) return { cliente: k }; }
    return { cliente: null, nova: x.emit.cnpj?.length === 14 ? null : null };
  }
  for (const c of a.cnpjs || []) {
    const d = soDigitos(c); if (!d) continue;
    const k = cl.find((y) => y.cnpj && (y.cnpj === d || (d.length === 8 && y.cnpj.slice(0, 8) === d))); if (k) return { cliente: k };
  }
  if (a.codigoEmpresa) { const k = cl.find((y) => y.codigo && String(y.codigo) === String(a.codigoEmpresa)); if (k) return { cliente: k }; }
  if (a.nomeEmpresa) { const nn = norm(a.nomeEmpresa); const k = cl.find((y) => norm(y.razao_social) === nn || (y.nome_fantasia && norm(y.nome_fantasia) === nn)); if (k) return { cliente: k }; }
  // empresa nova: usa o CNPJ completo do documento (ignora sindicato, Caixa etc.)
  const cnpj = (a.cnpjs || []).map(soDigitos).find((d) => d.length === 14);
  if (cnpj && a.nomeEmpresa && TIPOS[a.tipo]?.[1] === 'dp') return { cliente: null, nova: { cnpj, razao_social: a.nomeEmpresa, codigo: a.codigoEmpresa || null } };
  if (cnpj && a.nomeEmpresa && a.tipo !== 'outro') return { cliente: null, nova: { cnpj, razao_social: a.nomeEmpresa, codigo: a.codigoEmpresa || null } };
  return { cliente: null };
}

// ---------- 2. o que vai ser preenchido (texto para conferir antes) ----------
export function previa(a) {
  const d = a.dados || {}; const nc = d.colaboradores?.length;
  switch (a.tipo) {
    case 'ferias_programacao': return `${nc} colaborador(es) e ${d.colaboradores.reduce((s, c) => s + c.periodos.length, 0)} período(s) de férias`;
    case 'folha_extrato': return `${nc} colaborador(es) com cargo, salário e CPF · folha de ${nomeComp(a.competencia, true)}`;
    case 'holerites': return `${nc} holerite(s): cargo, salário e líquido`;
    case 'liquidos': return `${nc} líquido(s) · total ${fmtVal(d.colaboradores.reduce((s, c) => s + c.liquido, 0))}`;
    case 'folha_resumo': return `Totais da folha: líquido ${fmtVal(d.liquido)} · FGTS ${fmtVal(d.fgts)} · INSS ${fmtVal(d.inss)} · ${d.empregados} empregado(s)`;
    case 'guia_fgts': case 'guia_darf_dp': case 'guia_darf_fiscal': case 'guia_das': case 'guia_sindical': return a.semTexto ? 'Guia guardada (escaneada)' : `${fmtVal(d.valor)} · vence ${fmtD(d.vencimento) || '?'}`;
    case 'cartao_ponto': return a.semTexto ? 'Cartão guardado (escaneado, sem leitura)' : `${nc} cartão(ões) de ponto com ${d.colaboradores.reduce((s, c) => s + c.dias.length, 0)} dias de batidas`;
    case 'recibo_dctfweb': return 'DCTFWeb entregue';
    case 'ficha_colaborador': { const c = d.colaborador || {}; return `Cadastro de ${c.nome || '(sem nome)'}: dados pessoais${c.cargo ? ', contrato' : ''}${c.dependentes?.length ? ` e ${c.dependentes.length} dependente(s)` : ''}`; }
    case 'nota': return `${a.dados.tipo_documento} ${a.dados.numero || ''} · ${fmtVal(a.dados.valor_nf)}${a.dados.cancelada ? ' · cancelada' : ''}`;
    case 'cancelamento': return `Cancela a nota nº ${+(a.dados.chave || '').slice(25, 34) || '?'}`;
    case 'inutilizacao': return `Inutiliza nº ${a.dados.n_ini}${a.dados.n_fin !== a.dados.n_ini ? ' a ' + a.dados.n_fin : ''} (série ${a.dados.serie})`;
    case 'extrato': return a.dados?.conta ? `Conta ${a.dados.conta} · ${a.dados.lancamentos} lançamentos` : 'Extrato bancário';
    default: return a.resumo || 'Guardado em Documentos';
  }
}

// ---------- 3. colaboradores: acha ou cria, sem duplicar ----------
const cacheF = new Map();
async function funcsDe(cid) { if (!cacheF.has(cid)) cacheF.set(cid, await db.funcionarios({ cliente_id: cid })); return cacheF.get(cid); }
const SIT = { trabalhando: 'ativo', ferias: 'ativo', afastado: 'afastado', demitido: 'desligado' };
export async function colaborador(cid, x, conta) {
  const L = await funcsDe(cid);
  const nn = norm(x.nome), pn = nn.split(' ').slice(0, 2).join(' ');
  let f = (x.codigo && L.find((y) => y.codigo && String(y.codigo) === String(x.codigo))) || (x.cpf && L.find((y) => y.cpf && y.cpf === x.cpf)) || L.find((y) => norm(y.nome) === nn) || (pn.split(' ').length === 2 && L.find((y) => norm(y.nome).startsWith(pn) && (!x.admissao || !y.admissao || y.admissao === x.admissao)));
  const campos = {};
  ['codigo', 'cpf', 'admissao', 'cbo', 'vinculo', 'horas_mes'].forEach((k) => { if (x[k] && (!f || !f[k])) campos[k] = x[k]; });
  if (x.cargo && (!f || f.cargo !== x.cargo)) campos.cargo = x.cargo;
  if (x.salario && (!f || +f.salario !== +x.salario)) campos.salario = x.salario;
  if (x.contribuinte && (!f || !f.contribuinte)) campos.contribuinte = true;
  const sit = x.situacao_folha && SIT[norm(x.situacao_folha).split(' ')[0]]; if (sit && f && f.situacao !== sit) campos.situacao = sit;
  if (f && x.nome && x.nome.length > (f.nome || '').length) campos.nome = x.nome; // fica com o nome mais completo
  if (!f) {
    const n = await db.salvarFuncionario({ cliente_id: cid, nome: x.nome, situacao: sit || 'ativo', ...campos }); L.push(n); conta.colabNovos++; return n;
  }
  if (Object.keys(campos).length) { const n = await db.salvarFuncionario({ id: f.id, ...campos }); Object.assign(f, n); conta.colabAtual++; }
  return f;
}

// ---------- 4. obrigação do mês feita automaticamente ----------
const OBR = { folha_extrato: /folha|holerite/i, folha_resumo: /folha|holerite/i, holerites: /folha|holerite/i, guia_fgts: /fgts/i, guia_darf_dp: /darf|inss/i, recibo_dctfweb: /dctfweb/i, creditos_dctfweb: /dctfweb/i, extrato_dctfweb: /dctfweb/i, cartao_ponto: /ponto/i, guia_das: /\bdas\b|pgdas/i, nota: /captar notas/i, extrato: /extrato/i };
async function concluirObrigacao(cid, comp, a, conta) {
  const re = OBR[a.tipo]; if (!re || !comp) return;
  const ts = (await db.tarefas({ competencia: comp, cliente_id: cid })).filter((t) => re.test(t.titulo) && t.status !== 'concluida' && t.status !== 'nao_aplica');
  for (const t of ts) { await db.atualizarTarefa(t.id, { status: 'concluida', observacao: `Feito automaticamente pela importação de "${a.nome}"` }); conta.obrigacoes++; }
}

// ---------- 5. preencher tudo ----------
export async function aplicarTudo(itens, aoProgresso) {
  cacheF.clear();
  const conta = { empresas: 0, colabNovos: 0, colabAtual: 0, periodos: 0, folhas: 0, guias: 0, ponto: 0, notas: 0, obrigacoes: 0, arquivos: 0, erros: [] };
  // empresas novas (uma por CNPJ)
  const novas = new Map(); itens.forEach((i) => { if (!i.cliente && i.nova && i.criarEmpresa !== false) novas.set(i.nova.cnpj, i.nova); });
  for (const [cnpj, n] of novas) {
    try { const c = await db.salvarCliente({ razao_social: n.razao_social, cnpj, codigo: n.codigo, regime: 'simples', tem_funcionarios: true, ativo: true, observacoes: 'Cadastrada automaticamente pela importação. Confira o regime e os dados.' }); conta.empresas++; itens.forEach((i) => { if (!i.cliente && i.nova?.cnpj === cnpj) i.cliente = c; }); }
    catch (e) { conta.erros.push(`Empresa ${n.razao_social}: ${e.message}`); }
  }
  if (novas.size) await recarregarClientes();
  // arquivos já guardados antes (mesmo nome e tamanho) não são enviados de novo
  const jaTem = new Map();
  let k = 0;
  for (const a of itens) {
    k++; aoProgresso && aoProgresso(k, itens.length, a);
    if (a.pular) continue;
    const c = a.cliente; const cid = c?.id || null;
    try {
      if (cid && !jaTem.has(cid)) jaTem.set(cid, await db.documentos({ cliente_id: cid }));
      const ex = cid && jaTem.get(cid).find((d) => d.nome_arquivo === a.nome && +d.tamanho === a.arquivo.size);
      const doc = ex || await db.enviarDocumento(a.arquivo, { cliente_id: cid, departamento: a.departamento, competencia: a.competencia, tipo: a.tipo, dados: resumoDoc(a) });
      if (!ex) conta.arquivos++;
      a.documento = doc;
      if (!cid) continue;
      const d = a.dados || {};
      switch (a.tipo) {
        case 'ferias_programacao':
          for (const x of d.colaboradores) {
            const f = await colaborador(cid, x, conta);
            await db.gravar('ferias_periodos', x.periodos.map((p) => ({ cliente_id: cid, funcionario_id: f.id, inicio: p.inicio, fim: p.fim, dias_direito: p.dias_direito, dias_gozados: p.dias_gozados, dias_restantes: p.dias_restantes, limite: p.limite, faltas: p.faltas, data_base: d.data_base, documento_id: doc.id })), 'funcionario_id,inicio');
            conta.periodos += x.periodos.length;
            for (const p of x.periodos.filter((p) => p.gozo_inicio)) await db.salvarMarcacao({ id: `dominio-${f.id}-${p.gozo_inicio}`, cliente_id: cid, funcionario_id: f.id, inicio: p.gozo_inicio, dias: p.gozo_dias || 30, abono: p.gozo_abono || 0, obs: 'Programada no Domínio' });
          }
          break;
        case 'folha_extrato': case 'holerites': case 'liquidos': {
          const linhas = [];
          for (const x of d.colaboradores) {
            const f = await colaborador(cid, x, conta);
            linhas.push({ cliente_id: cid, competencia: a.competencia, funcionario_id: f.id, ...(x.salario ? { salario: x.salario } : {}), ...(x.proventos != null ? { proventos: x.proventos, descontos: x.descontos } : {}), ...(x.liquido != null ? { liquido: x.liquido } : {}), ...(x.fgts != null ? { fgts: x.fgts } : {}), ...(x.eventos?.length ? { eventos: x.eventos } : {}), documento_id: doc.id });
          }
          if (a.competencia && linhas.length) { await db.gravar('folha_itens', linhas, 'cliente_id,competencia,funcionario_id'); conta.folhas++; }
          if (d.colaboradores.some((x) => !x.contribuinte) && !c.tem_funcionarios) await db.salvarCliente({ id: cid, tem_funcionarios: true });
          break;
        }
        case 'folha_resumo':
          if (a.competencia) { await db.gravar('folha_resumos', { cliente_id: cid, competencia: a.competencia, proventos: d.proventos, descontos: d.descontos, liquido: d.liquido, fgts: d.fgts, inss: d.inss, irrf: d.irrf, sal_familia: d.sal_familia || 0, sal_maternidade: d.sal_maternidade || 0, empregados: d.empregados, contribuintes: d.contribuintes, admissoes: d.admissoes, demitidos: d.demitidos, rubricas: d.rubricas, documento_id: doc.id }, 'cliente_id,competencia'); conta.folhas++; }
          break;
        case 'guia_fgts': case 'guia_darf_dp': case 'guia_darf_fiscal': case 'guia_das': case 'guia_sindical':
          if (a.competencia && !a.semTexto) { await db.gravar('guias', { cliente_id: cid, tipo: a.tipo, competencia: a.competencia, vencimento: d.vencimento || null, valor: d.valor || null, numero: d.numero || d.identificador || null, detalhe: { codigos: d.codigos || [], beneficiario: d.beneficiario || null, trabalhadores: d.trabalhadores || null }, documento_id: doc.id }, 'cliente_id,tipo,competencia'); conta.guias++; }
          break;
        case 'cartao_ponto':
          for (const x of d.colaboradores || []) {
            if (!x.nome) continue;
            const f = await colaborador(cid, { nome: x.nome, cpf: x.cpf, admissao: x.admissao, cargo: x.funcao ? x.funcao[0] + x.funcao.slice(1).toLowerCase() : null }, conta);
            // "dias" guarda o cartão inteiro: batidas de cada dia, horário previsto e totais do relógio
            await db.gravar('ponto_cartoes', { cliente_id: cid, funcionario_id: f.id, competencia: a.competencia, periodo_ini: d.periodo?.ini || a.competencia + '-01', periodo_fim: d.periodo?.fim || null, dias: { dias: x.dias, horario: x.horario || {}, totais: x.totais || {}, funcao: x.funcao || null, departamento: x.departamento || null, nFolha: x.nFolha || null }, documento_id: doc.id }, 'funcionario_id,periodo_ini');
            conta.ponto++;
          }
          break;
        case 'ficha_colaborador': {
          // a ficha preenchida vale mais que o que já estava: completa e corrige o cadastro
          const x = d.colaborador; if (!x.nome) throw new Error('Ficha sem o nome do colaborador.');
          const f = await colaborador(cid, x, conta);
          const campos = Object.fromEntries(Object.entries(x).filter(([k, v]) => v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && k !== 'nome'));
          if (x.nome && x.nome.length >= (f.nome || '').length) campos.nome = x.nome;
          await db.salvarFuncionario({ id: f.id, ...campos });
          break;
        }
        case 'nota':
          try { await db.inserirNota({ ...linhaPainel(a.dados, c.cnpj), cliente_id: cid, documento_id: doc.id, competencia: a.competencia }); conta.notas++; } catch (e) { if (!/já importada|duplicate/i.test(e.message)) throw e; }
          break;
        case 'cancelamento': await db.inserirCancelamento({ chave: d.chave, data: d.data, motivo: d.motivo, documento_id: doc.id }); break;
        case 'inutilizacao': await db.inserirInutilizacao({ cliente_id: cid, modelo: d.modelo, serie: d.serie, n_ini: d.n_ini, n_fin: d.n_fin, data: d.data, competencia: a.competencia, motivo: d.motivo, documento_id: doc.id }); break;
        default: break;
      }
      await concluirObrigacao(cid, a.competencia, a, conta);
      a.feito = true;
    } catch (e) { a.erro = e.message; conta.erros.push(`${a.nome}: ${e.message}`); }
  }
  limparCacheTarefas();
  await db.registrar('Importação automática', `${conta.arquivos} arquivo(s), ${conta.colabNovos} colaborador(es) novo(s), ${conta.periodos} período(s) de férias, ${conta.guias} guia(s), ${conta.notas} nota(s)`);
  return conta;
}
// o que fica guardado junto com o documento (pequeno; os dados grandes vão para as tabelas próprias)
function resumoDoc(a) {
  const d = a.dados || {};
  if (a.tipo === 'nota') return { ...d, tipo: 'nota' };
  if (a.tipo === 'extrato') return d;
  return { tipoDoc: a.tipo, resumo: previa(a), valor: d.valor ?? d.liquido ?? null, vencimento: d.vencimento || null, semTexto: !!a.semTexto };
}
