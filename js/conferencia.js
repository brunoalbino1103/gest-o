// Conferências do fechamento do DP: guias × folha e ponto × folha.
import { analisar } from './ponto.js';
import { semAcento } from './util.js';

const TOL_VALOR = 0.05, TOL_MIN = 5;
const minRef = (ref) => { const s = String(ref || ''); const m = s.match(/^(\d+):(\d{2})$/); if (m) return +m[1] * 60 + +m[2]; const n = parseFloat(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

// ---------- guias × resumo da folha ----------
export function conferirGuias(resumo, guias) {
  const g = (t) => guias.find((x) => x.tipo === t);
  const L = [];
  const fgtsFolha = resumo ? +resumo.fgts || 0 : null;
  L.push({ chave: 'guia_fgts', nome: 'FGTS Digital', folha: fgtsFolha, guia: g('guia_fgts'), regra: 'FGTS do mês no resumo da folha' });
  const inssFolha = resumo ? (+resumo.inss || 0) - (+resumo.sal_familia || 0) - (+resumo.sal_maternidade || 0) + (+resumo.irrf || 0) : null;
  L.push({ chave: 'guia_darf_dp', nome: 'DARF previdenciário (DCTFWeb)', folha: inssFolha, guia: g('guia_darf_dp'),
    regra: resumo ? `INSS ${fmt(resumo.inss)}${+resumo.sal_familia ? ' − salário-família ' + fmt(resumo.sal_familia) : ''}${+resumo.sal_maternidade ? ' − salário-maternidade ' + fmt(resumo.sal_maternidade) : ''}${+resumo.irrf ? ' + IRRF ' + fmt(resumo.irrf) : ''}` : '' });
  const sind = resumo ? (resumo.rubricas || []).filter((r) => /ASSIST|SINDIC|CONFEDER|NEGOCIAL/.test(semAcento(r.descricao).toUpperCase())).reduce((s, r) => s + (+r.valor || 0), 0) : null;
  if (g('guia_sindical') || sind) L.push({ chave: 'guia_sindical', nome: 'Contribuição assistencial / sindical', folha: sind, guia: g('guia_sindical'), regra: 'Rubricas de contribuição descontadas na folha' });
  return L.map((x) => {
    const vg = x.guia ? +x.guia.valor || 0 : null;
    let st = 'ok';
    if (x.folha === null) st = 'sem_folha'; else if (!x.guia) st = x.folha > 0 ? 'sem_guia' : 'nao_tem'; else if (Math.abs(vg - x.folha) > TOL_VALOR) st = 'diferente';
    return { ...x, valorGuia: vg, diferenca: vg !== null && x.folha !== null ? vg - x.folha : null, st };
  });
}

// ---------- ponto × folha (por colaborador) ----------
function daFolha(eventos = []) {
  const r = { he60: 0, he100: 0, faltaAtraso: 0, dsr: 0, adnot: 0, faltaDias: 0, achou: [] };
  for (const e of eventos) {
    const d = semAcento(e.descricao).toUpperCase(); const m = minRef(e.referencia);
    if (/HORA.?S?\s*EXTRA|H\.\s?E\.|\bHE\b/.test(d)) { if (/100/.test(d)) r.he100 += m || 0; else r.he60 += m || 0; r.achou.push(e); }
    else if (/DSR/.test(d) && /DESC|FALTA/.test(d)) { r.dsr += m || 0; r.achou.push(e); }
    else if (/ATRASO|SAIDAS? ANTECIPADA/.test(d)) { r.faltaAtraso += m || 0; r.achou.push(e); }
    else if (/FALTA/.test(d)) { if (/DIA/.test(d) || !String(e.referencia).includes(':')) r.faltaDias += m || 0; else r.faltaAtraso += m || 0; r.achou.push(e); }
    else if (/NOTURN/.test(d)) { r.adnot += m || 0; r.achou.push(e); }
  }
  return r;
}
export function conferirPonto(cartoes, itens, funcs) {
  return cartoes.map((c) => {
    const a = analisar(c).tot; const it = itens.find((i) => i.funcionario_id === c.funcionario_id); const f = funcs.find((x) => x.id === c.funcionario_id);
    const fo = daFolha(it?.eventos);
    const linhas = [
      { nome: 'Faltas e atrasos (horas)', ponto: a.faltasHoras || 0, folha: fo.faltaAtraso, extra: fo.faltaDias ? `+ ${String(fo.faltaDias).replace('.', ',')} dia(s) de falta na folha` : '' },
      { nome: 'Hora extra 60%', ponto: a.ex60 || 0, folha: fo.he60 },
      { nome: 'Hora extra 100%', ponto: a.ex100 || 0, folha: fo.he100 },
      { nome: 'DSR descontado', ponto: a.dsrdeb || 0, folha: fo.dsr, info: true },
    ].map((l) => ({ ...l, st: !it ? 'sem_folha' : Math.abs(l.ponto - l.folha) <= TOL_MIN ? 'ok' : l.info ? 'info' : 'diferente' }));
    const dif = linhas.filter((l) => l.st === 'diferente').length;
    return { c, f, linhas, temFolha: !!it, eventos: fo.achou, st: !it ? 'sem_folha' : dif ? 'diferente' : 'ok', dif, banco: { cred: a.bcred, deb: a.bdeb, saldo: a.bsaldo } };
  });
}
const fmt = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const ST = { ok: ['Confere', 'p-ok', '✓'], diferente: ['Diferente', 'p-bad', '!'], sem_guia: ['Sem guia', 'p-at', '?'], sem_folha: ['Sem folha importada', 'p-na', '·'], nao_tem: ['Não tem', 'p-na', '–'], info: ['Informativo', 'p-co', 'i'] };
