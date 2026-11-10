// Regras do ponto: compara as batidas de cada dia com o horário previsto da pessoa (que vem no cartão)
// e usa os totais que o próprio relógio (Secullum) calculou para horas extras, banco de horas e DSR.
export const TOL = 5;            // tolerância por marcação (CLT art. 58 §1º: até 5 min)
export const ALM_GRAVE = 54;     // almoço de 1h com 54 min ou menos é grave (TST tolera até 5 min)

export const min = (h) => { if (!h) return 0; const s = String(h).trim(); const neg = /^-/.test(s); const m = s.replace(/^[+-]/, '').match(/^(\d+):(\d{2})/); if (!m) return 0; const v = +m[1] * 60 + +m[2]; return neg ? -v : v; };
export const hm = (v) => { const s = v < 0 ? '-' : ''; v = Math.abs(Math.round(v)); return s + Math.floor(v / 60) + 'h' + String(v % 60).padStart(2, '0'); };
export const hmin = (v) => (Math.abs(v) < 60 ? Math.round(v) + ' min' : hm(v));
const hmFmt = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
// códigos do relógio com nome legível
export const STATUS_RELOGIO = { COMPENS: 'Compensado', BHORAS: 'Folga do banco de horas', FOLGA: 'Folga', DSR: 'DSR', FERIADO: 'Feriado', 'FÉRIAS': 'Férias', FERIAS: 'Férias', FALTA: 'Falta', ATESTADO: 'Atestado' };
const DIA = { Dom: 0, Seg: 1, Ter: 2, Qua: 3, Qui: 4, Sex: 5, Sáb: 6, Sab: 6 };

