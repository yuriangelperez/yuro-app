import { describe, expect, it } from 'vitest';
import { validarHallazgos } from '../src/analisis';
import type { Planificado } from '../src/planificados';
import { hoyYmd } from '../src/util';
import { mov } from './ayudas';

const hoy = hoyYmd();
const plan = (o: Partial<Planificado> = {}): Planificado => ({ id: 'p1', fecha: hoy, concepto: 'Peya Wiwi', valor: 13450, moneda: 'ARS', tipo: 'Ingreso', metodo: '', cuentaId: null, categoria: '', categoria2: '', estado: 'pendiente', movimientoId: null, ...o });

describe('validarHallazgos', () => {
  it('acepta un duplicado verdadero: mismo importe y día, horas cercanas', () => {
    const r = validarHallazgos([{ tipo: 'duplicado', a: 0, b: 1, confianza: 'alta', motivo: 'x' }], [mov({ id: 'a', fecha: hoy, hora: '10:03', valor: -48500 }), mov({ id: 'b', fecha: hoy, hora: '10:08', valor: -48500 })], []);
    expect(r).toHaveLength(1);
  });
  it('descarta lo que la IA inventa: importes distintos, horas muy separadas o índices que no existen', () => {
    const movs = [mov({ id: 'a', fecha: hoy, hora: '10:03', valor: -48500 }), mov({ id: 'b', fecha: hoy, hora: '10:08', valor: -30000 }), mov({ id: 'c', fecha: hoy, hora: '22:30', valor: -48500 })];
    expect(validarHallazgos([{ tipo: 'duplicado', a: 0, b: 1 }], movs, [])).toHaveLength(0);
    expect(validarHallazgos([{ tipo: 'duplicado', a: 0, b: 2 }], movs, [])).toHaveLength(0);
    expect(validarHallazgos([{ tipo: 'duplicado', a: 0, b: 99 }], movs, [])).toHaveLength(0);
  });
  it('el planificado de 13.450 lo cumple el ingreso de 13.500', () => {
    const r = validarHallazgos([{ tipo: 'cumple_planificado', a: 0, b: 0, confianza: 'alta', motivo: 'x' }], [mov({ id: 'm', fecha: hoy, valor: 13500, tipo: 'Ingreso' })], [plan()]);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('cumple_planificado');
  });
  it('un gasto no cumple un ingreso planificado', () => {
    expect(validarHallazgos([{ tipo: 'cumple_planificado', a: 0, b: 0 }], [mov({ id: 'm', fecha: hoy, valor: -13450 })], [plan()])).toHaveLength(0);
  });
  it('una transferencia propia necesita un gasto y un ingreso parecidos en cuentas distintas', () => {
    const e = mov({ id: 'e', fecha: hoy, valor: -50000, tipo: 'Egreso', cuentaId: 'mp' });
    const i = mov({ id: 'i', fecha: hoy, valor: 50000, tipo: 'Ingreso', cuentaId: 'nx' });
    expect(validarHallazgos([{ tipo: 'transferencia_propia', a: 0, b: 1 }], [e, i], [])).toHaveLength(1);
    expect(validarHallazgos([{ tipo: 'transferencia_propia', a: 0, b: 1 }], [e, { ...i, valor: 20000 }], [])).toHaveLength(0);
    expect(validarHallazgos([{ tipo: 'transferencia_propia', a: 0, b: 1 }], [e, { ...i, cuentaId: 'mp' }], [])).toHaveLength(0);
  });
});
