import type { Moneda, Movimiento } from './types';

// Deuda: plata que debés ('debo') o que te deben ('me_deben'). El total original es `monto`; lo que falta sale de los pagos.
// Movimientos ligados a una deuda (deudaId):
//  - tipo 'Deuda': el préstamo en sí (plata que entra si pediste, sale si prestaste). No es ingreso ni gasto.
//  - tipo 'Pago deuda': un pago (sale si debés, entra si te deben). Tampoco es ingreso ni gasto.
export type Deuda = {
  id: string;
  nombre: string;
  direccion: 'debo' | 'me_deben';
  monto: number;
  moneda: Moneda;
  fecha: string;
  vencimiento: string | null;
  nota: string;
  activa: boolean;
};

export type ResumenDeuda = { deuda: Deuda; pagado: number; pendiente: number; saldada: boolean; pagos: Movimiento[] };

export const resumenDeuda = (deuda: Deuda, movs: Movimiento[]): ResumenDeuda => {
  const pagos = movs.filter((m) => m.deudaId === deuda.id && m.tipo === 'Pago deuda').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const pagado = Math.round(pagos.reduce((a, m) => a + Math.abs(m.valor), 0) * 100) / 100;
  const pendiente = Math.max(0, Math.round((deuda.monto - pagado) * 100) / 100);
  return { deuda, pagado, pendiente, saldada: pendiente === 0, pagos };
};
