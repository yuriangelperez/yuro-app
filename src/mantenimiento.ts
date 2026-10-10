import type { Cuenta } from './proveedores';
import type { Recurrente } from './store';
import type { Movimiento } from './types';

// Detecta datos que quedaron mal (restos de migraciones, ediciones a mano, importaciones) y dice cómo arreglarlos.
// Todo es "sugerido": la pantalla "Revisar mis datos" muestra cada cosa y el usuario toca para corregir.

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esReserva = (nombre: string) => /reserva/i.test(nombre);

// Movimientos por $0 / 0 USDT: no aportan nada (suelen venir de filas vacías de la hoja)
export const enCero = (movs: Movimiento[]) => movs.filter((m) => m.valor === 0 && m.tipo !== 'Deuda' && m.tipo !== 'Pago deuda');

// Sin cuenta: no suman en el saldo de ninguna cuenta (y, si son a futuro, no se sabe de cuál saldrían)
export const sinCuenta = (movs: Movimiento[]) =>
  movs.filter((m) => !m.cuentaId && m.valor !== 0 && ['Ingreso', 'Egreso', 'Ahorro', 'Cambio'].includes(m.tipo));

// "Cuotas cumplidas" sin total de cuotas: es un número que se corrió de columna (ej. 7,8 en lugar de cuotas)
export const cuotasRotas = (movs: Movimiento[]) => movs.filter((m) => m.cuotasCumplidas != null && !m.cuotasTotales);

// Una "transferencia" cuyo importe está en otra moneda que la cuenta de origen: en realidad es un cambio de moneda
// (ej. Mercado Pago en pesos → Binance en USDT). Como transferencia, los pesos nunca salen de la cuenta de origen.
export type CambioMalHecho = { mov: Movimiento; origen: Cuenta; destino: Cuenta; salida: number };
export function cambiosMalHechos(movs: Movimiento[], cuentas: Cuenta[]): CambioMalHecho[] {
  const out: CambioMalHecho[] = [];
  for (const m of movs) {
    if (m.tipo !== 'Transferencia' || !m.cuentaId || !m.cuentaDestinoId) continue;
    const origen = cuentas.find((x) => x.id === m.cuentaId);
    const destino = cuentas.find((x) => x.id === m.cuentaDestinoId);
    if (!origen || !destino || origen.moneda === m.moneda || destino.moneda !== m.moneda) continue;
    // Cuánto salió de la cuenta de origen, en su moneda: solo se sabe con certeza si es pesos (valorArs)
    if (origen.moneda !== 'ARS' || m.valorArs == null || !m.valorArs) continue;
    out.push({ mov: m, origen, destino, salida: Math.abs(m.valorArs) });
  }
  return out;
}

// Un recurrente de gasto con categoría "Reserva" dentro de una reserva repite todos los meses plata que solo se movió de lugar
export const recurrentesDeReserva = (recs: Recurrente[], cuentas: Cuenta[]) =>
  recs.filter((r) => r.activo && r.tipo === 'Egreso' && norm(r.categoria) === 'reserva' && cuentas.some((c) => esReserva(c.nombre) && norm(c.nombre) === norm(r.metodo)));

// Un gasto cargado en una reserva el mismo día que sacaste de esa reserva plata hacia otra cuenta (por un importe parecido):
// lo más probable es que se haya pagado desde esa otra cuenta. Si queda como está, la plata sale de la reserva dos veces.
export type PagoEnCuentaEquivocada = { egreso: Movimiento; transferencia: Movimiento; reserva: Cuenta; destino: Cuenta };
export function pagosEnCuentaEquivocada(movs: Movimiento[], cuentas: Cuenta[]): PagoEnCuentaEquivocada[] {
  const out: PagoEnCuentaEquivocada[] = [];
  const usados = new Set<string>();
  for (const t of movs) {
    if (t.tipo !== 'Transferencia' || !t.cuentaId || !t.cuentaDestinoId) continue;
    const reserva = cuentas.find((x) => x.id === t.cuentaId);
    const destino = cuentas.find((x) => x.id === t.cuentaDestinoId);
    if (!reserva || !destino || !esReserva(reserva.nombre) || esReserva(destino.nombre)) continue;
    const monto = Math.abs(t.valor);
    const e = movs.find((m) => !usados.has(m.id) && m.tipo === 'Egreso' && m.cuentaId === reserva.id && m.fecha === t.fecha && m.moneda === t.moneda && Math.abs(m.valor) <= monto && Math.abs(m.valor) >= monto * 0.9);
    if (e) { usados.add(e.id); out.push({ egreso: e, transferencia: t, reserva, destino }); }
  }
  return out;
}

