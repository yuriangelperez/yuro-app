import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, confirmar } from '../src/alerta';
import { type Planificado, sugerirEmparejamientos } from '../src/planificados';
import { type ItemAgenda, useAgenda, useConversor, useFinanzas } from '../src/store';
import { c } from '../src/theme';
import type { Moneda } from '../src/types';
import { Card, centrado, Chip, MAX_FORM, MesSelector, s, SelectorMoneda, tap, Tip, Titulo } from '../src/ui';
import { etiquetaMes, fechaCorta, hoyYmd, mesActual, money, parseMonto, ymdMenos } from '../src/util';

const input = { backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16, marginBottom: 8 } as const;

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
  const [tipo, setTipo] = useState<'Ingreso' | 'Egreso'>(previa?.tipo ?? 'Ingreso');
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
        {(['Ingreso', 'Egreso'] as const).map((t) => (
          <Pressable key={t} onPress={() => { tap(); setTipo(t); }} style={{ flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', backgroundColor: tipo === t ? (t === 'Ingreso' ? c.ingreso : c.gasto) : c.card2 }}>
            <Text style={{ color: tipo === t ? '#fff' : c.muted, fontWeight: '700' }}>{t === 'Ingreso' ? '⬆️ Voy a cobrar' : '⬇️ Voy a pagar'}</Text>
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
      <TextInput style={input} placeholder="AAAA-MM-DD" placeholderTextColor={c.muted} value={fecha} onChangeText={setFecha} />
      {cuentas.length > 0 && (
        <>
          <Text style={s.sub}>Cuenta (opcional)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            {cuentas.map((x) => <Chip key={x.id} label={x.nombre} on={cuentaId === x.id} onPress={() => setCuentaId(cuentaId === x.id ? null : x.id)} />)}
          </View>
        </>
      )}
      <Pressable onPress={guardar} style={{ backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>Guardar</Text>
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
          <Text style={s.titulo} numberOfLines={1}>{p.concepto} <Text style={{ color: c.muted, fontSize: 12 }}>✏️</Text></Text>
          <Text style={[s.sub, atrasado && { color: c.aviso }]}>
            {p.estado === 'pendiente' ? `${atrasado ? '⚠️ Todavía no llegó · ' : ''}${cuando(p.fecha)} · ${fechaCorta(p.fecha)}` : `${p.estado === 'cumplido' ? '✅ Cumplido' : '✖️ Cancelado'} · ${fechaCorta(p.fecha)}`}
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
          }}><Text style={{ color: c.aviso }}>⏳ Aún no se cumplió</Text></Pressable>
          <Pressable onPress={() => { tap(); borrarPlanificado(p.id); }}><Text style={{ color: c.muted }}>Quitar marca</Text></Pressable>
        </View>
      )}
      {p.estado === 'cancelado' && (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <Pressable onPress={() => { tap(); guardarPlanificado({ ...p, estado: 'pendiente' }); }}><Text style={{ color: c.accent, fontWeight: '700' }}>↩️ Reactivar</Text></Pressable>
          <Pressable onPress={() => { tap(); borrarPlanificado(p.id); }}><Text style={{ color: c.gasto }}>🗑</Text></Pressable>
        </View>
      )}
      {p.estado === 'pendiente' && (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
          <Pressable onPress={() => { tap(true); cumplirPlanificado(p.id); }}><Text style={{ color: c.accent, fontWeight: '700' }}>✅ Ya ocurrió</Text></Pressable>
          <Pressable onPress={() => { tap(); guardarPlanificado({ ...p, estado: 'cancelado' }); }}><Text style={{ color: c.muted }}>Cancelar</Text></Pressable>
          <Pressable onPress={async () => { if (await confirmar('¿Borrar?', `"${p.concepto}" se elimina de lo planificado.`, 'Borrar')) borrarPlanificado(p.id); }}><Text style={{ color: c.gasto }}>🗑</Text></Pressable>
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
        <Text style={s.titulo} numberOfLines={1}>{i.concepto} <Text style={{ color: c.muted, fontSize: 12 }}>✏️</Text></Text>
        <Text style={[s.sub, atrasado && { color: c.aviso }]}>
          {i.estado === 'cumplido' ? `✅ ${i.valor > 0 ? 'Cobrado' : 'Pagado'}` : `${atrasado ? '⚠️ Todavía no llegó · ' : ''}${cuando(i.fecha)}`} · {fechaCorta(i.fecha)} · {i.origen === 'recurrente' ? '🔁 Recurrente' : 'Movimiento con fecha futura'}
        </Text>
      </View>
      <Text style={{ color: i.valor > 0 ? c.ingreso : c.gasto, fontWeight: '700' }}>{money(i.valor, i.moneda)}</Text>
    </Pressable>
  );
};

export default function Planificados() {
  const planificados = useFinanzas((st) => st.planificados);
  const mes = useFinanzas((st) => st.mes);
  const { conv, vista } = useConversor();
  const porAnio = useFinanzas((st) => st.porAnio);
  const descartadas = useFinanzas((st) => st.transferenciasDescartadas);
  const { cumplirPlanificadoCon, descartarTransferencia, guardar } = useFinanzas();
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<Planificado | null>(null);

  // Todo lo del mes elegido (igual que la tarjeta del inicio) + los planificados cancelados de ese mes
  const agenda = useAgenda();
  const cancelados = useMemo(() => planificados.filter((p) => p.estado === 'cancelado' && p.fecha.startsWith(mes)), [planificados, mes]);
  const pendientes = agenda.filter((i) => i.estado === 'pendiente');
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

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <MesSelector />
      <View style={{ padding: 16, paddingTop: 4, ...centrado(MAX_FORM) }}>
        <Tip id="planificados-ayuda" emoji="🗓️">
          Anotá lo que esperás cobrar o pagar. No cuenta en tus saldos ni estadísticas hasta que ocurre: cuando llega el movimiento real (por notificación, Mercado Pago, extracto o a mano) se marca solo como cumplido. Tocá uno para editarlo.
        </Tip>
        {formAbierto ? (
          <Formulario key={editando?.id ?? 'nuevo'} previa={editando ?? undefined} onListo={() => { setNuevo(false); setEditando(null); }} />
        ) : (
          <Pressable onPress={() => { tap(); setNuevo(true); }} style={{ backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>＋ Planificar un movimiento</Text>
          </Pressable>
        )}
        {parecidos.length > 0 && !formAbierto && (
          <Card>
            <Titulo t={`🔗 ¿Llegó lo que esperabas? (${parecidos.length})`} sub="Llegó un movimiento parecido a algo planificado, pero no tan seguro como para marcarlo solo. Confirmalo y, si querés, cambiale el nombre." />
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
        <Card>
          <Titulo t={`Pendientes de ${etiquetaMes(mes)}`} sub={pendientes.length ? `Por cobrar ${money(entra, vista)} · Por pagar ${money(-sale, vista)}` : 'No tenés nada pendiente este mes'} />
          {pendientes.map((i) => (i.plan ? <Item key={i.id} p={i.plan} onEditar={() => { setNuevo(false); setEditando(i.plan!); }} /> : <ItemOtro key={i.id} i={i} />))}
        </Card>
        {cerrados.length + cancelados.length > 0 && (
          <Card>
            <Titulo t="Cumplidos y cancelados" sub={etiquetaMes(mes)} />
            {cerrados.map((i) => (i.plan ? <Item key={i.id} p={i.plan} onEditar={() => { setNuevo(false); setEditando(i.plan!); }} /> : <ItemOtro key={i.id} i={i} />))}
            {cancelados.map((p) => <Item key={p.id} p={p} onEditar={() => { setNuevo(false); setEditando(p); }} />)}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
