import { describe, expect, it } from 'vitest';
import { detectarTransferencias } from '../src/transferencias';
import { mov } from './ayudas';

const ingreso = (o = {}) => mov({ tipo: 'Ingreso', valor: 200000, cuentaId: 'B', hora: '14:00', origen: 'notificacion', ...o });
const egreso = (o = {}) => mov({ tipo: 'Egreso', valor: -200000, cuentaId: 'A', hora: '14:01', origen: 'notificacion', ...o });
const ninguna = new Set<string>();

describe('transferencias entre cuentas propias', () => {
  it('empareja gasto e ingreso iguales en cuentas distintas', () => expect(detectarTransferencias([egreso(), ingreso()], ninguna)).toHaveLength(1));
  it('la misma cuenta no es transferencia', () => expect(detectarTransferencias([egreso({ cuentaId: 'B' }), ingreso()], ninguna)).toHaveLength(0));
  it('3 horas de diferencia no', () => expect(detectarTransferencias([egreso({ hora: '17:30' }), ingreso()], ninguna)).toHaveLength(0));
  it('importes distintos más allá de la comisión no', () => expect(detectarTransferencias([egreso({ valor: -250000 }), ingreso()], ninguna)).toHaveLength(0));
  it('detecta la comisión cuando llega un poco menos', () => {
    const [p] = detectarTransferencias([egreso({ valor: -200500 }), ingreso()], ninguna);
    expect(p.comision).toBe(500);
    expect(p.segura).toBe(false);
  });
  it('si llega más de lo que salió no es la misma plata', () => expect(detectarTransferencias([egreso({ valor: -199000 }), ingreso()], ninguna)).toHaveLength(0));
  it('los pares descartados no se vuelven a proponer', () => {
    const e = egreso();
    const i = ingreso();
    expect(detectarTransferencias([e, i], new Set([`${e.id}|${i.id}`]))).toHaveLength(0);
  });
  it('de notificación el mismo día e importe idéntico es casi seguro', () => expect(detectarTransferencias([egreso(), ingreso()], ninguna)[0].segura).toBe(true));
  it('prefiere el importe idéntico al que tiene comisión', () => {
    const exacto = ingreso({ id: 'exacto' });
    const conComision = ingreso({ id: 'comision', valor: 199000 });
    const [p] = detectarTransferencias([egreso(), conComision, exacto], ninguna);
    expect(p.ingreso.id).toBe('exacto');
  });
});
