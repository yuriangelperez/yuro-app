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

export const sincronizarMp = () => llamar<{ nuevos: number; estado: 'ok' | 'generando'; pidioNuevo: boolean }>('sincronizar');
export const desconectarMp = () => llamar<{ ok: boolean }>('desconectar');
