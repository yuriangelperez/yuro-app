import { describe, expect, it } from 'vitest';
import type { Cuenta } from '../src/proveedores';
import { detectarDepositosReserva } from '../src/transferencias';
import type { Movimiento } from '../src/types';

const cuenta = (id: string, nombre: string): Cuenta => ({ id, nombre, proveedorId: 'mercadopago', tipo: 'wallet', moneda: 'ARS', saldoInicial: 0, activa: true });
const mov = (o: Partial<Movimiento>): Movimiento => ({ id: 'm', fecha: '2026-10-07', hora: null, concepto: 'x', valor: -21000, tipo: 'Egreso', metodo: '', categoria: 'Reserva', categoria2: '', cuotasCumplidas: null, cuotasTotales: null, moneda: 'ARS', valorArs: -21000, ...o }) as Movimiento;
const cuentas = [cuenta('mp', 'Mercado pago'), cuenta('rg', 'MP - Reserva - Gastos')];

describe('detectarDepositosReserva', () => {
  it('un gasto de categoría Reserva dentro de una reserva es un depósito desde la cuenta principal', () => {
    const r = detectarDepositosReserva([mov({ id: 'a', cuentaId: 'rg' })], cuentas, new Set());
    expect(r).toHaveLength(1);
    expect(r[0].origen.id).toBe('mp');
    expect(r[0].destino.id).toBe('rg');
  });
  it('un gasto real pagado desde la reserva (otra categoría) no se toca', () => {
    expect(detectarDepositosReserva([mov({ id: 'a', cuentaId: 'rg', categoria: 'Transporte' })], cuentas, new Set())).toHaveLength(0);
  });
  it('respeta lo que descartaste', () => {
    expect(detectarDepositosReserva([mov({ id: 'a', cuentaId: 'rg' })], cuentas, new Set(['dep|a']))).toHaveLength(0);
  });
  it('sin cuenta principal del mismo proveedor no propone nada', () => {
    expect(detectarDepositosReserva([mov({ id: 'a', cuentaId: 'rg' })], [cuenta('rg', 'MP - Reserva - Gastos')], new Set())).toHaveLength(0);
  });
});
