import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Dona, type Porcion } from '../../src/charts';
import { calcularCuotas } from '../../src/cuotas';
import { convertir, movimientosDe, saldosAl, saldosPorCuenta, useConversor, useFinanzas, useAgenda, useAlertas, useMovimientosMes, useReservas, useResumenDeudas, useTransferenciasSugeridas, useDepositosReserva } from '../../src/store';
import { Icono, iconoDe } from '../../src/iconos';
import { c, catInfo, suave } from '../../src/theme';
import type { Moneda, Movimiento } from '../../src/types';
import { Acciones, Barra, Card, Bloque, Chip, EstadoSync, Fab, Fila, Hoja, Pastilla, Seccion, Segmentado, Tablero, centrado, MesSelector, SelectorMoneda, Tip, Titulo, s, tap } from '../../src/ui';
import { sincronizarMpAuto } from '../../src/mp';
import { calcularQuedaria } from '../../src/proyeccion';
import { descripcion as descRec, proxima as proxRec, tieneMovimiento } from '../../src/recurrentes';
import { MESES, diasDelMes, etiquetaMes, fechaCorta, hoyYmd, masReciente, mesActual, money, pct, sumaMes } from '../../src/util';

// Totales del mes convertidos a la moneda de vista
const totales = (lista: Movimiento[], conv: (v: number, de: Moneda) => number) => {
  const suma = (f: (m: Movimiento) => boolean) => lista.filter(f).reduce((a, m) => a + conv(m.valor, m.moneda), 0);
  const porCat: Record<string, number> = {};
  for (const m of lista) if (m.tipo === 'Egreso') porCat[m.categoria || 'Sin categoría'] = (porCat[m.categoria || 'Sin categoría'] ?? 0) - conv(m.valor, m.moneda);
  const porCatIng: Record<string, number> = {};
  for (const m of lista) if (m.tipo === 'Ingreso') porCatIng[m.categoria || 'Sin categoría'] = (porCatIng[m.categoria || 'Sin categoría'] ?? 0) + conv(m.valor, m.moneda);
  const ingresos = suma((m) => m.tipo === 'Ingreso');
  const gastos = -suma((m) => m.tipo === 'Egreso');
  const ahorro = -suma((m) => m.tipo === 'Ahorro');
  return {
    ingresos, gastos, ahorro, porCat, porCatIng,
    libre: ingresos - gastos - ahorro,
    digital: -suma((m) => m.tipo === 'Egreso' && m.metodo !== 'Efectivo'),
    efectivo: -suma((m) => m.tipo === 'Egreso' && m.metodo === 'Efectivo'),
  };
};

const Mini = ({ emoji, titulo, valor, color, moneda }: { emoji: string; titulo: string; valor: number; color: string; moneda: Moneda }) => (
  <View style={{ flex: 1, backgroundColor: c.card2, borderRadius: 12, padding: 10 }}>
    <Icono nombre={iconoDe(emoji)} color={color === c.text ? c.muted : color} size={18} />
    <Text style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>{titulo}</Text>
    <Text style={{ color, fontWeight: '800', fontSize: 14 }} numberOfLines={1} adjustsFontSizeToFit>{money(valor, moneda)}</Text>
  </View>
);

type Modo = 'hoy' | 'plan' | 'todo';
const MODOS: { valor: Modo; label: string }[] = [{ valor: 'hoy', label: 'Hasta hoy' }, { valor: 'plan', label: 'Planificado' }, { valor: 'todo', label: 'Todo junto' }];

// Comparativa de una torta: lo que ya pasó, lo planificado que falta y la suma, con el "te quedaría".
const Comparativa = ({ modo, onModo, hecho, pendiente, color, moneda, etiquetas, quedaria, quedariaTexto, oculto }: { modo: Modo; onModo: (m: Modo) => void; hecho: number; pendiente: number; color: string; moneda: Moneda; etiquetas: [string, string, string]; quedaria?: number; quedariaTexto?: string; oculto: boolean }) => {
  const ver = (n: number) => (oculto ? '••••' : money(n, moneda));
  const celdas: [Modo, string, number][] = [['hoy', etiquetas[0], hecho], ['plan', etiquetas[1], pendiente], ['todo', etiquetas[2], hecho + pendiente]];
  return (
    <View style={{ marginBottom: 12 }}>
      <Segmentado opciones={MODOS} valor={modo} onChange={onModo} color={color} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {celdas.map(([m, t, v]) => (
          <View key={m} style={{ flex: 1, backgroundColor: c.card2, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: modo === m ? color : 'transparent' }}>
            <Text style={{ color: c.muted, fontSize: 12 }} numberOfLines={2}>{t}</Text>
            <Text style={{ color: modo === m ? c.text : c.muted, fontWeight: '700', fontSize: 14, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{ver(v)}</Text>
          </View>
        ))}
      </View>
      {quedaria !== undefined && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, backgroundColor: suave(quedaria < 0 ? c.gasto : c.ingreso), borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
          <Text style={{ color: c.text, fontSize: 13, flex: 1 }}>{quedariaTexto}</Text>
          <Text style={{ color: quedaria < 0 ? c.gasto : c.ingreso, fontWeight: '800', fontSize: 16 }}>{ver(quedaria)}</Text>
        </View>
      )}
    </View>
  );
};

const Leyenda = ({ color, t }: { color: string; t: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14, marginTop: 6 }}>
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 6 }} />
    <Text style={{ color: c.muted, fontSize: 12 }}>{t}</Text>
  </View>
);

