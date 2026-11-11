// Conferência do fechamento: guias × folha e ponto × folha, por empresa e mês.
import db from '../db.js';
import { esc, brl, nomeComp, dataBR, diasAte, aviso } from '../util.js';
import { S, mudarComp, mudarEmpresa } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { conferirGuias, conferirPonto, ST } from '../conferencia.js';
import { hm } from '../ponto.js';
import { empresasDP, nomeEmp } from './dp-comum.js';

const pill = (st) => `<span class="pill ${ST[st][1]}">${ST[st][2]} ${ST[st][0]}</span>`;
const hmz = (m) => (m ? hm(m) : '—');

export default async function conferencia(el, _r, vivo) {
  const [resumos, guias, itens, cartoes, funcs] = await Promise.all(['folha_resumos', 'guias', 'folha_itens', 'ponto_cartoes'].map((t) => db.listar(t, S.todos ? {} : { competencia: S.comp }).catch(() => [])).concat([db.funcionarios()]));
  if (!vivo()) return;
  const emps = empresasDP().filter((c) => c.tem_funcionarios && (!S.empresa || c.id === S.empresa));
  const deEmp = (l, id) => l.filter((x) => x.cliente_id === id);
  if (S.todos) {
    // todos os meses: uma linha por mês e empresa que tenha folha, guia ou cartão importado
    const pares = new Map(); [resumos, guias, cartoes].flat().forEach((x) => { if (x.competencia && emps.some((c) => c.id === x.cliente_id)) pares.set(x.competencia + '|' + x.cliente_id, [x.competencia, x.cliente_id]); });
    const L = [...pares.values()].sort((a, b) => b[0].localeCompare(a[0]) || nomeEmp(S.clientes.find((c) => c.id === a[1])).localeCompare(nomeEmp(S.clientes.find((c) => c.id === b[1])), 'pt'));
    topo('Conferência do fechamento', 'Todos os meses · guias × folha e ponto × folha. Clique numa linha para ver o detalhe do mês.');
    const doMes = (l, m, id) => l.filter((x) => x.competencia === m && x.cliente_id === id);
    el.innerHTML = `<div class="card"><div class="tw"><table class="t"><thead><tr><th>Mês</th>${S.empresa ? '' : '<th>Empresa</th>'}<th>FGTS</th><th>DARF</th><th>Assistencial</th><th>Ponto × folha</th></tr></thead><tbody>
      ${L.map(([m, id]) => { const g = conferirGuias(doMes(resumos, m, id)[0], doMes(guias, m, id)); const p = conferirPonto(doMes(cartoes, m, id), doMes(itens, m, id), funcs); const pst = !p.length ? null : p.some((x) => x.st === 'diferente') ? 'diferente' : p.every((x) => x.st === 'sem_folha') ? 'sem_folha' : 'ok';
        const cel = (k) => { const x = g.find((y) => y.chave === k); return x ? pill(x.st) : '<span class="muted">—</span>'; };
        return `<tr class="lk" data-mes="${m}" data-cli="${id}"><td><b>${nomeComp(m, true)}</b></td>${S.empresa ? '' : `<td>${esc(nomeEmp(S.clientes.find((c) => c.id === id)))}</td>`}<td>${cel('guia_fgts')}</td><td>${cel('guia_darf_dp')}</td><td>${cel('guia_sindical')}</td><td>${pst ? pill(pst) : '<span class="muted">sem cartão</span>'}</td></tr>`; }).join('') || `<tr><td colspan="6"><div class="vazio">Nada importado ainda.</div></td></tr>`}
    </tbody></table></div></div>`;
    el.querySelectorAll('[data-mes]').forEach((r) => r.addEventListener('click', () => { mudarComp(r.dataset.mes); mudarEmpresa(r.dataset.cli); recarregarTela(); }));
    return;
  }

  if (!S.empresa) {
    topo('Conferência do fechamento', `${nomeComp(S.comp)} · guias × folha e ponto × folha de todas as empresas. Clique numa empresa para ver o detalhe.`);
    el.innerHTML = `<div class="card"><div class="tw"><table class="t"><thead><tr><th>Empresa</th><th>FGTS</th><th>DARF</th><th>Assistencial</th><th>Ponto × folha</th></tr></thead><tbody>
      ${emps.map((c) => { const g = conferirGuias(deEmp(resumos, c.id)[0], deEmp(guias, c.id)); const p = conferirPonto(deEmp(cartoes, c.id), deEmp(itens, c.id), funcs); const pst = !p.length ? 'sem_folha' : p.some((x) => x.st === 'diferente') ? 'diferente' : p.every((x) => x.st === 'sem_folha') ? 'sem_folha' : 'ok';
        const cel = (k) => { const x = g.find((y) => y.chave === k); return x ? pill(x.st) : '<span class="muted">—</span>'; };
        return `<tr><td><button class="lk" data-escolhe="${c.id}" style="border:0;background:none;padding:0;color:var(--co-dk);font-weight:600">${esc(nomeEmp(c))}</button></td><td>${cel('guia_fgts')}</td><td>${cel('guia_darf_dp')}</td><td>${cel('guia_sindical')}</td><td>${p.length ? pill(pst) + (pst === 'diferente' ? ` <span class="small muted">${p.filter((x) => x.st === 'diferente').length} pessoa(s)</span>` : '') : '<span class="muted">sem cartão</span>'}</td></tr>`; }).join('') || '<tr><td colspan="5"><div class="vazio">Nenhuma empresa com funcionários.</div></td></tr>'}
    </tbody></table></div></div>`;
    return;
  }
  const emp = S.clientes.find((c) => c.id === S.empresa);
  const resumo = deEmp(resumos, emp.id)[0];
  const G = conferirGuias(resumo, deEmp(guias, emp.id));
  const P = conferirPonto(deEmp(cartoes, emp.id), deEmp(itens, emp.id), funcs).sort((a, b) => (b.dif - a.dif) || (a.f?.nome || '').localeCompare(b.f?.nome || ''));
  const probG = G.filter((x) => x.st === 'diferente' || x.st === 'sem_guia').length, probP = P.filter((x) => x.st === 'diferente').length;
  topo('Conferência do fechamento', `${nomeEmp(emp)} · ${nomeComp(S.comp)} · ${probG + probP ? `${probG + probP} ponto(s) para conferir` : 'tudo confere'}`);

  el.innerHTML = `<div class="card"><div class="card-h"><div><h2>Guias × folha</h2><p class="small muted">${resumo ? `Resumo da folha de ${nomeComp(S.comp, true)}: líquido ${brl(resumo.liquido)} · ${resumo.empregados || 0} empregado(s)` : 'Importe o Resumo da folha deste mês para conferir os valores.'}</p></div></div>
      <div class="tw"><table class="t"><thead><tr><th>Guia</th><th class="r">Pela folha</th><th class="r">Na guia</th><th class="r">Diferença</th><th>Vencimento</th><th>Situação</th><th>Paga?</th></tr></thead><tbody>
      ${G.map((x) => { const venc = x.guia?.vencimento; const d = venc ? diasAte(venc) : null;
        return `<tr><td><b>${x.nome}</b><div class="small muted">${esc(x.regra || '')}</div></td><td class="r num">${x.folha !== null ? brl(x.folha) : '—'}</td><td class="r num">${x.valorGuia !== null ? brl(x.valorGuia) : '—'}</td>
        <td class="r num" style="color:${x.st === 'diferente' ? 'var(--bad)' : ''}">${x.diferenca !== null ? (x.diferenca > 0 ? '+' : '') + brl(x.diferenca) : ''}</td>
        <td>${venc ? dataBR(venc) : '—'}${venc && !x.guia.pago && d !== null ? `<div class="small" style="color:${d < 0 ? 'var(--bad)' : d <= 3 ? 'var(--at-ink)' : 'var(--muted)'}">${d < 0 ? 'venceu há ' + -d + ' dia(s)' : d === 0 ? 'vence hoje' : 'em ' + d + ' dia(s)'}</div>` : ''}</td>
        <td>${pill(x.st)}</td><td>${x.guia ? `<label class="chk small"><input type="checkbox" data-pago="${x.guia.id}" ${x.guia.pago ? 'checked' : ''}> paga</label>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div></div>
    <div class="card"><div class="card-h"><div><h2>Ponto × folha</h2><p class="small muted">O que o relógio registrou comparado com o que entrou na folha (tolerância de 5 min). O DSR é só informativo: com banco de horas ele pode não ir para a folha.</p></div></div>
      ${P.length ? `<div class="tw"><table class="t"><thead><tr><th>Colaborador</th><th>Item</th><th class="r">No ponto</th><th class="r">Na folha</th><th>Situação</th></tr></thead><tbody>
      ${P.map((x) => x.linhas.map((l, i) => `<tr style="${i === 0 ? 'border-top:2px solid var(--line)' : ''}">${i === 0 ? `<td rowspan="${x.linhas.length}" style="vertical-align:top"><a href="#/pessoal/colaborador/${x.c.funcionario_id}" style="font-weight:600">${esc(x.f?.nome || '—')}</a><div class="small muted">banco: +${hm(x.banco.cred)} / −${hm(x.banco.deb)}${x.banco.saldo ? ' · saldo ' + hm(x.banco.saldo) : ''}</div>${x.temFolha ? '' : '<div class="small" style="color:var(--at-ink)">sem folha deste mês</div>'}</td>` : ''}
        <td>${l.nome}${l.extra ? `<div class="small muted">${l.extra}</div>` : ''}</td><td class="r num">${hmz(l.ponto)}</td><td class="r num">${x.temFolha ? hmz(l.folha) : '—'}</td><td>${pill(l.st)}</td></tr>`).join('')).join('')}
      </tbody></table></div>` : `<div class="vazio">Nenhum cartão de ponto de ${nomeComp(S.comp)}. Importe os cartões e a folha (extrato mensal) do mês.</div>`}</div>`;
  el.querySelectorAll('[data-pago]').forEach((i) => i.addEventListener('change', async () => { try { await db.alterar('guias', i.dataset.pago, { pago: i.checked }); aviso(i.checked ? 'Guia marcada como paga.' : 'Guia marcada como não paga.'); recarregarTela(); } catch (er) { aviso(er.message, 'erro'); } }));
}