// analisa um cartão (de uma pessoa) e devolve os dias com as ocorrências e os totais do período
export function analisar(cartao) {
  const c = cartao.dias && !Array.isArray(cartao.dias) ? cartao.dias : { dias: cartao.dias || [], horario: {}, totais: {} };
  const hoje = new Date().toLocaleDateString('sv-SE');
  const prevDe = (d) => (c.horario || {})[DIA[d.dia] ?? new Date(d.data + 'T12:00:00').getDay()] || [];
  // horário praticado diferente do cadastrado no relógio: se a pessoa entra quase sempre deslocada (mais de 20 min),
  // mede atrasos e saídas em cima do horário que ela realmente cumpre
  const difs = (c.dias || []).filter((d) => d.bat?.length && prevDe(d).length).map((d) => min(d.bat[0]) - min(prevDe(d)[0])).sort((a, b) => a - b);
  const mediana = difs.length >= 5 ? difs[Math.floor(difs.length / 2)] : 0;
  // Relógio com banco de horas / faltas (ex.: Secullum com jornada flexível): quem chega mais tarde e compensa no dia
  // não tem débito. Então atraso e saída antecipada só contam quando o relógio lançou débito ou falta naquele dia.
  const T0 = c.totais || {};
  const usaRelogio = ['bdeb', 'bcred', 'faltas', 'btotal'].some((k) => k in T0) || (c.dias || []).some((d) => d.bdeb || d.bcred || d.faltas);
  const desloc = !usaRelogio && mediana > 20 ? mediana : 0; // sem banco: se entra sempre DEPOIS do cadastrado, mede pelo horário praticado
  const dias = (c.dias || []).map((d) => {
    const prev = prevDe(d);
    const st = (d.st || '').toUpperCase();
    const folga = !prev.length || /FOLGA|DSR|FERIADO/.test(st);
    const ferias = /F[ÉE]RIAS/.test(st);
    // qualquer código do relógio num dia sem batida (COMPENS, BHORAS, ATESTADO, LICENÇA...) é dia justificado, menos FALTA
    const atestado = !!st && !folga && !ferias && !/FALTA/.test(st);
    const oc = [];
    const b = d.bat || [];
    if (!folga && !ferias && !atestado && d.data <= hoje) {
      if (!b.length) oc.push({ t: 'falta', txt: st && /FALTA/.test(st) ? 'falta' : 'sem nenhuma batida', min: prev.length >= 2 ? min(prev[prev.length - 1]) - min(prev[0]) : 0 });
      else {
        if (b.length < prev.length || b.length % 2) oc.push({ t: 'batida', txt: `${b.length} de ${prev.length} batidas` });
        const debito = min(d.bdeb) + min(d.faltas); // o que o relógio descontou no dia
        const conta = !usaRelogio || debito > 0;
        const deb = usaRelogio && debito ? ` · débito de ${hmin(debito)} no relógio` : '';
        const atrE = min(b[0]) - min(prev[0]) - desloc; if (conta && atrE > TOL) oc.push({ t: 'atraso', txt: `entrada ${b[0]} (${desloc ? 'costuma entrar ' + hmFmt(min(prev[0]) + desloc) : 'previsto ' + prev[0]}, +${hmin(atrE)})${deb}`, min: usaRelogio ? Math.min(atrE, debito) : atrE });
        if (b.length === prev.length && b.length >= 2) {
          const sai = min(prev[prev.length - 1]) + desloc - min(b[b.length - 1]); if (conta && sai > TOL) oc.push({ t: 'saida', txt: `saída ${b[b.length - 1]} (${desloc ? 'costuma sair ' + hmFmt(min(prev[prev.length - 1]) + desloc) : 'previsto ' + prev[prev.length - 1]}, −${hmin(sai)})${deb}`, min: usaRelogio ? Math.min(sai, debito) : sai });
          if (usaRelogio && debito > 0 && !(atrE > TOL) && !(sai > TOL) && !/FALTA/.test(st)) oc.push({ t: 'debito', txt: `jornada incompleta: débito de ${hmin(debito)} no relógio`, min: debito });
          // intervalos (almoço e café): compara a duração real com a prevista
          let maior = -1, durMaior = 0;
          for (let i = 1; i + 1 < prev.length; i += 2) { const dp = min(prev[i + 1]) - min(prev[i]); if (dp > durMaior) { durMaior = dp; maior = i; } }
          for (let i = 1; i + 1 < b.length; i += 2) {
            const real = min(b[i + 1]) - min(b[i]), prevista = min(prev[i + 1]) - min(prev[i]); const almoco = i === maior;
            if (real < prevista - TOL) oc.push({ t: almoco ? 'almoco' : 'intervalo', txt: `${almoco ? 'almoço' : 'intervalo'} de ${hmin(real)} (previsto ${hmin(prevista)})`, min: prevista - real, grave: almoco && prevista >= 60 && real <= ALM_GRAVE });
            else if (real > prevista + TOL) oc.push({ t: 'volta', txt: `${almoco ? 'almoço' : 'intervalo'} de ${hmin(real)} (previsto ${hmin(prevista)}, +${hmin(real - prevista)})`, min: real - prevista });
          }
        }
      }
    }
    if (d.manual?.length) oc.push({ t: 'manual', txt: `batida lançada à mão: ${d.manual.join(', ')}` });
    return { ...d, prev, folga, ferias, atestado, oc, bcred: min(d.bcred), bdeb: min(d.bdeb), ex60: min(d.ex60), ex100: min(d.ex100), normais: min(d.normais), faltas: min(d.faltas) };
  });
  const conta = (t) => dias.reduce((s, d) => s + d.oc.filter((o) => o.t === t).length, 0);
  const soma = (t) => dias.reduce((s, d) => s + d.oc.filter((o) => o.t === t).reduce((x, o) => x + (o.min || 0), 0), 0);
  const T = c.totais || {};
  const tot = {
    atrasos: conta('atraso'), atrasoMin: soma('atraso'), saidas: conta('saida'), saidaMin: soma('saida'), almocoCurto: conta('almoco'), almocoGrave: dias.filter((d) => d.oc.some((o) => o.t === 'almoco' && o.grave)).length,
    voltas: conta('volta'), batidas: conta('batida'), faltas: conta('falta'), manuais: conta('manual'),
    normais: min(T.normais) || dias.reduce((s, d) => s + d.normais, 0), faltasHoras: min(T.faltas), ex60: min(T.ex60) || dias.reduce((s, d) => s + d.ex60, 0), ex100: min(T.ex100) || dias.reduce((s, d) => s + d.ex100, 0),
    bcred: min(T.bcred) || dias.reduce((s, d) => s + d.bcred, 0), bdeb: min(T.bdeb) || dias.reduce((s, d) => s + d.bdeb, 0), bsaldo: min(T.bsaldo), btotal: min(T.btotal), dsr: min(T.dsr), dsrdeb: min(T.dsrdeb),
    diasTrab: dias.filter((d) => d.bat?.length).length, deslocamento: desloc,
  };
  tot.irreg = tot.atrasos + tot.saidas + tot.almocoCurto + tot.batidas + tot.faltas;
  tot.classe = tot.faltas || tot.almocoGrave >= 2 || tot.irreg >= 6 ? 'recorrente' : tot.irreg >= 3 ? 'atencao' : tot.irreg ? 'pontual' : 'ok';
  return { dias, tot, horario: c.horario || {}, funcao: c.funcao };
}
export const CLASSE = { ok: ['Sem ocorrência', 'p-ok'], pontual: ['Pontual', 'p-co'], atencao: ['Atenção', 'p-at'], recorrente: ['Recorrente', 'p-bad'] };
export const TIPO_OC = { atraso: 'Atrasos na entrada', saida: 'Saídas antecipadas', debito: 'Jornada incompleta', almoco: 'Almoço / intervalo curto', intervalo: 'Almoço / intervalo curto', volta: 'Intervalo maior que o previsto', batida: 'Batidas faltando', falta: 'Faltas', manual: 'Batidas lançadas à mão' };
