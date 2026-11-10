// Painel de Férias original (telas). Marcações e documentos ficam no sistema (js/ferias/carregar.js).
(function () {
  const D = DADOS;
  const S = { emp: "todas", tab: "visao", pFiltro: "", pBusca: "", fBusca: "", ficha: null, modo: "prazo", todosAtencao: false };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = String(txt); return e; };
  const hoje = new Date().toLocaleDateString("sv-SE");
  const br = (s) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—");
  const brc = (s) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "—");
  const brAa = (s) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(2, 4) : "—");
  const isoDeBr = (b) => (b && b.length === 10 ? b.slice(6) + "-" + b.slice(3, 5) + "-" + b.slice(0, 2) : "");
  const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const emDias = (iso) => { const d = dias(hoje, iso); return d === 0 ? "hoje" : d === 1 ? "amanhã" : d > 0 ? "em " + d + " dias" : "há " + (-d) + " dias"; };
  const curto = (n) => { const p = n.split(" "); return p.length > 2 ? p[0] + " " + p[p.length - 1] : n; };
  const primeiro = (n) => n.split(" ")[0];
  const lista = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
  const pl = (n, um, varios) => (n === 1 ? um : varios);
  const daEmp = (r) => S.emp === "todas" || r.empresa === S.emp || r.empresa === "Todas";
  const empChip = (e) => el("span", "emp-chip " + (window.__FERIAS_EMPRESAS.indexOf(e) % 2 ? "e367" : "e366"), e);
  const pessoa = (nome, empresa, pid) => {
    const w = document.createDocumentFragment();
    const n = el(pid ? "button" : "b", pid ? "lk nm" : "nm", nome);
    if (pid) { n.type = "button"; n.dataset.pid = pid; }
    w.append(n); if (empresa && empresa !== "Todas") w.append(empChip(empresa));
    return w;
  };
  const td = (txt, cls, sub) => { const c = el("td", cls, txt); if (sub) c.append(el("span", "s", sub)); return c; };
  const PILL = { Urgente: "crit", Vencido: "crit", Programar: "warn", "No prazo": "late", Programado: "ok", Quitado: "gray", "Em formação": "gray",
    "Em andamento": "ok", Programada: "late", "Programada · dias a definir": "warn", "Concluída": "gray" };
  const pill = (t) => el("span", "pill " + (PILL[t] || "gray"), t);
  const R = () => D.resumo.find((r) => r.empresa === (S.emp === "todas" ? "Todas" : S.emp));
  const fer = (id) => D.ferias.find((f) => f.id === id) || {};

  $("#subtitulo").textContent = "Base: cadastro de funcionários e férias do sistema · prazos a partir de " + br(hoje);

  /* navegação */
  function abrir(tab) {
    S.tab = tab;
    $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
    try { history.replaceState(null, "", "#" + tab); } catch (e) {}
    if (tab === "ficha") ficha();
    if (tab === "calendario") calendario();
    if (tab === "datas") datas();
    if (tab === "documentos") documentos();
    window.scrollTo({ top: 0 });
  }
  $$(".tab-btn").forEach((b) => b.addEventListener("click", () => abrir(b.dataset.tab)));
  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pid]");
    if (p && !p.closest("#fLista") && !p.closest("#calGrid")) { S.ficha = p.dataset.pid; S.fBusca = ""; $("#fBusca").value = ""; abrir("ficha"); }
  });
  $("#filtroEmp").addEventListener("change", (e) => { S.emp = e.target.value; tudo(); });

  /* menu */
  function badges() {
    const r = R();
    const v = { altos: r.alertas_altos, sem_data: r.sem_data, prog: r.em_ferias + r.marcadas, novos90: r.completam_90, pend: r.pendencias };
    $$("[data-nb]").forEach((b) => { const n = v[b.dataset.nb]; b.textContent = n ? n : ""; });
  }

  const card = (cls, label, valor, sub) => { const c = el("div", cls); c.append(el("div", "label", label), el("div", "value", valor)); if (sub) c.append(el("div", "sub", sub)); return c; };

  /* visão geral */
  function visao() {
    const r = R();
    const fs = D.ferias_status.filter(daEmp);
    const andamento = fs.filter((f) => f.status === "Em andamento").sort((a, b) => a.fim_iso.localeCompare(b.fim_iso));
    const marcadas = fs.filter((f) => f.status.startsWith("Programada")).sort((a, b) => a.inicio_iso.localeCompare(b.inicio_iso));
    const avisos = marcadas.filter((f) => f.aviso_iso && f.aviso_iso >= hoje).sort((a, b) => a.aviso_iso.localeCompare(b.aviso_iso));
    const sobre = D.sobreposicoes.filter((s) => S.emp === "todas" || s.empresas.includes(S.emp));
    const pend = D.pendencias.filter(daEmp);
    const altas = pend.filter((p) => p.prioridade === "Alta").length;
    const semData = D.situacao.filter((s) => daEmp(s) && ["Vencido", "Urgente", "Programar", "No prazo"].includes(s.situacao)).sort((a, b) => a.limite_iso.localeCompare(b.limite_iso));
    const forma = D.formacao.filter((f) => daEmp(f) && f.dias_para_direito <= 90).sort((a, b) => a.dias_para_direito - b.dias_para_direito);

    const av = (nome, emp) => { const a = el("span", "av" + (window.__FERIAS_EMPRESAS.indexOf(emp) % 2 ? " e" : ""), nome.split(" ").filter(Boolean).map((x) => x[0]).filter((_, i, arr) => i === 0 || i === arr.length - 1).join("").toUpperCase()); a.title = nome; return a; };
    const tile = (cls, label, valor, sub, pessoas) => { const c = el("div", "kpi-t " + cls); c.append(el("div", "label", label), el("div", "value", valor)); if (sub) c.append(el("div", "sub", sub)); if (pessoas && pessoas.length) { const w = el("div", "avs"); pessoas.slice(0, 8).forEach((p) => w.append(av(p.funcionario, p.empresa))); c.append(w); } return c; };
    const grave = D.situacao.some((s) => daEmp(s) && ["Urgente", "Vencido"].includes(s.situacao));
    $("#vDest").replaceChildren(
      tile(grave ? "grave" : "amb", "Precisam ser marcadas", r.a_marcar, r.a_marcar ? "limite em até 8 meses, sem data" : "nada vencendo em 8 meses", semData.filter((s) => s.dias_ate_limite <= 240)),
      tile("verde", "De férias agora", r.em_ferias, andamento.length ? "volta " + lista(andamento.slice(0, 2).map((f) => primeiro(f.funcionario) + " " + brc(isoDeBr(f.retorno)))) : "ninguém fora hoje", andamento),
      tile("", "Saídas marcadas", r.marcadas, marcadas[0] ? "próxima: " + primeiro(marcadas[0].funcionario) + " em " + brc(marcadas[0].inicio_iso) : "nenhuma marcada", marcadas),
      tile("", "Passam a ter direito em 90 dias", r.completam_90, "completam o período aquisitivo", forma));
    const vchip = (n, txt, tab, cls) => { const b = el("button", "v-chip " + (cls || "")); b.type = "button"; b.append(el("b", null, n), document.createTextNode(txt), el("span", "seta", "›")); b.addEventListener("click", () => abrir(tab)); return b; };
    $("#vKpis").replaceChildren(
      vchip(r.sem_data, pl(r.sem_data, " período completo sem data", " períodos completos sem data"), "prazos"),
      vchip(avisos.length, pl(avisos.length, " aviso a entregar", " avisos a entregar") + (avisos[0] ? " · próximo até " + brc(avisos[0].aviso_iso) : ""), "datas"),
      vchip(r.pendencias, pl(r.pendencias, " pendência", " pendências") + (altas ? " · " + altas + pl(altas, " alta", " altas") : ""), "conferir", altas ? "alerta" : ""),
      vchip(sobre.length, pl(sobre.length, " férias cruzada no setor", " férias cruzadas no setor"), "programadas"),
      vchip(r.vencidos, r.vencidos ? pl(r.vencidos, " período em dobro", " períodos em dobro") : " período em dobro", "prazos", r.vencidos ? "alerta" : "ok"));


    /* linha do tempo: 6 meses a partir do mês atual */
    (() => {
      const tl = $("#vTl"); tl.replaceChildren();
      const d0 = new Date(hoje.slice(0, 7) + "-01T00:00:00Z"); const d1 = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + (S.tlMeses || 6) + 1, 1));
      const iso0 = d0.toISOString().slice(0, 10), iso1 = d1.toISOString().slice(0, 10);
      const span = (d1 - d0) / 864e5; const pct = (iso) => Math.max(0, Math.min(100, ((new Date(iso + "T00:00:00Z") - d0) / 864e5) / span * 100));
      const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      const months = el("div", "tl-months"); const nM = (S.tlMeses || 6) + 1; months.style.gridTemplateColumns = "repeat(" + nM + ", minmax(0, 1fr))";
      for (let i = 0; i < nM; i++) { const m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i, 1)); months.append(el("span", null, MES[m.getUTCMonth()] + (m.getUTCMonth() === 0 || i === 0 ? "/" + String(m.getUTCFullYear()).slice(2) : ""))); }
      const rows = [];
      fs.filter((f) => (f.fim_iso ? f.fim_iso >= iso0 : true) && f.inicio_iso && f.inicio_iso < iso1 && (f.status === "Em andamento" || f.status.startsWith("Programada"))).forEach((f) => {
        const fim = f.fim_iso || new Date(new Date(f.inicio_iso + "T00:00:00Z").getTime() + 29 * 864e5).toISOString().slice(0, 10);
        rows.push({ ord: f.inicio_iso, pid: f.pid, nome: f.funcionario, emp: f.empresa, bar: { a: f.inicio_iso, b: fim, cls: f.status === "Em andamento" ? "and" : (typeof f.dias === "number" ? "mar" : "ind"), txt: brc(f.inicio_iso) + " – " + brc(fim) + (typeof f.dias === "number" ? " · " + f.dias + "d" : " · dias a definir"), curto: typeof f.dias === "number" ? f.dias + "d" : "?", tip: (f.status === "Em andamento" ? "De férias até " : "Férias marcadas: ") + br(fim) + (typeof f.dias === "number" ? " (" + f.dias + " dias)" : " (dias a definir)") + " · volta " + f.retorno } });
      });
      semData.filter((s) => s.limite_iso < iso1).forEach((s) => rows.push({ ord: s.limite_iso, pid: s.pid, nome: s.funcionario, emp: s.empresa, mark: { at: s.limite_iso, cls: "lim" + (s.situacao === "No prazo" ? " ok" : ""), txt: "até " + brc(s.limite_iso), tip: "Último dia para começar " + s.saldo + " dias de férias sem pagar em dobro: " + s.limite } }));
      forma.filter((f) => isoDeBr(f.direito_em) < iso1).forEach((f) => rows.push({ ord: isoDeBr(f.direito_em), pid: f.pid, nome: f.funcionario, emp: f.empresa, mark: { at: isoDeBr(f.direito_em), cls: "dir", txt: brc(isoDeBr(f.direito_em)), tip: "Completa o período aquisitivo em " + f.direito_em + " e passa a ter direito a férias" } }));
      /* uma linha por pessoa: barra(s) e marcas juntas */
      const porPid = new Map();
      rows.forEach((r) => { const g = porPid.get(r.pid) || { ord: r.ord, pid: r.pid, nome: r.nome, emp: r.emp, bars: [], marks: [] }; if (r.ord < g.ord) g.ord = r.ord; if (r.bar) g.bars.push(r.bar); if (r.mark) g.marks.push(r.mark); porPid.set(r.pid, g); });
      rows.length = 0; porPid.forEach((g) => rows.push(g));
      rows.sort((a, b) => a.ord.localeCompare(b.ord) || a.nome.localeCompare(b.nome));
      const wrap = el("div", "tl-wrap"); wrap.style.setProperty("--n", nM); wrap.append(el("div"), months);
      rows.forEach((r) => {
        const nm = el("div", "tl-name"); const b = el("button", "lk", curto(r.nome)); b.type = "button"; b.dataset.pid = r.pid; b.title = r.nome; nm.append(av(r.nome, r.emp), b); wrap.append(nm);
        const row = el("div", "tl-row"); row.style.setProperty("--n", nM);
        r.bars.forEach((bb) => { const l = pct(bb.a), w = Math.max(1.2, pct(new Date(new Date(bb.b + "T00:00:00Z").getTime() + 864e5).toISOString().slice(0, 10)) - l); const bar = el("div", "tl-bar " + bb.cls, w < 11 ? bb.curto : bb.txt); bar.style.left = l + "%"; bar.style.width = w + "%"; bar.title = bb.tip; row.append(bar); });
        r.marks.forEach((mm) => { const mk = el("div", "tl-mark " + mm.cls); mk.style.left = pct(mm.at) + "%"; mk.title = mm.tip; mk.append(el("b", null, mm.txt)); row.append(mk); });
        wrap.append(row);
      });
      if (hoje >= iso0 && hoje < iso1) { const t = el("div", "tl-today"); t.style.left = "calc(168px + (100% - 168px) * " + (pct(hoje) / 100) + ")"; wrap.append(t); }
      tl.append(wrap);
      if (!rows.length) tl.append(el("p", "vazio", "Nada marcado nem vencendo nos próximos 6 meses."));
    })();
    /* próximas saídas */
    (() => { const px = $("#vProx"); px.replaceChildren();
      const lst = marcadas.filter((f) => f.inicio_iso >= hoje).slice(0, 4);
      lst.forEach((f) => { const c = el("div", "px"); c.append(av(f.funcionario, f.empresa));
        const mid = el("div"); const nm = el("div", "nm"); const b = el("button", "lk", curto(f.funcionario)); b.type = "button"; b.dataset.pid = f.pid; nm.append(b); mid.append(nm, el("div", "dt", brc(f.inicio_iso) + " → " + (f.fim_iso ? brc(f.fim_iso) : "?") + " · volta " + (f.retorno && f.retorno !== "—" ? brc(isoDeBr(f.retorno)) : "a definir") + " · " + f.setor)); c.append(mid);
        const em = el("div", "em"); em.append(el("b", null, typeof f.dias === "number" ? f.dias + " dias" : "a definir"));
        if (f.aviso_iso) { const ok = f.aviso_iso < hoje; const pa = el("span", "pill-av" + (ok ? " ok" : ""), (ok ? "aviso entregue" : "aviso até " + brc(f.aviso_iso))); em.append(pa); } else em.append(el("span", null, emDias(f.inicio_iso)));
        c.append(em); px.append(c); });
      if (!lst.length) px.append(el("p", "txt muted", "Nenhuma saída marcada."));
    })();
    /* resumo em palavras */
    const ps = [];
    const P = (html) => { const p = el("p", "txt"); html.forEach((x) => p.append(typeof x === "string" ? document.createTextNode(x) : x)); ps.push(p); };
    const B = (t) => el("b", null, t);
    if (andamento.length) P(["Hoje ", B(andamento.length + pl(andamento.length, " pessoa está", " pessoas estão")), " de férias: ", lista(andamento.map((f) => primeiro(f.funcionario) + " (volta " + brc(isoDeBr(f.retorno)) + ")")), "."]);
    else P(["Hoje ninguém está de férias."]);
    if (marcadas.length) {
      P([B(marcadas.length + pl(marcadas.length, " saída marcada", " saídas marcadas")), ": ", lista(marcadas.map((f) => primeiro(f.funcionario) + " em " + brc(f.inicio_iso) + (typeof f.dias === "number" ? " (" + f.dias + " dias)" : " (dias a definir)"))), ".",
        avisos[0] ? " O primeiro aviso a entregar é o " + (avisos[0].funcionario.startsWith("A") ? "da " : "do ") + primeiro(avisos[0].funcionario) + ", até " + br(avisos[0].aviso_iso) + "." : ""]);
    }
    if (semData.length) {
      const top = semData.slice(0, 2);
      P([B(semData.length + pl(semData.length, " período completo", " períodos completos")), pl(semData.length, " ainda está", " ainda estão"), " sem data. ",
        pl(top.length, "O mais apertado é ", "Os mais apertados são "), lista(top.map((s) => primeiro(s.funcionario) + " (começar até " + s.limite + ")")), ". ",
        r.vencidos ? "Atenção: já há período que passou do limite." : "Nenhum período passou do limite, então não há férias em dobro hoje."]);
    } else P(["Nenhum período completo está sem data."]);
    if (forma.length) P([B(forma.length + pl(forma.length, " pessoa completa", " pessoas completam")), " o período nos próximos 90 dias e passam a ter direito: ", lista(forma.map((f) => primeiro(f.funcionario) + " (" + brc(isoDeBr(f.direito_em)) + ")")), "."]);
    if (sobre.length) P(["No mesmo setor, ", lista(sobre.map((s) => s.pessoas.split(" e ").map(primeiro).join(" e ") + " ficam fora juntos de " + s.de.slice(0, 5) + " a " + s.ate.slice(0, 5))), "."]);
    if (pend.length) P(["Há ", B(pend.length + pl(pend.length, " ponto", " pontos")), " para conferir", altas ? ", " + altas + pl(altas, " de prioridade alta", " de prioridade alta") : "", ". A lista está em Pendências."]);
    $("#vResumo").replaceChildren(...ps);

    /* atenção */
    const al = D.alertas.filter(daEmp);
    const box = $("#vAtencao"); box.replaceChildren();
    (S.todosAtencao ? al : al.slice(0, 5)).forEach((a) => {
      const n = el("div", "nov " + ({ 1: "crit", 2: "warn", 3: "", 4: "ok" }[a.nivel] || ""));
      const t = el(a.pid ? "button" : "b", a.pid ? "lk" : null, a.titulo); if (a.pid) { t.type = "button"; t.dataset.pid = a.pid; t.style.fontSize = "12.5px"; }
      if (a.pid && a.nivel === 1) t.style.color = "#991b1b"; else if (a.pid && a.nivel === 2) t.style.color = "#92400e"; else if (a.pid && a.nivel === 4) t.style.color = "#166534";
      n.title = a.detalhe; n.append(t, el("span", null, a.detalhe), el("span", "qd", a.quando.charAt(0).toUpperCase() + a.quando.slice(1)));
      box.append(n);
    });
    if (!al.length) box.append(el("p", "txt muted", "Nada pendente para esta empresa."));
    const mais = $("#vMais"); mais.hidden = al.length <= 5; mais.textContent = S.todosAtencao ? "Mostrar menos" : "Ver todos (" + al.length + ")";

  }
  $("#vMais").addEventListener("click", () => { S.todosAtencao = !S.todosAtencao; visao(); });
  $("#vTlMeses").addEventListener("click", (e) => { const b = e.target.closest("button[data-m]"); if (!b) return; S.tlMeses = +b.dataset.m; $$("#vTlMeses button").forEach((x) => x.classList.toggle("on", x === b)); visao(); });

  /* prazos */
  const ORD = { Vencido: 0, Urgente: 1, Programar: 2, "No prazo": 3, Programado: 4 };
  $("#pBusca").addEventListener("input", (e) => { S.pBusca = e.target.value.trim().toLowerCase(); prazos(); });
  function prazos() {
    const base = D.situacao.filter((s) => s.completo && s.situacao !== "Quitado" && daEmp(s));
    const ch = $("#pChips"); ch.replaceChildren();
    [["", "Todos"], ...Object.keys(ORD).filter((k) => base.some((s) => s.situacao === k)).map((k) => [k, k])].forEach(([v, lbl]) => {
      const b = el("button", "chip" + (S.pFiltro === v ? " on" : ""), lbl + " "); b.type = "button";
      b.append(el("span", "cnt", v ? base.filter((s) => s.situacao === v).length : base.length));
      b.addEventListener("click", () => { S.pFiltro = v; prazos(); }); ch.append(b);
    });
    if (S.pFiltro && !base.some((s) => s.situacao === S.pFiltro)) S.pFiltro = "";
    const tb = $("#pTab tbody"); tb.replaceChildren();
    base.filter((s) => (!S.pFiltro || s.situacao === S.pFiltro) && (!S.pBusca || (s.funcionario + " " + s.setor).toLowerCase().includes(S.pBusca)))
      .sort((a, b) => (ORD[a.situacao] - ORD[b.situacao]) || a.limite_iso.localeCompare(b.limite_iso)).forEach((s) => {
        const tr = el("tr", "clk"); tr.dataset.pid = s.pid;
        const c1 = el("td"); c1.append(pessoa(s.funcionario, s.empresa));
        const pr = D.periodos.find((p) => p.id === s.id);
        c1.append(el("span", "pz-aq", (s.setor || "—") + " · período " + brAa(pr.inicio_aquisitivo) + " a " + brAa(pr.fim_aquisitivo)));
        const sit = el("td"); sit.append(pill(s.situacao));
        tr.append(c1, td(s.saldo + " dias", "num"),
          td(s.limite, "nw strong", emDias(s.limite_iso) + " · " + s.prazo.replace("≈ ", "≈")), sit, td(s.programacao || "Sem data marcada", "obsx" + (s.programacao ? "" : " muted")));
        tb.append(tr);
      });
    if (!tb.childElementCount) { const tr = el("tr"); const c = td("Ninguém com período completo e saída a marcar nesta seleção.", "muted"); c.colSpan = 5; tr.append(c); tb.append(tr); }
  }

  /* programadas: quadro */
  S.pr = { pid: "", modo: "quadro" };
  function programadas() {
    const fs = D.ferias_status.filter(daEmp);
    const and = fs.filter((f) => f.status === "Em andamento"), mar = fs.filter((f) => f.status.startsWith("Programada"));
    const av = mar.filter((f) => f.dias_para_aviso !== null && f.dias_para_aviso >= 0 && f.dias_para_aviso <= 45);
    $("#gDest").replaceChildren(
      card("destaque-card", "Em férias agora", and.length, and.length ? lista(and.map((f) => primeiro(f.funcionario))) : "ninguém fora hoje"),
      card("destaque-card", "Saídas marcadas", mar.length, mar.length ? lista(mar.map((f) => primeiro(f.funcionario))) : "nenhuma marcada"),
      card("destaque-card", "Avisos nos próximos 45 dias", av.length, av.length ? lista(av.map((f) => primeiro(f.funcionario) + " até " + brc(f.aviso_iso))) : "nenhum aviso próximo"));
    seletorPessoas($("#prPessoa"), S.pr);
    $$("#prModo .chip").forEach((c) => c.classList.toggle("on", c.dataset.m === S.pr.modo));
    $("#gQuadro").hidden = S.pr.modo !== "quadro"; $("#gTabela").hidden = S.pr.modo !== "tabela";
    quadro(fs); tabelaProg(fs);
  }
  function quadro(fsTodos) {
    const fs = fsTodos.filter((f) => !S.pr.pid || f.pid === S.pr.pid);
    const semData = D.situacao.filter((s) => daEmp(s) && (!S.pr.pid || s.pid === S.pr.pid) && ["Vencido", "Urgente", "Programar", "No prazo"].includes(s.situacao)).sort((a, b) => a.limite_iso.localeCompare(b.limite_iso));
    const info = $("#prPessoaInfo"); info.replaceChildren(); info.hidden = !S.pr.pid;
    if (S.pr.pid) {
      const p = func(S.pr.pid), per = D.situacao.filter((s) => s.pid === p.pid).sort((a, b) => a.id.localeCompare(b.id));
      const fact = (k, v, s) => { const d = el("div"); d.append(el("dt", null, k)); const dd = el("dd", null, v); if (s) dd.append(el("span", "s", s)); d.append(dd); return d; };
      const dl = el("dl", "fi-facts cal-facts");
      dl.append(fact("Colaborador", p.funcionario, (p.setor || "—") + " · " + p.empresa), fact("Admissão", br(p.admissao), p.cargo || ""));
      per.forEach((s) => dl.append(fact("Período " + s.periodo, s.completo ? (s.saldo > 0 ? s.saldo + " dias a tirar" : "quitado") : String(s.direito).replace(".", ",") + " dias acumulados", s.completo ? "começar até " + s.limite + " · " + s.situacao.toLowerCase() : "direito em " + s.direito_em)));
      const vc = el("button", "cal-btn", "Ver calendário ›"); vc.type = "button"; vc.addEventListener("click", () => window.FXcal(p.pid));
      const mk = el("button", "cal-btn cal-btn-azul", "+ Marcar férias"); mk.type = "button"; mk.addEventListener("click", () => abrirMarcacao({ pid: p.pid }));
      const acts = el("div", "dat-tools"); acts.append(mk, vc);
      info.append(dl, acts);
    }
    const linha = (k, v, cls) => { const r = el("div", "cp-row" + (cls ? " " + cls : "")); r.append(el("span", "cp-k", k), el("span", "cp-v", v)); return r; };
    const cartao = (f) => {
      const c = el("div", "cp " + ({ "Em andamento": "cp-and", Programada: "cp-prog", "Programada · dias a definir": "cp-def", "Concluída": "cp-done" }[f.status] || ""));
      const h = el("div", "cp-head"); const nm = el("button", "lk", f.funcionario); nm.type = "button"; nm.dataset.pid = f.pid; h.append(nm, empChip(f.empresa)); c.append(h);
      c.append(el("div", "cp-sub", f.setor + (f.manual ? " · marcado no painel" : "")));
      const ret = isoDeBr(f.retorno);
      c.append(linha("Saída", f.inicio + (f.status.startsWith("Programada") ? " · " + emDias(f.inicio_iso) : "")));
      c.append(linha("Retorno", f.retorno + (ret && f.status === "Em andamento" ? " · " + emDias(ret) : "")));
      c.append(linha("Dias", (typeof f.dias === "number" ? f.dias + " dias" : "a definir") + (f.abono ? " · " + f.abono + " vendidos" : "")));
      if (f.status.startsWith("Programada")) {
        const d = f.dias_para_aviso;
        c.append(linha("Aviso até", f.aviso + (d !== null && d >= 0 ? " · " + emDias(f.aviso_iso) : d !== null && d < 0 ? " · prazo passou" : ""), d !== null && d >= 0 && d <= 14 ? "cp-red" : d !== null && d >= 0 && d <= 45 ? "cp-amb" : ""));
        c.append(linha("Pagar até", f.pagamento));
      }
      if (f.observacao) c.append(el("div", "cp-obs", f.observacao));
      const acts = el("div", "cp-acts");
      const vc = el("button", "cal-btn", "Calendário"); vc.type = "button"; vc.addEventListener("click", () => window.FXcal(f.pid)); acts.append(vc);
      acts.append(btnAlterar(f), btnLimpar(f.id, "Limpar"));
      c.append(acts); return c;
    };
    const cartaoSemData = (s) => {
      const c = el("div", "cp " + (s.situacao === "No prazo" ? "cp-ok" : "cp-warn"));
      const h = el("div", "cp-head"); const nm = el("button", "lk", s.funcionario); nm.type = "button"; nm.dataset.pid = s.pid; h.append(nm, empChip(s.empresa)); c.append(h);
      c.append(el("div", "cp-sub", s.setor));
      c.append(linha("Saldo", s.saldo + " dias do período " + s.periodo));
      c.append(linha("Começar até", s.limite + " · " + s.prazo, s.situacao === "No prazo" ? "" : s.situacao === "Programar" ? "cp-amb" : "cp-red"));
      const st = el("div", "cp-row"); st.append(el("span", "cp-k", "Situação"), pill(s.situacao)); c.append(st);
      const acts = el("div", "cp-acts");
      const mk = el("button", "cal-btn cal-btn-azul", "Marcar férias"); mk.type = "button"; mk.addEventListener("click", () => abrirMarcacao({ pid: s.pid })); acts.append(mk);
      const vc = el("button", "cal-btn", "Calendário"); vc.type = "button"; vc.addEventListener("click", () => window.FXcal(s.pid)); acts.append(vc);
      c.append(acts); return c;
    };
    const cols = [
      ["Em férias agora", fs.filter((f) => f.status === "Em andamento").sort((a, b) => a.fim_iso.localeCompare(b.fim_iso)).map(cartao), "ninguém fora hoje"],
      ["Saída marcada", fs.filter((f) => f.status.startsWith("Programada")).sort((a, b) => a.inicio_iso.localeCompare(b.inicio_iso)).map(cartao), "nenhuma saída marcada"],
      ["Precisam de data", semData.map(cartaoSemData), "ninguém com período completo sem data"],
      ["Concluídas", fs.filter((f) => f.status === "Concluída").sort((a, b) => b.inicio_iso.localeCompare(a.inicio_iso)).map(cartao), "nenhuma neste ano"],
    ];
    const box = $("#gQuadro"); box.replaceChildren();
    cols.forEach(([tit, cards, vazio]) => {
      const col = el("div", "col"); const h = el("div", "col-h"); h.append(el("span", null, tit), el("span", "nb", cards.length)); col.append(h);
      if (cards.length) cards.forEach((c) => col.append(c)); else col.append(el("p", "col-vazio", vazio));
      box.append(col);
    });
  }
  function tabelaProg(fsTodos) {
    const fs = fsTodos.filter((f) => !S.pr.pid || f.pid === S.pr.pid);
    const ordem = (s) => (s === "Em andamento" ? 0 : s.startsWith("Programada") ? 1 : 2);
    const tb = $("#gTab tbody"); tb.replaceChildren();
    fs.slice().sort((a, b) => ordem(a.status) - ordem(b.status) || (ordem(a.status) === 2 ? b.inicio_iso.localeCompare(a.inicio_iso) : a.inicio_iso.localeCompare(b.inicio_iso))).forEach((f) => {
      const tr = el("tr", "clk" + (f.status === "Concluída" ? " done" : "")); tr.dataset.pid = f.pid;
      const c1 = el("td"); c1.append(pessoa(f.funcionario, f.empresa)); c1.append(el("span", "s", f.setor));
      const st = el("td"); st.append(pill(f.status));
      const d = f.dias_para_aviso;
      const avc = d !== null && d >= 0 && d <= 14 ? "nw bad-t" : d !== null && d >= 0 && d <= 45 ? "nw warn-t" : "nw";
      const ret = isoDeBr(f.retorno);
      tr.append(c1, st, td(f.inicio, "nw", f.status.startsWith("Programada") ? emDias(f.inicio_iso) : ""),
        td(f.retorno, "nw", ret && f.status === "Em andamento" ? emDias(ret) : ""), td(f.dias, "num"), td(f.abono || "—", "num" + (f.abono ? "" : " muted")),
        td(f.aviso, avc, f.aviso_iso && d >= 0 ? emDias(f.aviso_iso) : ""), td(f.pagamento, "nw"), td((f.manual ? "Marcado no painel. " : "") + f.observacao, "obsx"));
      tb.append(tr);
    });
    if (!tb.childElementCount) { const tr = el("tr"); const c = td("Nenhuma férias marcada nesta seleção.", "muted"); c.colSpan = 9; tr.append(c); tb.append(tr); }
  }
  $("#prPessoa").addEventListener("change", (e) => { S.pr.pid = e.target.value; programadas(); });
  $("#prModo").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b) { S.pr.modo = b.dataset.m; programadas(); } });

  /* conferir */
  function conferir() {
    const peso = { Alta: 1, "Média": 2, Baixa: 3 };
    const box = $("#cLista"); box.replaceChildren();
    D.pendencias.filter(daEmp).sort((a, b) => peso[a.prioridade] - peso[b.prioridade] || a.id.localeCompare(b.id)).forEach((p, i) => {
      const it = el("div", "rank-item " + (p.prioridade === "Alta" ? "sev-alta" : p.prioridade === "Média" ? "sev-media" : ""));
      const mn = el("div", "rank-main");
      mn.append(el("div", "rank-title", p.assunto), el("div", "rank-sub", p.detalhe));
      const meta = el("div", "rank-meta");
      const pids = (p.pids || "").split(",").filter(Boolean);
      pids.forEach((pid, k) => { const f = D.funcionarios.find((x) => x.pid === pid); if (!f) return; if (k) meta.append(document.createTextNode(" · ")); const b = el("button", "lk", f.funcionario); b.type = "button"; b.dataset.pid = pid; b.style.fontSize = "11px"; meta.append(b); });
      meta.append(document.createTextNode((pids.length ? " · " : "") + "conferir com: " + p.com_quem));
      mn.append(meta);
      const side = el("div", "rank-side");
      if (p.empresa === "Todas") { window.__FERIAS_EMPRESAS.slice(0, 3).forEach((e) => side.append(empChip(e))); } else side.append(empChip(p.empresa));
      side.append(el("span", "rank-tag " + (p.prioridade === "Alta" ? "alta" : p.prioridade === "Média" ? "media" : "baixa"), p.prioridade));
      it.append(el("div", "rank-num", i + 1), mn, side);
      box.append(it);
    });
    if (!box.childElementCount) box.append(el("p", "txt muted", "Nada para conferir nesta empresa."));
  }

  /* ficha */
  $("#fBusca").addEventListener("input", (e) => { S.fBusca = e.target.value.trim().toLowerCase(); ficha(); });
  $("#fLista").addEventListener("click", (e) => { const b = e.target.closest("button[data-pid]"); if (b) { S.ficha = b.dataset.pid; ficha(); } });
  function tabela(cab, linhas) {
    const t = el("table"), th = el("thead"), tr = el("tr");
    cab.forEach((c) => tr.append(el("th", c.endsWith("#") ? "num" : null, c.replace("#", "")))); th.append(tr); t.append(th);
    const tb = el("tbody"); linhas.forEach((l) => tb.append(l)); t.append(tb);
    const w = el("div", "tw"); w.append(t); return w;
  }
  function ficha() {
    const pes = D.funcionarios.filter(daEmp).slice().sort((a, b) => a.funcionario.localeCompare(b.funcionario, "pt"));
    const vis = pes.filter((p) => !S.fBusca || (p.funcionario + " " + p.setor).toLowerCase().includes(S.fBusca));
    if (!S.ficha || !pes.some((p) => p.pid === S.ficha)) S.ficha = (vis[0] || pes[0] || {}).pid;
    const ls = $("#fLista"); ls.replaceChildren();
    vis.forEach((p) => {
      const b = el("button", p.pid === S.ficha ? "on" : null); b.type = "button"; b.dataset.pid = p.pid; b.setAttribute("role", "option"); b.setAttribute("aria-selected", p.pid === S.ficha);
      b.append(el("span", "nm", p.funcionario), el("span", "s", (p.setor || "—") + " · " + p.empresa)); ls.append(b);
    });
    const c = $("#fFicha"); c.replaceChildren();
    const p = pes.find((x) => x.pid === S.ficha);
    if (!p) { c.append(el("p", "txt muted", "Nenhum colaborador nesta seleção.")); return; }
    const hd = el("div", "fi-head"); hd.append(el("div", "panel-title", p.funcionario), empChip(p.empresa));
    const vc = el("button", "cal-btn", "Ver calendário individual ›"); vc.type = "button"; vc.addEventListener("click", () => window.FXcal(p.pid)); vc.style.marginLeft = "auto";
    const vd = el("button", "cal-btn", "Documentos ›"); vd.type = "button"; vd.addEventListener("click", () => window.FXdoc(p.pid)); hd.append(vc, vd); c.append(hd);
    const fa = el("dl", "fi-facts");
    [["Admissão", br(p.admissao)], ["Setor", p.setor || "—"], ["Cargo", p.cargo || "—"], ["Código na contabilidade", p.codigo || "ainda sem código"]].forEach(([k, v]) => { const d = el("div"); d.append(el("dt", null, k), el("dd", null, v)); fa.append(d); });
    c.append(fa);
    const notas = el("div", "novs");
    D.pendencias.filter((x) => (x.pids || "").split(",").includes(p.pid)).forEach((x) => { const n = el("div", "nov " + (x.prioridade === "Alta" ? "crit" : "warn")); n.append(el("b", null, x.assunto), el("span", null, x.detalhe)); notas.append(n); });
    if (p.no_ponto === "nao") { const n = el("div", "nov warn"); n.append(el("b", null, "Sem cartão de ponto em outubro"), el("span", null, "Confirmar se segue na empresa.")); notas.append(n); }
    if (notas.childElementCount) c.append(notas);

    c.append(el("div", "fi-sec", "Períodos de férias"));
    const per = D.situacao.filter((s) => s.pid === p.pid).sort((a, b) => a.id.localeCompare(b.id));
    c.append(tabela(["Período", "Aquisitivo", "Direito#", "Saldo#", "Começar até", "Situação", "Programação"], per.map((s) => {
      const tr = el("tr"); const st = el("td"); st.append(pill(s.situacao));
      tr.append(td(s.periodo, "nw"), td(s.inicio_aquisitivo + " a " + s.fim_aquisitivo, "nw"), td(s.completo ? s.direito + " dias" : String(s.direito).replace(".", ",") + " acumulados", "num"),
        td(s.completo ? s.saldo + " dias" : "—", "num"), td(s.limite, "nw" + (s.completo ? " strong" : ""), s.completo ? emDias(s.limite_iso) : "se completar o período"), st, td(s.programacao || (s.completo ? "Sem data" : "—"), "obsx muted"));
      return tr;
    })));

    c.append(el("div", "fi-sec", "Férias registradas"));
    const fe = D.ferias_status.filter((f) => f.pid === p.pid);
    if (fe.length) c.append(tabela(["Saída", "Retorno", "Dias#", "Vendidos#", "Situação", "Observação"], fe.map((f) => {
      const tr = el("tr"); const st = el("td"); st.append(pill(f.status));
      tr.append(td(f.inicio, "nw"), td(f.retorno, "nw"), td(f.dias, "num"), td(f.abono || "—", "num"), st, td(f.observacao, "obsx")); return tr;
    })));
    else c.append(el("p", "txt muted", "Nenhuma férias marcada ou em andamento."));

    c.append(el("div", "fi-sec", "Faltas sem justificativa"));
    const fl = D.faltas_periodo.filter((f) => f.pid === p.pid);
    c.append(el("p", "txt" + (fl.length ? "" : " muted"), fl.length ? fl.map((f) => "Período " + f.periodo + ": " + f.faltas + pl(f.faltas, " falta", " faltas") + " (" + f.fontes + ")" + (f.dias_ferias === 30 ? ". Não reduz as férias: continuam 30 dias." : ". Férias reduzidas para " + f.dias_ferias + " dias.")).join(" ") : "Nenhuma falta registrada nos períodos."));
  }

  /* calendário */
  const FERIADOS = window.__FERIAS_FERIADOS;
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  S.cal = { y: +hoje.slice(0, 4), m: +hoje.slice(5, 7) - 1, pid: "" };
  const isoYMD = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  const func = (pid) => D.funcionarios.find((x) => x.pid === pid) || {};
  const nomeDe = (pid) => func(pid).funcionario || "";
  const daPessoaDe = (pid) => (r) => daEmp(r) && (!pid || r.pid === pid);
  const daPessoa = (r) => daPessoaDe(S.cal.pid)(r);
  function eventosCal(pid = S.cal.pid) {
    const daP = daPessoaDe(pid);
    const ev = [];
    let mkAtual = "";
    const push = (iso, tipo, cls, pid, texto, sev) => { if (iso) ev.push({ iso, tipo, cls, pid, nome: nomeDe(pid), texto, sev: sev || "", mk: mkAtual }); };
    D.ferias_status.filter(daP).forEach((f) => {
      mkAtual = f.id;
      if (f.status.startsWith("Programada")) {
        push(f.inicio_iso, "Saída", "saida", f.pid, typeof f.dias === "number" ? "sai de férias por " + f.dias + " dias, volta " + brc(isoDeBr(f.retorno)) : "sai de férias, dias ainda a definir");
        const da = f.dias_para_aviso;
        push(f.aviso_iso, "Aviso", "aviso", f.pid, "entregar o aviso de férias (sai em " + brc(f.inicio_iso) + ")", da !== null && da >= 0 && da <= 14 ? "sev-alta" : "sev-media");
        push(f.pagamento_iso, "Pagamento", "pag", f.pid, "pagar férias + 1/3 (sai em " + brc(f.inicio_iso) + ")", "sev-media");
      }
      if (f.retorno && f.retorno !== "a definir" && f.status !== "Concluída") push(isoDeBr(f.retorno), "Retorno", "ret", f.pid, "volta das férias", "sev-ok");
    });
    mkAtual = "";
    D.situacao.filter((s) => daP(s) && ["Vencido", "Urgente", "Programar", "No prazo"].includes(s.situacao))
      .forEach((s) => push(s.limite_iso, "Limite", "lim", s.pid, "último dia para começar " + s.saldo + " dias de férias sem pagar em dobro", s.situacao === "No prazo" ? "" : "sev-alta"));
    D.formacao.filter(daP).forEach((f) => push(isoDeBr(f.direito_em), "Direito", "dir", f.pid, "completa o período e passa a ter direito a férias (" + String(f.acumulado).replace(".", ",") + " dias acumulados até 02/10)"));
    return ev.sort((a, b) => a.iso.localeCompare(b.iso) || a.tipo.localeCompare(b.tipo));
  }
  const feriasNoDia = (iso) => D.ferias_status.filter((f) => daPessoa(f) && f.fim_iso && f.inicio_iso <= iso && iso <= f.fim_iso);

  function seletorPessoas(sel, obj) {
    sel = sel || $("#calPessoa"); obj = obj || S.cal;
    const pes = D.funcionarios.filter(daEmp).slice().sort((a, b) => a.funcionario.localeCompare(b.funcionario, "pt"));
    if (obj.pid && !pes.some((p) => p.pid === obj.pid)) obj.pid = "";
    sel.replaceChildren(new Option("Todos os colaboradores", ""), ...pes.map((p) => new Option(p.funcionario + (S.emp === "todas" ? " · " + p.empresa : ""), p.pid)));
    sel.value = obj.pid;
  }
  function faixaPessoa() {
    const box = $("#calPessoaInfo"); box.replaceChildren(); box.hidden = !S.cal.pid;
    if (!S.cal.pid) return;
    const p = func(S.cal.pid);
    const per = D.situacao.filter((s) => s.pid === p.pid).sort((a, b) => a.id.localeCompare(b.id));
    const atual = per.find((s) => !s.completo) || per[per.length - 1];
    const comSaldo = per.filter((s) => s.completo && s.saldo > 0).sort((a, b) => a.limite_iso.localeCompare(b.limite_iso));
    const fe = D.ferias_status.filter((f) => f.pid === p.pid && f.status !== "Concluída").sort((a, b) => a.inicio_iso.localeCompare(b.inicio_iso));
    const fact = (k, v, s, cls) => { const d = el("div", cls || ""); if (k) d.append(el("dt", null, k)); const dd = el("dd", null, v); if (s) dd.append(el("span", "s", s)); d.append(dd); return d; };
    const dl = el("dl", "cal-facts");
    dl.append(fact("", p.funcionario, (p.setor || "—") + " · " + p.empresa + " · " + (p.cargo ? p.cargo + " · " : "") + "admissão " + br(p.admissao)));
    if (atual && !atual.completo) dl.append(fact("Em formação", atual.inicio_aquisitivo + " a " + atual.fim_aquisitivo, "direito " + atual.direito_em + " (" + emDias(isoDeBr(atual.direito_em)) + ")"));
    if (comSaldo.length) dl.append(fact("A tirar", comSaldo.map((s) => s.saldo + " dias · " + s.periodo).join(" · "), "até " + comSaldo[0].limite + " (" + emDias(comSaldo[0].limite_iso) + ") · " + comSaldo[0].situacao.toLowerCase(), comSaldo[0].situacao === "Urgente" || comSaldo[0].situacao === "Vencido" ? "urg" : ""));
    else if (atual && atual.completo) dl.append(fact("A tirar", "sem saldo", "período " + atual.periodo + " " + atual.situacao.toLowerCase()));
    if (fe.length) fe.forEach((f) => {
      const d = fact(f.status === "Em andamento" ? "Em férias" : f.ajuste ? "Ajustada no painel" : f.manual ? "Marcada no painel" : "Do relatório", f.inicio + (f.fim_iso ? " a " + br(f.fim_iso) : ""), "volta " + f.retorno + (typeof f.dias === "number" ? " · " + f.dias + " dias" : " · dias a definir"));
      d.append(btnAlterar(f, "Alterar"), btnLimpar(f.id, "Limpar"));
      dl.append(d);
    });
    else dl.append(fact("Marcadas", "nenhuma", "sem saída programada"));
    ocultasDe(p.pid).forEach((b) => { const d = fact("Removida do relatório", br(b.inicio) + (b.fim ? " a " + br(b.fim) : ""), "não conta no calendário nem no saldo", "oculta"); d.append(btnRestaurar(b.id, "Restaurar")); dl.append(d); });
    box.append(dl);
  }
  let probe = null;
  const largura = (txt) => { if (!probe) { probe = el("span", "cal-ev cal-probe"); $("#calGrid").parentElement.append(probe); } probe.style.fontSize = getComputedStyle($("#calGrid")).getPropertyValue("--ev-f"); probe.textContent = txt; return probe.offsetWidth; };
  const TAM = [[17, 10.5, 3], [15, 9.5, 3], [13, 8.5, 2], [12, 8, 2], [11, 7.5, 1], [10, 7, 1]];
  function ajustarCal() {
    const painel = $("#tab-calendario");
    if (window.innerWidth > 860 && painel.classList.contains("active")) {
      const topo = painel.getBoundingClientRect().top + window.scrollY;
      painel.style.height = Math.max(520, window.innerHeight - topo - 40) + "px";
    } else painel.style.height = "";
    const grid = $("#calGrid"), cells = $$("#calGrid .cal-day");
    if (!cells.length) return;
    const precisa = Math.max(0, ...cells.map((c) => (c._items || []).length));
    let alturaCel = Math.min(...cells.map((c) => c.clientHeight));
    /* janela muito baixa: em vez de cortar os nomes, deixa cada dia com pelo menos 46px e a tela rola um pouco */
    grid.style.gridAutoRows = "";
    if (window.innerWidth > 860 && alturaCel < 46) { grid.style.gridAutoRows = "minmax(46px, 1fr)"; painel.style.height = ""; alturaCel = Math.min(...cells.map((c) => c.clientHeight)); }
    const cabe = (h, gap, n) => 27 + n * h + (n - 1) * gap + 3 <= alturaCel;
    let tam = TAM[0], colunas = 1;
    if (window.innerWidth > 860 && precisa > 0) {
      tam = TAM.find((t) => cabe(t[0], t[2], precisa)) || null;
      if (!tam) { colunas = 2; tam = TAM.find((t) => cabe(t[0], t[2], Math.ceil(precisa / 2))) || TAM[TAM.length - 1]; }
    }
    grid.style.setProperty("--ev-h", tam[0] + "px"); grid.style.setProperty("--ev-f", tam[1] + "px"); grid.style.setProperty("--ev-gap", tam[2] + "px");
    grid.classList.toggle("duas", colunas === 2);
    probe = null;
    const disp = (cells[0].clientWidth - 12) / colunas - (colunas === 2 ? 2 : 0) - 8;
    cells.forEach((cell) => {
      cell.querySelectorAll(".cal-ev, .cal-evs").forEach((x) => x.remove());
      const items = cell._items || [];
      const wrap = el("div", "cal-evs");
      items.forEach((it) => {
        let txt = it.opcoes[it.opcoes.length - 1];
        for (const o of it.opcoes) { if (largura(o) <= disp) { txt = o; break; } }
        const b = el("button", "cal-ev " + it.cls, txt); b.type = "button"; b.dataset.pid = it.pid; if (it.mk) b.dataset.mk = it.mk; b.title = it.title; wrap.append(b);
      });
      cell.append(wrap);
    });
  }
  function calendario() {
    seletorPessoas(); faixaPessoa();
    const { y, m } = S.cal;
    $("#calTitulo").textContent = MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + " de " + y;
    const grid = $("#calGrid"); grid.replaceChildren(); probe = null;
    if ($("#calDia") && !$("#calDia").hidden) fecharDia();
    const start = Date.UTC(y, m, 1 - new Date(Date.UTC(y, m, 1)).getUTCDay());
    const ev = eventosCal();
    const porDia = {}; ev.forEach((e) => (porDia[e.iso] = porDia[e.iso] || []).push(e));
    const ini = isoYMD(y, m, 1), fim = isoYMD(y, m + 1, 0);
    const pessoasFora = new Set();
    const TIPO = { Retorno: "ret", "Saída": "saida", Aviso: "aviso", Pagamento: "pag", Limite: "lim", Direito: "dir" };
    const ROT_IND = { Retorno: ["Volta ao trabalho", "Retorno"], "Saída": ["Sai de férias", "Saída"], Aviso: ["Entregar o aviso", "Aviso"], Pagamento: ["Pagar férias + 1/3", "Pagamento"], Limite: ["Limite para começar", "Limite"], Direito: ["Passa a ter direito", "Direito"] };
    for (let i = 0; i < 42; i++) {
      const dt = new Date(start + i * 864e5), iso = dt.toISOString().slice(0, 10);
      const fora = dt.getUTCMonth() !== m;
      if (i === 35 && fora) break;
      const fds = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
      const cell = el("div", "cal-day" + (fora ? " fora" : "") + (iso === hoje ? " hoje" : "") + (fds ? " fds" : "") + (FERIADOS[iso] ? " feriado" : ""));
      cell.dataset.iso = iso;
      const top = el("div", "cal-top"); top.append(el("span", "cal-num", dt.getUTCDate()));
      if (FERIADOS[iso]) top.append(el("span", "cal-fer-lab", FERIADOS[iso]));
      cell.append(top);
      const items = [];
      feriasNoDia(iso).forEach((f) => {
        if (!fora) pessoasFora.add(f.pid);
        items.push({ cls: "fer" + (f.status === "Concluída" ? " done" : "") + (f.manual ? " manual" : ""), pid: f.pid, mk: f.manual ? f.id : "",
          opcoes: S.cal.pid ? ["De férias" + (typeof f.dias === "number" ? " · " + f.dias + " dias" : ""), "De férias"] : [f.funcionario, curto(f.funcionario), primeiro(f.funcionario)],
          title: f.funcionario + " · de férias de " + f.inicio + " a " + br(f.fim_iso) + ", volta " + f.retorno + (typeof f.dias === "number" ? " · " + f.dias + " dias" : "") + (f.ajuste ? " · ajustado no painel" : f.manual ? " · marcado no painel" : " · do relatório") + " · clique no dia para alterar" });
      });
      (porDia[iso] || []).forEach((e) => items.push({ cls: TIPO[e.tipo] + (e.sev === "sev-alta" ? " alta" : ""), pid: e.pid,
        opcoes: S.cal.pid ? (ROT_IND[e.tipo] || [e.tipo]) : [e.tipo + ": " + e.nome, e.tipo + ": " + curto(e.nome), e.tipo + ": " + primeiro(e.nome), e.tipo], title: e.nome + " · " + e.texto }));
      cell._items = items;
      grid.append(cell);
    }
    const doMes = ev.filter((e) => e.iso >= ini && e.iso <= fim);
    const n = (t) => doMes.filter((e) => e.tipo === t).length;
    const partes = [];
    if (pessoasFora.size) partes.push(S.cal.pid ? "de férias em algum dia do mês" : pessoasFora.size + pl(pessoasFora.size, " pessoa de férias", " pessoas de férias") + " em algum dia do mês");
    if (n("Retorno")) partes.push(n("Retorno") + pl(n("Retorno"), " retorno", " retornos"));
    if (n("Saída")) partes.push(n("Saída") + pl(n("Saída"), " saída", " saídas"));
    if (n("Aviso")) partes.push(n("Aviso") + pl(n("Aviso"), " aviso a entregar", " avisos a entregar"));
    if (n("Pagamento")) partes.push(n("Pagamento") + pl(n("Pagamento"), " pagamento", " pagamentos"));
    if (n("Limite")) partes.push(n("Limite") + pl(n("Limite"), " limite para começar férias", " limites para começar férias"));
    if (n("Direito")) partes.push(S.cal.pid ? "passa a ter direito a férias" : n("Direito") + pl(n("Direito"), " pessoa passa a ter direito", " pessoas passam a ter direito"));
    const quem = S.cal.pid ? primeiro(nomeDe(S.cal.pid)) + " neste mês: " : "Neste mês: ";
    $("#calResumo").textContent = partes.length ? quem + lista(partes) + "." : (S.cal.pid ? primeiro(nomeDe(S.cal.pid)) + " não tem nenhuma data neste mês. Use “Próxima data” para ir ao mês certo." : "Nenhuma data de férias neste mês.");
    requestAnimationFrame(ajustarCal);
  }
  const mudaMes = (d) => { S.cal.m += d; while (S.cal.m < 0) { S.cal.m += 12; S.cal.y--; } while (S.cal.m > 11) { S.cal.m -= 12; S.cal.y++; } calendario(); };
  $("#calPrev").addEventListener("click", () => mudaMes(-1));
  $("#calNext").addEventListener("click", () => mudaMes(1));
  $("#calHoje").addEventListener("click", () => { S.cal.y = +hoje.slice(0, 4); S.cal.m = +hoje.slice(5, 7) - 1; calendario(); });
  $("#calProx").addEventListener("click", () => {
    const fimMes = isoYMD(S.cal.y, S.cal.m + 1, 0);
    const prox = [...eventosCal(), ...D.ferias_status.filter(daPessoa).map((f) => ({ iso: f.inicio_iso }))].map((e) => e.iso).filter((iso) => iso > fimMes).sort()[0];
    if (!prox) { $("#calResumo").textContent = "Não há mais datas depois deste mês."; return; }
    S.cal.y = +prox.slice(0, 4); S.cal.m = +prox.slice(5, 7) - 1; calendario();
  });
  function irParaMesComDados() {
    const ini = isoYMD(S.cal.y, S.cal.m, 1), fim = isoYMD(S.cal.y, S.cal.m + 1, 0);
    const datas = [...eventosCal().map((e) => e.iso), ...D.ferias_status.filter(daPessoa).flatMap((f) => [f.inicio_iso, f.fim_iso].filter(Boolean))].sort();
    if (datas.some((d) => d >= ini && d <= fim) || D.ferias_status.some((f) => daPessoa(f) && f.fim_iso && f.inicio_iso <= fim && f.fim_iso >= ini)) return;
    const alvo = datas.find((d) => d >= hoje) || datas[datas.length - 1];
    if (alvo) { S.cal.y = +alvo.slice(0, 4); S.cal.m = +alvo.slice(5, 7) - 1; }
  }
  const escolher = (pid) => { S.cal.pid = pid; if (pid) irParaMesComDados(); calendario(); };
  $("#calPessoa").addEventListener("change", (e) => escolher(e.target.value));
  window.FXcal = (pid) => { S.cal.pid = pid; irParaMesComDados(); abrir("calendario"); };
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (S.tab === "calendario") ajustarCal(); }, 120); });

  /* próximas datas */
  S.dat = { pid: "", tipo: "", h: 90, dir: false };
  function datas() {
    seletorPessoas($("#datPessoa"), S.dat);
    const ev0 = eventosCal(S.dat.pid).filter((e) => e.iso >= hoje);
    const lim = S.dat.h === 90 ? addDias(hoje, 90) : isoYMD(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 + 12, 0);
    const ev = S.dat.pid ? ev0 : ev0.filter((e) => e.iso <= lim);
    const nDir = ev.filter((e) => e.tipo === "Direito").length;
    const todos = S.dat.dir || S.dat.tipo === "Direito" ? ev : ev.filter((e) => e.tipo !== "Direito");
    const hz = $("#datHor"); hz.replaceChildren();
    [[90, "Próximos 90 dias"], [365, "Próximos 12 meses"]].forEach(([h, lab]) => { const b = el("button", "chip" + (S.dat.h === h ? " on" : ""), lab); b.type = "button"; b.addEventListener("click", () => { S.dat.h = h; datas(); }); hz.append(b); });
    const bd = el("button", "chip" + (S.dat.dir ? " on" : ""), "Incluir quem passa a ter direito "); bd.type = "button"; bd.append(el("span", "cnt", nDir)); bd.title = "Quem completa o período aquisitivo no prazo escolhido"; bd.addEventListener("click", () => { S.dat.dir = !S.dat.dir; if (!S.dat.dir && S.dat.tipo === "Direito") S.dat.tipo = ""; datas(); }); hz.append(bd);
    const ch = $("#datChips"); ch.replaceChildren();
    const ROT = { "": "Todas", Retorno: "Retornos", "Saída": "Saídas", Aviso: "Avisos", Pagamento: "Pagamentos", Limite: "Limites para saída", Direito: "Passam a ter direito" };
    Object.keys(ROT).filter((k) => !k || todos.some((e) => e.tipo === k)).filter((k) => k !== "Direito" || S.dat.dir).forEach((k) => {
      const b = el("button", "chip" + (S.dat.tipo === k ? " on" : ""), ROT[k] + " "); b.type = "button";
      b.append(el("span", "cnt", k ? todos.filter((e) => e.tipo === k).length : todos.length));
      b.addEventListener("click", () => { S.dat.tipo = k; datas(); }); ch.append(b);
    });
    if (S.dat.tipo && !todos.some((e) => e.tipo === S.dat.tipo)) S.dat.tipo = "";
    const base = S.dat.tipo ? todos.filter((e) => e.tipo === S.dat.tipo) : todos;
    const box = $("#datLista"); box.replaceChildren();
    const quem = S.dat.pid ? primeiro(nomeDe(S.dat.pid)) : "";
    $("#datResumo").textContent = todos.length
      ? (quem ? quem + " tem " : "") + todos.length + pl(todos.length, " data", " datas") + (quem ? " pela frente" : S.dat.h === 90 ? " nos próximos 90 dias" : " nos próximos 12 meses") + ": " +
        lista(["Retorno", "Saída", "Aviso", "Pagamento", "Limite", "Direito"].map((t) => [t, todos.filter((e) => e.tipo === t).length]).filter((x) => x[1]).map(([t, n]) => n + " " + ({ Retorno: pl(n, "retorno", "retornos"), "Saída": pl(n, "saída", "saídas"), Aviso: pl(n, "aviso", "avisos"), Pagamento: pl(n, "pagamento", "pagamentos"), Limite: pl(n, "limite para começar férias", "limites para começar férias"), Direito: pl(n, "pessoa passa a ter direito", "pessoas passam a ter direito") }[t]))) + "."
      : (quem ? quem + " não tem datas futuras." : "Nenhuma data no período escolhido" + (nDir && !S.dat.dir ? " além de " + nDir + pl(nDir, " pessoa que passa a ter direito (ative o filtro para ver)", " pessoas que passam a ter direito (ative o filtro para ver)") : "") + ".");
    let mesAtual = "";
    base.forEach((e) => {
      const chave = e.iso.slice(0, 7);
      if (chave !== mesAtual) { mesAtual = chave; const h = el("h2", "dat-mes", MESES[+chave.slice(5, 7) - 1].charAt(0).toUpperCase() + MESES[+chave.slice(5, 7) - 1].slice(1) + " de " + chave.slice(0, 4)); box.append(h); }
      const it = el("div", "prazo " + e.sev);
      const d = el("div", "pz-data"); d.append(el("b", null, brc(e.iso)), el("span", null, emDias(e.iso)));
      const mn = el("div", "pz-main"); mn.append(el("span", "pz-tipo", e.tipo));
      const nome = el("button", "lk", e.nome); nome.type = "button"; nome.dataset.pid = e.pid;
      const emp = func(e.pid).empresa;
      mn.append(nome, document.createTextNode(" · " + e.texto + " ")); if (emp && S.emp === "todas") mn.append(empChip(emp));
      it.append(d, mn); box.append(it);
    });
  }
  $("#datPessoa").addEventListener("change", (e) => { S.dat.pid = e.target.value; datas(); });
  $("#calDatas").addEventListener("click", () => { S.dat.pid = S.cal.pid; abrir("datas"); });
  $("#datCal").addEventListener("click", () => { S.cal.pid = S.dat.pid; if (S.cal.pid) irParaMesComDados(); abrir("calendario"); });

  /* marcar férias no painel */
  const CHAVE = "";
  const BASE_FERIAS = D.ferias.slice();
  const FER_OFICIAL = new Set(Object.keys(FERIADOS).filter((k) => !FERIADOS[k].includes("facultativo")));
  const addDias = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const dow = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
  const retornoDe = (fim) => { let d = addDias(fim, 1); while (dow(d) === 0 || FER_OFICIAL.has(d)) d = addDias(d, 1); return d; };
  const pagamentoDe = (ini) => { let d = addDias(ini, -2); while (dow(d) === 0 || dow(d) === 6 || FER_OFICIAL.has(d)) d = addDias(d, -1); return d; };
  const lerMarcacoes = () => window.__FERIAS_MARC.slice();
  const gravarMarcacoes = (m) => window.__salvarMarcacoes(m);
  let MARC = lerMarcacoes();
  const periodoPara = (pid) => {
    const per = D.situacao.filter((s) => s.pid === pid);
    const comSaldo = per.filter((s) => s.completo && s.saldo > 0).sort((a, b) => a.limite_iso.localeCompare(b.limite_iso));
    return comSaldo[0] || per.find((s) => !s.completo) || per[per.length - 1];
  };
  const baseDe = (id) => BASE_FERIAS.find((f) => f.id === id);
  function aplicarMarcacoes() {
    const fora = new Set(MARC.filter((m) => m.oculta || m.substitui).map((m) => m.oculta || m.substitui));
    const extras = MARC.filter((m) => !m.oculta).map((mk) => {
      const p = func(mk.pid); const per = periodoPara(mk.pid); const base = mk.substitui ? baseDe(mk.substitui) : null;
      const fim = addDias(mk.inicio, mk.dias - 1);
      return { id: mk.id, pid: mk.pid, empresa: p.empresa, funcionario: p.funcionario, setor: p.setor, inicio: mk.inicio, fim, retorno: retornoDe(fim), dias: String(mk.dias), abono: String(mk.abono || 0),
        periodo: base ? base.periodo : (per ? per.id : ""), aviso_ate: addDias(mk.inicio, -30), pagamento_ate: pagamentoDe(mk.inicio),
        fonte: base ? "Ajustado no painel (era " + base.fonte + ")" : "Marcado no painel", observacao: mk.obs || "", manual: true, ajuste: base ? base.id : "" };
    });
    D.ferias = [...BASE_FERIAS.filter((f) => !fora.has(f.id)), ...extras];
    window.recalcular();
    D.ferias_status.forEach((f) => { const x = D.ferias.find((y) => y.id === f.id) || {}; f.manual = !!x.manual; f.ajuste = x.ajuste || ""; });
  }
  const ocultasDe = (pid) => MARC.filter((m) => m.oculta && (!pid || m.pid === pid)).map((m) => baseDe(m.oculta)).filter(Boolean);
  /* abre a janela para qualquer férias: marcada no painel (edita) ou do relatório (cria um ajuste que substitui o registro) */
  function editarFerias(f) {
    const x = D.ferias.find((y) => y.id === f.id); if (!x) return;
    const dias = +x.dias || (x.fim ? dias_(x.inicio, x.fim) + 1 : 30);
    if (x.manual) abrirMarcacao({ id: x.id, pid: x.pid, inicio: x.inicio, dias, abono: +x.abono, obs: x.observacao });
    else abrirMarcacao({ base: x.id, pid: x.pid, inicio: x.inicio, dias, abono: +x.abono, obs: x.observacao });
  }
  function avisosMarcacao(pid, inicio, dias, abono, editId) {
    const out = [];
    const W = (cls, b, s) => out.push({ cls, b, s });
    if (!pid) { W("warn", "Escolha o colaborador", ""); return out; }
    if (!inicio) { W("warn", "Escolha a data de início", ""); return out; }
    const fim = addDias(inicio, dias - 1);
    const d = dow(inicio);
    if (d === 0 || FER_OFICIAL.has(inicio)) W("crit", "Início em domingo ou feriado", "As férias precisam começar em dia útil.");
    else if (d === 5 || d === 6) W("crit", "Início nos 2 dias antes do descanso semanal", "A CLT não permite começar férias em sexta ou sábado (art. 134, § 3º). Prefira começar na segunda.");
    else if (FER_OFICIAL.has(addDias(inicio, 1)) || FER_OFICIAL.has(addDias(inicio, 2))) W("crit", "Início nos 2 dias antes de feriado", "A CLT não permite começar férias nos 2 dias que antecedem feriado.");
    if (dias < 5) W("crit", "Menos de 5 dias", "Nenhuma parte das férias pode ter menos de 5 dias corridos.");
    const per = periodoPara(pid);
    if (!per) W("warn", "Sem período de férias cadastrado", "Confira com a contabilidade.");
    else if (!per.completo) W("warn", "Período ainda em formação", "Passa a ter direito em " + per.direito_em + ". Antes disso, só com acordo de férias antecipadas.");
    else if (per.saldo <= 0) W("warn", "Sem saldo neste período", "O período " + per.periodo + " já foi quitado.");
    else {
      const outras = D.ferias.filter((f) => f.pid === pid && f.periodo === per.id && !editId.includes(f.id) && f.inicio > hoje).reduce((s, f) => s + (Number(f.dias) || 0) + (Number(f.abono) || 0), 0);
      const resta = per.saldo - outras - dias - abono;
      if (resta < 0) W("crit", "Passa do saldo", "O período " + per.periodo + " tem " + per.saldo + " dias" + (outras ? ", " + outras + " já marcados" : "") + "; esta marcação usa " + (dias + abono) + ".");
      else if (resta > 0 && resta < 5) W("warn", "Sobrariam " + resta + " dias", "Cada parte precisa ter pelo menos 5 dias; ajuste para " + (dias + resta) + " dias ou venda o restante.");
      else if (resta > 0) W("", "Sobram " + resta + " dias do período", "Lembre que uma das partes precisa ter pelo menos 14 dias.");
      if (inicio > per.limite_iso) W("crit", "Passa do limite de " + per.limite, "O que cair depois do limite é pago em dobro.");
      else if (fim > per.fim_concessivo_iso) W("crit", "Termina depois do período concessivo", "A parte depois de " + br(per.fim_concessivo_iso) + " é paga em dobro.");
    }
    const aviso = addDias(inicio, -30);
    if (aviso < hoje) W("warn", "Aviso de 30 dias já não é possível", "Faltam " + dias_(hoje, inicio) + " dias para o início; o aviso deveria ter sido entregue até " + br(aviso) + ".");
    const setor = func(pid).setor;
    const juntos = D.ferias_status.filter((f) => f.pid !== pid && !editId.includes(f.id) && f.fim_iso && f.setor === setor && f.inicio_iso <= fim && f.fim_iso >= inicio && f.status !== "Concluída");
    if (juntos.length) W("warn", "Mesmo setor fora ao mesmo tempo", lista(juntos.map((f) => f.funcionario + " (" + f.inicio + " a " + br(f.fim_iso) + ")")) + " · " + setor + ".");
    return out;
  }
  const dias_ = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const mk = { id: null };
  const $m = (id) => document.getElementById(id);
  function abrirMarcacao(opts) {
    mk.id = opts.id || null; mk.base = opts.base || null;
    const orig = mk.id ? MARC.find((x) => x.id === mk.id) : null; mk.substitui = orig && orig.substitui ? orig.substitui : null;
    const sel = $m("mkPessoa");
    const pes = D.funcionarios.filter(daEmp).slice().sort((a, b) => a.funcionario.localeCompare(b.funcionario, "pt"));
    sel.replaceChildren(new Option("Escolha o colaborador…", ""), ...pes.map((p) => new Option(p.funcionario + " · " + p.empresa, p.pid)));
    sel.value = opts.pid || ""; sel.disabled = !!(mk.id || mk.base);
    $m("mkInicio").value = opts.inicio || "";
    const per = opts.pid ? periodoPara(opts.pid) : null;
    $m("mkDias").value = opts.dias || (per && per.completo && per.saldo > 0 ? Math.min(30, per.saldo) : 30);
    $m("mkAbono").value = opts.abono || 0;
    $m("mkObs").value = opts.obs || "";
    const b = baseDe(mk.base || mk.substitui);
    $m("mkTit").textContent = mk.base ? "Ajustar férias do relatório" : mk.id ? (mk.substitui ? "Alterar ajuste das férias do relatório" : "Alterar férias marcadas") : "Marcar início das férias";
    $m("mkOrigem").hidden = !b;
    if (b) $m("mkOrigem").textContent = "No relatório: " + br(b.inicio) + (b.fim ? " a " + br(b.fim) : " · dias a definir") + (b.dias ? " · " + b.dias + " dias" : "") + (b.abono && b.abono !== "0" ? " · " + b.abono + " vendidos" : "") + " · fonte: " + b.fonte + ". O que você salvar aqui passa a valer no lugar disso; dá para voltar ao relatório depois.";
    $m("mkRemover").hidden = !(mk.id || mk.base); $m("mkRemover").textContent = mk.base ? "Remover do calendário" : "Limpar esta marcação";
    $m("mkRestaurar").hidden = !mk.substitui;
    $m("mkBg").hidden = false;
    atualizarMarcacao();
    (opts.pid ? $m("mkInicio") : sel).focus();
  }
  function fecharMarcacao() { $m("mkBg").hidden = true; }
  function atualizarMarcacao() {
    const pid = $m("mkPessoa").value, inicio = $m("mkInicio").value, dias = Math.max(1, +$m("mkDias").value || 0), abono = Math.max(0, +$m("mkAbono").value || 0);
    const calc = $m("mkCalc"); calc.replaceChildren();
    if (pid && inicio && inicio.length === 10) {
      const fim = addDias(inicio, dias - 1), ret = retornoDe(fim);
      const per = periodoPara(pid);
      const fact = (k, v, s) => { const d = el("div"); d.append(el("dt", null, k)); const dd = el("dd", null, v); if (s) dd.append(el("span", "s", s)); d.append(dd); calc.append(d); };
      fact("Férias", br(inicio) + " a " + br(fim), dias + " dias corridos" + (abono ? " + " + abono + " vendidos" : ""));
      fact("Retorno ao trabalho", br(ret), dow(ret) === 1 ? "segunda-feira" : ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][dow(ret)] + (FER_OFICIAL.has(addDias(fim, 1)) || dow(addDias(fim, 1)) === 0 ? " · pula o descanso/feriado" : ""));
      fact("Entregar o aviso até", br(addDias(inicio, -30)), dias_(hoje, addDias(inicio, -30)) >= 0 ? emDias(addDias(inicio, -30)) : "prazo já passou");
      fact("Pagar até", br(pagamentoDe(inicio)), "férias + 1/3");
      if (per) fact("Período usado", per.periodo + (per.completo ? " · saldo " + per.saldo + " dias" : " · em formação"), per.completo ? "começar até " + per.limite : "direito em " + per.direito_em);
    }
    const av = $m("mkAvisos"); av.replaceChildren();
    avisosMarcacao(pid, inicio.length === 10 ? inicio : "", dias, abono, [mk.id, mk.base, mk.substitui].filter(Boolean)).forEach((w) => { const n = el("div", "nov " + w.cls); n.append(el("b", null, w.b), el("span", null, w.s)); av.append(n); });
    $m("mkSalvar").disabled = !(pid && inicio.length === 10 && dias >= 1);
  }
  ["mkPessoa", "mkInicio", "mkDias", "mkAbono"].forEach((id) => { $m(id).addEventListener("input", atualizarMarcacao); $m(id).addEventListener("change", () => { if (id === "mkPessoa") { const per = periodoPara($m("mkPessoa").value); if (per && per.completo && per.saldo > 0) $m("mkDias").value = Math.min(30, per.saldo); } atualizarMarcacao(); }); });
  $m("mkSalvar").addEventListener("click", () => {
    const pid = $m("mkPessoa").value, inicio = $m("mkInicio").value, dias = Math.max(1, +$m("mkDias").value || 0), abono = Math.max(0, +$m("mkAbono").value || 0), obs = $m("mkObs").value.trim();
    if (!pid || inicio.length !== 10) return;
    if (mk.id) { const i = MARC.findIndex((x) => x.id === mk.id); MARC[i] = { ...MARC[i], inicio, dias, abono, obs }; }
    else if (mk.base) MARC.push({ id: "mk" + Date.now().toString(36), pid, inicio, dias, abono, obs, criado: hoje, substitui: mk.base });
    else MARC.push({ id: "mk" + Date.now().toString(36), pid, inicio, dias, abono, obs, criado: hoje });
    gravarMarcacoes(MARC); aplicarMarcacoes(); fecharMarcacao();
    S.cal.y = +inicio.slice(0, 4); S.cal.m = +inicio.slice(5, 7) - 1; tudo();
  });
  function removerMarcacoes(ids) { MARC = MARC.filter((x) => !ids.includes(x.id)); gravarMarcacoes(MARC); aplicarMarcacoes(); fecharMarcacao(); tudo(); }
  $m("mkRemover").addEventListener("click", () => { if (mk.base) ocultarBase(mk.base); else removerMarcacoes([mk.id]); });
  $m("mkRestaurar").addEventListener("click", () => { if (mk.substitui) restaurarBase(mk.substitui); });
  function ocultarBase(baseId) {
    const b = baseDe(baseId); if (!b) return;
    MARC = MARC.filter((m) => m.substitui !== baseId && m.oculta !== baseId);
    MARC.push({ id: "mk" + Date.now().toString(36), pid: b.pid, oculta: baseId, criado: hoje });
    gravarMarcacoes(MARC); aplicarMarcacoes(); fecharMarcacao(); tudo();
  }
  function restaurarBase(baseId) { MARC = MARC.filter((m) => m.substitui !== baseId && m.oculta !== baseId); gravarMarcacoes(MARC); aplicarMarcacoes(); fecharMarcacao(); tudo(); }
  $m("mkLimpar").addEventListener("click", () => {
    if (!$m("mkPessoa").disabled) $m("mkPessoa").value = "";
    $m("mkInicio").value = ""; $m("mkDias").value = 30; $m("mkAbono").value = 0; $m("mkObs").value = "";
    atualizarMarcacao(); ($m("mkPessoa").disabled ? $m("mkInicio") : $m("mkPessoa")).focus();
  });
  $m("mkCancelar").addEventListener("click", fecharMarcacao);
  $m("mkBg").addEventListener("click", (e) => { if (e.target === $m("mkBg")) fecharMarcacao(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$m("mkBg").hidden) fecharMarcacao(); });
  $("#calMarcar").addEventListener("click", () => abrirMarcacao({ pid: S.cal.pid }));
  $("#calExportar").addEventListener("click", () => {
    const linhas = [["colaborador", "empresa", "inicio", "fim", "retorno", "dias", "vendidos", "aviso_ate", "pagamento_ate", "observacao"]];
    D.ferias.filter((f) => f.manual).forEach((f) => linhas.push([f.funcionario, f.empresa, br(f.inicio), br(f.fim), br(f.retorno), f.dias, f.abono, br(f.aviso_ate), br(f.pagamento_ate), f.observacao]));
    const csv = "\ufeff" + linhas.map((l) => l.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "ferias_marcadas_" + hoje + ".csv"; a.click();
  });
  function limparMarcacao(id) {
    const f = D.ferias.find((x) => x.id === id); if (!f) return;
    const datas = br(f.inicio) + (f.fim ? " a " + br(f.fim) : "");
    if (f.manual) { if (confirm("Limpar a marcação de férias de " + f.funcionario + " (" + datas + ")? Só esta marcação é removida; as outras continuam." + (f.ajuste ? " Como era um ajuste, as férias voltam a aparecer como estão no relatório." : ""))) { if (f.ajuste) restaurarBase(f.ajuste); else removerMarcacoes([id]); } }
    else if (confirm("Remover do calendário as férias de " + f.funcionario + " (" + datas + "), que vieram do relatório? Só este registro sai; você pode restaurar depois na faixa do colaborador ou na tela Em andamento e marcadas.")) ocultarBase(id);
  }
  const btnLimpar = (id, txt) => { const b = el("button", "cal-btn mk-del", txt || "Limpar"); b.type = "button"; b.title = "Remove só este registro de férias"; b.addEventListener("click", (e) => { e.stopPropagation(); limparMarcacao(id); }); return b; };
  const btnAlterar = (f, txt) => { const b = el("button", "cal-btn", txt || "Alterar"); b.type = "button"; b.title = f.manual ? "Altera esta marcação" : "Ajusta estas férias do relatório (datas, dias, abono)"; b.addEventListener("click", (e) => { e.stopPropagation(); if (!$("#calDia").hidden) fecharDia(); editarFerias(f); }); return b; };
  const btnRestaurar = (baseId, txt) => { const b = el("button", "cal-btn", txt || "Restaurar do relatório"); b.type = "button"; b.addEventListener("click", (e) => { e.stopPropagation(); restaurarBase(baseId); }); return b; };
  function marcacoesInfo() {
    const n = D.ferias.filter((f) => f.manual).length; $("#calExportar").hidden = !n; $("#calExportar").textContent = "Exportar (" + n + ")"; $("#calExportar").title = "Baixa uma planilha com as " + n + " férias marcadas no painel";
  }
  /* mini aba do dia */
  const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const ROT_EV = { Retorno: "ret", "Saída": "saida", Aviso: "aviso", Pagamento: "pag", Limite: "lim", Direito: "dir" };
  function fecharDia() { const pop = $("#calDia"); pop.hidden = true; $$("#calGrid .cal-day.sel").forEach((c) => c.classList.remove("sel")); }
  function abrirDia(iso, cell) {
    const pop = $("#calDia"), card = $(".cal-card");
    $$("#calGrid .cal-day.sel").forEach((c) => c.classList.remove("sel")); cell.classList.add("sel");
    const dsem = dow(iso);
    const h = $("#calDiaTit"); h.textContent = DIAS_SEMANA[dsem] + ", " + br(iso);
    const sub = $("#calDiaSub"); sub.textContent = FERIADOS[iso] ? "Feriado: " + FERIADOS[iso] : dsem === 0 ? "Domingo (descanso)" : dsem === 6 ? "Sábado · jornada das 08:00 às 12:00" : iso === hoje ? "Hoje" : "";
    const corpo = $("#calDiaCorpo"); corpo.replaceChildren();
    const fer = feriasNoDia(iso).sort((a, b) => a.funcionario.localeCompare(b.funcionario, "pt"));
    const evs = eventosCal().filter((e) => e.iso === iso);
    const btn = (txt, fn, cls) => { const b = el("button", "cal-btn " + (cls || ""), txt); b.type = "button"; b.addEventListener("click", fn); return b; };
    if (fer.length) {
      corpo.append(el("div", "cd-sec", "De férias neste dia · " + fer.length));
      fer.forEach((f) => {
        const it = el("div", "cd-item" + (f.status === "Concluída" ? " done" : ""));
        const top = el("div", "cd-top"); top.append(el("b", null, f.funcionario), empChip(f.empresa)); it.append(top);
        it.append(el("div", "cd-sub", (f.setor || "—") + " · de " + f.inicio + " a " + br(f.fim_iso) + " · volta " + f.retorno + (typeof f.dias === "number" ? " · " + f.dias + " dias" : "") + (f.abono ? " · " + f.abono + " vendidos" : "") + (f.manual ? " · marcado no painel" : "")));
        const acts = el("div", "cd-acts");
        if (!S.cal.pid) acts.append(btn("Calendário dele(a)", () => { fecharDia(); escolher(f.pid); }));
        acts.append(btn("Colaborador", () => { S.ficha = f.pid; abrir("ficha"); }));
        acts.append(btnAlterar(f), btnLimpar(f.id));
        it.append(acts); corpo.append(it);
      });
    }
    if (evs.length) {
      corpo.append(el("div", "cd-sec", "Datas do dia · " + evs.length));
      evs.forEach((e) => {
        const it = el("div", "cd-item");
        const top = el("div", "cd-top"); top.append(el("span", "cal-ev cd-tag " + ROT_EV[e.tipo] + (e.sev === "sev-alta" ? " alta" : ""), e.tipo), el("b", null, e.nome)); it.append(top);
        const fm = e.mk ? D.ferias_status.find((y) => y.id === e.mk) : null;
        it.append(el("div", "cd-sub", e.texto.charAt(0).toUpperCase() + e.texto.slice(1) + "." + (fm ? (fm.ajuste ? " Férias do relatório ajustadas no painel." : fm.manual ? " Vem de uma marcação feita no painel." : " Vem do relatório (" + fm.fonte + ").") : "")));
        const acts = el("div", "cd-acts");
        if (!S.cal.pid) acts.append(btn("Calendário dele(a)", () => { fecharDia(); escolher(e.pid); }));
        acts.append(btn("Colaborador", () => { S.ficha = e.pid; abrir("ficha"); }));
        if (fm) acts.append(btnAlterar(fm), btnLimpar(fm.id));
        it.append(acts); corpo.append(it);
      });
    }
    if (!fer.length && !evs.length) corpo.append(el("p", "cd-vazio", S.cal.pid ? primeiro(nomeDe(S.cal.pid)) + " não tem férias nem datas neste dia." : "Ninguém de férias e nenhuma data marcada neste dia."));
    const rodape = $("#calDiaAcoes"); rodape.replaceChildren();
    rodape.append(btn("+ Marcar férias começando em " + brc(iso), () => { fecharDia(); abrirMarcacao({ pid: S.cal.pid, inicio: iso }); }, "cal-btn-azul"));
    /* posição: ao lado da célula, dentro do cartão */
    pop.hidden = false;
    const rc = card.getBoundingClientRect(), rcel = cell.getBoundingClientRect();
    const W = Math.min(360, rc.width - 24);
    pop.style.width = W + "px";
    let left = rcel.right - rc.left + 8;
    if (left + W > rc.width - 8) left = rcel.left - rc.left - W - 8;
    if (left < 8) left = Math.max(8, Math.min(rc.width - W - 8, rcel.left - rc.left));
    pop.style.maxHeight = Math.max(200, rc.height - 24) + "px";
    let top = rcel.top - rc.top;
    const alt = pop.offsetHeight;
    if (top + alt > rc.height - 12) top = Math.max(12, rc.height - 12 - alt);
    pop.style.left = left + "px"; pop.style.top = top + "px";
    $("#calDiaFechar").focus();
  }
  $("#calDiaFechar").addEventListener("click", fecharDia);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#calDia").hidden) fecharDia(); });
  document.addEventListener("click", (e) => { if ($("#calDia").hidden) return; if (e.target.closest("#calDia") || e.target.closest(".cal-day") || e.target.closest(".modal-bg")) return; fecharDia(); });
  $("#calGrid").addEventListener("click", (e) => {
    const cell = e.target.closest(".cal-day[data-iso]");
    if (!cell) return;
    if (!$("#calDia").hidden && cell.classList.contains("sel")) { fecharDia(); return; }
    abrirDia(cell.dataset.iso, cell);
  });
  aplicarMarcacoes();

  /* documentos */
  const TIPOS_DOC = ["Aviso de férias", "Recibo de férias", "Comprovante de pagamento", "Acordo de venda (abono)", "Solicitação do colaborador", "Outro"];
  S.doc = { pid: "", edit: null };
  let dbp = null;
  const dbDocs = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("soaudio_ferias_docs", 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const dbAll = () => window.__docsFerias.todos();
  const dbPut = (d) => window.__docsFerias.salvar(d);
  const dbDel = (id) => window.__docsFerias.remover(id);
  let DOCS = [];
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const feriasDe = (pid) => D.ferias_status.filter((f) => f.pid === pid).sort((a, b) => b.inicio_iso.localeCompare(a.inicio_iso));
  const rotuloFerias = (f) => "Férias de " + f.inicio + (f.fim_iso ? " a " + br(f.fim_iso) : "") + " (" + f.status.toLowerCase() + ")";
  const CHECK = ["Aviso de férias", "Recibo de férias", "Comprovante de pagamento"];
  const ABR = { "Aviso de férias": "Aviso", "Recibo de férias": "Recibo", "Comprovante de pagamento": "Pagamento", "Acordo de venda (abono)": "Abono", "Solicitação do colaborador": "Solicitação", Outro: "Outro" };
  const slotsDe = (f) => CHECK.concat(Number(f.abono) ? ["Acordo de venda (abono)"] : []);
  const docsDe = (pid) => DOCS.filter((d) => d.pid === pid);
  const faltasDe = (p) => { const docs = docsDe(p.pid); const out = []; feriasDe(p.pid).filter((f) => f.status !== "Concluída").forEach((f) => slotsDe(f).forEach((t) => { if (!docs.some((d) => d.feriasId === f.id && d.tipo === t)) out.push({ f, t }); })); return out; };
  const icone = (d) => { const n = (d.nome_arquivo || d.caminho || "").toLowerCase(), m = d.mime || ""; if (d.caminho && !/\.(pdf|jpe?g|png|docx?|xlsx?)$/.test(n)) return ["link", "LINK"]; if (m.includes("pdf") || n.endsWith(".pdf")) return ["pdf", "PDF"]; if (m.startsWith("image/") || /\.(jpe?g|png)$/.test(n)) return ["img", "IMG"]; if (/\.xlsx?$/.test(n) || m.includes("sheet") || m.includes("excel")) return ["xls", "XLS"]; if (/\.docx?$/.test(n) || m.includes("word")) return ["doc", "DOC"]; return ["doc", "ARQ"]; };
  function docsSeletor() {
    const sel = $("#docPessoa");
    const pes = D.funcionarios.filter(daEmp).slice().sort((a, b) => a.funcionario.localeCompare(b.funcionario, "pt"));
    if (S.doc.pid && !pes.some((p) => p.pid === S.doc.pid)) S.doc.pid = "";
    sel.replaceChildren(new Option("Todas as pastas", ""), ...pes.map((p) => { const n = docsDe(p.pid).length; return new Option(p.funcionario + (S.emp === "todas" ? " · " + p.empresa : "") + (n ? " · " + n + (n === 1 ? " doc" : " docs") : ""), p.pid); }));
    sel.value = S.doc.pid;
  }
  /* azulejo de um documento anexado */
  function tile(d, comNome) {
    const it = el("div", "dtile"); const [cls, lab] = icone(d);
    it.append(el("div", "dic " + cls, lab));
    const main = el("div", "dt-main");
    const p = func(d.pid), f = D.ferias_status.find((x) => x.id === d.feriasId);
    const nomeCam = d.caminho ? d.caminho.split(/[\\/]/).filter(Boolean).pop() : "";
    const tit = el("div", "dt-tit", d.titulo || d.nome_arquivo || nomeCam || d.caminho); tit.title = d.titulo || d.nome_arquivo || d.caminho || ""; main.append(tit);
    if (comNome) main.append(el("span", "dt-sub", p.funcionario + " · " + p.empresa));
    main.append(el("span", "dt-sub", d.tipo + (f ? " · férias de " + f.inicio : " · geral") + (d.data ? " · " + br(d.data) : "") + (d.tamanho ? " · " + kb(d.tamanho) : "")));
    if (d.obs) main.append(el("span", "dt-obs", d.obs));
    if (d.caminho && !d.docId) main.append(el("span", "dt-obs mono", d.caminho));
    const acts = el("div", "dt-acts");
    if (d.blob) {
      const ab = el("button", "cal-btn", "Abrir"); ab.type = "button"; ab.addEventListener("click", () => { const u = URL.createObjectURL(d.blob); window.open(u, "_blank"); setTimeout(() => URL.revokeObjectURL(u), 60000); }); acts.append(ab);
      const bx = el("button", "cal-btn", "Baixar"); bx.type = "button"; bx.addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(d.blob); a.download = d.nome_arquivo || "documento"; a.click(); }); acts.append(bx);
    } else if (d.caminho) {
      const ln = el("a", "cal-btn", "Abrir"); ln.href = d.caminho.match(/^[a-z]+:/i) ? d.caminho : "file:///" + d.caminho.replace(/\\/g, "/"); ln.target = "_blank"; acts.append(ln);
    }
    if (comNome) { const pa = el("button", "cal-btn", "Pasta"); pa.type = "button"; pa.addEventListener("click", () => { S.doc.pid = d.pid; $("#docBusca").value = ""; documentos(); }); acts.append(pa); }
    const rm = el("button", "cal-btn mk-del", "Remover"); rm.type = "button"; rm.style.marginLeft = "0"; rm.addEventListener("click", async () => { if (confirm("Remover este documento do painel?")) { await dbDel(d.id); documentos(); } }); acts.append(rm);
    main.append(acts); it.append(main); return it;
  }
  /* espaço vazio para anexar */
  function tileFalta(pid, f, tipo) {
    const it = el("div", "dtile falta"); it.tabIndex = 0; it.setAttribute("role", "button");
    it.append(el("div", "dic mais", "+"));
    const main = el("div", "dt-main"); main.append(el("div", "dt-tit", tipo === "Outro" ? "Anexar outro documento" : "Anexar " + (ABR[tipo] || tipo).toLowerCase()), el("span", "dt-sub", tipo === "Outro" ? "solicitação, atestado, acordo ou qualquer outro" : tipo + (f ? " · férias de " + f.inicio : "") + " · ainda não anexado")); it.append(main);
    const go = () => abrirAnexo({ pid, feriasId: f ? f.id : "", tipo });
    it.addEventListener("click", go); it.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    return it;
  }
  async function documentos() {
    try { DOCS = await dbAll(); } catch (e) { DOCS = []; $("#docErro").hidden = false; }
    docsSeletor();
    const q = $("#docBusca").value.trim().toLowerCase();
    $("#docGeral").hidden = !!(S.doc.pid || q); $("#docPessoaBox").hidden = !S.doc.pid || !!q; $("#docBuscaRes").hidden = !q;
    if (q) { docsBusca(q); return; }
    if (!S.doc.pid) { docsVisaoGeral(); return; }
    const p = func(S.doc.pid);
    const docs = docsDe(p.pid).sort((a, b) => (b.data || "").localeCompare(a.data || "") || b.criado.localeCompare(a.criado));
    $("#docTit").textContent = p.funcionario;
    const faltas = faltasDe(p);
    $("#docResumoP").textContent = (p.setor || "—") + " · " + p.empresa + " · " + docs.length + pl(docs.length, " documento", " documentos") + (faltas.length ? " · " + faltas.length + pl(faltas.length, " faltando", " faltando") : " · documentação em dia");
    const box = $("#docFerias"); box.replaceChildren();
    const fe = feriasDe(p.pid);
    const bloco = (titulo, stCls, stTxt, sub, tiles) => { const c = el("div", "dc-fer"); const h = el("div", "dc-fer-h"); h.append(el("h2", null, titulo)); if (stTxt) h.append(el("span", "st " + stCls, stTxt)); if (sub) h.append(el("span", "prog", sub)); c.append(h); const g = el("div", "dc-grid"); tiles.forEach((t) => g.append(t)); if (!tiles.length) g.append(el("p", "txt muted", "Nenhum documento.")); c.append(g); box.append(c); };
    fe.forEach((f) => {
      const tiles = []; const slots = slotsDe(f); let ok = 0;
      slots.forEach((t) => { const ds = docs.filter((d) => d.feriasId === f.id && d.tipo === t); if (ds.length) { ok++; ds.forEach((d) => tiles.push(tile(d))); } else tiles.push(tileFalta(p.pid, f, t)); });
      docs.filter((d) => d.feriasId === f.id && !slots.includes(d.tipo)).forEach((d) => tiles.push(tile(d)));
      const cls = { "Em andamento": "and", Programada: "prog", "Programada · dias a definir": "prog", "Concluída": "done" }[f.status] || "";
      bloco("Férias de " + f.inicio + (f.fim_iso ? " a " + br(f.fim_iso) : ""), cls, f.status.toLowerCase(), ok + " de " + slots.length + " documentos obrigatórios" + (typeof f.dias === "number" ? " · " + f.dias + " dias · retorno " + f.retorno : ""), tiles);
    });
    const gerais = docs.filter((d) => !fe.some((f) => f.id === d.feriasId));
    const tg = gerais.map((d) => tile(d)); tg.push(tileFalta(p.pid, null, "Outro"));
    bloco("Outros documentos", "", "", "sem férias específica: solicitações, atestados, acordos", tg);
    if (!fe.length) box.prepend(el("p", "txt muted", "Nenhuma férias marcada ou em andamento para " + primeiro(p.funcionario) + ". Quando uma férias for marcada, os espaços de aviso, recibo e pagamento aparecem aqui."));
  }
  function docsBusca(q) {
    const pes = D.funcionarios.filter(daEmp);
    const res = DOCS.filter((d) => pes.some((p) => p.pid === d.pid)).filter((d) => { const p = func(d.pid); const f = D.ferias_status.find((x) => x.id === d.feriasId); return [p.funcionario, p.empresa, d.tipo, d.titulo, d.nome_arquivo, d.caminho, d.obs, f ? f.inicio : "", d.data ? br(d.data) : ""].join(" ").toLowerCase().includes(q); })
      .sort((a, b) => b.criado.localeCompare(a.criado));
    $("#docBuscaTit").textContent = res.length + pl(res.length, " documento encontrado", " documentos encontrados") + " para “" + $("#docBusca").value.trim() + "”";
    const g = $("#docBuscaLista"); g.replaceChildren(); res.forEach((d) => g.append(tile(d, true)));
    if (!res.length) g.append(el("p", "txt muted", "Nada encontrado. A busca olha nome do colaborador, tipo, título, nome do arquivo, observação e data."));
  }
  let filtroDoc = "";
  function docsVisaoGeral() {
    const pes = D.funcionarios.filter(daEmp).slice().sort((a, b) => a.funcionario.localeCompare(b.funcionario, "pt"));
    const linhas = pes.map((p) => ({ p, docs: docsDe(p.pid), fe: feriasDe(p.pid), faltas: faltasDe(p) }));
    const nDocs = linhas.reduce((s, l) => s + l.docs.length, 0), nFalta = linhas.filter((l) => l.faltas.length).length, nOk = linhas.filter((l) => l.fe.some((f) => f.status !== "Concluída") && !l.faltas.length).length;
    const k = $("#docKpis"); k.replaceChildren();
    const kpi = (cls, lab, v, s) => { const d = el("div", "kpi " + cls); d.append(el("div", "label", lab), el("div", "value", v), el("div", "sub", s)); return d; };
    k.append(kpi("liquido", "Documentos anexados", nDocs, "nesta empresa"), kpi("cancelada", "Pastas com documento faltando", nFalta, "férias em andamento ou marcadas"), kpi("venda", "Pastas em dia", nOk, "aviso, recibo e pagamento anexados"), kpi("icms", "Pastas", linhas.filter((l) => l.docs.length || l.fe.length).length, "colaboradores com férias ou documentos"));
    const ch = $("#docFiltro"); ch.replaceChildren();
    [["", "Com férias ou documentos", (l) => l.docs.length || l.fe.length], ["falta", "Com documento faltando", (l) => l.faltas.length], ["ok", "Em dia", (l) => l.fe.some((f) => f.status !== "Concluída") && !l.faltas.length], ["todos", "Todos os colaboradores", () => true]].forEach(([v, lab, fn]) => { const b = el("button", "chip" + (filtroDoc === v ? " on" : "")); b.type = "button"; b.append(document.createTextNode(lab + " "), el("span", "cnt", linhas.filter(fn).length)); b.dataset.fn = v; b.addEventListener("click", () => { filtroDoc = v; documentos(); }); ch.append(b); });
    const fns = { "": (l) => l.docs.length || l.fe.length, falta: (l) => l.faltas.length, ok: (l) => l.fe.some((f) => f.status !== "Concluída") && !l.faltas.length, todos: () => true };
    const box = $("#docPastas"); box.replaceChildren();
    linhas.filter(fns[filtroDoc]).sort((a, b) => b.faltas.length - a.faltas.length || b.docs.length - a.docs.length || a.p.funcionario.localeCompare(b.p.funcionario, "pt")).forEach(({ p, docs, fe, faltas }) => {
      const ativa = fe.some((f) => f.status !== "Concluída");
      const it = el("div", "pasta " + (faltas.length ? "" : ativa ? "ok" : "vazia")); it.tabIndex = 0; it.setAttribute("role", "button"); it.dataset.pidDoc = p.pid;
      const h = el("div", "pasta-h"); const ic = el("div", "pasta-ic"); ic.append(el("span", "pasta-n", docs.length)); const nm = el("div"); nm.append(el("div", "pasta-nome", p.funcionario), el("div", "pasta-sub", (p.setor || "—") + " · " + p.empresa)); h.append(ic, nm); it.append(h);
      const tipos = el("div", "pasta-tipos"); [...new Set(docs.map((d) => d.tipo))].slice(0, 4).forEach((t) => tipos.append(el("span", "fx", ABR[t] || t))); if (docs.length) it.append(tipos);
      it.append(el("div", "pasta-st " + (faltas.length ? "falta" : ativa ? "ok" : "vazia"), faltas.length ? "Falta: " + lista([...new Set(faltas.map((x) => (ABR[x.t] || x.t).toLowerCase()))]) : ativa ? "Documentação em dia" : docs.length ? docs.length + pl(docs.length, " documento guardado", " documentos guardados") : "Sem férias marcada e sem documentos"));
      box.append(it);
    });
    if (!box.children.length) box.append(el("p", "txt muted", "Nenhuma pasta nesse filtro."));
    const rec = $("#docRecentes"); rec.replaceChildren();
    DOCS.filter((d) => pes.some((p) => p.pid === d.pid)).sort((a, b) => b.criado.localeCompare(a.criado)).slice(0, 8).forEach((d) => rec.append(tile(d, true)));
    if (!rec.children.length) rec.append(el("p", "txt muted", "Nenhum documento anexado ainda. Clique em “+ Anexar documento” ou abra a pasta de um colaborador."));
  }
  const abrirPasta = (e) => { const it = e.target.closest("[data-pid-doc]"); if (it) { S.doc.pid = it.dataset.pidDoc; documentos(); } };
  $("#docPastas").addEventListener("click", abrirPasta);
  $("#docPastas").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirPasta(e); } });
  $("#docVoltar").addEventListener("click", () => { S.doc.pid = ""; documentos(); });
  $("#docPessoa").addEventListener("change", (e) => { S.doc.pid = e.target.value; $("#docBusca").value = ""; documentos(); });
  let bt; $("#docBusca").addEventListener("input", () => { clearTimeout(bt); bt = setTimeout(documentos, 180); });
  /* janela de anexar */
  const $d = (id) => document.getElementById(id);
  $d("dcTipo").replaceChildren(...TIPOS_DOC.map((t) => new Option(t, t)));
  function dcFeriasOpts(pid, sel) { const s = $d("dcFerias"); s.replaceChildren(new Option("Documento geral (sem férias específica)", ""), ...(pid ? feriasDe(pid).map((f) => new Option(rotuloFerias(f), f.id)) : [])); s.value = sel || ""; if (s.value !== (sel || "")) s.value = ""; }
  function abrirAnexo(o) {
    const sp = $d("dcPessoa"); const pes = D.funcionarios.filter(daEmp).slice().sort((a, b) => a.funcionario.localeCompare(b.funcionario, "pt"));
    sp.replaceChildren(new Option("Escolha o colaborador…", ""), ...pes.map((p) => new Option(p.funcionario + " · " + p.empresa, p.pid)));
    sp.value = o.pid || S.doc.pid || "";
    dcFeriasOpts(sp.value, o.feriasId);
    $d("dcTipo").value = o.tipo || TIPOS_DOC[0];
    $d("dcData").value = ""; $d("dcTitulo").value = ""; $d("dcObs").value = ""; $d("dcCaminho").value = ""; $d("dcArquivo").value = ""; $d("dcMsg").textContent = "";
    dcDropEstado();
    $d("dcTit").textContent = o.tipo && o.tipo !== "Outro" ? "Anexar " + o.tipo.toLowerCase() : "Anexar documento";
    $d("dcBg").hidden = false; (sp.value ? $d("dcDrop") : sp).focus();
  }
  function fecharAnexo() { $d("dcBg").hidden = true; }
  function dcDropEstado() { const f = $d("dcArquivo").files[0]; const z = $d("dcDrop"); z.classList.toggle("tem", !!f); $d("dcDropTit").textContent = f ? f.name : "Arraste o arquivo aqui ou clique para escolher"; $d("dcDropSub").textContent = f ? kb(f.size) + " · clique para trocar" : "PDF, imagem, Word ou Excel · até 20 MB"; if (f && !$d("dcTitulo").value) $d("dcTitulo").placeholder = f.name.replace(/\.[^.]+$/, ""); }
  $d("dcPessoa").addEventListener("change", (e) => dcFeriasOpts(e.target.value, ""));
  $d("dcDrop").addEventListener("click", () => $d("dcArquivo").click());
  $d("dcDrop").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $d("dcArquivo").click(); } });
  $d("dcArquivo").addEventListener("change", dcDropEstado);
  ["dragenter", "dragover"].forEach((ev) => $d("dcDrop").addEventListener(ev, (e) => { e.preventDefault(); $d("dcDrop").classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => $d("dcDrop").addEventListener(ev, (e) => { e.preventDefault(); $d("dcDrop").classList.remove("over"); }));
  $d("dcDrop").addEventListener("drop", (e) => { const f = e.dataTransfer.files; if (f && f.length) { $d("dcArquivo").files = f; dcDropEstado(); } });
  $d("dcCancelar").addEventListener("click", fecharAnexo);
  $d("dcBg").addEventListener("click", (e) => { if (e.target === $d("dcBg")) fecharAnexo(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$d("dcBg").hidden) fecharAnexo(); });
  $("#docNovo").addEventListener("click", () => abrirAnexo({}));
  $d("dcSalvar").addEventListener("click", async () => {
    const pid = $d("dcPessoa").value; const arq = $d("dcArquivo").files[0], cam = $d("dcCaminho").value.trim();
    const msg = $d("dcMsg"); msg.textContent = "";
    if (!pid) { msg.textContent = "Escolha o colaborador."; return; }
    if (!arq && !cam) { msg.textContent = "Escolha um arquivo ou informe o caminho/link."; return; }
    if (arq && arq.size > 20 * 1048576) { msg.textContent = "Arquivo acima de 20 MB."; return; }
    const d = { id: "d" + Date.now().toString(36), pid, tipo: $d("dcTipo").value, feriasId: $d("dcFerias").value, titulo: $d("dcTitulo").value.trim(), data: $d("dcData").value, obs: $d("dcObs").value.trim(), criado: new Date().toISOString() };
    if (arq) { d.blob = arq; d.nome_arquivo = arq.name; d.mime = arq.type; d.tamanho = arq.size; } else d.caminho = cam;
    $d("dcSalvar").disabled = true;
    try { await dbPut(d); } catch (e) { msg.textContent = "Não foi possível salvar: " + (e.message || e); $d("dcSalvar").disabled = false; return; }
    $d("dcSalvar").disabled = false; fecharAnexo();
    if (!S.doc.pid || S.doc.pid !== pid) { S.doc.pid = pid; } $("#docBusca").value = ""; documentos();
  });
  $("#docExportar").addEventListener("click", () => {
    const linhas = [["colaborador", "empresa", "tipo", "ferias", "titulo", "arquivo_ou_caminho", "data", "observacao", "anexado_em"]];
    DOCS.forEach((d) => { const p = func(d.pid), f = D.ferias_status.find((x) => x.id === d.feriasId); linhas.push([p.funcionario, p.empresa, d.tipo, f ? rotuloFerias(f) : "geral", d.titulo, d.nome_arquivo || d.caminho || "", d.data ? br(d.data) : "", d.obs, d.criado.slice(0, 10)]); });
    const csv = "﻿" + linhas.map((l) => l.map((v) => '"' + String(v || "").replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = "documentos_ferias_" + hoje + ".csv"; a.click();
  });
  window.FXdoc = (pid) => { S.doc.pid = pid; abrir("documentos"); };

  function dobrar(r, n, rotulo) { const ps = [...r.querySelectorAll("p.txt")]; if (ps.length <= n) return; const d = el("details", "mais"); d.append(el("summary", null, rotulo || "Ler o resumo completo")); ps.slice(n).forEach((x) => d.append(x)); r.append(d); }
  function dicas() { document.querySelectorAll(".card h2 + p.hint").forEach((h) => { h.previousElementSibling.title = h.textContent; }); document.querySelectorAll("details.ajuda").forEach((d) => { let t = d.previousElementSibling; while (t && !t.classList.contains("panel-title")) t = t.previousElementSibling; if (t && !t.contains(d)) t.append(d); }); document.addEventListener("click", (e) => { document.querySelectorAll("details.ajuda[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; }); }); }
  function tudo() { badges(); visao(); prazos(); programadas(); conferir(); calendario(); datas(); marcacoesInfo(); if (S.tab === "documentos") documentos(); if (S.tab === "ficha") ficha(); }
  dicas(); tudo();
  const alvo = location.hash.slice(1);
  if (alvo && document.getElementById("tab-" + alvo)) abrir(alvo);
})();

