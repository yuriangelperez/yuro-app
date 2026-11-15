import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar } from '../src/alerta';
import { proyectar } from '../src/proyeccion';
import { type Cuenta, emojiCuenta, TIPOS_CUENTA } from '../src/proveedores';
import { saldosAl, saldosPorCuenta, useAgenda, useConversor, useFinanzas } from '../src/store';
import { c } from '../src/theme';
import { centrado, MAX_FORM, Pastilla, s, tap, Tip } from '../src/ui';
import { MONEDAS, type Moneda } from '../src/types';
import { hoyYmd, mesActual, money, parseMonto } from '../src/util';
import { Icono, iconoCuenta, iconoDe } from '../src/iconos';

const FilaCuenta = ({ x, actual, real, onChange }: { x: Cuenta; actual: number; real: string; onChange: (t: string) => void }) => {
  const n = parseMonto(real);
  const dif = n !== null && real.trim() ? n - actual : null;
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Icono nombre={iconoCuenta(x)} color={c.text} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{x.nombre}</Text>
          <Text style={s.sub}>{TIPOS_CUENTA.find((t) => t.t === x.tipo)?.label.replace(/^\S+\s/, '')} · Yuro calcula {money(actual, x.moneda)}</Text>
        </View>
      </View>
      <TextInput
        style={{ backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16, marginTop: 10 }}
        placeholder={`Cuánto tenés realmente en ${x.moneda}`}
        placeholderTextColor={c.muted}
        keyboardType="decimal-pad"
        value={real}
        onChangeText={onChange}
      />
      {dif !== null && Math.abs(dif) >= 0.01 && (
        <View style={{ marginTop: 8 }}>
          <Pastilla texto={`${dif > 0 ? 'Te sobran' : 'Te faltan'} ${money(Math.abs(dif), x.moneda)} respecto a lo que calcula Yuro`} positivo={dif > 0} />
        </View>
      )}
    </View>
  );
};

