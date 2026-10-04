import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFinanzas } from './store';
import { c } from './theme';
import type { Movimiento } from './types';
import { etiquetaMes, fechaCorta, money, sumaMes } from './util';

export const colorValor = (m: Movimiento) => (m.tipo === 'Ingreso' || m.valor > 0 ? c.ingreso : m.tipo === 'Ahorro' ? c.ahorro : c.gasto);

export const Card = ({ children }: { children: React.ReactNode }) => <View style={s.card}>{children}</View>;

export const MesSelector = () => {
  const mes = useFinanzas((st) => st.mes);
  const setMes = useFinanzas((st) => st.setMes);
  return (
    <View style={s.mes}>
      <Pressable onPress={() => setMes(sumaMes(mes, -1))} hitSlop={12}><Text style={s.flecha}>‹</Text></Pressable>
      <Text style={s.mesTxt}>{etiquetaMes(mes)}</Text>
      <Pressable onPress={() => setMes(sumaMes(mes, 1))} hitSlop={12}><Text style={s.flecha}>›</Text></Pressable>
    </View>
  );
};

export const Fila = ({ m }: { m: Movimiento }) => (
  <Link href={{ pathname: '/nuevo', params: { id: m.id, fecha: m.fecha } }} asChild>
    <Pressable style={s.fila}>
      <View style={{ flex: 1 }}>
        <Text style={s.titulo}>{m.concepto}</Text>
        <Text style={s.sub}>
          {[m.tipo, m.metodo, m.categoria, m.categoria2].filter(Boolean).join(' · ')} · {fechaCorta(m.fecha)}
          {m.cuotasTotales ? ` · cuota ${m.cuotasCumplidas ?? 0}/${m.cuotasTotales}` : ''}
        </Text>
      </View>
      <Text style={{ color: colorValor(m), fontWeight: '700' }}>{money(m.valor)}</Text>
    </Pressable>
  </Link>
);

export const Fab = () => (
  <Link href="/nuevo" asChild>
    <Pressable style={s.fab}><Text style={{ color: '#fff', fontSize: 30, marginTop: -2 }}>+</Text></Pressable>
  </Link>
);

export const s = StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 12 },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.border },
  titulo: { color: c.text, fontSize: 15, fontWeight: '600' },
  sub: { color: c.muted, fontSize: 12, marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  h: { color: c.muted, fontSize: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  big: { color: c.text, fontSize: 30, fontWeight: '800' },
  mes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  mesTxt: { color: c.text, fontSize: 18, fontWeight: '700' },
  flecha: { color: c.accent, fontSize: 32, lineHeight: 34 },
});
