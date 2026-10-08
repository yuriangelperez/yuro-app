// Transferencia: plata que pasa de una cuenta propia a otra. No es ingreso ni gasto (valor = monto, positivo).
// Deuda / Pago deuda: préstamos y sus pagos (ver deudas.ts). Tampoco son ingreso ni gasto.
export type Tipo = 'Ingreso' | 'Egreso' | 'Ahorro' | 'Cambio' | 'Transferencia' | 'Deuda' | 'Pago deuda';
export type Moneda = 'ARS' | 'USD' | 'USDT';
export type Origen = 'manual' | 'importacion' | 'mercadopago' | 'notificacion' | 'recurrente';
export const MONEDAS: Moneda[] = ['ARS', 'USD', 'USDT'];

// Una fila de la pestaña del año (ej. "2026"). Columnas: A Fecha, B Concepto, C Valor,
// D Tipo, E Método, F Categoría, G Categoría 2, H Cuotas cumplidas, I Cuotas totales, J Moneda.
export interface Movimiento {
  id: string; // "fila|fecha|concepto" (o "n-…" si todavía no está en la hoja)
  fecha: string; // YYYY-MM-DD
  hora?: string | null; // HH:MM (hora argentina); solo en movimientos de la nube, importados o cargados desde la app
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
  // Solo en la nube / modo sin hoja: cuenta de origen (o donde se hizo el movimiento) y destino de una Transferencia
  cuentaId?: string | null;
  cuentaDestinoId?: string | null;
  deudaId?: string | null; // deuda a la que pertenece (tipos Deuda y Pago deuda)
  origen?: Origen; // de dónde llegó (undefined = manual)
  externalId?: string | null; // id del proveedor (ej. Mercado Pago) para no duplicar
}
