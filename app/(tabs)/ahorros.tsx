import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { convertir, saldosAl, useConversor, useFinanzas } from '../../src/store';
import { c } from '../../src/theme';
import type { Moneda } from '../../src/types';
import { Barra, BarraAccion, Boton, Card, Columnas, Fila, Vacio, MesSelector, SelectorMoneda, Tip, Titulo, centrado, s, tap } from '../../src/ui';
import { MESES, masReciente, mesActual, money, moneyCorto, parseMonto, pct, sumaMes, yaPaso, hoyYmd } from '../../src/util';
import { Icono } from '../../src/iconos';

const BANDERA: Record<Moneda, string> = { ARS: '$', USD: 'US$', USDT: '₮' };
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
          <Text style={{ color: monto ? c.sobre : c.muted, fontWeight: '700' }}>Guardar meta</Text>
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
  // Ahorro programado (fecha futura) acumulado hasta un mes dado, arrastrando entre años.
  const ahorroProgramadoHasta = (hastaYm: string) =>
    -Object.values(porAnio)
      .flat()
      .filter((m) => m.tipo === 'Ahorro' && m.fecha.slice(0, 7) <= hastaYm && m.fecha > hoyYmd())
      .reduce((a, m) => a + conv(m.valor, m.moneda), 0);
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
    const lista = (porAnio[anio] ?? []).filter(yaPaso); // lo programado a futuro todavía no cuenta en lo ahorrado hoy...
    const futuros = (porAnio[anio] ?? []).filter((m) => !yaPaso(m) && m.tipo === 'Ahorro'); // ...pero sí se muestra como programado
    const ajuste = Object.entries(ahorrosIniciales[anio] ?? {}).reduce((a, [m, v]) => a + conv(v ?? 0, m as Moneda), 0);
    // Lo que ya llevabas ahorrado al cerrar el año anterior
    const previoYm = `${+anio - 1}-12`;
    const previoReal = saldosAl(porAnio, saldosIniciales, ahorrosIniciales, previoYm).reduce((a, x) => a + conv(x.ahorrado, x.moneda), 0);
    const previo = previoReal + ahorroProgramadoHasta(previoYm);
    let acumulado = previo + ajuste;
    const meses = Array.from({ length: 12 }, (_, i) => {
      const ym = `${anio}-${String(i + 1).padStart(2, '0')}`;
      const delMes = lista.filter((m) => m.fecha.startsWith(ym));
      const ahorro = -delMes.filter((m) => m.tipo === 'Ahorro').reduce((a, m) => a + conv(m.valor, m.moneda), 0);
      const prog = -futuros.filter((m) => m.fecha.startsWith(ym)).reduce((a, m) => a + conv(m.valor, m.moneda), 0); // ahorro programado para ese mes
      const ingresos = delMes.filter((m) => m.tipo === 'Ingreso').reduce((a, m) => a + conv(m.valor, m.moneda), 0);
      const gastos = -delMes.filter((m) => m.tipo === 'Egreso').reduce((a, m) => a + conv(m.valor, m.moneda), 0);
      acumulado += ahorro;
      return { ym, ahorro, prog, ingresos, gastos, tasa: pct(ahorro, ingresos), acumulado };
    });
    const hayDatos = (x: (typeof meses)[number]) => !!(x.ingresos || x.gastos || x.ahorro || x.prog);
    // Del primer mes con datos hasta el último con datos (aunque sea futuro) o el elegido
    const desde = Math.max(0, meses.findIndex(hayDatos));
    const hasta = Math.max(+mes.slice(5) - 1, meses.map(hayDatos).lastIndexOf(true));
    // Promedios con lo que ya pasó (hasta el mes elegido)
    const conDatos = meses.filter((x) => hayDatos(x) && x.ym <= mes);
    const conAhorroReal = conDatos.filter((x) => x.ahorro !== 0);
    const baseRitmo = conAhorroReal.length ? conAhorroReal : conDatos;
    const ultimos = baseRitmo.slice(-3);
    const ritmo = ultimos.length ? ultimos.reduce((a, x) => a + x.ahorro, 0) / ultimos.length : 0; // promedio últimos 3 meses con ahorro real (o con datos si todavía no hay)
    const gastoMensual = conDatos.length ? conDatos.reduce((a, x) => a + x.gastos, 0) / conDatos.length : 0;
    const movs = [...lista.filter((m) => m.tipo === 'Ahorro'), ...futuros].sort(masReciente); // los programados también
    const progHasta = meses.filter((x) => x.ym <= mes).reduce((a, x) => a + x.prog, 0); // programado hasta el mes elegido
    const mejor = [...conDatos].sort((a, b) => b.ahorro - a.ahorro)[0];
    return { meses: meses.slice(desde, hasta + 1), progHasta, ritmo, gastoMensual, movs, mejor, mesesRitmo: ultimos.length, totalAnio: meses.reduce((a, x) => a + x.ahorro, 0), ingresosAnio: meses.reduce((a, x) => a + x.ingresos, 0) };
  }, [porAnio, anio, hoy, saldosIniciales, ahorrosIniciales, vista, cotizaciones]); // eslint-disable-line react-hooks/exhaustive-deps

  const max = Math.max(1, ...d.meses.map((x) => x.ahorro + x.prog));
  const totalConProg = total + ahorroProgramadoHasta(mes); // lo ahorrado más lo programado hasta el cierre del mes elegido (arrastra entre años)
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
              <Text style={[s.h, { marginBottom: 0 }]}>{esHoy ? 'Tenés ahorrado' : `Ahorrado a fin de ${MESES[+mes.slice(5) - 1].toLowerCase()}`}</Text>
              <SelectorMoneda valor={vista} onChange={setMonedaVista} chico />
            </View>
            <Text style={[s.big, { color: totalConProg < 0 ? c.gasto : c.ahorro, marginTop: 6 }]}>{$(totalConProg)}</Text>
            {d.progHasta > 0 && <Text style={[s.sub, { marginTop: 2 }]}>Incluye {$(d.progHasta)} de ahorro programado que todavía no ocurrió.</Text>}
            {saldos.filter((x) => x.ahorrado !== 0).map((x) => (
              <View key={x.moneda} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.muted, width: 34 }}>{BANDERA[x.moneda]}</Text>
                <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{money(x.ahorrado, x.moneda)}</Text>
                {x.moneda !== vista && <Text style={{ color: c.muted, fontSize: 12 }}>≈ {$(conv(x.ahorrado, x.moneda))}</Text>}
              </View>
            ))}
            {d.progHasta > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border }}>
                <View style={{ width: 30 }}><Icono nombre="calendario" color={c.muted} size={18} /></View>
                <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>Programado: +{$(d.progHasta)}</Text>
              </View>
            )}
            {totalConProg === 0 && <Text style={{ color: c.muted, marginTop: 6 }}>Todavía no registraste ahorros. Empezá con el botón de abajo.</Text>}
            <Link href="/saldos" asChild>
              <Pressable onPress={() => tap()} style={{ marginTop: 8, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.accent, fontWeight: '700' }}>¿No coincide? Ajustar lo ahorrado ›</Text></Pressable>
            </Link>
          </Card>

          {/* Meta */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><Titulo t={`${metaAhorro ? metaAhorro.nombre : 'Meta de ahorro'}`} sub={metaAhorro ? `Objetivo: ${money(metaAhorro.monto, metaAhorro.moneda)}` : 'Ponete un objetivo y mirá cuánto te falta'} /></View>
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
                    ? '¡Llegaste a tu meta!'
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
              <Titulo t="Fondo de emergencia" sub="Cuántos meses podrías vivir con lo ahorrado si dejaras de cobrar" />
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
            <Titulo t={`Tu ahorro en ${anio}`} sub={`${$(d.totalAnio)} en el año · ${pct(d.totalAnio, d.ingresosAnio)}% de lo que ganaste`} />
            {d.meses.map((x) => (
              <View key={x.ym} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ color: x.ym === mes ? c.accent : c.text, fontWeight: x.ym === mes ? '800' : '400', width: 90 }}>{MESES[+x.ym.slice(5) - 1]}</Text>
                  <Text style={{ color: x.ahorro < 0 ? c.gasto : c.ahorro, fontWeight: '700', flex: 1 }}>{x.ahorro ? $(x.ahorro) : x.prog ? '' : '—'}{x.prog ? <Text style={{ color: c.muted, fontWeight: '600' }}>{x.ahorro ? ' + ' : ''}{$(x.prog)} programado</Text> : null}</Text>
                  {x.ingresos > 0 && <Text style={{ color: x.tasa >= 20 ? c.ingreso : x.tasa >= 10 ? c.ahorro : c.muted, fontSize: 12 }}>{x.tasa}% de ingresos</Text>}
                </View>
                <Barra valor={(Math.max(0, x.ahorro + x.prog) / max) * 100} color={x.prog && !x.ahorro ? c.muted : c.ahorro} alto={6} />
                <Text style={[s.sub, { fontSize: 11 }]}>Acumulado: {moneyCorto(x.acumulado, vista)}{x.ym > mesActual() || x.prog ? ' · incluye programado' : ''}</Text>
              </View>
            ))}
            {d.mejor && d.mejor.ahorro > 0 && <Text style={[s.sub, { marginTop: 10 }]}>Tu mejor mes fue {MESES[+d.mejor.ym.slice(5) - 1]} ({$(d.mejor.ahorro)}).</Text>}
          </Card>

          {d.ritmo > 0 && (
            <Card>
              <Titulo t="Si seguís así" sub={`Ahorrando ${$(d.ritmo)} por mes (promedio de ${d.mesesRitmo} mes${d.mesesRitmo === 1 ? "" : "es"} con ahorro real)`} />
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
            <View style={{ padding: 14, paddingBottom: 4 }}><Titulo t="Movimientos de ahorro" sub={`${d.movs.length} en ${anio}${d.movs.some((m) => !yaPaso(m)) ? ' · incluye los programados' : ''}`} /></View>
            {d.movs.length === 0 && <Vacio icono="ahorro" color={c.ahorro} titulo="Sin ahorros este año" texto="Cada vez que separes plata, registrala y la vas a ver acá." />}
            {d.movs.map((m) => <Fila key={m.id} m={m} />)}
          </Card>
        </>}
      />
    </ScrollView>
    <BarraAccion>
      <Boton titulo="Registrar un ahorro" icono="mas" color={c.ahorro} onPress={() => router.push({ pathname: '/nuevo', params: { tipo: 'Ahorro' } })} />
    </BarraAccion>
    </View>
  );
}
