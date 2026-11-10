// Painel de Férias original (cálculos). Os dados vêm do sistema: js/ferias/carregar.js
const DADOS = window.__FERIAS_DADOS;
const CALC = [];
const dash = { calc: (id, o) => { CALC.push([id, o]); DADOS[id] = o.fn(...o.inputs.map((i) => DADOS[i])); } };
window.recalcular = () => CALC.forEach(([id, o]) => { DADOS[id] = o.fn(...o.inputs.map((i) => DADOS[i])); });
dash.calc("situacao", {
  title: "Situação de cada período",
  description: "Para cada período aquisitivo: saldo de dias, prazo até a data limite contado a partir de hoje, urgência e férias já marcadas.",
  inputs: ["periodos", "ferias"],
  fn: (periodos, ferias) => {
    const hoje = new Date().toLocaleDateString("sv-SE");
    const br = (s) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
    const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
    const mais1 = (s) => new Date(Date.parse(s) + 864e5).toISOString().slice(0, 10);
    const prazo = (d) => d < 0 ? "venceu há " + (-d) + " dias" : d < 60 ? d + " dias" : "≈ " + Math.round(d / 30.44) + " meses";
    return periodos.map((p) => {
      const completo = p.fim_aquisitivo < hoje;
      const direito = Number(p.dias_direito);
      const saldo = completo ? Math.max(0, direito - Number(p.dias_gozados) - Number(p.dias_abono)) : null;
      const progs = ferias.filter((f) => f.periodo === p.id && f.inicio > hoje).sort((a, b) => a.inicio.localeCompare(b.inicio));
      const andamento = ferias.find((f) => f.periodo === p.id && f.inicio <= hoje && (!f.fim || f.fim >= hoje));
      const ate = dias(hoje, p.limite_inicio);
      let situacao;
      if (!completo) situacao = "Em formação";
      else if (saldo === 0) situacao = "Quitado";
      else if (progs.length) situacao = "Programado";
      else if (ate < 0) situacao = "Vencido";
      else if (ate <= 90) situacao = "Urgente";
      else if (ate <= 240) situacao = "Programar";
      else situacao = "No prazo";
      const marcado = progs.reduce((s, f) => s + (Number(f.dias) || 0), 0);
      let programacao = progs.map((f) => "Sai " + br(f.inicio) + " · " + (f.dias ? f.dias + " dias" : "dias a definir")).join("; ");
      if (progs.length && progs.every((f) => f.dias) && saldo - marcado > 0) programacao += " · sobram " + (saldo - marcado);
      if (andamento) programacao = "Em férias até " + br(andamento.fim);
      return {
        id: p.id, pid: p.pid, empresa: p.empresa, funcionario: p.funcionario, setor: p.setor || "—",
        periodo: p.inicio_aquisitivo.slice(0, 4) + "/" + p.fim_aquisitivo.slice(0, 4),
        completo, direito, saldo, limite: br(p.limite_inicio), limite_iso: p.limite_inicio,
        janela_ini_iso: mais1(p.fim_aquisitivo), fim_concessivo_iso: p.fim_concessivo,
        dias_ate_limite: ate, prazo: completo ? prazo(ate) : "", situacao, programacao,
        direito_em: br(mais1(p.fim_aquisitivo)), dias_para_direito: dias(hoje, mais1(p.fim_aquisitivo)),
        inicio_aquisitivo: br(p.inicio_aquisitivo), fim_aquisitivo: br(p.fim_aquisitivo),
      };
    });
  },
});

dash.calc("ferias_status", {
  title: "Férias marcadas e em andamento",
  description: "Cada saída de férias com a situação de hoje (concluída, em andamento ou programada) e os prazos de aviso e pagamento.",
  inputs: ["ferias"],
  fn: (ferias) => {
    const hoje = new Date().toLocaleDateString("sv-SE");
    const br = (s) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
    const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
    return ferias.map((f) => {
      const status = f.fim && f.fim < hoje ? "Concluída" : f.inicio <= hoje ? "Em andamento" : (f.dias ? "Programada" : "Programada · dias a definir");
      return {
        id: f.id, pid: f.pid, empresa: f.empresa, funcionario: f.funcionario, setor: f.setor || "—", status,
        inicio: br(f.inicio), inicio_iso: f.inicio, fim_iso: f.fim, retorno: f.retorno ? br(f.retorno) : "a definir",
        dias: f.dias ? Number(f.dias) : "a definir", abono: Number(f.abono),
        aviso: f.aviso_ate ? br(f.aviso_ate) : "—", aviso_iso: f.aviso_ate, pagamento: f.pagamento_ate ? br(f.pagamento_ate) : "—", pagamento_iso: f.pagamento_ate,
        dias_para_inicio: dias(hoje, f.inicio), dias_para_aviso: f.aviso_ate ? dias(hoje, f.aviso_ate) : null,
        observacao: f.observacao, fonte: f.fonte,
      };
    });
  },
});

