// Importação única: arraste qualquer arquivo; o sistema reconhece tudo e preenche sozinho.
import { esc, nomeComp, fmtCNPJ, aviso } from '../util.js';
import { S } from '../estado.js';
import { reconhecer, TIPOS } from '../reconhecer.js';
import { acharEmpresa, previa, aplicarTudo } from '../aplicar.js';

const DEPN = { fiscal: ['Fiscal', 'p-fiscal'], dp: ['Pessoal', 'p-dp'], contabil: ['Contábil', 'p-contabil'] };
const rotCli = (c) => `${c.nome_fantasia || c.razao_social}${c.cnpj ? ' — ' + fmtCNPJ(c.cnpj) : ''}`;

export function importador(alvo, { compacto = false, aoTerminar } = {}) {
  let itens = [];
  alvo.innerHTML = `<div class="drop" id="iDrop" style="${compacto ? 'padding:18px 12px' : 'padding:34px 18px'}">
      <b>Arraste aqui qualquer arquivo</b>
      <span class="small muted">Relatórios do Domínio (folha, holerites, líquidos, programação de férias), guias de FGTS, DARF, DAS e sindical, recibos da DCTFWeb, cartões de ponto, XML de notas, extratos OFX… O sistema descobre sozinho o que é, de qual empresa e de qual mês.</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px"><label class="btn">Escolher arquivos<input type="file" multiple hidden id="iArqs"></label><label class="btn sec">Escolher uma pasta<input type="file" webkitdirectory multiple hidden id="iPasta"></label></div>
    </div>
    <datalist id="dlEmp">${S.clientes.filter((c) => c.ativo).map((c) => `<option value="${esc(rotCli(c))}"></option>`).join('')}</datalist>
    <div id="iRes"></div>`;
  const $a = (s) => alvo.querySelector(s);

  async function adicionar(lista) {
    lista = [...lista].filter((f) => !/^(\.|~\$|thumbs\.db$|desktop\.ini$)/i.test(f.name) && f.size > 0);
    if (!lista.length) return;
    const res = $a('#iRes');
    for (let i = 0; i < lista.length; i++) {
      res.innerHTML = `<div class="card" style="margin-top:14px"><div class="card-b"><b>Lendo ${i + 1} de ${lista.length}…</b><div class="small muted">${esc(lista[i].name)}</div><div class="prog" style="margin-top:8px"><span style="width:${(i / lista.length) * 100}%"></span></div></div></div>`;
      const a = await reconhecer(lista[i]);
      Object.assign(a, acharEmpresa(a));
      if (a.chave && itens.some((x) => x.chave === a.chave)) a.pular = 'Repetido neste envio';
      itens.push(a);
    }
    cruzarEmpresas();
    desenhar();
  }

  // Cruza os arquivos do mesmo envio: guia com só a raiz do CNPJ, boleto com CNPJ do sindicato, relatório com dois CNPJs...
  // vão para a empresa (nova ou cadastrada) que aparece nos outros arquivos.
  function cruzarEmpresas() {
    const dig = (a) => (a.cnpjs || []).map((c) => String(c).replace(/\D/g, '')).filter(Boolean);
    const bate = (d, cnpj) => d === cnpj || (d.length === 8 && cnpj.startsWith(d));
    const novas = new Map(); itens.forEach((a) => { if (a.nova) novas.set(a.nova.cnpj, { ...(novas.get(a.nova.cnpj) || a.nova), n: (novas.get(a.nova.cnpj)?.n || 0) + 1, codigo: novas.get(a.nova.cnpj)?.codigo || a.nova.codigo }); });
    for (const a of itens) {
      if (a.cliente || a.tipo === 'nota') continue;
      const ds = dig(a);
      const cands = [...novas.values()].filter((n) => ds.some((d) => bate(d, n.cnpj))).sort((x, y) => y.n - x.n);
      if (cands.length) a.nova = cands[0];
    }
    // tira as "empresas novas" que ficaram sem arquivo
    const usadas = new Set(itens.filter((a) => a.nova && !a.cliente).map((a) => a.nova.cnpj));
    itens.forEach((a) => { if (a.nova && !usadas.has(a.nova.cnpj)) a.nova = null; });
    // envio de uma empresa só (ex.: a pasta do mês dela): o que não tem empresa no conteúdo vai para ela
    const emps = new Set(itens.map((a) => (a.cliente ? 'c' + a.cliente.id : a.nova ? 'n' + a.nova.cnpj : null)).filter(Boolean));
    if (emps.size === 1) { const ref = itens.find((a) => a.cliente || a.nova); itens.forEach((a) => { if (!a.cliente && !a.nova) { a.cliente = ref.cliente || null; a.nova = ref.nova || null; a.porEnvio = true; } }); }
  }

  function desenhar() {
    if (!itens.length) { $a('#iRes').innerHTML = ''; return; }
    // agrupa por empresa
    const grupos = new Map();
    for (const a of itens) {
      const k = a.cliente ? 'c:' + a.cliente.id : a.nova ? 'n:' + a.nova.cnpj : 'x';
      if (!grupos.has(k)) grupos.set(k, { k, cliente: a.cliente, nova: a.nova, itens: [] });
      grupos.get(k).itens.push(a);
    }
    const ord = [...grupos.values()].sort((a, b) => (a.k === 'x') - (b.k === 'x'));
    const reconhecidos = itens.filter((a) => a.tipo !== 'outro').length;
    $a('#iRes').innerHTML = `<div class="card" style="margin-top:14px">
      <div class="card-h"><div><h2>${itens.length} arquivo(s) lido(s)</h2><span class="small muted">${reconhecidos} reconhecido(s) pelo conteúdo · ${ord.filter((g) => g.k !== 'x').length} empresa(s)</span></div>
        <div class="barra-f"><button class="btn sec" id="iLimpa">Limpar</button><button class="btn" id="iOk">Confirmar e preencher</button></div></div>
      ${ord.map((g, gi) => `<div class="secao-t" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:16px">
          ${g.cliente ? `<span style="color:var(--ink);font-size:13px;text-transform:none;letter-spacing:0">${esc(g.cliente.nome_fantasia || g.cliente.razao_social)}</span><span class="pill p-ok">cadastrada</span>`
            : g.nova ? `<span style="color:var(--ink);font-size:13px;text-transform:none;letter-spacing:0">${esc(g.nova.razao_social)} · ${fmtCNPJ(g.nova.cnpj)}</span><span class="pill p-co">empresa nova: será cadastrada</span>`
            : `<span style="color:var(--ink);font-size:13px;text-transform:none;letter-spacing:0">Empresa não identificada</span><input list="dlEmp" data-grupo="${gi}" placeholder="Escolha a empresa" style="max-width:320px;min-height:32px;padding:4px 8px;text-transform:none;letter-spacing:0;font-weight:400">`}
        </div>
        <div class="check">${g.itens.map((a) => { const t = TIPOS[a.tipo] || TIPOS.outro; const dep = DEPN[a.departamento];
          return `<div class="check-it"><span class="st ${a.feito ? 'ok' : a.erro ? 'falta' : a.tipo === 'outro' ? 'op' : 'ok'}">${a.feito ? '✓' : a.erro ? '!' : a.tipo === 'outro' ? '?' : '✓'}</span>
            <div style="min-width:0"><b>${esc(t[0])}${a.competencia ? ' · ' + nomeComp(a.competencia, true) : ''}</b> ${dep ? `<span class="pill ${dep[1]}">${dep[0]}</span>` : ''}
            <small style="word-break:break-all">${esc(a.nome)}</small><small style="color:var(--ink-2)">${esc(a.erro || a.pular || (a.feito ? 'Feito: ' : 'Vai preencher: ') + previa(a))}</small></div></div>`; }).join('')}</div>`).join('')}
      <div style="padding:12px 18px" id="iProg"></div></div>`;
    $a('#iLimpa').onclick = () => { itens = []; desenhar(); };
    $a('#iOk').onclick = confirmar;
    alvo.querySelectorAll('[data-grupo]').forEach((inp) => inp.addEventListener('change', () => {
      const c = S.clientes.find((x) => rotCli(x) === inp.value); if (!c) return aviso('Escolha uma empresa da lista.', 'erro');
      ord[+inp.dataset.grupo].itens.forEach((a) => { a.cliente = c; }); desenhar();
    }));
  }

  async function confirmar() {
    const b = $a('#iOk'); b.disabled = true; $a('#iLimpa').disabled = true;
    const p = $a('#iProg');
    const conta = await aplicarTudo(itens.filter((a) => !a.feito), (k, tot, a) => { p.innerHTML = `<div class="small muted">Preenchendo ${k} de ${tot}: ${esc(a.nome)}</div><div class="prog" style="margin-top:6px"><span style="width:${(k / tot) * 100}%"></span></div>`; });
    desenhar();
    const partes = [[conta.empresas, 'empresa(s) cadastrada(s)'], [conta.colabNovos, 'colaborador(es) novo(s)'], [conta.colabAtual, 'colaborador(es) atualizado(s)'], [conta.periodos, 'período(s) de férias'], [conta.folhas, 'folha(s)'], [conta.guias, 'guia(s)'], [conta.ponto, 'cartão(ões) de ponto'], [conta.notas, 'nota(s)'], [conta.obrigacoes, 'obrigação(ões) concluída(s)'], [conta.arquivos, 'arquivo(s) guardado(s)']].filter(([v]) => v);
    $a('#iProg').innerHTML = `<div class="banner" style="margin-top:4px"><div><b>Pronto!</b> ${partes.map(([v, t]) => `${v} ${t}`).join(' · ') || 'Nada novo: tudo já estava no sistema.'}${conta.erros.length ? `<div class="small" style="color:var(--bad);margin-top:4px">${conta.erros.length} problema(s): ${esc(conta.erros.slice(0, 3).join(' | '))}</div>` : ''}</div></div>`;
    aviso('Importação concluída.');
    aoTerminar && aoTerminar(conta);
  }

  $a('#iArqs').addEventListener('change', (e) => { adicionar(e.target.files); e.target.value = ''; });
  $a('#iPasta').addEventListener('change', (e) => { adicionar(e.target.files); e.target.value = ''; });
  const drop = $a('#iDrop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('on'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('on'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault(); drop.classList.remove('on');
    // aceita pastas arrastadas também
    const its = [...(e.dataTransfer.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (its.some((x) => x.isDirectory)) { const fs = []; const ler = (en) => new Promise((ok) => { if (en.isFile) en.file((f) => { fs.push(f); ok(); }, ok); else { const r = en.createReader(); const tudo = []; const lote = () => r.readEntries(async (es) => { if (!es.length) { for (const x of tudo) await ler(x); ok(); } else { tudo.push(...es); lote(); } }, ok); lote(); } }); for (const en of its) await ler(en); adicionar(fs); }
    else adicionar(e.dataTransfer.files);
  });
}

// Tela "Importar arquivos" (vale para todos os departamentos)
export default async function telaImportar(el) {
  const { topo } = await import('../app.js');
  topo('Importar arquivos', 'Jogue tudo aqui: o sistema reconhece cada arquivo pelo conteúdo, acha a empresa pelo CNPJ e preenche colaboradores, férias, folha, guias, ponto e notas.');
  el.innerHTML = '<div class="card"><div class="card-b" id="imp"></div></div>';
  importador(el.querySelector('#imp'));
}
