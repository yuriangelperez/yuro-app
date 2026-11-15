import { conceptoParecido } from './dedupe';
import type { Moneda, Movimiento } from './types';

// Movimiento esperado que todavía no ocurrió. No entra en saldos ni estadísticas: vive aparte hasta que llega el real.
export type Planificado = {
  id: string;
  fecha: string; // cuándo se espera (YYYY-MM-DD)
  concepto: string;
  valor: number; // con signo: ingresos +, egresos −
  moneda: Moneda;
  tipo: 'Ingreso' | 'Egreso' | 'Ahorro';
  metodo: string;
  cuentaId: string | null;
  categoria: string;
  categoria2: string;
  estado: 'pendiente' | 'cumplido' | 'cancelado';
  movimientoId: string | null; // el movimiento real que lo cumplió
};

const DIA = 86400000;
const ANTES = 3; // días de margen antes de la fecha esperada
const DESPUES = 10; // y después (el sueldo suele llegar con atraso)

// Para cada planificado pendiente, el movimiento real que lo cumple (o nada). Un movimiento cumple a uno solo.
// - mismo tipo (ingreso/egreso), moneda y dentro de la ventana de fechas
// - importe igual o casi igual (hasta 1%: ej. esperabas 13.450 y entraron 13.500), o parecido (hasta 10%) si además el concepto se parece
// Gana el más cercano a la fecha esperada.
export function emparejar(pendientes: Planificado[], movimientos: Movimiento[]): { plan: Planificado; mov: Movimiento }[] {
  const usados = new Set<string>();
  const out: { plan: Planificado; mov: Movimiento }[] = [];
  for (const p of [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const t = Date.parse(p.fecha);
    const candidatos = movimientos
      .filter((m) => !usados.has(m.id) && m.tipo === p.tipo && m.moneda === p.moneda && Math.sign(m.valor) === Math.sign(p.valor))
      .map((m) => ({ m, dias: (Date.parse(m.fecha) - t) / DIA }))
      .filter(({ m, dias }) => {
        if (dias < -ANTES || dias > DESPUES) return false;
        const dif = Math.abs(Math.abs(m.valor) - Math.abs(p.valor));
        return dif < 0.005 || dif <= Math.abs(p.valor) * 0.01 || (dif <= Math.abs(p.valor) * 0.1 && conceptoParecido(m.concepto, p.concepto));
      })
      .sort((a, b) => Math.abs(a.dias) - Math.abs(b.dias));
    if (candidatos[0]) {
      usados.add(candidatos[0].m.id);
      out.push({ plan: p, mov: candidatos[0].m });
    }
  }
  return out;
}

// Posibles cumplimientos que no son lo bastante seguros como para marcarlos solos: mismo tipo, moneda y ventana de fechas, pero el importe
// difiere hasta un 25% y el concepto no se parece. Se muestran para que el usuario confirme. Un movimiento se ofrece a un solo planificado.
export function sugerirEmparejamientos(pendientes: Planificado[], movimientos: Movimiento[]): { plan: Planificado; mov: Movimiento }[] {
  const yaAuto = new Set(emparejar(pendientes, movimientos).flatMap((x) => [x.plan.id, x.mov.id]));
  const usados = new Set<string>();
  const out: { plan: Planificado; mov: Movimiento }[] = [];
  for (const p of [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (yaAuto.has(p.id)) continue;
    const t = Date.parse(p.fecha);
    const mejor = movimientos
      .filter((m) => !yaAuto.has(m.id) && !usados.has(m.id) && m.tipo === p.tipo && m.moneda === p.moneda && Math.sign(m.valor) === Math.sign(p.valor))
      .map((m) => ({ m, dias: (Date.parse(m.fecha) - t) / DIA, dif: Math.abs(Math.abs(m.valor) - Math.abs(p.valor)) }))
      .filter(({ dias, dif }) => dias >= -ANTES && dias <= DESPUES && dif <= Math.abs(p.valor) * 0.25)
      .sort((a, b) => a.dif - b.dif || Math.abs(a.dias) - Math.abs(b.dias))[0];
    if (mejor) { usados.add(mejor.m.id); out.push({ plan: p, mov: mejor.m }); }
  }
  return out;
}
