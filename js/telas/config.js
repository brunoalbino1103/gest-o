// Configurações: obrigações (o que gera as tarefas), equipe, geração do mês e conta.
import db from '../db.js';
import { esc, DEPS, REGIMES, nomeComp, aviso, modal, confirmar, dataBR, somaMes } from '../util.js';
import { S, recarregarObrigacoes, recarregarFeriados, eAdmin, limparCacheTarefas } from '../estado.js';
import { tabelas } from '../calculos.js';
import { descreverPrazo, descreverPeriodo, valeNaCompetencia, vencimentoDe, PERIODOS, TIPOS_DIA, AJUSTES } from '../regras.js';
import { topo, recarregarTela } from '../app.js';

const DEPN = { admin: 'Administrador', fiscal: 'Fiscal', dp: 'Pessoal', contabil: 'Contábil', geral: 'Geral' };

export default async function config(el) {
  topo('Configurações', 'Obrigações, equipe e conta');
  const adm = eAdmin();
  el.innerHTML = `
   <div class="card"><div class="card-h"><div><h2>Gerar tarefas do mês</h2><p class="small muted">Cria, para cada cliente ativo, as tarefas das obrigações que valem para ele. Rodar de novo só acrescenta o que falta (clientes ou obrigações novas); nada é apagado.</p></div>
     <div class="barra-f"><label class="sr" for="gComp">Competência</label><input type="month" id="gComp" value="${S.comp}" style="width:170px"><button class="btn" id="gBtn">Gerar tarefas</button></div></div></div>

   <div class="card"><div class="card-h"><div><h2>Obrigações</h2><p class="small muted">Cada obrigação vira uma tarefa por cliente, conforme regime, periodicidade e se o cliente tem funcionários. Os prazos já descontam fins de semana e feriados. <b>Confira os prazos do seu município e estado.</b></p></div>${adm ? `<div class="barra-f">${S.obrigacoes.length ? '' : '<button class="btn sec" id="oPadrao">Carregar obrigações sugeridas</button>'}<button class="btn" id="oNova">+ Nova obrigação</button></div>` : ''}</div>
     <div class="tw"><table class="t"><thead><tr><th>Departamento</th><th>Obrigação</th><th>Periodicidade</th><th>Prazo</th><th>Exemplo em ${nomeComp(S.comp, true)}</th><th>Vale para</th><th>Situação</th>${adm ? '<th></th>' : ''}</tr></thead><tbody>
     ${S.obrigacoes.map((o) => `<tr><td><span class="pill p-${o.departamento}">${DEPS[o.departamento].nome}</span></td><td><b style="font-weight:600">${esc(o.nome)}</b>${o.exige_funcionarios ? '<div class="small muted">só clientes com funcionários</div>' : ''}</td><td class="small">${descreverPeriodo(o)}</td><td class="small">${descreverPrazo(o)}</td><td class="num small">${valeNaCompetencia(o, S.comp) ? dataBR(vencimentoDe(o, S.comp)) : '<span class="muted">não vale</span>'}</td><td class="small">${o.regimes.length === 4 ? 'Todos os regimes' : o.regimes.map((r) => REGIMES[r]).join(', ')}</td><td>${o.ativo ? '<span class="pill p-ok">Ativa</span>' : '<span class="pill p-na">Desligada</span>'}</td>${adm ? `<td><button class="btn sec mini" data-ob="${o.id}">Editar</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="8"><div class="vazio"><b>Nenhuma obrigação cadastrada</b>Clique em "Carregar obrigações sugeridas" para começar com a lista padrão.</div></td></tr>'}
     </tbody></table></div></div>

   <div class="card"><div class="card-h"><div><h2>Feriados municipais e estaduais</h2><p class="small muted">Os nacionais (inclusive Carnaval, Sexta-feira Santa e Corpus Christi) já são calculados. Cadastre aqui os do seu município e estado para os prazos em dia útil saírem certos.</p></div>
     ${adm ? '<form class="barra-f" id="fFer"><label class="sr" for="ferData">Data</label><input type="date" id="ferData" required style="width:160px"><label class="sr" for="ferNome">Nome</label><input id="ferNome" placeholder="Ex.: Aniversário da cidade" required style="width:240px"><button class="btn sec">Adicionar</button></form>' : ''}</div>
     <div class="card-b leg" style="font-size:13px">${(S.feriados || []).map((f) => `<span class="pill p-co">${dataBR(f.data)} · ${esc(f.nome)}${adm ? ` <button data-delfer="${f.data}" style="border:0;background:none;padding:0 0 0 4px;color:inherit" aria-label="Remover">×</button>` : ''}</span>`).join('') || '<span class="muted">Nenhum feriado extra cadastrado.</span>'}</div></div>

   <div class="card"><div class="card-h"><div><h2>Equipe</h2><p class="small muted">${db.demo ? 'No modo demonstração a equipe é fictícia.' : 'Para incluir alguém: no Supabase, Authentication › Users › Invite user. A pessoa recebe um e-mail para criar a senha e aparece aqui; depois ajuste o departamento.'}</p></div></div>
     <div class="tw"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Departamento</th><th>Situação</th>${adm ? '<th></th>' : ''}</tr></thead><tbody>
     ${S.perfis.map((p) => `<tr><td><b style="font-weight:600">${esc(p.nome)}</b>${p.id === S.perfil.id ? ' <span class="pill p-co">você</span>' : ''}</td><td class="small">${esc(p.email || '')}</td><td>${DEPN[p.departamento]}</td><td>${p.ativo ? '<span class="pill p-ok">Ativo</span>' : '<span class="pill p-na">Sem acesso</span>'}</td>${adm ? `<td><button class="btn sec mini" data-pf="${p.id}">Editar</button></td>` : ''}</tr>`).join('')}
     </tbody></table></div></div>

   <div class="card"><div class="card-h"><div><h2>Tabelas de INSS e IRRF (simulador do DP)</h2><p class="small muted">Usadas nas estimativas de rescisão, férias e custo. Atualize quando sair a tabela do ano. O cálculo oficial continua sendo o do Domínio.</p></div>${adm ? '<button class="btn sec" id="tabEd">Editar tabelas</button>' : ''}</div>
     <div class="card-b small" id="tabVer"></div></div>

   <div class="card"><div class="card-h"><h2>Minha conta</h2></div><div class="card-b">
     <form id="fSenha" class="barra-f"><label class="sr" for="nSenha">Nova senha</label><input type="password" id="nSenha" placeholder="Nova senha (mínimo 8 caracteres)" minlength="8" autocomplete="new-password" style="max-width:300px"><button class="btn sec">Trocar senha</button></form>
     ${db.demo ? '<div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="small muted">Modo demonstração: apaga os dados de teste e começa do zero.</span><button class="btn sec" id="dReset">Restaurar dados de teste</button></div>' : ''}
   </div></div>`;
  const $c = (s) => el.querySelector(s);

  $c('#gBtn').addEventListener('click', async (e) => {
    const comp = $c('#gComp').value; if (!comp) return; e.target.disabled = true;
    try { const n = await db.gerarTarefas(comp); await db.registrar('Gerou tarefas', `${n} tarefas de ${nomeComp(comp)}`); limparCacheTarefas(); aviso(n ? `${n} tarefa(s) criada(s) em ${nomeComp(comp)}.` : `${nomeComp(comp)} já estava completo.`); }
    catch (er) { aviso(er.message, 'erro'); }
    e.target.disabled = false;
  });
  el.addEventListener('click', async (e) => {
    const o = e.target.closest('[data-ob]'); if (o) { if (await formObrigacao(S.obrigacoes.find((x) => x.id === o.dataset.ob))) recarregarTela(); return; }
    const p = e.target.closest('[data-pf]'); if (p) { if (await formPerfil(S.perfis.find((x) => x.id === p.dataset.pf))) recarregarTela(); return; }
    if (e.target.id === 'oNova') { if (await formObrigacao({})) recarregarTela(); return; }
    if (e.target.id === 'oPadrao') { try { await db.carregarObrigacoesPadrao(); await recarregarObrigacoes(); aviso('Obrigações sugeridas carregadas. Confira os prazos.'); recarregarTela(); } catch (er) { aviso(er.message, 'erro'); } return; }
    const df = e.target.closest('[data-delfer]'); if (df) { try { await db.excluirFeriado(df.dataset.delfer); await recarregarFeriados(); recarregarTela(); } catch (er) { aviso(er.message, 'erro'); } return; }
    if (e.target.id === 'dReset') { if (await confirmar('Restaurar dados de teste', 'Apagar tudo o que foi feito no modo demonstração e voltar aos dados iniciais?', 'Restaurar')) { db.resetar(); location.reload(); } }
  });
  $c('#fFer')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await db.salvarFeriado({ data: $c('#ferData').value, nome: $c('#ferNome').value.trim() }); await recarregarFeriados(); aviso('Feriado incluído. Vale para as tarefas geradas daqui em diante.'); recarregarTela(); } catch (er) { aviso(er.message, 'erro'); }
  });
  // tabelas do simulador
  const T = tabelas(); const pct = (v) => (v * 100).toFixed(2).replace('.', ',').replace(/,00$/, '') + '%';
  $c('#tabVer').innerHTML = `<b>Ano ${T.ano}</b> · salário mínimo ${brlC(T.salario_minimo)}<br>INSS: ${T.inss.map(([a, p]) => `até ${brlC(a)} ${pct(p)}`).join(' · ')}<br>IRRF: ${T.irrf.map(([a, p, d]) => `${a === Infinity ? 'acima' : 'até ' + brlC(a)} ${pct(p)}${d ? ' (deduz ' + brlC(d) + ')' : ''}`).join(' · ')} · dependente ${brlC(T.irrf_dependente)}${T.irrf_reducao_2026 ? ' · com a isenção até R$ 5.000 (Lei 15.270/2025)' : ''}`;
  $c('#tabEd')?.addEventListener('click', async () => { if (await editarTabelas(T)) { aviso('Tabelas salvas.'); location.reload(); } });
  $c('#fSenha').addEventListener('submit', async (e) => {
    e.preventDefault(); const s = $c('#nSenha').value; if (s.length < 8) return aviso('A senha precisa ter pelo menos 8 caracteres.', 'erro');
    try { await db.trocarSenha(s); $c('#nSenha').value = ''; aviso('Senha trocada.'); } catch (er) { aviso(er.message, 'erro'); }
  });
}

