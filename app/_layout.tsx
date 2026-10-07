import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { useSesion } from '../src/auth';
import { nube } from '../src/nube';
import { supabase } from '../src/supabase';
import { procesarNotificaciones } from '../src/notificaciones';
import { useFinanzas } from '../src/store';
import { c } from '../src/theme';

// Al iniciar sesión, deja el teléfono atado a la cuenta sin que haya que ir a Ajustes:
// - la cuenta ya tiene datos en la nube (otro dispositivo / vuelve a entrar): se bajan.
// - la cuenta es nueva y este teléfono está vacío: queda lista para empezar.
// Si el teléfono tiene datos propios sin migrar, no se toca nada: eso se decide a mano en Ajustes ("Migrar").
async function conectarCuenta(uid: string) {
  const st = useFinanzas.getState();
  if (st.nubeUid === uid) return;
  if (st.nubeUid && st.pendientes.length) return; // cambios sin subir de otra cuenta: no se pisan
  if (st.nubeUid) st.desconectarNube(); // este teléfono era de otra cuenta
  const hayNube = await nube.tieneDatos();
  const hayLocal = Object.values(useFinanzas.getState().porAnio).some((l) => l.length) || useFinanzas.getState().pendientes.length > 0 || !!useFinanzas.getState().url;
  if (hayNube) await st.conectarNube({ subirLocal: false });
  else if (!hayLocal) await st.conectarNube({ subirLocal: true });
}

export default function Root() {
  const sesion = useSesion();
  const uid = sesion?.user.id;
  // Se puede entrar con sesión o con "Continuar sin cuenta" (datos solo en este teléfono). La elección se guarda con el resto de los datos,
  // así que hay que esperar a que se lean antes de decidir qué pantalla mostrar.
  const modoLocal = useFinanzas((s) => s.modoLocal);
  const [hidratado, setHidratado] = useState(useFinanzas.persist.hasHydrated());
  useEffect(() => useFinanzas.persist.onFinishHydration(() => setHidratado(true)), []);
  const acceso = !!sesion || modoLocal;
  useEffect(() => {
    if (!uid) return;
    const arrancar = () => conectarCuenta(uid).catch((e) => useFinanzas.setState({ error: e instanceof Error ? e.message : 'No se pudo conectar la cuenta' }));
    if (useFinanzas.persist.hasHydrated()) { arrancar(); return; }
    return useFinanzas.persist.onFinishHydration(arrancar);
  }, [uid]);

  // Al abrir (y al volver a la app): primero se esperan los datos guardados en el teléfono, después se baja
  // la hoja y recién ahí se cargan los recurrentes vencidos (así no se duplica lo que ya está en la hoja).
  useEffect(() => {
    const correr = async () => {
      // En modo nube sin sesión (pantalla de login) no hay nada que sincronizar
      if (useFinanzas.getState().nubeUid && !(await supabase.auth.getSession()).data.session) return;
      const { sincronizar, generarRecurrentes } = useFinanzas.getState();
      await sincronizar();
      await generarRecurrentes();
      await procesarNotificaciones().catch(() => {}); // en Android: notificaciones de bancos → movimientos
    };
    const sub = AppState.addEventListener('change', (e) => { if (e === 'active') correr(); });
    if (useFinanzas.persist.hasHydrated()) correr();
    const fin = useFinanzas.persist.onFinishHydration(() => correr());
    return () => { sub.remove(); fin(); };
  }, []);
  if (sesion === undefined || !hidratado) return <View style={{ flex: 1, backgroundColor: c.bg }} />; // leyendo la sesión guardada
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={!acceso}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={acceso}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="nuevo" options={{ presentation: 'modal', title: 'Movimiento' }} />
          <Stack.Screen name="presupuestos" options={{ title: 'Presupuestos' }} />
          <Stack.Screen name="saldos" options={{ title: 'Tu dinero por moneda' }} />
          <Stack.Screen name="importar" options={{ title: 'Importar extracto' }} />
          <Stack.Screen name="recurrentes" options={{ title: 'Recurrentes' }} />
          <Stack.Screen name="recurrente" options={{ presentation: 'modal', title: 'Recurrente' }} />
        </Stack.Protected>
        {/* Rutas de regreso de Google y Mercado Pago (deep links): siempre disponibles, solo redirigen.
            Van al FINAL: cuando una ruta está protegida el router cae en la primera pantalla disponible, y esa tiene que ser el login o el inicio. */}
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="mp" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
