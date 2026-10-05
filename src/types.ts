export type Tipo = 'Ingreso' | 'Egreso' | 'Ahorro' | 'Cambio';
export type Moneda = 'ARS' | 'USD' | 'USDT';
export const MONEDAS: Moneda[] = ['ARS', 'USD', 'USDT'];

// Una fila de la pestaña del año (ej. "2026"). Columnas: A Fecha, B Concepto, C Valor,
// D Tipo, E Método, F Categoría, G Categoría 2, H Cuotas cumplidas, I Cuotas totales, J Moneda.
export interface Movimiento {
  id: string; // "fila|fecha|concepto" (o "n-…" si todavía no está en la hoja)
  fecha: string; // YYYY-MM-DD
  concepto: string;
  valor: number; // con signo, igual que en la hoja: egresos negativos
  tipo: Tipo;
  metodo: string;
  categoria: string;
  categoria2: string;
  cuotasCumplidas: number | null;
  cuotasTotales: number | null;
  moneda: Moneda; // vacío en la hoja = ARS
  valorArs?: number | null; // equivalente en pesos (columna C de la hoja); en ARS es igual a valor
}
