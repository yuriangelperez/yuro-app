import { describe, expect, it } from 'vitest';
import { cambiosMalHechos, cuotasRotas, enCero, recurrentesDeReserva, sinCuenta } from '../src/mantenimiento';
import type { Cuenta } from '../src/proveedores';
import type { Recurrente } from '../src/store';
import type { Movimiento } from '../src/types';

const mov = (o: Partial<Movimiento>): Movimiento => ({ id: 'm', fecha: '2026-10-07', hora: null, concepto: 'x', valor: -100, tipo: 'Egreso', metodo: '', categoria: '', categoria2: '', cuotasCumplidas: null, cuotasTotales: null, moneda: 'ARS', valorArs: -100, ...o }) as Movimiento;
const cta = (id: string, nombre: string, moneda: 'ARS' | 'USDT' = 'ARS'): Cuenta => ({ id, nombre, proveedorId: null, tipo: 'wallet', moneda, saldoInicial: 0, activa: true });

describe('mantenimiento', () => {
  it('detecta movimientos en cero', () => {
    expect(enCero([mov({ valor: 0 }), mov({ valor: 5 })])).toHaveLength(1);
  });
  it('sin cuenta: pasados y a futuro, pero no los que ya tienen cuenta', () => {
    const r = sinCuenta([mov({ id: 'a' }), mov({ id: 'b', cuentaId: 'x' }), mov({ id: 'c', fecha: '2026-12-01' })]);
    expect(r.map((m) => m.id)).toEqual(['a', 'c']);
  });
  it('cuotas cumplidas sin total', () => {
    expect(cuotasRotas([mov({ cuotasCumplidas: 7.8 }), mov({ cuotasCumplidas: 3, cuotasTotales: 6 })])).toHaveLength(1);
  });
  it('una transferencia en USDT desde una cuenta en pesos es un cambio', () => {
    const cuentas = [cta('mp', 'Mercado pago'), cta('bn', 'Binance', 'USDT')];
    const t = mov({ tipo: 'Transferencia', cuentaId: 'mp', cuentaDestinoId: 'bn', moneda: 'USDT', valor: 38.54, valorArs: 62000 });
    const r = cambiosMalHechos([t], cuentas);
    expect(r).toHaveLength(1);
    expect(r[0].salida).toBe(62000);
    // una transferencia normal en pesos no
    expect(cambiosMalHechos([mov({ tipo: 'Transferencia', cuentaId: 'mp', cuentaDestinoId: 'bn', valor: 100 })], [cta('mp', 'a'), cta('bn', 'b')])).toHaveLength(0);
  });
  it('recurrente de reserva', () => {
    const rec = { id: 'r', concepto: 'x', valor: -21000, moneda: 'ARS', tipo: 'Egreso', metodo: 'MP - Reserva - Gastos', categoria: 'Reserva', categoria2: '', dia: 7, desde: '2026-10', activo: true } as Recurrente;
    expect(recurrentesDeReserva([rec], [cta('rg', 'MP - Reserva - Gastos')])).toHaveLength(1);
    expect(recurrentesDeReserva([{ ...rec, categoria: 'Comida' }], [cta('rg', 'MP - Reserva - Gastos')])).toHaveLength(0);
  });
});

import { pagosEnCuentaEquivocada } from '../src/mantenimiento';

describe('pagosEnCuentaEquivocada', () => {
  const cuentas = [cta('mp', 'Mercado pago'), cta('rg', 'MP - Reserva - Gastos')];
  const transf = mov({ id: 't', tipo: 'Transferencia', valor: 13000, cuentaId: 'rg', cuentaDestinoId: 'mp' });
  it('el gasto cargado en la reserva el día que sacaste esa plata hacia otra cuenta', () => {
    const r = pagosEnCuentaEquivocada([transf, mov({ id: 'e', valor: -12711.05, cuentaId: 'rg' })], cuentas);
    expect(r).toHaveLength(1);
    expect(r[0].destino.id).toBe('mp');
  });
  it('si el importe no se parece, no lo toca', () => {
    expect(pagosEnCuentaEquivocada([transf, mov({ id: 'e', valor: -2000, cuentaId: 'rg' })], cuentas)).toHaveLength(0);
  });
  it('si el gasto ya está en la otra cuenta, tampoco', () => {
    expect(pagosEnCuentaEquivocada([transf, mov({ id: 'e', valor: -12711.05, cuentaId: 'mp' })], cuentas)).toHaveLength(0);
  });
});

