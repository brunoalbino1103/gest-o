// Contratos de experiência: quando vence o 1º período e quando acaba (para decidir prorrogar ou efetivar).
import db from '../db.js';
import { esc, dataBR } from '../util.js';
import { S } from '../estado.js';
import { topo } from '../app.js';
import { experiencia, nomeEmp } from './dp-comum.js';

export default async function experienciaDP(el, _r, vivo) {
  const funcs = (await db.funcionarios()).filter((f) => !S.empresa || f.cliente_id === S.empresa); if (!vivo()) return;
  const l = funcs.map((f) => ({ f, x: experiencia(f) })).filter((r) => r.x && r.x.fase !== 'encerrada').sort((a, b) => a.x.prox.localeCompare(b.x.prox));
  const enc = funcs.map((f) => ({ f, x: experiencia(f) })).filter((r) => r.x && r.x.fase === 'encerrada' && r.x.dias >= -30);
  topo('Experiência', 'Contratos de experiência em andamento: vencimento do 1º período (prorrogar?) e do final (efetivar ou desligar).');
  const nome = (id) => nomeEmp(S.clientes.find((c) => c.id === id));
  const cor = (d) => d <= 7 ? 'p-bad' : d <= 15 ? 'p-at' : 'p-co';
  el.innerHTML = `<div class="grid g3">
      <div class="kpi ${l.filter((r) => r.x.dias <= 7).length ? 'bad' : ''}"><span class="l">Vencem em até 7 dias</span><span class="v">${l.filter((r) => r.x.dias <= 7).length}</span><span class="s">decidir agora</span></div>
      <div class="kpi"><span class="l">Em experiência</span><span class="v">${l.length}</span><span class="s">contratos em andamento</span></div>
      <div class="kpi"><span class="l">Terminaram há pouco</span><span class="v">${enc.length}</span><span class="s">últimos 30 dias: conferir se foram efetivados</span></div></div>
    <div class="card"><div class="tw"><table class="t"><thead><tr><th>Colaborador</th>${S.empresa ? '' : '<th>Empresa</th>'}<th>Admissão</th><th>Contrato</th><th>1º período vence</th><th>Fim da experiência</th><th>Próximo passo</th></tr></thead><tbody>
    ${l.map(({ f, x }) => `<tr><td><b>${esc(f.nome)}</b><div class="small muted">${esc(f.cargo || '')}</div></td>${S.empresa ? '' : `<td>${esc(nome(f.cliente_id))}</td>`}<td class="num">${dataBR(f.admissao)}</td><td>${f.exp_dias_1 ? f.exp_dias_1 + ' + ' + (f.exp_dias_total - f.exp_dias_1) : f.exp_dias_total} dias</td>
      <td class="num">${x.v1 ? dataBR(x.v1) : '—'}</td><td class="num">${dataBR(x.v2)}</td>
      <td><span class="pill ${cor(x.dias)}">${x.fase === '1º período' ? 'Prorrogar ou desligar' : 'Efetivar ou desligar'} · ${x.dias === 0 ? 'hoje' : x.dias === 1 ? 'amanhã' : 'em ' + x.dias + ' dias'}</span></td></tr>`).join('') || `<tr><td colspan="7"><div class="vazio"><b>Ninguém em experiência</b>No cadastro do colaborador, informe o contrato de experiência (ex.: 45 + 45 dias) para acompanhar aqui.</div></td></tr>`}
    </tbody></table></div></div>`;
}
