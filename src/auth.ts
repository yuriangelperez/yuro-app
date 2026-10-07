import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// Login con Google vía Supabase (flujo PKCE). En el celular abre el navegador y vuelve por el scheme "yuro://".
export async function entrarConGoogle(): Promise<void> {
  const redirectTo = Platform.OS === 'web' ? (globalThis as unknown as { location: { origin: string } }).location.origin : Linking.createURL('auth');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web', queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (Platform.OS === 'web' || !data.url) return; // en web el navegador ya redirige solo

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return;
  const code = new URL(res.url).searchParams.get('code');
  if (!code) throw new Error('Google no devolvió el código de acceso');
  const { error: e2 } = await supabase.auth.exchangeCodeForSession(code);
  if (e2) throw e2;
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
