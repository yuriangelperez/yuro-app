import type { FuenteUsd, Presupuesto, Recurrente } from './store';
import { supabase } from './supabase';
import { MONEDAS, type Moneda, type Movimiento, type Tipo } from './types';

// Capa de acceso a Supabase (schema "yuro"). La seguridad la da RLS: cada usuario solo ve sus filas.

export const nuevoId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });
export const esUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function requiereSesion(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Iniciá sesión para sincronizar con la nube');
  return data.session.user.id;
}

const fallar = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

// ───────── Movimientos ─────────

type Fila = {
  id: string; fecha: string; hora: string | null; concepto: string; valor: number | string; moneda: Moneda; valor_ars: number | string | null; tipo: Tipo;
  metodo: string; categoria: string; categoria2: string; cuotas_cumplidas: number | string | null; cuotas_totales: number | string | null;
};

const aMov = (f: Fila): Movimiento => ({
  id: f.id, fecha: f.fecha, hora: f.hora ? f.hora.slice(0, 5) : null, concepto: f.concepto, valor: Number(f.valor), tipo: f.tipo, metodo: f.metodo, categoria: f.categoria, categoria2: f.categoria2,
  cuotasCumplidas: f.cuotas_cumplidas == null ? null : Number(f.cuotas_cumplidas), cuotasTotales: f.cuotas_totales == null ? null : Number(f.cuotas_totales), moneda: f.moneda, valorArs: f.valor_ars == null ? null : Number(f.valor_ars),
});

export const aFila = (m: Movimiento): Fila => ({
  id: m.id, fecha: m.fecha, hora: m.hora ?? null, concepto: m.concepto, valor: m.valor, moneda: m.moneda, valor_ars: m.valorArs ?? null, tipo: m.tipo,
  metodo: m.metodo, categoria: m.categoria, categoria2: m.categoria2, cuotas_cumplidas: m.cuotasCumplidas, cuotas_totales: m.cuotasTotales,
});

const PAGINA = 1000; // tope de filas por consulta de Supabase

// ───────── Ajustes (lo que antes vivía solo en el teléfono) ─────────

export type DatosNube = {
  monedaVista: Moneda;
  fuenteUsd: FuenteUsd;
  metaAhorro: { nombre: string; monto: number; moneda: Moneda } | null;
  presupuestos: Record<string, Presupuesto>;
  recurrentes: Recurrente[];
  saldosIniciales: Record<string, Partial<Record<Moneda, number>>>;
  ahorrosIniciales: Record<string, Partial<Record<Moneda, number>>>;
  catExtra: Record<'cat' | 'cat2', string[]>;
  catOcultas: Record<'cat' | 'cat2', string[]>;
};

type Registro = Record<string, string | number | boolean | null>;

// Deja en la tabla exactamente `filas`: inserta/actualiza las que están y borra las que sobran.
async function reemplazar(tabla: string, uid: string, filas: Registro[], onConflict: string, claves: string[]) {
  if (filas.length) fallar((await supabase.from(tabla).upsert(filas, { onConflict })).error);
  const { data, error } = await supabase.from(tabla).select(claves.join(',')).eq('user_id', uid);
  fallar(error);
  const id = (r: Record<string, unknown>) => claves.map((k) => String(r[k])).join('|');
  const quedan = new Set(filas.map(id));
  for (const vieja of (data ?? []) as unknown as Record<string, unknown>[]) {
    if (quedan.has(id(vieja))) continue;
    let q = supabase.from(tabla).delete().eq('user_id', uid);
    for (const k of claves) q = q.eq(k, vieja[k] as string | number);
    fallar((await q).error);
  }
}

