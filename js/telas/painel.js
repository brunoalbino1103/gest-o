// Visão geral: saúde do escritório, os 3 departamentos e o mapa de clientes.
import { esc, DEPS, nomeComp, situacao, SIT, atrasada, diasAte, iniciais, semAcento, REGIMES } from '../util.js';
import { S, tarefasDa, ativos, nomeCliente, nomePerfil } from '../estado.js';
import { topo, irPara, recarregarTela } from '../app.js';
import { bannerGerar, prazoTxt } from './comum.js';

let filtro = 'todos', busca = '', resp = '';

export default async function painel(el, _p, vivo) {
  topo('Visão geral', `Competência ${nomeComp(S.comp)}`);
  const T = await tarefasDa(S.comp); if (!vivo()) return;
  const cli = ativos();
  const porCli = new Map(cli.map((c) => [c.id, { fiscal: [], dp: [], contabil: [] }]));
  T.forEach((t) => porCli.get(t.cliente_id)?.[t.departamento]?.push(t));

  const validas = T.filter((t) => t.status !== 'nao_aplica');
  const feitas = validas.filter((t) => t.status === 'concluida').length;
  const atras = validas.filter(atrasada);
  const semana = validas.filter((t) => !atrasada(t) && t.status !== 'concluida' && t.vencimento && diasAte(t.vencimento) <= 7);
  const pct = validas.length ? Math.round(feitas / validas.length * 100) : 0;
  const cliAtraso = new Set(atras.map((t) => t.cliente_id)).size;

  const depCard = (k) => {
    const l = T.filter((t) => t.departamento === k && t.status !== 'nao_aplica');
    const ok = l.filter((t) => t.status === 'concluida').length, bad = l.filter(atrasada).length, ab = l.length - ok - bad;
    const p = l.length ? Math.round(ok / l.length * 100) : 0;
    return `<a class="dep-card" href="#/dep/${k}" style="--c:${DEPS[k].cor};text-decoration:none;color:inherit">
      <div class="dh"><b>${DEPS[k].longo}</b><span class="pct">${p}%</span></div>
      <div class="barra">${ok ? `<span style="flex:${ok};background:var(--ok)"></span>` : ''}${ab ? `<span style="flex:${ab};background:#C9D1E0"></span>` : ''}${bad ? `<span style="flex:${bad};background:var(--bad)"></span>` : ''}</div>
      <div class="leg"><span><i style="background:var(--ok)"></i>${ok} concluídas</span><span><i style="background:#C9D1E0"></i>${ab} em aberto</span><span><i style="background:var(--bad)"></i>${bad} atrasadas</span></div></a>`;
  };

  el.innerHTML = `${bannerGerar(T, recarregarTela)}
   <div class="grid g4">
    <div class="kpi ${pct >= 80 ? 'ok' : pct >= 50 ? 'at' : 'bad'}"><span class="l">Concluído no mês</span><span class="v">${pct}%</span><span class="s">${feitas} de ${validas.length} tarefas</span></div>
    <div class="kpi ${atras.length ? 'bad' : 'ok'}"><span class="l">Atrasadas</span><span class="v">${atras.length}</span><span class="s">em ${cliAtraso} cliente${cliAtraso === 1 ? '' : 's'}</span></div>
    <div class="kpi ${semana.length ? 'at' : ''}"><span class="l">Vencem em 7 dias</span><span class="v">${semana.length}</span><span class="s">ainda não concluídas</span></div>
    <a class="kpi" href="#/clientes" style="text-decoration:none;color:inherit"><span class="l">Clientes ativos</span><span class="v">${cli.length}</span><span class="s">${Object.entries(REGIMES).map(([k, v]) => `${cli.filter((c) => c.regime === k).length} ${k === 'mei' ? 'MEI' : v.replace('Lucro ', '').replace(' Nacional', '')}`).join(' · ')}</span></a>
   </div>
   <div class="grid g3">${Object.keys(DEPS).map(depCard).join('')}</div>
   <div class="lado-a-lado">
    <div class="grow card">
     <div class="card-h"><h2>Clientes por departamento</h2>
      <div class="barra-f">
       <label class="sr" for="pBusca">Buscar cliente</label><input type="search" id="pBusca" placeholder="Buscar cliente ou CNPJ" value="${esc(busca)}">
       <div class="seg" role="group" aria-label="Situação">${[['todos', 'Todos'], ['aberto', 'Com pendência'], ['atraso', 'Com atraso']].map(([k, t]) => `<button data-f="${k}" aria-pressed="${filtro === k}">${t}</button>`).join('')}</div>
       <label class="sr" for="pResp">Responsável</label><select id="pResp"><option value="">Todos os responsáveis</option>${S.perfis.filter((p) => p.ativo).map((p) => `<option value="${p.id}" ${resp === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>
      </div></div>
     <div class="leg" style="padding:10px 18px 0">${['ok', 'aberto', 'atraso', 'na'].map((k) => `<span><span class="shape s-${SIT[k].cls}" style="width:16px;height:16px;font-size:10px;margin-right:5px">${SIT[k].ic}</span>${SIT[k].rot}</span>`).join('')}</div>
     <div class="tw" style="max-height:640px;overflow:auto;margin-top:8px"><table class="t heat"><thead><tr><th>Cliente</th>${Object.values(DEPS).map((d) => `<th>${d.nome}</th>`).join('')}</tr></thead><tbody id="pCorpo"></tbody></table></div>
    </div>
    <div class="aside card">
     <div class="card-h"><h2>Resolver primeiro</h2><span class="small muted">${atras.length} atrasada${atras.length === 1 ? '' : 's'} · ${semana.length} vencendo</span></div>
     <div class="lista" style="max-height:700px;overflow:auto">${[...atras.sort((a, b) => a.vencimento.localeCompare(b.vencimento)), ...semana.sort((a, b) => a.vencimento.localeCompare(b.vencimento))].slice(0, 25).map((t) => {
       const d = diasAte(t.vencimento);
       return `<button class="item" data-cli="${t.cliente_id}"><span class="rk ${atrasada(t) ? '' : 'at'}">${d < 0 ? d + 'd' : d === 0 ? 'hoje' : '+' + d + 'd'}</span><div><b>${esc(nomeCliente(t.cliente_id))}</b><span>${esc(t.titulo)} · ${DEPS[t.departamento].nome}</span><small>${esc(prazoTxt(t))}${t.responsavel ? ' · ' + esc(nomePerfil(t.responsavel)) : ''}</small></div></button>`;
     }).join('') || '<div class="vazio"><b>Nada atrasado</b>Nenhuma tarefa vencida ou vencendo nos próximos 7 dias.</div>'}</div>
    </div>
   </div>`;

  const corpo = () => {
    const q = semAcento(busca), qd = busca.replace(/\D/g, '');
    const linhas = cli.filter((c) => {
      const d = porCli.get(c.id); const sits = Object.keys(DEPS).map((k) => situacao(d[k]));
      if (filtro === 'atraso' && !sits.includes('atraso')) return false;
      if (filtro === 'aberto' && !sits.some((s) => s === 'atraso' || s === 'aberto')) return false;
      if (resp && ![c.resp_fiscal, c.resp_dp, c.resp_contabil].includes(resp)) return false;
      if (q && !semAcento(c.razao_social + ' ' + (c.nome_fantasia || '')).includes(q) && !(qd && (c.cnpj || '').includes(qd))) return false;
      return true;
    });
    $c('#pCorpo').innerHTML = linhas.map((c) => {
      const d = porCli.get(c.id);
      return `<tr><td><a class="co" href="#/cliente/${c.id}" style="text-decoration:none;color:inherit"><span class="av">${esc(iniciais(c.nome_fantasia || c.razao_social))}</span><div><b>${esc(c.nome_fantasia || c.razao_social)}</b><span>${REGIMES[c.regime]}${c.tem_funcionarios ? ' · com funcionários' : ''}</span></div></a></td>
        ${Object.keys(DEPS).map((k) => {
          const l = d[k], s = situacao(l), v = l.filter((t) => t.status !== 'nao_aplica'), ok = v.filter((t) => t.status === 'concluida').length, bad = v.filter(atrasada);
          const sub = s === 'atraso' ? esc(bad[0].titulo) + (bad.length > 1 ? ` +${bad.length - 1}` : '') : s === 'aberto' ? `${ok} de ${v.length} concluídas` : s === 'ok' ? `${v.length} de ${v.length}` : '';
          return `<td class="cel"><button class="cel-b c-${SIT[s].cls}" data-cli="${c.id}" title="${DEPS[k].longo}: ${SIT[s].rot}"><span class="shape s-${SIT[s].cls}">${SIT[s].ic}</span><span><b>${SIT[s].rot}</b><small>${sub}</small></span></button></td>`;
        }).join('')}</tr>`;
    }).join('') || `<tr><td colspan="4"><div class="vazio">${cli.length ? 'Nenhum cliente com esse filtro.' : '<b>Nenhum cliente cadastrado</b>Cadastre ou importe seus clientes na tela Clientes.'}</div></td></tr>`;
  };
  const $c = (s) => el.querySelector(s);
  corpo();
  $c('#pBusca').addEventListener('input', (e) => { busca = e.target.value; corpo(); });
  $c('#pResp').addEventListener('change', (e) => { resp = e.target.value; corpo(); });
  el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.f; el.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', x === b)); corpo(); }));
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-cli]'); if (b) irPara('#/cliente/' + b.dataset.cli); });
}
