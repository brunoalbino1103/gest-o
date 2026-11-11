// Painel de Férias original, dentro do Departamento Pessoal (empresa escolhida no topo ou todas).
import { moldura } from './moldura.js';
import { S } from '../estado.js';
import { topo } from '../app.js';
import { nomeEmp } from './dp-comum.js';

export default async function feriasDP(el) {
  const emp = S.clientes.find((c) => c.id === S.empresa);
  topo('Férias', `${emp ? nomeEmp(emp) : 'Todas as empresas'} · prazos, calendário, agenda, marcações e documentos`);
  moldura(el, `ferias.html?embed=1${emp ? '&cliente=' + emp.id : ''}`, 'Painel de Férias');
}
