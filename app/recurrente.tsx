import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, confirmar } from '../src/alerta';
import { type Recurrente, useCategorias, useFinanzas } from '../src/store';
import { METODOS, c, catInfo, metInfo } from '../src/theme';
import type { Moneda } from '../src/types';
import { DIAS_SEMANA, descripcion, FRECUENCIAS, type Frecuencia, vecesPorMes } from '../src/recurrentes';
import { centrado, Chip, MAX_FORM, NuevaCategoria, SelectorMoneda, tap } from '../src/ui';
import { hoyYmd, mesActual, money, norm, parseMonto } from '../src/util';

const TIPOS: { t: Recurrente['tipo']; label: string; color: string }[] = [
  { t: 'Egreso', label: '⬇️ Gasto', color: c.gasto },
  { t: 'Ingreso', label: '⬆️ Ingreso', color: c.ingreso },
  { t: 'Ahorro', label: '🐷 Ahorro', color: c.ahorro },
];
const Etiqueta = ({ t }: { t: string }) => <Text style={{ color: c.muted, fontSize: 12, marginBottom: 8, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t}</Text>;
const unir = (base: string[], usados: string[]) => [...new Set([...base, ...usados.filter(Boolean)])];

export default function EditarRecurrente() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { recurrentes, porAnio, guardarRecurrente, borrarRecurrente, generarRecurrentes, eliminar } = useFinanzas();
  const previo = recurrentes.find((r) => r.id === id);
  const todos = useMemo(() => Object.values(porAnio).flat(), [porAnio]);

  const [tipo, setTipo] = useState<Recurrente['tipo']>(previo?.tipo ?? 'Egreso');
  const [monto, setMonto] = useState(previo ? String(Math.abs(previo.valor)).replace('.', ',') : '');
  const [moneda, setMoneda] = useState<Moneda>(previo?.moneda ?? 'ARS');
  const [concepto, setConcepto] = useState(previo?.concepto ?? '');
  const [dia, setDia] = useState(String(previo?.dia ?? +hoyYmd().slice(8)));
  const [metodo, setMetodo] = useState(previo?.metodo ?? 'Mercado pago');
  const [categoria, setCategoria] = useState(previo?.categoria ?? '');
  const [categoria2, setCategoria2] = useState(previo?.categoria2 ?? '');
  const [activo, setActivo] = useState(previo?.activo ?? true);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(previo?.frecuencia ?? 'mensual');
  const [diaSemana, setDiaSemana] = useState<number>(previo?.diaSemana ?? 1);

  const cuentas = useFinanzas((st) => st.cuentas);
  const metodos = useMemo(() => unir(METODOS, [...cuentas.filter((x) => x.activa).map((x) => x.nombre), ...todos.map((m) => m.metodo)]), [todos, cuentas]);
  const listaCat = useCategorias('cat');
  const listaCat2 = useCategorias('cat2');
  const categorias = useMemo(() => unir(listaCat, [previo?.categoria ?? '']), [listaCat, previo]);
  const categorias2 = useMemo(() => unir(listaCat2, [previo?.categoria2 ?? '']), [listaCat2, previo]);
  const color = TIPOS.find((x) => x.t === tipo)!.color;
  const input = { backgroundColor: c.card, color: c.text, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border } as const;
  const n = parseMonto(monto);
  const d = Math.round(Number(dia));

  const onGuardar = async () => {
    if (!n || n <= 0) return avisar('Ingresá un monto válido');
    if (!concepto.trim()) return avisar('Ingresá un concepto');
    if (frecuencia !== 'semanal' && !(d >= 1 && d <= 31)) return avisar('El día tiene que ser entre 1 y 31');
    tap(true);
    guardarRecurrente({
      id: previo?.id, concepto: concepto.trim(), valor: (tipo === 'Ingreso' ? 1 : -1) * n, moneda, tipo, metodo, categoria, categoria2, dia: d >= 1 && d <= 31 ? d : 1, activo,
      // Uno mensual arranca este mes: si su día ya pasó se carga ahora (salvo que ya lo hayas cargado a mano)
      desde: previo?.desde ?? mesActual(),
      ultimoYm: previo?.ultimoYm ?? null,
      // Quincenal / semanal arrancan hoy (no se cargan fechas anteriores); si cambia la frecuencia, se vuelve a contar desde hoy
      frecuencia,
      diaSemana: frecuencia === 'semanal' ? diaSemana : null,
      inicio: frecuencia === 'mensual' ? null : previo?.frecuencia === frecuencia ? previo.inicio ?? hoyYmd() : hoyYmd(),
      ultimaFecha: frecuencia === 'mensual' || previo?.frecuencia !== frecuencia ? null : previo.ultimaFecha ?? null,
    });
    router.back();
    if (activo) await generarRecurrentes();
  };

  const onBorrar = async () => {
    if (!previo) return;
    if (!(await confirmar('¿Borrar recurrente?', `"${previo.concepto}" deja de cargarse solo. Lo que ya se cargó queda.`, 'Borrar'))) return;
    tap(true);
    borrarRecurrente(previo.id);
    // Lo que se cargó con fecha de meses siguientes (de la hoja o de antes) seguiría contando en las estimaciones: se ofrece borrarlo
    const futuros = todos.filter((m) => m.fecha > hoyYmd() && m.tipo === previo.tipo && norm(m.concepto) === norm(previo.concepto));
    if (futuros.length && (await confirmar(`¿Borrar también los ${futuros.length} programados de "${previo.concepto}"?`, 'Tienen fecha de meses siguientes y seguirían apareciendo en lo que falta pagar o cobrar.', 'Borrar'))) {
      for (const m of futuros) await eliminar(m);
    }
    router.back();
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, padding: 4, marginBottom: 12 }}>
        {TIPOS.map((x) => (
          <Pressable key={x.t} onPress={() => { tap(); setTipo(x.t); }} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: tipo === x.t ? x.color : 'transparent' }}>
            <Text style={{ color: tipo === x.t ? '#fff' : c.muted, fontWeight: '700', fontSize: 13 }}>{x.label}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput style={[input, { marginBottom: 10 }]} placeholder="Concepto (ej. Netflix, Sueldo)" placeholderTextColor={c.muted} value={concepto} onChangeText={setConcepto} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: c.muted, fontSize: 12, textTransform: 'uppercase' }}>{frecuencia === 'mensual' ? 'Monto por mes' : frecuencia === 'quincenal' ? 'Monto por quincena' : 'Monto por semana'}</Text>
        <SelectorMoneda valor={moneda} onChange={setMoneda} chico />
      </View>
      <TextInput style={[input, { fontSize: 26, fontWeight: '800', color }]} placeholder="0" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} />
      {!!n && <Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>Por mes: {money(n * vecesPorMes({ frecuencia, dia: d }), moneda)} · Al año: {money(n * vecesPorMes({ frecuencia, dia: d }) * 12, moneda)}</Text>}

      <Etiqueta t="¿Cada cuánto se repite?" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {FRECUENCIAS.map((x) => <Chip key={x.f} label={x.label} on={frecuencia === x.f} onPress={() => setFrecuencia(x.f)} />)}
      </View>

      {frecuencia === 'semanal' ? (
        <>
          <Etiqueta t="¿Qué día de la semana?" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {DIAS_SEMANA.map((nombre, i) => <Chip key={nombre} label={nombre} on={diaSemana === i} onPress={() => setDiaSemana(i)} />)}
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>Se carga solo ese día, todas las semanas, desde hoy.</Text>
        </>
      ) : (
        <>
          <Etiqueta t={frecuencia === 'quincenal' ? '¿Qué día arranca la quincena?' : '¿Qué día del mes?'} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput style={[input, { width: 80, textAlign: 'center', fontSize: 18 }]} keyboardType="number-pad" value={dia} onChangeText={setDia} maxLength={2} />
            <Text style={{ color: c.muted, flex: 1, fontSize: 12 }}>
              {frecuencia === 'quincenal'
                ? `${d >= 1 && d <= 31 ? descripcion({ frecuencia, dia: d }) : 'Se carga dos veces por mes: el día que elijas y 15 días después'}. Si el mes tiene menos días, el último. Arranca hoy.`
                : 'Se carga solo ese día de cada mes. Si el mes tiene menos días, el último.'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {[1, 5, 10, 15, 28].map((x) => <Chip key={x} label={`Día ${x}`} on={d === x} onPress={() => setDia(String(x))} />)}
          </View>
        </>
      )}

      <Etiqueta t="Categoría" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {categorias.map((x) => <Chip key={x} label={`${catInfo(x).emoji} ${x}`} on={categoria === x} color={catInfo(x).color} onPress={() => setCategoria(categoria === x ? '' : x)} />)}
        <NuevaCategoria nivel="cat" onCreada={setCategoria} />
      </View>
      <Etiqueta t="Método" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {metodos.map((x) => <Chip key={x} label={`${metInfo(x).emoji} ${x}`} on={metodo === x} onPress={() => setMetodo(x)} />)}
      </View>
      <Etiqueta t="Categoría 2" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {categorias2.map((x) => <Chip key={x} label={x} on={categoria2 === x} onPress={() => setCategoria2(categoria2 === x ? '' : x)} />)}
        <NuevaCategoria nivel="cat2" onCreada={setCategoria2} />
      </View>

      {previo && (
        <>
          <Etiqueta t="Estado" />
          <View style={{ flexDirection: 'row' }}>
            <Chip label="▶️ Activo" on={activo} color={c.ingreso} onPress={() => setActivo(true)} />
            <Chip label="⏸ Pausado" on={!activo} color={c.muted} onPress={() => setActivo(false)} />
          </View>
        </>
      )}

      <Pressable onPress={onGuardar} style={{ backgroundColor: color, padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 16 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{previo ? 'Guardar cambios' : '🔁 Crear recurrente'}</Text>
      </Pressable>
      {previo && (
        <Pressable onPress={onBorrar} style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ color: c.gasto }}>🗑 Borrar recurrente</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
