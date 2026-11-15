import { describe, expect, it } from 'vitest';
import { calcularAgenda } from '../src/agenda';
import type { Planificado } from '../src/planificados';
import type { Recurrente } from '../src/store';
import { mov } from './ayudas';

const HOY = '2026-10-09';
const base = { mes: '2026-10', hoy: HOY };
const rec = (o: Partial<Recurrente>) => ({ id: 'r', concepto: 'celu yuri', valor: -10000, moneda: 'ARS', tipo: 'Egreso', metodo: '', categoria: '', categoria2: '', dia: 16, desde: '2026-10', activo: true, ultimoYm: null, ...o }) as Recurrente;
const plan = (o: Partial<Planificado>) => ({ id: 'p', fecha: '2026-10-06', concepto: 'Rueda de la moto', valor: -20000, moneda: 'ARS', tipo: 'Egreso', metodo: '', cuentaId: null, categoria: '', categoria2: '', estado: 'cumplido', movimientoId: null, ...o }) as Planificado;

describe('calcularAgenda', () => {
  it('un planificado ligado a un movimiento futuro se muestra una sola vez, como pendiente', () => {
    const futuro = mov({ id: 'm', concepto: 'Rueda de la moto', valor: -20000, fecha: '2026-10-20' });
    const r = calcularAgenda({ ...base, planificados: [plan({ movimientoId: 'm' })], recurrentes: [], delAnio: [futuro] });
    expect(r).toHaveLength(1);
    expect(r[0].estado).toBe('pendiente');
  });
  it('un recurrente marcado como cargado pero sin movimiento y con el día por llegar sigue pendiente', () => {
    const r = calcularAgenda({ ...base, planificados: [], recurrentes: [rec({ ultimoYm: '2026-10' })], delAnio: [] });
    expect(r).toHaveLength(1);
    expect(r[0].estado).toBe('pendiente');
  });
  it('"cargado" es que el movimiento exista: con la marca pero sin movimiento, figura pendiente aunque su día ya pasó', () => {
    const r = calcularAgenda({ ...base, planificados: [], recurrentes: [rec({ dia: 5, ultimoYm: '2026-10' })], delAnio: [] });
    expect(r[0].estado).toBe('pendiente');
  });
  it('con su movimiento ya cargado figura cumplido', () => {
    const real = mov({ id: 'x', concepto: 'celu yuri', valor: -10000, fecha: '2026-10-05' });
    const r = calcularAgenda({ ...base, planificados: [], recurrentes: [rec({ dia: 5, ultimoYm: '2026-10' })], delAnio: [real] });
    expect(r[0].estado).toBe('cumplido');
  });
  it('un mes pasado sin el movimiento no lista el recurrente', () => {
    const r = calcularAgenda({ mes: '2026-09', hoy: HOY, planificados: [], recurrentes: [rec({ desde: '2026-08', ultimoYm: '2026-10' })], delAnio: [] });
    expect(r).toHaveLength(0);
  });
  it('con el movimiento real cargado no se repite', () => {
    const real = mov({ id: 'x', concepto: 'celu yuri', valor: -10000, fecha: '2026-10-16' });
    const r = calcularAgenda({ ...base, planificados: [], recurrentes: [rec({ ultimoYm: '2026-10' })], delAnio: [real] });
    expect(r).toHaveLength(1);
    expect(r[0].origen).toBe('movimiento');
  });
});