// Un movimiento que vino de Mercado Pago pero está cargado en otra cuenta (ej. Naranja X): esa plata salió de Mercado Pago y se pagó desde
// la otra cuenta. Lo correcto son dos movimientos: una transferencia Mercado Pago → esa cuenta, y el pago desde esa cuenta.
export type PagoPorOtraCuenta = { mov: Movimiento; origen: Cuenta; destino: Cuenta };
export function pagosPorOtraCuenta(movs: Movimiento[], cuentas: Cuenta[]): PagoPorOtraCuenta[] {
  const principal = cuentas.find((x) => x.activa && x.proveedorId === 'mercadopago' && !esReserva(x.nombre));
  if (!principal) return [];
  const out: PagoPorOtraCuenta[] = [];
  for (const m of movs) {
    if (m.tipo !== 'Egreso' || m.origen !== 'mercadopago' || !m.cuentaId) continue;
    const destino = cuentas.find((x) => x.id === m.cuentaId);
    if (!destino || destino.proveedorId === 'mercadopago' || esReserva(destino.nombre) || destino.moneda !== m.moneda || principal.moneda !== m.moneda) continue;
    out.push({ mov: m, origen: principal, destino });
  }
  return out;
}

// Movimientos con fecha futura (programados): los que quedaron de la migración desde la hoja o de un recurrente que ya borraste.
// Cuentan en "lo que falta pagar/cobrar" de cada mes. Se agrupan por concepto para borrarlos de una vez. Los que cumplen algo planificado no entran.
export type GrupoProgramado = { clave: string; concepto: string; tipo: Movimiento['tipo']; movs: Movimiento[] };
export function programadosAFuturo(movs: Movimiento[], hoy: string, planificados: { movimientoId: string | null }[]): GrupoProgramado[] {
  const enPlan = new Set(planificados.map((p) => p.movimientoId).filter(Boolean));
  const grupos = new Map<string, GrupoProgramado>();
  for (const m of movs) {
    if (m.fecha <= hoy || enPlan.has(m.id) || !['Ingreso', 'Egreso', 'Ahorro'].includes(m.tipo)) continue;
    const clave = `${m.tipo}|${norm(m.concepto)}`;
    const g = grupos.get(clave) ?? { clave, concepto: m.concepto.trim(), tipo: m.tipo, movs: [] };
    g.movs.push(m);
    grupos.set(clave, g);
  }
  return [...grupos.values()].map((g) => ({ ...g, movs: g.movs.sort((a, b) => a.fecha.localeCompare(b.fecha)) })).sort((a, b) => b.movs.length - a.movs.length || a.concepto.localeCompare(b.concepto));
}

