// Pedaços de tela usados em mais de um lugar.
import db from '../db.js';
import { esc, nomeComp, aviso, STATUS, dataBR, diasAte, atrasada } from '../util.js';
import { S, tarefasDa, limparCacheTarefas, trocarTarefaNoCache, nomePerfil } from '../estado.js';

// Aviso para gerar as tarefas quando a competência ainda não tem nenhuma
export function bannerGerar(tarefas, aoGerar) {
  if (tarefas.length) return '';
  setTimeout(() => {
    document.getElementById('bGerar')?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Gerando…';
      try { const n = await db.gerarTarefas(S.comp); await db.registrar('Gerou tarefas', `${n} tarefas de ${nomeComp(S.comp)}`); limparCacheTarefas(); aviso(n ? `${n} tarefas criadas para ${nomeComp(S.comp)}.` : 'Nenhuma tarefa nova: confira se há clientes ativos e obrigações cadastradas.'); aoGerar && aoGerar(); }
      catch (er) { aviso(er.message, 'erro'); b.disabled = false; b.textContent = 'Gerar tarefas'; }
    });
  });
  return `<div class="banner"><div><b>${nomeComp(S.comp)} ainda não tem tarefas.</b><br><span class="small">O sistema cria as tarefas de cada cliente a partir das obrigações cadastradas (regime e se tem funcionários).</span></div><button class="btn" id="bGerar">Gerar tarefas</button></div>`;
}

export const rotStatus = (t) => atrasada(t) ? 'Atrasada' : STATUS[t.status];
export const clsStatus = (t) => atrasada(t) ? 'p-bad' : { concluida: 'p-ok', andamento: 'p-at', pendente: 'p-co', nao_aplica: 'p-na' }[t.status];
export const prazoTxt = (t) => {
  if (!t.vencimento) return '';
  if (t.status === 'concluida' || t.status === 'nao_aplica') return 'vence ' + dataBR(t.vencimento);
  const d = diasAte(t.vencimento);
  return d < 0 ? `venceu há ${-d} dia${d === -1 ? '' : 's'}` : d === 0 ? 'vence hoje' : `vence em ${d} dia${d === 1 ? '' : 's'} (${dataBR(t.vencimento)})`;
};

// Janelinha para mudar a situação de uma tarefa (status, responsável, observação)
let popAberto = null;
export function fecharPop() { if (popAberto) { popAberto.remove(); popAberto = null; } }
document.addEventListener('mousedown', (e) => { if (popAberto && !popAberto.contains(e.target) && !e.target.closest('[data-tarefa]')) fecharPop(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharPop(); });

export function abrirTarefa(alvo, t, aoMudar) {
  fecharPop();
  const pop = document.createElement('div'); pop.className = 'pop'; pop.setAttribute('role', 'dialog');
  pop.innerHTML = `<div><b style="font-size:13.5px">${esc(t.titulo)}</b><div class="small muted">${esc(prazoTxt(t))}${t.concluida_em && t.status === 'concluida' ? ' · feita por ' + esc(nomePerfil(t.concluida_por)) : ''}</div></div>
    <div class="ops">${Object.entries(STATUS).map(([k, v]) => `<button data-s="${k}" aria-pressed="${t.status === k}">${v}</button>`).join('')}</div>
    <label class="f">Responsável<select data-resp><option value="">—</option>${S.perfis.filter((p) => p.ativo).map((p) => `<option value="${p.id}" ${p.id === t.responsavel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
    <label class="f">Observação<textarea data-obs rows="2" style="min-height:56px" placeholder="Ex.: aguardando extrato do cliente">${esc(t.observacao || '')}</textarea></label>
    <div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn mini sec" data-x>Fechar</button><button class="btn mini" data-salva>Salvar</button></div>`;
  document.body.append(pop);
  const r = alvo.getBoundingClientRect();
  pop.style.top = Math.min(window.scrollY + r.bottom + 6, window.scrollY + window.innerHeight - pop.offsetHeight - 10) + 'px';
  pop.style.left = Math.max(10, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 10)) + 'px';
  popAberto = pop;
  const salvar = async (campos) => {
    try { const n = await db.atualizarTarefa(t.id, campos); trocarTarefaNoCache(n); Object.assign(t, n); if (campos.status) db.registrar('Tarefa: ' + STATUS[campos.status], t.titulo, t.cliente_id); fecharPop(); aoMudar && aoMudar(n); }
    catch (er) { aviso(er.message, 'erro'); }
  };
  pop.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => salvar({ status: b.dataset.s, responsavel: pop.querySelector('[data-resp]').value || null, observacao: pop.querySelector('[data-obs]').value.trim() || null })));
  pop.querySelector('[data-salva]').addEventListener('click', () => salvar({ responsavel: pop.querySelector('[data-resp]').value || null, observacao: pop.querySelector('[data-obs]').value.trim() || null }));
  pop.querySelector('[data-x]').addEventListener('click', fecharPop);
  pop.querySelector('[data-s][aria-pressed="true"]')?.focus();
}

export { tarefasDa };