dash.calc("sobreposicoes", {
  title: "Férias cruzadas no mesmo setor",
  description: "Pares de pessoas do mesmo setor com férias que se cruzam, contando só as que ainda não terminaram.",
  inputs: ["ferias_status"],
  fn: (ferias_status) => {
    const hoje = new Date().toLocaleDateString("sv-SE");
    const br = (s) => s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
    const v = ferias_status.filter((f) => f.fim_iso && f.fim_iso >= hoje && f.setor !== "—");
    const out = [];
    v.forEach((a, i) => v.slice(i + 1).forEach((b) => {
      const de = a.inicio_iso > b.inicio_iso ? a.inicio_iso : b.inicio_iso;
      const ate = a.fim_iso < b.fim_iso ? a.fim_iso : b.fim_iso;
      if (a.setor === b.setor && de <= ate) out.push({
        id: a.id + "-" + b.id, setor: a.setor, empresas: [...new Set([a.empresa, b.empresa])].join(" e "),
        pessoas: a.funcionario + " e " + b.funcionario, pids: a.pid + "," + b.pid, de: br(de), ate: br(ate), de_iso: de,
        dias: Math.round((Date.parse(ate) - Date.parse(de)) / 864e5) + 1,
      });
    }));
    return out;
  },
});

dash.calc("formacao", {
  title: "Períodos em formação",
  description: "Períodos que ainda não completaram 12 meses: quando a pessoa passa a ter direito e quantos dias já acumulou.",
  inputs: ["situacao", "funcionarios"],
  fn: (situacao, funcionarios) => {
    const br = (s) => s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4);
    const h = new Date();
    const umAno = new Date(h.getFullYear() - 1, h.getMonth(), h.getDate()).toLocaleDateString("sv-SE");
    return situacao.filter((s) => !s.completo).map((s) => {
      const f = funcionarios.find((x) => x.pid === s.pid) || {};
      const d = s.dias_para_direito;
      return {
        id: s.id, pid: s.pid, empresa: s.empresa, funcionario: s.funcionario, setor: s.setor,
        admissao: f.admissao ? br(f.admissao) : "", direito_em: s.direito_em, dias_para_direito: d,
        falta_txt: d < 60 ? d + " dias" : "≈ " + Math.round(d / 30.44) + " meses",
        acumulado: s.direito, etapa: (f.admissao || "") > umAno ? "1º ano de empresa" : "Novo período",
      };
    });
  },
});

dash.calc("faltas_periodo", {
  title: "Faltas por período",
  description: "Soma das faltas sem justificativa em cada período aquisitivo e quantos dias de férias sobram pela tabela do art. 130 da CLT.",
  inputs: ["faltas", "situacao"],
  fn: (faltas, situacao) => {
    const ids = [...new Set(faltas.map((f) => f.periodo))];
    return ids.map((id) => {
      const fs = faltas.filter((f) => f.periodo === id);
      const s = situacao.find((x) => x.id === id) || {};
      const n = fs.reduce((t, f) => t + Number(f.quantidade), 0);
      const dias = n <= 5 ? 30 : n <= 14 ? 24 : n <= 23 ? 18 : n <= 32 ? 12 : 0;
      const margem = n <= 5 ? 6 - n : 0;
      return {
        id, pid: fs[0].pid, empresa: fs[0].empresa, funcionario: fs[0].funcionario, periodo: s.periodo || "",
        faltas: n, dias_ferias: dias, margem,
        margem_txt: margem ? "mais " + margem + (margem === 1 ? " falta" : " faltas") : "já reduziu",
        fontes: [...new Set(fs.map((f) => f.fonte))].join(" + "),
      };
    });
  },
});

