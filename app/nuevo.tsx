import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFinanzas } from '../src/store';
import { CATEGORIAS, CATEGORIAS2, METODOS, c } from '../src/theme';
import type { Tipo } from '../src/types';
import { hoyYmd } from '../src/util';

const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: on ? c.accent : c.card, marginRight: 8, marginBottom: 8 }}>
    <Text style={{ color: c.text }}>{label}</Text>
  </Pressable>
);
const Etiqueta = ({ t }: { t: string }) => <Text style={{ color: c.muted, fontSize: 12, marginBottom: 6, textTransform: 'uppercase' }}>{t}</Text>;
const Grupo = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>{children}</View>;

// Valores de la hoja + los que ya uses, sin repetir
const unir = (base: string[], usados: string[]) => [...new Set([...base, ...usados.filter(Boolean)])];

export default function Nuevo() {
  const { id, fecha: fechaParam } = useLocalSearchParams<{ id?: string; fecha?: string }>();
  const porAnio = useFinanzas((s) => s.porAnio);
  const { guardar, eliminar } = useFinanzas();
  const todos = useMemo(() => Object.values(porAnio).flat(), [porAnio]);
  const previo = id ? (porAnio[(fechaParam ?? '').slice(0, 4)] ?? todos).find((m) => m.id === id) : undefined;

  const [tipo, setTipo] = useState<Tipo>(previo?.tipo ?? 'Egreso');
  const [valor, setValor] = useState(previo ? String(Math.abs(previo.valor)) : '');
  const [concepto, setConcepto] = useState(previo?.concepto ?? '');
  const [metodo, setMetodo] = useState(previo?.metodo ?? 'Efectivo');
  const [categoria, setCategoria] = useState(previo?.categoria ?? '');
  const [categoria2, setCategoria2] = useState(previo?.categoria2 ?? '');
  const [fecha, setFecha] = useState(previo?.fecha ?? hoyYmd());
  const [cumplidas, setCumplidas] = useState(previo?.cuotasCumplidas != null ? String(previo.cuotasCumplidas) : '');
  const [totales, setTotales] = useState(previo?.cuotasTotales != null ? String(previo.cuotasTotales) : '');

  const metodos = useMemo(() => unir(METODOS, todos.map((m) => m.metodo)), [todos]);
  const categorias = useMemo(() => unir(CATEGORIAS, todos.map((m) => m.categoria)), [todos]);
  const categorias2 = useMemo(() => unir(CATEGORIAS2, todos.map((m) => m.categoria2)), [todos]);
  const tipos: Tipo[] = previo?.tipo === 'Cambio' ? ['Egreso', 'Ingreso', 'Ahorro', 'Cambio'] : ['Egreso', 'Ingreso', 'Ahorro'];
  const input = { backgroundColor: c.card, color: c.text, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: c.border } as const;

  const onGuardar = async () => {
    const n = parseFloat(valor.replace(/\./g, '').replace(',', '.'));
    if (!n || n <= 0) return Alert.alert('Ingresá un valor válido');
    if (!concepto.trim()) return Alert.alert('Ingresá un concepto');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return Alert.alert('Fecha con formato AAAA-MM-DD');
    // Como en tu hoja: ingresos en positivo; egresos y ahorros en negativo. "Cambio" conserva su signo.
    const signo = tipo === 'Ingreso' ? 1 : tipo === 'Cambio' ? Math.sign(previo?.valor ?? -1) || -1 : -1;
    const credito = metodo.toLowerCase().includes('credito');
    await guardar({
      id: previo?.id, fecha, concepto: concepto.trim(), valor: signo * n, tipo, metodo, categoria, categoria2,
      cuotasCumplidas: credito && cumplidas ? +cumplidas : null,
      cuotasTotales: credito && totales ? +totales : null,
    });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Grupo>{tipos.map((t) => <Chip key={t} label={t} on={tipo === t} onPress={() => setTipo(t)} />)}</Grupo>
      <TextInput style={{ ...input, fontSize: 28, fontWeight: '800' }} placeholder="Valor" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={valor} onChangeText={setValor} />
      <TextInput style={input} placeholder="Concepto" placeholderTextColor={c.muted} value={concepto} onChangeText={setConcepto} />
      <Etiqueta t="Método" />
      <Grupo>{metodos.map((x) => <Chip key={x} label={x} on={metodo === x} onPress={() => setMetodo(x)} />)}</Grupo>
      <Etiqueta t="Categoría" />
      <Grupo>{categorias.map((x) => <Chip key={x} label={x} on={categoria === x} onPress={() => setCategoria(categoria === x ? '' : x)} />)}</Grupo>
      <Etiqueta t="Categoría 2" />
      <Grupo>{categorias2.map((x) => <Chip key={x} label={x} on={categoria2 === x} onPress={() => setCategoria2(categoria2 === x ? '' : x)} />)}</Grupo>
      {metodo.toLowerCase().includes('credito') && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={{ ...input, flex: 1 }} placeholder="Cuotas cumplidas" placeholderTextColor={c.muted} keyboardType="number-pad" value={cumplidas} onChangeText={setCumplidas} />
          <TextInput style={{ ...input, flex: 1 }} placeholder="Cuotas totales" placeholderTextColor={c.muted} keyboardType="number-pad" value={totales} onChangeText={setTotales} />
        </View>
      )}
      <TextInput style={input} placeholder="Fecha AAAA-MM-DD" placeholderTextColor={c.muted} value={fecha} onChangeText={setFecha} />
      <Pressable onPress={onGuardar} style={{ backgroundColor: c.accent, padding: 16, borderRadius: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Guardar</Text>
      </Pressable>
      {previo && (
        <Pressable onPress={async () => { await eliminar(previo); router.back(); }} style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ color: c.gasto }}>Eliminar</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
