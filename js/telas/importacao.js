// Importação de documentos: arrasta arquivos, o sistema identifica cliente/tipo/mês, a pessoa confere e envia.
import db from '../db.js';
import { esc, DEPS, TIPOS_DOC, DEP_DO_TIPO, nomeComp, brl, tamanho, fmtCNPJ, aviso, soDigitos } from '../util.js';
import { S } from '../estado.js';
import { lerXML, classificar, lerOFX, linhaPainel } from '../leitor.js';

const LIMITE = 50 * 1024 * 1024; // limite por arquivo no plano gratuito do Supabase
const rotCli = (c) => `${c.nome_fantasia || c.razao_social}${c.cnpj ? ' — ' + fmtCNPJ(c.cnpj) : ''}`;

// Monta a área de importação dentro de "alvo". opcoes.cliente fixa o cliente (tela do cliente).
export function areaImportacao(alvo, { cliente = null, aoTerminar } = {}) {
  let fila = [];
  const porCnpj = new Map(S.clientes.filter((c) => c.cnpj).map((c) => [c.cnpj, c]));
  const porRot = new Map(S.clientes.map((c) => [rotCli(c), c]));
  const raizCnpj = new Map(); S.clientes.forEach((c) => { if (c.cnpj?.length === 14) { const r = c.cnpj.slice(0, 8); raizCnpj.set(r, raizCnpj.has(r) ? null : c); } });
  const achaCli = (cnpj) => { cnpj = soDigitos(cnpj); return porCnpj.get(cnpj) || (cnpj.length === 14 ? raizCnpj.get(cnpj.slice(0, 8)) : null) || null; }; // filial cai na matriz se só houver uma

  alvo.innerHTML = `<div class="drop" id="mDrop">
      <b>Arraste os arquivos aqui</b>
      <span class="small muted">XML de notas (NF-e, NFC-e, NFS-e, CT-e), PDFs de guias, holerites e atestados, extratos OFX, planilhas e imagens. Pode mandar vários de uma vez.</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px"><label class="btn">Escolher arquivos<input type="file" multiple hidden id="mArq"></label><label class="btn sec">Escolher uma pasta<input type="file" webkitdirectory multiple hidden id="mPasta"></label></div>
      ${cliente ? `<span class="pill p-co" style="margin-top:6px">Tudo vai para ${esc(cliente.nome_fantasia || cliente.razao_social)}</span>` : '<span class="small muted" style="margin-top:4px">O cliente é reconhecido pelo CNPJ do XML ou do nome do arquivo.</span>'}
    </div>
    <datalist id="dlCli">${S.clientes.filter((c) => c.ativo).map((c) => `<option value="${esc(rotCli(c))}"></option>`).join('')}</datalist>
    <div id="mFila"></div>`;
  const $a = (s) => alvo.querySelector(s);

  async function adicionar(arquivos) {
    arquivos = [...arquivos].filter((f) => !/^(\.|~\$|thumbs\.db$|desktop\.ini$)/i.test(f.name));
    if (!arquivos.length) return;
    $a('#mFila').innerHTML = `<div class="carregando">Lendo ${arquivos.length} arquivo(s)…</div>`;
    const novos = [];
    for (const f of arquivos) {
      const ext = f.name.split('.').pop().toLowerCase();
      const it = { id: crypto.randomUUID(), arq: f, cli: cliente, dep: null, tipo: 'outro', comp: S.comp, leitura: '', dados: null, nota: null, erro: '', estado: 'pronto' };
      try {
        if (f.size > LIMITE) { it.estado = 'erro'; it.erro = 'Arquivo maior que 50 MB'; }
        else if (ext === 'xml') {
          const x = lerXML(await f.text());
          if (!x) { it.tipo = 'outro'; it.leitura = 'XML não reconhecido como nota'; }
          else if (x.tipo === 'cancelamento' || x.tipo === 'evento') {
            it.tipo = 'evento'; it.dep = 'fiscal'; it.dados = x; it.evento = x; it.cli = it.cli || achaCli(x.cnpj);
            if (x.data) it.comp = x.data.slice(0, 7);
            it.leitura = x.tipo === 'cancelamento' ? `Cancelamento da nota nº ${+(x.chave || '').slice(25, 34) || '?'} · ${x.motivo}` : `${x.descricao} (só fica guardado)`;
          } else if (x.tipo === 'inutilizacao') {
            it.tipo = 'inutilizacao'; it.dep = 'fiscal'; it.dados = x; it.inut = x; it.cli = it.cli || achaCli(x.cnpj);
            if (x.data) it.comp = x.data.slice(0, 7);
            it.leitura = `Inutilização série ${x.serie}: números ${x.n_ini}${x.n_fin !== x.n_ini ? ' a ' + x.n_fin : ''}`;
          } else {
            it.tipo = x.modelo; it.dep = 'fiscal'; it.dados = x; it.xml = x;
            const em = achaCli(x.emit.cnpj), de = achaCli(x.dest.cnpj), tm = x.tomador ? achaCli(x.tomador) : null;
            if (!it.cli) it.cli = em || de || tm;
            if (x.data) it.comp = x.data.slice(0, 7);
            const l = linhaPainel(x, it.cli?.cnpj);
            it.leitura = `${x.tipo_documento} ${x.numero || ''} · ${brl(x.valor_nf)} · ${l.categoria} · ${l.destinatario || fmtCNPJ(l.doc_destinatario) || 'consumidor'}${x.cancelada ? ' · CANCELADA' : ''}`;
            it.chave = x.chave;
          }
        } else if (ext === 'ofx') {
          const o = lerOFX(await f.text()); it.tipo = 'extrato'; it.dep = 'contabil'; it.dados = o;
          if (o.fim) it.comp = o.fim.slice(0, 7);
          it.leitura = `Extrato${o.conta ? ' conta ' + o.conta : ''} · ${o.lancamentos} lançamentos${o.inicio ? ' · ' + o.inicio.split('-').reverse().join('/') + ' a ' + o.fim.split('-').reverse().join('/') : ''}`;
          const c = classificar(f.name); if (!it.cli && c.cnpj) it.cli = achaCli(c.cnpj);
        } else {
          const c = classificar(f.name); it.tipo = c.tipo; it.dep = DEP_DO_TIPO[c.tipo]; if (c.competencia) it.comp = c.competencia;
          if (!it.cli && c.cnpj) it.cli = achaCli(c.cnpj);
          it.leitura = c.tipo === 'outro' ? 'Tipo pelo nome do arquivo: não identificado' : 'Tipo pelo nome do arquivo';
        }
      } catch (er) { it.estado = 'erro'; it.erro = 'Não consegui ler: ' + er.message; }
      novos.push(it);
    }
    // notas já importadas antes
    const chaves = novos.filter((i) => i.chave).map((i) => i.chave);
    if (chaves.length) { try { const ja = await db.chavesExistentes(chaves); novos.forEach((i) => { if (i.chave && i.cli && ja.has(i.cli.id + '|' + i.chave)) { i.estado = 'pulado'; i.erro = 'Nota já importada antes'; } }); } catch (e) { /* segue */ } }
    // repetidas dentro do mesmo envio
    const vistas = new Set(fila.map((i) => i.chave).filter(Boolean));
    novos.forEach((i) => { const k = i.chave; if (!k) return; if (vistas.has(k) && i.estado === 'pronto') { i.estado = 'pulado'; i.erro = 'Repetida neste envio'; } vistas.add(k); });
    fila = fila.concat(novos); desenhar();
  }

  function desenhar() {
    if (!fila.length) { $a('#mFila').innerHTML = ''; return; }
    const prontos = fila.filter((i) => i.estado === 'pronto'), semCli = prontos.filter((i) => !i.cli), semDep = prontos.filter((i) => !i.dep);
    const enviados = fila.filter((i) => i.estado === 'ok').length;
    $a('#mFila').innerHTML = `<div class="card" style="margin-top:14px">
      <div class="card-h"><h2>Conferir antes de enviar · ${fila.length} arquivo(s)</h2>
       <div class="leg" style="font-size:12.5px">${enviados ? `<span class="pill p-ok">${enviados} enviados</span>` : ''}<span class="pill p-co">${prontos.length} prontos</span>${semCli.length ? `<span class="pill p-at">${semCli.length} sem cliente</span>` : ''}${fila.filter((i) => i.estado === 'pulado').length ? `<span class="pill p-na">${fila.filter((i) => i.estado === 'pulado').length} pulados</span>` : ''}${fila.filter((i) => i.estado === 'erro').length ? `<span class="pill p-bad">${fila.filter((i) => i.estado === 'erro').length} com erro</span>` : ''}</div></div>
      ${!cliente && semCli.length ? `<div class="banner at" style="margin:12px 18px 0"><span>${semCli.length} arquivo(s) sem cliente reconhecido. Escolha na coluna Cliente ou aplique um para todos:</span><input list="dlCli" id="mTodosCli" placeholder="Digite o nome do cliente" style="max-width:320px;margin-left:auto"><button class="btn sec mini" id="mAplicaCli">Aplicar aos sem cliente</button></div>` : ''}
      <div class="tw" style="max-height:480px;overflow:auto;margin-top:8px"><table class="t fila"><thead><tr><th>Arquivo</th>${cliente ? '' : '<th>Cliente</th>'}<th>Departamento</th><th>Tipo</th><th>Competência</th><th>O que foi lido</th><th></th></tr></thead><tbody>
      ${fila.map((i) => { const trava = i.estado !== 'pronto'; return `<tr data-i="${i.id}">
        <td><b style="font-weight:500;word-break:break-all">${esc(i.arq.name)}</b><div class="small muted">${tamanho(i.arq.size)}</div></td>
        ${cliente ? '' : `<td style="min-width:220px"><input list="dlCli" data-k="cli" value="${i.cli ? esc(rotCli(i.cli)) : ''}" placeholder="Escolher cliente" ${trava ? 'disabled' : ''} style="${!i.cli && !trava ? 'border-color:var(--at)' : ''}"></td>`}
        <td><select data-k="dep" ${trava ? 'disabled' : ''} style="${!i.dep && !trava ? 'border-color:var(--at)' : ''}"><option value="">Escolher…</option>${Object.entries(DEPS).map(([k, d]) => `<option value="${k}" ${i.dep === k ? 'selected' : ''}>${d.nome}</option>`).join('')}</select></td>
        <td><select data-k="tipo" ${trava || i.xml || i.evento || i.inut ? 'disabled' : ''}>${Object.entries(TIPOS_DOC).map(([k, t]) => `<option value="${k}" ${i.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input type="month" data-k="comp" value="${i.comp || ''}" ${trava ? 'disabled' : ''} style="width:150px"></td>
        <td class="small" style="min-width:200px">${esc(i.leitura)}${i.erro ? `<div class="${i.estado === 'ok' ? 'ok-l' : i.estado === 'pulado' ? 'muted' : 'er-l'}">${esc(i.erro)}</div>` : ''}${i.estado === 'ok' ? '<div class="ok-l">✓ Enviado</div>' : ''}${i.estado === 'enviando' ? '<div class="muted">Enviando…</div>' : ''}</td>
        <td>${i.estado === 'pronto' || i.estado === 'erro' || i.estado === 'pulado' ? `<button class="btn-x" data-tira="${i.id}" aria-label="Tirar da lista" title="Tirar da lista">×</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>
      <div style="padding:12px 18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="prog" style="flex:1;min-width:160px" hidden id="mProg"><span style="width:0"></span></div>
        <span class="small muted" id="mMsg">${semCli.length && !cliente ? 'Arquivos sem cliente vão para "Sem cliente" e podem ser ajustados depois.' : semDep.length ? 'Escolha o departamento dos arquivos em destaque.' : ''}</span>
        <div style="margin-left:auto;display:flex;gap:8px"><button class="btn sec" id="mLimpa">Limpar lista</button><button class="btn" id="mEnvia" ${prontos.length ? '' : 'disabled'}>Enviar ${prontos.length} arquivo(s)</button></div>
      </div></div>`;
  }

  const item = (el) => fila.find((i) => i.id === el.closest('[data-i]')?.dataset.i);
  alvo.addEventListener('change', (e) => {
    const k = e.target.dataset.k; if (!k) return; const i = item(e.target); if (!i) return;
    if (k === 'cli') { const c = porRot.get(e.target.value); i.cli = c || null; e.target.style.borderColor = c ? '' : 'var(--at)'; if (e.target.value && !c) aviso('Escolha um cliente da lista.', 'erro'); return; }
    if (k === 'dep') i.dep = e.target.value || null;
    if (k === 'tipo') { i.tipo = e.target.value; if (!i.dep && DEP_DO_TIPO[i.tipo]) { i.dep = DEP_DO_TIPO[i.tipo]; desenhar(); } }
    if (k === 'comp') i.comp = e.target.value || null;
  });
  alvo.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tira]'); if (t) { fila = fila.filter((i) => i.id !== t.dataset.tira); desenhar(); return; }
    if (e.target.id === 'mLimpa') { fila = []; desenhar(); return; }
    if (e.target.id === 'mAplicaCli') { const c = porRot.get($a('#mTodosCli').value); if (!c) return aviso('Escolha um cliente da lista.', 'erro'); fila.forEach((i) => { if (i.estado === 'pronto' && !i.cli) i.cli = c; }); desenhar(); return; }
    if (e.target.id === 'mEnvia') enviar();
  });

  async function enviar() {
    const L = fila.filter((i) => i.estado === 'pronto');
    const semDep = L.filter((i) => !i.dep); if (semDep.length) { aviso(`Escolha o departamento de ${semDep.length} arquivo(s).`, 'erro'); return; }
    $a('#mEnvia').disabled = true; $a('#mLimpa').disabled = true; const prog = $a('#mProg'); prog.hidden = false;
    let feitos = 0, ok = 0, notas = 0;
    const umPorVez = async (i) => {
      i.estado = 'enviando';
      try {
        const doc = await db.enviarDocumento(i.arq, { cliente_id: i.cli?.id || null, departamento: i.dep, competencia: i.comp || null, tipo: i.tipo, dados: i.dados });
        try {
          if (i.xml && i.cli) { await db.inserirNota({ ...linhaPainel(i.xml, i.cli.cnpj), cliente_id: i.cli.id, documento_id: doc.id, competencia: i.comp || i.xml.data?.slice(0, 7) }); notas++; }
          else if (i.xml) i.erro = 'Arquivo salvo sem cliente: a nota entra no Painel Fiscal quando você escolher o cliente (Editar).';
          if (i.evento?.tipo === 'cancelamento' && i.evento.chave) await db.inserirCancelamento({ chave: i.evento.chave, data: i.evento.data, motivo: i.evento.motivo, documento_id: doc.id });
          if (i.inut && i.cli) await db.inserirInutilizacao({ cliente_id: i.cli.id, modelo: i.inut.modelo, serie: i.inut.serie, n_ini: i.inut.n_ini, n_fin: i.inut.n_fin, data: i.inut.data, competencia: i.comp, motivo: i.inut.motivo, documento_id: doc.id });
        } catch (er) { i.erro = 'Arquivo salvo, mas não entrou no Painel Fiscal: ' + er.message; }
        i.estado = 'ok'; ok++;
      } catch (er) { i.estado = 'erro'; i.erro = er.message; }
      feitos++; prog.firstChild.style.width = (feitos / L.length * 100) + '%'; $a('#mMsg').textContent = `${feitos} de ${L.length}…`;
    };
    const fila2 = L.slice(); const trab = Array.from({ length: Math.min(4, fila2.length) }, async () => { while (fila2.length) await umPorVez(fila2.shift()); });
    await Promise.all(trab);
    await db.registrar('Importou documentos', `${ok} arquivo(s)${notas ? `, ${notas} nota(s)` : ''}`, cliente?.id);
    aviso(`${ok} de ${L.length} arquivo(s) enviados${notas ? ` · ${notas} nota(s) somadas ao Fiscal` : ''}.`, ok === L.length ? 'ok' : 'erro');
    desenhar(); aoTerminar && aoTerminar();
  }

  $a('#mArq').addEventListener('change', (e) => { adicionar(e.target.files); e.target.value = ''; });
  $a('#mPasta').addEventListener('change', (e) => { adicionar(e.target.files); e.target.value = ''; });
  const drop = $a('#mDrop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('on'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('on'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('on'); adicionar(e.dataTransfer.files); });
}

export { nomeComp };
