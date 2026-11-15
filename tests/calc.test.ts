import { describe, expect, it } from 'vitest';
import { calcular, pulsarCalc } from '../src/calc';

describe('calcular', () => {
  it('respeta la precedencia', () => {
    expect(calcular('2+3×4')).toBe(14);
    expect(calcular('(2+3)×4')).toBe(20);
    expect(calcular('100÷4−5')).toBe(20);
  });
  it('usa coma decimal', () => {
    expect(calcular('1500,5+0,5')).toBe(1501);
  });
  it('el % se toma sobre lo anterior al sumar o restar', () => {
    expect(calcular('200+10%')).toBe(220);
    expect(calcular('200−25%')).toBe(150);
    expect(calcular('50%')).toBe(0.5);
    expect(calcular('200×10%')).toBe(20);
  });
  it('rechaza cuentas incompletas o imposibles', () => {
    expect(calcular('5+')).toBeNull();
    expect(calcular('8÷0')).toBeNull();
    expect(calcular('(2+3')).toBeNull();
    expect(calcular('')).toBeNull();
  });
  it('acepta menos al principio', () => {
    expect(calcular('−5+2')).toBe(-3);
  });
});

describe('pulsarCalc', () => {
  it('arma la cuenta tecla a tecla', () => {
    let q = '';
    for (const k of ['1', '5', '0', '0', '×', '2', ',', '5']) q = pulsarCalc(q, k);
    expect(q).toBe('1500×2,5');
    expect(calcular(q)).toBe(3750);
  });
  it('cambia el operador si se pulsan dos seguidos', () => {
    expect(pulsarCalc('5+', '×')).toBe('5×');
  });
  it('cierra paréntesis cuando hay uno abierto', () => {
    expect(pulsarCalc('(2+3', '()')).toBe('(2+3)');
    expect(pulsarCalc('', '()')).toBe('(');
  });
  it('no repite coma', () => {
    expect(pulsarCalc('1,5', ',')).toBe('1,5');
  });
});
