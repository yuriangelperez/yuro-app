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
};

// Opciones iniciales; se completan con los valores que ya existan en tu hoja.
export const METODOS = ['Efectivo', 'Mercado pago', 'Tarjeta credito', 'Tarjeta debito', 'Paypal', 'Binance'];
export const CATEGORIAS = ['Sueldo', 'Reserva', 'Cuota', 'Comida', 'Suscripción', 'Servicios', 'Transporte', 'Ahorro', 'Animales', 'Extra'];
export const CATEGORIAS2 = ['Extra'];

type Info = { emoji: string; color: string };

const clave = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CAT_INFO: Record<string, Info> = {
  sueldo: { emoji: '💼', color: '#2ecc8f' },
  reserva: { emoji: '🏦', color: '#5dade2' },
  cuota: { emoji: '💳', color: '#af7ac5' },
  comida: { emoji: '🍔', color: '#ff8a5c' },
  suscripcion: { emoji: '📺', color: '#e056fd' },
  servicios: { emoji: '💡', color: '#4d9de0' },
  transporte: { emoji: '🚌', color: '#48c9b0' },
  ahorro: { emoji: '🐷', color: '#f5c542' },
  animales: { emoji: '🐾', color: '#a3cb38' },
  extra: { emoji: '✨', color: '#ff4fa3' },
  cambio: { emoji: '🔄', color: '#5dade2' },
  'sin categoria': { emoji: '❔', color: '#8a97a6' },
};

const MET_INFO: Record<string, Info> = {
  efectivo: { emoji: '💵', color: '#2ecc8f' },
  'mercado pago': { emoji: '📱', color: '#5dade2' },
  'tarjeta credito': { emoji: '💳', color: '#af7ac5' },
  'tarjeta debito': { emoji: '🏧', color: '#4d9de0' },
  paypal: { emoji: '🅿️', color: '#3b7bbf' },
  binance: { emoji: '🪙', color: '#f5c542' },
};

const PALETA = ['#ff8a5c', '#5dade2', '#af7ac5', '#48c9b0', '#e056fd', '#a3cb38', '#f5c542', '#ff4fa3', '#4d9de0', '#ff5d6c'];

// Categorías que no estén en la lista reciben un color estable según su nombre.
const porNombre = (s: string): Info => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return { emoji: '🏷️', color: PALETA[Math.abs(h) % PALETA.length] };
};

export const catInfo = (nombre: string) => CAT_INFO[clave(nombre || 'sin categoria')] ?? porNombre(nombre);
export const metInfo = (nombre: string) => MET_INFO[clave(nombre)] ?? { ...porNombre(nombre), emoji: '💰' };
