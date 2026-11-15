import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icono, type NombreIcono } from '../../src/iconos';
import { c } from '../../src/theme';
import { tap, useLayout } from '../../src/ui';

const icono = (nombre: NombreIcono) => ({ focused }: { focused: boolean }) => <Icono nombre={nombre} color={focused ? c.accent : c.muted} size={24} grosor={focused ? 2.4 : 2} />;

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
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        // En compu/tablet ancha: menú lateral con el texto al lado del ícono
        tabBarPosition: escritorio ? 'left' : 'bottom',
        tabBarLabelPosition: escritorio ? 'beside-icon' : 'below-icon',
        tabBarStyle: escritorio
          ? { backgroundColor: c.bg, borderRightColor: c.border, width: 230, paddingTop: 16, paddingHorizontal: 8 }
          : { backgroundColor: c.bg, borderTopColor: c.card, borderTopWidth: 1, height: 62 + abajo, paddingTop: 6, paddingBottom: abajo + 6, elevation: 0 },
        tabBarVariant: escritorio ? 'material' : 'uikit',
        tabBarActiveBackgroundColor: escritorio ? c.card : undefined,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarLabelStyle: escritorio ? { fontSize: 15, fontWeight: '600' } : { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Resumen', tabBarLabel: escritorio ? 'Resumen' : 'Inicio', tabBarIcon: icono('casa') }} />
      <Tabs.Screen name="movimientos" options={{ title: 'Movimientos', tabBarLabel: escritorio ? 'Movimientos' : 'Lista', tabBarIcon: icono('lista') }} />
      <Tabs.Screen name="cuotas" options={{ title: 'Cuotas', tabBarLabel: escritorio ? 'Cuotas' : 'Cuotas', tabBarIcon: icono('cuota') }} />
      <Tabs.Screen name="ahorros" options={{ title: 'Ahorros', tabBarLabel: escritorio ? 'Ahorros' : 'Ahorros', tabBarIcon: icono('ahorro') }} />
      <Tabs.Screen name="estadisticas" options={{ title: 'Estadísticas', tabBarLabel: escritorio ? 'Estadísticas' : 'Gráficos', tabBarIcon: icono('grafico') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarLabel: escritorio ? 'Ajustes' : 'Ajustes', tabBarIcon: icono('ajustes') }} />
    </Tabs>
  );
}
