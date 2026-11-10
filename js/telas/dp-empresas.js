// Cadastro de cada empresa no Departamento Pessoal: porte, atividade, convenção coletiva e regras do DP.
import db from '../db.js';
import { esc, dataBR, brl, aviso, modal, REGIMES } from '../util.js';
import { S, recarregarClientes } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { PORTES, ATIVIDADES, empresasDP, nomeEmp } from './dp-comum.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export default async function dpEmpresas(el, _r, vivo) {
  const [cfgs, funcs] = await Promise.all([db.dpEmpresas(), db.funcionarios()]); if (!vivo()) return;
  const cfg = new Map(cfgs.map((c) => [c.cliente_id, c]));
  const lista = empresasDP().filter((c) => !S.empresa || c.id === S.empresa);
  const nFunc = (id) => funcs.filter((f) => f.cliente_id === id && f.situacao !== 'desligado').length;
  topo('Empresas', 'Cada empresa tem o seu cadastro no DP: porte, atividade e convenção coletiva. As regras daqui (piso, horas extras, VR/VT) valem para os colaboradores dela.');
  const hoje = new Date().toLocaleDateString('sv-SE');
  el.innerHTML = `<div class="card"><div class="tw"><table class="t"><thead><tr><th>Empresa</th><th>Porte · atividade</th><th>Convenção coletiva</th><th>Piso</th><th>Jornada</th><th>VR / VT por dia</th><th class="r">Colaboradores</th><th></th></tr></thead><tbody>
    ${lista.map((c) => { const d = cfg.get(c.id) || {}; const venc = d.cct_vigencia_fim && d.cct_vigencia_fim < hoje;
      return `<tr class="lk" data-emp="${c.id}"><td><b>${esc(nomeEmp(c))}</b><div class="small muted">${c.codigo ? 'cód. ' + esc(c.codigo) + ' · ' : ''}${REGIMES[c.regime]}</div></td>
      <td>${c.porte ? PORTES[c.porte] : '<span class="pill p-at">definir</span>'}<div class="small muted">${c.atividade ? ATIVIDADES[c.atividade] : ''}</div></td>
      <td>${d.sindicato ? esc(d.sindicato) : '<span class="pill p-at">sem convenção cadastrada</span>'}${d.cct_vigencia_fim ? `<div class="small ${venc ? '' : 'muted'}" style="${venc ? 'color:var(--bad)' : ''}">vigência até ${dataBR(d.cct_vigencia_fim)}${venc ? ' · vencida' : ''}${d.data_base_mes ? ' · data-base ' + MESES[d.data_base_mes - 1] : ''}</div>` : ''}</td>
      <td class="num">${d.piso_salarial ? brl(d.piso_salarial) : '—'}</td>
      <td>${d.jornada_semanal ? d.jornada_semanal + 'h semanais' : '—'}</td>
      <td class="num">${d.vr_dia || d.vt_dia ? `${brl(d.vr_dia || 0)} / ${brl(d.vt_dia || 0)}` : '—'}</td>
      <td class="r num">${nFunc(c.id)}</td><td><button class="btn sec mini">Editar</button></td></tr>`; }).join('') || '<tr><td colspan="8"><div class="vazio">Nenhuma empresa. Cadastre as empresas em Cadastros › Empresas.</div></td></tr>'}
    </tbody></table></div></div>`;
  el.querySelector('tbody').addEventListener('click', async (e) => { const r = e.target.closest('[data-emp]'); if (!r) return; const c = S.clientes.find((x) => x.id === r.dataset.emp); if (await form(c, cfg.get(c.id) || { cliente_id: c.id })) recarregarTela(); });
}

