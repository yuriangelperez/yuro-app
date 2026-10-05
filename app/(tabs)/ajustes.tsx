import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { type FuenteUsd, useFinanzas } from '../../src/store';
import { c } from '../../src/theme';
import { Card, centrado, Chip, EstadoSync, MAX_FORM, s, SelectorMoneda, tap, Titulo } from '../../src/ui';
import { money, parseMonto } from '../../src/util';

const FUENTES: { f: FuenteUsd; label: string }[] = [
  { f: 'blue', label: 'Blue' },
  { f: 'oficial', label: 'Oficial' },
  { f: 'bolsa', label: 'MEP' },
];

const Cotizacion = ({ m }: { m: 'USD' | 'USDT' }) => {
  const valor = useFinanzas((st) => st.cotizaciones[m]);
  const setCotizacion = useFinanzas((st) => st.setCotizacion);
  const [texto, setTexto] = useState('');
  const guardar = () => {
    const n = parseMonto(texto);
    if (n && n > 0) setCotizacion(m, n);
    setTexto('');
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
      <Text style={{ color: c.text, fontWeight: '700', width: 56 }}>1 {m}</Text>
      <Text style={{ color: c.muted, marginRight: 8 }}>=</Text>
      <TextInput
        style={{ flex: 1, backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10 }}
        placeholder={valor ? money(valor) : 'Sin cotización'}
        placeholderTextColor={valor ? c.text : c.muted}
        keyboardType="decimal-pad"
        value={texto}
        onChangeText={setTexto}
        returnKeyType="done"
        onSubmitEditing={guardar}
        onBlur={guardar}
      />
    </View>
  );
};

export default function Ajustes() {
  const { url, token, setConfig, sincronizar, sincronizando, versionScript, ultimaSync, monedaVista, setMonedaVista, fuenteUsd, setFuenteUsd, cotizaciones, actualizarCotizaciones, mostrarTips } = useFinanzas();
  const [u, setU] = useState(url);
  const [t, setT] = useState(token);
  const input = { backgroundColor: c.card2, color: c.text, borderRadius: 12, padding: 14, marginBottom: 12 } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Card>
        <Titulo t="🔗 Google Sheets (opcional)" sub='Sin conectar, la app funciona igual y guarda todo en este teléfono. Para sincronizar con tu hoja, pegá la URL del Web App de Apps Script y el token (ver README). Lo que cargaste antes se sube al conectar.' />
        <TextInput style={input} placeholder="https://script.google.com/macros/s/…/exec" placeholderTextColor={c.muted} autoCapitalize="none" value={u} onChangeText={setU} />
        <TextInput style={input} placeholder="Token" placeholderTextColor={c.muted} autoCapitalize="none" secureTextEntry value={t} onChangeText={setT} />
        <Pressable onPress={async () => { tap(true); setConfig(u, t); await sincronizar(); }} style={{ backgroundColor: c.accent, padding: 14, borderRadius: 14, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{sincronizando ? 'Sincronizando…' : 'Guardar y sincronizar'}</Text>
        </Pressable>
        <View style={{ marginTop: 12 }}><EstadoSync /></View>
        {versionScript !== null && <Text style={s.sub}>Versión del Apps Script: {versionScript || 'vieja (sin monedas)'}{versionScript >= 4 ? ' ✓' : ' (actualizala)'}</Text>}
        {ultimaSync && <Text style={[s.sub, { marginTop: 10 }]}>Última sincronización: {new Date(ultimaSync).toLocaleString()}</Text>}
      </Card>

      <Card>
        <Titulo t="💱 Monedas" sub="Cada movimiento guarda su moneda (columna J de la hoja). Los totales se convierten a la moneda que elijas." />
        <Text style={[s.h, { marginTop: 4 }]}>Ver totales en</Text>
        <View style={{ alignSelf: 'flex-start', marginBottom: 14 }}><SelectorMoneda valor={monedaVista} onChange={setMonedaVista} /></View>
        <Text style={s.h}>Dólar de referencia para USD</Text>
        <View style={{ flexDirection: 'row' }}>
          {FUENTES.map((x) => <Chip key={x.f} label={x.label} on={fuenteUsd === x.f} onPress={() => setFuenteUsd(x.f)} />)}
        </View>
        <Text style={s.sub}>USDT usa el dólar cripto. Podés escribir tu propia cotización.</Text>
        <Cotizacion m="USD" />
        <Cotizacion m="USDT" />
        <Pressable onPress={() => { tap(); actualizarCotizaciones(); }} style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' }}>
          <Text style={{ color: c.accent, fontWeight: '700' }}>↻ Actualizar desde dolarapi.com</Text>
        </Pressable>
        {cotizaciones.fecha && <Text style={[s.sub, { marginTop: 8 }]}>Actualizada: {new Date(cotizaciones.fecha).toLocaleString()}</Text>}
      </Card>

      <Card>
        <Titulo t="🎯 Saldos, presupuestos y ayuda" />
        <Link href="/recurrentes" asChild>
          <Pressable style={{ paddingVertical: 10 }}><Text style={{ color: c.text }}>🔁 Movimientos recurrentes ›</Text></Pressable>
        </Link>
        <Link href="/saldos" asChild>
          <Pressable style={{ paddingVertical: 10 }}><Text style={{ color: c.text }}>👛 Saldos iniciales por moneda ›</Text></Pressable>
        </Link>
        <Link href="/presupuestos" asChild>
          <Pressable style={{ paddingVertical: 10 }}><Text style={{ color: c.text }}>Editar presupuestos por categoría ›</Text></Pressable>
        </Link>
        <Pressable onPress={() => { tap(); mostrarTips(); }} style={{ paddingVertical: 10 }}>
          <Text style={{ color: c.text }}>💡 Volver a mostrar los consejos</Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}
