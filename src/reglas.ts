import type { Movimiento } from './types';
import { norm } from './util';

// Reglas por palabra: si el concepto contiene `patron`, el movimiento va a esa categoría. Instantáneas, sin IA ni internet.
export type Regla = { id: string; patron: string; categoria: string; categoria2: string };

// Gana la regla con la palabra más larga (la más específica: "uber eats" antes que "uber")
export const buscarRegla = (reglas: Regla[], concepto: string): Regla | null => {
  const c = norm(concepto);
  let mejor: Regla | null = null;
  for (const r of reglas) {
    const p = norm(r.patron);
    if (p && c.includes(p) && (!mejor || p.length > norm(mejor.patron).length)) mejor = r;
  }
  return mejor;
};

// Movimientos ya ocurridos, sin categoría, que alguna regla clasificaría
export const aplicables = (reglas: Regla[], movs: Movimiento[], desde: string, hoy: string) =>
  movs.flatMap((m) => {
    if ((m.tipo !== 'Ingreso' && m.tipo !== 'Egreso') || m.categoria || m.fecha < desde || m.fecha > hoy) return [];
    const regla = buscarRegla(reglas, m.concepto);
    return regla ? [{ m, regla }] : [];
  });
