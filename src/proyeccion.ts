import type { Cuenta } from './proveedores';
import type { ItemAgenda, Recurrente } from './store';
import type { Moneda } from './types';

// "Cómo quedarían tus cuentas": a cada cuenta se le suma lo que falta cobrar y se le resta lo que falta pagar (planificados,
// movimientos programados y recurrentes pendientes). Lo que no tiene cuenta asignada va aparte.

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const esReserva = (nombre: string) => /reserva/i.test(nombre);

export type Proyeccion = { porCuenta: Map<string, Partial<Record<Moneda, number>>>; sinCuenta: Partial<Record<Moneda, number>> };

// A qué cuenta pertenece un pendiente: la que tenga asignada o, si solo trae el nombre del método, la que se llame igual
export function cuentaDeItem(i: ItemAgenda, cuentas: Cuenta[], recurrentes: Recurrente[]): Cuenta | undefined {
  const porNombre = (n?: string) => (n ? cuentas.find((x) => norm(x.nombre) === norm(n)) : undefined);
  if (i.plan) return cuentas.find((x) => x.id === i.plan!.cuentaId) ?? porNombre(i.plan.metodo);
  if (i.movimiento) return cuentas.find((x) => x.id === i.movimiento!.cuentaId) ?? porNombre(i.movimiento.metodo);
  const rec = i.recurrenteId ? recurrentes.find((r) => r.id === i.recurrenteId) : undefined;
  return porNombre(rec?.metodo);
}

export function proyectar(pendientes: ItemAgenda[], cuentas: Cuenta[], recurrentes: Recurrente[]): Proyeccion {
  const porCuenta = new Map<string, Partial<Record<Moneda, number>>>();
  const sinCuenta: Partial<Record<Moneda, number>> = {};
  for (const i of pendientes) {
    const cta = cuentaDeItem(i, cuentas, recurrentes);
    const destino = cta ? (porCuenta.get(cta.id) ?? {}) : sinCuenta;
    destino[i.moneda] = Math.round(((destino[i.moneda] ?? 0) + i.valor) * 100) / 100;
    if (cta) porCuenta.set(cta.id, destino);
  }
  return { porCuenta, sinCuenta };
}

// Cuánto cambió, en el período, lo que hay apartado en reservas. Una transferencia hacia una reserva suma, una desde una reserva resta
// (entre dos reservas no cambia). Un ingreso o gasto directo en una reserva también la mueve.
import type { Movimiento } from './types';

export function detalleReservas(lista: Movimiento[], reservaIds: ReadonlySet<string>, conv: (v: number, de: Moneda) => number): { entra: number; sale: number } {
  let entra = 0;
  let sale = 0;
  for (const m of lista) {
    if (m.tipo === 'Transferencia') {
      const v = Math.abs(conv(m.valor, m.moneda));
      const haciaReserva = !!m.cuentaDestinoId && reservaIds.has(m.cuentaDestinoId);
      const desdeReserva = !!m.cuentaId && reservaIds.has(m.cuentaId);
      if (haciaReserva && !desdeReserva) entra += v;
      else if (desdeReserva && !haciaReserva) sale += v;
    } else if (m.cuentaId && reservaIds.has(m.cuentaId) && (m.tipo === 'Ingreso' || m.tipo === 'Egreso')) {
      const v = conv(m.valor, m.moneda);
      if (v >= 0) entra += v; else sale -= v;
    }
  }
  return { entra, sale };
}

export function cambioEnReservas(lista: Movimiento[], reservaIds: ReadonlySet<string>, conv: (v: number, de: Moneda) => number): number {
  const { entra, sale } = detalleReservas(lista, reservaIds, conv);
  return entra - sale;
}

// ───────── "Te quedaría" ─────────
// Plata libre = lo que hay en cuentas para gastar (efectivo, billeteras, bancos), tal cual lo cargaste. Quedan afuera las reservas (carpetas con plata
// ya apartada para pagar lo que viene) y las cuentas de ahorro o inversión (ej. Binance). Lo pendiente se cobra entero; lo pendiente de pagar se
// cubre primero con las reservas de esa moneda, y solo lo que sobra resta de lo libre. Los pagos asignados a una reserva o a una cuenta de ahorro
// no tocan lo libre. Se calcula por moneda: una moneda sin cuentas para gastar no entra (no hay de dónde restar).
const NO_LIBRES = new Set(['exchange', 'investment', 'savings']);
const paraGastar = (c: Cuenta) => c.activa && !esReserva(c.nombre) && !NO_LIBRES.has(c.tipo);

