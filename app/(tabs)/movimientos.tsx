import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, Text, TextInput, View } from 'react-native';
import { useConversor, useFinanzas, useMovimientosMes } from '../../src/store';
import { c } from '../../src/theme';
import { MONEDAS, type Moneda, type Tipo } from '../../src/types';
import { Chip, EstadoSync, Fab, Fila, MesSelector, centrado, s } from '../../src/ui';
import { etiquetaDia, money } from '../../src/util';

const FILTROS: { label: string; tipo: Tipo | null; color: string }[] = [
  { label: 'Todos', tipo: null, color: c.accent },
  { label: '⬇️ Gastos', tipo: 'Egreso', color: c.gasto },
  { label: '⬆️ Ingresos', tipo: 'Ingreso', color: c.ingreso },
  { label: '🐷 Ahorro', tipo: 'Ahorro', color: c.ahorro },
];

const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Movimientos() {
  const { sincronizando, sincronizar } = useFinanzas();
  const { movimientos } = useMovimientosMes();
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [q, setQ] = useState('');
  const [moneda, setMoneda] = useState<Moneda | null>(null);
  const { vista, conv } = useConversor();

  const secciones = useMemo(() => {
    const busca = sinTildes(q.trim());
    const lista = movimientos
      .filter((m) => !tipo || m.tipo === tipo)
      .filter((m) => !moneda || m.moneda === moneda)
      .filter((m) => !busca || sinTildes([m.concepto, m.categoria, m.categoria2, m.metodo].join(' ')).includes(busca))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const porDia: Record<string, typeof lista> = {};
    for (const m of lista) (porDia[m.fecha] ??= []).push(m);
    return Object.entries(porDia).map(([fecha, data]) => ({ fecha, data, total: data.reduce((a, m) => a + conv(m.valor, m.moneda), 0) }));
  }, [movimientos, tipo, q, moneda, vista, conv]);

  const totalFiltrado = secciones.reduce((a, x) => a + x.total, 0);
  const cantidad = secciones.reduce((a, x) => a + x.data.length, 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <MesSelector />
      <View style={[{ paddingHorizontal: 16 }, centrado(900)]}>
        <EstadoSync />
        <TextInput
          style={{ backgroundColor: c.card, color: c.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: c.border, marginBottom: 10 }}
          placeholder="🔎 Buscar concepto, categoría, método…"
          placeholderTextColor={c.muted}
          value={q}
          onChangeText={setQ}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {FILTROS.map((f) => <Chip key={f.label} label={f.label} on={tipo === f.tipo} color={f.color} onPress={() => setTipo(f.tipo)} />)}
          <View style={{ width: 1, backgroundColor: c.border, marginRight: 8, marginBottom: 8 }} />
          {MONEDAS.map((m) => <Chip key={m} label={m} on={moneda === m} color="#5dade2" onPress={() => setMoneda(moneda === m ? null : m)} />)}
        </ScrollView>
        <Text style={{ color: c.muted, fontSize: 12, marginVertical: 6 }}>
          {cantidad} movimiento(s) · total <Text style={{ color: totalFiltrado < 0 ? c.gasto : c.ingreso, fontWeight: '700' }}>{money(totalFiltrado, vista)}</Text>
        </Text>
      </View>
      <SectionList
        sections={secciones}
        keyExtractor={(m) => m.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 100, ...centrado(900) }}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: c.bg }}>
            <Text style={[s.h, { marginBottom: 0 }]}>{etiquetaDia(section.fecha)}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{money(section.total, vista)}</Text>
          </View>
        )}
        renderItem={({ item }) => <Fila m={item} conFecha={false} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            <Text style={{ fontSize: 40 }}>{q || tipo ? '🔍' : '📭'}</Text>
            <Text style={{ color: c.muted, marginTop: 8 }}>{q || tipo ? 'Nada coincide con el filtro' : 'Sin movimientos este mes'}</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}
      />
      <Fab />
    </View>
  );
}
