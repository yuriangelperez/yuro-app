import { describe, expect, it } from 'vitest';
import { buscarDuplicados, huella } from '../src/dedupe';
import { mov } from './ayudas';

const nuevo = (o: object) => ({ fecha: '2026-10-08', valor: -1500, moneda: 'ARS' as const, concepto: '', ...o });

describe('dedupe', () => {
  it('la huella es fecha|importe|moneda', () => {
    expect(huella({ fecha: '2026-10-08', valor: -1500, moneda: 'ARS' })).toBe('2026-10-08|-1500.00|ARS');
  });
  it('mismo concepto = duplicado exacto', () => {
    const [r] = buscarDuplicados([nuevo({ concepto: 'Cafe Martinez' })], [mov({ concepto: 'Cafe Martinez' })]);
    expect(r?.exacto).toBe(true);
  });
  it('otro concepto y otra cuenta = probable', () => {
    const [r] = buscarDuplicados([nuevo({ concepto: 'Farmacia' })], [mov({ concepto: 'Nafta' })]);
    expect(r?.exacto).toBe(false);
  });
  it('misma cuenta alcanza para exacto', () => {
    const [r] = buscarDuplicados([nuevo({ concepto: 'Pago · mp', metodo: 'Mercado pago' })], [mov({ concepto: 'Nafta', metodo: 'Mercado pago' })]);
    expect(r?.exacto).toBe(true);
  });
  it('cada movimiento cargado cubre uno solo: 2 cafés iguales con 1 cargado deja 1 nuevo', () => {
    const r = buscarDuplicados([nuevo({ concepto: 'Cafe' }), nuevo({ concepto: 'Cafe' })], [mov({ concepto: 'Cafe' })]);
    expect(r[0]).not.toBeNull();
    expect(r[1]).toBeNull();
  });
  it('un día de diferencia con concepto parecido es aproximado', () => {
    const [r] = buscarDuplicados([nuevo({ fecha: '2026-10-09', concepto: 'Cafe Martinez' })], [mov({ concepto: 'Cafe Martinez' })]);
    expect(r?.nivel).toBe('aproximado');
  });
  it('4 días de diferencia es nuevo', () => {
    expect(buscarDuplicados([nuevo({ fecha: '2026-10-12', concepto: 'Cafe Martinez' })], [mov({ concepto: 'Cafe Martinez' })])[0]).toBeNull();
  });
  it('el id del proveedor gana aunque lo demás no coincida', () => {
    const [r] = buscarDuplicados([nuevo({ externalId: 'mp|1', valor: -999 })], [mov({ externalId: 'mp|1', valor: -2, fecha: '2026-01-01' })]);
    expect(r?.nivel).toBe('external_id');
  });
  it('otra moneda es otro movimiento', () => {
    expect(buscarDuplicados([nuevo({ valor: 100, moneda: 'USD' })], [mov({ valor: 100 })])[0]).toBeNull();
  });
});
