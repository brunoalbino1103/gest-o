// Guias e impostos: quanto a empresa pagou em cada guia (mês a mês e no ano) e o envio das guias do mês ao cliente.
// Envio no piloto: baixa um .zip com as guias e abre o e-mail já preenchido no programa de e-mail do computador.
import db from '../db.js';
import { esc, brl, nomeComp, dataBR, diasAte, aviso, hojeISO } from '../util.js';
import { S, mudarComp } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { escolhaEmpresa, empresasDP, nomeEmp } from './dp-comum.js';
import { ico } from '../icones.js';

// impostos que aparecem nas colunas (ordem fixa)
const IMPOSTOS = [['guia_fgts', 'FGTS'], ['guia_darf_dp', 'INSS / IRRF (DARF)'], ['guia_sindical', 'Assistencial / sindical'], ['guia_das', 'DAS (Simples)'], ['guia_darf_fiscal', 'DARF (outros)']];
// outros documentos do mês que podem ir junto no e-mail
const EXTRAS = [['holerites', 'Holerites'], ['folha_extrato', 'Folha de pagamento'], ['folha_resumo', 'Resumo da folha'], ['liquidos', 'Relação de líquidos'], ['recibo_dctfweb', 'Recibo da DCTFWeb'], ['ferias_programacao', 'Programação de férias']];
const NOME = Object.fromEntries([...IMPOSTOS, ...EXTRAS]);
let marcados = null; // ids marcados para enviar (por empresa+mês)

