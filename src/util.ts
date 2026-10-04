export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const p2 = (n: number) => String(n).padStart(2, '0');

// Fecha local (no UTC): evita que de noche caiga en el día siguiente.
export const hoyYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
export const mesActual = () => hoyYmd().slice(0, 7);
export const etiquetaMes = (ym: string) => `${MESES[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
export const sumaMes = (ym: string, delta: number) => {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5) - 1 + delta, 1);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`;
};
export const fechaCorta = (f: string) => `${+f.slice(8)}/${+f.slice(5, 7)}/${f.slice(0, 4)}`;

// $1.060.000 (formato de la hoja: punto de miles)
export const money = (n: number) => {
  const abs = Math.abs(Math.round(n * 100) / 100);
  const [ent, dec] = abs.toFixed(2).split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}$${miles}${dec === '00' ? '' : ',' + dec}`;
};
