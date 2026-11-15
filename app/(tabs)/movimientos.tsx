import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, Text, TextInput, View } from 'react-native';
import { fechaDe } from '../../src/importar';
import { useConversor, useFinanzas, useMovimientosMes } from '../../src/store';
import { c, radio, suave, tipo as tipoTxt, TOQUE } from '../../src/theme';
import { MONEDAS, type Moneda, type Tipo } from '../../src/types';
import { Boton, Chip, EstadoSync, Fab, Fila, Hoja, MesSelector, Vacio, centrado, s, tap, useLayout, MAX } from '../../src/ui';
import { etiquetaDia, fechaCorta, hoyYmd, masReciente, money, ymdMenos } from '../../src/util';
import { Icono } from '../../src/iconos';

const FILTROS: { label: string; tipo: Tipo | null; color: string }[] = [
  { label: 'Todos', tipo: null, color: c.accent },
  { label: 'Gastos', tipo: 'Egreso', color: c.gasto },
  { label: 'Ingresos', tipo: 'Ingreso', color: c.ingreso },
  { label: 'Ahorro', tipo: 'Ahorro', color: c.ahorro },
  { label: 'Cambios', tipo: 'Cambio', color: c.transferencia },
  { label: 'Transferencias', tipo: 'Transferencia', color: c.transferencia },
  { label: 'Deudas', tipo: 'Deuda', color: c.deuda },
];

