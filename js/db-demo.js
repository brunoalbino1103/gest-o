// MODO DEMONSTRAÇÃO: mesma interface do db-supabase.js, mas tudo fica só neste navegador.
// Serve para testar as telas antes de ligar o Supabase. Poucos clientes, todos fictícios.
import { somaMes, compPadrao, hojeISO } from './util.js';
import { tarefasParaGerar, OBRIGACOES_PADRAO } from './regras.js';

const CHAVE = 'contabil_demo_v5';
const id = () => crypto.randomUUID();
let D = null;
const grava = () => { try { localStorage.setItem(CHAVE, JSON.stringify(D)); } catch (e) { /* cheio: segue só em memória */ } };
const copia = (o) => JSON.parse(JSON.stringify(o));
const espera = () => new Promise((r) => setTimeout(r, 40));

// arquivos ficam no IndexedDB do navegador
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('contabil_demo_arquivos', 1); r.onupgradeneeded = () => r.result.createObjectStore('arq'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbPut = async (k, v) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('arq', 'readwrite'); t.objectStore('arq').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); };
const idbGet = async (k) => { const db = await idb(); return new Promise((res) => { const r = db.transaction('arq').objectStore('arq').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); };
const idbDel = async (k) => { const db = await idb(); db.transaction('arq', 'readwrite').objectStore('arq').delete(k); };

function cnpjTeste(i) {
  const b = ('1' + String(i + 1).padStart(3, '0') + '2345' + '0001').split('').map(Number);
  const dv = (a) => { let s = 0, p = a.length - 7; for (const x of a) { s += x * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  b.push(dv(b)); b.push(dv(b)); return b.join('');
}
// gerador de números "aleatórios" sempre igual (para os dados de teste não mudarem a cada carga)
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- notas fictícias no formato do Painel Fiscal ----------
const PRODUTOS = [
  ['Ar-condicionado Split 9000 BTUs Inverter', '84151011', 1890], ['Ar-condicionado Split 12000 BTUs Inverter', '84151011', 2390],
  ['Ventilador de Teto 3 Pás com Luminária', '84145110', 289], ['Climatizador Portátil 12 Litros', '84798912', 459],
  ['Controle Remoto Universal para Ar-condicionado', '85437099', 49], ['Suporte para Condensadora 450mm', '73269090', 79],
  ['Kit Instalação Ar-condicionado 3 metros', '84159020', 189], ['Cortina de Ar 90cm', '84145990', 699],
];
const UFS = [['SP', 0], ['SP', 0], ['SP', 0], ['RJ', 0.08], ['MG', 0.06], ['PR', 0.075], ['BA', 0.085], ['PE', 0.085], ['RS', 0.05], ['SC', 0.05], ['GO', 0.07]];
const NOMES = ['Lucas Andrade', 'Mariana Costa', 'Pedro Henrique Lima', 'Ana Beatriz Rocha', 'Rafael Moreira', 'Juliana Pires', 'Carlos Eduardo Nunes', 'Fernanda Alves', 'Bruno Teixeira', 'Patrícia Gomes', 'Diego Martins', 'Camila Ribeiro'];
const MOTIVOS = ['Cliente desistiu da compra', 'Erro no valor da nota', 'Duplicidade de emissão', 'Endereço de entrega incorreto'];
function chaveNFe(uf, comp, cnpj, mod, serie, n, r) {
  const aamm = comp.slice(2, 4) + comp.slice(5, 7);
  const base = String(uf) + aamm + cnpj + mod + String(serie).padStart(3, '0') + String(n).padStart(9, '0') + '1' + String(Math.floor(r() * 1e8)).padStart(8, '0');
  let s = 0, p = 2; for (let i = base.length - 1; i >= 0; i--) { s += +base[i] * p; p = p === 9 ? 2 : p + 1; } const dv = 11 - (s % 11);
  return base + (dv >= 10 ? 0 : dv);
}
function notasComercio(cli, meses) {
  const r = rng(42), out = [], inut = [], canc = [];
  let num = 3100;
  for (const comp of meses) {
    const [y, m] = comp.split('-').map(Number), ult = new Date(y, m, 0).getDate();
    const qtd = 60 + Math.floor(r() * 25);
    for (let k = 0; k < qtd; k++) {
      num++;
      if (r() < 0.03) { // número pulado: metade fica explicada por inutilização, o resto aparece em "Notas Faltando"
        if (r() < 0.5) inut.push({ modelo: '55', serie: '1', n_ini: num, n_fin: num, data: `${comp}-15`, competencia: comp, motivo: 'Falha na emissão' });
        continue;
      }
      const dia = String(1 + Math.floor(r() * ult)).padStart(2, '0'), data = `${comp}-${dia}`;
      const [nome, ncm, preco] = PRODUTOS[Math.floor(r() * PRODUTOS.length)];
      const qt = r() < 0.85 ? 1 : 2; const [uf, difAliq] = UFS[Math.floor(r() * UFS.length)];
      const valor = Math.round(preco * qt * (0.9 + r() * 0.2) * 100) / 100, inter = uf !== 'SP';
      const chave = chaveNFe(35, comp, cli.cnpj, '55', 1, num, r);
      const cancelada = r() < 0.03;
      const difal = inter ? Math.round(valor * difAliq * 100) / 100 : 0, fcp = uf === 'RJ' ? Math.round(valor * 0.02 * 100) / 100 : 0;
      out.push({ data, numero: String(num), serie: '1', chave, categoria: 'Venda', tipo_documento: 'NF-e', destinatario: NOMES[Math.floor(r() * NOMES.length)], doc_destinatario: String(10000000000 + Math.floor(r() * 89999999999)),
        uf_destino: uf, produto: nome, cfop: inter ? '6102' : '5102', ncm, aliquota_icms: inter ? (['MG', 'PR', 'RS', 'SC', 'RJ'].includes(uf) ? '12.00%' : '7.00%') : '18.00%',
        valor_frete: 0, valor_icms: 0, valor_ipi: 0, valor_pis: 0, valor_cofins: 0, valor_ibs: 0, valor_cbs: 0, valor_difal: difal, valor_fcp_difal: fcp,
        valor_total_tributos: Math.round(valor * 0.12 * 100) / 100, valor_nf: valor, iss: 0, sentido: 'saida', emitente_proprio: true, finalidade: '1', cancelada,
        difal_pago: inter && !cancelada && r() < 0.7, difal_data_pagamento: null, difal_comprovante: null, difal_juros: 0, difal_multa: 0 });
      if (cancelada) canc.push({ chave, data, motivo: MOTIVOS[Math.floor(r() * MOTIVOS.length)] });
      if (r() < 0.05 && !cancelada) { // devolução: nota de entrada própria
        num++; const dd = `${comp}-${String(Math.min(ult, +dia + 5)).padStart(2, '0')}`;
        out.push({ ...out[out.length - 1], data: dd, numero: String(num), chave: chaveNFe(35, comp, cli.cnpj, '55', 1, num, r), categoria: 'Devolução', cfop: inter ? '2202' : '1202', valor_difal: 0, valor_fcp_difal: 0, sentido: 'entrada', finalidade: '4', difal_pago: false, cancelada: false });
      }
    }
    for (let k = 0; k < 12; k++) { // fretes
      const [uf] = UFS[3 + Math.floor(r() * (UFS.length - 3))]; const v = Math.round((35 + r() * 120) * 100) / 100;
      out.push({ data: `${comp}-${String(1 + Math.floor(r() * ult)).padStart(2, '0')}`, numero: String(50000 + Math.floor(r() * 9999)), serie: '1', chave: chaveNFe(35, comp, '22333444000181', '57', 1, 50000 + k, r), categoria: 'CT-e (Frete)', tipo_documento: 'CT-e',
        destinatario: 'Transportadora Exemplo Ltda', doc_destinatario: '22333444000181', uf_destino: uf, produto: 'Frete/Transporte', cfop: '6353', ncm: '', aliquota_icms: '12.00%',
        valor_frete: v, valor_icms: Math.round(v * 0.12 * 100) / 100, valor_ipi: 0, valor_pis: 0, valor_cofins: 0, valor_ibs: 0, valor_cbs: 0, valor_difal: 0, valor_fcp_difal: 0, valor_total_tributos: 0, valor_nf: v, iss: 0,
        sentido: 'entrada', emitente_proprio: false, finalidade: '1', cancelada: false, difal_pago: false });
    }
  }
  // inutilizações explicam alguns dos números pulados
  return { notas: out, inut, canc };
}
function notasServico(cli, meses) {
  const r = rng(7), out = []; let num = 140;
  const TOM = [['Construtora Horizonte Ltda', '33444555000172', 'SP'], ['Rede Varejo Sul Ltda', '44555666000161', 'PR'], ['Hospital Bem Estar', '55666777000150', 'SP']];
  for (const comp of meses) for (let k = 0; k < 6; k++) {
    num++; const [nome, doc, uf] = TOM[Math.floor(r() * TOM.length)]; const v = Math.round((3000 + r() * 9000) * 100) / 100;
    out.push({ data: `${comp}-${String(5 + k * 4).padStart(2, '0')}`, numero: String(num), serie: '', chave: `nfse-${cli.cnpj}-${num}`, categoria: 'Venda', tipo_documento: 'NFS-e', destinatario: nome, doc_destinatario: doc, uf_destino: uf,
      produto: 'Consultoria em gestão empresarial', cfop: '', ncm: '', aliquota_icms: '', valor_frete: 0, valor_icms: 0, valor_ipi: 0, valor_pis: Math.round(v * 0.0065 * 100) / 100, valor_cofins: Math.round(v * 0.03 * 100) / 100,
      valor_ibs: 0, valor_cbs: 0, valor_difal: 0, valor_fcp_difal: 0, valor_total_tributos: 0, valor_nf: v, iss: Math.round(v * 0.05 * 100) / 100, sentido: 'saida', emitente_proprio: true, finalidade: '1', cancelada: false, difal_pago: false });
  }
  return out;
}

function gera(comp) { const n = tarefasParaGerar(comp, D.clientes, D.obrigacoes, D.tarefas.filter((t) => t.competencia === comp)); n.forEach((t) => D.tarefas.push({ id: id(), ...t, observacao: null, concluida_em: null, concluida_por: null, criado_em: new Date().toISOString() })); return n.length; }

function semear() {
  const eu = 'demo-admin';
  D = { perfis: [
    { id: eu, nome: 'Você (administrador)', email: 'demo@escritorio.test', departamento: 'admin', ativo: true },
    { id: 'demo-ana', nome: 'Ana', email: 'ana@escritorio.test', departamento: 'fiscal', ativo: true },
    { id: 'demo-rafael', nome: 'Rafael', email: 'rafael@escritorio.test', departamento: 'dp', ativo: true },
  ], clientes: [], obrigacoes: [], tarefas: [], documentos: [], notas: [], cancelamentos: [], inutilizacoes: [], feriados: [], funcionarios: [], movimentacoes: [], historico: [], logado: null };
  D.obrigacoes = OBRIGACOES_PADRAO.map((o) => ({ id: id(), ...o }));
  const base = { inscricao_estadual: '', inscricao_municipal: '', email_financeiro: '', telefone: '', observacoes: '', ativo: true, criado_em: new Date().toISOString(), resp_fiscal: 'demo-ana', resp_dp: 'demo-rafael', resp_contabil: eu };
  D.clientes = [
    { ...base, id: id(), razao_social: 'Casa & Clima Comércio Ltda', nome_fantasia: 'Casa & Clima', cnpj: cnpjTeste(2), regime: 'simples', porte: 'epp', atividade: 'comercio', codigo: '101', uf: 'SP', municipio: 'São José dos Campos', tem_funcionarios: true, email: 'contato@casaclima.test', email_dp: 'rh@casaclima.test' },
    { ...base, id: id(), razao_social: 'Serviços Integrados Ltda', nome_fantasia: 'Serviços Integrados', cnpj: cnpjTeste(1), regime: 'presumido', porte: 'me', atividade: 'servico', codigo: '102', uf: 'SP', municipio: 'São Paulo', tem_funcionarios: true, email: 'adm@servicos.test', email_dp: 'dp@servicos.test' },
    { ...base, id: id(), razao_social: 'Oficina Exemplo', nome_fantasia: 'Oficina Exemplo', cnpj: cnpjTeste(5), regime: 'mei', porte: 'mei', atividade: 'servico', codigo: '103', uf: 'SP', municipio: 'Jacareí', tem_funcionarios: false, email: 'oficina@exemplo.test', email_dp: '' },
  ];
  const atual = compPadrao(), meses = [somaMes(atual, -2), somaMes(atual, -1), atual];
  const [cc, si] = D.clientes;
  const com = notasComercio(cc, meses);
  D.notas = [...com.notas.map((n) => ({ id: id(), cliente_id: cc.id, competencia: n.data.slice(0, 7), documento_id: null, ...n })), ...notasServico(si, meses).map((n) => ({ id: id(), cliente_id: si.id, competencia: n.data.slice(0, 7), documento_id: null, ...n }))];
  D.cancelamentos = com.canc; D.inutilizacoes = com.inut.map((i) => ({ id: id(), cliente_id: cc.id, ...i }));
  // funcionários fictícios com admissões variadas (gera férias vencidas, urgentes, a programar e em formação)
  const hj = hojeISO(), mais = (anos, dias = 0) => { const d = new Date(hj + 'T12:00:00'); d.setFullYear(d.getFullYear() + anos); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
  const F = [
    [cc, 'Lucas Andrade Silva', 'Vendedor(a) interno', 'Comercial', mais(-3, -40), mais(-1, -41)], [cc, 'Mariana Costa Rocha', 'Assistente administrativo', 'Administrativo', mais(-2, -330), mais(-1, -331)],
    [cc, 'Pedro Henrique Lima', 'Técnico de instalação', 'Instalação', mais(-2, -20), null], [cc, 'Juliana Pires Alves', 'Vendedor(a) interno', 'Comercial', mais(-1, -200), null],
    [cc, 'Rafael Moreira Santos', 'Técnico de instalação', 'Instalação', mais(-1, -100), null], [cc, 'Fernanda Gomes Dias', 'Auxiliar de estoque', 'Estoque', mais(0, -150), null],
    [cc, 'Carlos Eduardo Nunes', 'Gerente comercial', 'Comercial', mais(-5, -60), mais(-1, -61)], [si, 'Patrícia Gomes Ramos', 'Analista financeiro', 'Financeiro', mais(-2, -95), mais(-1, -96)],
    [si, 'Diego Martins Melo', 'Consultor', 'Consultoria', mais(-1, -300), null], [si, 'Camila Ribeiro Souza', 'Consultor', 'Consultoria', mais(0, -60), null],
  ];
  D.funcionarios = F.map(([c, nome, cargo, setor, admissao, ferias_ate], i) => ({ id: id(), cliente_id: c.id, nome, cargo, setor, admissao, ferias_ate, codigo: String(10 + i), cpf: '', situacao: 'ativo', desligamento: null, exp_dias_1: null, exp_dias_total: null, observacoes: '', criado_em: new Date().toISOString() }));
  // uma pessoa de férias agora, uma com saída marcada e uma falta
  const proxSeg = (d) => { const x = new Date(d + 'T12:00:00'); while (x.getDay() !== 1) x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); };
  D.ferias_marcacoes = [
    { id: 'mk-demo1', cliente_id: cc.id, funcionario_id: D.funcionarios[1].id, inicio: proxSeg(mais(0, -12)), dias: 20, abono: 10, obs: '' },
    { id: 'mk-demo2', cliente_id: si.id, funcionario_id: D.funcionarios[7].id, inicio: proxSeg(mais(0, 35)), dias: 30, abono: 0, obs: 'Pedido da colaboradora' },
  ];
  // experiência: a mais nova está nos 90 dias de contrato de experiência
  Object.assign(D.funcionarios[5], { exp_dias_1: 45, exp_dias_total: 90, admissao: mais(0, -40) }); Object.assign(D.funcionarios[9], { exp_dias_1: 30, exp_dias_total: 90, admissao: mais(0, -25) });
  D.dp_empresas = [
    { cliente_id: cc.id, sindicato: 'Sindicato dos Comerciários (exemplo)', cct_registro: 'SP000000/2026', cct_vigencia_ini: '2026-09-01', cct_vigencia_fim: '2027-08-31', data_base_mes: 9, piso_salarial: 1980, jornada_semanal: 44, horario_padrao: 'Seg a sex 08:00-18:00, sáb 08:00-12:00', he_dia_util: 60, he_domingo: 100, adicional_noturno: 20, vr_dia: 25, vt_dia: 13, contribuicao_assistencial: '1% do salário, com direito de oposição', observacoes: 'Exemplo fictício' },
    { cliente_id: si.id, sindicato: 'Sindicato das Empresas de Serviços (exemplo)', cct_registro: '', cct_vigencia_ini: '2026-05-01', cct_vigencia_fim: '2027-04-30', data_base_mes: 5, piso_salarial: 2150, jornada_semanal: 40, horario_padrao: 'Seg a sex 09:00-18:00', he_dia_util: 50, he_domingo: 100, adicional_noturno: 20, vr_dia: 32, vt_dia: 0, contribuicao_assistencial: '', observacoes: '' },
  ];
  D.movimentacoes = [{ id: id(), cliente_id: cc.id, funcionario_id: null, tipo: 'admissao', nome: 'Nova contratação (exemplo)', data_evento: mais(0, 5), prazo: mais(0, 4), status: 'pendente', detalhe: { cargo: 'Vendedor(a) interno' }, observacao: 'Aguardando documentos do candidato', criado_em: new Date().toISOString() }];
  D.faltas = [{ id: id(), cliente_id: cc.id, funcionario_id: D.funcionarios[3].id, data: mais(0, -40), quantidade: 7, fonte: 'Cartão de ponto' }];

  // tarefas: mês anterior quase todo concluído, mês atual em andamento
  const ant = somaMes(atual, -1); gera(ant); gera(atual);
  const r = rng(3);
  D.tarefas.forEach((t) => {
    const k = r();
    if (t.competencia === ant) t.status = k < 0.9 ? 'concluida' : 'pendente';
    else t.status = t.vencimento < hojeISO() ? (k < 0.7 ? 'concluida' : 'pendente') : (k < 0.25 ? 'concluida' : k < 0.45 ? 'andamento' : 'pendente');
    if (t.status === 'concluida') { t.concluida_em = new Date().toISOString(); t.concluida_por = t.responsavel || eu; }
  });
  grava();
}
function carrega() { if (D) return; try { D = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { D = null; } if (!D || !D.clientes) semear(); try { ['contabil_demo_v1', 'contabil_demo_v2', 'contabil_demo_v3', 'contabil_demo_v4'].forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ok */ } }

let ouvinte = null;
const filtra = (l, f) => l.filter((x) => Object.entries(f).every(([k, v]) => v === undefined || v === null || v === '' || x[k] === v));

export default {
  demo: true,
  async usuario() { carrega(); const p = D.perfis.find((p) => p.id === D.logado); return p ? { id: p.id, email: p.email } : null; },
  aoMudarSessao(cb) { ouvinte = cb; },
  async entrar(email) { carrega(); await espera(); const p = D.perfis.find((p) => p.email === String(email).trim().toLowerCase()) || D.perfis[0]; D.logado = p.id; grava(); ouvinte && ouvinte({ id: p.id, email: p.email }); },
  async sair() { D.logado = null; grava(); ouvinte && ouvinte(null); },
  async trocarSenha() { await espera(); },
  async esqueciSenha() { await espera(); },
  async meuPerfil() { carrega(); return copia(D.perfis.find((p) => p.id === D.logado) || null); },
  async perfis() { carrega(); return copia(D.perfis); },
  async salvarPerfil(p) { const i = D.perfis.findIndex((x) => x.id === p.id); Object.assign(D.perfis[i], { nome: p.nome, departamento: p.departamento, ativo: p.ativo }); grava(); return copia(D.perfis[i]); },

  async clientes() { carrega(); await espera(); return copia(D.clientes).sort((a, b) => a.razao_social.localeCompare(b.razao_social)); },
  async salvarCliente(c) {
    const d = copia(c); Object.keys(d).forEach((k) => k.startsWith('_') && delete d[k]);
    if (d.cnpj && D.clientes.some((x) => x.cnpj === d.cnpj && x.id !== d.id)) throw new Error('Já existe um cliente com esse CNPJ.');
    if (d.id) { const i = D.clientes.findIndex((x) => x.id === d.id); D.clientes[i] = { ...D.clientes[i], ...d }; grava(); return copia(D.clientes[i]); }
    const n = { ativo: true, ...d, id: id(), criado_em: new Date().toISOString() }; D.clientes.push(n); grava(); return copia(n);
  },
  async importarClientes(lista) {
    let novos = 0, atualizados = 0;
    for (const c of lista) { const x = c.cnpj && D.clientes.find((y) => y.cnpj === c.cnpj); if (x) { Object.entries(c).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') x[k] = v; }); atualizados++; } else { D.clientes.push({ ativo: true, regime: 'simples', tem_funcionarios: false, ...c, id: id(), criado_em: new Date().toISOString() }); novos++; } }
    grava(); return { novos, atualizados };
  },
  async excluirCliente(cid) { ['tarefas', 'notas', 'inutilizacoes', 'funcionarios', 'movimentacoes'].forEach((k) => { D[k] = D[k].filter((x) => x.cliente_id !== cid); }); D.clientes = D.clientes.filter((c) => c.id !== cid); D.documentos.forEach((d) => { if (d.cliente_id === cid) d.cliente_id = null; }); grava(); },

  async obrigacoes() { carrega(); return copia(D.obrigacoes).sort((a, b) => a.departamento.localeCompare(b.departamento) || a.ordem - b.ordem); },
  async salvarObrigacao(o) { if (o.id) { const i = D.obrigacoes.findIndex((x) => x.id === o.id); D.obrigacoes[i] = { ...D.obrigacoes[i], ...o }; grava(); return copia(D.obrigacoes[i]); } const n = { ativo: true, ordem: 100, ...o, id: id() }; D.obrigacoes.push(n); grava(); return copia(n); },
  async excluirObrigacao(oid) { D.obrigacoes = D.obrigacoes.filter((o) => o.id !== oid); D.tarefas.forEach((t) => { if (t.obrigacao_id === oid) t.obrigacao_id = null; }); grava(); },
  async carregarObrigacoesPadrao() { D.obrigacoes.push(...OBRIGACOES_PADRAO.map((o) => ({ id: id(), ...o }))); grava(); },

  async feriados() { carrega(); return copia(D.feriados).sort((a, b) => a.data.localeCompare(b.data)); },
  async salvarFeriado(f) { D.feriados = D.feriados.filter((x) => x.data !== f.data); D.feriados.push(f); grava(); },
  async excluirFeriado(data) { D.feriados = D.feriados.filter((x) => x.data !== data); grava(); },

  async tarefas({ competencia, cliente_id } = {}) { carrega(); await espera(); return copia(filtra(D.tarefas, { competencia, cliente_id })).sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')); },
  async atualizarTarefa(tid, campos) {
    const t = D.tarefas.find((x) => x.id === tid); Object.assign(t, campos);
    if (campos.status) { t.concluida_em = campos.status === 'concluida' ? new Date().toISOString() : null; t.concluida_por = campos.status === 'concluida' ? D.logado : null; }
    grava(); return copia(t);
  },
  async gerarTarefas(comp) { const n = gera(comp); grava(); return n; },

  async documentos({ competencia, cliente_id, departamento } = {}) { carrega(); await espera(); return copia(filtra(D.documentos, { competencia, cliente_id, departamento })).sort((a, b) => b.enviado_em.localeCompare(a.enviado_em)); },
  async enviarDocumento(arquivo, meta) {
    const caminho = `${meta.cliente_id || 'sem-cliente'}/${meta.competencia || 'sem-competencia'}/${id()}-${arquivo.name}`;
    await idbPut(caminho, arquivo);
    const d = { id: id(), ...meta, nome_arquivo: arquivo.name, caminho, tamanho: arquivo.size, mime: arquivo.type, enviado_por: D.logado, enviado_em: new Date().toISOString() };
    D.documentos.push(d); grava(); return copia(d);
  },
  async documento(did) { carrega(); return copia(D.documentos.find((d) => d.id === did) || null); },
  async linkDocumento(doc) { const b = await idbGet(doc.caminho); if (!b) throw new Error('Arquivo não encontrado neste navegador.'); return URL.createObjectURL(b); },
  async abrirDocumento(doc) { return this.linkDocumento(doc); },
  async excluirDocumento(doc) { D.documentos = D.documentos.filter((d) => d.id !== doc.id); D.notas = D.notas.filter((n) => n.documento_id !== doc.id); await idbDel(doc.caminho); grava(); },
  async atualizarDocumento(did, campos) { const d = D.documentos.find((x) => x.id === did); Object.assign(d, campos); grava(); return copia(d); },

  async notas({ competencia, cliente_id } = {}) { carrega(); return copia(filtra(D.notas, { competencia, cliente_id })); },
  async chavesExistentes(chaves) { const s = new Set(chaves); return new Set(D.notas.filter((n) => s.has(n.chave)).map((n) => n.cliente_id + '|' + n.chave)); },
  async inserirNota(n) { if (n.chave && D.notas.some((x) => x.chave === n.chave && x.cliente_id === n.cliente_id)) throw new Error('Nota já importada.'); const x = { id: id(), difal_pago: false, ...n, criado_em: new Date().toISOString() }; D.notas.push(x); grava(); return copia(x); },
  async atualizarNota(nid, campos) { const n = D.notas.find((x) => x.id === nid); Object.assign(n, campos); grava(); return copia(n); },
  async cancelamentosDe(chaves) { carrega(); const s = new Set(chaves); return copia(D.cancelamentos.filter((c) => s.has(c.chave))); },
  async inserirCancelamento(c) { D.cancelamentos = D.cancelamentos.filter((x) => x.chave !== c.chave); D.cancelamentos.push(c); D.notas.forEach((n) => { if (n.chave === c.chave) n.cancelada = true; }); grava(); },
  async inutilizacoes({ cliente_id } = {}) { carrega(); return copia(filtra(D.inutilizacoes, { cliente_id })); },
  async inserirInutilizacao(i) { if (!D.inutilizacoes.some((x) => x.cliente_id === i.cliente_id && x.serie === i.serie && x.n_ini === i.n_ini && x.n_fin === i.n_fin)) { D.inutilizacoes.push({ id: id(), ...i }); grava(); } },

  async funcionarios({ cliente_id } = {}) { carrega(); return copia(filtra(D.funcionarios, { cliente_id })).sort((a, b) => a.nome.localeCompare(b.nome)); },
  async salvarFuncionario(f) { if (f.id) { const i = D.funcionarios.findIndex((x) => x.id === f.id); D.funcionarios[i] = { ...D.funcionarios[i], ...f }; grava(); return copia(D.funcionarios[i]); } const n = { situacao: 'ativo', ...f, id: id(), criado_em: new Date().toISOString() }; D.funcionarios.push(n); grava(); return copia(n); },
  async importarFuncionarios(lista) { lista.forEach((f) => D.funcionarios.push({ situacao: 'ativo', ...f, id: id(), criado_em: new Date().toISOString() })); grava(); return lista.length; },
  async excluirFuncionario(fid) { D.funcionarios = D.funcionarios.filter((f) => f.id !== fid); D.ferias_marcacoes = D.ferias_marcacoes.filter((m) => m.funcionario_id !== fid); D.faltas = D.faltas.filter((f) => f.funcionario_id !== fid); grava(); },
  async feriasMarcacoes() { carrega(); return copia(D.ferias_marcacoes); },
  async salvarMarcacao(m) { D.ferias_marcacoes = D.ferias_marcacoes.filter((x) => x.id !== m.id); D.ferias_marcacoes.push({ ...m, atualizado_em: new Date().toISOString() }); grava(); },
  async excluirMarcacao(mid) { D.ferias_marcacoes = D.ferias_marcacoes.filter((x) => x.id !== mid); grava(); },
  async faltas({ cliente_id } = {}) { carrega(); return copia(filtra(D.faltas, { cliente_id })); },
  async salvarFalta(f) { const n = { ...f, id: id() }; D.faltas.push(n); grava(); return copia(n); },
  async excluirFalta(fid) { D.faltas = D.faltas.filter((f) => f.id !== fid); grava(); },
  async registrarLink(meta) { const d = { id: id(), ...meta, caminho: 'link:' + id(), enviado_por: D.logado, enviado_em: new Date().toISOString() }; D.documentos.push(d); grava(); return copia(d); },

  async dpEmpresas() { carrega(); return copia(D.dp_empresas || []); },
  async salvarDpEmpresa(o) { D.dp_empresas = (D.dp_empresas || []).filter((x) => x.cliente_id !== o.cliente_id); const n = { ...o, atualizado_em: new Date().toISOString() }; D.dp_empresas.push(n); grava(); return copia(n); },
  async movimentacoes({ cliente_id } = {}) { carrega(); return copia(filtra(D.movimentacoes || [], { cliente_id })).sort((a, b) => (a.prazo || '').localeCompare(b.prazo || '')); },
  async salvarMovimentacao(m) { D.movimentacoes ||= []; if (m.id) { const i = D.movimentacoes.findIndex((x) => x.id === m.id); D.movimentacoes[i] = { ...D.movimentacoes[i], ...m }; grava(); return copia(D.movimentacoes[i]); } const n = { status: 'pendente', ...m, id: id(), criado_por: D.logado, criado_em: new Date().toISOString() }; D.movimentacoes.push(n); grava(); return copia(n); },
  async excluirMovimentacao(mid) { D.movimentacoes = (D.movimentacoes || []).filter((x) => x.id !== mid); grava(); },

  async listar(tabela, filtros = {}) { carrega(); return copia(filtra(D[tabela] || [], filtros)); },
  async gravar(tabela, linhas, conflito) {
    carrega(); D[tabela] ||= []; const ch = conflito.split(',');
    for (const l of (Array.isArray(linhas) ? linhas : [linhas])) {
      const i = D[tabela].findIndex((x) => ch.every((k) => x[k] === l[k]));
      if (i >= 0) D[tabela][i] = { ...D[tabela][i], ...l, atualizado_em: new Date().toISOString() }; else D[tabela].push({ id: id(), ...l, atualizado_em: new Date().toISOString() });
    }
    grava();
  },

  async historico({ cliente_id, limite = 50 } = {}) { carrega(); return copia(filtra(D.historico, { cliente_id })).slice(-limite).reverse(); },
  async registrar(acao, detalhe, cliente_id) { carrega(); D.historico.push({ id: D.historico.length + 1, usuario: D.logado, acao, detalhe, cliente_id: cliente_id || null, em: new Date().toISOString() }); if (D.historico.length > 500) D.historico.shift(); grava(); },

  resetar() { localStorage.removeItem(CHAVE); indexedDB.deleteDatabase('contabil_demo_arquivos'); D = null; },
};
