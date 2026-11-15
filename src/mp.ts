import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Mercado Pago (solo lectura). Los tokens viven en la base y solo los usa la Edge Function "mp-api".

type Respuesta<T> = T & { error?: string };

async function llamar<T>(accion: string, extra: object = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<Respuesta<T>>('mp-api', { body: { accion, ...extra } });
  if (error) throw new Error(`No se pudo llamar a la función de Mercado Pago (${error.message}). ¿Está desplegada "mp-api"?`);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export type EstadoMp = { mp_user_id: number; ultima_sync: string | null; created_at: string } | null;

export async function estadoMp(): Promise<EstadoMp> {
  const { data, error } = await supabase.from('mp_estado').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Abre la autorización de Mercado Pago. En web redirige la pestaña; en el celular usa el navegador y vuelve por yuro://mp.
export async function conectarMp(): Promise<'ok' | 'cancelado' | 'redirigido'> {
  const web = Platform.OS === 'web';
  const origen = (globalThis as unknown as { location: { origin: string; href: string } }).location;
  const volver = web ? `${origen.origin}/ajustes` : Linking.createURL('mp');
  const { url } = await llamar<{ url: string }>('conectar', { volver });
  if (web) {
    origen.href = url;
    return 'redirigido';
  }
  const r = await WebBrowser.openAuthSessionAsync(url, volver);
  if (r.type !== 'success') return 'cancelado';
  const q = new URL(r.url).searchParams;
  if (q.get('mp') !== 'ok') throw new Error(q.get('msg') || 'Mercado Pago no se pudo conectar');
  return 'ok';
}

// desde (YYYY-MM-DD): pide el reporte desde ese día en vez de solo los últimos 2 días
export const sincronizarMp = (desde?: string) => llamar<{ nuevos: number; estado: 'ok' | 'generando'; pidioNuevo: boolean }>('sincronizar', desde ? { desde } : {});
export const desconectarMp = () => llamar<{ ok: boolean }>('desconectar');

// Sincronización automática: si Mercado Pago está conectado y pasaron más de `cadaMin` minutos desde la última, trae lo nuevo.
// Un solo pedido (sin esperar el reporte): si MP todavía lo está preparando, lo levanta la próxima vez.
let corriendoAuto = false;
export async function sincronizarMpAuto(cadaMin = 15): Promise<number> {
  if (corriendoAuto) return 0;
  corriendoAuto = true;
  try {
    const e = await estadoMp();
    if (!e) return 0;
    if (e.ultima_sync && Date.now() - new Date(e.ultima_sync).getTime() < cadaMin * 60_000) return 0;
    return (await sincronizarMp()).nuevos;
  } catch {
    return 0;
  } finally {
    corriendoAuto = false;
  }
}
