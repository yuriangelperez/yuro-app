import { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFinanzas, useMovimientosMes } from '../../src/store';
import { c } from '../../src/theme';
import { Card, Fab, Fila, MesSelector, s } from '../../src/ui';
import { money } from '../../src/util';

const Dato = ({ titulo, valor, color }: { titulo: string; valor: number; color?: string }) => (
  <View style={{ width: '50%', marginBottom: 14 }}>
    <Text style={s.h}>{titulo}</Text>
    <Text style={{ color: color ?? c.text, fontWeight: '700', fontSize: 16 }}>{money(valor)}</Text>
  </View>
);

export default function Resumen() {
  const { sincronizando, sincronizar, error, pendientes } = useFinanzas();
  const { movimientos } = useMovimientosMes();

  // Mismos totales que el cuadro de tu hoja 2026
  const r = useMemo(() => {
    const suma = (f: (m: (typeof movimientos)[number]) => boolean) => movimientos.filter(f).reduce((a, m) => a + m.valor, 0);
    const ingresos = suma((m) => m.tipo === 'Ingreso');
    const gastos = suma((m) => m.tipo === 'Egreso');
    const ahorro = suma((m) => m.tipo === 'Ahorro');
    const cat: Record<string, number> = {};
    for (const m of movimientos) if (m.tipo === 'Egreso') cat[m.categoria || 'Sin categoría'] = (cat[m.categoria || 'Sin categoría'] ?? 0) + -m.valor;
    return {
      ingresos,
      gastos,
      digital: suma((m) => m.tipo === 'Egreso' && m.metodo !== 'Efectivo'),
      efectivo: suma((m) => m.tipo === 'Egreso' && m.metodo === 'Efectivo'),
      ahorrado: -ahorro,
      libre: ingresos + gastos + ahorro,
      categorias: Object.entries(cat).sort((a, b) => b[1] - a[1]),
    };
  }, [movimientos]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <MesSelector />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }} refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}>
        {error && <Text style={{ color: c.gasto, marginBottom: 8 }}>⚠ {error}</Text>}
        {pendientes.length > 0 && <Text style={{ color: c.muted, marginBottom: 8 }}>{pendientes.length} cambio(s) por sincronizar</Text>}

        <Card>
          <Text style={s.h}>Dinero libre</Text>
          <Text style={{ ...s.big, color: r.libre < 0 ? c.gasto : c.text }}>{money(r.libre)}</Text>
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Dato titulo="Total ingresos" valor={r.ingresos} color={c.ingreso} />
            <Dato titulo="Total gastos" valor={r.gastos} color={c.gasto} />
            <Dato titulo="Gasto digital" valor={r.digital} />
            <Dato titulo="Gasto efectivo" valor={r.efectivo} />
            <Dato titulo="Dinero ahorrado" valor={r.ahorrado} color={c.ahorro} />
          </View>
        </Card>

        <Card>
          <Text style={s.h}>Gasto por categoría</Text>
          {r.categorias.length === 0 && <Text style={{ color: c.muted }}>Sin gastos este mes</Text>}
          {r.categorias.map(([cat, total]) => (
            <View key={cat} style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.text }}>{cat}</Text>
                <Text style={{ color: c.muted }}>{money(total)}</Text>
              </View>
              <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3, marginTop: 4 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: c.accent, width: `${(total / -r.gastos) * 100}%` }} />
              </View>
            </View>
          ))}
        </Card>

        <Text style={s.h}>Últimos del mes</Text>
        <View style={{ backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border, marginBottom: 80 }}>
          {[...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5).map((m) => <Fila key={m.id} m={m} />)}
        </View>
      </ScrollView>
      <Fab />
    </View>
  );
}
