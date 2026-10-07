import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { type Saldo, saldosAl, useFinanzas } from '../src/store';
import { c } from '../src/theme';
import { MONEDAS, type Moneda } from '../src/types';
import { centrado, MAX_FORM, s, tap, Tip } from '../src/ui';
import { mesActual, money, parseMonto } from '../src/util';

const NOMBRE: Record<Moneda, string> = { ARS: '🇦🇷 Pesos', USD: '💵 Dólares', USDT: '🪙 USDT' };
const input = { flex: 1, backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16 } as const;

// Campo + botón Guardar (también guarda con "listo" en el teclado) y un aviso de confirmación.
const Ajuste = ({ titulo, placeholder, onGuardar }: { titulo: string; placeholder: string; onGuardar: (n: number) => string }) => {
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const guardar = () => {
    const n = parseMonto(texto);
    if (n === null) return setAviso('✗ Escribí un número, ej. 1.057.000');
    tap(true);
    setAviso(onGuardar(n));
    setTexto('');
  };
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={s.sub}>{titulo}</Text>
      <View style={{ flexDirection: 'row', marginTop: 6, gap: 8 }}>
        <TextInput
          style={input}
          placeholder={placeholder}
          placeholderTextColor={c.muted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          value={texto}
          onChangeText={(t) => { setTexto(t); setAviso(null); }}
          onSubmitEditing={guardar}
        />
        <Pressable onPress={guardar} disabled={!texto} style={{ backgroundColor: texto ? c.accent : c.border, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar</Text>
        </Pressable>
      </View>
      {aviso && <Text style={{ color: aviso.startsWith('✓') ? c.ingreso : c.gasto, marginTop: 6 }}>{aviso}</Text>}
    </View>
  );
};

// `base` = saldos calculados solo con los movimientos (sin ajustes); los ajustes guardan la diferencia con lo real.
const Fila = ({ anio, base }: { anio: string; base: Saldo }) => {
  const { moneda } = base;
  const inicial = useFinanzas((st) => st.saldosIniciales[anio]?.[moneda] ?? 0);
  const ahorroIni = useFinanzas((st) => st.ahorrosIniciales[anio]?.[moneda] ?? 0);
  const setSaldoInicial = useFinanzas((st) => st.setSaldoInicial);
  const setAhorroInicial = useFinanzas((st) => st.setAhorroInicial);
  const total = inicial + base.total;
  const ahorrado = ahorroIni + base.ahorrado;
  const $ = (n: number) => money(n, moneda);

  return (
    <View style={[s.card, { marginBottom: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={s.titulo}>{NOMBRE[moneda]}</Text>
        <Text style={{ color: c.text, fontWeight: '800', fontSize: 18 }}>{$(total)}</Text>
      </View>
      <Text style={[s.sub, { marginTop: 4 }]}>
        Disponible {$(total - ahorrado)} · 🐷 Ahorrado {$(ahorrado)}
      </Text>

      <Ajuste
        titulo="¿Cuánto tenés en total hoy? (disponible + ahorrado)"
        placeholder={$(total)}
        onGuardar={(n) => {
          setSaldoInicial(anio, moneda, Math.round((n - base.total) * 100) / 100);
          return `✓ Guardado: tenés ${$(n)} en total`;
        }}
      />
      <Ajuste
        titulo="¿Cuánto de eso tenés ahorrado hoy?"
        placeholder={$(ahorrado)}
        onGuardar={(n) => {
          setAhorroInicial(anio, moneda, Math.round((n - base.ahorrado) * 100) / 100);
          return `✓ Guardado: ${$(n)} ahorrado y ${$(total - n)} disponible`;
        }}
      />
    </View>
  );
};

export default function Saldos() {
  const porAnio = useFinanzas((st) => st.porAnio);
  const anio = mesActual().slice(0, 4);
  const saldosIniciales = useFinanzas((st) => st.saldosIniciales);
  const ahorrosIniciales = useFinanzas((st) => st.ahorrosIniciales);
  // Sin los ajustes de este año (los ajustes de años anteriores sí cuentan: es lo que se arrastra)
  const base = useMemo(() => {
    const sinAnio = (x: typeof saldosIniciales) => Object.fromEntries(Object.entries(x).filter(([a]) => a !== anio));
    return saldosAl(porAnio, sinAnio(saldosIniciales), sinAnio(ahorrosIniciales), mesActual());
  }, [porAnio, saldosIniciales, ahorrosIniciales, anio]);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Tip id="saldos-ayuda" emoji="🧮">
        Tu hoja registra lo que entra y sale, pero no cuánto tenías antes ni si usaste ahorros. Decime cuánto tenés hoy y cuánto de eso está ahorrado, y la app sigue sumando desde ahí. Se guarda en este teléfono.
      </Tip>
      {MONEDAS.map((m) => <Fila key={m} anio={anio} base={base.find((x) => x.moneda === m)!} />)}
    </ScrollView>
  );
}
