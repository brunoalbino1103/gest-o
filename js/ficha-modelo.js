// Ficha do colaborador em Excel: o escritório gera, o colaborador preenche, e a importação lê de volta sozinha.
import { soDigitos, fmtCNPJ } from './util.js';

export const MARCA = 'FICHA DO COLABORADOR';
// [chave, rótulo, exemplo/ajuda]
const PESSOAIS = [
  ['nome', 'Nome completo', 'Maria da Silva Souza'], ['cpf', 'CPF', '123.456.789-09'], ['rg', 'RG (número e órgão)', '12.345.678-9 SSP/SP'],
  ['data_nascimento', 'Data de nascimento', '25/03/1995'], ['sexo', 'Sexo (F ou M)', 'F'], ['estado_civil', 'Estado civil', 'Solteira, casada, união estável…'],
  ['escolaridade', 'Escolaridade', 'Médio completo'], ['pis', 'PIS / NIS', '123.45678.90-1'], ['ctps', 'Carteira de trabalho (CTPS digital = CPF)', 'Digital'],
  ['telefone', 'Telefone / WhatsApp', '(12) 99999-0000'], ['email', 'E-mail', 'maria@email.com'],
  ['endereco', 'Endereço (rua, número, bairro)', 'Rua das Flores, 100, Centro'], ['cidade', 'Cidade', 'São José dos Campos'], ['uf', 'Estado (UF)', 'SP'], ['cep', 'CEP', '12200-000'],
  ['banco', 'Banco para receber o salário', 'Nubank, Caixa…'], ['agencia', 'Agência', '0001'], ['conta', 'Conta (com dígito)', '12345-6'], ['pix', 'Chave PIX', 'CPF, e-mail ou telefone'],
];
const EMPRESA = [
  ['admissao', 'Data de admissão', '01/12/2026'], ['cargo', 'Cargo', 'Vendedora'], ['salario', 'Salário (R$)', '2.000,00'],
  ['horario', 'Horário de trabalho', 'Seg a sex 08:00-17:00, sáb 08:00-12:00'], ['jornada', 'Jornada semanal', '44 horas'],
  ['experiencia', 'Contrato de experiência', '45 + 45 dias'], ['vt', 'Usa vale-transporte? (Sim/Não)', 'Sim'], ['setor', 'Setor', 'Loja'],
];
const DEP = [['nome', 'Nome'], ['parentesco', 'Parentesco'], ['nascimento', 'Data de nascimento'], ['cpf', 'CPF']];

let xlsx = null;
const carregaXLSX = () => xlsx ||= new Promise((ok, erro) => { if (window.XLSX) return ok(window.XLSX); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => ok(window.XLSX); s.onerror = () => erro(new Error('Sem internet para gerar o Excel.')); document.head.append(s); });

export async function baixarFicha(empresa) {
  const X = await carregaXLSX();
  const L = [
    [`${MARCA}`, '', '', 'chave'],
    [`Empresa: ${empresa ? empresa.razao_social : ''}`, empresa?.cnpj ? `CNPJ: ${fmtCNPJ(empresa.cnpj)}` : '', '', 'empresa'],
    ['Preencha a coluna B. A coluna C traz um exemplo. Depois devolva este arquivo para o escritório.', '', '', ''],
    [], ['DADOS DO COLABORADOR (preenchido pelo colaborador)', 'Preencha aqui', 'Exemplo', ''],
    ...PESSOAIS.map(([k, r, ex]) => [r, '', ex, k]),
    [], ['DEPENDENTES (filhos, cônjuge… deixe em branco se não tiver)', 'Preencha aqui', '', ''],
    ...[1, 2, 3, 4, 5].flatMap((i) => DEP.map(([k, r]) => [`Dependente ${i} · ${r}`, '', '', `dep${i}_${k}`])),
    [], ['DADOS DO CONTRATO (preenchido pela empresa)', 'Preencha aqui', 'Exemplo', ''],
    ...EMPRESA.map(([k, r, ex]) => [r, '', ex, k]),
    [], ['Declaro que as informações acima são verdadeiras.', '', '', ''], ['Assinatura do colaborador:', '', '', ''], ['Data:', '', '', ''],
  ];
  const ws = X.utils.aoa_to_sheet(L);
  ws['!cols'] = [{ wch: 52 }, { wch: 42 }, { wch: 36 }, { hidden: true, wch: 14 }];
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Ficha');
  const nome = (empresa ? (empresa.nome_fantasia || empresa.razao_social) : 'empresa').replace(/[^\wÀ-ú ]+/g, '').trim().replace(/\s+/g, '_');
  X.writeFile(wb, `Ficha_colaborador_${nome}.xlsx`);
}

// Lê uma ficha preenchida (linhas da planilha) -> dados do colaborador
const data = (v) => { v = String(v ?? '').trim(); let m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) return `${m[3].length === 2 ? (+m[3] > 30 ? '19' : '20') + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0].slice(0, 10) : null; };
const valor = (v) => { const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
export function ehFicha(linhas) { return linhas.slice(0, 5).some((l) => String(l[0] || '').toUpperCase().includes(MARCA)); }
export function lerFicha(linhas) {
  const v = {}; let cnpj = null, empresa = null;
  for (const l of linhas) {
    const k = String(l[3] || '').trim(), b = String(l[1] ?? '').trim();
    if (k === 'empresa') { empresa = String(l[0] || '').replace(/^Empresa:\s*/i, '').trim() || null; cnpj = soDigitos(String(l[1] || '')) || null; continue; }
    if (k && k !== 'chave' && b) v[k] = b;
  }
  const f = { nome: v.nome, cpf: soDigitos(v.cpf) || null, rg: v.rg, pis: v.pis, ctps: v.ctps, data_nascimento: data(v.data_nascimento), sexo: /^f/i.test(v.sexo || '') ? 'F' : /^m/i.test(v.sexo || '') ? 'M' : null,
    estado_civil: v.estado_civil, escolaridade: v.escolaridade, telefone: v.telefone, email: v.email, endereco: v.endereco, cidade: v.cidade, uf: (v.uf || '').toUpperCase().slice(0, 2) || null, cep: v.cep,
    banco: v.banco, agencia: v.agencia, conta: v.conta, pix: v.pix, admissao: data(v.admissao), cargo: v.cargo, salario: valor(v.salario), horario: v.horario, jornada: v.jornada, setor: v.setor };
  const exp = (v.experiencia || '').match(/(\d+)\s*\+\s*(\d+)/) || (v.experiencia || '').match(/^(\d+)/);
  if (exp) { if (exp[2]) { f.exp_dias_1 = +exp[1]; f.exp_dias_total = +exp[1] + +exp[2]; } else f.exp_dias_total = +exp[1]; f.tipo_contrato = 'experiencia'; }
  f.dependentes = [1, 2, 3, 4, 5].map((i) => ({ nome: v[`dep${i}_nome`], parentesco: v[`dep${i}_parentesco`], nascimento: data(v[`dep${i}_nascimento`]), cpf: soDigitos(v[`dep${i}_cpf`]) || null })).filter((d) => d.nome);
  Object.keys(f).forEach((k) => { if (f[k] === undefined || f[k] === '') f[k] = null; });
  return { colaborador: f, cnpj, empresa };
}