export const nube = {
  async listar(desde: string, hasta: string): Promise<Movimiento[]> {
    const out: Movimiento[] = [];
    for (let i = 0; ; i += PAGINA) {
      const { data, error } = await supabase
        .from('movimientos').select('*').gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }).order('id')
        .range(i, i + PAGINA - 1);
      fallar(error);
      const filas = (data ?? []) as Fila[];
      out.push(...filas.map(aMov));
      if (filas.length < PAGINA) return out;
    }
  },

  async guardar(m: Movimiento) {
    fallar((await supabase.from('movimientos').upsert(aFila(m))).error);
  },

  async borrar(id: string) {
    fallar((await supabase.from('movimientos').delete().eq('id', id)).error);
  },

  // Carga masiva (migración o extracto importado). `external_id` evita duplicar si se corre dos veces.
  async importar(uid: string, movs: { m: Movimiento; externalId: string }[], importacionId?: string) {
    for (let i = 0; i < movs.length; i += 500) {
      const filas = movs.slice(i, i + 500).map(({ m, externalId }) => {
        const { id: _, ...resto } = aFila(m);
        return { ...resto, user_id: uid, origen: 'importacion', external_id: externalId, importacion_id: importacionId ?? null };
      });
      fallar((await supabase.from('movimientos').upsert(filas, { onConflict: 'user_id,origen,external_id', ignoreDuplicates: true })).error);
    }
  },

  // Registro de cada archivo importado (queda el historial en yuro.importaciones).
  async crearImportacion(d: { origen: 'excel' | 'csv' | 'pdf'; archivo: string; total: number; nuevas: number; duplicadas: number }): Promise<string> {
    const { data, error } = await supabase.from('importaciones')
      .insert({ origen: d.origen, archivo_nombre: d.archivo, filas_total: d.total, filas_nuevas: d.nuevas, filas_duplicadas: d.duplicadas, estado: 'confirmada' })
      .select('id').single();
    fallar(error);
    return data!.id as string;
  },

  // ¿La cuenta ya tiene datos en la nube? (para no pisarlos desde un teléfono vacío)
  async tieneDatos(): Promise<boolean> {
    for (const t of ['movimientos', 'presupuestos', 'recurrentes', 'saldos_iniciales']) {
      // GET (no HEAD): una petición HEAD fallida no trae el cuerpo del error y el mensaje llega vacío.
      const { data, error } = await supabase.from(t).select('*').limit(1);
      fallar(error);
      if (data?.length) return true;
    }
    return false;
  },

  async subirAjustes(d: DatosNube) {
    const uid = await requiereSesion();
    fallar((await supabase.from('perfiles').update({
      moneda_vista: d.monedaVista, fuente_usd: d.fuenteUsd,
      meta_ahorro_nombre: d.metaAhorro?.nombre ?? null, meta_ahorro_monto: d.metaAhorro?.monto ?? null, meta_ahorro_moneda: d.metaAhorro?.moneda ?? null,
    }).eq('id', uid)).error);

    await reemplazar('presupuestos', uid, Object.entries(d.presupuestos).map(([categoria, p]) => ({ user_id: uid, categoria, monto: p.monto, moneda: p.moneda })), 'user_id,categoria', ['categoria']);

    await reemplazar('recurrentes', uid, d.recurrentes.map((r) => ({
      id: r.id, user_id: uid, concepto: r.concepto, valor: r.valor, moneda: r.moneda, tipo: r.tipo, metodo: r.metodo, categoria: r.categoria,
      categoria2: r.categoria2, dia: r.dia, desde: r.desde, activo: r.activo, ultimo_ym: r.ultimoYm,
    })), 'id', ['id']);

    const cats = new Map<string, Registro>();
    for (const nivel of ['cat', 'cat2'] as const) {
      for (const nombre of d.catExtra[nivel]) cats.set(`${nivel}|${nombre}`, { user_id: uid, nivel, nombre, oculta: false });
      for (const nombre of d.catOcultas[nivel]) cats.set(`${nivel}|${nombre}`, { user_id: uid, nivel, nombre, oculta: true });
    }
    await reemplazar('categorias', uid, [...cats.values()], 'user_id,nivel,nombre', ['nivel', 'nombre']);

    const saldos: Registro[] = [];
    for (const anio of new Set([...Object.keys(d.saldosIniciales), ...Object.keys(d.ahorrosIniciales)])) {
      for (const moneda of MONEDAS) {
        const saldo = d.saldosIniciales[anio]?.[moneda] ?? 0;
        const ahorro = d.ahorrosIniciales[anio]?.[moneda] ?? 0;
        if (saldo || ahorro) saldos.push({ user_id: uid, anio: +anio, moneda, saldo, ahorro });
      }
    }
    await reemplazar('saldos_iniciales', uid, saldos, 'user_id,anio,moneda', ['anio', 'moneda']);
  },

  async bajarAjustes(): Promise<DatosNube> {
    const uid = await requiereSesion();
    const [perfil, pres, rec, cat, sal] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('presupuestos').select('*'),
      supabase.from('recurrentes').select('*').order('created_at'),
      supabase.from('categorias').select('*'),
      supabase.from('saldos_iniciales').select('*'),
    ]);
    for (const r of [perfil, pres, rec, cat, sal]) fallar(r.error);

    const p = perfil.data;
    const catExtra: DatosNube['catExtra'] = { cat: [], cat2: [] };
    const catOcultas: DatosNube['catOcultas'] = { cat: [], cat2: [] };
    for (const f of cat.data ?? []) (f.oculta ? catOcultas : catExtra)[f.nivel as 'cat' | 'cat2'].push(f.nombre);
    const saldosIniciales: DatosNube['saldosIniciales'] = {};
    const ahorrosIniciales: DatosNube['ahorrosIniciales'] = {};
    for (const f of sal.data ?? []) {
      const m = f.moneda as Moneda;
      saldosIniciales[f.anio] = { ...saldosIniciales[f.anio], [m]: Number(f.saldo) };
      ahorrosIniciales[f.anio] = { ...ahorrosIniciales[f.anio], [m]: Number(f.ahorro) };
    }
    return {
      monedaVista: p?.moneda_vista ?? 'ARS',
      fuenteUsd: p?.fuente_usd ?? 'blue',
      metaAhorro: p?.meta_ahorro_nombre && p.meta_ahorro_monto != null ? { nombre: p.meta_ahorro_nombre, monto: Number(p.meta_ahorro_monto), moneda: p.meta_ahorro_moneda ?? 'ARS' } : null,
      presupuestos: Object.fromEntries((pres.data ?? []).map((f) => [f.categoria, { monto: Number(f.monto), moneda: f.moneda as Moneda }])),
      recurrentes: (rec.data ?? []).map((f) => ({
        id: f.id, concepto: f.concepto, valor: Number(f.valor), moneda: f.moneda, tipo: f.tipo, metodo: f.metodo, categoria: f.categoria,
        categoria2: f.categoria2, dia: f.dia, desde: f.desde, activo: f.activo, ultimoYm: f.ultimo_ym,
      })),
      saldosIniciales, ahorrosIniciales, catExtra, catOcultas,
    };
  },
};
