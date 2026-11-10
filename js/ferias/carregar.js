// Alimenta o painel de Férias original com os dados do sistema:
// funcionários (cadastro), períodos aquisitivos (calculados), marcações e documentos (no banco).
import db from '../db.js';
import { NOME_ESCRITORIO } from '../config.js';
import { feriadosNacionais } from '../regras.js';

const hoje = new Date().toLocaleDateString('sv-SE');
const dia = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const ano = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const ult = new Date(y + n, m, 0).getDate(); return `${y + n}-${String(m).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`; };
// art. 130 da CLT: dias de férias conforme as faltas sem justificativa no período aquisitivo
const direitoPorFaltas = (n) => (n <= 5 ? 30 : n <= 14 ? 24 : n <= 23 ? 18 : n <= 32 ? 12 : 0);

function periodosDe(f, empresa, marcs, faltas) {
  if (!f.admissao) return [];
  const per = [];
  for (let k = 0, ini = f.admissao; ini <= hoje && k < 60; k++, ini = ano(f.admissao, k)) {
    const fim = dia(ano(ini, 1), -1), conc = ano(fim, 1);
    const nf = faltas.filter((x) => x.data >= ini && x.data <= fim).reduce((s, x) => s + (+x.quantidade || 0), 0);
    const direito = direitoPorFaltas(nf);
    const quitado = f.ferias_ate && fim <= f.ferias_ate;
    per.push({ id: `${f.id}-${ini.slice(0, 4)}`, ini, fim, conc, limite: dia(conc, -29), direito, gozados: quitado ? direito : 0, abono: 0, faltas: nf, completo: fim < hoje });
  }
  // férias que já começaram descontam dos períodos mais antigos com saldo
  marcs.filter((m) => m.inicio && m.inicio <= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio)).forEach((m) => {
    let d = +m.dias || 0, ab = +m.abono || 0;
    for (const p of per) {
      const livre = p.direito - p.gozados - p.abono; if (livre <= 0) continue;
      const usa = Math.min(livre, d); p.gozados += usa; d -= usa;
      const usaAb = Math.min(p.direito - p.gozados - p.abono, ab); p.abono += usaAb; ab -= usaAb;
      if (!d && !ab) break;
    }
  });
  const umAno = dia(hoje, -365);
  return per.filter((p) => !p.completo || p.direito - p.gozados - p.abono > 0 || p.conc >= umAno).map((p) => ({
    id: p.id, pid: f.id, empresa, funcionario: f.nome, setor: f.setor || '', inicio_aquisitivo: p.ini, fim_aquisitivo: p.fim, fim_concessivo: p.conc, limite_inicio: p.limite,
    dias_direito: String(p.direito), dias_gozados: String(p.gozados), dias_abono: String(p.abono), faltas_relatorio: String(p.faltas),
  }));
}

function feriadosMapa(extras) {
  const y = +hoje.slice(0, 4), out = {};
  for (let a = y - 1; a <= y + 2; a++) feriadosNacionais(a).forEach((n, d) => { out[d] = n === 'Carnaval' ? 'Carnaval (ponto facultativo)' : n; });
  extras.forEach((f) => { out[f.data] = f.nome; });
  return out;
}

