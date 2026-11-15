import { describe, expect, it } from 'vitest';
import { cuentaDeItem, esReserva, proyectar } from '../src/proyeccion';
import type { Cuenta } from '../src/proveedores';
import type { ItemAgenda, Recurrente } from '../src/store';

const cta = (id: string, nombre: string): Cuenta => ({ id, nombre, proveedorId: null, tipo: 'wallet', moneda: 'ARS', saldoInicial: 0, activa: true });
const cuentas = [cta('mp', 'Mercado pago'), cta('ef', 'Efectivo'), cta('rg', 'MP - Reserva - Gastos')];
const item = (o: Partial<ItemAgenda>): ItemAgenda => ({ id: 'i', concepto: 'x', valor: -100, moneda: 'ARS', fecha: '2026-10-20', estado: 'pendiente', origen: 'plan', ...o }) as ItemAgenda;

describe('proyección por cuenta', () => {
  it('reparte lo pendiente en cada cuenta y deja aparte lo que no tiene', () => {
    const plan = (cuentaId: string | null, metodo = '') => ({ cuentaId, metodo }) as never;
    const r = proyectar(
      [item({ id: 'a', valor: 13450, plan: plan('mp') }), item({ id: 'b', valor: -20000, plan: plan('ef') }), item({ id: 'c', valor: -500, plan: plan(null) })],
      cuentas, [],
    );
    expect(r.porCuenta.get('mp')?.ARS).toBe(13450);
    expect(r.porCuenta.get('ef')?.ARS).toBe(-20000);
    expect(r.sinCuenta.ARS).toBe(-500);
  });
  it('un recurrente se asigna por el nombre de su método', () => {
    const rec = { id: 'r1', metodo: 'efectivo' } as Recurrente;
    expect(cuentaDeItem(item({ origen: 'recurrente', recurrenteId: 'r1' }), cuentas, [rec])?.id).toBe('ef');
  });
  it('reconoce las cuentas de reserva', () => {
    expect(esReserva('MP - Reserva - Gastos')).toBe(true);
    expect(esReserva('Mercado pago')).toBe(false);
  });
});

import { cambioEnReservas } from '../src/proyeccion';
import type { Movimiento } from '../src/types';

describe('cambioEnReservas', () => {
  const m = (o: Partial<Movimiento>) => ({ id: 'x', fecha: '2026-10-07', hora: null, concepto: 'x', valor: 0, tipo: 'Egreso', metodo: '', categoria: '', categoria2: '', cuotasCumplidas: null, cuotasTotales: null, moneda: 'ARS', valorArs: 0, ...o }) as Movimiento;
  const res = new Set(['rg']);
  const conv = (v: number) => v;
  it('poner plata en una reserva suma; sacarla resta', () => {
    expect(cambioEnReservas([m({ tipo: 'Transferencia', valor: 50000, cuentaId: 'mp', cuentaDestinoId: 'rg' })], res, conv)).toBe(50000);
    expect(cambioEnReservas([m({ tipo: 'Transferencia', valor: 13000, cuentaId: 'rg', cuentaDestinoId: 'mp' })], res, conv)).toBe(-13000);
  });
  it('entre dos reservas no cambia nada', () => {
    expect(cambioEnReservas([m({ tipo: 'Transferencia', valor: 100, cuentaId: 'rg', cuentaDestinoId: 'rg' })], res, conv)).toBe(0);
  });
  it('un gasto pagado desde una reserva la baja', () => {
    expect(cambioEnReservas([m({ tipo: 'Egreso', valor: -5000, cuentaId: 'rg' })], res, conv)).toBe(-5000);
  });
  it('lo que no toca reservas no cuenta', () => {
    expect(cambioEnReservas([m({ tipo: 'Egreso', valor: -5000, cuentaId: 'mp' })], res, conv)).toBe(0);
  });
});

import { calcularQuedaria } from '../src/proyeccion';

describe('calcularQuedaria', () => {
  const cuenta = (id: string, nombre: string, moneda: 'ARS' | 'USDT' = 'ARS', tipo: Cuenta['tipo'] = 'wallet'): Cuenta => ({ id, nombre, proveedorId: null, tipo, moneda, saldoInicial: 0, activa: true });
  const conv = (v: number) => v;
  const puede = () => true;
  const plan = (valor: number, cuentaId: string | null, moneda: 'ARS' | 'USDT' = 'ARS') => item({ valor, moneda, plan: { cuentaId, metodo: '' } as never });
  const cuentas = [cuenta('ef', 'Efectivo', 'ARS', 'cash'), cuenta('mp', 'Mercado pago'), cuenta('rt', 'MP - Reserva - Transporte'), cuenta('rg', 'MP - Reserva - Gastos'), cuenta('ra', 'MP Reserva - Ahorros'), cuenta('bn', 'Binance', 'USDT', 'exchange')];
  const saldos = new Map<string, Partial<Record<'ARS' | 'USDT', number>>>([['ef', { ARS: 25000 }], ['mp', { ARS: 8700 }], ['rt', { ARS: 30000 }], ['rg', { ARS: 28000 }], ['ra', { ARS: 2000 }], ['bn', { USDT: 176 }]]);
  const base = { cuentas, saldos, reservado: { ARS: 60000 }, recurrentes: [], conv, puede };

  it('tu caso: 25.000 de efectivo (el ahorro no se resta: no está en esas cuentas) + 8.700 de Mercado Pago + 13.450 por cobrar = 47.150, con lo que hay que pagar cubierto por las reservas', () => {
    const r = calcularQuedaria({ ...base, pendientes: [plan(13450, 'mp'), plan(-3490, 'ef'), plan(-20000, 'ef'), plan(-10000, 'mp'), plan(-7.8, 'bn', 'USDT')] });
    expect(r.libreHoy).toBe(33700);
    expect(r.queda).toBe(47150);
    expect(r.porPagar).toBeCloseTo(3490 + 20000 + 10000 + 7.8, 5); // el total, igual que en Planificados
  });
  it('si lo que hay que pagar supera las reservas, el resto sale de lo libre', () => {
    const r = calcularQuedaria({ ...base, pendientes: [plan(-70000, 'ef')] }); // reservas: 60.000
    expect(r.queda).toBe(33700 - 10000);
  });
  it('lo que se paga desde una reserva o una cuenta de ahorro no resta de lo libre', () => {
    const r = calcularQuedaria({ ...base, pendientes: [plan(-20000, 'rg'), plan(-5000, 'mp')] });
    expect(r.queda).toBe(33700); // 25.000 de reservas cubren los 5.000; los 20.000 salen de la reserva
  });
  it('una moneda sin cuentas para gastar (Binance es de ahorro) no entra en la cuenta', () => {
    const r = calcularQuedaria({ ...base, pendientes: [plan(-38, 'bn', 'USDT')] });
    expect(r.queda).toBe(33700);
  });
  it('si en tus reservas solo quedan $19.168, cubren hasta eso y el resto resta de lo libre', () => {
    const r = calcularQuedaria({ ...base, reservado: { ARS: 19168 }, pendientes: [plan(-49400, 'ef')] });
    expect(r.cubiertoReservas).toBe(19168);
    expect(r.queda).toBe(33700 - (49400 - 19168));
  });
});