import { pagosPorOtraCuenta } from '../src/mantenimiento';

describe('pagosPorOtraCuenta', () => {
  const cuentas = [{ ...cta('mp', 'Mercado pago'), proveedorId: 'mercadopago' }, { ...cta('nx', 'Naranja X'), proveedorId: 'naranjax' }];
  it('un pago de Mercado Pago cargado en Naranja X salió de Mercado Pago', () => {
    const r = pagosPorOtraCuenta([mov({ id: 'g', valor: -13000, origen: 'mercadopago', cuentaId: 'nx' })], cuentas);
    expect(r).toHaveLength(1);
    expect(r[0].origen.id).toBe('mp');
    expect(r[0].destino.id).toBe('nx');
  });
  it('lo que está en la cuenta de Mercado Pago, o no vino de Mercado Pago, no se toca', () => {
    expect(pagosPorOtraCuenta([mov({ id: 'a', origen: 'mercadopago', cuentaId: 'mp' })], cuentas)).toHaveLength(0);
    expect(pagosPorOtraCuenta([mov({ id: 'b', origen: 'manual', cuentaId: 'nx' })], cuentas)).toHaveLength(0);
  });
});

import { programadosAFuturo } from '../src/mantenimiento';

describe('programadosAFuturo', () => {
  const futuro = (id: string, concepto: string, fecha: string, tipo: Movimiento['tipo'] = 'Egreso') => mov({ id, concepto, fecha, tipo });
  it('agrupa por concepto los movimientos con fecha futura', () => {
    const r = programadosAFuturo([futuro('a', 'github', '2026-11-07'), futuro('b', 'Github ', '2027-01-09'), futuro('c', 'meli', '2026-11-08'), futuro('d', 'pasado', '2026-10-01')], '2026-10-08', []);
    expect(r).toHaveLength(2);
    expect(r[0].concepto.toLowerCase()).toBe('github');
    expect(r[0].movs.map((m) => m.id)).toEqual(['a', 'b']);
  });
  it('no incluye los que cumplen un planificado ni los tipos que no son ingreso, gasto o ahorro', () => {
    const r = programadosAFuturo([futuro('a', 'rueda', '2026-10-20'), futuro('t', 'transf', '2026-10-20', 'Transferencia')], '2026-10-08', [{ movimientoId: 'a' }]);
    expect(r).toHaveLength(0);
  });
});

import { ajustesParaConservarSaldos, fueraDelMes } from '../src/mantenimiento';

describe('empezar de cero con este mes', () => {
  it('detecta lo que queda fuera del mes', () => {
    const r = fueraDelMes([mov({ id: 'a', fecha: '2026-09-30' }), mov({ id: 'b', fecha: '2026-10-05' }), mov({ id: 'c', fecha: '2026-11-04' })], '2026-10');
    expect(r.map((m) => m.id)).toEqual(['a', 'c']);
  });
  it('lo que desaparece se pasa a los saldos iniciales para que los saldos de hoy no cambien', () => {
    const cuentas = [cta('mp', 'Mercado pago'), cta('bn', 'Binance', 'USDT')];
    const r = ajustesParaConservarSaldos({
      cuentas,
      cuentasAntes: new Map([['mp', { ARS: 1000 }], ['bn', { USDT: 50 }]]),
      cuentasDespues: new Map([['mp', { ARS: 400 }], ['bn', { USDT: 50 }]]),
      totalesAntes: [{ moneda: 'ARS', total: 1000, ahorrado: 200 }, { moneda: 'USDT', total: 50, ahorrado: 0 }],
      totalesDespues: [{ moneda: 'ARS', total: 400, ahorrado: 100 }, { moneda: 'USDT', total: 50, ahorrado: 0 }],
    });
    expect(r.cuentas).toEqual([{ id: 'mp', dif: 600 }]); // Binance no cambió: no se toca
    expect(r.totales).toEqual({ ARS: 600 });
    expect(r.ahorros).toEqual({ ARS: 100 });
  });
});

