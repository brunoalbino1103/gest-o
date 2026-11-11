// Fechamento do mês do DP: o pacote que vai para cada empresa (folha, holerites, guias, recibos, ponto, férias).
// O sistema reconhece cada arquivo pelo nome e mostra o que já chegou e o que falta.
import db from '../db.js';
import { esc, nomeComp, dataBR, aviso, somaMes } from '../util.js';
import { S, mudarComp, mudarEmpresa } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { importador } from './importador.js';
import { ITENS_FECHAMENTO, tipoFechamento, empresasDP, nomeEmp } from './dp-comum.js';

export default async function fechamento(el, _r, vivo) {
  const [docs, cfgs] = await Promise.all([db.documentos(S.todos ? { departamento: 'dp' } : { competencia: S.comp, departamento: 'dp' }), db.dpEmpresas()]); if (!vivo()) return;
  const temSind = new Set(cfgs.filter((c) => c.sindicato).map((c) => c.cliente_id));
  const emps = empresasDP().filter((c) => c.tem_funcionarios || c.regime !== 'mei');
  const itensDe = (c) => ITENS_FECHAMENTO.filter(([k]) => (k !== 'sindical' || temSind.has(c.id)) && (c.tem_funcionarios || !['ponto', 'ferias', 'holerites', 'liquidos', 'fgts', 'fgts_det', 'sindical'].includes(k)));
  const docsDe = (cid) => docs.filter((d) => d.cliente_id === cid);
  const tiposDe = (cid, comp) => { const m = {}; docsDe(cid).filter((d) => !comp || d.competencia === comp).forEach((d) => { const t = tipoFechamento(d.nome_arquivo, d.tipo); if (t) (m[t] ||= []).push(d); }); return m; };

  if (S.todos) return todosOsMeses(el, emps, itensDe, tiposDe);
  if (!S.empresa) {
    topo('Fechamento do mês', `${nomeComp(S.comp)} · o que já chegou de cada empresa. Escolha uma empresa no topo para enviar os arquivos.`);
    el.innerHTML = `<div class="card"><div class="tw"><table class="t mx"><thead><tr><th style="min-width:200px">Empresa</th>${ITENS_FECHAMENTO.map(([, t]) => `<th class="ob">${t}</th>`).join('')}<th class="r">Completo</th></tr></thead><tbody>
      ${emps.map((c) => { const t = tiposDe(c.id), its = itensDe(c), ok = its.filter(([k]) => t[k]).length;
        return `<tr><td><button class="lk" data-escolhe="${c.id}" style="border:0;background:none;padding:0;font-weight:600;color:var(--co-dk);text-align:left">${esc(nomeEmp(c))}</button></td>${ITENS_FECHAMENTO.map(([k]) => its.some((x) => x[0] === k) ? `<td class="cel"><span class="st ${t[k] ? 'st-concluida' : 'st-pendente'}" style="display:grid">${t[k] ? '✓' : '○'}</span></td>` : '<td class="cel"><span class="st st-nao_aplica" style="display:grid">–</span></td>').join('')}<td class="r num"><b>${ok}/${its.length}</b></td></tr>`; }).join('') || '<tr><td colspan="12"><div class="vazio">Nenhuma empresa com funcionários.</div></td></tr>'}
    </tbody></table></div></div>`;
    return;
  }
  const c = S.clientes.find((x) => x.id === S.empresa);
  const t = tiposDe(c.id), its = itensDe(c), ok = its.filter(([k]) => t[k]).length;
  topo('Fechamento do mês', `${nomeEmp(c)} · ${nomeComp(S.comp)} · ${ok} de ${its.length} itens recebidos`);
  el.innerHTML = `<div class="lado-a-lado">
    <div class="grow card"><div class="card-h"><h2>Pacote de ${nomeComp(S.comp)}</h2><span class="pill ${ok === its.length ? 'p-ok' : 'p-at'}">${ok === its.length ? 'Completo' : `Faltam ${its.length - ok}`}</span></div>
      <div class="check">${its.map(([k, nome]) => { const l = t[k] || []; return `<div class="check-it"><span class="st ${l.length ? 'ok' : 'falta'}">${l.length ? '✓' : '!'}</span><div><b>${nome}</b><small>${l.length ? l.map((d) => esc(d.nome_arquivo)).join(' · ') : 'ainda não chegou'}</small></div>${l.length ? `<div class="dir">${l.length > 1 ? `<span class="small muted">${l.length} arquivos</span>` : ''}<button class="btn sec mini" data-abre="${l[0].id}" title="Abre o mais recente">Abrir</button></div>` : ''}</div>`; }).join('')}
      </div></div>
    <div class="aside card"><div class="card-h"><h2>Enviar arquivos do mês</h2></div><div class="card-b"><p class="small muted mt0" style="margin-bottom:10px">Arraste os PDFs do fechamento. O sistema lê cada um, reconhece o que é e preenche colaboradores, folha, guias e férias sozinho.</p><div id="fImp"></div></div></div>
  </div>`;
  importador(el.querySelector('#fImp'), { compacto: true, aoTerminar: () => setTimeout(recarregarTela, 1500) });
  el.addEventListener('click', async (e) => { const b = e.target.closest('[data-abre]'); if (!b) return; const d = docs.find((x) => x.id === b.dataset.abre); try { const w = window.open('', '_blank'); const u = await db.abrirDocumento(d); if (w) w.location = u; else location.href = u; } catch (er) { aviso(er.message, 'erro'); } });
}

