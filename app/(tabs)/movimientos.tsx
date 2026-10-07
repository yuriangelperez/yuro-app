import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, Text, TextInput, View } from 'react-native';
import { fechaDe } from '../../src/importar';
import { useConversor, useFinanzas, useMovimientosMes } from '../../src/store';
import { c } from '../../src/theme';
import { MONEDAS, type Moneda, type Tipo } from '../../src/types';
import { Chip, EstadoSync, Fab, Fila, MesSelector, centrado, s } from '../../src/ui';
import { etiquetaDia, fechaCorta, hoyYmd, masReciente, money, ymdMenos } from '../../src/util';

const FILTROS: { label: string; tipo: Tipo | null; color: string }[] = [
  { label: 'Todos', tipo: null, color: c.accent },
  { label: '⬇️ Gastos', tipo: 'Egreso', color: c.gasto },
  { label: '⬆️ Ingresos', tipo: 'Ingreso', color: c.ingreso },
  { label: '🐷 Ahorro', tipo: 'Ahorro', color: c.ahorro },
];

type Rango = 'mes' | 'hoy' | '7' | '30' | 'custom';
const RANGOS: { r: Rango; label: string }[] = [
  { r: 'mes', label: '📅 Este mes' },
  { r: 'hoy', label: 'Hoy' },
  { r: '7', label: '7 días' },
  { r: '30', label: '30 días' },
  { r: 'custom', label: '🗓️ Rango' },
];

const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function Movimientos() {
  const { sincronizando, sincronizar, porAnio } = useFinanzas();
  const { movimientos: delMes } = useMovimientosMes();
  const [rango, setRango] = useState<Rango>('mes');
  const [desdeTxt, setDesdeTxt] = useState('');
  const [hastaTxt, setHastaTxt] = useState('');
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [q, setQ] = useState('');
  const [moneda, setMoneda] = useState<Moneda | null>(null);
  const { vista, conv } = useConversor();

  // Fechas del filtro (YYYY-MM-DD). null = sin límite. En "Este mes" manda el selector de mes de arriba.
  const [desde, hasta] = useMemo((): [string | null, string | null] => {
    const hoy = hoyYmd();
    if (rango === 'hoy') return [hoy, hoy];
    if (rango === '7') return [ymdMenos(6), hoy];
    if (rango === '30') return [ymdMenos(29), hoy];
    if (rango === 'custom') return [desdeTxt.trim() ? fechaDe(desdeTxt) : null, hastaTxt.trim() ? fechaDe(hastaTxt) : null];
    return [null, null];
  }, [rango, desdeTxt, hastaTxt]);
  const fechaInvalida = rango === 'custom' && ((!!desdeTxt.trim() && !desde) || (!!hastaTxt.trim() && !hasta));

  // Fuera de "Este mes" se busca en todos los años que la app tiene cargados.
  const movimientos = useMemo(
    () => (rango === 'mes' ? delMes : Object.values(porAnio).flat().filter((m) => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta))),
    [rango, delMes, porAnio, desde, hasta],
  );

  const secciones = useMemo(() => {
    const busca = sinTildes(q.trim());
    const lista = movimientos
      .filter((m) => !tipo || m.tipo === tipo)
      .filter((m) => !moneda || m.moneda === moneda)
      .filter((m) => !busca || sinTildes([m.concepto, m.categoria, m.categoria2, m.metodo].join(' ')).includes(busca))
      .sort(masReciente);
    const porDia: Record<string, typeof lista> = {};
    for (const m of lista) (porDia[m.fecha] ??= []).push(m);
    return Object.entries(porDia).map(([fecha, data]) => ({ fecha, data, total: data.reduce((a, m) => a + conv(m.valor, m.moneda), 0) }));
  }, [movimientos, tipo, q, moneda, vista, conv]);

  const totalFiltrado = secciones.reduce((a, x) => a + x.total, 0);
  const cantidad = secciones.reduce((a, x) => a + x.data.length, 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {rango === 'mes' && <MesSelector />}
      <View style={[{ paddingHorizontal: 16 }, centrado(900)]}>
        <EstadoSync />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: rango === 'mes' ? 0 : 8 }}>
          {RANGOS.map((x) => <Chip key={x.r} label={x.label} on={rango === x.r} color="#5dade2" onPress={() => setRango(x.r)} />)}
        </ScrollView>
        {rango === 'custom' && (
          <View style={{ flexDirection: 'row', marginBottom: 10 }}>
            {([['Desde', desdeTxt, setDesdeTxt], ['Hasta', hastaTxt, setHastaTxt]] as const).map(([label, valor, set], i) => (
              <TextInput
                key={label}
                style={{ flex: 1, backgroundColor: c.card, color: c.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: c.border, marginRight: i ? 0 : 8 }}
                placeholder={`${label} dd/mm/aaaa`}
                placeholderTextColor={c.muted}
                value={valor}
                onChangeText={set}
                keyboardType="numbers-and-punctuation"
              />
            ))}
          </View>
        )}
        {fechaInvalida && <Text style={{ color: c.aviso, fontSize: 12, marginBottom: 6 }}>Escribí las fechas como 25/12/2026.</Text>}
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
            <Text style={[s.h, { marginBottom: 0 }]}>{rango === 'mes' ? etiquetaDia(section.fecha) : `${etiquetaDia(section.fecha)} · ${fechaCorta(section.fecha)}`}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{money(section.total, vista)}</Text>
          </View>
        )}
        renderItem={({ item }) => <Fila m={item} conFecha={false} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            <Text style={{ fontSize: 40 }}>{q || tipo || rango !== 'mes' ? '🔍' : '📭'}</Text>
            <Text style={{ color: c.muted, marginTop: 8 }}>{q || tipo || rango !== 'mes' ? 'Nada coincide con el filtro' : 'Sin movimientos este mes'}</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}
      />
      <Fab />
    </View>
  );
}
