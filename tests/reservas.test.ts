import { describe, expect, it } from 'vitest';
import type { Cuenta } from '../src/proveedores';
import { estadosReservas, type Reserva } from '../src/reservas';
import { mov } from './ayudas';

const cuentas = [{ id: 'mp', nombre: 'Mercado pago' }] as Cuenta[];
const reserva = (o: Partial<Reserva> = {}): Reserva => ({
  id: 'r', nombre: 'Transportes', monto: 50000, moneda: 'ARS', cuentaId: 'mp', categoria: 'Transporte', patron: '', mensual: false, desde: '2026-10-01', activa: true, ...o,
});
const gasto = (o = {}) => mov({ valor: -10000, categoria: 'Transporte', metodo: 'Mercado pago', cuentaId: 'mp', fecha: '2026-10-05', ...o });
const HOY = '2026-10-08';

describe('reservas', () => {
  it('descuenta los gastos de su categoría', () => {
    const [e] = estadosReservas([reserva()], [gasto(), gasto({ valor: -5000 })], cuentas, HOY);
    expect(e.gastado).toBe(15000);
    expect(e.queda).toBe(35000);
  });
  it('descuenta por palabra del concepto, no los demás', () => {
    const [e] = estadosReservas([reserva({ categoria: '', patron: 'sube' })], [gasto({ categoria: '', concepto: 'Recarga SUBE' }), gasto({ categoria: '', concepto: 'Super' })], cuentas, HOY);
    expect(e.gastado).toBe(10000);
  });
  it('un gasto de otra cuenta no descuenta', () => {
    expect(estadosReservas([reserva()], [gasto({ cuentaId: 'otra', metodo: 'Banco' })], cuentas, HOY)[0].gastado).toBe(0);
  });
  it('un gasto anterior a la fecha de inicio no descuenta', () => {
    expect(estadosReservas([reserva()], [gasto({ fecha: '2026-09-20' })], cuentas, HOY)[0].gastado).toBe(0);
  });
  it('la reserva mensual solo cuenta el mes actual', () => {
    const [e] = estadosReservas([reserva({ mensual: true, desde: '2026-01-01' })], [gasto({ fecha: '2026-09-20' }), gasto()], cuentas, HOY);
    expect(e.gastado).toBe(10000);
  });
  it('un gasto descuenta una sola reserva: gana la que lo nombra por palabra', () => {
    const [a, b] = estadosReservas([reserva({ id: 'a' }), reserva({ id: 'b', categoria: '', patron: 'sube' })], [gasto({ concepto: 'SUBE' })], cuentas, HOY);
    expect(a.gastado).toBe(0);
    expect(b.gastado).toBe(10000);
  });
  it('lo programado a futuro no descuenta', () => {
    expect(estadosReservas([reserva()], [gasto({ fecha: '2026-10-20' })], cuentas, HOY)[0].gastado).toBe(0);
  });
  it('los ingresos no descuentan', () => {
    expect(estadosReservas([reserva()], [gasto({ tipo: 'Ingreso', valor: 10000 })], cuentas, HOY)[0].gastado).toBe(0);
  });
  it('si te pasás, queda en negativo', () => {
    expect(estadosReservas([reserva({ monto: 5000 })], [gasto()], cuentas, HOY)[0].queda).toBe(-5000);
  });

  describe('carpeta (reserva ligada a una cuenta de reserva, sin criterio propio)', () => {
    const ctas = [{ id: 'mp', nombre: 'Mercado pago' }, { id: 'rg', nombre: 'MP - Reserva - Gastos' }] as Cuenta[];
    const carpeta = reserva({ id: 'g', nombre: 'Gastos', monto: 25000, cuentaId: 'rg', categoria: '', patron: '' });
    const retiro = mov({ tipo: 'Transferencia', valor: 13000, moneda: 'ARS', cuentaId: 'rg', cuentaDestinoId: 'mp', fecha: '2026-10-08' });

    it('lo que sacás hacia otra cuenta la descuenta: 25.000 − 13.000 = 12.000', () => {
      const [e] = estadosReservas([carpeta], [retiro], ctas, HOY);
      expect(e.gastado).toBe(13000);
      expect(e.queda).toBe(12000);
    });
    it('un gasto pagado desde esa cuenta también la descuenta', () => {
      const [e] = estadosReservas([carpeta], [gasto({ valor: -5000, categoria: 'Servicios', cuentaId: 'rg', metodo: 'MP - Reserva - Gastos' })], ctas, HOY);
      expect(e.queda).toBe(20000);
    });
    it('plata que entra a la carpeta no la descuenta', () => {
      const deposito = mov({ tipo: 'Transferencia', valor: 21000, moneda: 'ARS', cuentaId: 'mp', cuentaDestinoId: 'rg', fecha: '2026-10-07' });
      expect(estadosReservas([carpeta], [deposito], ctas, HOY)[0].gastado).toBe(0);
    });
  });
});
