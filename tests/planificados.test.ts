import { describe, expect, it } from 'vitest';
import { emparejar, sugerirEmparejamientos, type Planificado } from '../src/planificados';
import { mov } from './ayudas';

const plan = (o: Partial<Planificado> = {}): Planificado => ({
  id: 'p', fecha: '2026-10-15', concepto: 'Sueldo', valor: 1000000, moneda: 'ARS', tipo: 'Ingreso', metodo: '', cuentaId: null, categoria: '', categoria2: '',
  estado: 'pendiente', movimientoId: null, ...o,
});
const cobro = (o = {}) => mov({ fecha: '2026-10-17', concepto: 'Cobro de EMPRESA', valor: 1000000, tipo: 'Ingreso', ...o });

describe('planificados', () => {
  it('lo cumple un cobro dos días tarde', () => expect(emparejar([plan()], [cobro()])).toHaveLength(1));
  it('fuera de la ventana de fechas no cumple', () => expect(emparejar([plan()], [cobro({ fecha: '2026-11-10' })])).toHaveLength(0));
  it('importe distinto sin concepto parecido no cumple', () => expect(emparejar([plan()], [cobro({ valor: 950000 })])).toHaveLength(0));
  it('importe parecido con concepto parecido sí', () => expect(emparejar([plan()], [cobro({ valor: 950000, concepto: 'Sueldo octubre' })])).toHaveLength(1));
  it('un movimiento cumple un solo planificado', () => expect(emparejar([plan({ id: 'a' }), plan({ id: 'b' })], [cobro()])).toHaveLength(1));
  it('un egreso no cumple un ingreso', () => expect(emparejar([plan()], [cobro({ tipo: 'Egreso', valor: -1000000 })])).toHaveLength(0));
  it('13.450 esperados y 13.500 que entran (0,4% de diferencia) se juntan solos, aunque el concepto no se parezca', () => {
    const r = emparejar([plan({ valor: 13450, concepto: 'Peya Wiwi', fecha: '2026-10-08' })], [cobro({ valor: 13500, concepto: 'Mercado Pago · Pago', fecha: '2026-10-09' })]);
    expect(r).toHaveLength(1);
  });
  it('si la diferencia es mayor (hasta 25%) y el concepto no se parece, se sugiere pero no se junta solo', () => {
    const p = plan({ valor: 13450, concepto: 'Peya Wiwi', fecha: '2026-10-08' });
    const m = cobro({ valor: 15000, concepto: 'Mercado Pago · Pago', fecha: '2026-10-09' });
    expect(emparejar([p], [m])).toHaveLength(0);
    expect(sugerirEmparejamientos([p], [m])).toHaveLength(1);
  });
});