function formObrigacao(o) {
  const rg = o.regimes || Object.keys(REGIMES);
  return modal(o.id ? 'Editar obrigação' : 'Nova obrigação', `<form class="form" id="fOb">
    <label class="f full">Nome *<input name="nome" required value="${esc(o.nome || '')}" placeholder="Ex.: DCTFWeb"></label>
    <label class="f">Departamento<select name="departamento">${Object.entries(DEPS).map(([k, d]) => `<option value="${k}" ${o.departamento === k ? 'selected' : ''}>${d.longo}</option>`).join('')}</select></label>
    <label class="f">Ordem na tela<input type="number" name="ordem" value="${o.ordem ?? 100}"></label>
    <label class="f">Periodicidade<select name="periodicidade">${Object.entries(PERIODOS).map(([k, v]) => `<option value="${k}" ${(o.periodicidade || 'mensal') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="f" data-anual>Aparece na competência de<select name="mes_ref">${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'].map((m, i) => `<option value="${i + 1}" ${(+o.mes_ref || 12) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <label class="f">Tipo de prazo<select name="tipo_dia">${Object.entries(TIPOS_DIA).map(([k, v]) => `<option value="${k}" ${(o.tipo_dia || 'corrido') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="f" data-dia>Dia<input type="number" name="dia_vencimento" min="1" max="31" value="${o.dia_vencimento ?? 20}"></label>
    <label class="f">Vence<select name="meses_depois">${[[0, 'no próprio mês da competência'], [1, 'no mês seguinte'], [2, 'no 2º mês seguinte'], [3, 'no 3º mês seguinte'], [6, 'no 6º mês seguinte'], [7, 'no 7º mês seguinte']].map(([k, v]) => `<option value="${k}" ${(o.meses_depois ?? 1) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="f" data-ajuste>Se cair em fim de semana ou feriado<select name="ajuste">${Object.entries(AJUSTES).map(([k, v]) => `<option value="${k}" ${(o.ajuste || 'nenhum') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <p class="full small" id="oPrev" style="background:var(--co-soft);color:var(--co-dk);border-radius:8px;padding:8px 10px;margin:0"></p>
    <fieldset class="full" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px"><legend class="small" style="padding:0 6px">Vale para os regimes</legend><div class="leg" style="font-size:13.5px;color:var(--ink)">${Object.entries(REGIMES).map(([k, v]) => `<label class="chk"><input type="checkbox" name="rg" value="${k}" ${rg.includes(k) ? 'checked' : ''}> ${v}</label>`).join('')}</div></fieldset>
    <label class="chk"><input type="checkbox" name="exige_funcionarios" ${o.exige_funcionarios ? 'checked' : ''}> Só para clientes com funcionários</label>
    <label class="chk"><input type="checkbox" name="ativo" ${o.ativo !== false ? 'checked' : ''}> Ativa (gera tarefas)</label>
    <p class="full small" id="oErro" style="color:var(--bad)"></p>
    <div class="acoes full" style="margin-top:0">${o.id ? '<button type="button" class="btn sec" id="oApaga" style="color:var(--bad);margin-right:auto">Excluir</button>' : ''}<button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { largura: 640, aoAbrir: (m, fechar) => {
    const f = m.querySelector('#fOb');
    const dados = () => ({ periodicidade: f.periodicidade.value, mes_ref: f.periodicidade.value === 'anual' ? +f.mes_ref.value : null, tipo_dia: f.tipo_dia.value, dia_vencimento: Math.min(31, Math.max(1, +f.dia_vencimento.value || 1)), meses_depois: +f.meses_depois.value, ajuste: f.tipo_dia.value === 'corrido' ? f.ajuste.value : 'nenhum' });
    // mostra os próximos vencimentos para conferir a regra
    const prev = () => {
      const o2 = dados(); m.querySelector('[data-anual]').hidden = o2.periodicidade !== 'anual'; m.querySelector('[data-dia]').hidden = o2.tipo_dia === 'ultimo_util'; m.querySelector('[data-ajuste]').hidden = o2.tipo_dia !== 'corrido';
      const l = []; for (let i = 0, c = S.comp; l.length < 4 && i < 24; i++, c = somaMes(c, 1)) if (valeNaCompetencia(o2, c)) l.push(`${nomeComp(c, true)} → ${dataBR(vencimentoDe(o2, c))}`);
      m.querySelector('#oPrev').textContent = 'Próximos vencimentos: ' + l.join(' · ');
    };
    f.addEventListener('change', prev); f.addEventListener('input', prev); prev();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const regimes = [...f.querySelectorAll('[name=rg]:checked')].map((x) => x.value);
      if (!f.nome.value.trim()) return (m.querySelector('#oErro').textContent = 'Informe o nome.');
      if (!regimes.length) return (m.querySelector('#oErro').textContent = 'Marque pelo menos um regime.');
      try {
        await db.salvarObrigacao({ ...(o.id ? { id: o.id } : {}), nome: f.nome.value.trim(), departamento: f.departamento.value, ordem: +f.ordem.value || 100, ...dados(), regimes, exige_funcionarios: f.exige_funcionarios.checked, ativo: f.ativo.checked });
        await recarregarObrigacoes(); aviso('Obrigação salva.'); fechar(true);
      } catch (er) { m.querySelector('#oErro').textContent = er.message; }
    });
    m.querySelector('#oApaga')?.addEventListener('click', async () => {
      if (!(await confirmar('Excluir obrigação', `Excluir "${o.nome}"? As tarefas já criadas continuam; só não serão geradas nos próximos meses. Se quiser só pausar, desmarque "Ativa".`, 'Excluir'))) return;
      try { await db.excluirObrigacao(o.id); await recarregarObrigacoes(); aviso('Obrigação excluída.'); fechar(true); } catch (er) { aviso(er.message, 'erro'); }
    });
  } });
}

const brlC = (v) => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function editarTabelas(T) {
  const num = (v) => String(v).replace('.', ',');
  const lin = (pre, i, a, p, d) => `<div class="barra-f" style="margin-bottom:6px"><span class="small" style="width:70px">Faixa ${i + 1}</span><label class="small">até R$ <input name="${pre}a${i}" value="${a === Infinity ? '' : num(a)}" placeholder="${a === Infinity ? 'acima' : ''}" style="width:110px"></label><label class="small">alíquota % <input name="${pre}p${i}" value="${num(+(p * 100).toFixed(2))}" style="width:70px"></label>${d !== undefined ? `<label class="small">deduzir R$ <input name="${pre}d${i}" value="${num(d)}" style="width:90px"></label>` : ''}</div>`;
  return modal('Tabelas de INSS e IRRF', `<form id="fTab">
    <div class="form"><label class="f">Ano<input name="ano" value="${T.ano}"></label><label class="f">Salário mínimo (R$)<input name="salario_minimo" value="${num(T.salario_minimo)}"></label></div>
    <div class="secao-t" style="padding:12px 0 6px">INSS do empregado (progressivo)</div>${T.inss.map(([a, p], i) => lin('i', i, a, p)).join('')}
    <div class="secao-t" style="padding:12px 0 6px">IRRF mensal</div>${T.irrf.map(([a, p, d], i) => lin('r', i, a, p, d)).join('')}
    <div class="form" style="margin-top:8px"><label class="f">Dedução por dependente (R$)<input name="irrf_dependente" value="${num(T.irrf_dependente)}"></label><label class="f">Desconto simplificado (R$)<input name="irrf_desconto_simplificado" value="${num(T.irrf_desconto_simplificado)}"></label>
    <label class="chk full"><input type="checkbox" name="irrf_reducao_2026" ${T.irrf_reducao_2026 ? 'checked' : ''}> Aplicar a isenção até R$ 5.000 e a redução até R$ 7.350 (a partir de 2026)</label></div>
    <div class="acoes"><button type="button" class="btn sec" data-fecha>Cancelar</button><button type="button" class="btn sec" id="tabPadrao">Voltar ao padrão</button><button class="btn">Salvar</button></div></form>`, { largura: 720, aoAbrir: (m, fechar) => {
    const fm = m.querySelector('#fTab'); const v = (n) => parseFloat(String(fm[n]?.value || '').replace(/\./g, '').replace(',', '.'));
    m.querySelector('#tabPadrao').onclick = async () => { await db.gravar('parametros', { chave: 'tabelas', valor: null }, 'chave'); fechar(true); };
    fm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = { ano: +fm.ano.value || T.ano, salario_minimo: v('salario_minimo'), inss: T.inss.map((_, i) => [v('ia' + i), v('ip' + i) / 100]).filter(([a]) => a > 0),
        irrf: T.irrf.map((_, i) => [Number.isFinite(v('ra' + i)) ? v('ra' + i) : Infinity, v('rp' + i) / 100, v('rd' + i) || 0]), irrf_dependente: v('irrf_dependente'), irrf_desconto_simplificado: v('irrf_desconto_simplificado'), irrf_reducao_2026: fm.irrf_reducao_2026.checked };
      try { await db.gravar('parametros', { chave: 'tabelas', valor: t }, 'chave'); fechar(true); } catch (er) { aviso(er.message, 'erro'); }
    });
  } });
}

function formPerfil(p) {
  return modal('Editar pessoa da equipe', `<form class="form" id="fPf">
    <label class="f full">Nome<input name="nome" value="${esc(p.nome)}"></label>
    <label class="f">Departamento<select name="departamento">${Object.entries(DEPN).map(([k, v]) => `<option value="${k}" ${p.departamento === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label class="chk" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''} ${p.id === S.perfil.id ? 'disabled' : ''}> Pode acessar o sistema</label>
    <p class="full small muted">Administradores podem excluir clientes, obrigações e arquivos de outras pessoas, e editar a equipe.</p>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { aoAbrir: (m, fechar) => {
    const f = m.querySelector('#fPf');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (p.id === S.perfil.id && f.departamento.value !== 'admin' && !S.perfis.some((x) => x.id !== p.id && x.ativo && x.departamento === 'admin')) return aviso('Você é o único administrador: defina outro antes de sair desse papel.', 'erro');
      try { const n = await db.salvarPerfil({ id: p.id, nome: f.nome.value.trim() || p.nome, departamento: f.departamento.value, ativo: p.id === S.perfil.id ? true : f.ativo.checked }); Object.assign(p, n); if (p.id === S.perfil.id) Object.assign(S.perfil, n); aviso('Salvo.'); fechar(true); }
      catch (er) { aviso(er.message, 'erro'); }
    });
  } });
}
