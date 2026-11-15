import type { Moneda, Movimiento } from './types';
import { diasDelMes, sumaMes } from './util';

// Una compra en cuotas. En la hoja cada mes se carga una fila con "cuota N de M" (columnas H e I);
// las filas de una misma compra se agrupan por concepto + cantidad de cuotas + moneda.
export type Plan = {
  clave: string;
  ultima: Movimiento; // última fila cargada hasta el mes que se mira
  cuota: number; // monto de cada cuota (positivo, en su moneda)
  moneda: Moneda;
  totales: number;
  pagadas: number; // cuotas pagadas al mes que se mira (incluye las que faltan cargar)
  restantes: number;
  deuda: number; // restantes × cuota
  finYm: string; // mes de la última cuota
  porCargar: number | null; // número de cuota que corresponde a este mes y todavía no se cargó
};

const ymDe = (f: string) => f.slice(0, 7);
const mesesEntre = (a: string, b: string) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5) - +a.slice(5));
const clave = (m: Movimiento) => `${m.concepto.trim().toLowerCase()}|${m.cuotasTotales}|${m.moneda}`;

export const calcularCuotas = (todos: Movimiento[], ym: string) => {
  const grupos = new Map<string, Movimiento[]>();
  for (const m of todos) {
    if (!m.cuotasTotales || m.cuotasTotales < 1 || ymDe(m.fecha) > ym) continue;
    const k = clave(m);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(m);
  }

  const planes: Plan[] = [];
  for (const [k, filas] of grupos) {
    filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.cuotasCumplidas ?? 0) - (b.cuotasCumplidas ?? 0));
    const ultima = filas[filas.length - 1];
    const totales = ultima.cuotasTotales!;
    // Si la columna "cumplidas" está vacía se cuenta cuántas filas hay cargadas
    const cargadas = Math.min(totales, ultima.cuotasCumplidas ?? filas.length);
    const atraso = mesesEntre(ymDe(ultima.fecha), ym); // meses desde la última cuota cargada
    const pagadas = Math.min(totales, cargadas + atraso);
    const porCargar = atraso > 0 && cargadas < totales ? pagadas : null;
    // Una compra ya terminada antes de este mes no interesa
    if (cargadas >= totales && atraso > 0) continue;
    const cuota = Math.abs(ultima.valor);
    const restantes = totales - pagadas;
    planes.push({ clave: k, ultima, cuota, moneda: ultima.moneda, totales, pagadas, restantes, deuda: restantes * cuota, finYm: sumaMes(ym, restantes), porCargar });
  }

  return {
    planes,
    delMes: planes.filter((p) => p.porCargar === null && ymDe(p.ultima.fecha) === ym), // ya cargadas este mes
    porCargar: planes.filter((p) => p.porCargar !== null),
    activas: planes.filter((p) => p.restantes > 0).sort((a, b) => b.deuda - a.deuda),
    terminan: planes.filter((p) => p.restantes === 0), // pagás la última este mes
  };
};

// Fila para cargar la cuota de este mes, copiando la última (mismo día, o el último del mes si no existe).
export const siguienteCuota = (p: Plan, ym: string): Omit<Movimiento, 'id'> => {
  const { id: _, ...base } = p.ultima;
  const dia = Math.min(+p.ultima.fecha.slice(8), diasDelMes(ym));
  return { ...base, fecha: `${ym}-${String(dia).padStart(2, '0')}`, cuotasCumplidas: p.porCargar };
};

// Cuánto vas a pagar de cuotas en cada uno de los próximos `n` meses (sin contar el actual).
export const proyeccion = (planes: Plan[], ym: string, n: number, conv: (v: number, de: Moneda) => number) =>
  Array.from({ length: n }, (_, i) => {
    const mes = sumaMes(ym, i + 1);
    const pagos = planes.filter((p) => p.restantes > i);
    return { ym: mes, total: pagos.reduce((a, p) => a + conv(p.cuota, p.moneda), 0), terminan: planes.filter((p) => p.restantes === i + 1) };
  });
