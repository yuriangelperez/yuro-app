import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, confirmar } from '../src/alerta';
import { type Planificado, sugerirEmparejamientos } from '../src/planificados';
import { calcularQuedaria } from '../src/proyeccion';
import { type ItemAgenda, saldosAl, saldosPorCuenta, useAgenda, useConversor, useFinanzas, useMovimientosMes, useReservas } from '../src/store';
import { c, catInfo, radio, suave } from '../src/theme';
import type { Moneda } from '../src/types';
import { BarraAccion, Boton, Card, centrado, Chip, MAX_FORM, MesSelector, PantallaTeclado, s, Segmentado, SelectorFecha, SelectorMoneda, tap, Tip, Titulo, Vacio } from '../src/ui';
import { etiquetaMes, fechaCorta, hoyYmd, mesActual, money, parseMonto, ymdMenos } from '../src/util';
import { Icono } from '../src/iconos';

const input = { backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16, marginBottom: 8 } as const;

type VistaGastos = 'hoy' | 'plan' | 'todo';
const VISTAS: { valor: VistaGastos; label: string }[] = [{ valor: 'hoy', label: 'Hasta hoy' }, { valor: 'plan', label: 'Planificado' }, { valor: 'todo', label: 'Todo junto' }];

const diasHasta = (fecha: string) => Math.round((Date.parse(fecha) - Date.parse(hoyYmd())) / 86400000);
const cuando = (fecha: string) => {
  const d = diasHasta(fecha);
  return d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : d > 1 ? `En ${d} días` : d === -1 ? 'Ayer' : `Hace ${-d} días`;
};