import { duplicadosEntreCuentas, recurrentesRepetidos, yaCargadosComoTransferencia } from '../src/mantenimiento';

describe('duplicados de la importación', () => {
  it('el mismo pago en dos cuentas, con minutos de diferencia', () => {
    const r = duplicadosEntreCuentas([
      mov({ id: 'a', origen: 'mercadopago', valor: -48500, cuentaId: 'mp', hora: '10:03' }),
      mov({ id: 'b', origen: 'manual', valor: -48500, cuentaId: 'ef', hora: '10:08', concepto: 'Kaos' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].manual.id).toBe('b');
  });
  it('si pasaron horas, o sin hora, no los junta', () => {
    expect(duplicadosEntreCuentas([mov({ id: 'a', origen: 'mercadopago', valor: -5000, cuentaId: 'mp', hora: '10:03' }), mov({ id: 'b', origen: 'manual', valor: -5000, cuentaId: 'ef', hora: '19:53' })])).toHaveLength(0);
    expect(duplicadosEntreCuentas([mov({ id: 'a', origen: 'mercadopago', valor: -5000, cuentaId: 'mp', hora: '10:03' }), mov({ id: 'b', origen: 'importacion', valor: -5000, cuentaId: 'ef', hora: null })])).toHaveLength(0);
  });
  it('un ingreso de Mercado Pago que ya estaba cargado como transferencia a esa cuenta', () => {
    const r = yaCargadosComoTransferencia([
      mov({ id: 'i', origen: 'mercadopago', tipo: 'Ingreso', valor: 13000, cuentaId: 'mp' }),
      mov({ id: 't', origen: 'manual', tipo: 'Transferencia', valor: 13000, cuentaId: 'rg', cuentaDestinoId: 'mp' }),
    ]);
    expect(r).toHaveLength(1);
    // si la transferencia iba a otra cuenta, no es la misma
    expect(yaCargadosComoTransferencia([mov({ id: 'i', origen: 'mercadopago', tipo: 'Ingreso', valor: 13000, cuentaId: 'mp' }), mov({ id: 't', origen: 'manual', tipo: 'Transferencia', valor: 13000, cuentaId: 'mp', cuentaDestinoId: 'nx' })])).toHaveLength(0);
  });
  it('recurrentes repetidos', () => {
    const rec = (id: string, concepto: string) => ({ id, concepto, valor: -1, moneda: 'ARS', tipo: 'Egreso', metodo: '', categoria: '', categoria2: '', dia: 1, desde: '2026-10', activo: true, ultimoYm: null }) as Recurrente;
    expect(recurrentesRepetidos([rec('1', 'Claude'), rec('2', 'claude'), rec('3', 'meli')])).toHaveLength(1);
  });
});

import { desdeLaHoja } from '../src/mantenimiento';

describe('desdeLaHoja', () => {
  it('lista lo importado del mes, de mayor a menor importe', () => {
    const r = desdeLaHoja([
      mov({ id: 'a', origen: 'importacion', fecha: '2026-10-06', valor: -500000, valorArs: -500000 }),
      mov({ id: 'b', origen: 'importacion', fecha: '2026-10-06', valor: 1052000, valorArs: 1052000, tipo: 'Ingreso' }),
      mov({ id: 'c', origen: 'manual', fecha: '2026-10-06', valor: -9999999 }),
      mov({ id: 'd', origen: 'importacion', fecha: '2026-09-30', valor: -9999999 }),
    ], '2026-10');
    expect(r.map((m) => m.id)).toEqual(['b', 'a']);
  });
});
