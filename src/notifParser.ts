import type { Moneda } from './types';
import { parseMonto } from './util';

// Traduce el texto de una notificación bancaria a un movimiento. Los textos reales de cada app cambian con el tiempo:
// por eso las reglas son genéricas (verbos + importe) y lo que no se entiende queda a la vista en Ajustes.

export type Interpretada = { valor: number; moneda: Moneda; concepto: string };

const EGRESO = /(?<![a-záéíóúñ])(pagaste|enviaste|transferiste|compraste|retiraste|extrajiste|pagamos|debitamos|se debit[oó]|d[eé]bito|consumo|compra|pago realizado|pago enviado|transferencia enviada|transferencia realizada|extracci[oó]n)(?![a-záéíóúñ])/i;
const INGRESO = /(?<![a-záéíóúñ])(recibiste|te pagaron|te enviaron|te envi[oó]|te transfirieron|te transfiri[oó]|te depositaron|te mandaron|te mand[oó]|te pag[oó]|cobraste|acreditamos|se acredit[oó]|acreditaci[oó]n|dep[oó]sito recibido|ingres[oó]|transferencia recibida|pago recibido|cobro)(?![a-záéíóúñ])/i; // \b no sirve con acentos ("acreditó")
const IMPORTE = /(US\$|U\$S|USD|u\$s|ARS|\$)\s*([\d]+(?:[.,]\d+)*)/i;

const limpiar = (t: string) => t.replace(/\s+/g, ' ').replace(/[.:,;\s]+$/, '').trim();

export function interpretar(app: string, titulo: string, texto: string): Interpretada | null {
  const completo = `${titulo}. ${texto}`.replace(/\s+/g, ' ');
  const imp = completo.match(IMPORTE);
  if (!imp) return null;
  const monto = parseMonto(imp[2]);
  if (!monto || monto <= 0) return null;

  // Si aparecen verbos de los dos tipos, manda el que aparece primero ("Pagaste $100 … te devolvimos" no es ingreso)
  const e = completo.search(EGRESO);
  const i = completo.search(INGRESO);
  if (e < 0 && i < 0) return null; // promociones, avisos de seguridad, etc.
  const esIngreso = i >= 0 && (e < 0 || i < e);

  const moneda: Moneda = /US\$|U\$S|USD/i.test(imp[1]) ? 'USD' : 'ARS';
  const despuesDelImporte = completo.slice((imp.index ?? 0) + imp[0].length);
  let otro: string | undefined;
  if (esIngreso) {
    otro = despuesDelImporte.match(/^\s*(?:de|por parte de)\s+(.+?)(?:\.|,| en | por | desde |$)/i)?.[1]
      ?? completo.match(/^(?:[^.]*\.\s*)?([A-ZÁÉÍÓÚÑ][^.$]{2,40}?)\s+te\s+(?:envi[oó]|transfiri[oó]|pag[oó]|mand[oó])/)?.[1];
  } else {
    otro = despuesDelImporte.match(/^\s*(?:a|en|para)\s+(.+?)(?:\.|,| con | desde | por | usando |$)/i)?.[1];
  }
  const nombre = limpiar(otro ?? '');
  const concepto = nombre ? (esIngreso ? `Cobro de ${nombre}` : nombre) : `${esIngreso ? 'Cobro' : 'Pago'} · ${app}`;
  return { valor: esIngreso ? monto : -monto, moneda, concepto };
}

// Apps que se escuchan (por nombre o paquete). Todo lo demás se ignora y ni siquiera se guarda.
export const PALABRAS_APPS = [
  'mercadopago', 'mercado pago', 'uala', 'ualá', 'brubank', 'naranja', 'galicia', 'santander', 'bbva', 'macro', 'bna+', 'icbc', 'hsbc',
  'supervielle', 'lemon', 'belo', 'personal pay', 'personalpay', 'cuenta dni', 'cuentadni', 'astropay', 'binance', 'paypal', 'revolut', 'prex',
];