async function iniciar() {
  if (!(await db.usuario())) { location.href = 'index.html'; return; }
  const [clientes, funcs, marcs, faltas, docs, extras] = await Promise.all([db.clientes(), db.funcionarios(), db.feriasMarcacoes(), db.faltas(), db.documentos({ departamento: 'dp' }), db.feriados().catch(() => [])]);
  const cli = new Map(clientes.filter((c) => c.ativo).map((c) => [c.id, c]));
  const nomeCli = (id) => { const c = cli.get(id); return c ? (c.nome_fantasia || c.razao_social) : ''; };
  const ativos = funcs.filter((f) => f.situacao !== 'desligado' && cli.has(f.cliente_id));
  const porId = new Map(ativos.map((f) => [f.id, f]));
  const empresas = [...new Set(ativos.map((f) => nomeCli(f.cliente_id)))].sort((a, b) => a.localeCompare(b, 'pt'));

  const D = {
    funcionarios: ativos.map((f) => ({ pid: f.id, empresa: nomeCli(f.cliente_id), codigo: f.codigo || '', funcionario: f.nome, setor: f.setor || '', cargo: f.cargo || '', admissao: f.admissao || '', no_relatorio: 'sim', no_ponto: 'sim' })),
    periodos: [], ferias: [], faltas: [], pendencias: [],
  };
  ativos.forEach((f) => {
    const ps = periodosDe(f, nomeCli(f.cliente_id), marcs.filter((m) => m.funcionario_id === f.id && !m.oculta), faltas.filter((x) => x.funcionario_id === f.id));
    D.periodos.push(...ps);
    faltas.filter((x) => x.funcionario_id === f.id).forEach((x) => {
      const p = ps.find((p) => x.data >= p.inicio_aquisitivo && x.data <= p.fim_aquisitivo);
      if (p) D.faltas.push({ id: x.id, pid: f.id, empresa: nomeCli(f.cliente_id), funcionario: f.nome, periodo: p.id, data: x.data, quantidade: String(x.quantidade), fonte: x.fonte || 'Cadastro' });
    });
    if (!f.admissao) D.pendencias.push({ id: 'adm-' + f.id, empresa: nomeCli(f.cliente_id), funcionario: f.nome, assunto: 'Sem data de admissão', detalhe: 'Sem a admissão não dá para calcular os períodos de férias. Complete o cadastro em Funcionários.', prioridade: 'Alta', com_quem: 'cadastro', pids: f.id });
  });

  // ---- marcações: o painel lê e grava a lista inteira; aqui ela vira linhas no banco ----
  window.__FERIAS_MARC = marcs.filter((m) => porId.has(m.funcionario_id)).map((m) => ({ id: m.id, pid: m.funcionario_id, inicio: m.inicio, dias: +m.dias, abono: +m.abono || 0, obs: m.obs || '', ...(m.substitui ? { substitui: m.substitui } : {}), ...(m.oculta ? { oculta: m.oculta } : {}) }));
  let antes = new Map(window.__FERIAS_MARC.map((m) => [m.id, JSON.stringify(m)]));
  let fila = Promise.resolve();
  window.__salvarMarcacoes = (lista) => {
    const agora = new Map(lista.map((m) => [m.id, JSON.stringify(m)]));
    const mudou = lista.filter((m) => antes.get(m.id) !== agora.get(m.id)), saiu = [...antes.keys()].filter((id) => !agora.has(id));
    antes = agora;
    fila = fila.then(async () => {
      for (const m of mudou) await db.salvarMarcacao({ id: m.id, funcionario_id: m.pid, cliente_id: porId.get(m.pid)?.cliente_id || null, inicio: m.inicio || null, dias: m.dias || null, abono: m.abono || 0, obs: m.obs || null, substitui: m.substitui || null, oculta: m.oculta || null });
      for (const id of saiu) await db.excluirMarcacao(id);
    }).catch((e) => alert('Não foi possível salvar a marcação de férias: ' + e.message));
  };

  // ---- documentos de férias: armazenamento do sistema ----
  const base = location.href.replace(/[^/]*$/, '');
  let mapaDocs = new Map();
  const paraPainel = (d) => { const x = d.dados || {}; return { id: d.id, docId: x.link ? null : d.id, pid: x.pid, tipo: x.tipoDoc || 'Outro', feriasId: x.feriasId || '', titulo: x.titulo || '', data: x.data || '', obs: x.obs || '', criado: d.enviado_em, nome_arquivo: x.link ? '' : d.nome_arquivo, mime: d.mime, tamanho: d.tamanho, caminho: x.link || base + 'abrir.html?doc=' + d.id }; };
  window.__docsFerias = {
    async todos() { const l = (await db.documentos({ departamento: 'dp' })).filter((d) => d.tipo === 'ferias' && porId.has(d.dados?.pid)); mapaDocs = new Map(l.map((d) => [d.id, d])); return l.map(paraPainel); },
    async salvar(d) {
      const f = porId.get(d.pid); const meta = { cliente_id: f?.cliente_id || null, departamento: 'dp', competencia: (d.data || hoje).slice(0, 7), tipo: 'ferias', dados: { pid: d.pid, feriasId: d.feriasId, tipoDoc: d.tipo, titulo: d.titulo, data: d.data, obs: d.obs, ...(d.blob ? {} : { link: d.caminho }) } };
      if (d.blob) await db.enviarDocumento(d.blob, meta); else await db.registrarLink({ ...meta, nome_arquivo: d.titulo || d.caminho });
      await db.registrar('Anexou documento de férias', `${d.tipo} · ${f?.nome || ''}`, f?.cliente_id);
    },
    async remover(id) { const d = mapaDocs.get(id); if (d) await db.excluirDocumento(d); },
  };
  void docs;

  window.__FERIAS_DADOS = D;
  window.__FERIAS_EMPRESAS = empresas;
  window.__FERIAS_FERIADOS = feriadosMapa(extras);

  // seletor de cliente (o "Empresa" do painel)
  const sel = document.getElementById('filtroEmp');
  sel.innerHTML = `<option value="todas">Todos os clientes${empresas.length ? ` (${empresas.length})` : ''}</option>` + empresas.map((e) => `<option value="${e.replace(/"/g, '&quot;')}">${e.replace(/</g, '&lt;')}</option>`).join('');
  document.getElementById('tbSub').textContent = `Departamento Pessoal · ${NOME_ESCRITORIO}`;

  const carrega = (src) => new Promise((ok, erro) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('não carregou ' + src)); document.body.append(s); });
  await carrega('js/ferias/painel-calc.js');
  await carrega('js/ferias/painel.js');
  const pc = new URLSearchParams(location.search).get('cliente');
  if (pc && cli.has(pc) && empresas.includes(nomeCli(pc))) { sel.value = nomeCli(pc); sel.dispatchEvent(new Event('change')); }
  document.getElementById('carregandoFerias').remove();
  if (!ativos.length) {
    const av = document.createElement('div');
    av.style.cssText = 'background:#EAF6FC;border:1px solid #9FD3EC;color:#075985;border-radius:10px;padding:12px 16px;font-size:13px;margin:0 0 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
    av.innerHTML = '<span>Nenhum funcionário cadastrado ainda. Cadastre ou importe os funcionários dos clientes e o painel de férias se monta sozinho.</span><a href="index.html#/funcionarios" style="margin-left:auto;background:#0090D0;color:#fff;border-radius:8px;padding:7px 14px;text-decoration:none;font-weight:600">Cadastrar funcionários</a>';
    (document.querySelector('main') || document.body).prepend(av);
  }
}
iniciar().catch((e) => { const c = document.getElementById('carregandoFerias'); if (c) c.textContent = 'Erro ao carregar: ' + e.message; console.error(e); });
