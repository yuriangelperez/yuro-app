import type { Moneda, Movimiento } from './types';
import { norm } from './util';

// Prevención de duplicados en capas (plan maestro §9). Una misma operación puede llegar por notificación, API del
// proveedor, extracto o carga manual. De la señal más fuerte a la más débil:
//   1. external_id        → mismo id del proveedor: es la misma operación.
//   2. huella             → misma fecha + importe + moneda (igual que yuro.huella_de en la base).
//        · con concepto parecido o misma cuenta → 'exacto'; si no → 'probable' (puede ser otra compra del mismo importe).
//   3. aproximado         → mismo importe y moneda con ±1 día de diferencia (el banco acredita al día siguiente) y mismo concepto/cuenta.
// Cada movimiento existente se "gasta" una sola vez: dos cafés iguales el mismo día, con uno ya cargado, deja uno nuevo.

export type Nivel = 'external_id' | 'huella' | 'aproximado';
export type Candidato = {
  fecha: string; hora?: string | null; valor: number; moneda: Moneda; concepto: string;
  metodo?: string; cuentaId?: string | null; externalId?: string | null;
};
export type Coincidencia = { existente: Movimiento; nivel: Nivel; exacto: boolean };

// Idéntica a yuro.huella_de(fecha, valor, moneda)
export const huella = (m: Pick<Candidato, 'fecha' | 'valor' | 'moneda'>) => `${m.fecha}|${m.valor.toFixed(2)}|${m.moneda}`;

const palabras = (t: string) => new Set(norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3));

export const conceptoParecido = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)))) return true;
  const A = palabras(a);
  const B = palabras(b);
  if (!A.size || !B.size) return false;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / (A.size + B.size - comunes) >= 0.5;
};

const misma = (n: Candidato, e: Movimiento) =>
  (!!n.cuentaId && n.cuentaId === e.cuentaId) || (!!n.metodo && !!e.metodo && norm(n.metodo) === norm(e.metodo));

const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

const minutos = (h?: string | null) => (h ? +h.slice(0, 2) * 60 + +h.slice(3, 5) : null);
const distanciaHora = (a?: string | null, b?: string | null) => {
  const x = minutos(a);
  const y = minutos(b);
  return x === null || y === null ? 0 : Math.abs(x - y);
};

// Para cada candidato devuelve el movimiento ya cargado que representa (o null si es nuevo).
// Los candidatos de un mismo lote no se comparan entre sí: eso lo decide quien llama (ej. dos filas iguales de un extracto son reales).
export function buscarDuplicados(nuevos: Candidato[], existentes: Movimiento[]): (Coincidencia | null)[] {
  const res: (Coincidencia | null)[] = nuevos.map(() => null);
  const usados = new Set<string>();
  const porHuella = new Map<string, Movimiento[]>();
  const porExterno = new Map<string, Movimiento>();
  for (const e of existentes) {
    if (e.externalId) porExterno.set(e.externalId, e);
    const k = huella(e);
    porHuella.set(k, [...(porHuella.get(k) ?? []), e]);
  }
  const libre = (e: Movimiento) => !usados.has(e.id);
  const tomar = (i: number, existente: Movimiento, nivel: Nivel, exacto: boolean) => {
    usados.add(existente.id);
    res[i] = { existente, nivel, exacto };
  };

  // 1) external_id
  nuevos.forEach((n, i) => {
    const e = n.externalId ? porExterno.get(n.externalId) : undefined;
    if (e && libre(e)) tomar(i, e, 'external_id', true);
  });
  // 2) huella: primero los que además coinciden en concepto o cuenta (así un "probable" no se lleva el que le correspondía a otro)
  for (const exigente of [true, false]) {
    nuevos.forEach((n, i) => {
      if (res[i]) return;
      const cand = (porHuella.get(huella(n)) ?? []).filter(libre);
      const fuertes = cand.filter((e) => conceptoParecido(n.concepto, e.concepto) || misma(n, e));
      const pool = exigente ? fuertes : cand;
      if (!pool.length) return;
      const e = pool.sort((a, b) => distanciaHora(n.hora, a.hora) - distanciaHora(n.hora, b.hora))[0];
      tomar(i, e, 'huella', fuertes.includes(e));
    });
  }
  // 3) aproximado: ±1 día, mismo importe y moneda, y se parecen en concepto o cuenta
  nuevos.forEach((n, i) => {
    if (res[i]) return;
    const e = existentes.find((x) => libre(x) && x.moneda === n.moneda && x.valor === n.valor && x.fecha !== n.fecha && diasEntre(x.fecha, n.fecha) <= 1 && (conceptoParecido(n.concepto, x.concepto) || misma(n, x)));
    if (e) tomar(i, e, 'aproximado', false);
  });
  return res;
}
