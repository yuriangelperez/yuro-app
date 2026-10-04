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
  list: (url: string, token: string, anio: number) =>
    call<{ movimientos: Movimiento[] }>(`${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}&anio=${anio}`, token).then((r) => r.movimientos),
  upsert: (url: string, token: string, anio: number, movimiento: Movimiento) => call(url, token, { action: 'upsert', anio, movimiento }),
  remove: (url: string, token: string, anio: number, id: string) => call(url, token, { action: 'delete', anio, id }),
};
