import { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFinanzas } from '../../src/store';
import { c, money } from '../../src/theme';
import { Card, Fab, Fila, s } from '../../src/ui';

export default function Resumen() {
  const { movimientos, sincronizando, sincronizar, error, pendientes } = useFinanzas();
  const mes = new Date().toISOString().slice(0, 7);

  const { balance, ingresos, gastos, porCategoria } = useMemo(() => {
    let ingresos = 0, gastos = 0, balance = 0;
    const cat: Record<string, number> = {};
    for (const m of movimientos) {
      const signo = m.tipo === 'ingreso' ? 1 : -1;
      balance += signo * m.monto;
      if (m.fecha.startsWith(mes)) {
        if (m.tipo === 'ingreso') ingresos += m.monto;
        else { gastos += m.monto; cat[m.categoria] = (cat[m.categoria] ?? 0) + m.monto; }
      }
    }
    return { balance, ingresos, gastos, porCategoria: Object.entries(cat).sort((a, b) => b[1] - a[1]) };
  }, [movimientos, mes]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}>
        {error && <Text style={{ color: c.gasto, marginBottom: 8 }}>⚠ {error}</Text>}
        {pendientes.length > 0 && <Text style={{ color: c.muted, marginBottom: 8 }}>{pendientes.length} cambio(s) por sincronizar</Text>}
        <Card>
          <Text style={s.h}>Balance total</Text>
          <Text style={s.big}>{money(balance)}</Text>
          <View style={{ flexDirection: 'row', marginTop: 12, gap: 24 }}>
            <View><Text style={s.h}>Ingresos del mes</Text><Text style={{ color: c.ingreso, fontWeight: '700' }}>{money(ingresos)}</Text></View>
            <View><Text style={s.h}>Gastos del mes</Text><Text style={{ color: c.gasto, fontWeight: '700' }}>{money(gastos)}</Text></View>
          </View>
        </Card>

        <Card>
          <Text style={s.h}>Gastos por categoría (este mes)</Text>
          {porCategoria.length === 0 && <Text style={{ color: c.muted }}>Sin gastos este mes</Text>}
          {porCategoria.map(([cat, total]) => (
            <View key={cat} style={{ marginTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: c.text }}>{cat}</Text>
                <Text style={{ color: c.muted }}>{money(total)}</Text>
              </View>
              <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3, marginTop: 4 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: c.accent, width: `${(total / gastos) * 100}%` }} />
              </View>
            </View>
          ))}
        </Card>

        <Text style={s.h}>Recientes</Text>
        <View style={{ backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border }}>
          {movimientos.slice(0, 5).map((m) => <Fila key={m.id} m={m} />)}
        </View>
      </ScrollView>
      <Fab />
    </View>
  );
}
