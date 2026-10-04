import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput } from 'react-native';
import { useFinanzas } from '../src/store';
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, c } from '../src/theme';
import type { Tipo } from '../src/types';

const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: on ? c.accent : c.card, marginRight: 8, marginBottom: 8 }}>
    <Text style={{ color: c.text }}>{label}</Text>
  </Pressable>
);

export default function Nuevo() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { movimientos, guardar, eliminar } = useFinanzas();
  const previo = movimientos.find((m) => m.id === id);

  const [tipo, setTipo] = useState<Tipo>(previo?.tipo ?? 'gasto');
  const [monto, setMonto] = useState(previo ? String(previo.monto) : '');
  const [categoria, setCategoria] = useState(previo?.categoria ?? 'Comida');
  const [descripcion, setDescripcion] = useState(previo?.descripcion ?? '');
  const [cuenta, setCuenta] = useState(previo?.cuenta ?? 'Efectivo');
  const [fecha, setFecha] = useState(previo?.fecha ?? new Date().toISOString().slice(0, 10));

  const cats = tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO;
  const input = { backgroundColor: c.card, color: c.text, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: c.border } as const;

  const onGuardar = async () => {
    const n = parseFloat(monto.replace(',', '.'));
    if (!n || n <= 0) return Alert.alert('Ingresá un monto válido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return Alert.alert('Fecha con formato AAAA-MM-DD');
    await guardar({ id: previo?.id, tipo, monto: n, categoria, descripcion, cuenta, fecha });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <ScrollView horizontal style={{ marginBottom: 12 }}>
        <Chip label="Gasto" on={tipo === 'gasto'} onPress={() => { setTipo('gasto'); setCategoria('Comida'); }} />
        <Chip label="Ingreso" on={tipo === 'ingreso'} onPress={() => { setTipo('ingreso'); setCategoria('Sueldo'); }} />
      </ScrollView>
      <TextInput style={{ ...input, fontSize: 28, fontWeight: '800' }} placeholder="0.00" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} />
      <ScrollView horizontal={false} style={{ marginBottom: 6 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cats.map((x) => <Chip key={x} label={x} on={categoria === x} onPress={() => setCategoria(x)} />)}
      </ScrollView>
      <TextInput style={input} placeholder="Descripción" placeholderTextColor={c.muted} value={descripcion} onChangeText={setDescripcion} />
      <TextInput style={input} placeholder="Cuenta (Efectivo, Banco…)" placeholderTextColor={c.muted} value={cuenta} onChangeText={setCuenta} />
      <TextInput style={input} placeholder="Fecha AAAA-MM-DD" placeholderTextColor={c.muted} value={fecha} onChangeText={setFecha} />
      <Pressable onPress={onGuardar} style={{ backgroundColor: c.accent, padding: 16, borderRadius: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Guardar</Text>
      </Pressable>
      {previo && (
        <Pressable onPress={async () => { await eliminar(previo.id); router.back(); }} style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ color: c.gasto }}>Eliminar</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
