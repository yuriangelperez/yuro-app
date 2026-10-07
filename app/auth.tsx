import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { mensajeError } from '../src/alerta';
import { canjearCodigo, useSesion } from '../src/auth';

// Android abre la app en `yuro://auth?code=…` cuando Google/Supabase terminan el login. Esta ruta canjea ese código por la sesión
// (no se puede depender solo de la función que abrió el navegador: Android puede haberla perdido) y manda al login si falla.
// Sin sesión todavía (canjeando) se ve el login, que entra solo cuando la sesión está lista; con sesión, al inicio.
export default function Auth() {
  const { code, error, error_description } = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const sesion = useSesion();

  useEffect(() => {
    if (error) router.replace({ pathname: '/login', params: { error: error_description || error } });
    else if (code) canjearCodigo(code).catch((e) => router.replace({ pathname: '/login', params: { error: mensajeError(e) } }));
  }, [code, error, error_description]);

  if (sesion === undefined) return null;
  return <Redirect href={sesion ? '/' : '/login'} />;
}
