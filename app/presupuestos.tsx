import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { convertir, useFinanzas, useMovimientosMes } from '../src/store';
import { CATEGORIAS, c, catInfo } from '../src/theme';
import type { Moneda } from '../src/types';
import { Barra, centrado, MAX_FORM, s, SelectorMoneda, Tip } from '../src/ui';
import { etiquetaMes, money, parseMonto, pct } from '../src/util';

// Una fila por categoría de gasto; el tope se guarda al escribir.
const Fila = ({ cat, gastadoArs }: { cat: string; gastadoArs: number }) => {
  const actual = useFinanzas((st) => st.presupuestos[cat]);
  const cot = useFinanzas((st) => st.cotizaciones);
  const setPresupuesto = useFinanzas((st) => st.setPresupuesto);
  const [texto, setTexto] = useState(actual ? String(actual.monto) : '');
  const [moneda, setMoneda] = useState<Moneda>(actual?.moneda ?? 'ARS');
  const i = catInfo(cat);

  const guardar = (t: string, m: Moneda) => {
    const n = parseMonto(t);
    setPresupuesto(cat, n && n > 0 ? { monto: n, moneda: m } : null);
  };
  const gastado = convertir(gastadoArs, 'ARS', moneda, cot) ?? 0;
  const p = actual ? pct(gastado, actual.monto) : 0;

  return (
    <View style={[s.card, { marginBottom: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 22, marginRight: 10 }}>{i.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{cat}</Text>
          <Text style={s.sub}>Este mes: {money(gastado, moneda)}</Text>
        </View>
        <SelectorMoneda valor={moneda} onChange={(m) => { setMoneda(m); if (texto) guardar(texto, m); }} chico />
      </View>
      <TextInput
        style={{ backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, marginTop: 10, fontSize: 16 }}
        placeholder="Sin tope · escribí un monto"
        placeholderTextColor={c.muted}
        keyboardType="decimal-pad"
        value={texto}
        onChangeText={(t) => { setTexto(t); guardar(t, moneda); }}
      />
      {actual && (
        <View style={{ marginTop: 10 }}>
          <Barra valor={p} color={p >= 100 ? c.gasto : p >= 80 ? c.aviso : i.color} />
          <Text style={[s.sub, { marginTop: 4 }]}>{p}% usado</Text>
        </View>
      )}
    </View>
  );
};

export default function Presupuestos() {
  const { mes, movimientos } = useMovimientosMes();
  const porAnio = useFinanzas((st) => st.porAnio);
  const cot = useFinanzas((st) => st.cotizaciones);

  // Categorías de gasto conocidas + gastado este mes (en pesos, se convierte en cada fila)
  const { cats, gastado } = useMemo(() => {
    const usadas = Object.values(porAnio).flat().filter((m) => m.tipo === 'Egreso').map((m) => m.categoria);
    const g: Record<string, number> = {};
    for (const m of movimientos) if (m.tipo === 'Egreso') g[m.categoria] = (g[m.categoria] ?? 0) - (convertir(m.valor, m.moneda, 'ARS', cot) ?? 0);
    const todas = [...new Set([...CATEGORIAS.filter((x) => !['Sueldo', 'Reserva', 'Ahorro'].includes(x)), ...usadas.filter(Boolean)])];
    return { cats: todas.sort((a, b) => (g[b] ?? 0) - (g[a] ?? 0)), gastado: g };
  }, [porAnio, movimientos, cot]);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Tip id="presupuestos" emoji="🎯">
        Un presupuesto es el máximo que querés gastar por mes en una categoría. Empezá por las 2 o 3 donde más gastás. La barra se pone amarilla al 80% y roja al pasarte.
      </Tip>
      <Text style={[s.h, { marginBottom: 10 }]}>Gastos de {etiquetaMes(mes)}</Text>
      {cats.map((cat) => <Fila key={cat} cat={cat} gastadoArs={gastado[cat] ?? 0} />)}
    </ScrollView>
  );
}
