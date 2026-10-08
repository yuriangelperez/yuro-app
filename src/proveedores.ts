import type { Moneda } from './types';

// Catálogo de proveedores (espejo de yuro.proveedores). Se usa para sugerir proveedor y tipo al crear una cuenta
// y para reconocer de qué proveedor es un "método" escrito a mano.

export type TipoCuenta = 'bank' | 'wallet' | 'cash' | 'payment' | 'exchange' | 'savings' | 'investment';
export type Proveedor = { id: string; nombre: string; tipo: TipoCuenta; emoji: string; alias: string[] };

export const TIPOS_CUENTA: { t: TipoCuenta; label: string }[] = [
  { t: 'wallet', label: '📱 Billetera' },
  { t: 'bank', label: '🏦 Banco' },
  { t: 'cash', label: '💵 Efectivo' },
  { t: 'payment', label: '🅿️ Pagos' },
  { t: 'exchange', label: '🪙 Exchange' },
  { t: 'savings', label: '🐷 Ahorros' },
  { t: 'investment', label: '📈 Inversión' },
];

export const PROVEEDORES: Proveedor[] = [
  { id: 'efectivo', nombre: 'Efectivo', tipo: 'cash', emoji: '💵', alias: ['efectivo', 'cash'] },
  { id: 'mercadopago', nombre: 'Mercado Pago', tipo: 'wallet', emoji: '📱', alias: ['mercado pago', 'mercadopago', 'mp'] },
  { id: 'naranjax', nombre: 'Naranja X', tipo: 'wallet', emoji: '🟠', alias: ['naranja x', 'naranjax', 'naranja'] },
  { id: 'uala', nombre: 'Ualá', tipo: 'wallet', emoji: '💜', alias: ['uala', 'ualá'] },
  { id: 'brubank', nombre: 'Brubank', tipo: 'bank', emoji: '🏦', alias: ['brubank'] },
  { id: 'santander', nombre: 'Santander', tipo: 'bank', emoji: '🏦', alias: ['santander'] },
  { id: 'galicia', nombre: 'Galicia', tipo: 'bank', emoji: '🏦', alias: ['galicia'] },
  { id: 'bbva', nombre: 'BBVA', tipo: 'bank', emoji: '🏦', alias: ['bbva'] },
  { id: 'macro', nombre: 'Banco Macro', tipo: 'bank', emoji: '🏦', alias: ['macro'] },
  { id: 'nacion', nombre: 'Banco Nación', tipo: 'bank', emoji: '🏦', alias: ['banco nacion', 'bna'] },
  { id: 'paypal', nombre: 'PayPal', tipo: 'payment', emoji: '🅿️', alias: ['paypal'] },
  { id: 'binance', nombre: 'Binance', tipo: 'exchange', emoji: '🪙', alias: ['binance'] },
  { id: 'lemon', nombre: 'Lemon', tipo: 'exchange', emoji: '🍋', alias: ['lemon'] },
  { id: 'belo', nombre: 'Belo', tipo: 'exchange', emoji: '🪙', alias: ['belo'] },
];

const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export const proveedorDe = (nombre: string): Proveedor | null => {
  const n = sinTildes(nombre);
  return PROVEEDORES.find((p) => p.alias.some((a) => n === sinTildes(a))) ?? PROVEEDORES.find((p) => p.alias.some((a) => a.length > 3 && n.includes(sinTildes(a)))) ?? null;
};

// Tipo de cuenta que más probablemente corresponde a un nombre escrito a mano ("Tarjeta credito", "Banco X"…)
export const tipoSugerido = (nombre: string): TipoCuenta => {
  const p = proveedorDe(nombre);
  if (p) return p.tipo;
  const n = sinTildes(nombre);
  if (/tarjeta|banco|caja de ahorro|cuenta corriente/.test(n)) return 'bank';
  if (/ahorro/.test(n)) return 'savings';
  return 'wallet';
};

export type Cuenta = {
  id: string;
  nombre: string;
  proveedorId: string | null;
  tipo: TipoCuenta;
  moneda: Moneda; // moneda habitual
  saldoInicial: number;
  activa: boolean;
};

export const emojiCuenta = (c: Pick<Cuenta, 'proveedorId' | 'tipo' | 'nombre'>) =>
  PROVEEDORES.find((p) => p.id === c.proveedorId)?.emoji ?? proveedorDe(c.nombre)?.emoji ?? TIPOS_CUENTA.find((t) => t.t === c.tipo)?.label.split(' ')[0] ?? '💰';
