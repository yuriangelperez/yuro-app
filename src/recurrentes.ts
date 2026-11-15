import { diasDelMes, norm } from './util';

// Frecuencias de un recurrente: una vez al mes (día fijo), dos veces al mes (el día y 15 días después) o cada semana (un día de la semana).

export type Frecuencia = 'mensual' | 'quincenal' | 'semanal';
export type Regla = { frecuencia?: Frecuencia; dia: number; diaSemana?: number | null; inicio?: string | null };

export const FRECUENCIAS: { f: Frecuencia; label: string }[] = [
  { f: 'mensual', label: 'Cada mes' },
  { f: 'quincenal', label: 'Cada quincena' },
  { f: 'semanal', label: 'Cada semana' },
];
export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DIAS_SEMANA_CORTO = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const p2 = (n: number) => String(n).padStart(2, '0');
const diaSemanaDe = (ymd: string) => new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))).getUTCDay();

// Los días (YYYY-MM-DD) en que cae el recurrente dentro de un mes, de menor a mayor. Respeta la fecha de inicio.
export function fechasDelMes(r: Regla, ym: string): string[] {
  const dim = diasDelMes(ym);
  const frec = r.frecuencia ?? 'mensual';
  let dias: number[];
  if (frec === 'semanal') {
    dias = [];
    for (let d = 1; d <= dim; d++) if (diaSemanaDe(`${ym}-${p2(d)}`) === (r.diaSemana ?? 1)) dias.push(d);
  } else if (frec === 'quincenal') {
    const otro = r.dia <= 15 ? r.dia + 15 : r.dia - 15;
    dias = [...new Set([Math.min(r.dia, dim), Math.min(otro, dim)])].sort((a, b) => a - b);
  } else dias = [Math.min(r.dia, dim)];
  const fechas = dias.map((d) => `${ym}-${p2(d)}`);
  return r.inicio ? fechas.filter((f) => f >= r.inicio!) : fechas;
}

// Cuántas veces cae por mes en promedio (para pasar un monto "por vez" a "por mes")
export const vecesPorMes = (r: Regla) => ((r.frecuencia ?? 'mensual') === 'semanal' ? 52 / 12 : (r.frecuencia ?? 'mensual') === 'quincenal' ? 2 : 1);

export function descripcion(r: Regla): string {
  const frec = r.frecuencia ?? 'mensual';
  if (frec === 'semanal') return `Todos los ${DIAS_SEMANA[r.diaSemana ?? 1].toLowerCase()}`;
  if (frec === 'quincenal') {
    const otro = r.dia <= 15 ? r.dia + 15 : r.dia - 15;
    return `Días ${Math.min(r.dia, otro)} y ${Math.max(r.dia, otro)} de cada mes`;
  }
  return `Día ${r.dia} de cada mes`;
}

// La próxima fecha (desde `desde` inclusive) que todavía no se cargó
export function proxima(r: Regla, desde: string, ultimaFecha?: string | null): string | null {
  let ym = desde.slice(0, 7);
  for (let i = 0; i < 3; i++) {
    const f = fechasDelMes(r, ym).find((x) => x >= desde && (!ultimaFecha || x > ultimaFecha));
    if (f) return f;
    const y = +ym.slice(0, 4) + (+ym.slice(5, 7) === 12 ? 1 : 0);
    const m = +ym.slice(5, 7) === 12 ? 1 : +ym.slice(5, 7) + 1;
    ym = `${y}-${p2(m)}`;
  }
  return null;
}

// ¿Ya hay un movimiento real de este recurrente en esos movimientos (mismo tipo y concepto)? Es lo que significa "cargado": que exista de verdad,
// no una marca en el recurrente (si borrás los movimientos, la marca quedaba y el recurrente figuraba cargado sin estarlo).
export const tieneMovimiento = (r: { tipo: string; concepto: string }, movs: { tipo: string; concepto: string }[]) => movs.some((m) => m.tipo === r.tipo && norm(m.concepto) === norm(r.concepto));

// Un recurrente mensual activo cuyo día ya llegó este mes y todavía no tiene su movimiento
export const faltaCargar = (r: Regla & { activo: boolean; tipo: string; concepto: string }, movsDelMes: { tipo: string; concepto: string }[], hoy: string) =>
  r.activo && (r.frecuencia ?? 'mensual') === 'mensual' && Math.min(r.dia, diasDelMes(hoy.slice(0, 7))) <= +hoy.slice(8) && !tieneMovimiento(r, movsDelMes);
