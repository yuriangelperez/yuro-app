import Svg, { Path } from 'react-native-svg';
import { c } from './theme';

// Íconos de línea propios (24×24, trazo de 2). Reemplazan a los emojis en categorías y botones.
// Usan react-native-svg, que ya está en el proyecto (lo usa charts.tsx).
export const ICONOS = {
  // Categorías
  comida: 'M7 2v9M5 2v5a2 2 0 0 0 4 0V2M7 11v11M17 2c-2 1.5-3 4-3 7h3v13',
  transporte: 'M6 3h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM4 11h16M8 18v3M16 18v3M8 14.5h.01M16 14.5h.01',
  servicios: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  suscripcion: 'M4 7h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM8 3l4 4 4-4M10 11v5l4-2.5z',
  animales: 'M5 12a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 5 12zM9 8a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 9 8zM15 8a1.6 1.6 0 1 0 0-3.2A1.6 1.6 0 0 0 15 8zM19 12a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM12 11c-2.5 0-5 3.5-5 6a2.5 2.5 0 0 0 3 2.4c.7-.2 1.3-.4 2-.4s1.3.2 2 .4a2.5 2.5 0 0 0 3-2.4c0-2.5-2.5-6-5-6z',
  cuota: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM2 10h20M6 15h4',
  extra: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
  sueldo: 'M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18',
  ventas: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  casa: 'M3 11l9-8 9 8M5 9.5V20h5v-6h4v6h5V9.5',
  salud: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  compras: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  educacion: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  regalo: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  viaje: 'M2 16l20-8-4 12-5-4-3 3v-5l8-6M2 16l5 2',
  cafe: 'M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v3M10 2v3M14 2v3',
  auto: 'M5 17H3v-5l2-5h14l2 5v5h-2M3 12h18M7 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM13 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  billetera: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01',
  ahorro: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v12M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.5 1.3 2 3 2.5 3 1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5',
  escudo: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z',
  transferir: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  cambio: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  usuario: 'M20 21a8 8 0 0 0-16 0M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  // Interfaz
  mas: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5L20 7',
  cerrar: 'M18 6L6 18M6 6l12 12',
  atras: 'M15 18l-6-6 6-6',
  adelante: 'M9 18l6-6-6-6',
  abajo: 'M6 9l6 6 6-6',
  calendario: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
  repetir: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  alerta: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  ojo: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  ojoNo: 'M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22',
  basura: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  grilla: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  buscar: 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3',
  filtro: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  puntos: 'M12 5h.01M12 12h.01M12 19h.01',
  lista: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grafico: 'M18 20V10M12 20V4M6 20v-6',
  ajustes: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  calculadora: 'M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01',
  banco: 'M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3',
  objetivo: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  tendencia: 'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6',
  carpeta: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  reloj: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
  lapiz: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  celular: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
  billete: 'M2 6h20v12H2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 12h.01M18 12h.01',
  idea: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  campana: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  sube: 'M12 19V5M5 12l7-7 7 7',
  baja: 'M12 5v14M19 12l-7 7-7-7',
  bajar: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  subir: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  pulso: 'M22 12h-4l-3 9L9 3l-3 9H2',
  nube: 'M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  candado: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
  moneda: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 7v10M9 9.5h4.5a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5H15',
} as const;

export type NombreIcono = keyof typeof ICONOS;

// Puente mientras dura la migración: las pantallas que todavía pasan un emoji reciben su ícono de línea.
const DE_EMOJI: Record<string, NombreIcono> = {
  '🧮': 'calculadora', '💵': 'billete', '🏦': 'banco', '🎯': 'objetivo', '🗓': 'calendario', '📅': 'calendario', '📆': 'calendario',
  '🗂': 'carpeta', '🤝': 'usuario', '📈': 'tendencia', '📉': 'tendencia', '🔁': 'repetir', '👛': 'billetera', '💰': 'billetera', '🐷': 'ahorro',
  '💳': 'cuota', '💡': 'idea', '🧠': 'idea', '⚙': 'ajustes', '🗑': 'basura', '🩺': 'pulso', '📥': 'bajar', '📤': 'subir', '✨': 'extra',
  '⬆': 'sube', '⬇': 'baja', '⏳': 'reloj', '📱': 'celular', '🔮': 'tendencia', '🧾': 'tag', '🏆': 'check', '🔔': 'campana', '☁': 'nube',
  '🔒': 'candado', '🔐': 'candado', '🪙': 'moneda', '💱': 'cambio', '🔄': 'cambio', '↔': 'transferir', '📋': 'lista', '📊': 'grafico', '🏠': 'casa',
  '✏': 'lapiz', '📝': 'lapiz', '⚠': 'alerta', '✅': 'check', '👤': 'usuario', '🔑': 'candado', '📌': 'tag',
};
export const iconoDe = (emoji: string): NombreIcono => (emoji in ICONOS ? (emoji as NombreIcono) : DE_EMOJI[emoji.replace(/\uFE0F/g, '')] ?? 'tag');

// Íconos que se ofrecen al crear o editar una categoría.
export const ICONOS_CATEGORIA: NombreIcono[] = ['comida', 'transporte', 'servicios', 'suscripcion', 'animales', 'cuota', 'extra', 'sueldo', 'ventas', 'casa', 'salud', 'compras', 'educacion', 'regalo', 'viaje', 'cafe', 'auto', 'billetera'];

export const Icono = ({ nombre, color = c.text, size = 22, grosor = 2 }: { nombre: NombreIcono | string; color?: string; size?: number; grosor?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round">
    <Path d={ICONOS[nombre as NombreIcono] ?? ICONOS.tag} />
  </Svg>
);

// Ícono de una cuenta según su tipo, y de un método de pago según su nombre.
export const iconoCuenta = (x: { tipo: string }): NombreIcono =>
  x.tipo === 'cash' ? 'billete' : x.tipo === 'bank' ? 'banco' : x.tipo === 'exchange' ? 'moneda' : x.tipo === 'savings' ? 'ahorro' : x.tipo === 'investment' ? 'tendencia' : x.tipo === 'payment' ? 'cuota' : 'celular';
export const iconoMetodo = (nombre: string): NombreIcono => {
  const n = nombre.toLowerCase();
  return n.includes('efectivo') ? 'billete' : n.includes('tarjeta') ? 'cuota' : n.includes('binance') ? 'moneda' : /banco|brubank|santander|galicia|bbva|macro|nacion/.test(n) ? 'banco' : 'celular';
};
