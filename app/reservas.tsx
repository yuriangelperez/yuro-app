import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, confirmar } from '../src/alerta';
import type { EstadoReserva, Reserva } from '../src/reservas';
import { saldosPorCuenta, useCategorias, useConversor, useFinanzas, useReservas } from '../src/store';
import { c, catInfo, radio, suave } from '../src/theme';
import type { Moneda } from '../src/types';
import { Barra, BarraAccion, Boton, Card, Vacio, centrado, Chip, Fila, MAX_FORM, PantallaTeclado, s, SelectorFecha, SelectorMoneda, tap, Tip, Titulo } from '../src/ui';
import { fechaCorta, hoyYmd, money, parseMonto } from '../src/util';
import { Icono, iconoCuenta } from '../src/iconos';

const input = { backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16, marginBottom: 8 } as const;
const VERDE = c.reserva;

const Formulario = ({ previa, onListo }: { previa?: Reserva; onListo: () => void }) => {
  const guardarReserva = useFinanzas((st) => st.guardarReserva);
  const todas = useFinanzas((st) => st.cuentas);
  const cuentas = useMemo(() => todas.filter((x) => x.activa || x.id === previa?.cuentaId), [todas, previa]);
  const categorias = useCategorias('cat');
  const [nombre, setNombre] = useState(previa?.nombre ?? '');
  const [monto, setMonto] = useState(previa ? String(previa.monto).replace('.', ',') : '');
  const [moneda, setMoneda] = useState<Moneda>(previa?.moneda ?? 'ARS');
  const [cuentaId, setCuentaId] = useState<string | null>(previa?.cuentaId ?? null);
  const [categoria, setCategoria] = useState(previa?.categoria ?? '');
  const [patron, setPatron] = useState(previa?.patron ?? '');
  const [mensual, setMensual] = useState(previa?.mensual ?? false);
  const [desde, setDesde] = useState(previa?.desde ?? `${hoyYmd().slice(0, 7)}-01`); // por defecto, desde el 1 del mes

  const guardar = async () => {
    const n = parseMonto(monto);
    if (!nombre.trim()) return avisar('Poné un nombre (ej. Transportes)');
    if (n === null || n < 0) return avisar('Ingresá el monto que apartás');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return avisar('La fecha de inicio va como AAAA-MM-DD');
    tap(true);
    await guardarReserva({ id: previa?.id, nombre: nombre.trim(), monto: Math.round(n * 100) / 100, moneda, cuentaId, categoria, patron: patron.trim(), mensual, desde });
    onListo();
  };

  return (
    <Card>
      <Titulo t={previa ? 'Editar reserva' : 'Nueva reserva'} />
      <TextInput style={input} placeholder="Nombre (ej. Transportes)" placeholderTextColor={c.muted} value={nombre} onChangeText={setNombre} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput style={{ ...input, flex: 1 }} placeholder="Cuánto apartás" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} />
        <SelectorMoneda valor={moneda} onChange={setMoneda} chico />
      </View>
      {cuentas.length > 0 && (
        <>
          <Text style={s.sub}>¿En qué cuenta está esa plata?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            {cuentas.map((x) => <Chip key={x.id} label={x.nombre} icono={iconoCuenta(x)} on={cuentaId === x.id} onPress={() => setCuentaId(cuentaId === x.id ? null : x.id)} />)}
          </View>
        </>
      )}
      <Text style={[s.sub, { marginTop: 4 }]}>¿Qué gastos la descuentan? (podés usar uno o los dos)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        {categorias.map((x) => <Chip key={x} label={x} icono={catInfo(x).icono} on={categoria === x} onPress={() => setCategoria(categoria === x ? '' : x)} />)}
      </View>
      <TextInput style={input} placeholder='Palabra en el concepto (ej. "sube")' placeholderTextColor={c.muted} autoCapitalize="none" value={patron} onChangeText={setPatron} />
      <Text style={s.sub}>Contar los gastos desde (los anteriores no descuentan)</Text>
      <SelectorFecha valor={desde} onChange={setDesde} etiqueta="Desde" />
      <Pressable onPress={() => { tap(); setMensual(!mensual); }} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, marginRight: 8, borderWidth: 2, borderColor: mensual ? c.accent : c.border, backgroundColor: mensual ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{mensual && <Icono nombre="check" color={c.sobre} size={14} grosor={3} />}</View>
        <Text style={{ color: c.text, flex: 1 }}>Se repone todos los meses {mensual ? '(cada mes arranca de nuevo con el monto)' : '(si no, se va gastando hasta agotarse)'}</Text>
      </Pressable>
      <Pressable onPress={guardar} style={{ backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 }}>
        <Text style={{ color: c.sobre, fontWeight: '800' }}>Guardar</Text>
      </Pressable>
      <Pressable onPress={onListo} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: c.muted }}>Cancelar</Text></Pressable>
    </Card>
  );
};