type DatosBloque = { titulo: string; emoji: string; lista: Cuenta[]; total: string; vacio: React.ReactNode; actual: (x: Cuenta) => number; reales: Record<string, string>; onChange: (id: string, t: string) => void };
const Bloque = ({ titulo, emoji, lista, total, vacio, actual, reales, onChange }: DatosBloque) => (
  <View style={{ marginBottom: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginHorizontal: 4, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icono nombre={iconoDe(emoji)} color={c.muted} size={18} /><Text style={s.h}>{titulo}</Text></View>
      {lista.length > 0 && <Text style={{ color: c.text, fontWeight: '700' }}>{total}</Text>}
    </View>
    <View style={{ backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' }}>
      {lista.length === 0 ? vacio : lista.map((x) => <FilaCuenta key={x.id} x={x} actual={actual(x)} real={reales[x.id] ?? ''} onChange={(t) => onChange(x.id, t)} />)}
    </View>
  </View>
);

// "Cuánto tengo": efectivo por un lado, cuentas digitales por el otro. Escribís lo que realmente tenés y Yuro ajusta el saldo
// inicial de esa cuenta para que coincida (los movimientos no se tocan).
export default function EfectivoDigital() {
  const cuentas = useFinanzas((st) => st.cuentas);
  const porAnio = useFinanzas((st) => st.porAnio);
  const guardarCuenta = useFinanzas((st) => st.guardarCuenta);
  const setSaldoInicial = useFinanzas((st) => st.setSaldoInicial);
  const { vista, conv, puede } = useConversor();
  const [reales, setReales] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const saldos = useMemo(() => saldosPorCuenta(porAnio, cuentas), [porAnio, cuentas]);
  const agenda = useAgenda();
  const pendientes = agenda.filter((i) => i.estado === 'pendiente');
  const recurrentes = useFinanzas((st) => st.recurrentes);
  const saldosIniciales = useFinanzas((st) => st.saldosIniciales);
  const ahorrosIniciales = useFinanzas((st) => st.ahorrosIniciales);
  const activas = cuentas.filter((x) => x.activa);

  // "Mis monedas" (inicio) vs. la suma de tus cuentas. Lo ahorrado sigue estando en alguna cuenta (lo que escribís ya lo incluye): se compara con el total.
  const desfases = useMemo(() => {
    const totales = saldosAl(porAnio, saldosIniciales, ahorrosIniciales, mesActual());
    return MONEDAS.filter((mon) => cuentas.some((x) => x.moneda === mon)).map((mon) => {
      // Solo lo que cada cuenta tiene en su moneda habitual (lo que vos cargás acá); restos en otra moneda no cuentan
      const enCuentas = Math.round(cuentas.filter((x) => x.moneda === mon).reduce((a, x) => a + (saldos.get(x.id)?.[mon] ?? 0), 0) * 100) / 100;
      const inicio = totales.find((d) => d.moneda === mon)?.total ?? 0;
      return { mon, enCuentas, inicio, dif: Math.round((enCuentas - inicio) * 100) / 100 };
    }).filter((d) => Math.abs(d.dif) >= 0.01);
  }, [porAnio, saldosIniciales, ahorrosIniciales, cuentas, saldos]);

  const alinear = () => {
    tap(true);
    const anio = hoyYmd().slice(0, 4);
    for (const d of desfases) {
      const previo = useFinanzas.getState().saldosIniciales[anio]?.[d.mon] ?? 0;
      setSaldoInicial(anio, d.mon, Math.round((previo + d.dif) * 100) / 100);
    }
    avisar('Listo: "Mis monedas" ahora coincide con tus cuentas.');
  };
  const efectivo = activas.filter((x) => x.tipo === 'cash');
  const digital = activas.filter((x) => x.tipo !== 'cash');
  const actual = (x: Cuenta) => saldos.get(x.id)?.[x.moneda] ?? 0;
  const proy = useMemo(() => proyectar(pendientes, cuentas, recurrentes), [pendientes, cuentas, recurrentes]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = (lista: Cuenta[]) => lista.reduce((a, x) => a + (puede(x.moneda) ? conv(actual(x), x.moneda) : 0), 0);
  const cambios = activas.filter((x) => reales[x.id]?.trim() && parseMonto(reales[x.id]) !== null && Math.abs((parseMonto(reales[x.id]) ?? 0) - actual(x)) >= 0.01);

  const cambiar = (id: string, t: string) => setReales((r) => ({ ...r, [id]: t }));

  const guardar = async () => {
    if (!cambios.length || guardando) return;
    tap(true);
    setGuardando(true);
    // La diferencia entre lo real y lo calculado se absorbe en el saldo inicial de cada cuenta y, por la misma cantidad,
    // en el saldo inicial de esa moneda del año: así también se ajustan "Dinero total" y "Mis monedas" del inicio.
    const anio = hoyYmd().slice(0, 4);
    for (const x of cambios) {
      const dif = (parseMonto(reales[x.id]) ?? 0) - actual(x);
      await guardarCuenta({ ...x, saldoInicial: Math.round((x.saldoInicial + dif) * 100) / 100 });
      const previo = useFinanzas.getState().saldosIniciales[anio]?.[x.moneda] ?? 0;
      setSaldoInicial(anio, x.moneda, Math.round((previo + dif) * 100) / 100);
    }
    setReales({});
    setGuardando(false);
    avisar(`Listo: se actualizaron ${cambios.length} ${cambios.length === 1 ? 'cuenta' : 'cuentas'}.`);
  };

  const crearEfectivo = async () => { tap(true); await guardarCuenta({ nombre: 'Efectivo', proveedorId: 'efectivo', tipo: 'cash', moneda: 'ARS', saldoInicial: 0 }); };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Tip id="efectivo-digital" emoji="💵">
        Escribí cuánta plata tenés de verdad en cada lugar: el billete en la billetera y lo que dice cada app. Yuro compara con lo que calcula y ajusta la diferencia, sin tocar tus movimientos.
      </Tip>

      {desfases.length > 0 && (
        <View style={{ backgroundColor: c.aviso + '1a', borderColor: c.aviso + '66', borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <Text style={{ color: c.text, fontWeight: '700' }}>“Mis monedas” no coincide con tus cuentas</Text>
          {desfases.map((d) => (
            <Text key={d.mon} style={[s.sub, { marginTop: 4 }]}>{d.mon}: tus cuentas suman {money(d.enCuentas, d.mon as Moneda)} y el inicio dice {money(d.inicio, d.mon as Moneda)}.</Text>
          ))}
          <Pressable onPress={alinear} style={{ backgroundColor: c.aviso, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 10 }}>
            <Text style={{ color: '#1a1200', fontWeight: '800' }}>Alinear con mis cuentas</Text>
          </Pressable>
          <Text style={[s.sub, { marginTop: 8 }]}>Ajusta el saldo inicial de cada moneda por la diferencia. Los movimientos no se tocan.</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 16, padding: 14 }}>
          <Text style={s.sub}>Efectivo</Text>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{money(total(efectivo), vista)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 16, padding: 14 }}>
          <Text style={s.sub}>Digital</Text>
          <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{money(total(digital), vista)}</Text>
        </View>
      </View>

      {pendientes.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={[s.h, { marginLeft: 4, marginBottom: 8 }]}>Cómo quedarían después de lo pendiente ({pendientes.length})</Text>
          <View style={{ backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' }}>
            {activas.filter((x) => proy.porCuenta.has(x.id)).map((x) => {
              const delta = proy.porCuenta.get(x.id)?.[x.moneda] ?? 0;
              const queda = actual(x) + delta;
              return (
                <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: c.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.titulo}>{x.nombre}</Text>
                    <Text style={s.sub}>{money(actual(x), x.moneda)} hoy · {delta >= 0 ? '+' : ''}{money(delta, x.moneda)} pendiente</Text>
                  </View>
                  <Text style={{ color: queda < 0 ? c.gasto : c.text, fontWeight: '700' }}>{money(queda, x.moneda)}</Text>
                </View>
              );
            })}
            {(Object.entries(proy.sinCuenta) as [Moneda, number][]).filter(([, v]) => v !== 0).map(([mon, v]) => (
              <View key={mon} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
                <Text style={s.titulo}>Sin cuenta asignada</Text>
                <Text style={s.sub}>{v >= 0 ? '+' : ''}{money(v, mon)} pendiente: no se sabe de qué cuenta sale.</Text>
                <Pressable onPress={() => { tap(); router.push('/revisar'); }}><Text style={{ color: c.accent, fontWeight: '600', fontSize: 12, marginTop: 4 }}>Asignarle una cuenta ›</Text></Pressable>
              </View>
            ))}
          </View>
        </View>
      )}

      <Bloque
        titulo="Efectivo" emoji="💵" lista={efectivo} total={money(total(efectivo), vista)} actual={actual} reales={reales} onChange={cambiar}
        vacio={
          <Pressable onPress={crearEfectivo} style={{ padding: 16 }}>
            <Text style={s.sub}>Todavía no tenés una cuenta de efectivo.</Text>
            <Text style={{ color: c.accent, fontWeight: '700', marginTop: 6 }}>＋ Crear cuenta “Efectivo”</Text>
          </Pressable>
        }
      />
      <Bloque
        titulo="Digital (bancos y billeteras)" emoji="📱" lista={digital} total={money(total(digital), vista)} actual={actual} reales={reales} onChange={cambiar}
        vacio={<Text style={[s.sub, { padding: 16 }]}>Todavía no tenés cuentas digitales. Creá una desde “Mis cuentas” (Mercado Pago, un banco…).</Text>}
      />

      <Pressable onPress={guardar} disabled={!cambios.length || guardando} style={{ backgroundColor: cambios.length ? c.accent : c.border, borderRadius: 12, padding: 15, alignItems: 'center' }}>
        <Text style={{ color: cambios.length ? c.sobre : c.muted, fontWeight: '800' }}>{guardando ? 'Guardando…' : cambios.length ? `Guardar ${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'}` : 'Escribí un monto para ajustar'}</Text>
      </Pressable>
      <Text style={[s.sub, { marginTop: 12 }]}>Los movimientos sin cuenta asignada no entran en estas cuentas. Una cuenta en dólares se muestra en su moneda.</Text>
    </ScrollView>
  );
}
