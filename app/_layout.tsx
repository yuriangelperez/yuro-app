import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useFinanzas } from '../src/store';
import { c } from '../src/theme';

export default function Root() {
  const sincronizar = useFinanzas((s) => s.sincronizar);
  useEffect(() => {
    sincronizar();
  }, [sincronizar]);
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="nuevo" options={{ presentation: 'modal', title: 'Movimiento' }} />
      </Stack>
    </>
  );
}
