import type { Movimiento } from './types';

// Cliente del Web App de Google Apps Script (ver apps-script/Code.gs).
// POST como text/plain para evitar el preflight CORS (Apps Script no responde OPTIONS).
async function call<T>(url: string, token: string, body?: object): Promise<T> {
  const res = body
    ? await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token, ...body }) })
    : await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json as T;
}

export const sheets = {
  // version: la de Code.gs publicada (0 = anterior a las monedas: no lee ni guarda la columna J)
  list: (url: string, token: string, anio: number) =>
    call<{ movimientos: Movimiento[]; version?: number }>(`${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}&anio=${anio}`, token).then((r) => ({
      version: r.version ?? 0,
      movimientos: r.movimientos.map((m) => ({ ...m, moneda: m.moneda || 'ARS' })),
    })),
  // `id` (fila|fecha|concepto) solo viene con la versión nueva de Code.gs
  upsert: (url: string, token: string, anio: number, movimiento: Movimiento) => call<{ ok: boolean; id?: string }>(url, token, { action: 'upsert', anio, movimiento }),
  remove: (url: string, token: string, anio: number, id: string) => call(url, token, { action: 'delete', anio, id }),
};
