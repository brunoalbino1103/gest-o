// Admissões, rescisões, afastamentos e alterações: cada pedido com o seu prazo legal.
import db from '../db.js';
import { esc, dataBR, aviso, modal, confirmar, diasAte, hojeISO } from '../util.js';
import { S } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { nomeEmp, empresasDP } from './dp-comum.js';

const TIPOS = { admissao: 'Admissão', rescisao: 'Rescisão', afastamento: 'Afastamento', alteracao: 'Alteração contratual', ferias: 'Férias' };
const STATUS = { pendente: 'Pendente', andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
const dia = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
// prazos: admissão (eSocial S-2200 até o dia anterior ao início), rescisão (pagamento em até 10 dias), afastamento (S-2230 até o dia 15 do mês seguinte)
export function prazoDe(tipo, data) {
  if (!data) return null;
  if (tipo === 'admissao') return dia(data, -1);
  if (tipo === 'rescisao') return dia(data, 10);
  if (tipo === 'afastamento' || tipo === 'alteracao') { const [y, m] = data.split('-').map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-15`; }
  if (tipo === 'ferias') return dia(data, -2);
  return data;
}
const ROT_DATA = { admissao: 'Início do trabalho', rescisao: 'Último dia trabalhado', afastamento: 'Início do afastamento', alteracao: 'Data da alteração', ferias: 'Início das férias' };

let filtro = 'abertas';
export default async function movimentacoes(el, _r, vivo) {
  const [movs, funcs] = await Promise.all([db.movimentacoes(), db.funcionarios()]); if (!vivo()) return;
  const L0 = movs.filter((m) => !S.empresa || m.cliente_id === S.empresa);
  topo('Admissões e rescisões', 'Pedidos do cliente com o prazo legal de cada um: admissão (eSocial até o dia anterior), rescisão (pagar em até 10 dias), afastamentos e alterações.');
  const abertas = L0.filter((m) => m.status === 'pendente' || m.status === 'andamento');
  el.innerHTML = `<div class="card"><div class="card-h"><div class="seg" role="group" aria-label="Filtro">${[['abertas', `Em aberto (${abertas.length})`], ['todas', 'Todas']].map(([k, t]) => `<button data-f="${k}" aria-pressed="${filtro === k}">${t}</button>`).join('')}</div><button class="btn" id="mNova">+ Nova movimentação</button></div>
    <div class="tw"><table class="t"><thead><tr><th>Prazo</th><th>Tipo</th><th>Colaborador</th>${S.empresa ? '' : '<th>Empresa</th>'}<th>Data</th><th>Situação</th><th>Observação</th></tr></thead><tbody>
    ${(filtro === 'abertas' ? abertas : L0).map((m) => { const d = m.prazo ? diasAte(m.prazo) : null; const aberta = m.status === 'pendente' || m.status === 'andamento';
      return `<tr class="lk" data-id="${m.id}"><td class="num">${dataBR(m.prazo)}${aberta && d !== null ? `<div class="small" style="color:${d < 0 ? 'var(--bad)' : d <= 3 ? 'var(--at-ink)' : 'var(--muted)'}">${d < 0 ? 'venceu há ' + -d + ' dias' : d === 0 ? 'vence hoje' : 'em ' + d + ' dias'}</div>` : ''}</td>
      <td><span class="pill ${m.tipo === 'rescisao' ? 'p-bad' : m.tipo === 'admissao' ? 'p-ok' : 'p-co'}">${TIPOS[m.tipo]}</span></td><td><b>${esc(m.nome || '')}</b></td>${S.empresa ? '' : `<td>${esc(nomeEmp(S.clientes.find((c) => c.id === m.cliente_id)))}</td>`}
      <td class="num">${dataBR(m.data_evento)}</td><td><span class="pill ${m.status === 'concluida' ? 'p-ok' : m.status === 'cancelada' ? 'p-na' : 'p-at'}">${STATUS[m.status]}</span></td><td class="small muted">${esc(m.observacao || '')}</td></tr>`; }).join('') || `<tr><td colspan="7"><div class="vazio">${filtro === 'abertas' ? 'Nenhuma movimentação em aberto.' : 'Nenhuma movimentação registrada.'}</div></td></tr>`}
    </tbody></table></div></div>`;
  el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.f; recarregarTela(); }));
  el.querySelector('#mNova').addEventListener('click', async () => { if (await form({ cliente_id: S.empresa || '' }, funcs)) recarregarTela(); });
  el.querySelector('tbody').addEventListener('click', async (e) => { const r = e.target.closest('[data-id]'); if (r && await form(movs.find((m) => m.id === r.dataset.id), funcs)) recarregarTela(); });
}

function form(m, funcs) {
  const emps = empresasDP();
  return modal(m.id ? TIPOS[m.tipo] + ' · ' + (m.nome || '') : 'Nova movimentação', `<form class="form" id="fMov">
    <label class="f">Tipo<select name="tipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${(m.tipo || 'admissao') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Empresa<select name="cliente_id" required><option value="">Escolha…</option>${emps.map((c) => `<option value="${c.id}" ${m.cliente_id === c.id ? 'selected' : ''}>${esc(nomeEmp(c))}</option>`).join('')}</select></label>
    <label class="f full">Colaborador<input name="nome" list="dlFu" value="${esc(m.nome || '')}" placeholder="Nome (na admissão, o nome do novo colaborador)" required><datalist id="dlFu">${funcs.filter((f) => f.situacao !== 'desligado').map((f) => `<option value="${esc(f.nome)}"></option>`).join('')}</datalist></label>
    <label class="f"><span id="rotData">${ROT_DATA[m.tipo || 'admissao']}</span><input type="date" name="data_evento" value="${m.data_evento || ''}" required></label>
    <label class="f">Prazo<input type="date" name="prazo" value="${m.prazo || ''}"><span class="small muted" style="font-weight:400" id="prazoDica"></span></label>
    <label class="f">Situação<select name="status">${Object.entries(STATUS).map(([k, t]) => `<option value="${k}" ${(m.status || 'pendente') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <span></span>
    <label class="f full">Observação<textarea name="observacao" style="min-height:60px">${esc(m.observacao || '')}</textarea></label>
    <p class="full small" id="mErro" style="color:var(--bad)"></p>
    <div class="acoes full" style="margin-top:0">${m.id ? '<button type="button" class="btn sec" id="mApaga" style="color:var(--bad);margin-right:auto">Excluir</button>' : ''}<button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { largura: 640, aoAbrir: (md, fechar) => {
    const f = md.querySelector('#fMov');
    const auto = () => { md.querySelector('#rotData').textContent = ROT_DATA[f.tipo.value]; const p = prazoDe(f.tipo.value, f.data_evento.value); if (p && (!m.id || !f.prazo.dataset.mexeu)) f.prazo.value = p; md.querySelector('#prazoDica').textContent = { admissao: 'eSocial: até o dia anterior ao início', rescisao: 'pagamento em até 10 dias', afastamento: 'eSocial: até o dia 15 do mês seguinte', alteracao: 'eSocial: até o dia 15 do mês seguinte', ferias: 'pagamento até 2 dias antes' }[f.tipo.value]; };
    f.prazo.addEventListener('input', () => { f.prazo.dataset.mexeu = '1'; });
    f.tipo.addEventListener('change', auto); f.data_evento.addEventListener('change', auto); auto();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const x = Object.fromEntries(new FormData(f));
      if (!x.cliente_id) return (md.querySelector('#mErro').textContent = 'Escolha a empresa.');
      const fu = funcs.find((y) => y.nome === x.nome && y.cliente_id === x.cliente_id);
      try {
        await db.salvarMovimentacao({ ...(m.id ? { id: m.id } : {}), ...x, funcionario_id: fu?.id || m.funcionario_id || null, prazo: x.prazo || null, observacao: x.observacao || null, concluida_em: x.status === 'concluida' ? new Date().toISOString() : null });
        // rescisão concluída: o colaborador passa para desligado
        if (x.tipo === 'rescisao' && x.status === 'concluida' && fu && fu.situacao !== 'desligado') await db.salvarFuncionario({ id: fu.id, situacao: 'desligado', desligamento: x.data_evento });
        await db.registrar(TIPOS[x.tipo] + ': ' + STATUS[x.status], x.nome, x.cliente_id); aviso('Movimentação salva.'); fechar(true);
      } catch (er) { md.querySelector('#mErro').textContent = er.message; }
    });
    md.querySelector('#mApaga')?.addEventListener('click', async () => { if (!(await confirmar('Excluir movimentação', 'Excluir este registro?', 'Excluir'))) return; try { await db.excluirMovimentacao(m.id); fechar(true); } catch (er) { aviso(er.message, 'erro'); } });
  } });
}
export { hojeISO };
