import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { convertir, useCategorias, useFinanzas, useMovimientosMes } from '../src/store';
import { c, catInfo } from '../src/theme';
import type { Moneda } from '../src/types';
import { Avatar, Barra, centrado, MAX_FORM, Pastilla, s, SelectorMoneda, tap, Tip } from '../src/ui';
import { etiquetaMes, money, parseMonto, pct, yaPaso } from '../src/util';

// Una fila por categoría: si tiene tope muestra el avance; al tocarla se abre el editor (el tope se guarda al escribir).
const Fila = ({ cat, gastadoArs }: { cat: string; gastadoArs: number }) => {
  const actual = useFinanzas((st) => st.presupuestos[cat]);
  const cot = useFinanzas((st) => st.cotizaciones);
  const setPresupuesto = useFinanzas((st) => st.setPresupuesto);
  const [texto, setTexto] = useState(actual ? String(actual.monto) : '');
  const [moneda, setMoneda] = useState<Moneda>(actual?.moneda ?? 'ARS');
  const [abierto, setAbierto] = useState(false);
  const i = catInfo(cat);

  const guardar = (t: string, m: Moneda) => {
    const n = parseMonto(t);
    setPresupuesto(cat, n && n > 0 ? { monto: n, moneda: m } : null);
  };
  const gastado = convertir(gastadoArs, 'ARS', moneda, cot) ?? 0;
  const p = actual ? pct(gastado, actual.monto) : 0;
  const color = p >= 100 ? c.gasto : p >= 80 ? c.aviso : i.color;

  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Pressable onPress={() => { tap(); setAbierto(!abierto); }} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Avatar categoria={cat} size={40} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.titulo}>{cat}</Text>
          <Text style={s.sub}>{actual ? `${money(gastado, moneda)} de ${money(actual.monto, moneda)}` : `Gastaste ${money(gastado, moneda)} · sin tope`}</Text>
        </View>
        {actual ? <Pastilla texto={`${p}%`} positivo={p < 80} /> : <Text style={{ color: c.accent, fontWeight: '600', fontSize: 13 }}>＋ Tope</Text>}
      </Pressable>
      {actual && <View style={{ marginTop: 10 }}><Barra valor={p} color={color} alto={6} /></View>}
      {actual && p >= 80 && <Text style={{ color, fontSize: 12, marginTop: 6 }}>{p >= 100 ? `Te pasaste por ${money(gastado - actual.monto, moneda)}` : `Te quedan ${money(actual.monto - gastado, moneda)}`}</Text>}
      {abierto && (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16 }}
              placeholder="Monto máximo por mes"
              placeholderTextColor={c.muted}
              keyboardType="decimal-pad"
              value={texto}
              onChangeText={(t) => { setTexto(t); guardar(t, moneda); }}
            />
            <SelectorMoneda valor={moneda} onChange={(m) => { setMoneda(m); if (texto) guardar(texto, m); }} chico />
          </View>
          {actual && <Pressable onPress={() => { tap(); setTexto(''); guardar('', moneda); setAbierto(false); }} style={{ paddingTop: 10 }}><Text style={{ color: c.gasto, fontSize: 13 }}>Quitar tope</Text></Pressable>}
        </View>
      )}
    </View>
  );
};

export default function Presupuestos() {
  const { mes, movimientos } = useMovimientosMes();
  const lista = useCategorias('cat');
  const cot = useFinanzas((st) => st.cotizaciones);

  // Categorías de gasto conocidas + gastado este mes (en pesos, se convierte en cada fila)
  const { cats, gastado } = useMemo(() => {
    const g: Record<string, number> = {};
    for (const m of movimientos) if (m.tipo === 'Egreso' && yaPaso(m)) g[m.categoria] = (g[m.categoria] ?? 0) - (convertir(m.valor, m.moneda, 'ARS', cot) ?? 0);
    // Tus categorías (sin las de ingreso/ahorro) + cualquiera con gastos este mes, aunque la hayas borrado
    const todas = [...new Set([...lista.filter((x) => !['Sueldo', 'Reserva', 'Ahorro'].includes(x)), ...Object.keys(g).filter(Boolean)])];
    return { cats: todas.sort((a, b) => (g[b] ?? 0) - (g[a] ?? 0)), gastado: g };
  }, [lista, movimientos, cot]);

  const presupuestos = useFinanzas((st) => st.presupuestos);
  const conTope = cats.filter((x) => presupuestos[x]);
  const sinTope = cats.filter((x) => !presupuestos[x]);
  const topeTotal = conTope.reduce((a, x) => a + (convertir(presupuestos[x].monto, presupuestos[x].moneda, 'ARS', cot) ?? 0), 0);
  const gastadoConTope = conTope.reduce((a, x) => a + (gastado[x] ?? 0), 0);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Tip id="presupuestos" emoji="🎯">
        Un presupuesto es el máximo que querés gastar por mes en una categoría. Empezá por las 2 o 3 donde más gastás. La barra se pone amarilla al 80% y roja al pasarte.
      </Tip>
      <View style={{ marginBottom: 16 }}>
        <Text style={s.h}>Presupuestado en {etiquetaMes(mes)}</Text>
        <Text style={s.big}>{money(topeTotal, 'ARS')}</Text>
        <View style={{ marginTop: 10 }}><Barra valor={pct(gastadoConTope, topeTotal || 1)} color={gastadoConTope > topeTotal ? c.gasto : c.ingreso} alto={8} /></View>
        <Text style={[s.sub, { marginTop: 6 }]}>{topeTotal ? `Llevás gastado ${money(gastadoConTope, 'ARS')} en las categorías con tope` : 'Todavía no definiste ningún tope'}</Text>
      </View>
      {conTope.length > 0 && (
        <>
          <Text style={[s.h, { marginLeft: 4, marginBottom: 8 }]}>Con tope</Text>
          <View style={{ backgroundColor: c.card, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>{conTope.map((cat) => <Fila key={cat} cat={cat} gastadoArs={gastado[cat] ?? 0} />)}</View>
        </>
      )}
      {sinTope.length > 0 && (
        <>
          <Text style={[s.h, { marginLeft: 4, marginBottom: 8 }]}>Sin tope · tocá una para ponerle</Text>
          <View style={{ backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' }}>{sinTope.map((cat) => <Fila key={cat} cat={cat} gastadoArs={gastado[cat] ?? 0} />)}</View>
        </>
      )}
    </ScrollView>
  );
}