dash.calc("alertas", {
  title: "O que pede atenção",
  description: "Avisos a entregar, períodos que precisam de data, pontos para conferir e quem está de férias, em ordem de urgência.",
  inputs: ["situacao", "ferias_status", "pendencias"],
  fn: (situacao, ferias_status, pendencias) => {
    const br = (s) => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
    const out = [];
    ferias_status.filter((f) => f.status.startsWith("Programada")).forEach((f) => {
      const d = f.dias_para_aviso;
      if (d !== null && d >= 0) out.push({ id: "av-" + f.id, empresa: f.empresa, pid: f.pid, nivel: d <= 14 ? 1 : d <= 45 ? 2 : 3,
        titulo: "Entregar o aviso de férias de " + f.funcionario,
        detalhe: "Sai em " + f.inicio + (typeof f.dias === "number" ? " por " + f.dias + " dias" : ", dias a definir") + ". Pagamento até " + f.pagamento + ".",
        quando: "até " + f.aviso, ordem: f.aviso_iso, tela: "programadas" });
      else if (f.pagamento_iso) out.push({ id: "pg-" + f.id, empresa: f.empresa, pid: f.pid, nivel: 1,
        titulo: "Pagar as férias de " + f.funcionario, detalhe: "Sai em " + f.inicio + ".", quando: "até " + f.pagamento, ordem: f.pagamento_iso, tela: "programadas" });
    });
    situacao.filter((s) => ["Vencido", "Urgente", "Programar"].includes(s.situacao)).forEach((s) => out.push({
      id: "pz-" + s.id, empresa: s.empresa, pid: s.pid, nivel: s.situacao === "Programar" ? 2 : 1,
      titulo: "Marcar as férias de " + s.funcionario,
      detalhe: s.saldo + " dias para tirar · " + s.setor + ". Faltam " + s.prazo + " para o limite.",
      quando: "começar até " + s.limite, ordem: s.limite_iso, tela: "prazos" }));
    const peso = { Alta: 1, "Média": 2, Baixa: 3 };
    pendencias.forEach((p) => out.push({ id: "cf-" + p.id, empresa: p.empresa, pid: (p.pids || "").split(",")[0], nivel: peso[p.prioridade] || 3,
      titulo: p.assunto + (p.funcionario ? " · " + p.funcionario : ""), detalhe: "Conferir com: " + p.com_quem + ".",
      quando: "prioridade " + p.prioridade.toLowerCase(), ordem: "9999-" + p.id, tela: "conferir" }));
    ferias_status.filter((f) => f.status === "Em andamento").forEach((f) => out.push({
      id: "em-" + f.id, empresa: f.empresa, pid: f.pid, nivel: 4, titulo: f.funcionario + " está de férias",
      detalhe: "Saiu em " + f.inicio + " · " + f.setor + ".", quando: "volta " + f.retorno, ordem: f.fim_iso || "", tela: "programadas" }));
    return out.sort((a, b) => a.nivel - b.nivel || a.ordem.localeCompare(b.ordem));
  },
});

dash.calc("resumo", {
  title: "Resumo por empresa",
  description: "Contagens da visão geral para todos os clientes juntos e para cada um: férias em andamento e marcadas, períodos sem data, prazos e pendências.",
  inputs: ["situacao", "ferias_status", "pendencias", "alertas", "funcionarios"],
  fn: (situacao, ferias_status, pendencias, alertas, funcionarios) => {
    return ["Todas", ...window.__FERIAS_EMPRESAS].map((empresa) => {
      const de = (r) => empresa === "Todas" || r.empresa === empresa || r.empresa === "Todas";
      const s = situacao.filter(de), f = ferias_status.filter(de);
      const semData = s.filter((x) => ["Vencido", "Urgente", "Programar", "No prazo"].includes(x.situacao))
        .sort((a, b) => a.limite_iso.localeCompare(b.limite_iso));
      return {
        empresa, funcionarios: funcionarios.filter(de).length,
        em_ferias: f.filter((x) => x.status === "Em andamento").length,
        marcadas: f.filter((x) => x.status.startsWith("Programada")).length,
        sem_data: semData.length,
        a_marcar: semData.filter((x) => x.situacao !== "No prazo").length,
        vencidos: semData.filter((x) => x.situacao === "Vencido").length,
        completam_90: s.filter((x) => !x.completo && x.dias_para_direito <= 90).length,
        pendencias: pendencias.filter(de).length,
        alertas_altos: alertas.filter((a) => de(a) && a.nivel === 1).length,
        proximo_nome: semData[0] ? semData[0].funcionario : "—",
        proximo_limite: semData[0] ? semData[0].limite : "—",
        proximo_prazo: semData[0] ? "faltam " + semData[0].prazo : "—",
      };
    });
  },
});

