// Edge Function "mp-api": conectar, sincronizar y desconectar Mercado Pago (solo lectura de movimientos).
// Desplegar con "Verify JWT" ACTIVADO: la llama la app con la sesión del usuario.
// Secretos necesarios: MP_CLIENT_ID, MP_CLIENT_SECRET, STATE_SECRET (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen).
import { createClient } from 'npm:@supabase/supabase-js@2';

const MP = 'https://api.mercadopago.com';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, 'Content-Type': 'application/json' } });

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(clave: string, texto: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'yuro' } });

type Conexion = { user_id: string; mp_user_id: number; access_token: string; refresh_token: string | null; expira_en: string | null; ultima_sync: string | null; created_at: string; reportes_procesados: string[]; ultimo_reporte_pedido: string | null };

const mp = (path: string, token: string, init?: RequestInit) =>
  fetch(`${MP}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } });
const fallo = async (r: Response, que: string) => new Error(`${que}: Mercado Pago respondió ${r.status} ${(await r.text()).slice(0, 300)}`);

// El token dura ~6 meses: se renueva solo cuando falta poco.
async function tokenVigente(c: Conexion): Promise<string> {
  if (!c.expira_en || Date.parse(c.expira_en) - Date.now() > 24 * 3600_000) return c.access_token;
  if (!c.refresh_token) throw new Error('La conexión con Mercado Pago venció: volvé a conectarla');
  const r = await fetch(`${MP}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: Deno.env.get('MP_CLIENT_ID'), client_secret: Deno.env.get('MP_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: c.refresh_token }),
  });
  if (!r.ok) throw await fallo(r, 'No se pudo renovar la conexión, volvé a conectar Mercado Pago');
  const t = await r.json();
  await admin.from('conexiones_mp').update({
    access_token: t.access_token, refresh_token: t.refresh_token ?? c.refresh_token, expira_en: new Date(Date.now() + (t.expires_in ?? 15552000) * 1000).toISOString(),
  }).eq('user_id', c.user_id);
  return t.access_token;
}

// ───────── CSV del reporte "dinero en cuenta" ─────────

function parseCsv(texto: string): string[][] {
  texto = texto.replace(/^﻿/, '');
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const fuera = (l: string) => l.replace(/"[^"]*"/g, '');
  const sep = [',', ';', '\t'].map((d) => ({ d, n: lineas.reduce((a, l) => a + fuera(l).split(d).length - 1, 0) })).sort((x, y) => y.n - x.n)[0].d;
  const filas: string[][] = [];
  let fila: string[] = [], celda = '', comillas = false;
  const cierraCelda = () => { fila.push(celda); celda = ''; };
  const cierraFila = () => { cierraCelda(); if (fila.some((x) => x.trim())) filas.push(fila); fila = []; };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) { if (ch === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false; } else celda += ch; }
    else if (ch === '"') comillas = true;
    else if (ch === sep) cierraCelda();
    else if (ch === '\n') cierraFila();
    else if (ch !== '\r') celda += ch;
  }
  if (celda || fila.length) cierraFila();
  return filas;
}

