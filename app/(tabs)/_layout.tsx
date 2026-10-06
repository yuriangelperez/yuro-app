import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '../../src/theme';
import { tap, useLayout } from '../../src/ui';

const icono = (emoji: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;

export default function TabsLayout() {
  const { escritorio } = useLayout();
  // En el celu la barra se apoya sobre los botones/gesto del sistema: se suma ese espacio abajo.
  const abajo = useSafeAreaInsets().bottom;
  return (
    <Tabs
      screenListeners={{ tabPress: () => tap() }}
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        // En compu/tablet ancha: menú lateral con el texto al lado del ícono
        tabBarPosition: escritorio ? 'left' : 'bottom',
        tabBarLabelPosition: escritorio ? 'beside-icon' : 'below-icon',
        tabBarStyle: escritorio
          ? { backgroundColor: c.card, borderRightColor: c.border, width: 230, paddingTop: 16, paddingHorizontal: 8 }
          : { backgroundColor: c.card, borderTopColor: c.border, height: 62 + abajo, paddingTop: 6, paddingBottom: abajo + 6 },
        tabBarVariant: escritorio ? 'material' : 'uikit',
        tabBarActiveBackgroundColor: escritorio ? c.accent + '26' : undefined,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: escritorio ? { fontSize: 15, fontWeight: '600' } : { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Resumen', tabBarLabel: escritorio ? 'Resumen' : 'Inicio', tabBarIcon: icono('🏠') }} />
      <Tabs.Screen name="movimientos" options={{ title: 'Movimientos', tabBarLabel: escritorio ? 'Movimientos' : 'Lista', tabBarIcon: icono('📋') }} />
      <Tabs.Screen name="cuotas" options={{ title: 'Cuotas', tabBarLabel: escritorio ? 'Cuotas' : 'Cuotas', tabBarIcon: icono('💳') }} />
      <Tabs.Screen name="ahorros" options={{ title: 'Ahorros', tabBarLabel: escritorio ? 'Ahorros' : 'Ahorros', tabBarIcon: icono('🐷') }} />
      <Tabs.Screen name="estadisticas" options={{ title: 'Estadísticas', tabBarLabel: escritorio ? 'Estadísticas' : 'Gráficos', tabBarIcon: icono('📊') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarLabel: escritorio ? 'Ajustes' : 'Ajustes', tabBarIcon: icono('⚙️') }} />
    </Tabs>
  );
}
