export const c = {
  bg: '#0b0f14',
  card: '#151b23',
  card2: '#1c242e',
  border: '#232c37',
  text: '#f2f5f8',
  muted: '#8a97a6',
  ingreso: '#2ecc8f',
  gasto: '#ff5d6c',
  ahorro: '#f5c542',
  aviso: '#ffa94d',
  accent: '#ff4fa3', // rosa de tu hoja
  transferencia: '#5dade2', // cambios y transferencias entre cuentas propias
  deuda: '#af7ac5',
  reserva: '#48c9b0',
  // Texto sobre fondos de color (botones, chips elegidos). El blanco no llega a 4,5:1 sobre rosa, verde ni amarillo.
  sobre: '#0b0f14',
};

// Versión translúcida de un color de la paleta, para fondos de chips y tarjetas elegidas.
export const suave = (color: string, alfa = '24') => color + alfa;

// Escalas del sistema de diseño (ver propuesta de rediseño). Usarlas en código nuevo en lugar de números sueltos.
export const esp = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const radio = { s: 8, m: 12, l: 16, total: 999 } as const;
export const tipo = {
  heroe: { fontSize: 36, lineHeight: 40, fontWeight: '700' },
  t1: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  t2: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  cuerpo: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  sub: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  etiqueta: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
} as const;
// Alto mínimo para algo que se toca.
export const TOQUE = 44;

// Opciones iniciales; se completan con los valores que ya existan en tu hoja.
export const METODOS = ['Efectivo', 'Mercado pago', 'Tarjeta credito', 'Tarjeta debito', 'Paypal', 'Binance'];
export const CATEGORIAS = ['Sueldo', 'Reserva', 'Cuota', 'Comida', 'Suscripción', 'Servicios', 'Transporte', 'Ahorro', 'Animales', 'Extra'];
export const CATEGORIAS2 = ['Extra'];

type Info = { emoji: string; color: string; icono?: string };

const clave = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CAT_INFO: Record<string, Info> = {
  sueldo: { emoji: '💼', color: '#2ecc8f', icono: 'sueldo' },
  reserva: { emoji: '🏦', color: '#5dade2', icono: 'escudo' },
  cuota: { emoji: '💳', color: '#af7ac5', icono: 'cuota' },
  comida: { emoji: '🍔', color: '#ff8a5c', icono: 'comida' },
  suscripcion: { emoji: '📺', color: '#e056fd', icono: 'suscripcion' },
  servicios: { emoji: '💡', color: '#4d9de0', icono: 'servicios' },
  transporte: { emoji: '🚌', color: '#48c9b0', icono: 'transporte' },
  ahorro: { emoji: '🐷', color: '#f5c542', icono: 'ahorro' },
  animales: { emoji: '🐾', color: '#a3cb38', icono: 'animales' },
  extra: { emoji: '✨', color: '#ff4fa3', icono: 'extra' },
  cambio: { emoji: '🔄', color: '#5dade2', icono: 'cambio' },
  transferencia: { emoji: '↔️', color: '#5dade2', icono: 'transferir' },
  deuda: { emoji: '🤝', color: '#af7ac5', icono: 'usuario' },
  'sin categoria': { emoji: '❔', color: '#8a97a6', icono: 'tag' },
};

const MET_INFO: Record<string, Info> = {
  efectivo: { emoji: '💵', color: '#2ecc8f' },
  'mercado pago': { emoji: '📱', color: '#5dade2' },
  'tarjeta credito': { emoji: '💳', color: '#af7ac5' },
  'tarjeta debito': { emoji: '🏧', color: '#4d9de0' },
  paypal: { emoji: '🅿️', color: '#3b7bbf' },
  binance: { emoji: '🪙', color: '#f5c542' },
};

export const PALETA = ['#ff8a5c', '#5dade2', '#af7ac5', '#48c9b0', '#e056fd', '#a3cb38', '#f5c542', '#ff4fa3', '#4d9de0', '#ff5d6c'];

// Categorías que no estén en la lista reciben un color estable según su nombre.
const porNombre = (s: string): Info => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return { emoji: '🏷️', color: PALETA[Math.abs(h) % PALETA.length], icono: 'tag' };
};

// Ícono y color que elegiste para una categoría (Ajustes › Categorías). Los carga el store al arrancar y en cada cambio.
export type EstiloCategoria = { icono?: string; color?: string };
let ESTILOS: Record<string, EstiloCategoria> = {};
export const setEstilosCategoria = (m: Record<string, EstiloCategoria>) => { ESTILOS = m; };
export const claveCategoria = (nombre: string) => clave(nombre || 'sin categoria');

export const catInfo = (nombre: string): Info => {
  const k = claveCategoria(nombre);
  const base = CAT_INFO[k] ?? porNombre(nombre);
  const e = ESTILOS[k];
  return e ? { ...base, icono: e.icono ?? base.icono, color: e.color ?? base.color } : base;
};
export const metInfo = (nombre: string) => MET_INFO[clave(nombre)] ?? { ...porNombre(nombre), emoji: '💰' };