// "Todos os meses": quanto do pacote chegou em cada mês (clique para abrir o mês)
function todosOsMeses(el, emps, itensDe, tiposDe) {
  const meses = []; for (let i = 0; i < 12; i++) meses.push(somaMes(S.comp, -i));
  const cel = (ok, n, comp, cid) => `<td class="cel"><button class="fx ${!n ? 'na' : ok === n ? 'ok' : ok ? 'meio' : 'nada'}" data-mes="${comp}" ${cid ? `data-cli="${cid}"` : ''} title="${nomeComp(comp)}: ${ok} de ${n}">${n ? `${ok}/${n}` : '–'}</button></td>`;
  if (!S.empresa) {
    topo('Fechamento do mês', 'Todos os meses · quantos itens do pacote chegaram de cada empresa. Clique num mês para abrir.');
    el.innerHTML = `<div class="card"><div class="tw"><table class="t mx"><thead><tr><th style="min-width:200px">Empresa</th>${meses.map((m) => `<th class="ob">${nomeComp(m, true)}</th>`).join('')}</tr></thead><tbody>
      ${emps.map((c) => `<tr><td><b>${esc(nomeEmp(c))}</b></td>${meses.map((m) => { const t = tiposDe(c.id, m), its = itensDe(c); return cel(its.filter(([k]) => t[k]).length, its.length, m, c.id); }).join('')}</tr>`).join('') || '<tr><td colspan="13"><div class="vazio">Nenhuma empresa com funcionários.</div></td></tr>'}
    </tbody></table></div></div>`;
  } else {
    const c = S.clientes.find((x) => x.id === S.empresa); const its = itensDe(c);
    topo('Fechamento do mês', `${nomeEmp(c)} · todos os meses. Clique num mês para abrir o pacote.`);
    el.innerHTML = `<div class="card"><div class="tw"><table class="t mx"><thead><tr><th>Mês</th>${its.map(([, t]) => `<th class="ob">${t}</th>`).join('')}<th class="r">Recebido</th></tr></thead><tbody>
      ${meses.map((m) => { const t = tiposDe(c.id, m), ok = its.filter(([k]) => t[k]).length; return `<tr><td><button class="lk" data-mes="${m}" style="border:0;background:none;padding:0;font-weight:600;color:var(--co-dk)">${nomeComp(m, true)}</button></td>${its.map(([k]) => `<td class="cel"><span class="st ${t[k] ? 'st-concluida' : 'st-pendente'}" style="display:grid">${t[k] ? '✓' : ''}</span></td>`).join('')}<td class="r num"><b>${ok}/${its.length}</b></td></tr>`; }).join('')}
    </tbody></table></div></div>`;
  }
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { mudarComp(b.dataset.mes); if (b.dataset.cli) mudarEmpresa(b.dataset.cli); recarregarTela(); }));
}