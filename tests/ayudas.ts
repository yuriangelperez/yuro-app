import type { Movimiento } from '../src/types';

// Fábrica de movimientos para las pruebas
export const mov = (o: Partial<Movimiento> = {}): Movimiento => ({
  id: Math.random().toString(36).slice(2), fecha: '2026-10-08', concepto: '', valor: -1500, tipo: 'Egreso', metodo: 'Efectivo', categoria: '', categoria2: '',
  cuotasCumplidas: null, cuotasTotales: null, moneda: 'ARS', ...o,
});
