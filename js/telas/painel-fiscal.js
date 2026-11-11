// Painel Fiscal original, dentro do sistema, para a empresa escolhida no topo.
import { moldura } from './moldura.js';
import { S, mudarEmpresa } from '../estado.js';
import { topo, recarregarTela } from '../app.js';
import { escolhaEmpresa, nomeEmp } from './dp-comum.js';

export default async function painelFiscal(el, [cid]) {
  if (cid && S.clientes.some((c) => c.id === cid) && S.empresa !== cid) { mudarEmpresa(cid); return recarregarTela(); }
  const emp = S.clientes.find((c) => c.id === S.empresa);
  topo('Painel Fiscal', emp ? `${nomeEmp(emp)} · notas importadas dos XML` : 'Escolha a empresa');
  if (!emp) { el.innerHTML = escolhaEmpresa('De qual empresa?', S.clientes.filter((c) => c.ativo), 'fiscal'); return; }
  moldura(el, `fiscal.html?cliente=${emp.id}&embed=1`, 'Painel Fiscal');
}
