export const c = {
  bg: '#0b0f14',
  card: '#151b23',
  border: '#232c37',
  text: '#f2f5f8',
  muted: '#8a97a6',
  ingreso: '#2ecc8f',
  gasto: '#ff5d6c',
  accent: '#6c8cff',
};

export const CATEGORIAS_GASTO = ['Comida', 'Transporte', 'Casa', 'Servicios', 'Salud', 'Ocio', 'Compras', 'Otros'];
export const CATEGORIAS_INGRESO = ['Sueldo', 'Ventas', 'Otros'];

export const money = (n: number) =>
  new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