// Alta de un movimiento esperado (sueldo, cobro, vencimiento…)
const Formulario = ({ previa, onListo }: { previa?: Planificado; onListo: () => void }) => {
  const guardarPlanificado = useFinanzas((st) => st.guardarPlanificado);
  const mesElegido = useFinanzas((st) => st.mes);
  const todasCuentas = useFinanzas((st) => st.cuentas);
  const cuentas = useMemo(() => todasCuentas.filter((x) => x.activa), [todasCuentas]);
  const [tipo, setTipo] = useState<'Ingreso' | 'Egreso' | 'Ahorro'>(previa?.tipo ?? 'Ingreso');
  const [concepto, setConcepto] = useState(previa?.concepto ?? '');
  const [monto, setMonto] = useState(previa ? String(Math.abs(previa.valor)).replace('.', ',') : '');
  const [moneda, setMoneda] = useState<Moneda>(previa?.moneda ?? 'ARS');
  const [fecha, setFecha] = useState(previa?.fecha ?? (mesElegido === mesActual() ? hoyYmd() : `${mesElegido}-01`)); // al planificar en otro mes, arranca en ese mes
  const [cuentaId, setCuentaId] = useState<string | null>(previa?.cuentaId ?? null);

  const guardar = async () => {
    const n = parseMonto(monto);
    if (!concepto.trim()) return avisar('Ingresá un concepto');
    if (!n || n <= 0) return avisar('Ingresá un monto válido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return avisar('Fecha con formato AAAA-MM-DD');
    tap(true);
    const cuenta = cuentas.find((x) => x.id === cuentaId);
    await guardarPlanificado({
      ...(previa ? { id: previa.id, estado: previa.estado, movimientoId: previa.movimientoId } : {}),
      fecha, concepto: concepto.trim(), valor: (tipo === 'Ingreso' ? 1 : -1) * Math.round(n * 100) / 100, moneda, tipo,
      metodo: cuenta?.nombre ?? previa?.metodo ?? '', cuentaId: cuenta?.id ?? null, categoria: previa?.categoria ?? '', categoria2: previa?.categoria2 ?? '',
    });
    onListo();
  };

  return (
    <Card>
      <Titulo t={previa ? 'Editar planificado' : 'Nuevo movimiento esperado'} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {(['Ingreso', 'Egreso', 'Ahorro'] as const).map((t) => (
          <Pressable key={t} onPress={() => { tap(); setTipo(t); }} style={{ flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', backgroundColor: tipo === t ? (t === 'Ingreso' ? c.ingreso : t === 'Egreso' ? c.gasto : c.ahorro) : c.card2 }}>
            <Text style={{ color: tipo === t ? c.sobre : c.muted, fontWeight: '700' }}>{t === 'Ingreso' ? 'Voy a cobrar' : t === 'Egreso' ? 'Voy a pagar' : 'Voy a ahorrar'}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={input} placeholder="Concepto (ej. Sueldo)" placeholderTextColor={c.muted} value={concepto} onChangeText={setConcepto} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput style={{ ...input, flex: 1 }} placeholder="Monto" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} />
        <SelectorMoneda valor={moneda} onChange={setMoneda} chico />
      </View>
      <Text style={s.sub}>¿Cuándo?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        {[1, 7, 15, 30].map((d) => {
          const f = ymdMenos(-d);
          return <Chip key={d} label={d === 1 ? 'Mañana' : `En ${d} días`} on={fecha === f} onPress={() => setFecha(f)} />;
        })}
      </View>
      <SelectorFecha valor={fecha} onChange={setFecha} etiqueta="Fecha" />
      {cuentas.length > 0 && (
        <>
          <Text style={s.sub}>Cuenta (opcional)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            {cuentas.map((x) => <Chip key={x.id} label={x.nombre} on={cuentaId === x.id} onPress={() => setCuentaId(cuentaId === x.id ? null : x.id)} />)}
          </View>
        </>
      )}
      <Pressable onPress={guardar} style={{ backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center' }}>
        <Text style={{ color: c.sobre, fontWeight: '800' }}>Guardar</Text>
      </Pressable>
      <Pressable onPress={onListo} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: c.muted }}>Cancelar</Text></Pressable>
    </Card>
  );
};

const Item = ({ p, onEditar }: { p: Planificado; onEditar: () => void }) => {
  const { cumplirPlanificado, borrarPlanificado, guardarPlanificado, deshacerCumplido } = useFinanzas();
  const mov = useFinanzas((st) => (p.movimientoId ? Object.values(st.porAnio).flat().find((m) => m.id === p.movimientoId) : undefined));
  const atrasado = p.estado === 'pendiente' && diasHasta(p.fecha) < 0;
  return (
    <View style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
      <Pressable onPress={() => { tap(); onEditar(); }} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo} numberOfLines={1}>{p.concepto}</Text>
          <Text style={[s.sub, atrasado && { color: c.aviso }]}>
            {p.estado === 'pendiente' ? `${atrasado ? 'Todavía no llegó · ' : ''}${cuando(p.fecha)} · ${fechaCorta(p.fecha)}` : `${p.estado === 'cumplido' ? 'Cumplido' : 'Cancelado'} · ${fechaCorta(p.fecha)}`}
            {p.metodo ? ` · ${p.metodo}` : ''}
          </Text>
        </View>
        <Text style={{ color: p.valor > 0 ? c.ingreso : c.gasto, fontWeight: '700' }}>{money(p.valor, p.moneda)}</Text>
      </Pressable>
      {p.estado === 'cumplido' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
          {mov && <Pressable onPress={() => { tap(); router.push({ pathname: '/nuevo', params: { id: mov.id, fecha: mov.fecha } }); }}><Text style={{ color: c.accent, fontWeight: '700' }}>Ver movimiento ›</Text></Pressable>}
          <Pressable onPress={async () => {
            const aviso = mov ? `Se borra el movimiento "${mov.concepto}" y "${p.concepto}" vuelve a quedar pendiente.` : `"${p.concepto}" vuelve a quedar pendiente.`;
            if (await confirmar('¿Todavía no se cumplió?', aviso, 'Volver a pendiente')) deshacerCumplido(p.id);
          }}><Text style={{ color: c.aviso }}>Aún no se cumplió</Text></Pressable>
          <Pressable onPress={() => { tap(); borrarPlanificado(p.id); }}><Text style={{ color: c.muted }}>Quitar marca</Text></Pressable>
        </View>
      )}
      {p.estado === 'cancelado' && (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <Pressable onPress={() => { tap(); guardarPlanificado({ ...p, estado: 'pendiente' }); }}><Text style={{ color: c.accent, fontWeight: '700' }}>Reactivar</Text></Pressable>
          <Pressable onPress={() => { tap(); borrarPlanificado(p.id); }}><View style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icono nombre="basura" color={c.gasto} size={18} /></View></Pressable>
        </View>
      )}
      {p.estado === 'pendiente' && (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <Pressable onPress={() => { tap(true); cumplirPlanificado(p.id); }}><Text style={{ color: c.accent, fontWeight: '700' }}>Ya ocurrió</Text></Pressable>
          <Pressable onPress={() => { tap(); guardarPlanificado({ ...p, estado: 'cancelado' }); }}><Text style={{ color: c.muted }}>Cancelar</Text></Pressable>
          <Pressable onPress={async () => { if (await confirmar('¿Borrar?', `"${p.concepto}" se elimina de lo planificado.`, 'Borrar')) borrarPlanificado(p.id); }}><View style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icono nombre="basura" color={c.gasto} size={18} /></View></Pressable>
        </View>
      )}
    </View>
  );
};

// Lo que no es un planificado cargado acá: una suscripción o un movimiento con fecha futura. Se edita en su propia pantalla.
const ItemOtro = ({ i }: { i: ItemAgenda }) => {
  const atrasado = i.estado === 'pendiente' && diasHasta(i.fecha) < 0;
  const abrir = () => {
    tap();
    if (i.origen === 'recurrente') router.push({ pathname: '/recurrente', params: { id: i.recurrenteId } });
    else if (i.movimiento) router.push({ pathname: '/nuevo', params: { id: i.movimiento.id, fecha: i.movimiento.fecha } });
  };
  return (
    <Pressable onPress={abrir} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <Text style={s.titulo} numberOfLines={1}>{i.concepto}</Text>
        <Text style={[s.sub, atrasado && { color: c.aviso }]}>
          {i.estado === 'cumplido' ? `${i.valor > 0 ? 'Cobrado' : 'Pagado'}` : `${atrasado ? 'Todavía no llegó · ' : ''}${cuando(i.fecha)}`} · {fechaCorta(i.fecha)} · {i.origen === 'recurrente' ? 'Recurrente' : i.movimiento?.tipo === 'Ahorro' ? 'Ahorro programado' : 'Movimiento con fecha futura'}
        </Text>
      </View>
      <Text style={{ color: i.valor > 0 ? c.ingreso : c.gasto, fontWeight: '700' }}>{money(i.valor, i.moneda)}</Text>
    </Pressable>
  );
};

export default function Planificados() {
  const planificados = useFinanzas((st) => st.planificados);
  const mes = useFinanzas((st) => st.mes);
  const { conv, vista, puede, cot } = useConversor();
  const porAnio = useFinanzas((st) => st.porAnio);
  const descartadas = useFinanzas((st) => st.transferenciasDescartadas);
  const { cumplirPlanificadoCon, descartarTransferencia, guardar } = useFinanzas();
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<Planificado | null>(null);

  // Todo lo del mes elegido (igual que la tarjeta del inicio) + los planificados cancelados de ese mes
  const agenda = useAgenda();
  const cancelados = useMemo(() => planificados.filter((p) => p.estado === 'cancelado' && p.fecha.startsWith(mes)), [planificados, mes]);
  const recurrentes = useFinanzas((st) => st.recurrentes);
  const esAhorro = (i: ItemAgenda) => (i.movimiento?.tipo ?? (i.recurrenteId ? recurrentes.find((r) => r.id === i.recurrenteId)?.tipo : undefined)) === 'Ahorro';
  const todosPend = agenda.filter((i) => i.estado === 'pendiente');
  const ahorros = todosPend.filter(esAhorro); // el ahorro se muestra aparte: no es un pago
  const pendientes = todosPend.filter((i) => !esAhorro(i));
  const porAhorrar = -ahorros.reduce((a, i) => a + conv(i.valor, i.moneda), 0);
  const cerrados = agenda.filter((i) => i.estado === 'cumplido');
  const entra = pendientes.filter((p) => p.valor > 0).reduce((a, p) => a + conv(p.valor, p.moneda), 0);
  const sale = pendientes.filter((p) => p.valor < 0).reduce((a, p) => a + conv(p.valor, p.moneda), 0);
  const formAbierto = nuevo || editando;

  // Movimientos que llegaron y podrían ser lo que esperabas, pero no coinciden lo bastante como para marcarlo solos
  const parecidos = useMemo(() => {
    const ocupados = new Set(planificados.map((p) => p.movimientoId).filter(Boolean));
    const libres = Object.values(porAnio).flat().filter((m) => !ocupados.has(m.id) && m.fecha >= ymdMenos(45) && m.fecha <= hoyYmd());
    return sugerirEmparejamientos(planificados.filter((p) => p.estado === 'pendiente'), libres).filter((x) => !descartadas.includes(`emp|${x.plan.id}|${x.mov.id}`));
  }, [planificados, porAnio, descartadas]);
  const [nombres, setNombres] = useState<Record<string, string>>({});

  // Gastos del mes: lo ya gastado contra lo planificado que falta, por categoría
  const [vistaGastos, setVistaGastos] = useState<VistaGastos>('todo');
  const { movimientos: delMes } = useMovimientosMes();
  const cats = useMemo(() => {
    const m: Record<string, { hecho: number; plan: number }> = {};
    const de = (cat: string) => (m[cat || 'Sin categoría'] ??= { hecho: 0, plan: 0 });
    for (const x of delMes) if (x.tipo === 'Egreso' && x.fecha <= hoyYmd() && puede(x.moneda)) de(x.categoria).hecho -= conv(x.valor, x.moneda);
    for (const i of pendientes) {
      const rec = i.recurrenteId ? recurrentes.find((r) => r.id === i.recurrenteId) : undefined;
      const tipo = i.plan?.tipo ?? i.movimiento?.tipo ?? rec?.tipo;
      if (tipo !== 'Egreso' || i.valor >= 0 || !puede(i.moneda)) continue;
      de(i.plan?.categoria || i.movimiento?.categoria || rec?.categoria || '').plan -= conv(i.valor, i.moneda);
    }
    return Object.entries(m).map(([nombre, v]) => ({ nombre, ...v, total: v.hecho + v.plan })).sort((a, b) => b.total - a.total);
  }, [delMes, pendientes, recurrentes, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps
  const gastado = cats.reduce((a, x) => a + x.hecho, 0);
  const planGasto = cats.reduce((a, x) => a + x.plan, 0);
  const valorCat = (x: { hecho: number; plan: number; total: number }) => (vistaGastos === 'hoy' ? x.hecho : vistaGastos === 'plan' ? x.plan : x.total);
  const catsVista = cats.filter((x) => valorCat(x) > 0).sort((a, b) => valorCat(b) - valorCat(a));
  const maxCat = Math.max(1, ...catsVista.map(valorCat));
  // "Te quedaría": la misma cuenta que en Inicio (lo que hay hoy + lo que falta cobrar − lo que falta pagar)
  const cuentas = useFinanzas((st) => st.cuentas);
  const saldosIniciales = useFinanzas((st) => st.saldosIniciales);
  const ahorrosIniciales = useFinanzas((st) => st.ahorrosIniciales);
  const estadosReservas = useReservas();
  const quedaria = useMemo(() => {
    const reservado: Partial<Record<Moneda, number>> = {};
    for (const e of estadosReservas) reservado[e.reserva.moneda] = (reservado[e.reserva.moneda] ?? 0) + Math.max(0, e.queda);
    const saldos = saldosAl(porAnio, saldosIniciales, ahorrosIniciales, mes);
    return calcularQuedaria({ cuentas, saldos: saldosPorCuenta(porAnio, cuentas), pendientes: todosPend, recurrentes, conv, puede, ahorrado: Object.fromEntries(saldos.map((x) => [x.moneda, x.ahorrado])), reservado });
  }, [cuentas, porAnio, todosPend, recurrentes, saldosIniciales, ahorrosIniciales, estadosReservas, mes, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps
  const esMesActual = mes === mesActual();
  const $ = (n: number) => money(n, vista);

  return (
    <PantallaTeclado>
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <MesSelector />
      <View style={{ padding: 16, paddingTop: 4, ...centrado(MAX_FORM) }}>
        <Tip id="planificados-ayuda" emoji="🗓️">
          Anotá lo que esperás cobrar o pagar. No cuenta en tus saldos ni estadísticas hasta que ocurre: cuando llega el movimiento real (por notificación, Mercado Pago, extracto o a mano) se marca solo como cumplido. Tocá uno para editarlo.
        </Tip>
        {formAbierto ? (
          <Formulario key={editando?.id ?? 'nuevo'} previa={editando ?? undefined} onListo={() => { setNuevo(false); setEditando(null); }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1, backgroundColor: suave(c.ingreso), borderRadius: radio.l, padding: 14 }}>
                <Text style={{ color: c.muted, fontSize: 13 }}>Por cobrar</Text>
                <Text style={{ color: c.ingreso, fontSize: 20, fontWeight: '700', marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{$(entra)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: suave(c.gasto), borderRadius: radio.l, padding: 14 }}>
                <Text style={{ color: c.muted, fontSize: 13 }}>Por pagar</Text>
                <Text style={{ color: c.gasto, fontSize: 20, fontWeight: '700', marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{$(-sale)}</Text>
              </View>
            </View>
            {(gastado > 0 || planGasto > 0) && (
              <Card>
                <Titulo t={`Gastos de ${etiquetaMes(mes)}`} sub="Lo que ya gastaste y lo que tenés planificado, por categoría" />
                <Segmentado opciones={VISTAS} valor={vistaGastos} onChange={setVistaGastos} color={c.gasto} />
                <Text style={{ color: c.muted, fontSize: 13, marginTop: 12 }}>{vistaGastos === 'hoy' ? 'Gastado hasta hoy' : vistaGastos === 'plan' ? 'Falta pagar (planificado)' : 'Total del mes si se cumple todo'}</Text>
                <Text style={{ color: c.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>{$(vistaGastos === 'hoy' ? gastado : vistaGastos === 'plan' ? planGasto : gastado + planGasto)}</Text>
                <View style={{ marginTop: 12, gap: 12 }}>
                  {catsVista.length === 0 && <Text style={{ color: c.muted }}>{vistaGastos === 'plan' ? 'No tenés gastos planificados pendientes.' : 'Todavía no hay gastos este mes.'}</Text>}
                  {catsVista.map((x) => {
                    const i = catInfo(x.nombre);
                    const hecho = vistaGastos === 'plan' ? 0 : x.hecho;
                    const plan = vistaGastos === 'hoy' ? 0 : x.plan;
                    return (
                      <View key={x.nombre}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <Icono nombre={i.icono ?? 'tag'} color={i.color} size={18} />
                          <Text style={{ color: c.text, flex: 1 }} numberOfLines={1}>{x.nombre}</Text>
                          <Text style={{ color: c.text, fontWeight: '700' }}>{$(valorCat(x))}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c.border }}>
                          <View style={{ width: `${(hecho / maxCat) * 100}%`, backgroundColor: i.color }} />
                          <View style={{ width: `${(plan / maxCat) * 100}%`, backgroundColor: i.color, opacity: 0.4 }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
                {vistaGastos === 'todo' && catsVista.length > 0 && (
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.text }} /><Text style={{ color: c.muted, fontSize: 12 }}>Ya gastado</Text></View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.text, opacity: 0.4 }} /><Text style={{ color: c.muted, fontSize: 12 }}>Planificado</Text></View>
                  </View>
                )}
                {esMesActual && (
                  <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border, gap: 6 }}>
                    {([['Tenés hoy para gastar', $(quedaria.libreHoy), c.text], ['+ Falta cobrar', $(quedaria.porCobrar), c.ingreso], ['− Falta pagar', $(quedaria.porPagar), c.gasto]] as const).map(([t, v, col]) => (
                      <View key={t} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: c.muted }}>{t}</Text>
                        <Text style={{ color: col, fontWeight: '600' }}>{v}</Text>
                      </View>
                    ))}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, backgroundColor: suave(quedaria.queda < 0 ? c.gasto : c.ingreso), borderRadius: radio.m, paddingVertical: 10, paddingHorizontal: 12 }}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>Te quedaría</Text>
                      <Text style={{ color: quedaria.queda < 0 ? c.gasto : c.ingreso, fontWeight: '800', fontSize: 18 }}>{$(quedaria.queda)}</Text>
                    </View>
                  </View>
                )}
              </Card>
            )}
          </>
        )}
        {parecidos.length > 0 && !formAbierto && (
          <Card>
            <Titulo t={`¿Llegó lo que esperabas? (${parecidos.length})`} sub="Llegó un movimiento parecido a algo planificado, pero no tan seguro como para marcarlo solo. Confirmalo y, si querés, cambiale el nombre." />
            {parecidos.map(({ plan, mov }) => {
              const k = `${plan.id}|${mov.id}`;
              return (
                <View key={k} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
                  <Text style={s.sub}>Esperabas: {plan.concepto} · {money(plan.valor, plan.moneda)} · {fechaCorta(plan.fecha)}</Text>
                  <Text style={s.titulo} numberOfLines={1}>Llegó: {mov.concepto} · {money(mov.valor, mov.moneda)} · {fechaCorta(mov.fecha)}</Text>
                  <TextInput
                    style={{ backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 15, marginTop: 8 }}
                    placeholder="Nombre" placeholderTextColor={c.muted} value={nombres[k] ?? plan.concepto} onChangeText={(x) => setNombres((n) => ({ ...n, [k]: x }))}
                  />
                  <View style={{ flexDirection: 'row', gap: 18, marginTop: 8 }}>
                    <Pressable onPress={async () => {
                      tap(true);
                      if (!(await cumplirPlanificadoCon(plan.id, mov.id))) return avisar('Ese movimiento todavía no se subió a la nube: probá de nuevo en unos segundos.');
                      const nombre = (nombres[k] ?? plan.concepto).trim();
                      if (nombre !== mov.concepto || (!mov.categoria && plan.categoria)) await guardar({ ...mov, concepto: nombre || mov.concepto, categoria: mov.categoria || plan.categoria, categoria2: mov.categoria2 || plan.categoria2 });
                    }}><Text style={{ color: c.accent, fontWeight: '700' }}>Sí, es este</Text></Pressable>
                    <Pressable onPress={() => { tap(); descartarTransferencia(`emp|${plan.id}|${mov.id}`); }}><Text style={{ color: c.muted }}>No</Text></Pressable>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
        {ahorros.length > 0 && (
          <Card>
            <Titulo t={`Ahorros programados de ${etiquetaMes(mes)}`} sub={`Por ahorrar ${money(porAhorrar, vista)}. No es un gasto: se suma a lo que tenés ahorrado cuando llega la fecha.`} />
            {ahorros.map((i) => <ItemOtro key={i.id} i={i} />)}
          </Card>
        )}
        {pendientes.length === 0 && !formAbierto && (
          <Vacio icono="calendario" color={c.transferencia} titulo="Nada pendiente este mes" texto={ahorros.length ? 'Solo tenés ahorros programados.' : 'Anotá un cobro o un pago que esperás y te aviso cuánto te quedaría.'} />
        )}
        {pendientes.length > 0 && <Card>
          <Titulo t={`Pendientes de ${etiquetaMes(mes)}`} sub={`${pendientes.length} ${pendientes.length === 1 ? 'movimiento' : 'movimientos'} por cumplirse`} />
          {pendientes.map((i) => (i.plan ? <Item key={i.id} p={i.plan} onEditar={() => { setNuevo(false); setEditando(i.plan!); }} /> : <ItemOtro key={i.id} i={i} />))}
        </Card>}
        {cerrados.length + cancelados.length > 0 && (
          <Card>
            <Titulo t="Cumplidos y cancelados" sub={etiquetaMes(mes)} />
            {cerrados.map((i) => (i.plan ? <Item key={i.id} p={i.plan} onEditar={() => { setNuevo(false); setEditando(i.plan!); }} /> : <ItemOtro key={i.id} i={i} />))}
            {cancelados.map((p) => <Item key={p.id} p={p} onEditar={() => { setNuevo(false); setEditando(p); }} />)}
          </Card>
        )}
      </View>
    </ScrollView>
    {!formAbierto && (
      <BarraAccion>
        <Boton titulo="Planificar un movimiento" icono="mas" onPress={() => setNuevo(true)} />
      </BarraAccion>
    )}
    </PantallaTeclado>
  );
}
