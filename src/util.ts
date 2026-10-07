import type { Moneda } from './types';

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const p2 = (n: number) => String(n).padStart(2, '0');

// Fecha local (no UTC): evita que de noche caiga en el día siguiente.
export const hoyYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
export const horaAhora = () => {
  const d = new Date();
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
// Más reciente primero: por fecha y, dentro del día, por hora
export const masReciente = (a: { fecha: string; hora?: string | null }, b: { fecha: string; hora?: string | null }) =>
  b.fecha.localeCompare(a.fecha) || (b.hora ?? '').localeCompare(a.hora ?? '');
export const mesActual = () => hoyYmd().slice(0, 7);
export const etiquetaMes = (ym: string) => `${MESES[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
export const sumaMes = (ym: string, delta: number) => {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5) - 1 + delta, 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
};
export const fechaCorta = (f: string) => `${+f.slice(8)}/${+f.slice(5, 7)}/${f.slice(0, 4)}`;

const PREFIJO: Record<Moneda, string> = { ARS: '$', USD: 'US$', USDT: '₮' };

// $1.060.000 (formato de la hoja: punto de miles) · US$ 120,50 · ₮ 300
export const money = (n: number, moneda: Moneda = 'ARS') => {
  const abs = Math.abs(Math.round(n * 100) / 100);
  const [ent, dec] = abs.toFixed(2).split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${PREFIJO[moneda]}${moneda === 'ARS' ? '' : ' '}${miles}${dec === '00' ? '' : ',' + dec}`;
};

// $1,2M / $350k para ejes y gráficos chicos
export const moneyCorto = (n: number, moneda: Moneda = 'ARS') => {
  const a = Math.abs(n);
  const t = a >= 1e6 ? `${(a / 1e6).toFixed(1).replace('.', ',').replace(',0', '')}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : `${Math.round(a)}`;
  return `${n < 0 ? '-' : ''}${PREFIJO[moneda]}${t}`;
};

export const diasDelMes = (ym: string) => new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate();

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// "Hoy", "Ayer" o "Martes 3"
export const etiquetaDia = (f: string) => {
  const hoy = hoyYmd();
  const d = new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8));
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  if (f === hoy) return 'Hoy';
  if (f === `${ayer.getFullYear()}-${p2(ayer.getMonth() + 1)}-${p2(ayer.getDate())}`) return 'Ayer';
  return `${DIAS[d.getDay()]} ${d.getDate()}`;
};

export const ymdMenos = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

export const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

// Lee montos escritos a mano: "1.057.000", "1057000,50", "$ 1.057.000", "190.5", "-300".
// Con coma, la coma es decimal y los puntos son de miles. Sin coma, un punto seguido de 3 dígitos es de miles.
export const parseMonto = (t: string) => {
  let x = t.replace(/[^\d.,-]/g, '');
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  else if ((x.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(x)) x = x.replace(/\./g, '');
  const n = parseFloat(x);
  return isNaN(n) ? null : n;
};
