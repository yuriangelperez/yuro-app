import type { Movimiento } from './types';

// Detecta transferencias entre cuentas propias que quedaron cargadas como un gasto en una cuenta y un ingreso en otra
// (ej. la notificación de "Enviaste $200.000" de Mercado Pago + la de "Recibiste $200.000" de Naranja X).
// Contadas así inflan ingresos y gastos: Yuro lo propone como una sola Transferencia y el usuario confirma.

// comision: lo que se quedó el banco en el camino (sale más de lo que llega); 0 si los importes son idénticos
export type ParTransferencia = { clave: string; egreso: Movimiento; ingreso: Movimiento; segura: boolean; comision: number };

const AUTOMATICOS = new Set(['notificacion', 'mercadopago', 'importacion']);
const minutos = (h?: string | null) => (h ? +h.slice(0, 2) * 60 + +h.slice(3, 5) : null);
const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

// Entre minutos de diferencia dentro del mismo día se considera instantánea
const VENTANA_MIN = 30;
// Hasta qué parte del importe puede quedarse una comisión para seguir considerándolo la misma transferencia
const TOPE_COMISION = 0.02;

export const claveDePar = (egreso: Movimiento, ingreso: Movimiento) => `${egreso.id}|${ingreso.id}`;

export function detectarTransferencias(movs: Movimiento[], descartadas: ReadonlySet<string>): ParTransferencia[] {
  const egresos = movs.filter((m) => m.tipo === 'Egreso' && m.valor < 0 && m.cuentaId);
  const ingresos = movs.filter((m) => m.tipo === 'Ingreso' && m.valor > 0 && m.cuentaId);
  const usados = new Set<string>();
  const candidatos: { e: Movimiento; i: Movimiento; comision: number; peso: number }[] = [];
  for (const e of egresos) {
    for (const i of ingresos) {
      if (e.moneda !== i.moneda || e.cuentaId === i.cuentaId || dias(e.fecha, i.fecha) > 1) continue;
      const comision = Math.round((Math.abs(e.valor) - i.valor) * 100) / 100;
      if (comision < 0 || comision > Math.abs(e.valor) * TOPE_COMISION) continue; // llega igual o un poco menos, nunca más
      const he = minutos(e.hora);
      const hi = minutos(i.hora);
      const dm = he !== null && hi !== null && e.fecha === i.fecha ? Math.abs(he - hi) : 0;
      if (dm > VENTANA_MIN) continue;
      candidatos.push({ e, i, comision, peso: dm + dias(e.fecha, i.fecha) * 1440 + (comision > 0 ? 5000 : 0) }); // a igual cercanía, gana el de importe idéntico
    }
  }
  const out: ParTransferencia[] = [];
  for (const { e, i, comision } of candidatos.sort((a, b) => a.peso - b.peso)) {
    const clave = claveDePar(e, i);
    if (usados.has(e.id) || usados.has(i.id) || descartadas.has(clave)) continue;
    usados.add(e.id);
    usados.add(i.id);
    out.push({ clave, egreso: e, ingreso: i, comision, segura: comision === 0 && !!e.origen && !!i.origen && AUTOMATICOS.has(e.origen) && AUTOMATICOS.has(i.origen) && e.fecha === i.fecha });
  }
  return out.sort((a, b) => b.egreso.fecha.localeCompare(a.egreso.fecha));
}
