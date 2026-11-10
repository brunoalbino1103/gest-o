// Saúde e segurança do trabalho: ASO de cada colaborador, documentos da empresa (PGR, PCMSO...), treinamentos e prazos do eSocial de SST.
import db from '../db.js';
import { esc, dataBR, diasAte, hojeISO, aviso, modal, confirmar } from '../util.js';
import { S } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { proximoDiaUtil } from '../regras.js';
import { empresasDP, nomeEmp } from './dp-comum.js';

export const TIPOS_ASO = { admissional: 'Admissional', periodico: 'Periódico', retorno: 'Retorno ao trabalho', mudanca: 'Mudança de função', demissional: 'Demissional', monitoracao: 'Monitoração pontual' };
export const DOCS_SST = { pgr: 'PGR (Programa de Gerenciamento de Riscos)', pcmso: 'PCMSO (Programa de Controle Médico)', ltcat: 'LTCAT', laudo_insalubridade: 'Laudo de insalubridade', laudo_periculosidade: 'Laudo de periculosidade', aet: 'AET (Análise Ergonômica)', cipa: 'CIPA / designado', brigada: 'Brigada de incêndio', avcb: 'AVCB / bombeiros', outro: 'Outro' };
const dia15 = (iso) => { const [y, m] = iso.split('-').map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-15`; };
const st = (venc) => { if (!venc) return ['sem data', 'p-na']; const d = diasAte(venc); return d < 0 ? [`venceu há ${-d} dia(s)`, 'p-bad'] : d <= 30 ? [`vence em ${d} dia(s)`, 'p-at'] : [`válido até ${dataBR(venc)}`, 'p-ok']; };

export default async function sst(el, _r, vivo) {
  const [evs, docs, funcs] = await Promise.all([db.listar('funcionario_eventos').catch(() => []), db.listar('empresa_documentos').catch(() => []), db.funcionarios()]); if (!vivo()) return;
  const daEmp = (id) => !S.empresa || id === S.empresa;
  const ativos = funcs.filter((f) => f.situacao !== 'desligado' && !f.contribuinte && daEmp(f.cliente_id));
  const asos = evs.filter((e) => e.tipo === 'aso' && daEmp(e.cliente_id));
  const ultAso = (fid) => asos.filter((e) => e.funcionario_id === fid).sort((a, b) => b.data.localeCompare(a.data))[0];
  const docsE = docs.filter((d) => daEmp(d.cliente_id));
  const trein = evs.filter((e) => e.tipo === 'treinamento' && daEmp(e.cliente_id));
  // pendências do eSocial de SST: ASO (S-2220), acidente (S-2210)
  const pend = evs.filter((e) => daEmp(e.cliente_id) && ['aso', 'acidente'].includes(e.tipo) && !e.detalhe?.esocial_enviado)
    .map((e) => ({ e, evento: e.tipo === 'aso' ? 'S-2220 (ASO)' : 'S-2210 (CAT)', prazo: e.tipo === 'aso' ? dia15(e.data) : proximoDiaUtil(e.data) })).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const nomeF = (id) => funcs.find((f) => f.id === id)?.nome || '—';
  const linhasAso = ativos.map((f) => ({ f, u: ultAso(f.id) })).sort((a, b) => (a.u?.vencimento || '0').localeCompare(b.u?.vencimento || '0'));
  const vencidos = linhasAso.filter((x) => x.u?.vencimento && diasAte(x.u.vencimento) < 0).length, vencendo = linhasAso.filter((x) => x.u?.vencimento && diasAte(x.u.vencimento) >= 0 && diasAte(x.u.vencimento) <= 30).length, semAso = linhasAso.filter((x) => !x.u).length;
  const docsVenc = docsE.filter((d) => d.validade && diasAte(d.validade) <= 30).length;
  const emp = S.clientes.find((c) => c.id === S.empresa);
  topo('Saúde e segurança (SST)', `${emp ? nomeEmp(emp) : 'Todas as empresas'} · exames, programas, treinamentos e prazos do eSocial`);
  const kpi = (cls, l, v, s) => `<div class="kpi ${cls}"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  el.innerHTML = `<div class="grid g4">${kpi(vencidos ? 'bad' : 'ok', 'ASO vencido', vencidos, `${vencendo} vencendo em 30 dias`)}${kpi(semAso ? 'at' : 'ok', 'Sem ASO cadastrado', semAso, `de ${ativos.length} colaborador(es)`)}${kpi(docsVenc ? 'at' : 'ok', 'Programas vencendo', docsVenc, 'PGR, PCMSO, laudos (30 dias)')}${kpi(pend.some((p) => diasAte(p.prazo) < 0) ? 'bad' : pend.length ? 'at' : 'ok', 'eSocial SST pendente', pend.length, 'S-2220 e S-2210')}</div>
    <div class="card"><div class="card-h"><h2>Exames (ASO)</h2><span class="small muted">clique para lançar um ASO</span></div><div class="tw"><table class="t"><thead><tr><th>Colaborador</th>${S.empresa ? '' : '<th>Empresa</th>'}<th>Último ASO</th><th>Resultado</th><th>Próximo exame</th><th></th></tr></thead><tbody>
      ${linhasAso.map(({ f, u }) => { const s = st(u?.vencimento); return `<tr><td><a href="#/pessoal/colaborador/${f.id}" style="font-weight:600">${esc(f.nome)}</a><div class="small muted">${esc(f.cargo || '')}</div></td>${S.empresa ? '' : `<td>${esc(nomeEmp(S.clientes.find((c) => c.id === f.cliente_id)))}</td>`}
        <td>${u ? `${TIPOS_ASO[u.detalhe?.tipo_aso] || 'ASO'} · ${dataBR(u.data)}` : '<span class="pill p-at">sem ASO</span>'}</td><td>${u?.detalhe?.resultado ? (u.detalhe.resultado === 'apto' ? '<span class="pill p-ok">Apto</span>' : '<span class="pill p-bad">Inapto</span>') : ''}</td>
        <td>${u ? `<span class="pill ${s[1]}">${s[0]}</span>` : ''}</td><td><button class="btn sec mini" data-aso="${f.id}">Lançar ASO</button></td></tr>`; }).join('') || '<tr><td colspan="6"><div class="vazio">Nenhum colaborador ativo.</div></td></tr>'}
    </tbody></table></div></div>
    <div class="lado-a-lado"><div class="grow card"><div class="card-h"><h2>Programas e documentos da empresa</h2>${S.empresa ? '<button class="btn mini" id="dNovo">+ Documento</button>' : '<span class="small muted">escolha uma empresa para incluir</span>'}</div><div class="tw"><table class="t"><thead><tr><th>Documento</th>${S.empresa ? '' : '<th>Empresa</th>'}<th>Emissão</th><th>Validade</th><th>Responsável</th><th></th></tr></thead><tbody>
      ${docsE.sort((a, b) => (a.validade || '9').localeCompare(b.validade || '9')).map((d) => { const s = st(d.validade); return `<tr><td><b>${esc(DOCS_SST[d.tipo] || d.tipo)}</b>${d.descricao ? `<div class="small muted">${esc(d.descricao)}</div>` : ''}</td>${S.empresa ? '' : `<td>${esc(nomeEmp(S.clientes.find((c) => c.id === d.cliente_id)))}</td>`}<td>${dataBR(d.emissao)}</td><td><span class="pill ${s[1]}">${s[0]}</span></td><td class="small">${esc(d.responsavel || '')}</td><td style="white-space:nowrap">${d.documento_id ? `<button class="btn sec mini" data-abre="${d.documento_id}">Abrir</button> ` : ''}<button class="btn sec mini" data-doc="${d.id}">Editar</button></td></tr>`; }).join('') || `<tr><td colspan="6"><div class="vazio">${S.empresa ? 'Cadastre o PGR e o PCMSO desta empresa para acompanhar a validade.' : 'Nenhum documento.'}</div></td></tr>`}
    </tbody></table></div></div>
    <div class="aside card"><div class="card-h"><h2>eSocial SST</h2></div><div class="lista">${pend.map((p) => { const d = diasAte(p.prazo); return `<div class="item"><span class="rk ${d < 0 ? '' : 'at'}">${d < 0 ? d + 'd' : d === 0 ? 'hoje' : '+' + d + 'd'}</span><div style="flex:1"><b>${p.evento}</b><span>${esc(nomeF(p.e.funcionario_id))} · ${dataBR(p.e.data)}</span><small>enviar até ${dataBR(p.prazo)}</small></div><label class="chk small"><input type="checkbox" data-enviado="${p.e.id}"> enviado</label></div>`; }).join('') || '<div class="vazio">Nada pendente.</div>'}</div></div></div>
    <div class="card"><div class="card-h"><h2>Treinamentos</h2><span class="small muted">lançados na ficha do colaborador (evento "Treinamento")</span></div><div class="tw"><table class="t"><thead><tr><th>Colaborador</th><th>Treinamento</th><th>Realizado</th><th>Validade</th></tr></thead><tbody>
      ${trein.sort((a, b) => (a.vencimento || '9').localeCompare(b.vencimento || '9')).map((t) => { const s = st(t.vencimento); return `<tr><td><a href="#/pessoal/colaborador/${t.funcionario_id}">${esc(nomeF(t.funcionario_id))}</a></td><td>${esc(t.descricao || '')}</td><td>${dataBR(t.data)}</td><td><span class="pill ${s[1]}">${s[0]}</span></td></tr>`; }).join('') || '<tr><td colspan="4"><div class="vazio">Nenhum treinamento lançado.</div></td></tr>'}
    </tbody></table></div></div>`;
  el.querySelectorAll('[data-aso]').forEach((b) => b.addEventListener('click', async () => { if (await lancarAso(funcs.find((f) => f.id === b.dataset.aso), ultAso(b.dataset.aso))) recarregarTela(); }));
  el.querySelector('#dNovo')?.addEventListener('click', async () => { if (await formDoc({ cliente_id: S.empresa })) recarregarTela(); });
  el.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', async () => { if (await formDoc(docs.find((d) => d.id === b.dataset.doc))) recarregarTela(); }));
  el.querySelectorAll('[data-enviado]').forEach((c) => c.addEventListener('change', async () => { const e = evs.find((x) => x.id === c.dataset.enviado); await db.alterar('funcionario_eventos', e.id, { detalhe: { ...(e.detalhe || {}), esocial_enviado: true, esocial_em: hojeISO() } }); aviso('Marcado como enviado.'); recarregarTela(); }));
  el.querySelectorAll('[data-abre]').forEach((b) => b.addEventListener('click', async () => { try { const d = await db.documento(b.dataset.abre); const w = window.open('', '_blank'); const u = await db.abrirDocumento(d); if (w) w.location = u; } catch (er) { aviso(er.message, 'erro'); } }));
}

