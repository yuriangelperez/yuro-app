import { describe, expect, it } from 'vitest';
import { type Deuda, resumenDeuda } from '../src/deudas';
import { aplicables, buscarRegla, type Regla } from '../src/reglas';
import { mov } from './ayudas';

const deuda: Deuda = { id: 'd', nombre: 'Juan', direccion: 'debo', monto: 1000, moneda: 'ARS', fecha: '2026-10-01', vencimiento: null, nota: '', activa: true };

describe('deudas', () => {
  it('lo pendiente es el total menos los pagos, y solo cuentan los pagos de esa deuda', () => {
    const r = resumenDeuda(deuda, [
      mov({ tipo: 'Pago deuda', deudaId: 'd', valor: -300 }), mov({ tipo: 'Pago deuda', deudaId: 'd', valor: -200 }),
      mov({ tipo: 'Deuda', deudaId: 'd', valor: 1000 }), mov({ tipo: 'Pago deuda', deudaId: 'otra', valor: -999 }),
    ]);
    expect(r.pagado).toBe(500);
    expect(r.pendiente).toBe(500);
    expect(r.saldada).toBe(false);
  });
  it('queda saldada al completar y nunca negativa', () => {
    expect(resumenDeuda(deuda, [mov({ tipo: 'Pago deuda', deudaId: 'd', valor: -1000 })]).saldada).toBe(true);
    expect(resumenDeuda(deuda, [mov({ tipo: 'Pago deuda', deudaId: 'd', valor: -1500 })]).pendiente).toBe(0);
  });
  it('los cobros (positivos) también cuentan como pagos de una deuda que te deben', () => {
    expect(resumenDeuda({ ...deuda, direccion: 'me_deben' }, [mov({ tipo: 'Pago deuda', deudaId: 'd', valor: 400 })]).pendiente).toBe(600);
  });
});

const reglas: Regla[] = [
  { id: '1', patron: 'uber', categoria: 'Transporte', categoria2: '' },
  { id: '2', patron: 'uber eats', categoria: 'Comida', categoria2: '' },
];

describe('reglas por palabra', () => {
  it('gana la palabra más específica', () => expect(buscarRegla(reglas, 'UBER EATS Palermo')?.categoria).toBe('Comida'));
  it('ignora mayúsculas y tildes', () => expect(buscarRegla(reglas, 'Viaje Úber')?.categoria).toBe('Transporte'));
  it('sin coincidencia no hay regla', () => expect(buscarRegla(reglas, 'Supermercado')).toBeNull());
  it('solo aplica a ingresos/egresos ya ocurridos y sin categoría', () => {
    const lista = [
      mov({ concepto: 'Uber' }), mov({ concepto: 'Uber', categoria: 'Otra' }), mov({ concepto: 'Uber', fecha: '2026-12-31' }),
      mov({ concepto: 'Uber', tipo: 'Transferencia' }), mov({ concepto: 'Uber', fecha: '2026-01-01' }),
    ];
    expect(aplicables(reglas, lista, '2026-08-01', '2026-10-08')).toHaveLength(1);
  });
});
