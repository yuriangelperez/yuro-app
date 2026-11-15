import type { Planificado } from './planificados';
import { fechasDelMes } from './recurrentes';
import type { Recurrente } from './store';
import type { Moneda, Movimiento } from './types';
import { diasDelMes } from './util';

export type ItemAgenda = {
  id: string; concepto: string; valor: number; moneda: Moneda; fecha: string; estado: 'pendiente' | 'cumplido';
  origen: 'plan' | 'movimiento' | 'recurrente'; plan?: Planificado; movimiento?: Movimiento; recurrenteId?: string;
};

// Lo esperado de un mes: planificados + movimientos con fecha futura + recurrentes (cada uno pendiente o cumplido). Función pura, para poder probarla.
export const calcularAgenda = ({ mes, hoy, planificados, recurrentes, delAnio }: { mes: string; hoy: string; planificados: Planificado[]; recurrentes: Recurrente[]; delAnio: Movimiento[] | undefined }): ItemAgenda[] => {
  const delMes = (delAnio ?? []).filter((m) => m.fecha.startsWith(mes));
  // Un planificado ligado a un movimiento con fecha futura ya figura como ese movimiento pendiente: no se repite como "cumplido"
  const futuros = new Set(delMes.filter((m) => m.fecha > hoy).map((m) => m.id));
  const lista: ItemAgenda[] = planificados
    .filter((p) => !(p.movimientoId && futuros.has(p.movimientoId)))
    .filter((p) => (p.estado === 'cumplido' && p.fecha.startsWith(mes)) || (p.estado === 'pendiente' && (p.fecha.startsWith(mes) || (mes === hoy.slice(0, 7) && p.fecha.slice(0, 7) < mes))))
    .map((p) => ({ id: p.id, concepto: p.concepto, valor: p.valor, moneda: p.moneda, fecha: p.fecha, estado: p.estado as 'pendiente' | 'cumplido', origen: 'plan' as const, plan: p }));
  for (const m of delMes) {
    if (m.fecha > hoy && (m.tipo === 'Ingreso' || m.tipo === 'Egreso' || m.tipo === 'Ahorro')) {
      lista.push({ id: m.id, concepto: m.concepto, valor: m.valor, moneda: m.moneda, fecha: m.fecha, estado: 'pendiente', origen: 'movimiento', movimiento: m });
    }
  }
  const mismo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const r of recurrentes) {
    if (!r.activo || r.desde > mes) continue;
    // Quincenal / semanal: una entrada por cada fecha del mes
    if ((r.frecuencia ?? 'mensual') !== 'mensual') {
      for (const f of fechasDelMes(r, mes)) {
        const real = delMes.find((m) => m.tipo === r.tipo && mismo(m.concepto, r.concepto) && m.fecha === f);
        if (real && real.fecha > hoy) continue; // ya está como programado
        const hecho = !!real || (!!r.ultimaFecha && r.ultimaFecha >= f);
        if (!hecho && lista.some((i) => i.estado === 'pendiente' && i.fecha === f && mismo(i.concepto, r.concepto))) continue; // ya figura como planificado
        lista.push({ id: `rec-${r.id}-${f}`, concepto: r.concepto, valor: r.valor, moneda: r.moneda, estado: hecho ? 'cumplido' : 'pendiente', origen: 'recurrente', recurrenteId: r.id, fecha: f });
      }
      continue;
    }
    // Si ese mes ya hay un movimiento igual (cargado a mano) la recurrente no suma otro: si ya ocurrió figura cumplida; si es futuro ya está como programado
    const real = delMes.find((m) => m.tipo === r.tipo && mismo(m.concepto, r.concepto));
    if (real && real.fecha > hoy) continue;
    if (!real && mes < hoy.slice(0, 7)) continue; // un mes pasado sin ese movimiento: no se lista
    // "Cargado" es que el movimiento exista de verdad (no una marca del recurrente: si se borró, vuelve a figurar pendiente)
    const cargado = !!real;
    if (!cargado && lista.some((i) => i.estado === 'pendiente' && mismo(i.concepto, r.concepto))) continue; // ya está como planificado: no se cuenta dos veces
    lista.push({
      id: `rec-${r.id}`, concepto: r.concepto, valor: r.valor, moneda: r.moneda, estado: cargado ? 'cumplido' : 'pendiente', origen: 'recurrente', recurrenteId: r.id,
      fecha: `${mes}-${String(Math.min(r.dia, diasDelMes(mes))).padStart(2, '0')}`,
    });
  }
  return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
};

