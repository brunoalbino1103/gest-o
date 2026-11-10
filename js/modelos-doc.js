// Documentos do DP prontos para imprimir (aviso de férias, aviso prévio, advertência, suspensão).
// Abrem numa janela nova já com os dados da empresa e do colaborador; é só imprimir e assinar.
import { fmtCNPJ } from './util.js';

const br = (s) => (s ? s.split('-').reverse().join('/') : '____/____/______');
const extenso = (iso) => { if (!iso) return '____ de ______________ de ______'; const [y, m, d] = iso.split('-'); return `${+d} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][+m - 1]} de ${y}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const MODELOS = {
  aviso_ferias: 'Aviso de férias', aviso_previo_empregador: 'Aviso prévio (dado pela empresa)', aviso_previo_empregado: 'Pedido de demissão (aviso do colaborador)',
  advertencia: 'Advertência', suspensao: 'Suspensão disciplinar',
};

export function imprimir(modelo, { empresa, func, dados = {} }) {
  const emp = `<b>${esc(empresa?.razao_social || '')}</b>${empresa?.cnpj ? ', inscrita no CNPJ ' + fmtCNPJ(empresa.cnpj) : ''}`;
  const pes = `<b>${esc(func?.nome || '')}</b>${func?.cargo ? ', ' + esc(func.cargo) : ''}${func?.ctps ? ', CTPS ' + esc(func.ctps) : ''}${func?.cpf ? ', CPF ' + esc(func.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')) : ''}`;
  const local = `${esc(empresa?.municipio || '______________')}, ${extenso(dados.data || new Date().toISOString().slice(0, 10))}.`;
  const ass = (a, b) => `<div class="ass"><div><span></span>${a}</div><div><span></span>${b}</div></div>`;
  let titulo = MODELOS[modelo], corpo = '';
  if (modelo === 'aviso_ferias') corpo = `<p>Prezado(a) ${pes},</p><p>Comunicamos que, nos termos do art. 135 da CLT, suas férias referentes ao período aquisitivo de <b>${br(dados.aquisitivoIni)}</b> a <b>${br(dados.aquisitivoFim)}</b> serão concedidas de <b>${br(dados.inicio)}</b> a <b>${br(dados.fim)}</b> (${dados.dias || 30} dias)${+dados.abono ? `, com conversão de <b>${dados.abono} dias</b> em abono pecuniário` : ''}, devendo retornar ao trabalho em <b>${br(dados.retorno)}</b>.</p><p>O pagamento das férias acrescidas de 1/3 será feito até <b>${br(dados.pagamento)}</b>.</p><p>${local}</p>${ass(esc(empresa?.razao_social || 'Empresa'), 'Ciente: ' + esc(func?.nome || 'Colaborador'))}`;
  if (modelo === 'aviso_previo_empregador') corpo = `<p>À ${pes}.</p><p>Pelo presente, ${emp} comunica que, a partir desta data, fica rescindido o seu contrato de trabalho, sendo-lhe concedido aviso prévio de <b>${dados.diasAviso || 30} dias</b>, na modalidade <b>${dados.aviso === 'trabalhado' ? 'trabalhado' : 'indenizado'}</b>${dados.aviso === 'trabalhado' ? `, com ${dados.reducao === 'dias' ? 'falta de 7 dias corridos ao final do período' : 'redução de 2 horas diárias'} (art. 488 da CLT)` : ''}.</p><p>Último dia de trabalho: <b>${br(dados.desligamento)}</b>.</p><p>${local}</p>${ass(esc(empresa?.razao_social || 'Empresa'), 'Ciente: ' + esc(func?.nome || 'Colaborador'))}`;
  if (modelo === 'aviso_previo_empregado') corpo = `<p>À ${emp}.</p><p>Eu, ${pes}, venho comunicar meu pedido de demissão do cargo que ocupo nesta empresa, ${dados.aviso === 'trabalhado' ? 'cumprindo o aviso prévio de 30 dias' : 'solicitando a dispensa do cumprimento do aviso prévio'}.</p><p>${local}</p>${ass(esc(func?.nome || 'Colaborador'), 'Recebido: ' + esc(empresa?.razao_social || 'Empresa'))}`;
  if (modelo === 'advertencia' || modelo === 'suspensao') corpo = `<p>À ${pes}.</p><p>Pela presente, ${emp} aplica a V.Sa. a penalidade de <b>${modelo === 'suspensao' ? `suspensão disciplinar de ${dados.dias || 1} dia(s), de ${br(dados.inicio)} a ${br(dados.fim)}` : 'advertência disciplinar'}</b>, em razão do seguinte fato ocorrido em ${br(dados.dataFato)}:</p><p class="caixa">${esc(dados.motivo || '').replace(/\n/g, '<br>') || '&nbsp;<br>&nbsp;'}</p><p>Esclarecemos que a reincidência poderá acarretar penalidades mais severas, nos termos do art. 482 da CLT.</p><p>${local}</p>${ass(esc(empresa?.razao_social || 'Empresa'), 'Ciente: ' + esc(func?.nome || 'Colaborador'))}<p class="obs">Se o colaborador se recusar a assinar, colher a assinatura de duas testemunhas:</p>${ass('Testemunha 1', 'Testemunha 2')}`;
  const w = window.open('', '_blank'); if (!w) { alert('Libere as janelas pop-up para imprimir.'); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} · ${esc(func?.nome || '')}</title><style>
    body{font:15px/1.7 Georgia,'Times New Roman',serif;color:#111;margin:0;padding:48px 64px;max-width:820px}
    h1{font:700 18px Arial,sans-serif;text-align:center;letter-spacing:.06em;text-transform:uppercase;margin:0 0 32px}
    .cab{font:12px Arial,sans-serif;color:#444;border-bottom:1px solid #999;padding-bottom:10px;margin-bottom:28px}
    p{text-align:justify;margin:0 0 14px}.caixa{border:1px solid #999;padding:10px;min-height:60px}.obs{font:12px Arial,sans-serif;color:#555;margin-top:28px}
    .ass{display:flex;gap:48px;margin-top:56px}.ass div{flex:1;text-align:center;font:13px Arial,sans-serif}.ass span{display:block;border-top:1px solid #111;margin-bottom:6px}
    @media print{body{padding:24px 40px}}</style></head><body><div class="cab">${esc(empresa?.razao_social || '')}${empresa?.cnpj ? ' · CNPJ ' + fmtCNPJ(empresa.cnpj) : ''}</div><h1>${esc(titulo)}</h1>${corpo}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}
