import { describe, expect, it } from 'vitest';
import { descripcion, faltaCargar, fechasDelMes, proxima, tieneMovimiento, vecesPorMes } from '../src/recurrentes';

describe('fechasDelMes', () => {
  it('mensual: un día, el último si el mes es corto', () => {
    expect(fechasDelMes({ dia: 15 }, '2026-10')).toEqual(['2026-10-15']);
    expect(fechasDelMes({ dia: 31 }, '2026-02')).toEqual(['2026-02-28']);
  });
  it('quincenal: el día y 15 días después', () => {
    expect(fechasDelMes({ frecuencia: 'quincenal', dia: 1 }, '2026-10')).toEqual(['2026-10-01', '2026-10-16']);
    expect(fechasDelMes({ frecuencia: 'quincenal', dia: 20 }, '2026-10')).toEqual(['2026-10-05', '2026-10-20']);
    expect(fechasDelMes({ frecuencia: 'quincenal', dia: 15 }, '2026-02')).toEqual(['2026-02-15', '2026-02-28']);
  });
  it('semanal: todos los lunes de octubre 2026', () => {
    // el 1/10/2026 es jueves: los lunes son 5, 12, 19 y 26
    expect(fechasDelMes({ frecuencia: 'semanal', dia: 1, diaSemana: 1 }, '2026-10')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });
  it('respeta la fecha de inicio', () => {
    expect(fechasDelMes({ frecuencia: 'semanal', dia: 1, diaSemana: 1, inicio: '2026-10-13' }, '2026-10')).toEqual(['2026-10-19', '2026-10-26']);
  });
});

describe('descripcion y proxima', () => {
  it('describe cada frecuencia', () => {
    expect(descripcion({ dia: 6 })).toBe('Día 6 de cada mes');
    expect(descripcion({ frecuencia: 'quincenal', dia: 1 })).toBe('Días 1 y 16 de cada mes');
    expect(descripcion({ frecuencia: 'semanal', dia: 1, diaSemana: 5 })).toBe('Todos los viernes');
  });
  it('próxima fecha sin cargar', () => {
    const r = { frecuencia: 'semanal' as const, dia: 1, diaSemana: 1 };
    expect(proxima(r, '2026-10-08')).toBe('2026-10-12');
    expect(proxima(r, '2026-10-08', '2026-10-12')).toBe('2026-10-19');
    expect(proxima({ frecuencia: 'quincenal', dia: 1 }, '2026-10-20')).toBe('2026-11-01');
  });
  it('veces por mes', () => {
    expect(vecesPorMes({ dia: 1 })).toBe(1);
    expect(vecesPorMes({ frecuencia: 'quincenal', dia: 1 })).toBe(2);
    expect(vecesPorMes({ frecuencia: 'semanal', dia: 1 })).toBeCloseTo(4.33, 2);
  });
});

describe('faltaCargar', () => {
  const r = { dia: 6, activo: true, tipo: 'Egreso', concepto: 'Comida' };
  it('el día ya llegó y no hay movimiento: falta', () => expect(faltaCargar(r, [], '2026-10-09')).toBe(true));
  it('con el movimiento cargado (aunque se escriba distinto) no falta', () => {
    expect(tieneMovimiento(r, [{ tipo: 'Egreso', concepto: ' comida ' }])).toBe(true);
    expect(faltaCargar(r, [{ tipo: 'Egreso', concepto: 'comida' }], '2026-10-09')).toBe(false);
  });
  it('si su día todavía no llegó, o está pausado, no falta', () => {
    expect(faltaCargar({ ...r, dia: 20 }, [], '2026-10-09')).toBe(false);
    expect(faltaCargar({ ...r, activo: false }, [], '2026-10-09')).toBe(false);
  });
});
