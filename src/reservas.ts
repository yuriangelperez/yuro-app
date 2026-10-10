import type { Cuenta } from './proveedores';
import type { Moneda, Movimiento } from './types';
import { norm } from './util';

// Reserva (sobre): plata apartada dentro de una cuenta para un fin. No es un movimiento ni cambia el saldo: solo marca
// cuánto de lo que tenés ya está comprometido. Los gastos reales (que siguen siendo gastos normales) la van descontando.
export type Reserva = {
  id: string;
  nombre: string;
  monto: number; // lo apartado
  moneda: Moneda;
  cuentaId: string | null; // dónde está la plata
  categoria: string; // los gastos de esta categoría descuentan la reserva
  patron: string; // ...y/o los que tengan esta palabra en el concepto (ej. "sube")
  mensual: boolean; // se repone cada mes (si no, se va gastando hasta agotarse)
  desde: string; // los gastos anteriores a esta fecha no la descuentan
  activa: boolean;
};

export type EstadoReserva = { reserva: Reserva; gastos: Movimiento[]; gastado: number; queda: number };

const enCuenta = (r: Reserva, m: Movimiento, cuentas: Cuenta[]) => {
  if (!r.cuentaId) return true;
  if (m.cuentaId) return m.cuentaId === r.cuentaId;
  const nombre = cuentas.find((x) => x.id === r.cuentaId)?.nombre;
  return !!nombre && norm(nombre) === norm(m.metodo);
};

const coincidePatron = (r: Reserva, m: Movimiento) => !!r.patron.trim() && norm(m.concepto).includes(norm(r.patron));
const coincideCategoria = (r: Reserva, m: Movimiento) => !!r.categoria && norm(m.categoria) === norm(r.categoria);

// Cuánto queda de cada reserva. Un gasto descuenta una sola reserva: primero la que lo nombra por palabra ("sube"),
// después la de su categoría; entre varias, la primera de la lista.
//
// Carpeta: una reserva ligada a una cuenta de reserva (ej. "MP - Reserva - Gastos") y sin categoría ni palabra propias descuenta todo lo que
// sale de esa cuenta: los gastos pagados desde ahí y la plata que sacaste hacia otra cuenta (una transferencia).
const esCarpeta = (r: Reserva, cuentas: Cuenta[]) => !r.categoria && !r.patron.trim() && !!r.cuentaId && /reserva/i.test(cuentas.find((x) => x.id === r.cuentaId)?.nombre ?? '');

export function estadosReservas(reservas: Reserva[], movs: Movimiento[], cuentas: Cuenta[], hoy: string): EstadoReserva[] {
  const activas = reservas.filter((r) => r.activa);
  const gastos = new Map<string, Movimiento[]>(activas.map((r) => [r.id, []]));
  const ym = hoy.slice(0, 7);
  for (const m of movs) {
    if (m.fecha > hoy) continue;
    if (m.tipo === 'Transferencia') {
      // plata que salió de una carpeta hacia otra cuenta
      const carpeta = activas.find((r) => esCarpeta(r, cuentas) && r.cuentaId === m.cuentaId && r.moneda === m.moneda && m.fecha >= r.desde && (!r.mensual || m.fecha.startsWith(ym)) && m.cuentaDestinoId !== r.cuentaId);
      if (carpeta) gastos.get(carpeta.id)!.push(m);
      continue;
    }
    if (m.tipo !== 'Egreso') continue;
    const posibles = activas.filter((r) => r.moneda === m.moneda && m.fecha >= r.desde && (!r.mensual || m.fecha.startsWith(ym)) && enCuenta(r, m, cuentas));
    const dueña = posibles.find((r) => coincidePatron(r, m)) ?? posibles.find((r) => coincideCategoria(r, m)) ?? posibles.find((r) => esCarpeta(r, cuentas) && r.cuentaId === m.cuentaId);
    if (dueña) gastos.get(dueña.id)!.push(m);
  }
  return activas.map((reserva) => {
    const lista = (gastos.get(reserva.id) ?? []).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const gastado = Math.round(lista.reduce((a, m) => a + Math.abs(m.valor), 0) * 100) / 100;
    return { reserva, gastos: lista, gastado, queda: Math.round((reserva.monto - gastado) * 100) / 100 };
  });
}