export default function Resumen() {
  const { sincronizando, sincronizar, presupuestos, porAnio, url, setMonedaVista, actualizarCotizaciones, saldosIniciales, ahorrosIniciales, recurrentes, recienGenerados, limpiarGenerados, planificados } = useFinanzas();
  const sugeridas = useTransferenciasSugeridas();
  // Deslizar para actualizar: además de la hoja, trae lo último de Mercado Pago
  const actualizar = async () => {
    await sincronizar();
    if (useFinanzas.getState().nubeUid && (await sincronizarMpAuto(0))) await sincronizar();
  };
  const cuentas = useFinanzas((st) => st.cuentas);
  const depositos = useDepositosReserva();
  const { mes, movimientos: todosDelMes } = useMovimientosMes();
  // Un movimiento con fecha futura (ej. una suscripción cargada para el 28/10) todavía no ocurrió: no cuenta como hecho, queda como pendiente
  const movimientos = useMemo(() => todosDelMes.filter((m) => m.fecha <= hoyYmd()), [todosDelMes]);
  // Planificados + movimientos programados a futuro + suscripciones/recurrentes del mes (cada uno pendiente o cumplido)
  const agenda = useAgenda();
  const alertas = useAlertas();
  const estadosReservas = useReservas();
  const resumenDeudas = useResumenDeudas().filter((r) => r.deuda.activa && !r.saldada);
  const cumplidosMes = agenda.filter((i) => i.estado === 'cumplido').length;
  const proximos = useMemo(() => [...agenda].sort((a, b) => (a.estado === b.estado ? a.fecha.localeCompare(b.fecha) : a.estado === 'pendiente' ? -1 : 1)).slice(0, 8), [agenda]);
  const { vista, cot, conv, puede } = useConversor();
  const [sel, setSel] = useState<string | null>(null);
  const [selIng, setSelIng] = useState<string | null>(null);
  // Las tortas comparan tres vistas: lo que ya pasó, lo planificado que falta, o todo junto
  const [modoGasto, setModoGasto] = useState<Modo>('todo');
  const [modoIng, setModoIng] = useState<Modo>('todo');
  const conPendientes = modoGasto !== 'hoy';
  const conPendIng = modoIng !== 'hoy';
  const [vistaTorta, setVistaTorta] = useState<'gastos' | 'ingresos'>('gastos');
  const [verAlertas, setVerAlertas] = useState(false);
  const [verMas, setVerMas] = useState(false);
  const [oculto, setOculto] = useState(false); // ojito: esconde los importes grandes
  const $ = (n: number) => money(n, vista);
  // Lo que falta cobrar / pagar este mes (planificados y suscripciones pendientes), en la moneda de vista
  const pendientesAgenda = agenda.filter((i) => i.estado === 'pendiente');
  // Un mes que todavía no llegó no tiene saldo propio: no se muestra lo que tenés hoy, solo lo que se espera cobrar y pagar
  const esFuturo = mes > mesActual();
  const mostrarProyeccion = mes === mesActual() && pendientesAgenda.length > 0;
  const previstoCobrar = pendientesAgenda.filter((i) => i.valor > 0 && puede(i.moneda)).reduce((a, i) => a + conv(i.valor, i.moneda), 0);
  const previstoPagar = -pendientesAgenda.filter((i) => i.valor < 0 && puede(i.moneda)).reduce((a, i) => a + conv(i.valor, i.moneda), 0);

  const r = useMemo(() => totales(movimientos, conv), [movimientos, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => totales(movimientosDe(porAnio, sumaMes(mes, -1)), conv), [porAnio, mes, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps
  const sinCotizar = [...new Set(movimientos.filter((m) => !puede(m.moneda)).map((m) => m.moneda))];

  // Cuánto tenés de cada moneda (acumulado) y cuánto se movió este mes
  const saldos = useMemo(() => saldosAl(porAnio, saldosIniciales, ahorrosIniciales, mes), [porAnio, saldosIniciales, ahorrosIniciales, mes]);
  const delMes = (mon: Moneda) => movimientos.filter((m) => m.moneda === mon && m.tipo !== 'Transferencia').reduce((a, m) => a + m.valor, 0); // una transferencia entre cuentas propias no cambia el total
  const visibles = saldos.filter((x) => x.usada || x.moneda === 'ARS');
  // Efectivo vs digital según tus cuentas (los movimientos sin cuenta no entran)
  const { efectivoTotal, digitalTotal } = useMemo(() => {
    const porCuenta = saldosPorCuenta(porAnio, cuentas);
    let e = 0, d = 0;
    // Solo la moneda habitual de cada cuenta (lo que cargás en Efectivo y digital): restos en otra moneda no cuentan
    for (const x of cuentas.filter((q) => q.activa && puede(q.moneda))) {
      const v = conv(porCuenta.get(x.id)?.[x.moneda] ?? 0, x.moneda);
      if (x.tipo === 'cash') e += v; else d += v;
    }
    return { efectivoTotal: e, digitalTotal: d };
  }, [porAnio, cuentas, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps
  // Lo que te queda en tus reservas (lo mismo que muestra la tarjeta "Reservas"), por moneda
  const reservado = useMemo(() => {
    const out: Partial<Record<Moneda, number>> = {};
    for (const e of estadosReservas) out[e.reserva.moneda] = (out[e.reserva.moneda] ?? 0) + Math.max(0, e.queda);
    return out;
  }, [estadosReservas]);
  // "Te quedaría": lo que hay hoy en tus cuentas (sin reservas ni Binance) + lo que falta cobrar − lo que falta pagar, con las reservas cubriendo pagos
  const quedaria = useMemo(
    () => calcularQuedaria({
      cuentas, saldos: saldosPorCuenta(porAnio, cuentas), pendientes: pendientesAgenda, recurrentes, conv, puede,
      ahorrado: Object.fromEntries(saldos.map((x) => [x.moneda, x.ahorrado])),
      reservado,
    }),
    [cuentas, porAnio, pendientesAgenda, recurrentes, saldos, reservado, vista, cot], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const totalTodo = saldos.reduce((a, x) => a + conv(x.total, x.moneda), 0);

  const porciones: Porcion[] = useMemo(
    () => Object.entries(r.porCat).sort((a, b) => b[1] - a[1]).map(([label, valor]) => ({ label, valor, ...catInfo(label) })),
    [r],
  );

  // Frases que explican el mes en palabras
  // Gastos que todavía no pasaron (planificados, programados y suscripciones pendientes), por categoría y en la moneda de vista
  const pendPorCat = useMemo(() => {
    const out: Record<string, { valor: number; items: typeof pendientesAgenda }> = {};
    for (const i of pendientesAgenda) {
      const rec = i.recurrenteId ? recurrentes.find((x) => x.id === i.recurrenteId) : undefined;
      const tipo = i.plan?.tipo ?? i.movimiento?.tipo ?? rec?.tipo;
      if (tipo !== 'Egreso' || i.valor >= 0) continue;
      const cat = i.plan?.categoria || i.movimiento?.categoria || rec?.categoria || 'Sin categoría';
      const e = out[cat] ?? { valor: 0, items: [] };
      e.valor += puede(i.moneda) ? -conv(i.valor, i.moneda) : 0;
      e.items.push(i);
      out[cat] = e;
    }
    return out;
  }, [pendientesAgenda, recurrentes, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPend = Object.values(pendPorCat).reduce((a, e) => a + e.valor, 0);
  const porcionesDona: Porcion[] = useMemo(() => {
    if (modoGasto === 'hoy') return porciones;
    const m: Record<string, number> = modoGasto === 'plan' ? {} : { ...r.porCat };
    for (const [cat, e] of Object.entries(pendPorCat)) m[cat] = (m[cat] ?? 0) + e.valor;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, valor]) => ({ label, valor, ...catInfo(label) }));
  }, [modoGasto, porciones, r, pendPorCat]);
  const gastosDona = (modoGasto === 'plan' ? 0 : r.gastos) + (conPendientes ? totalPend : 0);

  // Ingresos por categoría: lo ya cobrado + (opcional) lo que falta cobrar (planificados, programados y recurrentes de ingreso)
  const pendIngPorCat = useMemo(() => {
    const out: Record<string, { valor: number; items: typeof pendientesAgenda }> = {};
    for (const i of pendientesAgenda) {
      const rec = i.recurrenteId ? recurrentes.find((x) => x.id === i.recurrenteId) : undefined;
      const tipo = i.plan?.tipo ?? i.movimiento?.tipo ?? rec?.tipo;
      if (tipo !== 'Ingreso' || i.valor <= 0) continue;
      const cat = i.plan?.categoria || i.movimiento?.categoria || rec?.categoria || 'Sin categoría';
      const e = out[cat] ?? { valor: 0, items: [] };
      e.valor += puede(i.moneda) ? conv(i.valor, i.moneda) : 0;
      e.items.push(i);
      out[cat] = e;
    }
    return out;
  }, [pendientesAgenda, recurrentes, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPendIng = Object.values(pendIngPorCat).reduce((a, e) => a + e.valor, 0);
  const porcionesIng: Porcion[] = useMemo(() => {
    const m: Record<string, number> = modoIng === 'plan' ? {} : { ...r.porCatIng };
    if (conPendIng) for (const [cat, e] of Object.entries(pendIngPorCat)) m[cat] = (m[cat] ?? 0) + e.valor;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, valor]) => ({ label, valor, ...catInfo(label) }));
  }, [modoIng, r, pendIngPorCat]);
  const ingresosDona = (modoIng === 'plan' ? 0 : r.ingresos) + (conPendIng ? totalPendIng : 0);

  const datos = useMemo(() => {
    const out: { e: string; t: string }[] = [];
    const esActual = mes === mesActual();
    const dias = esActual ? +hoyYmd().slice(8) : diasDelMes(mes);
    const top = porciones[0];
    if (top) out.push({ e: catInfo(top.label).icono ?? 'tag', t: `${top.label} es donde más gastaste: ${$(top.valor)} (${pct(top.valor, r.gastos)}% de tus gastos).` });
    if (r.gastos > 0) out.push({ e: '📅', t: `Gastás en promedio ${$(r.gastos / dias)} por día.` });
    if (esActual && r.gastos > 0 && dias < diasDelMes(mes)) out.push({ e: '🔮', t: `A este ritmo vas a cerrar el mes con unos ${$((r.gastos / dias) * diasDelMes(mes))} en gastos.` });
    if (prev.gastos > 0 && r.gastos > 0) {
      const dif = pct(r.gastos - prev.gastos, prev.gastos);
      const nombre = MESES[+sumaMes(mes, -1).slice(5) - 1].toLowerCase();
      out.push(dif > 0
        ? { e: '📈', t: `Gastaste ${dif}% más que en ${nombre}${esActual ? ' (y el mes no terminó)' : ''}.` }
        : { e: '📉', t: `Gastaste ${-dif}% menos que en ${nombre}. ¡Bien!` });
    }
    const mayor = movimientos.filter((m) => m.tipo === 'Egreso').sort((a, b) => conv(a.valor, a.moneda) - conv(b.valor, b.moneda))[0];
    if (mayor) out.push({ e: '🧾', t: `Tu gasto más grande fue "${mayor.concepto}" por ${money(-mayor.valor, mayor.moneda)}.` });
    if (r.ingresos > 0) {
      const tasa = pct(r.ahorro, r.ingresos);
      out.push(tasa >= 20
        ? { e: '🏆', t: `Ahorraste el ${tasa}% de tus ingresos. ¡Excelente!` }
        : { e: '🐷', t: `Ahorraste el ${tasa}% de tus ingresos. Una meta habitual es separar entre 10% y 20% apenas cobrás.` });
    }
    return out;
  }, [porciones, r, prev, mes, movimientos]);

  const cuotas = useMemo(() => calcularCuotas(Object.values(porAnio).flat(), mes), [porAnio, mes]);
  const cuotasMes = [...cuotas.delMes, ...cuotas.porCargar].reduce((t, p) => t + conv(p.cuota, p.moneda), 0);
  const cuotasDeuda = cuotas.activas.reduce((t, p) => t + conv(p.deuda, p.moneda), 0);

  const presu = Object.entries(presupuestos)
    .map(([cat, p]) => ({ cat, tope: convertir(p.monto, p.moneda, vista, cot) ?? 0, gastado: r.porCat[cat] ?? 0 }))
    .filter((p) => p.tope > 0)
    .sort((a, b) => b.gastado / b.tope - a.gastado / a.tope);
  const base = Math.max(r.ingresos, r.gastos + r.ahorro, 1);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <MesSelector />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 100, ...centrado(760) }} refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={actualizar} tintColor={c.text} />}>
        <EstadoSync />
        {recienGenerados.length > 0 && (
          <View style={[s.tip, { borderColor: c.ingreso, backgroundColor: '#2ecc8f1a' }]}>
            <View style={{ marginRight: 10 }}><Icono nombre="repetir" color={c.ingreso} size={20} /></View>
            <Text style={{ color: c.text, flex: 1, lineHeight: 19 }}>
              Se cargaron solos: <Text style={{ fontWeight: '700' }}>{recienGenerados.join(', ')}</Text>. Si algún monto cambió, editalo en Movimientos.
            </Text>
            <Pressable onPress={() => { tap(); limpiarGenerados(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar aviso" style={{ marginLeft: 8 }}><Icono nombre="cerrar" color={c.muted} size={18} /></Pressable>
          </View>
        )}
        {!url && <Tip id="config" emoji="⚙️">Tus movimientos se guardan en este teléfono. Si querés tenerlos también en una hoja de Google, conectala en Ajustes (es opcional).</Tip>}
        {sinCotizar.length > 0 && (
          <Pressable onPress={() => { tap(); actualizarCotizaciones(); }} style={[s.tip, { borderColor: c.aviso }]}>
            <View style={{ marginRight: 10 }}><Icono nombre="alerta" color={c.aviso} size={20} /></View>
            <Text style={{ color: c.aviso, flex: 1 }}>Falta la cotización de {sinCotizar.join(', ')}: esos movimientos no se suman al total. Tocá para bajarla o cargala en Ajustes.</Text>
          </Pressable>
        )}

        <Tablero id="home" unaColumna ordenPorDefecto={['hero', 'alertas', 'acciones', 'balance', 'torta', 'ultimos']} ocultosPorDefecto={['total', 'efectivo', 'monedas', 'proyeccion', 'reservas', 'cuotas', 'deudas', 'planificados', 'recurrentes', 'datos', 'efvsdig', 'presupuestos']}>
        <Bloque id="hero" nombre="Para gastar hoy">
        <Card style={{ paddingVertical: 20 }}>
          {esFuturo ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}>Previsto para {etiquetaMes(mes)}</Text>
                <SelectorMoneda valor={vista} onChange={setMonedaVista} chico />
              </View>
              <Text style={{ color: previstoCobrar - previstoPagar < 0 ? c.gasto : c.ingreso, fontSize: 38, fontWeight: '700', letterSpacing: -1, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
                {previstoCobrar - previstoPagar < 0 ? '−' : '+'}{$(Math.abs(previstoCobrar - previstoPagar))}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Pastilla texto={`+${$(previstoCobrar)} por cobrar`} positivo />
                <Pastilla texto={`−${$(previstoPagar)} por pagar`} positivo={false} />
              </View>
            </>
          ) : mes !== mesActual() ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}>Dinero al cierre de {etiquetaMes(mes)}</Text>
                <SelectorMoneda valor={vista} onChange={setMonedaVista} chico />
              </View>
              <Text style={{ color: totalTodo < 0 ? c.gasto : c.text, fontSize: 38, fontWeight: '700', letterSpacing: -1, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{$(totalTodo)}</Text>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable onPress={() => { tap(); setOculto(!oculto); }} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}>Para gastar hoy</Text>
                  <Icono nombre={oculto ? 'ojoNo' : 'ojo'} color={c.muted} size={18} />
                </Pressable>
                <SelectorMoneda valor={vista} onChange={setMonedaVista} chico />
              </View>
              <Text style={{ color: quedaria.libreHoy < 0 ? c.gasto : c.text, fontSize: 40, fontWeight: '800', letterSpacing: -1, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{oculto ? '••••••' : $(quedaria.libreHoy)}</Text>
              <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>Efectivo y billeteras, sin reservas ni ahorros</Text>
              {pendientesAgenda.length > 0 && (
                <>
                  <View style={{ height: 1, backgroundColor: c.border, marginVertical: 14 }} />
                  <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}>Te quedaría a fin de mes</Text>
                  <Text style={{ color: quedaria.queda < 0 ? c.gasto : c.ingreso, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{oculto ? '••••••' : $(quedaria.queda)}</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <Pastilla texto={`+${oculto ? '••••' : $(quedaria.porCobrar)} por cobrar`} positivo />
                    <Pastilla texto={`−${oculto ? '••••' : $(quedaria.porPagar)} por pagar`} positivo={false} />
                  </View>
                </>
              )}
            </>
          )}
        </Card>
        </Bloque>

        {alertas.length > 0 && (
        <Bloque id="alertas" nombre="Para revisar">
          <View style={[s.card, { borderColor: alertas.some((a) => a.nivel === 'rojo') ? c.gasto : c.aviso }]}>
            <Pressable onPress={() => { tap(); setVerAlertas(!verAlertas); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ marginRight: 12 }}><Icono nombre="alerta" color={alertas.some((a) => a.nivel === 'rojo') ? c.gasto : c.aviso} size={22} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '700' }}>{alertas.length} {alertas.length === 1 ? 'cosa para revisar' : 'cosas para revisar'}</Text>
                <Text style={s.sub} numberOfLines={1}>{alertas[0].texto}</Text>
              </View>
              <Text style={{ color: c.accent, fontWeight: '600' }}>{verAlertas ? 'Cerrar' : 'Ver'}</Text>
            </Pressable>
            {verAlertas && alertas.slice(0, 8).map((a) => (
              <Link key={a.id} href={a.ruta} asChild>
                <Pressable onPress={() => tap()} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border, marginTop: 8 }}>
                  <View style={{ width: 24 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: a.nivel === 'rojo' ? c.gasto : c.aviso }} /></View>
                  <Text style={{ color: c.text, flex: 1 }}>{a.texto}</Text>
                  <Text style={{ color: c.accent }}>›</Text>
                </Pressable>
              </Link>
            ))}
          </View>
        </Bloque>
        )}

        <Bloque id="acciones" nombre="Accesos rápidos">
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {[{ e: '🗓️', l: 'Planificados', r: '/planificados' }, { e: '🤝', l: 'Deudas', r: '/deudas' }, { e: '🗂️', l: 'Reservas', r: '/reservas' }].map((a) => (
            <Link key={a.r} href={a.r as never} asChild>
              <Pressable onPress={() => tap()} style={{ flex: 1, backgroundColor: c.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                <Icono nombre={iconoDe(a.e)} color={c.text} size={22} />
                <Text style={{ color: c.muted, fontSize: 12, marginTop: 6, fontWeight: '500' }} numberOfLines={1}>{a.l}</Text>
              </Pressable>
            </Link>
          ))}
          <Pressable onPress={() => { tap(); setVerMas(true); }} accessibilityRole="button" style={{ flex: 1, backgroundColor: c.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
            <Icono nombre="puntos" color={c.text} size={22} />
            <Text style={{ color: c.muted, fontSize: 12, marginTop: 6, fontWeight: '500' }}>Más</Text>
          </Pressable>
        </View>
        <Hoja visible={verMas} onCerrar={() => setVerMas(false)} titulo="Accesos">
          <Acciones items={[
            { emoji: '🧮', label: 'Calculadora', ruta: '/calculadora' },
            { emoji: '💵', label: 'Efectivo', ruta: '/efectivo' },
            { emoji: '🏦', label: 'Cuentas', ruta: '/cuentas' },
            { emoji: '🎯', label: 'Presupuestos', ruta: '/presupuestos' },
            { emoji: '🗓️', label: 'Planificados', ruta: '/planificados' },
            { emoji: '🗂️', label: 'Reservas', ruta: '/reservas' },
            { emoji: '🤝', label: 'Deudas', ruta: '/deudas' },
            { emoji: '📈', label: 'Patrimonio', ruta: '/patrimonio' },
            { emoji: '🔁', label: 'Recurrentes', ruta: '/recurrentes' },
          ]} />
        </Hoja>
        </Bloque>

        <Bloque id="total" nombre="Dinero total">
        {esFuturo ? (
          /* Mes que viene: sin saldo, solo lo previsto */
          <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}>Previsto para {etiquetaMes(mes)}</Text>
              <SelectorMoneda valor={vista} onChange={setMonedaVista} chico />
            </View>
            <Text style={{ color: previstoCobrar - previstoPagar < 0 ? c.gasto : c.ingreso, fontSize: 38, fontWeight: '700', letterSpacing: -1, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
              {previstoCobrar - previstoPagar < 0 ? '−' : '+'}{$(Math.abs(previstoCobrar - previstoPagar))}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Pastilla texto={`+${$(previstoCobrar)} por cobrar`} positivo />
              <Pastilla texto={`−${$(previstoPagar)} por pagar`} positivo={false} />
            </View>
            <Text style={[s.sub, { marginTop: 8 }]}>Es lo que esperás cobrar y pagar ese mes (planificados, programados y recurrentes). No suma lo que tenés hoy: el saldo de un mes que no llegó todavía no existe.</Text>
          </View>
        ) : (
          <>
        <View style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={() => { tap(); setOculto(!oculto); }} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}>{mes === mesActual() ? 'Dinero total' : `Dinero al cierre de ${etiquetaMes(mes)}`}</Text>
              <Icono nombre={oculto ? 'ojoNo' : 'ojo'} color={c.muted} size={18} />
            </Pressable>
            <SelectorMoneda valor={vista} onChange={setMonedaVista} chico />
          </View>
          <Text style={{ color: totalTodo < 0 ? c.gasto : c.text, fontSize: 38, fontWeight: '700', letterSpacing: -1, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
            {oculto ? '••••••' : $(totalTodo)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <Pastilla texto={`${r.libre >= 0 ? '+' : '−'}${oculto ? '••••' : $(Math.abs(r.libre))} este mes`} positivo={r.libre >= 0} />
            {(cot.USD > 0 || cot.USDT > 0) && <Text style={s.sub}>{cot.USD > 0 ? `USD ${money(cot.USD)}` : ''}{cot.USD > 0 && cot.USDT > 0 ? ' · ' : ''}{cot.USDT > 0 ? `USDT ${money(cot.USDT)}` : ''}</Text>}
          </View>
        </View>

          </>
        )}
        </Bloque>

        {!esFuturo && (efectivoTotal !== 0 || digitalTotal !== 0) && (
          <Bloque id="efectivo" nombre="Efectivo y digital">
          <Link href="/efectivo" asChild>
            <Pressable onPress={() => tap()} style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 12, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icono nombre="billete" color={c.ingreso} size={16} /><Text style={s.sub}>Efectivo</Text></View>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 16, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{oculto ? '••••' : $(efectivoTotal)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 12, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icono nombre="celular" color={c.transferencia} size={16} /><Text style={s.sub}>Digital</Text></View>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 16, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{oculto ? '••••' : $(digitalTotal)}</Text>
              </View>
            </Pressable>
          </Link>
          </Bloque>
        )}


        {!esFuturo && (
          <Bloque id="monedas" nombre="Mis monedas">
        {/* Tu dinero por moneda */}
        <Card>
          <Seccion t="Mis monedas" sub={mes === mesActual() ? 'Lo que tenés hoy en cada moneda' : undefined} accion="Ajustar" ruta="/saldos" />
          {visibles.map((x, i) => (
            <View key={x.moneda} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{x.moneda === 'ARS' ? '$' : x.moneda === 'USD' ? 'US$' : '₮'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>{x.moneda}</Text>
                <Text style={s.sub} numberOfLines={2}>
                  Disponible {oculto ? '••••' : money(x.disponible, x.moneda)}{x.ahorrado ? ` · Ahorrado ${oculto ? '••••' : money(x.ahorrado, x.moneda)}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: x.total < 0 ? c.gasto : c.text, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{oculto ? '••••••' : money(x.total, x.moneda)}</Text>
                {x.moneda !== vista && puede(x.moneda) && x.total !== 0 && <Text style={s.sub}>≈ {oculto ? '••••' : $(conv(x.total, x.moneda))}</Text>}
                {!!delMes(x.moneda) && <Text style={{ color: delMes(x.moneda) > 0 ? c.ingreso : c.gasto, fontSize: 11, marginTop: 2 }}>{delMes(x.moneda) > 0 ? '+' : ''}{oculto ? '••••' : money(delMes(x.moneda), x.moneda)} mes</Text>}
              </View>
            </View>
          ))}
        </Card>
        <Tip id="saldos" emoji="👛">Acá ves cuánto tenés en cada moneda, sumando todo lo del año. Para que coincida con tu plata real, tocá “Ajustar” y cargá cuánto tenías de cada moneda el 1 de enero.</Tip>
          </Bloque>
        )}

        {/* Reservas */}
        {estadosReservas.length > 0 && (
        <Bloque id="reservas" nombre="Reservas">
          <Link href="/reservas" asChild>
            <Pressable onPress={() => tap()} style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><Titulo t="Reservas" sub={`Reservado: ${$(estadosReservas.reduce((a, e) => a + conv(Math.max(e.queda, 0), e.reserva.moneda), 0))}`} /></View>
                <Text style={{ color: c.accent, fontWeight: '700' }}>Ver ›</Text>
              </View>
              {estadosReservas.slice(0, 4).map((e) => (
                <View key={e.reserva.id} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: c.text }}>{e.reserva.nombre}</Text>
                    <Text style={{ color: e.queda < 0 ? c.gasto : c.muted, fontSize: 12 }}>queda {money(e.queda, e.reserva.moneda)} de {money(e.reserva.monto, e.reserva.moneda)}</Text>
                  </View>
                  <Barra valor={e.reserva.monto ? Math.min(100, (e.gastado / e.reserva.monto) * 100) : 100} color={e.queda < 0 ? c.gasto : c.reserva} alto={6} />
                </View>
              ))}
            </Pressable>
          </Link>
        </Bloque>
        )}

        {mostrarProyeccion && (
        <Bloque id="proyeccion" nombre="Te quedaría">
          <Card style={{ borderColor: (quedaria.queda < 0 ? c.gasto : c.ingreso) + '55', paddingVertical: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }}>Tu plata</Text>
              <Link href="/efectivo" asChild>
                <Pressable onPress={() => tap()} hitSlop={8}><Text style={{ color: c.accent, fontSize: 12, fontWeight: '600' }}>Ver por cuenta ›</Text></Pressable>
              </Link>
            </View>

            {/* Dos números distintos: lo que tenés hoy y lo que te va a quedar después de cobrar y pagar */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              <View style={{ flexGrow: 1, flexBasis: 200, backgroundColor: c.card2, borderRadius: 14, padding: 14 }}>
                <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>Tenés hoy</Text>
                <Text style={{ color: quedaria.libreHoy < 0 ? c.gasto : c.text, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{oculto ? '••••••' : $(quedaria.libreHoy)}</Text>
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>efectivo y billeteras, sin reservas ni Binance</Text>
              </View>
              <View style={{ flexGrow: 1, flexBasis: 200, backgroundColor: (quedaria.queda < 0 ? c.gasto : c.ingreso) + '1f', borderRadius: 14, padding: 14 }}>
                <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>Te quedaría después</Text>
                <Text style={{ color: quedaria.queda < 0 ? c.gasto : c.ingreso, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{oculto ? '••••••' : $(quedaria.queda)}</Text>
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>de cobrar y pagar {pendientesAgenda.length} {pendientesAgenda.length === 1 ? 'pendiente' : 'pendientes'}</Text>
              </View>
            </View>

            {/* Qué pasa entre uno y otro */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1, backgroundColor: c.card2, borderRadius: 12, padding: 12 }}>
                <Text style={{ color: c.muted, fontSize: 12 }}>Por cobrar</Text>
                <Text style={{ color: c.ingreso, fontWeight: '800', fontSize: 16, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>+{oculto ? '••••' : $(quedaria.porCobrar)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: c.card2, borderRadius: 12, padding: 12 }}>
                <Text style={{ color: c.muted, fontSize: 12 }}>Por pagar</Text>
                <Text style={{ color: c.gasto, fontWeight: '800', fontSize: 16, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>−{oculto ? '••••' : $(quedaria.porPagar)}</Text>
              </View>
            </View>

            {(quedaria.cubiertoReservas !== 0 || quedaria.aparte !== 0) && (
              <View style={{ marginTop: 12, gap: 4 }}>
                {quedaria.cubiertoReservas !== 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: c.muted, fontSize: 12 }}>Se paga con tus reservas</Text>
                    <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>{quedaria.cubiertoReservas > 0 ? '+' : '−'}{$(Math.abs(quedaria.cubiertoReservas))}</Text>
                  </View>
                )}
                {quedaria.aparte !== 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: c.muted, fontSize: 12, flex: 1 }}>Sale de Binance, no es plata para gastar</Text>
                    <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>{quedaria.aparte > 0 ? '+' : '−'}{$(Math.abs(quedaria.aparte))}</Text>
                  </View>
                )}
              </View>
            )}
            <Text style={{ color: c.muted, fontSize: 11, marginTop: 10, lineHeight: 15 }}>Tenés hoy es lo que hay ahora. Te quedaría es lo que va a haber cuando se cobre y se pague lo pendiente. Los totales por cobrar y por pagar son los mismos de Planificados.</Text>
          </Card>
        </Bloque>
        )}

        {/* Balance */}
        <Bloque id="balance" nombre="Este mes">
        <Card>
          <Titulo t="Este mes" sub="Lo que entró y salió según tus movimientos. No es tu saldo." />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Mini emoji="⬆️" titulo="Ingresos" valor={r.ingresos} color={c.ingreso} moneda={vista} />
            <Mini emoji="⬇️" titulo="Gastos" valor={r.gastos} color={c.gasto} moneda={vista} />
            <Mini emoji="🐷" titulo="Ahorro" valor={r.ahorro} color={c.ahorro} moneda={vista} />
          </View>
          {/* Cómo se repartió lo que entró */}
          <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.border, marginTop: 14 }}>
            <View style={{ width: `${(r.gastos / base) * 100}%`, backgroundColor: c.gasto }} />
            <View style={{ width: `${(r.ahorro / base) * 100}%`, backgroundColor: c.ahorro }} />
            <View style={{ width: `${(Math.max(r.libre, 0) / base) * 100}%`, backgroundColor: c.ingreso }} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Leyenda color={c.gasto} t="Gastado" />
            <Leyenda color={c.ahorro} t="Ahorrado" />
            <Leyenda color={c.ingreso} t="Libre" />
          </View>
          {r.ingresos > 0 && (
            <Text style={{ color: c.muted, marginTop: 10, lineHeight: 19 }}>
              De cada <Text style={{ color: c.text, fontWeight: '700' }}>{$(100)}</Text> que entraron, gastaste{' '}
              <Text style={{ color: c.gasto, fontWeight: '700' }}>{$(pct(r.gastos, r.ingresos))}</Text> y ahorraste{' '}
              <Text style={{ color: c.ahorro, fontWeight: '700' }}>{$(pct(r.ahorro, r.ingresos))}</Text>.
            </Text>
          )}
        </Card>
        </Bloque>


        {/* Torta de gastos */}
        <Bloque id="torta" nombre="Gastos e ingresos">
        <Segmentado opciones={[{ valor: 'gastos', label: 'Gastos' }, { valor: 'ingresos', label: 'Ingresos' }]} valor={vistaTorta} onChange={(v) => { setSel(null); setSelIng(null); setVistaTorta(v); }} />
        <View style={{ height: 10 }} />
        {vistaTorta === 'gastos' ? (
        <Card>
          <Titulo t="¿En qué se fue tu plata?" sub="Tocá una porción o una categoría para ver el detalle" />
          <Comparativa modo={modoGasto} onModo={(m) => { setSel(null); setModoGasto(m); }} hecho={r.gastos} pendiente={totalPend} color={c.gasto} moneda={vista} etiquetas={['Gastado hasta hoy', 'Falta pagar', 'Total del mes']}
            quedaria={mes === mesActual() ? (modoGasto === 'hoy' ? quedaria.libreHoy : quedaria.queda) : undefined} quedariaTexto={modoGasto === 'hoy' ? 'Tenés hoy para gastar' : 'Te quedaría después de cobrar y pagar todo'} oculto={oculto} />
          {porcionesDona.length === 0 ? (
            <Text style={{ color: c.muted, textAlign: 'center', paddingVertical: 24 }}>{modoGasto === 'plan' ? 'No tenés gastos planificados pendientes' : 'Sin gastos este mes'}</Text>
          ) : (
            <>
              <Dona data={porcionesDona} sel={sel} onSel={setSel} moneda={vista} />
              <View style={{ marginTop: 12 }}>
                {porcionesDona.map((p) => {
                  const activo = sel === p.label;
                  const pend = conPendientes ? pendPorCat[p.label]?.valor ?? 0 : 0;
                  return (
                    <Pressable key={p.label} onPress={() => { tap(); setSel(activo ? null : p.label); }} style={{ paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, backgroundColor: activo ? c.card2 : 'transparent', opacity: sel && !activo ? 0.5 : 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 8, marginRight: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: suave(p.color) }}><Icono nombre={catInfo(p.label).icono ?? 'tag'} color={p.color} size={16} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: c.text }}>{p.label}</Text>
                          {pend > 0 && modoGasto === 'todo' && <Text style={{ color: c.aviso, fontSize: 12 }}>incluye {$(pend)} pendiente</Text>}
                        </View>
                        <Text style={{ color: c.muted, marginRight: 8 }}>{pct(p.valor, gastosDona)}%</Text>
                        <Text style={{ color: c.text, fontWeight: '700' }}>{$(p.valor)}</Text>
                      </View>
                      <Barra valor={pct(p.valor, porcionesDona[0].valor)} color={p.color} alto={6} />
                    </Pressable>
                  );
                })}
              </View>
              {sel && (
                <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 4 }}>
                  {modoGasto !== 'plan' && movimientos.filter((m) => m.tipo === 'Egreso' && (m.categoria || 'Sin categoría') === sel).sort((a, b) => conv(a.valor, a.moneda) - conv(b.valor, b.moneda)).map((m) => <Fila key={m.id} m={m} />)}
                  {conPendientes && (pendPorCat[sel]?.items ?? []).map((i) => (
                    <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 }}>
                      <View style={{ width: 28 }}><Icono nombre="reloj" color={c.aviso} size={18} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.titulo} numberOfLines={1}>{i.concepto}</Text>
                        <Text style={s.sub}>Pendiente · {fechaCorta(i.fecha)}</Text>
                      </View>
                      <Text style={{ color: c.aviso, fontWeight: '700' }}>{money(i.valor, i.moneda)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </Card>
        ) : (
        <Card>
          <Titulo t="¿De dónde vino tu plata?" sub="Tus ingresos del mes por categoría. Tocá una para ver el detalle" />
          <Comparativa modo={modoIng} onModo={(m) => { setSelIng(null); setModoIng(m); }} hecho={r.ingresos} pendiente={totalPendIng} color={c.ingreso} moneda={vista} etiquetas={['Cobrado hasta hoy', 'Falta cobrar', 'Total del mes']} oculto={oculto} />
          {porcionesIng.length === 0 ? (
            <Text style={{ color: c.muted, textAlign: 'center', paddingVertical: 24 }}>{modoIng === 'plan' ? 'No tenés cobros planificados pendientes' : 'Todavía no entró nada este mes'}</Text>
          ) : (
            <>
              <Dona data={porcionesIng} sel={selIng} onSel={setSelIng} moneda={vista} />
              <View style={{ marginTop: 12 }}>
                {porcionesIng.map((p) => {
                  const activo = selIng === p.label;
                  const pend = conPendIng ? pendIngPorCat[p.label]?.valor ?? 0 : 0;
                  return (
                    <Pressable key={p.label} onPress={() => { tap(); setSelIng(activo ? null : p.label); }} style={{ paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, backgroundColor: activo ? c.card2 : 'transparent', opacity: selIng && !activo ? 0.5 : 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <View style={{ width: 28, height: 28, borderRadius: 8, marginRight: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: suave(p.color) }}><Icono nombre={catInfo(p.label).icono ?? 'tag'} color={p.color} size={16} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: c.text }}>{p.label}</Text>
                          {pend > 0 && modoIng === 'todo' && <Text style={{ color: c.aviso, fontSize: 12 }}>incluye {$(pend)} por cobrar</Text>}
                        </View>
                        <Text style={{ color: c.muted, marginRight: 8 }}>{pct(p.valor, ingresosDona)}%</Text>
                        <Text style={{ color: c.ingreso, fontWeight: '700' }}>{$(p.valor)}</Text>
                      </View>
                      <Barra valor={pct(p.valor, porcionesIng[0].valor)} color={p.color} alto={6} />
                    </Pressable>
                  );
                })}
              </View>
              {selIng && (
                <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 4 }}>
                  {modoIng !== 'plan' && movimientos.filter((m) => m.tipo === 'Ingreso' && (m.categoria || 'Sin categoría') === selIng).sort((a, b) => conv(b.valor, b.moneda) - conv(a.valor, a.moneda)).map((m) => <Fila key={m.id} m={m} />)}
                  {conPendIng && (pendIngPorCat[selIng]?.items ?? []).map((i) => (
                    <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 }}>
                      <View style={{ width: 28 }}><Icono nombre="reloj" color={c.aviso} size={18} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.titulo} numberOfLines={1}>{i.concepto}</Text>
                        <Text style={s.sub}>Por cobrar · {fechaCorta(i.fecha)}</Text>
                      </View>
                      <Text style={{ color: c.aviso, fontWeight: '700' }}>{money(i.valor, i.moneda)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </Card>
        )}
        </Bloque>


        {/* Cuotas */}
        {cuotas.planes.length > 0 && (
        <Bloque id="cuotas" nombre="Cuotas">
          <Link href="/cuotas" asChild>
            <Pressable onPress={() => tap()} style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><Titulo t="Cuotas" sub="Tocá para ver el detalle" /></View>
                <Text style={{ color: c.accent, fontWeight: '700' }}>Ver ›</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Mini emoji="📆" titulo="Este mes" valor={cuotasMes} color={c.text} moneda={vista} />
                <Mini emoji="⏳" titulo="Te falta pagar" valor={cuotasDeuda} color={c.gasto} moneda={vista} />
              </View>
              {cuotas.porCargar.length > 0 && <Text style={{ color: c.aviso, marginTop: 8 }}>{cuotas.porCargar.length} cuota(s) de este mes todavía sin cargar</Text>}
              {cuotas.terminan.length > 0 && <Text style={{ color: c.ingreso, marginTop: 8 }}>Este mes terminás: {cuotas.terminan.map((p) => p.ultima.concepto).join(', ')}</Text>}
            </Pressable>
          </Link>
        </Bloque>
        )}

        {/* Posibles transferencias entre cuentas propias */}
        {(depositos.length > 0 || sugeridas.length > 0) && (
        <Bloque id="transferencias" nombre="Transferencias sugeridas">
        {depositos.length > 0 && (
          <Link href="/cuentas" asChild>
            <Pressable onPress={() => tap()} style={s.tip}>
              <View style={{ marginRight: 10 }}><Icono nombre="carpeta" color={c.reserva} size={20} /></View>
              <Text style={{ color: c.text, flex: 1 }}>{depositos.length === 1 ? 'Un gasto de “Reserva” parece plata que pasaste a una reserva' : `${depositos.length} gastos de “Reserva” parecen plata que pasaste a una reserva`}. Tocá para pasarlos a transferencia: no son gastos.</Text>
            </Pressable>
          </Link>
        )}
        {sugeridas.length > 0 && (
          <Link href="/cuentas" asChild>
            <Pressable onPress={() => tap()} style={s.tip}>
              <View style={{ marginRight: 10 }}><Icono nombre="transferir" color={c.transferencia} size={20} /></View>
              <Text style={{ color: c.text, flex: 1 }}>{sugeridas.length === 1 ? 'Un movimiento parece una transferencia entre tus cuentas' : `${sugeridas.length} movimientos parecen transferencias entre tus cuentas`}. Tocá para revisar: así no inflan tus gastos e ingresos.</Text>
            </Pressable>
          </Link>
        )}
        </Bloque>
        )}

        {/* Deudas */}
        {resumenDeudas.length > 0 && (
        <Bloque id="deudas" nombre="Deudas">
          <Link href="/deudas" asChild>
            <Pressable onPress={() => tap()} style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><Titulo t="Deudas" sub="Lo que debés y lo que te deben" /></View>
                <Text style={{ color: c.accent, fontWeight: '700' }}>Ver ›</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Mini emoji="📤" titulo="Yo debo" valor={resumenDeudas.filter((r) => r.deuda.direccion === 'debo').reduce((a, r) => a + conv(r.pendiente, r.deuda.moneda), 0)} color={c.gasto} moneda={vista} />
                <Mini emoji="📥" titulo="Me deben" valor={resumenDeudas.filter((r) => r.deuda.direccion === 'me_deben').reduce((a, r) => a + conv(r.pendiente, r.deuda.moneda), 0)} color={c.ingreso} moneda={vista} />
              </View>
              {resumenDeudas.filter((r) => r.deuda.vencimiento && r.deuda.vencimiento < hoyYmd()).length > 0 && (
                <Text style={{ color: c.aviso, marginTop: 8 }}>{resumenDeudas.filter((r) => r.deuda.vencimiento && r.deuda.vencimiento < hoyYmd()).length} deuda(s) vencida(s)</Text>
              )}
            </Pressable>
          </Link>
        </Bloque>
        )}

        {agenda.length > 0 && (
        <Bloque id="planificados" nombre="Planificados">
          <Link href="/planificados" asChild>
            <Pressable onPress={() => tap()} style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><Titulo t="Planificados" sub={`${cumplidosMes} de ${agenda.length} ya ${agenda.length === 1 ? 'se cumplió' : 'se cumplieron'} este mes · incluye suscripciones`} /></View>
                <Text style={{ color: c.accent, fontWeight: '700' }}>Ver ›</Text>
              </View>
              {proximos.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  <View style={{ width: 24 }}><Icono nombre={p.estado === 'cumplido' ? 'check' : p.fecha < hoyYmd() ? 'alerta' : 'reloj'} color={p.estado === 'cumplido' ? c.ingreso : p.fecha < hoyYmd() ? c.gasto : c.muted} size={16} /></View>
                  <Text style={{ color: p.estado === 'cumplido' ? c.muted : c.text, flex: 1 }} numberOfLines={1}>
                    {p.concepto} <Text style={{ color: c.muted, fontSize: 12 }}>· {p.estado === 'cumplido' ? (p.valor > 0 ? 'cobrado' : 'pagado') : p.fecha < hoyYmd() ? `venció ${fechaCorta(p.fecha)}` : fechaCorta(p.fecha)}</Text>
                  </Text>
                  <Text style={{ color: p.estado === 'cumplido' ? c.muted : p.valor > 0 ? c.ingreso : c.text, fontWeight: '600' }}>{money(p.valor, p.moneda)}</Text>
                </View>
              ))}
              {agenda.length > proximos.length && <Text style={[s.sub, { marginTop: 8 }]}>y {agenda.length - proximos.length} más · tocá para ver todo</Text>}
            </Pressable>
          </Link>
        </Bloque>
        )}

        {/* Recurrentes */}
        <Bloque id="recurrentes" nombre="Recurrentes">
        <Link href="/recurrentes" asChild>
          <Pressable onPress={() => tap()} style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><Titulo t="Recurrentes" sub={recurrentes.length ? 'Se cargan solos: cada mes, quincena o semana' : 'Sueldo, suscripciones, alquiler: cargalos una vez y se repiten solos'} /></View>
              <Text style={{ color: c.accent, fontWeight: '700' }}>{recurrentes.length ? 'Ver ›' : 'Crear ›'}</Text>
            </View>
            {recurrentes.filter((r) => r.activo).sort((a, b) => a.dia - b.dia).slice(0, 4).map((r) => {
              const noMensual = (r.frecuencia ?? 'mensual') !== 'mensual';
              const cargado = noMensual ? !proxRec(r, hoyYmd(), r.ultimaFecha)?.startsWith(mesActual()) : tieneMovimiento(r, todosDelMes);
              return (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  <View style={{ width: 24 }}><Icono nombre={cargado ? 'check' : 'reloj'} color={cargado ? c.ingreso : c.muted} size={16} /></View>
                  <Text style={{ color: c.text, flex: 1 }} numberOfLines={1}>{r.concepto} <Text style={{ color: c.muted, fontSize: 12 }}>· {noMensual ? descRec(r).toLowerCase() : `día ${r.dia}`}</Text></Text>
                  <Text style={{ color: r.tipo === 'Ingreso' ? c.ingreso : c.muted, fontWeight: '600' }}>{money(r.valor, r.moneda)}</Text>
                </View>
              );
            })}
          </Pressable>
        </Link>
        </Bloque>

        {/* Presupuestos */}
        <Bloque id="presupuestos" nombre="Presupuestos">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Titulo t="Presupuestos" sub="Cuánto querés gastar como máximo por categoría" /></View>
            <Link href="/presupuestos" asChild>
              <Pressable onPress={() => tap()} hitSlop={10}><Text style={{ color: c.accent, fontWeight: '700' }}>Editar</Text></Pressable>
            </Link>
          </View>
          {presu.length === 0 && (
            <Link href="/presupuestos" asChild>
              <Pressable style={{ backgroundColor: c.card2, borderRadius: 12, padding: 14 }}>
                <Text style={{ color: c.text }}>Definí un tope mensual (ej. Comida $200.000) y la app te avisa cuando te estés por pasar. Tocá para crear uno.</Text>
              </Pressable>
            </Link>
          )}
          {presu.map(({ cat, tope, gastado }) => {
            const p = pct(gastado, tope);
            const color = p >= 100 ? c.gasto : p >= 80 ? c.aviso : c.ingreso;
            return (
              <View key={cat} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <View style={{ marginRight: 8 }}><Icono nombre={catInfo(cat).icono ?? 'tag'} color={catInfo(cat).color} size={18} /></View>
                  <Text style={{ color: c.text, flex: 1 }}>{cat}</Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{$(gastado)} / {$(tope)}</Text>
                </View>
                <Barra valor={p} color={color} />
                <Text style={{ color, fontSize: 12, marginTop: 4 }}>
                  {p >= 100 ? `Te pasaste por ${$(gastado - tope)}` : p >= 80 ? `Cuidado: te quedan ${$(tope - gastado)}` : `Te quedan ${$(tope - gastado)} (${100 - p}%)`}
                </Text>
              </View>
            );
          })}
        </Card>
        </Bloque>

        {/* Datos del mes */}
        {datos.length > 0 && (
        <Bloque id="datos" nombre="Datos del mes">
          <Card>
            <Titulo t="Tu mes en palabras" />
            {datos.map((d, i) => (
              <View key={i} style={{ flexDirection: 'row', marginTop: i ? 10 : 0 }}>
                <View style={{ marginRight: 10, marginTop: 2 }}><Icono nombre={iconoDe(d.e)} color={c.accent} size={16} /></View>
                <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>{d.t}</Text>
              </View>
            ))}
          </Card>
        </Bloque>
        )}

        {/* Efectivo vs digital */}
        {r.gastos > 0 && (
        <Bloque id="efvsdig" nombre="Efectivo vs digital">
          <Card>
            <Titulo t="Efectivo vs digital" />
            <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.border }}>
              <View style={{ width: `${pct(r.efectivo, r.gastos)}%`, backgroundColor: c.ingreso }} />
              <View style={{ width: `${pct(r.digital, r.gastos)}%`, backgroundColor: c.transferencia }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ color: c.muted }}>Efectivo {$(r.efectivo)}</Text>
              <Text style={{ color: c.muted }}>Digital {$(r.digital)}</Text>
            </View>
          </Card>
        </Bloque>
        )}

        <Bloque id="ultimos" nombre="Últimos del mes">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={s.h}>Últimos movimientos</Text>
          <Link href="/movimientos" asChild><Pressable onPress={() => tap()} hitSlop={8}><Text style={{ color: c.accent, fontWeight: '600' }}>Ver todos</Text></Pressable></Link>
        </View>
        <Card style={{ padding: 0, paddingVertical: 4 }}>
          {movimientos.length === 0 && <Text style={{ color: c.muted, padding: 16 }}>Todavía no hay movimientos. Tocá el + para cargar el primero.</Text>}
          {[...movimientos].sort(masReciente).slice(0, 5).map((m) => <Fila key={m.id} m={m} />)}
        </Card>
        </Bloque>
        </Tablero>
        <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', marginTop: 8, lineHeight: 17 }}>Presupuestos, cuotas, deudas y más tarjetas: tocá “Editar tarjetas” para sumarlas.</Text>
      </ScrollView>
      <Fab />
    </View>
  );
}
