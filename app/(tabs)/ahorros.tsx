import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { convertir, saldosAl, useConversor, useFinanzas } from '../../src/store';
import { c } from '../../src/theme';
import type { Moneda } from '../../src/types';
import { Barra, Card, Columnas, Fila, MesSelector, SelectorMoneda, Tip, Titulo, centrado, s, tap } from '../../src/ui';
import { MESES, masReciente, mesActual, money, moneyCorto, parseMonto, pct, sumaMes } from '../../src/util';

const BANDERA: Record<Moneda, string> = { ARS: '🇦🇷', USD: '💵', USDT: '🪙' };
const nombreMes = (ym: string) => `${MESES[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;

// Formulario para crear o cambiar la meta de ahorro
const EditarMeta = ({ onListo }: { onListo: () => void }) => {
  const { metaAhorro, setMetaAhorro } = useFinanzas();
  const [nombre, setNombre] = useState(metaAhorro?.nombre ?? '');
  const [monto, setMonto] = useState(metaAhorro ? String(metaAhorro.monto) : '');
  const [moneda, setMoneda] = useState<Moneda>(metaAhorro?.moneda ?? 'USD');
  const input = { backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16, marginTop: 8 } as const;
  const guardar = () => {
    const n = parseMonto(monto);
    if (!n || n <= 0) return;
    tap(true);
    setMetaAhorro({ nombre: nombre.trim() || 'Mi meta', monto: n, moneda });
    onListo();
  };
  return (
    <View>
      <TextInput style={input} placeholder="¿Para qué ahorrás? (ej. Viaje, Fondo de emergencia)" placeholderTextColor={c.muted} value={nombre} onChangeText={setNombre} />
      <TextInput style={input} placeholder="Monto objetivo" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
        <Text style={{ color: c.muted, fontSize: 12 }}>Moneda de la meta</Text>
        <SelectorMoneda valor={moneda} onChange={setMoneda} chico />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Pressable onPress={guardar} style={{ flex: 1, backgroundColor: monto ? c.accent : c.border, borderRadius: 10, padding: 12, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar meta</Text>
        </Pressable>
        {metaAhorro && (
          <Pressable onPress={() => { tap(); setMetaAhorro(null); onListo(); }} style={{ borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.gasto }}>Quitar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

export default function Ahorros() {
  const { porAnio, saldosIniciales, ahorrosIniciales, metaAhorro, cotizaciones, sincronizando, sincronizar, setMonedaVista } = useFinanzas();
  const { vista, conv } = useConversor();
  const [editandoMeta, setEditandoMeta] = useState(false);
  const $ = (n: number) => money(vista === 'ARS' ? Math.round(n) : n, vista);
  // Sigue el mes elegido con las flechas (igual que el Resumen): "lo ahorrado" es al cierre de ese mes
  const mes = useFinanzas((st) => st.mes);
  const hoy = mes;
  const anio = mes.slice(0, 4);
  const esHoy = mes === mesActual();

  // Lo ahorrado hoy en cada moneda (incluye los ajustes de "Tu dinero → Ajustar")
  const saldos = useMemo(() => saldosAl(porAnio, saldosIniciales, ahorrosIniciales, hoy), [porAnio, saldosIniciales, ahorrosIniciales, hoy]);
  const total = saldos.reduce((a, x) => a + conv(x.ahorrado, x.moneda), 0);

  // Mes a mes del año: cuánto ahorraste, qué parte de tus ingresos fue y cuánto llevabas acumulado
  const d = useMemo(() => {
    const lista = porAnio[anio] ?? [];
    const ajuste = Object.entries(ahorrosIniciales[anio] ?? {}).reduce((a, [m, v]) => a + conv(v ?? 0, m as Moneda), 0);
    // Lo que ya llevabas ahorrado al cerrar el año anterior
    const previo = saldosAl(porAnio, saldosIniciales, ahorrosIniciales, `${+anio - 1}-12`).reduce((a, x) => a + conv(x.ahorrado, x.moneda), 0);
    let acumulado = previo + ajuste;
    const meses = Array.from({ length: 12 }, (_, i) => {
      const ym = `${anio}-${String(i + 1).padStart(2, '0')}`;
      const delMes = lista.filter((m) => m.fecha.startsWith(ym));
      const ahorro = -delMes.filter((m) => m.tipo === 'Ahorro').reduce((a, m) => a + conv(m.valor, m.moneda), 0);
      const ingresos = delMes.filter((m) => m.tipo === 'Ingreso').reduce((a, m) => a + conv(m.valor, m.moneda), 0);
      const gastos = -delMes.filter((m) => m.tipo === 'Egreso').reduce((a, m) => a + conv(m.valor, m.moneda), 0);
      acumulado += ahorro;
      return { ym, ahorro, ingresos, gastos, tasa: pct(ahorro, ingresos), acumulado };
    });
    const hayDatos = (x: (typeof meses)[number]) => !!(x.ingresos || x.gastos || x.ahorro);
    // Del primer mes con datos hasta el último con datos (aunque sea futuro) o el elegido
    const desde = Math.max(0, meses.findIndex(hayDatos));
    const hasta = Math.max(+mes.slice(5) - 1, meses.map(hayDatos).lastIndexOf(true));
    // Promedios con lo que ya pasó (hasta el mes elegido)
    const conDatos = meses.filter((x) => hayDatos(x) && x.ym <= mes);
    const ultimos = conDatos.slice(-3);
    const ritmo = ultimos.length ? ultimos.reduce((a, x) => a + x.ahorro, 0) / ultimos.length : 0; // promedio últimos 3 meses
    const gastoMensual = conDatos.length ? conDatos.reduce((a, x) => a + x.gastos, 0) / conDatos.length : 0;
    const movs = lista.filter((m) => m.tipo === 'Ahorro').sort(masReciente);
    const mejor = [...conDatos].sort((a, b) => b.ahorro - a.ahorro)[0];
    return { meses: meses.slice(desde, hasta + 1), ritmo, gastoMensual, movs, mejor, totalAnio: meses.reduce((a, x) => a + x.ahorro, 0), ingresosAnio: meses.reduce((a, x) => a + x.ingresos, 0) };
  }, [porAnio, anio, hoy, saldosIniciales, ahorrosIniciales, vista, cotizaciones]); // eslint-disable-line react-hooks/exhaustive-deps

  const max = Math.max(1, ...d.meses.map((x) => x.ahorro));
  const mesesCubiertos = d.gastoMensual > 0 ? total / d.gastoMensual : 0;

  // Meta: se compara en su propia moneda
  const totalEnMeta = metaAhorro ? saldos.reduce((a, x) => a + (convertir(x.ahorrado, x.moneda, metaAhorro.moneda, cotizaciones) ?? 0), 0) : 0;
  const ritmoEnMeta = metaAhorro ? convertir(d.ritmo, vista, metaAhorro.moneda, cotizaciones) ?? 0 : 0;
  const faltaMeta = metaAhorro ? Math.max(0, metaAhorro.monto - totalEnMeta) : 0;
  const mesesMeta = ritmoEnMeta > 0 ? Math.ceil(faltaMeta / ritmoEnMeta) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
    <MesSelector />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40, ...centrado() }} refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}>
      <Columnas
        izq={<>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[s.h, { marginBottom: 0 }]}>{esHoy ? '🐷 Tenés ahorrado' : `🐷 Ahorrado a fin de ${MESES[+mes.slice(5) - 1].toLowerCase()}`}</Text>
              <SelectorMoneda valor={vista} onChange={setMonedaVista} chico />
            </View>
            <Text style={[s.big, { color: total < 0 ? c.gasto : c.ahorro, marginTop: 6 }]}>{$(total)}</Text>
            {saldos.filter((x) => x.ahorrado !== 0).map((x) => (
              <View key={x.moneda} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
                <Text style={{ fontSize: 18, width: 30 }}>{BANDERA[x.moneda]}</Text>
                <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{money(x.ahorrado, x.moneda)}</Text>
                {x.moneda !== vista && <Text style={{ color: c.muted, fontSize: 12 }}>≈ {$(conv(x.ahorrado, x.moneda))}</Text>}
              </View>
            ))}
            {total === 0 && <Text style={{ color: c.muted, marginTop: 6 }}>Todavía no registraste ahorros. Cargá un movimiento de tipo 🐷 Ahorro.</Text>}
            <Link href="/saldos" asChild>
              <Pressable onPress={() => tap()} style={{ marginTop: 8 }}><Text style={{ color: c.accent, fontWeight: '700' }}>¿No coincide? Ajustar lo ahorrado ›</Text></Pressable>
            </Link>
          </Card>

          {/* Meta */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><Titulo t={`🎯 ${metaAhorro ? metaAhorro.nombre : 'Meta de ahorro'}`} sub={metaAhorro ? `Objetivo: ${money(metaAhorro.monto, metaAhorro.moneda)}` : 'Ponete un objetivo y mirá cuánto te falta'} /></View>
              {metaAhorro && !editandoMeta && <Pressable onPress={() => { tap(); setEditandoMeta(true); }} hitSlop={10}><Text style={{ color: c.accent, fontWeight: '700' }}>Editar</Text></Pressable>}
            </View>
            {(!metaAhorro || editandoMeta) ? (
              <EditarMeta onListo={() => setEditandoMeta(false)} />
            ) : (
              <>
                <Barra valor={pct(totalEnMeta, metaAhorro.monto)} color={totalEnMeta >= metaAhorro.monto ? c.ingreso : c.ahorro} alto={12} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{money(totalEnMeta, metaAhorro.moneda)}</Text>
                  <Text style={{ color: c.muted }}>{pct(totalEnMeta, metaAhorro.monto)}%</Text>
                </View>
                <Text style={{ color: c.text, marginTop: 8, lineHeight: 20 }}>
                  {faltaMeta <= 0
                    ? '🏆 ¡Llegaste a tu meta!'
                    : mesesMeta
                      ? `Te faltan ${money(faltaMeta, metaAhorro.moneda)}. Ahorrando como en los últimos meses (${money(ritmoEnMeta, metaAhorro.moneda)}/mes) llegás en ${mesesMeta} mes(es), en ${nombreMes(sumaMes(hoy, mesesMeta))}.`
                      : `Te faltan ${money(faltaMeta, metaAhorro.moneda)}. Empezá a ahorrar todos los meses para ver cuándo llegás.`}
                </Text>
              </>
            )}
          </Card>

          {/* Fondo de emergencia */}
          {d.gastoMensual > 0 && (
            <Card>
              <Titulo t="🛟 Fondo de emergencia" sub="Cuántos meses podrías vivir con lo ahorrado si dejaras de cobrar" />
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800' }}>{mesesCubiertos.toFixed(1).replace('.', ',')} meses</Text>
              <View style={{ marginTop: 8 }}><Barra valor={(mesesCubiertos / 6) * 100} color={mesesCubiertos >= 3 ? c.ingreso : mesesCubiertos >= 1 ? c.aviso : c.gasto} alto={10} /></View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={s.sub}>0</Text><Text style={s.sub}>3 meses</Text><Text style={s.sub}>6 meses</Text>
              </View>
              <Text style={[s.sub, { marginTop: 6, lineHeight: 18 }]}>
                Gastás en promedio {$(d.gastoMensual)} por mes. Lo recomendado es tener entre 3 y 6 meses de gastos guardados
                {mesesCubiertos < 3 ? ` (${$(d.gastoMensual * 3 - total)} más para llegar a 3).` : '. ¡Vas bien!'}
              </Text>
            </Card>
          )}
          <Tip id="ahorros" emoji="🐷">
            Lo ahorrado sale de los movimientos de tipo Ahorro. Si usaste parte de tus ahorros, corregilo en “Ajustar lo ahorrado”: cambia lo ahorrado sin tocar tu total.
          </Tip>
        </>}
        der={<>
          <Card>
            <Titulo t={`📈 Tu ahorro en ${anio}`} sub={`${$(d.totalAnio)} en el año · ${pct(d.totalAnio, d.ingresosAnio)}% de lo que ganaste`} />
            {d.meses.map((x) => (
              <View key={x.ym} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ color: x.ym === mes ? c.accent : c.text, fontWeight: x.ym === mes ? '800' : '400', width: 90 }}>{MESES[+x.ym.slice(5) - 1]}</Text>
                  <Text style={{ color: x.ahorro < 0 ? c.gasto : c.ahorro, fontWeight: '700', flex: 1 }}>{x.ahorro ? $(x.ahorro) : '—'}</Text>
                  {x.ingresos > 0 && <Text style={{ color: x.tasa >= 20 ? c.ingreso : x.tasa >= 10 ? c.ahorro : c.muted, fontSize: 12 }}>{x.tasa}% de ingresos</Text>}
                </View>
                <Barra valor={(Math.max(0, x.ahorro) / max) * 100} color={c.ahorro} alto={6} />
                <Text style={[s.sub, { fontSize: 11 }]}>Acumulado: {moneyCorto(x.acumulado, vista)}{x.ym > mesActual() ? ' · 📅 programado' : ''}</Text>
              </View>
            ))}
            {d.mejor && d.mejor.ahorro > 0 && <Text style={[s.sub, { marginTop: 10 }]}>🏆 Tu mejor mes fue {MESES[+d.mejor.ym.slice(5) - 1]} ({$(d.mejor.ahorro)}).</Text>}
          </Card>

          {d.ritmo > 0 && (
            <Card>
              <Titulo t="🔮 Si seguís así" sub={`Ahorrando ${$(d.ritmo)} por mes (promedio de tus últimos meses)`} />
              {[6, 12, 24].map((n) => (
                <View key={n} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border }}>
                  <Text style={{ color: c.text }}>En {n} meses ({nombreMes(sumaMes(hoy, n))})</Text>
                  <Text style={{ color: c.ahorro, fontWeight: '700' }}>{$(total + d.ritmo * n)}</Text>
                </View>
              ))}
              <Text style={[s.sub, { marginTop: 6 }]}>Sin contar intereses ni cambios en la cotización.</Text>
            </Card>
          )}

          <Card style={{ padding: 0, paddingVertical: 4 }}>
            <View style={{ padding: 14, paddingBottom: 4 }}><Titulo t="🧾 Movimientos de ahorro" sub={`${d.movs.length} en ${anio}`} /></View>
            {d.movs.length === 0 && <Text style={{ color: c.muted, paddingHorizontal: 14, paddingBottom: 12 }}>Sin movimientos de ahorro este año.</Text>}
            {d.movs.map((m) => <Fila key={m.id} m={m} />)}
          </Card>
        </>}
      />
    </ScrollView>
    </View>
  );
}
