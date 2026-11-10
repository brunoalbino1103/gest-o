// Contabilidade: extratos bancários do mês recebidos por empresa.
import db from '../db.js';
import { esc, nomeComp, aviso } from '../util.js';
import { S } from '../estado.js';
import { topo } from '../app.js';

export default async function extratos(el, _r, vivo) {
  const docs = (await db.documentos({ competencia: S.comp })).filter((d) => d.tipo === 'extrato'); if (!vivo()) return;
  const emps = S.clientes.filter((c) => c.ativo && c.regime !== 'mei' && (!S.empresa || c.id === S.empresa)).sort((a, b) => (a.nome_fantasia || a.razao_social).localeCompare(b.nome_fantasia || b.razao_social, 'pt'));
  const com = emps.filter((c) => docs.some((d) => d.cliente_id === c.id)).length;
  topo('Extratos bancários', `${nomeComp(S.comp)} · ${com} de ${emps.length} empresa(s) já mandaram`);
  el.innerHTML = `<div class="card"><div class="card-h"><h2>Recebidos em ${nomeComp(S.comp, true)}</h2><a class="btn sec mini" href="#/contabil/importar">Importar extratos (OFX ou PDF)</a></div>
    <div class="tw"><table class="t"><thead><tr><th>Empresa</th><th>Extratos</th></tr></thead><tbody>
    ${emps.map((c) => { const l = docs.filter((d) => d.cliente_id === c.id); return `<tr><td><b>${esc(c.nome_fantasia || c.razao_social)}</b></td><td>${l.length ? l.map((d) => `<button class="btn sec mini" data-abre="${d.id}" style="margin:2px">${esc(d.dados?.conta ? 'Conta ' + d.dados.conta : d.nome_arquivo)}</button>`).join('') : '<span class="pill p-at">não chegou</span>'}</td></tr>`; }).join('') || '<tr><td colspan="2"><div class="vazio">Nenhuma empresa.</div></td></tr>'}
    </tbody></table></div></div>`;
  el.addEventListener('click', async (e) => { const b = e.target.closest('[data-abre]'); if (!b) return; try { const w = window.open('', '_blank'); const u = await db.abrirDocumento(docs.find((d) => d.id === b.dataset.abre)); if (w) w.location = u; } catch (er) { aviso(er.message, 'erro'); } });
}
