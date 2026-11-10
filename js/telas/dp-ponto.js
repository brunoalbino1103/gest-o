// Ponto e horas extras: por enquanto, os cartões de ponto do mês por empresa.
// O painel completo de ponto (ocorrências, horas extras, fechamento) entra quando tivermos o arquivo de exportação do relógio.
import db from '../db.js';
import { esc, dataBR, nomeComp, aviso } from '../util.js';
import { S } from '../estado.js';
import { topo } from '../app.js';
import { tipoFechamento, empresasDP, nomeEmp } from './dp-comum.js';

export default async function ponto(el, _r, vivo) {
  const docs = (await db.documentos({ competencia: S.comp, departamento: 'dp' })).filter((d) => tipoFechamento(d.nome_arquivo, d.tipo) === 'ponto'); if (!vivo()) return;
  const emps = empresasDP().filter((c) => c.tem_funcionarios && (!S.empresa || c.id === S.empresa));
  topo('Ponto e horas extras', `${nomeComp(S.comp)} · cartões de ponto recebidos por empresa`);
  el.innerHTML = `<div class="banner"><div><b>O painel completo de ponto vem na próxima etapa.</b><br><span class="small">Ocorrências, atrasos, horas extras e fechamento, como no seu painel de Ponto. Para isso preciso de um arquivo de exportação do relógio (Pmovel ou outro). Por enquanto, envie os cartões em <a href="#/pessoal/fechamento">Fechamento do mês</a>.</span></div></div>
    <div class="card"><div class="tw"><table class="t"><thead><tr><th>Empresa</th><th>Cartões de ponto de ${nomeComp(S.comp, true)}</th></tr></thead><tbody>
    ${emps.map((c) => { const l = docs.filter((d) => d.cliente_id === c.id); return `<tr><td><b>${esc(nomeEmp(c))}</b></td><td>${l.length ? l.map((d) => `<button class="btn sec mini" data-abre="${d.id}" style="margin:2px">${esc(d.nome_arquivo)}</button>`).join('') : '<span class="pill p-at">não chegou</span>'}</td></tr>`; }).join('') || '<tr><td colspan="2"><div class="vazio">Nenhuma empresa com funcionários.</div></td></tr>'}
    </tbody></table></div></div>`;
  el.addEventListener('click', async (e) => { const b = e.target.closest('[data-abre]'); if (!b) return; try { const w = window.open('', '_blank'); const u = await db.abrirDocumento(docs.find((d) => d.id === b.dataset.abre)); if (w) w.location = u; } catch (er) { aviso(er.message, 'erro'); } });
}
export { dataBR };
