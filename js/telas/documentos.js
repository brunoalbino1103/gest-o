// Documentos: importar e consultar os arquivos de todos os clientes.
import db from '../db.js';
import { esc, DEPS, TIPOS_DOC, nomeComp, dataBR, tamanho, semAcento, aviso, confirmar, modal, fmtCNPJ } from '../util.js';
import { S, nomeCliente, nomePerfil, eAdmin, limparCacheTarefas } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { areaImportacao } from './importacao.js';
import { linhaPainel } from '../leitor.js';

const F = { dep: '', tipo: '', busca: '', so: '' };

export default async function documentos(el, _p, vivo) {
  topo('Documentos', `Competência ${nomeComp(S.comp)}`);
  el.innerHTML = `<div class="card"><div class="card-h"><h2>Importar documentos</h2></div><div class="card-b" id="dImp"></div></div>
    <div class="card"><div class="card-h"><h2>Arquivos de ${nomeComp(S.comp)}</h2>
     <div class="barra-f">
      <label class="sr" for="fBusca">Buscar</label><input type="search" id="fBusca" placeholder="Arquivo ou cliente" value="${esc(F.busca)}">
      <label class="sr" for="fDep">Departamento</label><select id="fDep"><option value="">Todos os departamentos</option>${Object.entries(DEPS).map(([k, d]) => `<option value="${k}" ${F.dep === k ? 'selected' : ''}>${d.longo}</option>`).join('')}</select>
      <label class="sr" for="fTipo">Tipo</label><select id="fTipo"><option value="">Todos os tipos</option>${Object.entries(TIPOS_DOC).map(([k, t]) => `<option value="${k}" ${F.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label class="chk small"><input type="checkbox" id="fSem" ${F.so ? 'checked' : ''}> Só sem cliente</label>
     </div></div>
     <div id="dLista"><div class="carregando">Carregando…</div></div></div>`;
  areaImportacao(el.querySelector('#dImp'), { aoTerminar: () => carregar() });
  const $c = (s) => el.querySelector(s);
  let docs = [];
  const carregar = async () => { docs = await db.documentos({ competencia: S.comp }); if (vivo()) lista(); };
  const lista = () => {
    const q = semAcento(F.busca);
    const L = docs.filter((d) => (!F.dep || d.departamento === F.dep) && (!F.tipo || d.tipo === F.tipo) && (!F.so || !d.cliente_id) && (!q || semAcento(d.nome_arquivo + ' ' + nomeCliente(d.cliente_id)).includes(q)));
    $c('#dLista').innerHTML = L.length ? `<div class="tw" style="max-height:640px;overflow:auto"><table class="t"><thead><tr><th>Arquivo</th><th>Cliente</th><th>Departamento</th><th>Tipo</th><th>Enviado</th><th></th></tr></thead><tbody>
      ${L.slice(0, 500).map((d) => `<tr data-id="${d.id}"><td><button class="lk-doc" data-abre style="border:0;background:none;padding:0;color:var(--co-dk);text-align:left;word-break:break-all;font-weight:500">${esc(d.nome_arquivo)}</button><div class="small muted">${tamanho(d.tamanho || 0)}${d.dados?.tipo === 'nota' ? ' · ' + resumoDados(d.dados) : ''}</div></td>
        <td>${d.cliente_id ? esc(nomeCliente(d.cliente_id)) : '<span class="pill p-at">Sem cliente</span>'}</td>
        <td>${d.departamento ? `<span class="pill p-${d.departamento}">${DEPS[d.departamento].nome}</span>` : '—'}</td>
        <td>${TIPOS_DOC[d.tipo] || esc(d.tipo)}</td>
        <td class="small muted">${dataBR(d.enviado_em)}<br>${esc(nomePerfil(d.enviado_por))}</td>
        <td style="white-space:nowrap"><button class="btn sec mini" data-baixa>Baixar</button> <button class="btn sec mini" data-edita>Editar</button> ${eAdmin() || d.enviado_por === S.perfil?.id ? '<button class="btn-x" data-apaga aria-label="Excluir" title="Excluir">×</button>' : ''}</td></tr>`).join('')}
      </tbody></table></div>${L.length > 500 ? `<p class="small muted" style="padding:10px 18px">Mostrando 500 de ${L.length}. Use os filtros.</p>` : ''}`
      : `<div class="vazio">${docs.length ? 'Nenhum arquivo com esse filtro.' : `<b>Nenhum arquivo em ${nomeComp(S.comp)}</b>Arraste os arquivos na área acima.`}</div>`;
  };
  await carregar();

  $c('#fBusca').addEventListener('input', (e) => { F.busca = e.target.value; lista(); });
  $c('#fDep').addEventListener('change', (e) => { F.dep = e.target.value; lista(); });
  $c('#fTipo').addEventListener('change', (e) => { F.tipo = e.target.value; lista(); });
  $c('#fSem').addEventListener('change', (e) => { F.so = e.target.checked; lista(); });
  $c('#dLista').addEventListener('click', async (e) => {
    const tr = e.target.closest('[data-id]'); if (!tr) return; const d = docs.find((x) => x.id === tr.dataset.id);
    try {
      if (e.target.closest('[data-abre]')) { const w = window.open('', '_blank'); const u = await db.abrirDocumento(d); if (w) w.location = u; else location.href = u; }
      if (e.target.closest('[data-baixa]')) { const u = await db.linkDocumento(d); const a = document.createElement('a'); a.href = u; a.download = d.nome_arquivo; a.click(); }
      if (e.target.closest('[data-edita]')) { if (await editarDocumento(d)) carregar(); }
      if (e.target.closest('[data-apaga]')) {
        if (!(await confirmar('Excluir arquivo', `Excluir "${d.nome_arquivo}"? O arquivo e a nota lida dele saem do sistema. Não dá para desfazer.`, 'Excluir'))) return;
        await db.excluirDocumento(d); await db.registrar('Excluiu documento', d.nome_arquivo, d.cliente_id); aviso('Arquivo excluído.'); carregar();
      }
    } catch (er) { aviso(er.message, 'erro'); }
  });
}

export const resumoDados = (x) => x?.tipo === 'nota' ? `${x.tipo_documento} ${x.numero || ''} · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(x.valor_nf || 0)}` : '';

// Ajustar cliente, departamento, tipo e competência de um documento já enviado
export function editarDocumento(d) {
  const rot = (c) => `${c.nome_fantasia || c.razao_social}${c.cnpj ? ' — ' + fmtCNPJ(c.cnpj) : ''}`;
  const c0 = S.clientes.find((c) => c.id === d.cliente_id);
  return modal('Editar documento', `<form class="form" id="fDoc">
    <p class="full small muted mt0" style="word-break:break-all">${esc(d.nome_arquivo)}</p>
    <label class="f full">Cliente<input list="dlCliE" name="cli" value="${c0 ? esc(rot(c0)) : ''}" placeholder="Digite o nome do cliente"><datalist id="dlCliE">${S.clientes.map((c) => `<option value="${esc(rot(c))}"></option>`).join('')}</datalist></label>
    <label class="f">Departamento<select name="departamento">${Object.entries(DEPS).map(([k, x]) => `<option value="${k}" ${d.departamento === k ? 'selected' : ''}>${x.longo}</option>`).join('')}</select></label>
    <label class="f">Tipo<select name="tipo">${Object.entries(TIPOS_DOC).map(([k, t]) => `<option value="${k}" ${d.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Competência<input type="month" name="competencia" value="${d.competencia || ''}"></label>
    <p class="full small" id="eErro" style="color:var(--bad)"></p>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { aoAbrir: (m, fechar) => {
    m.querySelector('#fDoc').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const cli = f.get('cli') ? S.clientes.find((c) => rot(c) === f.get('cli')) : null;
      if (f.get('cli') && !cli) { m.querySelector('#eErro').textContent = 'Escolha um cliente da lista.'; return; }
      try {
        await db.atualizarDocumento(d.id, { cliente_id: cli?.id || null, departamento: f.get('departamento'), tipo: f.get('tipo'), competencia: f.get('competencia') || null });
        // nota que estava sem cliente: entra agora no Painel Fiscal
        const x = d.dados;
        if (cli && !d.cliente_id && x?.tipo === 'nota') {
          try { await db.inserirNota({ ...linhaPainel(x, cli.cnpj), cliente_id: cli.id, documento_id: d.id, competencia: f.get('competencia') || x.data?.slice(0, 7) }); } catch (er) { /* já existia */ }
        }
        if (cli && !d.cliente_id && x?.tipo === 'inutilizacao') {
          try { await db.inserirInutilizacao({ cliente_id: cli.id, modelo: x.modelo, serie: x.serie, n_ini: x.n_ini, n_fin: x.n_fin, data: x.data, competencia: f.get('competencia') || x.data?.slice(0, 7), motivo: x.motivo, documento_id: d.id }); } catch (er) { /* já existia */ }
        }
        await db.registrar('Editou documento', d.nome_arquivo, cli?.id); aviso('Documento atualizado.'); fechar(true);
      } catch (er) { m.querySelector('#eErro').textContent = er.message; }
    });
  } });
}
export { recarregarTela, limparCacheTarefas };
