import type { Movimiento } from './types';

// Cliente del Web App de Google Apps Script (ver apps-script/Code.gs).
// POST como text/plain para evitar el preflight CORS (Apps Script no responde OPTIONS).
async function call<T>(url: string, token: string, body?: object): Promise<T> {
  const res = body
    ? await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token, ...body }) })
    : await fetch(`${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json as T;
}

export const sheets = {
  list: (url: string, token: string) => call<{ movimientos: Movimiento[] }>(url, token).then((r) => r.movimientos),
  upsert: (url: string, token: string, m: Movimiento) => call(url, token, { action: 'upsert', movimiento: m }),
  remove: (url: string, token: string, id: string) => call(url, token, { action: 'delete', id }),
};