// El reporte trae fecha y hora con zona (ej. 2026-10-05T10:00:00Z o ...-04:00): se muestra en hora argentina.
const AR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function fechaHoraAr(texto: string): { fecha: string; hora: string | null } {
  const conHora = /T\d{2}:\d{2}/.test(texto) || /\d{2}:\d{2}/.test(texto);
  const t = Date.parse(texto);
  if (!conHora || isNaN(t)) return { fecha: texto.slice(0, 10), hora: null };
  const p = Object.fromEntries(AR.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

const TRADUCCION: Record<string, string> = {
  payment: 'Pago', refund: 'Devolución', payout: 'Retiro a cuenta bancaria', chargeback: 'Contracargo', withdrawal: 'Retiro', transfer: 'Transferencia',
  asset_management: 'Rendimientos', shipping: 'Envío', fee: 'Comisión',
};
const humanizar = (d: string) => (d ? d.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Movimiento');

// El reporte solo dice "payment" + un número. Para saber qué fue (comercio, persona) se consulta cada pago, con un tope por sincronización.
type Detalle = { titulo?: string; contraparte?: string };
async function detalles(ids: string[], token: string, miId: number): Promise<Map<string, Detalle>> {
  const out = new Map<string, Detalle>();
  const usuarios = new Map<string, string | undefined>();
  const nombreDe = async (id: string | number | undefined) => {
    if (!id || String(id) === String(miId)) return undefined;
    const k = String(id);
    if (!usuarios.has(k)) {
      const r = await mp(`/users/${k}`, token);
      const u = r.ok ? await r.json() : null;
      usuarios.set(k, u ? ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.nickname) : undefined);
    }
    return usuarios.get(k);
  };
  const unicos = [...new Set(ids)].slice(0, 80);
  for (let i = 0; i < unicos.length; i += 5) {
    await Promise.all(unicos.slice(i, i + 5).map(async (id) => {
      try {
        const r = await mp(`/v1/payments/${id}`, token);
        if (!r.ok) return;
        const p = await r.json();
        const titulo = [p.description, p.additional_info?.items?.[0]?.title, p.statement_descriptor].find((x) => typeof x === 'string' && x.trim() && !/^(pago|payment)$/i.test(x.trim()));
        const yoPago = String(p.payer?.id) === String(miId);
        const otro = yoPago
          ? await nombreDe(p.collector_id ?? p.collector?.id)
          : [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(' ') || p.payer?.email?.split('@')[0] || (await nombreDe(p.payer?.id));
        out.set(id, { titulo: titulo?.trim(), contraparte: otro || undefined });
      } catch { /* sin detalle: queda el nombre genérico */ }
    }));
  }
  return out;
}

async function importarCsv(uid: string, texto: string, token: string, miId: number): Promise<number> {
  const filas = parseCsv(texto);
  const cab = filas[0]?.map((h) => h.trim().toUpperCase()) ?? [];
  const col = (n: string) => cab.indexOf(n);
  const [iFecha, iCred, iDeb] = [col('DATE'), col('NET_CREDIT_AMOUNT'), col('NET_DEBIT_AMOUNT')];
  if (iFecha < 0 || iCred < 0 || iDeb < 0) throw new Error(`El reporte no trae las columnas esperadas (DATE, NET_CREDIT_AMOUNT, NET_DEBIT_AMOUNT). Encabezados: ${cab.join(', ').slice(0, 200)}`);
  const [iId, iTipo, iDesc] = [col('SOURCE_ID'), col('RECORD_TYPE'), col('DESCRIPTION')];

  type Fila = { fecha: string; hora: string | null; clave: string; id: string; tipoReg: string; desc: string; valor: number };
  const candidatas: Fila[] = [];
  for (const f of filas.slice(1)) {
    const bruta = f[iFecha] ?? '';
    const clave = bruta.slice(0, 10); // la clave anti-duplicados sigue usando el texto del reporte
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) continue;
    const tipoReg = (iTipo >= 0 ? f[iTipo] : '').toLowerCase();
    if (tipoReg.includes('balance') || tipoReg.includes('total')) continue; // saldos y totales no son movimientos
    const desc = iDesc >= 0 ? f[iDesc].trim() : '';
    if (desc.toLowerCase().startsWith('reserve_for')) continue; // reservas internas: entran y salen, no son plata tuya
    const valor = Math.round(((parseFloat(f[iCred]) || 0) - (parseFloat(f[iDeb]) || 0)) * 100) / 100;
    if (!valor) continue;
    const { fecha, hora } = fechaHoraAr(bruta);
    candidatas.push({ fecha, hora, clave, id: iId >= 0 ? f[iId].trim() : '', tipoReg, desc, valor });
  }
  const info = await detalles(candidatas.filter((c) => /^\d+$/.test(c.id) && ['payment', 'refund', 'chargeback'].includes(c.desc.toLowerCase())).map((c) => c.id), token, miId);

  const veces = new Map<string, number>();
  const nuevas: Record<string, unknown>[] = [];
  for (const c of candidatas) {
    const base = `mp|${c.id}|${c.tipoReg}|${c.desc}|${c.clave}|${c.valor}`;
    const k = veces.get(base) ?? 0;
    veces.set(base, k + 1);
    const d = info.get(c.id);
    const generico = TRADUCCION[c.desc.toLowerCase()] ?? humanizar(c.desc);
    const concepto = d?.titulo
      ? d.contraparte ? `${d.titulo} (${d.contraparte})` : d.titulo
      : d?.contraparte ? `${c.valor < 0 ? 'Pago a' : 'Cobro de'} ${d.contraparte}` : `Mercado Pago · ${generico}`;
    nuevas.push({
      user_id: uid, fecha: c.fecha, hora: c.hora, concepto, valor: c.valor, moneda: 'ARS', valor_ars: c.valor,
      tipo: c.valor > 0 ? 'Ingreso' : 'Egreso', metodo: 'Mercado pago', categoria: '', categoria2: '', origen: 'mercadopago', external_id: `${base}|${k}`,
    });
  }
  if (!nuevas.length) return 0;

  // Si ya cargaste a mano ese mismo movimiento (misma fecha e importe), no se duplica.
  const fechas = nuevas.map((n) => n.fecha as string).sort();
  const { data: previos } = await admin.from('movimientos').select('fecha,valor').eq('user_id', uid).neq('origen', 'mercadopago').gte('fecha', fechas[0]).lte('fecha', fechas[fechas.length - 1]);
  const manuales = new Map<string, number>();
  for (const p of previos ?? []) manuales.set(`${p.fecha}|${Number(p.valor)}`, (manuales.get(`${p.fecha}|${Number(p.valor)}`) ?? 0) + 1);
  const aInsertar = nuevas.filter((n) => {
    const k = `${n.fecha}|${n.valor}`;
    const q = manuales.get(k) ?? 0;
    if (q > 0) { manuales.set(k, q - 1); return false; }
    return true;
  });

  for (let i = 0; i < aInsertar.length; i += 500) {
    const { error } = await admin.from('movimientos').upsert(aInsertar.slice(i, i + 500), { onConflict: 'user_id,origen,external_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return aInsertar.length;
}

// ───────── Acciones ─────────

const VOLVER_OK = ['yuro://', 'exp://', 'http://localhost'];

async function conectar(uid: string, volver: string) {
  if (!VOLVER_OK.some((p) => volver.startsWith(p))) throw new Error('Destino de regreso no permitido');
  const secreto = Deno.env.get('STATE_SECRET')!;
  const payload = b64u(enc.encode(JSON.stringify({ u: uid, v: volver, e: Date.now() + 10 * 60_000 })));
  const state = `${payload}.${await hmac(secreto, payload)}`;
  const verifier = await hmac(secreto, `pkce|${state}`);
  const challenge = b64u(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  const q = new URLSearchParams({
    client_id: Deno.env.get('MP_CLIENT_ID')!, response_type: 'code', platform_id: 'mp', state,
    redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-callback`, code_challenge: challenge, code_challenge_method: 'S256',
  });
  return { url: `https://auth.mercadopago.com/authorization?${q}` };
}

// Mercado Pago genera el reporte de forma asíncrona: una llamada lo pide y las siguientes lo descargan cuando está listo.
async function sincronizar(uid: string) {
  const { data } = await admin.from('conexiones_mp').select('*').eq('user_id', uid).maybeSingle();
  if (!data) throw new Error('Mercado Pago no está conectado');
  const con = data as Conexion;
  const token = await tokenVigente(con);

  const rl = await mp('/v1/account/release_report/list', token);
  if (!rl.ok) throw await fallo(rl, 'No se pudo listar los reportes');
  const lista = (await rl.json()) as { file_name?: string; date_created?: string }[];

  let nuevos = 0;
  const hechos: string[] = [];
  for (const r of Array.isArray(lista) ? lista : []) {
    const f = r.file_name;
    if (!f || con.reportes_procesados.includes(f)) continue;
    const creado = Date.parse(r.date_created ?? '');
    if (!isNaN(creado) && creado < Date.parse(con.created_at) - 60_000) continue; // reportes viejos, anteriores a conectar
    const d = await mp(`/v1/account/release_report/${encodeURIComponent(f)}`, token);
    if (!d.ok) continue; // todavía se está generando
    nuevos += await importarCsv(uid, await d.text(), token, con.mp_user_id);
    hechos.push(f);
  }
  if (hechos.length) await admin.from('conexiones_mp').update({ reportes_procesados: [...con.reportes_procesados, ...hechos], ultima_sync: new Date().toISOString() }).eq('user_id', uid);

  // Un reporte solo cubre hasta el momento en que se pidió: siempre se pide uno nuevo para tener lo más reciente
  // (salvo que ya se haya pedido hace menos de 5 minutos y todavía se esté esperando).
  let pidio = false;
  const hacePoco = !!con.ultimo_reporte_pedido && Date.now() - Date.parse(con.ultimo_reporte_pedido) < 5 * 60_000;
  if (!hacePoco) {
    const desde = con.ultima_sync ? Date.parse(con.ultima_sync) - 2 * 86400_000 : Date.now() - 30 * 86400_000;
    const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const p = await mp('/v1/account/release_report', token, { method: 'POST', body: JSON.stringify({ begin_date: iso(desde), end_date: iso(Date.now()) }) });
    if (!p.ok && p.status !== 202) throw await fallo(p, 'No se pudo pedir el reporte');
    await admin.from('conexiones_mp').update({ ultimo_reporte_pedido: new Date().toISOString() }).eq('user_id', uid);
    pidio = true;
  }
  return { nuevos, estado: hechos.length ? 'ok' : pidio || hacePoco ? 'generando' : 'ok', pidioNuevo: pidio };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const { data: u } = await admin.auth.getUser(token);
    if (!u.user) return json({ error: 'Sesión inválida' });
    const { accion, volver } = await req.json();
    if (accion === 'conectar') return json(await conectar(u.user.id, String(volver ?? '')));
    if (accion === 'sincronizar') return json(await sincronizar(u.user.id));
    if (accion === 'desconectar') {
      await admin.from('conexiones_mp').delete().eq('user_id', u.user.id);
      return json({ ok: true });
    }
    return json({ error: 'Acción desconocida' });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) });
  }
});
