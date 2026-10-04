export type Tipo = 'Ingreso' | 'Egreso' | 'Ahorro' | 'Cambio';

// Una fila de la pestaña del año (ej. "2026"). Columnas: A Fecha, B Concepto, C Valor,
// D Tipo, E Método, F Categoría, G Categoría 2, H Cuotas cumplidas, I Cuotas totales.
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
}
