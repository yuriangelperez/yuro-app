import { Redirect } from 'expo-router';
import { useSesion } from '../src/auth';

// Mercado Pago vuelve a la app con `yuro://mp?mp=ok` (o `mp=error`). El resultado lo lee conectarMp() (src/mp.ts);
// acá solo se evita el "not found" y se vuelve a Ajustes (o al login si no hay sesión).
export default function Mp() {
  const sesion = useSesion();
  if (sesion === undefined) return null;
  return <Redirect href={sesion ? '/ajustes' : '/login'} />;
}
