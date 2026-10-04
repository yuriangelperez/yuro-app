export type Tipo = 'gasto' | 'ingreso';

export interface Movimiento {
  id: string;
  fecha: string; // YYYY-MM-DD
  tipo: Tipo;
  categoria: string;
  descripcion: string;
  monto: number;
  cuenta: string;
}