const Item = ({ e, onEditar }: { e: EstadoReserva; onEditar: () => void }) => {
  const { guardarReserva, borrarReserva } = useFinanzas();
  const [abierta, setAbierta] = useState(false);
  const [sumando, setSumando] = useState(false);
  const [extra, setExtra] = useState('');
  const { reserva: r } = e;
  const cuentaNombre = useFinanzas((st) => st.cuentas.find((x) => x.id === r.cuentaId)?.nombre ?? '');
  const pct = r.monto ? Math.min(100, (e.gastado / r.monto) * 100) : 100;
  const pasada = e.queda < 0;
  const agregar = async () => {
    const n = parseMonto(extra);
    if (!n || n <= 0) return avisar('Ingresá cuánto sumás');
    tap(true);
    await guardarReserva({ ...r, monto: Math.round((r.monto + n) * 100) / 100 });
    setExtra('');
    setSumando(false);
  };
  return (
    <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border }}>
      <Pressable onPress={() => { tap(); setAbierta(!abierta); }} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 40, height: 40, borderRadius: radio.m, marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: suave(r.categoria ? catInfo(r.categoria).color : VERDE) }}>
          <Icono nombre={r.categoria ? catInfo(r.categoria).icono ?? 'tag' : 'escudo'} color={r.categoria ? catInfo(r.categoria).color : VERDE} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{r.nombre}</Text>
          <Text style={s.sub}>
            {[r.categoria && `categoría ${r.categoria}`, r.patron && `"${r.patron}"`, r.mensual && 'se repone cada mes', `desde ${fechaCorta(r.desde)}`].filter(Boolean).join(' · ') || 'Sin gastos asignados: se maneja a mano'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: pasada ? c.gasto : VERDE, fontWeight: '800' }}>{money(e.queda, r.moneda)}</Text>
          <Text style={s.sub}>de {money(r.monto, r.moneda)}</Text>
        </View>
      </Pressable>
      <View style={{ marginTop: 8 }}><Barra valor={pct} color={pasada ? c.gasto : pct >= 80 ? c.aviso : VERDE} /></View>
      <Text style={[s.sub, { marginTop: 4 }]}>{pasada ? `Te pasaste por ${money(-e.queda, r.moneda)}` : `Gastaste ${money(e.gastado, r.moneda)} (${Math.round(pct)}%)`}</Text>

      {sumando ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <TextInput style={{ ...input, flex: 1, marginBottom: 0 }} placeholder="Cuánto sumás" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={extra} onChangeText={setExtra} />
          <Pressable onPress={agregar}><Text style={{ color: c.accent, fontWeight: '700' }}>Sumar</Text></Pressable>
          <Pressable onPress={() => setSumando(false)}><Text style={{ color: c.muted }}>✕</Text></Pressable>
        </View>
      ) : (
        <Pressable onPress={() => { tap(); setSumando(true); }} style={{ marginTop: 8 }}><Text style={{ color: c.accent, fontWeight: '700' }}>＋ Apartar más plata</Text></Pressable>
      )}

      {abierta && (
        <View style={{ marginTop: 8 }}>
          {e.gastos.length === 0 ? (
            <Text style={s.sub}>
              Todavía no hay gastos que la descuenten. Cuenta los gastos (no ingresos) en {r.moneda} desde el {fechaCorta(r.desde)}
              {r.cuentaId ? ` hechos con ${cuentaNombre}` : ''}, de {[r.categoria && `categoría ${r.categoria}`, r.patron && `concepto con "${r.patron}"`].filter(Boolean).join(' o ') || 'ninguna categoría ni palabra (editala para asignarle una)'}. Si tu movimiento es más viejo, editá la reserva y cambiá la fecha de inicio.
            </Text>
          ) : e.gastos.slice(0, 15).map((m) => <Fila key={m.id} m={m} />)}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <Pressable onPress={() => { tap(); onEditar(); }}><Text style={{ color: c.accent, fontWeight: '700' }}>Editar</Text></Pressable>
            <Pressable onPress={() => { tap(); guardarReserva({ ...r, activa: false }); }}><Text style={{ color: c.muted }}>Archivar</Text></Pressable>
            <Pressable onPress={async () => { if (await confirmar('¿Borrar la reserva?', `Se borra "${r.nombre}". Tus movimientos no cambian.`, 'Borrar')) borrarReserva(r.id); }}><Text style={{ color: c.gasto }}>Borrar</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

export default function Reservas() {
  const estados = useReservas();
  const cuentas = useFinanzas((st) => st.cuentas);
  const porAnio = useFinanzas((st) => st.porAnio);
  const todas = useFinanzas((st) => st.reservas);
  const guardarReserva = useFinanzas((st) => st.guardarReserva);
  const [form, setForm] = useState<Reserva | 'nueva' | null>(null);

  const saldos = useMemo(() => saldosPorCuenta(porAnio, cuentas), [porAnio, cuentas]);
  // Por cuenta: cuánto hay, cuánto está reservado y cuánto queda libre
  const grupos = useMemo(() => {
    const m = new Map<string, EstadoReserva[]>();
    for (const e of estados) m.set(e.reserva.cuentaId ?? '', [...(m.get(e.reserva.cuentaId ?? '') ?? []), e]);
    return [...m.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : 0));
  }, [estados]);
  const archivadas = todas.filter((r) => !r.activa);
  const { conv, vista, puede } = useConversor();
  const totalReservado = estados.filter((e) => puede(e.reserva.moneda)).reduce((a, e) => a + conv(Math.max(e.queda, 0), e.reserva.moneda), 0);
  const totalGastado = estados.filter((e) => puede(e.reserva.moneda)).reduce((a, e) => a + conv(e.gastado, e.reserva.moneda), 0);

  return (
    <PantallaTeclado>
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Tip id="reservas-ayuda" emoji="🗂️">
        Una reserva es plata que apartás dentro de una cuenta para un fin (ej. $50.000 de Mercado Pago para Transportes). No mueve tu saldo: solo te muestra cuánto de lo que tenés ya está comprometido. Los gastos que coinciden (por categoría o por una palabra como "sube") la descuentan solos, y siguen contando como gasto normal.
      </Tip>
      {form ? (
        <Formulario key={form === 'nueva' ? 'nueva' : form.id} previa={form === 'nueva' ? undefined : form} onListo={() => setForm(null)} />
      ) : grupos.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <View style={{ flex: 1, backgroundColor: suave(VERDE), borderRadius: radio.l, padding: 14 }}>
            <Text style={{ color: c.muted, fontSize: 13 }}>Te queda reservado</Text>
            <Text style={{ color: VERDE, fontSize: 20, fontWeight: '700', marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{money(totalReservado, vista)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.card, borderRadius: radio.l, padding: 14, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ color: c.muted, fontSize: 13 }}>Ya usaste</Text>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '700', marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{money(totalGastado, vista)}</Text>
          </View>
        </View>
      ) : (
        <Vacio icono="escudo" color={VERDE} titulo="Todavía no tenés reservas" texto="Apartá plata para un fin, como el transporte del mes, y mirá cuánto te queda." />
      )}

      {grupos.map(([cuentaId, lista]) => {
        const cuenta = cuentas.find((x) => x.id === cuentaId);
        const monedas = [...new Set(lista.map((e) => e.reserva.moneda))];
        return (
          <Card key={cuentaId || 'sin'}>
            <Titulo t={cuenta ? cuenta.nombre : 'Sin cuenta específica'} />
            {cuenta && monedas.map((mon) => {
              const saldo = saldos.get(cuenta.id)?.[mon] ?? 0;
              const reservado = lista.filter((e) => e.reserva.moneda === mon).reduce((a, e) => a + Math.max(e.queda, 0), 0);
              return (
                <View key={mon} style={{ backgroundColor: c.card2, borderRadius: 12, padding: 12, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: c.muted }}>Tenés</Text><Text style={{ color: c.text, fontWeight: '700' }}>{money(saldo, mon)}</Text></View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}><Text style={{ color: c.muted }}>Reservado</Text><Text style={{ color: VERDE, fontWeight: '700' }}>−{money(reservado, mon)}</Text></View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: c.border, marginTop: 6, paddingTop: 6 }}>
                    <Text style={{ color: c.text, fontWeight: '700' }}>Libre sin reservar</Text>
                    <Text style={{ color: saldo - reservado < 0 ? c.gasto : c.ingreso, fontWeight: '800' }}>{money(saldo - reservado, mon)}</Text>
                  </View>
                </View>
              );
            })}
            {lista.map((e) => <Item key={e.reserva.id} e={e} onEditar={() => setForm(e.reserva)} />)}
          </Card>
        );
      })}

      {archivadas.length > 0 && (
        <Card>
          <Titulo t={`Archivadas (${archivadas.length})`} />
          {archivadas.map((r) => (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ color: c.muted, flex: 1 }}>{r.nombre} · {money(r.monto, r.moneda)}</Text>
              <Pressable onPress={() => { tap(); guardarReserva({ ...r, activa: true }); }}><Text style={{ color: c.accent, fontWeight: '700' }}>Reactivar</Text></Pressable>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
    {!form && (
      <BarraAccion>
        <Boton titulo="Nueva reserva" icono="mas" color={VERDE} onPress={() => setForm('nueva')} />
      </BarraAccion>
    )}
    </PantallaTeclado>
  );
}