type Rango = 'mes' | 'hoy' | '7' | '30' | 'custom';
const RANGOS: { r: Rango; label: string }[] = [
  { r: 'mes', label: 'Este mes' },
  { r: 'hoy', label: 'Hoy' },
  { r: '7', label: '7 días' },
  { r: '30', label: '30 días' },
  { r: 'custom', label: 'Rango' },
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
  const [hoja, setHoja] = useState(false); // hoja de filtros
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
      .filter((m) => !tipo || m.tipo === tipo || (tipo === 'Deuda' && m.tipo === 'Pago deuda')) // "Deudas" incluye los pagos
      .filter((m) => !moneda || m.moneda === moneda)
      .filter((m) => !busca || sinTildes([m.concepto, m.categoria, m.categoria2, m.metodo].join(' ')).includes(busca))
      .sort(masReciente);
    const porDia: Record<string, typeof lista> = {};
    for (const m of lista) (porDia[m.fecha] ??= []).push(m);
    return Object.entries(porDia).map(([fecha, data]) => ({ fecha, data, total: data.reduce((a, m) => a + (m.tipo === 'Transferencia' ? 0 : conv(m.valor, m.moneda)), 0) }));
  }, [movimientos, tipo, q, moneda, vista, conv]);

  const { ancho, escritorio } = useLayout();
  const nCols = !escritorio ? 1 : ancho - 230 >= 1250 ? 3 : 2;
  // en compu: los días se reparten en columnas, cada uno en la más corta
  const columnas = useMemo(() => {
    const cols: { items: typeof secciones; peso: number }[] = Array.from({ length: nCols }, () => ({ items: [], peso: 0 }));
    for (const sec of secciones) {
      const min = cols.reduce((a, x) => (x.peso < a.peso ? x : a));
      min.items.push(sec);
      min.peso += sec.data.length + 1;
    }
    return cols;
  }, [secciones, nCols]);

  const totalFiltrado = secciones.reduce((a, x) => a + x.total, 0);
  const cantidad = secciones.reduce((a, x) => a + x.data.length, 0);
  // Resumen de lo filtrado: cuánto entró y cuánto salió (transferencias y cambios no cuentan)
  const { entro, salio } = useMemo(() => {
    let e = 0, g = 0;
    for (const sec of secciones) for (const m of sec.data) {
      if (m.tipo === 'Ingreso') e += conv(m.valor, m.moneda);
      else if (m.tipo === 'Egreso') g -= conv(m.valor, m.moneda);
    }
    return { entro: e, salio: g };
  }, [secciones, conv]);

  // Filtros activos, cada uno con su forma de quitarlo
  const activos: { label: string; quitar: () => void }[] = [];
  if (rango !== 'mes') activos.push({ label: RANGOS.find((x) => x.r === rango)?.label ?? 'Rango', quitar: () => setRango('mes') });
  if (tipo) activos.push({ label: FILTROS.find((f) => f.tipo === tipo)?.label ?? tipo, quitar: () => setTipo(null) });
  if (moneda) activos.push({ label: moneda, quitar: () => setMoneda(null) });
  const limpiar = () => { setRango('mes'); setTipo(null); setMoneda(null); };
  const hayFiltro = !!q || activos.length > 0;
  const vacio = hayFiltro
    ? <Vacio icono="buscar" color={c.muted} titulo="Nada coincide" texto="Probá con otra palabra o quitá algún filtro." accion={activos.length ? 'Quitar filtros' : undefined} onPress={limpiar} />
    : <Vacio icono="lista" color={c.accent} titulo="Sin movimientos este mes" texto="Cargá el primero con el botón + de abajo." />;
  const tituloDia = (fecha: string) => (rango === 'mes' ? etiquetaDia(fecha) : `${etiquetaDia(fecha)} · ${fechaCorta(fecha)}`);
  const etiqueta = { ...tipoTxt.etiqueta, color: c.muted, marginTop: 12, marginBottom: 8 } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {rango === 'mes' && <MesSelector />}
      <View style={[{ paddingHorizontal: 16, paddingTop: rango === 'mes' ? 0 : 8 }, centrado(MAX)]}>
        <EstadoSync />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: radio.m, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, minHeight: TOQUE }}>
            <Icono nombre="buscar" color={c.muted} size={18} />
            <TextInput style={{ flex: 1, color: c.text, paddingVertical: 10 }} placeholder="Buscar concepto o categoría" placeholderTextColor={c.muted} value={q} onChangeText={setQ} accessibilityLabel="Buscar" />
            {!!q && (
              <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Borrar búsqueda"><Icono nombre="cerrar" color={c.muted} size={16} /></Pressable>
            )}
          </View>
          <Pressable onPress={() => { tap(); setHoja(true); }} accessibilityRole="button" accessibilityLabel="Filtros"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: TOQUE, paddingHorizontal: 12, borderRadius: radio.m, borderWidth: 1, borderColor: activos.length ? c.accent : c.border, backgroundColor: activos.length ? suave(c.accent) : c.card }}>
            <Icono nombre="filtro" color={activos.length ? c.accent : c.text} size={18} />
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 14 }}>Filtros</Text>
            {activos.length > 0 && (
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
                <Text style={{ color: c.sobre, fontSize: 12, fontWeight: '700' }}>{activos.length}</Text>
              </View>
            )}
          </Pressable>
        </View>
        {activos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {activos.map((f) => (
              <Pressable key={f.label} onPress={() => { tap(); f.quitar(); }} accessibilityRole="button" accessibilityLabel={`Quitar filtro ${f.label}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radio.total, backgroundColor: suave(c.accent), borderWidth: 1, borderColor: c.accent, marginRight: 8 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{f.label}</Text>
                <Icono nombre="cerrar" color={c.text} size={14} />
              </Pressable>
            ))}
          </ScrollView>
        )}
        {cantidad > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: radio.l, borderWidth: 1, borderColor: c.border, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.muted, fontSize: 12 }}>Entró</Text>
              <Text style={{ color: c.ingreso, fontWeight: '700', fontSize: 15 }} numberOfLines={1} adjustsFontSizeToFit>{money(entro, vista)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.muted, fontSize: 12 }}>Salió</Text>
              <Text style={{ color: c.gasto, fontWeight: '700', fontSize: 15 }} numberOfLines={1} adjustsFontSizeToFit>{money(salio, vista)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: c.muted, fontSize: 12 }}>{cantidad} {cantidad === 1 ? 'movimiento' : 'movimientos'}</Text>
              <Text style={{ color: totalFiltrado < 0 ? c.gasto : c.ingreso, fontWeight: '700', fontSize: 13 }}>{money(totalFiltrado, vista)}</Text>
            </View>
          </View>
        )}
      </View>
      {escritorio ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, ...centrado(MAX) }} refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}>
          {secciones.length === 0 ? vacio : (
            <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
              {columnas.map((col, i) => (
                <View key={i} style={{ flex: 1, minWidth: 0 }}>
                  {col.items.map((section) => (
                    <View key={section.fecha} style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                        <Text style={[s.h, { marginBottom: 0 }]}>{tituloDia(section.fecha)}</Text>
                        <Text style={{ color: c.muted, fontSize: 12 }}>{money(section.total, vista)}</Text>
                      </View>
                      {section.data.map((m) => <Fila key={m.id} m={m} conFecha={false} />)}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
      <SectionList
        sections={secciones}
        keyExtractor={(m) => m.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 100, ...centrado(MAX) }}
        renderSectionHeader={({ section }) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, backgroundColor: c.bg }}>
            <Text style={[s.h, { marginBottom: 0 }]}>{tituloDia(section.fecha)}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{money(section.total, vista)}</Text>
          </View>
        )}
        renderItem={({ item }) => <Fila m={item} conFecha={false} />}
        ListEmptyComponent={vacio}
        refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}
      />
      )}
      <Fab />
      <Hoja visible={hoja} onCerrar={() => setHoja(false)} titulo="Filtros">
        <Text style={{ ...etiqueta, marginTop: 0 }}>Período</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {RANGOS.map((x) => <Chip key={x.r} label={x.label} on={rango === x.r} color={c.transferencia} onPress={() => setRango(x.r)} />)}
        </View>
        {rango === 'custom' && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
            {([['Desde', desdeTxt, setDesdeTxt], ['Hasta', hastaTxt, setHastaTxt]] as const).map(([label, valor, set]) => (
              <TextInput
                key={label}
                style={{ flex: 1, backgroundColor: c.bg, color: c.text, borderRadius: radio.m, paddingHorizontal: 14, minHeight: TOQUE, borderWidth: 1, borderColor: c.border }}
                placeholder={`${label} dd/mm/aaaa`}
                placeholderTextColor={c.muted}
                value={valor}
                onChangeText={set}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel={label}
              />
            ))}
          </View>
        )}
        {fechaInvalida && <Text style={{ color: c.aviso, fontSize: 12, marginBottom: 6 }}>Escribí las fechas como 25/12/2026.</Text>}
        <Text style={etiqueta}>Tipo</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {FILTROS.map((f) => <Chip key={f.label} label={f.label} on={tipo === f.tipo} color={f.color} onPress={() => setTipo(f.tipo)} />)}
        </View>
        <Text style={etiqueta}>Moneda</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="Todas" on={!moneda} color={c.transferencia} onPress={() => setMoneda(null)} />
          {MONEDAS.map((m) => <Chip key={m} label={m} on={moneda === m} color={c.transferencia} onPress={() => setMoneda(moneda === m ? null : m)} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}><Boton titulo="Limpiar" variante="borde" color={c.border} onPress={limpiar} /></View>
          <View style={{ flex: 2 }}><Boton titulo={`Ver ${cantidad} ${cantidad === 1 ? 'movimiento' : 'movimientos'}`} onPress={() => setHoja(false)} /></View>
        </View>
      </Hoja>
    </View>
  );
}