// ───────── Empezar de cero con este mes ─────────
// Al borrar el historial, los saldos de hoy no deben cambiar: lo que desaparece se pasa a los saldos iniciales (de cada cuenta y de cada moneda).
type PorMoneda = Partial<Record<'ARS' | 'USD' | 'USDT', number>>;
export type AjusteSaldos = {
  cuentas: { id: string; dif: number }[]; // se suma al saldo inicial de la cuenta (en su moneda habitual)
  totales: PorMoneda; // se suma al saldo inicial del año, por moneda
  ahorros: PorMoneda; // se suma al ahorro inicial del año, por moneda
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function ajustesParaConservarSaldos(p: {
  cuentas: Cuenta[];
  cuentasAntes: Map<string, PorMoneda>;
  cuentasDespues: Map<string, PorMoneda>;
  totalesAntes: { moneda: 'ARS' | 'USD' | 'USDT'; total: number; ahorrado: number }[];
  totalesDespues: { moneda: 'ARS' | 'USD' | 'USDT'; total: number; ahorrado: number }[];
}): AjusteSaldos {
  const out: AjusteSaldos = { cuentas: [], totales: {}, ahorros: {} };
  for (const c of p.cuentas) {
    const dif = r2((p.cuentasAntes.get(c.id)?.[c.moneda] ?? 0) - (p.cuentasDespues.get(c.id)?.[c.moneda] ?? 0));
    if (Math.abs(dif) >= 0.01) out.cuentas.push({ id: c.id, dif });
  }
  for (const a of p.totalesAntes) {
    const d = p.totalesDespues.find((x) => x.moneda === a.moneda);
    const dt = r2(a.total - (d?.total ?? 0));
    const da = r2(a.ahorrado - (d?.ahorrado ?? 0));
    if (Math.abs(dt) >= 0.01) out.totales[a.moneda] = dt;
    if (Math.abs(da) >= 0.01) out.ahorros[a.moneda] = da;
  }
  return out;
}

// Qué se borraría al dejar solo un mes (ym = 'YYYY-MM')
export const fueraDelMes = (movs: Movimiento[], ym: string) => movs.filter((m) => m.fecha.slice(0, 7) !== ym);

// ───────── Duplicados que deja la importación de Mercado Pago ─────────
const AUTO = new Set(['mercadopago', 'notificacion']);
const MANUAL = new Set(['manual', 'importacion']);
const minutos = (h?: string | null) => (h ? +h.slice(0, 2) * 60 + +h.slice(3, 5) : null);

// El mismo pago cargado a mano en una cuenta y traído por Mercado Pago en otra (ej. "Kaos" en Efectivo a las 10:08 y "Varios" en Mercado Pago a las 10:03).
export type DuplicadoEntreCuentas = { auto: Movimiento; manual: Movimiento };
export function duplicadosEntreCuentas(movs: Movimiento[]): DuplicadoEntreCuentas[] {
  const out: DuplicadoEntreCuentas[] = [];
  const usados = new Set<string>();
  for (const a of movs) {
    if (!AUTO.has(a.origen ?? '') || (a.tipo !== 'Ingreso' && a.tipo !== 'Egreso') || Math.abs(a.valor) < 100) continue;
    const ma = minutos(a.hora);
    const b = movs.find((m) => !usados.has(m.id) && MANUAL.has(m.origen ?? '') && m.tipo === a.tipo && m.moneda === a.moneda && m.fecha === a.fecha
      && Math.abs(m.valor - a.valor) < 0.01 && m.cuentaId !== a.cuentaId && ma !== null && minutos(m.hora) !== null && Math.abs(minutos(m.hora)! - ma) <= 30);
    if (b) { usados.add(b.id); out.push({ auto: a, manual: b }); }
  }
  return out;
}

// Lo que Mercado Pago trajo como ingreso o gasto, pero vos ya habías cargado a mano como transferencia entre tus cuentas
// (ej. sacaste plata de una reserva: figura la transferencia y, además, un "Pago" de Mercado Pago por lo mismo).
export type YaCargadoComoTransferencia = { mov: Movimiento; transferencia: Movimiento };
export function yaCargadosComoTransferencia(movs: Movimiento[]): YaCargadoComoTransferencia[] {
  const out: YaCargadoComoTransferencia[] = [];
  const usados = new Set<string>();
  for (const a of movs) {
    if (!AUTO.has(a.origen ?? '') || (a.tipo !== 'Ingreso' && a.tipo !== 'Egreso') || !a.cuentaId || Math.abs(a.valor) < 100) continue;
    const t = movs.find((m) => !usados.has(m.id) && m.tipo === 'Transferencia' && MANUAL.has(m.origen ?? '') && m.fecha === a.fecha && m.moneda === a.moneda
      && Math.abs(Math.abs(m.valor) - Math.abs(a.valor)) < 0.01 && (a.valor > 0 ? m.cuentaDestinoId === a.cuentaId : m.cuentaId === a.cuentaId));
    if (t) { usados.add(t.id); out.push({ mov: a, transferencia: t }); }
  }
  return out;
}

// Recurrentes repetidos (mismo concepto y tipo): cargan dos veces lo mismo cada mes
export function recurrentesRepetidos(recs: Recurrente[]): Recurrente[][] {
  const grupos = new Map<string, Recurrente[]>();
  for (const r of recs.filter((x) => x.activo)) {
    const k = `${r.tipo}|${norm(r.concepto)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }
  return [...grupos.values()].filter((g) => g.length > 1);
}

// Lo que vino de la hoja de cálculo (importación) en un mes: suele traer las partidas más grandes y las más difíciles de verificar
// (sueldo, comida del mes, cuotas). Se muestran de mayor a menor importe para repasarlas una por una.
export function desdeLaHoja(movs: Movimiento[], ym: string): Movimiento[] {
  return movs
    .filter((m) => m.origen === 'importacion' && m.fecha.startsWith(ym) && m.valor !== 0 && ['Ingreso', 'Egreso', 'Ahorro', 'Cambio'].includes(m.tipo))
    .sort((a, b) => Math.abs(b.valorArs ?? b.valor) - Math.abs(a.valorArs ?? a.valor));
}
