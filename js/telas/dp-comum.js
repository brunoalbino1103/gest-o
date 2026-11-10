// Regras e listas usadas pelas telas do Departamento Pessoal.
import { hojeISO, semAcento, esc } from '../util.js';
import { S } from '../estado.js';

export const PORTES = { mei: 'MEI', me: 'Microempresa (ME)', epp: 'Pequeno porte (EPP)', demais: 'Demais' };
export const ATIVIDADES = { comercio: 'Comércio', servico: 'Serviço', industria: 'Indústria', misto: 'Comércio e serviço', rural: 'Rural', outro: 'Outro' };

const dia = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const ano = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const ult = new Date(y + n, m, 0).getDate(); return `${y + n}-${String(m).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`; };
export const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

// Contrato de experiência: vencimento do 1º período e do total
export function experiencia(f) {
  if (!f.admissao || !f.exp_dias_total || f.situacao === 'desligado') return null;
  const v1 = f.exp_dias_1 ? dia(f.admissao, f.exp_dias_1 - 1) : null, v2 = dia(f.admissao, f.exp_dias_total - 1);
  const hoje = hojeISO();
  if (v2 < hoje) return { v1, v2, fase: 'encerrada', prox: v2, dias: diasEntre(hoje, v2) };
  const prox = v1 && v1 >= hoje ? v1 : v2;
  return { v1, v2, fase: prox === v1 ? '1º período' : 'prorrogação', prox, dias: diasEntre(hoje, prox) };
}

// Saldo de férias (mesma conta do painel de Férias): períodos completos com saldo e o limite para sair
export function situacaoFerias(f, marcacoes = []) {
  if (!f.admissao || f.situacao === 'desligado') return { abertos: [], pior: null };
  const hoje = hojeISO(), per = [];
  for (let k = 0, ini = f.admissao; ini <= hoje && k < 60; k++, ini = ano(f.admissao, k)) {
    const fim = dia(ano(ini, 1), -1); const conc = ano(fim, 1);
    per.push({ ini, fim, limite: dia(conc, -29), saldo: f.ferias_ate && fim <= f.ferias_ate ? 0 : 30, completo: fim < hoje });
  }
  marcacoes.filter((m) => m.funcionario_id === f.id && !m.oculta && m.inicio && m.inicio <= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio)).forEach((m) => {
    let d = (+m.dias || 0) + (+m.abono || 0); for (const p of per) { const u = Math.min(p.saldo, d); p.saldo -= u; d -= u; if (!d) break; }
  });
  const futuras = marcacoes.filter((m) => m.funcionario_id === f.id && !m.oculta && m.inicio > hoje);
  const abertos = per.filter((p) => p.completo && p.saldo > 0).map((p) => ({ ...p, diasLimite: diasEntre(hoje, p.limite), marcada: futuras.length > 0 }));
  const pior = abertos.sort((a, b) => a.limite.localeCompare(b.limite))[0] || null;
  return { abertos, pior };
}
export const nivelFerias = (p) => !p ? null : p.marcada ? 'marcada' : p.diasLimite < 0 ? 'vencida' : p.diasLimite <= 90 ? 'urgente' : p.diasLimite <= 240 ? 'programar' : 'prazo';

// Documentos do fechamento mensal do DP (reconhecidos pelo nome do arquivo)
export const ITENS_FECHAMENTO = [
  ['folha', 'Folha / resumo mensal', /folha|resumo/],
  ['holerites', 'Holerites (recibos de pagamento)', /holerite|recibo.{0,4}(de.)?pagamento|contracheque|recibo mensal/],
  ['liquidos', 'Relatório de líquidos', /liquido/],
  ['darf', 'Guia DARF (DCTFWeb)', /darf/],
  ['dctf', 'Recibo da DCTFWeb', /dctf|^recibo_\d{14}/],
  ['fgts', 'Guia do FGTS Digital', /fgts/],
  ['fgts_det', 'Detalhe / RE do FGTS', /detalhe.{0,6}fgts|re.fgts|relatorio.{0,8}fgts|relatorioextrato|extrato.{0,4}process/],
  ['sindical', 'Contribuição sindical / assistencial', /sindic|assistencial|c.assist/],
  ['ponto', 'Cartões de ponto', /ponto/],
  ['ferias', 'Programação de férias', /programa.{0,3}o.{0,4}de.{0,3}f.rias|ferias/],
];
export function tipoFechamento(nome) {
  const n = semAcento(nome).replace(/[_.\-]+/g, ' ');
  if (/detalhe.{0,6}fgts|re fgts|relatorio.{0,8}fgts|relatorioextrato|extrato.{0,4}process/.test(n)) return 'fgts_det';
  for (const [k, , re] of ITENS_FECHAMENTO) if (k !== 'fgts_det' && re.test(n)) return k;
  return null;
}

export const empresasDP = () => S.clientes.filter((c) => c.ativo && (c.tem_funcionarios || c.regime !== 'mei')).sort((a, b) => (a.nome_fantasia || a.razao_social).localeCompare(b.nome_fantasia || b.razao_social, 'pt'));
export const nomeEmp = (c) => c ? (c.nome_fantasia || c.razao_social) : '';
export const escolhaEmpresa = (titulo, lista, rota) => `<div class="card"><div class="card-h"><h2>${esc(titulo)}</h2></div><div class="card-b"><div class="escolha-emp">${lista.map((c) => `<button data-escolhe="${c.id}" data-rota="${rota}"><b>${esc(nomeEmp(c))}</b><span>${esc(c.razao_social)}</span></button>`).join('') || '<p class="muted">Nenhuma empresa cadastrada.</p>'}</div></div></div>`;
