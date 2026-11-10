// Funções pequenas usadas em todo o sistema.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const DEPS = {
  fiscal: { nome: 'Fiscal', longo: 'Departamento Fiscal', cor: '#2F5BEA' },
  dp: { nome: 'Pessoal', longo: 'Departamento Pessoal', cor: '#7A4FD6' },
  contabil: { nome: 'Contábil', longo: 'Contabilidade', cor: '#0E8A7E' },
};
export const REGIMES = { mei: 'MEI', simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' };
export const STATUS = {
  pendente: 'Pendente', andamento: 'Em andamento', concluida: 'Concluída', nao_aplica: 'Não se aplica',
};
export const TIPOS_DOC = {
  nfe: 'NF-e', nfce: 'NFC-e', nfse: 'NFS-e', cte: 'CT-e', evento: 'Evento de nota (cancelamento)', inutilizacao: 'Inutilização de numeração', guia: 'Guia de imposto', holerite: 'Holerite / folha',
  ponto: 'Ponto', atestado: 'Atestado', extrato: 'Extrato bancário', contrato: 'Contrato / societário',
  balancete: 'Balancete / relatório', planilha: 'Planilha', outro: 'Outro',
};
export const DEP_DO_TIPO = {
  nfe: 'fiscal', nfce: 'fiscal', nfse: 'fiscal', cte: 'fiscal', evento: 'fiscal', inutilizacao: 'fiscal', guia: 'fiscal', holerite: 'dp', ponto: 'dp',
  atestado: 'dp', extrato: 'contabil', contrato: 'contabil', balancete: 'contabil', planilha: null, outro: null,
};

// ---- datas e competência (sempre "AAAA-MM") ----
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const somaMes = (c, n) => { let [y, m] = c.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); };
export const compPadrao = () => somaMes(hojeISO().slice(0, 7), -1); // o escritório fecha o mês anterior
export const nomeComp = (c, curto) => { if (!c) return '—'; const [y, m] = c.split('-'); const n = MESES[+m - 1]; return curto ? n.slice(0, 3) + '/' + y : n[0].toUpperCase() + n.slice(1) + ' de ' + y; };
export const dataBR = (iso) => { if (!iso) return '—'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
export const diasAte = (iso) => Math.round((new Date(iso + 'T12:00:00') - new Date(hojeISO() + 'T12:00:00')) / 86400000);
// vencimento de uma obrigação para a competência (mesma regra da função gerar_tarefas do banco)
export const vencimento = (comp, dia, mesSeguinte) => {
  const c = mesSeguinte ? somaMes(comp, 1) : comp; const [y, m] = c.split('-').map(Number);
  const ult = new Date(y, m, 0).getDate(); return c + '-' + String(Math.min(dia, ult)).padStart(2, '0');
};

// ---- números e documentos ----
export const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
export const fmtCNPJ = (s) => { const d = soDigitos(s); if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'); return s || ''; };
export const cnpjValido = (s) => {
  const d = soDigitos(s); if (d.length === 11) return true; if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === +d[12] && calc(13) === +d[13];
};
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v) => BRL.format(+v || 0);
export const num = (v) => new Intl.NumberFormat('pt-BR').format(+v || 0);
export const tamanho = (b) => b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
export const iniciais = (n) => String(n || '?').split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || String(n || '?')[0].toUpperCase();
export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---- situação de uma tarefa / de um conjunto ----
export const atrasada = (t) => (t.status === 'pendente' || t.status === 'andamento') && t.vencimento && t.vencimento < hojeISO();
export const situacao = (lista) => {
  const l = lista.filter((t) => t.status !== 'nao_aplica');
  if (!lista.length) return 'vazio';
  if (!l.length) return 'na';
  if (l.some(atrasada)) return 'atraso';
  if (l.every((t) => t.status === 'concluida')) return 'ok';
  return 'aberto';
};
export const SIT = {
  ok: { rot: 'Tudo concluído', cls: 'ok', ic: '✓' },
  aberto: { rot: 'Em aberto, no prazo', cls: 'at', ic: '!' },
  atraso: { rot: 'Com atraso', cls: 'bad', ic: '×' },
  na: { rot: 'Não se aplica', cls: 'na', ic: '–' },
  vazio: { rot: 'Sem tarefas', cls: 'na', ic: '·' },
};

// ---- avisos rápidos ----
export function aviso(msg, tipo = 'ok') {
  let box = $('#avisos'); if (!box) { box = document.createElement('div'); box.id = 'avisos'; box.setAttribute('role', 'status'); document.body.append(box); }
  const a = document.createElement('div'); a.className = 'aviso ' + tipo; a.textContent = msg; box.append(a);
  setTimeout(() => { a.classList.add('sai'); setTimeout(() => a.remove(), 300); }, tipo === 'erro' ? 6000 : 3200);
}

// ---- janela modal simples ----
export function modal(titulo, corpoHTML, { largura = 560, aoAbrir } = {}) {
  return new Promise((resolve) => {
    const fundo = document.createElement('div'); fundo.className = 'modal-fundo';
    fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" style="max-width:${largura}px"><div class="modal-h"><h2>${esc(titulo)}</h2><button class="btn-x" data-fecha aria-label="Fechar">×</button></div><div class="modal-b">${corpoHTML}</div></div>`;
    document.body.append(fundo);
    const fechar = (v) => { fundo.remove(); document.removeEventListener('keydown', tecla); resolve(v); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(null); };
    document.addEventListener('keydown', tecla);
    fundo.addEventListener('click', (e) => { if (e.target === fundo || e.target.closest('[data-fecha]')) fechar(null); });
    const primeiro = fundo.querySelector('input,select,textarea'); if (primeiro) primeiro.focus();
    if (aoAbrir) aoAbrir(fundo.querySelector('.modal'), fechar);
  });
}
export const confirmar = (titulo, texto, botao = 'Confirmar') => modal(titulo, `<p class="mt0">${esc(texto)}</p><div class="acoes"><button class="btn sec" data-fecha>Cancelar</button><button class="btn perigo" data-sim>${esc(botao)}</button></div>`, { largura: 440, aoAbrir: (m, fechar) => m.querySelector('[data-sim]').addEventListener('click', () => fechar(true)) });

export function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo })); const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