// ---------- lançar ASO ----------
export function lancarAso(f, ult) {
  const prox = (d, meses) => { const x = new Date(d + 'T12:00:00'); x.setMonth(x.getMonth() + meses); return x.toLocaleDateString('sv-SE'); };
  return modal('ASO · ' + f.nome, `<form class="form" id="fAso">
    <label class="f">Tipo de exame<select name="tipo_aso">${Object.entries(TIPOS_ASO).map(([k, t]) => `<option value="${k}" ${(!ult && k === 'admissional') || (ult && k === 'periodico') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Data do exame<input type="date" name="data" value="${hojeISO()}" required></label>
    <label class="f">Resultado<select name="resultado"><option value="apto">Apto</option><option value="inapto">Inapto</option></select></label>
    <label class="f">Periodicidade<select name="periodo"><option value="12">Anual (12 meses)</option><option value="24">A cada 2 anos</option><option value="6">Semestral</option><option value="0">Sem próximo (demissional)</option></select></label>
    <label class="f">Próximo exame<input type="date" name="vencimento"></label>
    <label class="f">Médico / CRM<input name="medico" placeholder="Dr(a). … CRM …"></label>
    <label class="f full">ASO (arquivo, opcional)<input type="file" name="anexo"></label>
    <p class="full small muted">O sistema avisa antes do vencimento e lembra do envio do S-2220 até o dia 15 do mês seguinte.</p>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Lançar</button></div></form>`, { largura: 640, aoAbrir: (m, fechar) => {
    const fm = m.querySelector('#fAso');
    const auto = () => { const p = +fm.periodo.value; fm.vencimento.value = p && fm.data.value ? prox(fm.data.value, p) : ''; };
    fm.periodo.addEventListener('change', auto); fm.data.addEventListener('change', auto); fm.tipo_aso.addEventListener('change', () => { if (fm.tipo_aso.value === 'demissional') { fm.periodo.value = '0'; auto(); } }); auto();
    fm.addEventListener('submit', async (e) => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(fm)); const arq = fm.anexo.files[0];
      try {
        const doc = arq ? await db.enviarDocumento(arq, { cliente_id: f.cliente_id, departamento: 'dp', competencia: d.data.slice(0, 7), tipo: 'outro', dados: { pid: f.id, tipoDoc: 'ASO', titulo: 'ASO ' + TIPOS_ASO[d.tipo_aso] } }) : null;
        await db.inserir('funcionario_eventos', { cliente_id: f.cliente_id, funcionario_id: f.id, data: d.data, tipo: 'aso', descricao: `ASO ${TIPOS_ASO[d.tipo_aso].toLowerCase()} · ${d.resultado}${d.medico ? ' · ' + d.medico : ''}`, vencimento: d.vencimento || null, detalhe: { tipo_aso: d.tipo_aso, resultado: d.resultado, medico: d.medico || null }, documento_id: doc?.id || null });
        aviso('ASO lançado.'); fechar(true);
      } catch (er) { aviso(er.message, 'erro'); }
    });
  } });
}

// ---------- documento da empresa (PGR, PCMSO...) ----------
function formDoc(d) {
  return modal(d.id ? 'Editar documento' : 'Novo documento de SST', `<form class="form" id="fDs">
    <label class="f">Documento<select name="tipo">${Object.entries(DOCS_SST).map(([k, t]) => `<option value="${k}" ${d.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Descrição<input name="descricao" value="${esc(d.descricao || '')}" placeholder="opcional"></label>
    <label class="f">Emissão<input type="date" name="emissao" value="${d.emissao || ''}"></label><label class="f">Validade<input type="date" name="validade" value="${d.validade || ''}"></label>
    <label class="f full">Responsável técnico / empresa<input name="responsavel" value="${esc(d.responsavel || '')}"></label>
    <label class="f full">Arquivo (opcional)<input type="file" name="anexo"></label>
    <div class="acoes full" style="margin-top:0">${d.id ? '<button type="button" class="btn sec" id="dsApaga" style="color:var(--bad);margin-right:auto">Excluir</button>' : ''}<button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { largura: 640, aoAbrir: (m, fechar) => {
    const fm = m.querySelector('#fDs');
    fm.addEventListener('submit', async (e) => {
      e.preventDefault(); const x = Object.fromEntries(new FormData(fm)); const arq = fm.anexo.files[0]; delete x.anexo; Object.keys(x).forEach((k) => { if (x[k] === '') x[k] = null; });
      try {
        if (arq) { const doc = await db.enviarDocumento(arq, { cliente_id: d.cliente_id, departamento: 'dp', competencia: (x.emissao || hojeISO()).slice(0, 7), tipo: 'outro', dados: { tipoDoc: DOCS_SST[x.tipo], titulo: arq.name } }); x.documento_id = doc.id; }
        if (d.id) await db.alterar('empresa_documentos', d.id, x); else await db.inserir('empresa_documentos', { ...x, cliente_id: d.cliente_id });
        aviso('Documento salvo.'); fechar(true);
      } catch (er) { aviso(er.message, 'erro'); }
    });
    m.querySelector('#dsApaga')?.addEventListener('click', async () => { if (await confirmar('Excluir documento', 'Excluir este documento?', 'Excluir')) { await db.apagar('empresa_documentos', d.id); fechar(true); } });
  } });
}
