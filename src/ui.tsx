import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { c, money } from './theme';
import type { Movimiento } from './types';

export const Card = ({ children }: { children: React.ReactNode }) => <View style={s.card}>{children}</View>;

export const Fila = ({ m }: { m: Movimiento }) => (
  <Link href={{ pathname: '/nuevo', params: { id: m.id } }} asChild>
    <Pressable style={s.fila}>
      <View style={{ flex: 1 }}>
        <Text style={s.titulo}>{m.descripcion || m.categoria}</Text>
        <Text style={s.sub}>{m.categoria} · {m.cuenta} · {m.fecha}</Text>
      </View>
      <Text style={{ color: m.tipo === 'ingreso' ? c.ingreso : c.gasto, fontWeight: '700' }}>
        {m.tipo === 'ingreso' ? '+' : '-'}{money(m.monto)}
      </Text>
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
  h: { color: c.muted, fontSize: 13, marginBottom: 6 },
  big: { color: c.text, fontSize: 32, fontWeight: '800' },
});
