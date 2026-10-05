import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useFinanzas } from '../src/store';
import { c } from '../src/theme';

export default function Root() {
  // Al abrir (y al volver a la app): primero se esperan los datos guardados en el teléfono, después se baja
  // la hoja y recién ahí se cargan los recurrentes vencidos (así no se duplica lo que ya está en la hoja).
  useEffect(() => {
    const correr = async () => {
      const { sincronizar, generarRecurrentes } = useFinanzas.getState();
      await sincronizar();
      await generarRecurrentes();
    };
    const sub = AppState.addEventListener('change', (e) => { if (e === 'active') correr(); });
    if (useFinanzas.persist.hasHydrated()) correr();
    const fin = useFinanzas.persist.onFinishHydration(() => correr());
    return () => { sub.remove(); fin(); };
  }, []);
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="nuevo" options={{ presentation: 'modal', title: 'Movimiento' }} />
        <Stack.Screen name="presupuestos" options={{ title: 'Presupuestos' }} />
        <Stack.Screen name="saldos" options={{ title: 'Tu dinero por moneda' }} />
        <Stack.Screen name="recurrentes" options={{ title: 'Recurrentes' }} />
        <Stack.Screen name="recurrente" options={{ presentation: 'modal', title: 'Recurrente' }} />
      </Stack>
    </>
  );
}
