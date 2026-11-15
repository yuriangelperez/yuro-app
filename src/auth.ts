import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// A dónde tiene que volver el login: en web el origen; en el celular `yuro://auth` (APK) o `exp://<ip>:8081/--/auth` (Expo Go).
// Esta dirección tiene que estar en Supabase > Authentication > URL Configuration > Redirect URLs.
export const urlDeRegreso = () => (Platform.OS === 'web' ? (globalThis as unknown as { location: { origin: string } }).location.origin : Linking.createURL('auth'));

// El código de Google se puede recibir por dos caminos: lo que devuelve el navegador (entrarConGoogle) y la ruta /auth que
// abre Android con el deep link. Un código solo se puede canjear una vez, así que los dos comparten el mismo canje.
const canjes = new Map<string, Promise<void>>();
export function canjearCodigo(code: string): Promise<void> {
  let p = canjes.get(code);
  if (!p) {
    p = supabase.auth.exchangeCodeForSession(code).then(({ error }) => { if (error) throw error; });
    canjes.set(code, p);
  }
  return p;
}

// Parámetros de una dirección de regreso, tanto de ?query como de #fragmento (sin depender de URL/URLSearchParams de React Native).
export function parametrosDeUrl(url: string): Record<string, string> {
  const [sinHash, hash = ''] = url.split('#');
  const out: Record<string, string> = {};
  for (const parte of [sinHash.split('?')[1] ?? '', hash]) {
    for (const par of parte.split('&')) {
      if (!par) continue;
      const i = par.indexOf('=');
      const dec = (t: string) => { try { return decodeURIComponent(t.replace(/\+/g, ' ')); } catch { return t; } };
      out[dec(i < 0 ? par : par.slice(0, i))] = i < 0 ? '' : dec(par.slice(i + 1));
    }
  }
  return out;
}

// Login con Google vía Supabase (flujo PKCE). En el celular abre el navegador y vuelve por el scheme "yuro://".
export async function entrarConGoogle(): Promise<void> {
  const redirectTo = urlDeRegreso();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web', queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (Platform.OS === 'web' || !data.url) return; // en web el navegador ya redirige solo

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return; // si Android abrió la app por el deep link, la ruta /auth canjea el código
  const p = parametrosDeUrl(res.url);
  if (p.error) throw new Error(p.error_description || p.error);
  if (p.code) return canjearCodigo(p.code);
  if (p.access_token && p.refresh_token) { // por si Supabase respondiera con el flujo implícito
    const { error: e2 } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
    if (e2) throw e2;
    return;
  }
  throw new Error(`Google no devolvió el código de acceso. Dirección recibida: ${res.url.slice(0, 120)}`);
}

export const salir = () => supabase.auth.signOut();

// undefined = todavía cargando la sesión guardada; null = sin sesión.
export function useSesion(): Session | null | undefined {
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    // Renueva el token solo mientras la app está abierta.
    const app = AppState.addEventListener('change', (e) => (e === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
    return () => { sub.subscription.unsubscribe(); app.remove(); };
  }, []);
  return sesion;
}
