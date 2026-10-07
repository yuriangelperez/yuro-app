// Edge Function "mp-callback": a acá vuelve Mercado Pago después de que autorizás la app.
// Desplegar con "Verify JWT" DESACTIVADO (la llama el navegador, sin sesión). La seguridad es el `state` firmado.
import { createClient } from 'npm:@supabase/supabase-js@2';

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desb64u = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

async function hmac(clave: string, texto: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
}

const redirigir = (volver: string, params: Record<string, string>) => {
  const u = new URL(volver);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  const [payload, firma] = state.split('.');
  const secreto = Deno.env.get('STATE_SECRET')!;

  if (!payload || !firma || firma !== (await hmac(secreto, payload))) return new Response('state inválido', { status: 400 });
  const { u: uid, v: volver, e: expira } = JSON.parse(desb64u(payload)) as { u: string; v: string; e: number };
  if (Date.now() > expira) return redirigir(volver, { mp: 'error', msg: 'La autorización venció, probá de nuevo' });
  if (!code) return redirigir(volver, { mp: 'error', msg: url.searchParams.get('error_description') ?? 'Mercado Pago no devolvió el código' });

  try {
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-callback`;
    const r = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('MP_CLIENT_ID'), client_secret: Deno.env.get('MP_CLIENT_SECRET'), grant_type: 'authorization_code',
        code, redirect_uri: redirectUri, code_verifier: await hmac(secreto, `pkce|${state}`),
      }),
    });
    const tok = await r.json();
    if (!r.ok || !tok.access_token) throw new Error(`Mercado Pago respondió ${r.status}: ${JSON.stringify(tok).slice(0, 300)}`);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'yuro' } });
    const { error } = await admin.from('conexiones_mp').upsert({
      user_id: uid, mp_user_id: tok.user_id, access_token: tok.access_token, refresh_token: tok.refresh_token ?? null,
      expira_en: new Date(Date.now() + (tok.expires_in ?? 15552000) * 1000).toISOString(),
      reportes_procesados: [], ultimo_reporte_pedido: null, ultima_sync: null, created_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return redirigir(volver, { mp: 'ok' });
  } catch (e) {
    return redirigir(volver, { mp: 'error', msg: e instanceof Error ? e.message : String(e) });
  }
});