// porCobrar y porPagar son el total de lo pendiente (el mismo que ves en Planificados); cubierto es la parte de lo que hay que pagar que no sale de lo libre
// cubiertoReservas: lo pendiente que se paga con las reservas · aparte: lo pendiente que sale de cuentas de ahorro (ej. Binance) o de monedas sin cuentas para gastar
export type Quedaria = { libreHoy: number; porCobrar: number; porPagar: number; cubiertoReservas: number; aparte: number; queda: number };

export function calcularQuedaria(p: {
  cuentas: Cuenta[];
  saldos: Map<string, Partial<Record<Moneda, number>>>; // saldosPorCuenta
  ahorrado?: Partial<Record<Moneda, number>>; // ya no se usa en la cuenta; se deja por compatibilidad
  reservado: Partial<Record<Moneda, number>>; // lo que te queda en tus reservas (tarjeta "Reservas"): lo que cubre los pagos pendientes
  pendientes: ItemAgenda[];
  recurrentes: Recurrente[];
  conv: (v: number, de: Moneda) => number;
  puede: (de: Moneda) => boolean;
}): Quedaria {
  const monedas: Moneda[] = ['ARS', 'USD', 'USDT'];
  const libre: Partial<Record<Moneda, number>> = {};
  const hayLibres = new Set<Moneda>();
  const cobrar: Partial<Record<Moneda, number>> = {}; // todo lo pendiente
  const pagar: Partial<Record<Moneda, number>> = {};
  const cobrarLibre: Partial<Record<Moneda, number>> = {}; // lo que toca lo libre
  const pagarLibre: Partial<Record<Moneda, number>> = {};
  const pagarReserva: Partial<Record<Moneda, number>> = {}; // pagos asignados a una reserva (salen del fondo de reservas)
  const cobrarReserva: Partial<Record<Moneda, number>> = {};
  const netoAhorro: Partial<Record<Moneda, number>> = {}; // pagar − cobrar de lo asignado a una cuenta de ahorro (ej. Binance)
  const suma = (o: Partial<Record<Moneda, number>>, m: Moneda, v: number) => { o[m] = (o[m] ?? 0) + v; };
  // Solo la moneda habitual de cada cuenta: es lo que se carga en Efectivo y digital
  for (const x of p.cuentas.filter((q) => q.activa)) {
    const saldo = p.saldos.get(x.id)?.[x.moneda] ?? 0;
    if (paraGastar(x)) { suma(libre, x.moneda, saldo); hayLibres.add(x.moneda); } // las cuentas de reserva no son plata para gastar
  }
  // Los saldos de las cuentas son lo que cargaste como real: no se les resta el ahorro (si lo tenés guardado aparte, no está en estas cuentas)
  for (const i of p.pendientes) {
    const cta = cuentaDeItem(i, p.cuentas, p.recurrentes);
    suma(i.valor > 0 ? cobrar : pagar, i.moneda, Math.abs(i.valor));
    if (cta && !paraGastar(cta)) { // se cobra o paga en una reserva o cuenta de ahorro: no toca lo libre
      if (esReserva(cta.nombre)) suma(i.valor > 0 ? cobrarReserva : pagarReserva, i.moneda, Math.abs(i.valor));
      else suma(netoAhorro, i.moneda, i.valor > 0 ? -Math.abs(i.valor) : Math.abs(i.valor));
      continue;
    }
    suma(i.valor > 0 ? cobrarLibre : pagarLibre, i.moneda, Math.abs(i.valor));
  }

  const out: Quedaria = { libreHoy: 0, porCobrar: 0, porPagar: 0, cubiertoReservas: 0, aparte: 0, queda: 0 };
  for (const m of monedas) {
    if (!p.puede(m)) continue;
    out.porCobrar += p.conv(cobrar[m] ?? 0, m);
    out.porPagar += p.conv(pagar[m] ?? 0, m);
    if (!hayLibres.has(m)) { out.aparte += p.conv((pagar[m] ?? 0) - (cobrar[m] ?? 0), m); continue; } // sin cuentas para gastar en esta moneda
    // Las reservas pagan primero, hasta lo que te queda en ellas (la misma cuenta de la tarjeta "Reservas")
    const cubrible = (pagarLibre[m] ?? 0) + (pagarReserva[m] ?? 0);
    const cubre = Math.min(cubrible, Math.max(0, p.reservado[m] ?? 0));
    const netoPagar = cubrible - cubre;
    out.libreHoy += p.conv(libre[m] ?? 0, m);
    out.cubiertoReservas += p.conv(cubre - (cobrarReserva[m] ?? 0), m);
    out.aparte += p.conv(netoAhorro[m] ?? 0, m);
    out.queda += p.conv((libre[m] ?? 0) + (cobrarLibre[m] ?? 0) - netoPagar, m);
  }
  return out;
}
