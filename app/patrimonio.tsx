import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LineaMeses } from '../src/charts';
import { emojiCuenta } from '../src/proveedores';
import { convertir, saldosAl, saldosPorCuenta, useFinanzas, usePatrimonio } from '../src/store';
import { c } from '../src/theme';
import { Barra, Card, centrado, Chip, MAX_FORM, s, tap, Tip, Titulo } from '../src/ui';
import { etiquetaMes, mesActual, money, pct, sumaMes } from '../src/util';

const Linea = ({ t, v, color, moneda, signo = false }: { t: string; v: number; color?: string; moneda: Parameters<typeof money>[1]; signo?: boolean }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
    <Text style={{ color: c.muted }}>{t}</Text>
    <Text style={{ color: color ?? c.text, fontWeight: '700' }}>{signo && v > 0 ? '+' : ''}{money(v, moneda)}</Text>
  </View>
);

export default function Patrimonio() {
  const [meses, setMeses] = useState(12);
  const [sel, setSel] = useState(mesActual());
  const serie = usePatrimonio(meses);
  const vista = useFinanzas((st) => st.monedaVista);
  const cot = useFinanzas((st) => st.cotizaciones);
  const cuentas = useFinanzas((st) => st.cuentas);
  const porAnio = useFinanzas((st) => st.porAnio);
  const iniciales = useFinanzas((st) => st.saldosIniciales);
  const ahorros = useFinanzas((st) => st.ahorrosIniciales);

  const punto = serie.find((p) => p.ym === sel) ?? serie[serie.length - 1];
  const anterior = serie[serie.findIndex((p) => p.ym === punto.ym) - 1];
  const primero = serie[0];
  const cambio = anterior ? punto.total - anterior.total : null;
  const desdeInicio = punto.total - primero.total;
  const hoy = serie[serie.length - 1];

  // Dónde está la plata hoy: por cuenta, y lo que no tiene cuenta (movimientos sueltos y ajustes de saldo)
  const { filas, ahorrado } = useMemo(() => {
    const porCuenta = saldosPorCuenta(porAnio, cuentas);
    const enVista = (v: number, m: 'ARS' | 'USD' | 'USDT') => convertir(v, m, vista, cot) ?? 0;
    const filas = cuentas
      .map((x) => ({ x, v: Object.entries(porCuenta.get(x.id) ?? {}).reduce((a, [m, n]) => a + enVista(n as number, m as 'ARS' | 'USD' | 'USDT'), 0) }))
      .filter(({ x, v }) => v !== 0 || x.activa)
      .sort((a, b) => b.v - a.v);
    const ahorrado = saldosAl(porAnio, iniciales, ahorros, mesActual()).reduce((a, x) => a + enVista(x.ahorrado, x.moneda), 0);
    return { filas, ahorrado };
  }, [porAnio, cuentas, iniciales, ahorros, vista, cot]);
  const enCuentas = filas.reduce((a, f) => a + f.v, 0);
  const sinCuenta = hoy.efectivo - enCuentas;
  const base = Math.max(1, ...filas.map((f) => Math.abs(f.v)), Math.abs(sinCuenta));

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }}>
      <Tip id="patrimonio-ayuda" emoji="📈">
        Tu patrimonio es todo lo que tenés (dinero en todas tus monedas, ahorros incluidos) más lo que te deben, menos lo que debés. Cada mes se valúa con la cotización que la app tenía guardada en esa fecha; para los meses anteriores a que empezara a guardarlas se usa la de hoy.
      </Tip>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={s.h}>Patrimonio · {etiquetaMes(punto.ym)}</Text>
          <View style={{ flexDirection: 'row' }}>
            {[6, 12].map((n) => <Chip key={n} label={`${n} m`} on={meses === n} onPress={() => { setMeses(n); setSel(mesActual()); }} />)}
          </View>
        </View>
        <Text style={{ ...s.big, color: punto.total < 0 ? c.gasto : c.text }}>{money(punto.total, vista)}</Text>
        {cambio !== null && (
          <Text style={{ color: cambio >= 0 ? c.ingreso : c.gasto, marginTop: 4, fontWeight: '600' }}>
            {cambio >= 0 ? '▲' : '▼'} {money(Math.abs(cambio), vista)} vs. {etiquetaMes(anterior.ym)}
            {anterior.total !== 0 ? ` (${cambio >= 0 ? '+' : '−'}${pct(Math.abs(cambio), Math.abs(anterior.total))}%)` : ''}
          </Text>
        )}
        {punto.ym !== primero.ym && (
          <Text style={{ color: c.muted, marginTop: 2 }}>
            En {meses} meses: <Text style={{ color: desdeInicio >= 0 ? c.ingreso : c.gasto, fontWeight: '700' }}>{desdeInicio >= 0 ? '+' : '−'}{money(Math.abs(desdeInicio), vista)}</Text> desde {etiquetaMes(primero.ym)}
          </Text>
        )}
        <View style={{ marginTop: 14 }}>
          <LineaMeses data={serie.map((p) => ({ ym: p.ym, total: p.total }))} sel={punto.ym} onSel={setSel} moneda={vista} />
        </View>
        <Text style={[s.sub, { marginTop: 6 }]}>Tocá un mes para ver su detalle.</Text>
      </Card>

      <Card>
        <Titulo t={`Detalle de ${etiquetaMes(punto.ym)}`} />
        <Linea t="Tu dinero" v={punto.efectivo} moneda={vista} />
        <Linea t="Te deben" v={punto.cobrar} color={c.ingreso} moneda={vista} signo />
        <Linea t="Debés" v={-punto.deber} color={punto.deber ? c.gasto : c.muted} moneda={vista} />
        <View style={{ borderTopWidth: 1, borderTopColor: c.border, marginTop: 6, paddingTop: 6 }}>
          <Linea t="Patrimonio" v={punto.total} moneda={vista} />
        </View>
        {(punto.cobrar > 0 || punto.deber > 0) && (
          <Link href="/deudas" asChild><Pressable onPress={() => tap()}><Text style={{ color: c.accent, fontWeight: '700', marginTop: 6 }}>Ver deudas ›</Text></Pressable></Link>
        )}
      </Card>

      <Card>
        <Titulo t="Dónde está tu plata hoy" sub={`Por cuenta, en ${vista}`} />
        {filas.length === 0 && <Text style={s.sub}>Todavía no tenés cuentas. Se crean solas con el método de cada movimiento.</Text>}
        {filas.map(({ x, v }) => (
          <View key={x.id} style={{ marginBottom: 12, opacity: x.activa ? 1 : 0.55 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: c.text }}>{x.nombre}</Text>
              <Text style={{ color: v < 0 ? c.gasto : c.text, fontWeight: '700' }}>{money(v, vista)}</Text>
            </View>
            <Barra valor={(Math.abs(v) / base) * 100} color={v < 0 ? c.gasto : c.transferencia} alto={6} />
          </View>
        ))}
        {Math.abs(sinCuenta) >= 1 && (
          <View style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: c.muted }}>Sin cuenta / ajustes de saldo</Text>
              <Text style={{ color: c.muted, fontWeight: '700' }}>{money(sinCuenta, vista)}</Text>
            </View>
            <Barra valor={(Math.abs(sinCuenta) / base) * 100} color={c.muted} alto={6} />
          </View>
        )}
        {ahorrado !== 0 && <Text style={[s.sub, { marginTop: 4 }]}>{money(ahorrado, vista)} de tu dinero está ahorrado (ya incluido arriba).</Text>}
        <Link href="/cuentas" asChild><Pressable onPress={() => tap()}><Text style={{ color: c.accent, fontWeight: '700', marginTop: 8 }}>Administrar cuentas ›</Text></Pressable></Link>
      </Card>
    </ScrollView>
  );
}