export default async function guias(el, _r, vivo) {
  const emp = S.clientes.find((c) => c.id === S.empresa);
  if (!emp) {
    topo('Guias e impostos', 'Escolha uma empresa');
    el.innerHTML = escolhaEmpresa('De qual empresa?', empresasDP().filter((c) => c.tem_funcionarios), 'pessoal/guias');
    return;
  }
  const ano = S.comp.slice(0, 4);
  const [gs0, docs] = await Promise.all([db.listar('guias', { cliente_id: emp.id }).catch(() => []), db.documentos({ cliente_id: emp.id })]);
  if (!vivo()) return;
  // guias lidas + guias enviadas cujo valor não foi lido (aparecem como "ver guia")
  const porDoc = new Set(gs0.map((g) => g.documento_id));
  const semValor = docs.filter((d) => IMPOSTOS.some(([k]) => k === d.tipo) && !porDoc.has(d.id) && d.competencia)
    .map((d) => ({ id: 'doc:' + d.id, tipo: d.tipo, competencia: d.competencia, valor: d.dados?.valor ?? null, vencimento: d.dados?.vencimento || null, documento_id: d.id, pago: false, detalhe: {}, _semLeitura: true }));
  // guia recalculada substitui a anterior do mesmo imposto e mês (fica a mais recente)
  const doc = (id) => docs.find((d) => d.id === id);
  const todas = [...gs0, ...semValor];
  const chave = (g) => g.tipo + '|' + g.competencia;
  const valida = new Map();
  todas.forEach((g) => { const a = valida.get(chave(g)); const tg = doc(g.documento_id)?.enviado_em || '', ta = a ? doc(a.documento_id)?.enviado_em || '' : '';
    const recalc = (x) => /RECALC/i.test(doc(x.documento_id)?.nome_arquivo || '');
    const temV = (x) => x.valor != null && +x.valor > 0;
    if (!a || (temV(g) && !temV(a)) || (temV(g) === temV(a) && ((recalc(g) && !recalc(a)) || (recalc(g) === recalc(a) && tg > ta)))) valida.set(chave(g), g); });
  const G = [...valida.values()];
  const doAno = G.filter((g) => g.competencia?.startsWith(ano));
  const tot = (k) => doAno.filter((g) => g.tipo === k).reduce((s, g) => s + (+g.valor || 0), 0);
  const cols = IMPOSTOS.filter(([k]) => G.some((g) => g.tipo === k));
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  const totalAno = cols.reduce((s, [k]) => s + tot(k), 0);

  topo('Guias e impostos', `${nomeEmp(emp)} · quanto foi pago em cada guia e envio ao cliente`);
  const kpi = (l, v, s) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  const cel = (g) => !g ? '<td class="r muted">—</td>' : `<td class="r num"><button class="lk-v" data-abre="${g.documento_id}" title="Abrir a guia${g.vencimento ? ' · vence ' + dataBR(g.vencimento) : ''}">${g.valor != null && +g.valor ? brl(g.valor) : '<span class="small">ver guia</span>'}</button>${g.pago ? ` <span class="ok-ico" title="Paga">${ico('ok')}</span>` : ''}</td>`;

  // ---- guias do mês escolhido ----
  const comp = S.comp;
  const doMes = G.filter((g) => g.competencia === comp).sort((a, b) => IMPOSTOS.findIndex(([k]) => k === a.tipo) - IMPOSTOS.findIndex(([k]) => k === b.tipo));
  const extras = EXTRAS.map(([k]) => docs.filter((d) => d.tipo === k && d.competencia === comp)[0]).filter(Boolean);
  const cm = emp.id + '|' + comp;
  if (!marcados || marcados.cm !== cm) marcados = { cm, ids: new Set(doMes.map((g) => g.documento_id)) };
  const totalMes = doMes.reduce((s, g) => s + (+g.valor || 0), 0);
  const envio = doMes.map((g) => g.detalhe?.enviado_em).filter(Boolean).sort().pop();
  const para = emp.email_dp || emp.email || '';

  el.innerHTML = `<div class="grid g4">${kpi(`Total em ${ano}`, brl(totalAno), `${doAno.length} guia(s) no ano`)}${cols.slice(0, 3).map(([k, n]) => kpi(n, brl(tot(k)), `pago em ${ano}`)).join('')}</div>
    <div class="lado-a-lado">
      <div class="grow card"><div class="card-h"><div><h2>Guias de ${nomeComp(comp)}</h2><p class="small muted">${doMes.length ? `Total ${brl(totalMes)}${envio ? ` · enviado ao cliente em ${dataBR(envio)}` : ' · ainda não enviado ao cliente'}` : 'Nenhuma guia importada neste mês.'}</p></div></div>
        ${doMes.length ? `<div class="tw"><table class="t"><thead><tr><th style="width:34px"></th><th>Guia</th><th class="r">Valor</th><th>Vencimento</th><th>Paga</th><th></th></tr></thead><tbody>
        ${doMes.map((g) => { const v = g.vencimento ? diasAte(g.vencimento) : null; return `<tr><td><input type="checkbox" data-marca="${g.documento_id}" ${marcados.ids.has(g.documento_id) ? 'checked' : ''} aria-label="Enviar ${NOME[g.tipo]}"></td><td><b>${NOME[g.tipo]}</b><div class="small muted" style="word-break:break-all">${esc(doc(g.documento_id)?.nome_arquivo || '')}</div></td>
          <td class="r num">${g.valor != null && +g.valor ? brl(g.valor) : '<span class="small muted">não lido</span>'}</td>
          <td>${g.vencimento ? dataBR(g.vencimento) : '—'}${g.vencimento && !g.pago ? `<div class="small" style="color:${v < 0 ? 'var(--bad)' : 'var(--muted)'}">${v < 0 ? `venceu há ${-v} dia(s)` : v === 0 ? 'vence hoje' : `em ${v} dia(s)`}</div>` : ''}</td>
          <td>${!(+g.valor) ? `<button class="btn sec mini" data-informa="${g.documento_id}">Informar valor</button>` : `<label class="chk small"><input type="checkbox" data-pago="${g.id}" ${g.pago ? 'checked' : ''}> paga</label>`}</td>
          <td><button class="btn sec mini" data-abre="${g.documento_id}">Abrir</button></td></tr>`; }).join('')}
        ${extras.length ? `<tr><td colspan="6" class="secao-t" style="padding-top:14px">Enviar junto (opcional)</td></tr>${extras.map((d) => `<tr><td><input type="checkbox" data-marca="${d.id}" ${marcados.ids.has(d.id) ? 'checked' : ''} aria-label="Enviar ${NOME[d.tipo]}"></td><td>${NOME[d.tipo]}<div class="small muted" style="word-break:break-all">${esc(d.nome_arquivo)}</div></td><td></td><td></td><td></td><td><button class="btn sec mini" data-abre="${d.id}">Abrir</button></td></tr>`).join('')}` : ''}
        </tbody></table></div>` : '<div class="vazio">Importe as guias do mês em <a href="#/pessoal/importar">Importar arquivos</a>.</div>'}
      </div>
      <div class="aside card"><div class="card-h"><h2>Enviar ao cliente</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:10px">
        <label class="f">Para<input id="gPara" type="email" value="${esc(para)}" placeholder="e-mail do cliente"></label>
        ${para ? '' : '<p class="small" style="color:var(--at-ink);margin:0">Esta empresa não tem e-mail no cadastro. Digite acima ou cadastre em Empresas.</p>'}
        <label class="chk small"><input type="checkbox" id="gPortal" checked> Publicar também no portal do cliente</label>
        <button class="btn" id="gEnviar" ${doMes.length || extras.length ? '' : 'disabled'}>${ico('baixar')}Preparar e-mail</button>
        <p class="small muted" style="margin:0">Baixa um arquivo .zip com os documentos marcados e abre o e-mail já escrito no seu programa de e-mail. É só arrastar o .zip para o e-mail e enviar.</p>
        <p class="small muted" style="margin:0;border-top:1px solid var(--line-2);padding-top:10px">Em breve: envio direto pelo Hotmail, com um clique, depois de conectar a conta Microsoft.</p>
      </div></div>
    </div>
    <div class="card"><div class="card-h"><h2>Mês a mês · ${ano}</h2><span class="small muted">clique num valor para abrir a guia</span></div>
      ${cols.length ? `<div class="tw"><table class="t"><thead><tr><th>Mês</th>${cols.map(([, n]) => `<th class="r">${n}</th>`).join('')}<th class="r">Total do mês</th></tr></thead><tbody>
      ${meses.map((m) => { const l = cols.map(([k]) => G.find((g) => g.tipo === k && g.competencia === m)); const t = l.reduce((s, g) => s + (+g?.valor || 0), 0);
        return `<tr ${m === comp ? 'style="background:var(--ct)"' : ''}><td><button class="lk-v" data-mes="${m}" style="font-weight:600">${nomeComp(m, true)}</button></td>${l.map(cel).join('')}<td class="r num"><b>${t ? brl(t) : '—'}</b></td></tr>`; }).join('')}
      <tr><td><b>Total ${ano}</b></td>${cols.map(([k]) => `<td class="r num"><b>${brl(tot(k))}</b></td>`).join('')}<td class="r num"><b>${brl(totalAno)}</b></td></tr>
      </tbody></table></div>` : '<div class="vazio">Nenhuma guia importada desta empresa.</div>'}
    </div>`;

  // ---- eventos ----
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { mudarComp(b.dataset.mes); recarregarTela(); }));
  el.querySelectorAll('[data-marca]').forEach((c) => c.addEventListener('change', () => { if (c.checked) marcados.ids.add(c.dataset.marca); else marcados.ids.delete(c.dataset.marca); }));
  el.querySelectorAll('[data-pago]').forEach((c) => c.addEventListener('change', async () => { try {
    const g = doMes.find((x) => x.id === c.dataset.pago);
    // guia sem registro próprio (ex.: a recalculada): grava o registro do mês apontando para ela
    if (g?._semLeitura) await db.gravar('guias', { cliente_id: emp.id, tipo: g.tipo, competencia: g.competencia, valor: g.valor, vencimento: g.vencimento, documento_id: g.documento_id, pago: c.checked }, 'cliente_id,tipo,competencia');
    else await db.alterar('guias', c.dataset.pago, { pago: c.checked }); aviso(c.checked ? 'Guia marcada como paga.' : 'Guia marcada como não paga.'); recarregarTela(); } catch (er) { aviso(er.message, 'erro'); } }));
  el.querySelectorAll('[data-informa]').forEach((b) => b.addEventListener('click', async () => { const g = doMes.find((x) => x.documento_id === b.dataset.informa); if (await informarValor(emp, g, doc(g.documento_id))) recarregarTela(); }));
  el.querySelectorAll('[data-abre]').forEach((b) => b.addEventListener('click', async () => { const d = doc(b.dataset.abre); if (!d) return; const w = window.open('', '_blank'); try { const u = await db.abrirDocumento(d); if (w) w.location = u; else location.href = u; } catch (er) { w?.close(); aviso(er.message, 'erro'); } }));
  el.querySelector('#gEnviar')?.addEventListener('click', async (e) => {
    const sel = [...marcados.ids].map(doc).filter(Boolean);
    if (!sel.length) return aviso('Marque pelo menos um documento.', 'erro');
    const destino = el.querySelector('#gPara').value.trim();
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Preparando…';
    try {
      // 1) .zip com os documentos marcados
      const JSZip = await carregarZip(); const zip = new JSZip(); const usados = new Set();
      for (const d of sel) { const u = await db.abrirDocumento(d); const blob = await (await fetch(u)).blob(); let n = d.nome_arquivo; let i = 2; while (usados.has(n)) n = d.nome_arquivo.replace(/(\.\w+)?$/, ` (${i++})$1`); usados.add(n); zip.file(n, blob); }
      const nomeZip = `Guias ${nomeComp(comp, true).replace('/', '-')} - ${nomeEmp(emp).replace(/[^\w\s-]/g, '').trim()}.zip`;
      const z = await zip.generateAsync({ type: 'blob' }); const a = document.createElement('a'); a.href = URL.createObjectURL(z); a.download = nomeZip; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      // 2) e-mail já escrito
      const gSel = doMes.filter((g) => marcados.ids.has(g.documento_id));
      const linhas = gSel.map((g) => `- ${NOME[g.tipo]}: ${g.valor != null && +g.valor ? brl(g.valor) : 'ver guia'}${g.vencimento ? ` · vencimento ${dataBR(g.vencimento)}` : ''}`);
      const outrosSel = sel.filter((d) => !gSel.some((g) => g.documento_id === d.id)).map((d) => `- ${NOME[d.tipo] || d.nome_arquivo}`);
      const assunto = `Guias de ${nomeComp(comp).toLowerCase()} - ${nomeEmp(emp)}`;
      const corpo = `Olá,\n\nSeguem em anexo as guias de ${nomeComp(comp).toLowerCase()}:\n\n${linhas.join('\n')}${gSel.length > 1 ? `\n\nTotal: ${brl(gSel.reduce((s, g) => s + (+g.valor || 0), 0))}` : ''}${outrosSel.length ? `\n\nTambém em anexo:\n${outrosSel.join('\n')}` : ''}\n\nQualquer dúvida, estamos à disposição.\n`;
      location.href = `mailto:${encodeURIComponent(destino)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
      // 3) registra o envio e publica no portal
      const hoje = hojeISO();
      for (const g of gSel) if (!g._semLeitura) await db.alterar('guias', g.id, { detalhe: { ...(g.detalhe || {}), enviado_em: hoje, enviado_para: destino || null } }).catch(() => {});
      if (el.querySelector('#gPortal')?.checked) for (const d of sel) if (!d.visivel_cliente) await db.atualizarDocumento(d.id, { visivel_cliente: true }).catch(() => {});
      await db.registrar('Preparou e-mail de guias', `${nomeComp(comp)} · ${sel.length} arquivo(s)${destino ? ' para ' + destino : ''}`, emp.id);
      aviso(`Pronto: "${nomeZip}" baixado. Arraste para o e-mail que abriu e envie.`);
      setTimeout(recarregarTela, 800);
    } catch (er) { aviso(er.message, 'erro'); b.disabled = false; b.innerHTML = ico('baixar') + 'Preparar e-mail'; }
  });
}

// guia escaneada (sem texto): a pessoa digita valor e vencimento olhando a guia
function informarValor(emp, g, d) {
  return import('../util.js').then(({ modal }) => modal('Informar valor · ' + NOME[g.tipo], `<form class="form" id="fIv">
    <p class="full small muted mt0">${esc(d?.nome_arquivo || '')}<br>Esta guia é um PDF escaneado (imagem): o sistema não consegue ler o valor. Abra a guia e digite abaixo.</p>
    <label class="f">Valor (R$)<input type="number" step="0.01" min="0" name="valor" required></label>
    <label class="f">Vencimento<input type="date" name="vencimento"></label>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" id="ivAbre">Abrir a guia</button><button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { aoAbrir: (m, fechar) => {
    m.querySelector('#ivAbre').addEventListener('click', async () => { const w = window.open('', '_blank'); try { const u = await db.abrirDocumento(d); if (w) w.location = u; } catch (er) { w?.close(); aviso(er.message, 'erro'); } });
    m.querySelector('#fIv').addEventListener('submit', async (e) => {
      e.preventDefault(); const x = Object.fromEntries(new FormData(e.target));
      try { await db.gravar('guias', { cliente_id: emp.id, tipo: g.tipo, competencia: g.competencia, valor: +x.valor, vencimento: x.vencimento || g.vencimento || null, documento_id: g.documento_id, detalhe: { ...(g.detalhe || {}), informado_manual: true } }, 'cliente_id,tipo,competencia'); aviso('Valor salvo.'); fechar(true); } catch (er) { aviso(er.message, 'erro'); }
    });
  } }));
}

let zipCarregando = null;
function carregarZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return (zipCarregando ||= new Promise((ok, erro) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = () => ok(window.JSZip); s.onerror = () => { zipCarregando = null; erro(new Error('Não foi possível carregar o gerador de .zip. Verifique a internet.')); }; document.head.appendChild(s); }));
}