function form(c, d) {
  const v = (k) => esc(d[k] ?? '');
  return modal('DP · ' + nomeEmp(c), `<form class="form" id="fDpE">
    <p class="full small muted mt0">${esc(c.razao_social)}</p>
    <label class="f">Código no sistema da folha<input name="codigo" value="${esc(c.codigo || '')}" placeholder="Ex.: 242"></label>
    <label class="f">Porte<select name="porte"><option value="">—</option>${Object.entries(PORTES).map(([k, t]) => `<option value="${k}" ${c.porte === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Atividade<select name="atividade"><option value="">—</option>${Object.entries(ATIVIDADES).map(([k, t]) => `<option value="${k}" ${c.atividade === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="chk" style="align-self:end;padding-bottom:8px"><input type="checkbox" name="tem_funcionarios" ${c.tem_funcionarios ? 'checked' : ''}> Tem funcionários</label>
    <fieldset class="full" style="border:1px solid var(--line);border-radius:10px;padding:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px"><legend class="small" style="padding:0 6px;font-weight:600">Convenção coletiva</legend>
      <label class="f" style="grid-column:1/-1">Sindicato<input name="sindicato" value="${v('sindicato')}" placeholder="Ex.: Sindicato dos Comerciários de ..."></label>
      <label class="f">Registro no MTE<input name="cct_registro" value="${v('cct_registro')}" placeholder="Ex.: SP001234/2026"></label>
      <label class="f">Data-base<select name="data_base_mes"><option value="">—</option>${MESES.map((m, i) => `<option value="${i + 1}" ${+d.data_base_mes === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="f">Vigência: início<input type="date" name="cct_vigencia_ini" value="${v('cct_vigencia_ini')}"></label>
      <label class="f">Vigência: fim<input type="date" name="cct_vigencia_fim" value="${v('cct_vigencia_fim')}"></label>
      <label class="f">Piso salarial (R$)<input type="number" step="0.01" name="piso_salarial" value="${v('piso_salarial')}"></label>
      <label class="f">Contribuição assistencial<input name="contribuicao_assistencial" value="${v('contribuicao_assistencial')}" placeholder="Ex.: 1% do salário"></label>
    </fieldset>
    <label class="f">Jornada semanal (horas)<input type="number" name="jornada_semanal" value="${v('jornada_semanal') || 44}"></label>
    <label class="f">Horário padrão<input name="horario_padrao" value="${v('horario_padrao')}" placeholder="Ex.: Seg a sex 08:00-18:00"></label>
    <label class="f">Hora extra em dia útil (%)<input type="number" name="he_dia_util" value="${v('he_dia_util') || 50}"></label>
    <label class="f">Hora extra em domingo/feriado (%)<input type="number" name="he_domingo" value="${v('he_domingo') || 100}"></label>
    <label class="f">Adicional noturno (%)<input type="number" name="adicional_noturno" value="${v('adicional_noturno') || 20}"></label>
    <span></span>
    <label class="f">VR / VA por dia (R$)<input type="number" step="0.01" name="vr_dia" value="${v('vr_dia')}"></label>
    <label class="f">VT por dia (R$)<input type="number" step="0.01" name="vt_dia" value="${v('vt_dia')}"></label>
    <label class="f full">Observações (regras da convenção que importam no dia a dia)<textarea name="observacoes" style="min-height:70px">${v('observacoes')}</textarea></label>
    <p class="full small" id="dpErro" style="color:var(--bad)"></p>
    <div class="acoes full" style="margin-top:0"><button type="button" class="btn sec" data-fecha>Cancelar</button><button class="btn">Salvar</button></div></form>`, { largura: 760, aoAbrir: (m, fechar) => {
    const f = m.querySelector('#fDpE');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const x = Object.fromEntries(new FormData(f));
      const num = (k) => (x[k] === '' || x[k] == null ? null : +x[k]);
      try {
        await db.salvarCliente({ id: c.id, codigo: x.codigo || null, porte: x.porte || null, atividade: x.atividade || null, tem_funcionarios: f.tem_funcionarios.checked });
        await db.salvarDpEmpresa({ cliente_id: c.id, sindicato: x.sindicato || null, cct_registro: x.cct_registro || null, data_base_mes: num('data_base_mes'), cct_vigencia_ini: x.cct_vigencia_ini || null, cct_vigencia_fim: x.cct_vigencia_fim || null,
          piso_salarial: num('piso_salarial'), contribuicao_assistencial: x.contribuicao_assistencial || null, jornada_semanal: num('jornada_semanal'), horario_padrao: x.horario_padrao || null,
          he_dia_util: num('he_dia_util'), he_domingo: num('he_domingo'), adicional_noturno: num('adicional_noturno'), vr_dia: num('vr_dia'), vt_dia: num('vt_dia'), observacoes: x.observacoes || null });
        await recarregarClientes(); await db.registrar('Editou cadastro DP da empresa', nomeEmp(c), c.id); aviso('Cadastro do DP salvo.'); fechar(true);
      } catch (er) { m.querySelector('#dpErro').textContent = er.message; }
    });
  } });
}
