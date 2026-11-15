import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, confirmar } from '../src/alerta';
import type { Deuda, ResumenDeuda } from '../src/deudas';
import { useConversor, useFinanzas, useResumenDeudas } from '../src/store';
import { c, radio, suave } from '../src/theme';
import type { Moneda } from '../src/types';
import { Barra, Card, centrado, Chip, MAX_FORM, Fila, PantallaTeclado, s, SelectorFecha, SelectorMoneda, tap, Tip, Titulo, BarraAccion, Boton, Segmentado, Vacio } from '../src/ui';
import { fechaCorta, hoyYmd, money, parseMonto } from '../src/util';
import { Icono } from '../src/iconos';

const input = { backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16, marginBottom: 8 } as const;
const MORADO = c.deuda;

// Selector del método/cuenta con el que se movió la plata
const Metodos = ({ valor, onChange }: { valor: string; onChange: (m: string) => void }) => {
  const cuentas = useFinanzas((st) => st.cuentas);
  const nombres = useMemo(() => [...new Set(['Efectivo', 'Mercado pago', ...cuentas.filter((x) => x.activa).map((x) => x.nombre)])], [cuentas]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
      {nombres.map((n) => <Chip key={n} label={n} on={valor === n} onPress={() => onChange(n)} />)}
    </View>
  );
};

// Alta / edición de una deuda
const FormularioDeuda = ({ previa, onListo }: { previa?: Deuda; onListo: () => void }) => {
  const guardarDeuda = useFinanzas((st) => st.guardarDeuda);
  const [direccion, setDireccion] = useState<Deuda['direccion']>(previa?.direccion ?? 'debo');
  const [nombre, setNombre] = useState(previa?.nombre ?? '');
  const [monto, setMonto] = useState(previa ? String(previa.monto).replace('.', ',') : '');
  const [moneda, setMoneda] = useState<Moneda>(previa?.moneda ?? 'ARS');
  const [fecha, setFecha] = useState(previa?.fecha ?? hoyYmd());
  const [vence, setVence] = useState(previa?.vencimiento ?? '');
  const [nota, setNota] = useState(previa?.nota ?? '');
  const [conMov, setConMov] = useState(true); // registrar también la plata que entró / salió
  const [metodo, setMetodo] = useState('Efectivo');

  const guardar = async () => {
    const n = parseMonto(monto);
    if (!nombre.trim()) return avisar('¿Con quién es la deuda?');
    if (!n || n <= 0) return avisar('Ingresá un monto válido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return avisar('Fecha con formato AAAA-MM-DD');
    if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(vence)) return avisar('Vencimiento con formato AAAA-MM-DD');
    tap(true);
    await guardarDeuda(
      { id: previa?.id, nombre: nombre.trim(), direccion, monto: Math.round(n * 100) / 100, moneda, fecha, vencimiento: vence || null, nota: nota.trim() },
      !previa && conMov ? { metodo } : undefined,
    );
    onListo();
  };

  return (
    <Card>
      <Titulo t={previa ? 'Editar deuda' : 'Nueva deuda'} />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {([['debo', 'Yo debo'], ['me_deben', 'Me deben']] as const).map(([d, label]) => (
          <Pressable key={d} onPress={() => { tap(); setDireccion(d); }} style={{ flex: 1, padding: 10, borderRadius: 10, alignItems: 'center', backgroundColor: direccion === d ? MORADO : c.card2 }}>
            <Text style={{ color: direccion === d ? c.sobre : c.muted, fontWeight: '700' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput style={input} placeholder={direccion === 'debo' ? 'A quién le debés (ej. Juan, Banco)' : 'Quién te debe'} placeholderTextColor={c.muted} value={nombre} onChangeText={setNombre} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput style={{ ...input, flex: 1 }} placeholder="Monto total" placeholderTextColor={c.muted} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} />
        <SelectorMoneda valor={moneda} onChange={setMoneda} chico />
      </View>
      <SelectorFecha valor={fecha} onChange={setFecha} etiqueta="Fecha" />
      <SelectorFecha valor={vence || fecha} onChange={setVence} etiqueta="Vence (opcional)" />
      {!!vence && (
        <Pressable onPress={() => { tap(); setVence(''); }} style={{ marginTop: -2, marginBottom: 8 }}>
          <Text style={{ color: c.muted }}>Quitar vencimiento</Text>
        </Pressable>
      )}
      <TextInput style={input} placeholder="Nota (opcional)" placeholderTextColor={c.muted} value={nota} onChangeText={setNota} />
      {!previa && (
        <>
          <Pressable onPress={() => { tap(); setConMov(!conMov); }} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, marginRight: 8, borderWidth: 2, borderColor: conMov ? c.accent : c.border, backgroundColor: conMov ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{conMov && <Icono nombre="check" color={c.sobre} size={14} grosor={3} />}</View>
            <Text style={{ color: c.text, flex: 1 }}>{direccion === 'debo' ? 'Ya recibí esa plata (suma a tu dinero)' : 'Ya les presté esa plata (resta de tu dinero)'}</Text>
          </Pressable>
          {conMov && <Metodos valor={metodo} onChange={setMetodo} />}
        </>
      )}
      <Pressable onPress={guardar} style={{ backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 10 }}>
        <Text style={{ color: c.sobre, fontWeight: '800' }}>Guardar</Text>
      </Pressable>
      <Pressable onPress={onListo} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: c.muted }}>Cancelar</Text></Pressable>
    </Card>
  );
};

const FormularioPago = ({ r, onListo }: { r: ResumenDeuda; onListo: () => void }) => {
  const pagarDeuda = useFinanzas((st) => st.pagarDeuda);
  const { deuda } = r;
  const [monto, setMonto] = useState(String(r.pendiente).replace('.', ','));
  const [fecha, setFecha] = useState(hoyYmd());
  const [metodo, setMetodo] = useState('Efectivo');
  const debo = deuda.direccion === 'debo';
  const guardar = async () => {
    const n = parseMonto(monto);
    if (!n || n <= 0) return avisar('Ingresá un monto válido');
    if (n > r.pendiente + 0.005 && !(await confirmar('¿Es más de lo que falta?', `Falta ${money(r.pendiente, deuda.moneda)} y estás cargando ${money(n, deuda.moneda)}.`, 'Cargar igual'))) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return avisar('Fecha con formato AAAA-MM-DD');
    tap(true);
    await pagarDeuda(deuda.id, { monto: Math.round(n * 100) / 100, fecha, metodo });
    onListo();
  };
  return (
    <View style={{ backgroundColor: c.card2, borderRadius: 12, padding: 12, marginTop: 10 }}>
      <Text style={s.sub}>{debo ? 'Cuánto pagás' : 'Cuánto te pagaron'} ({deuda.moneda})</Text>
      <TextInput style={{ ...input, backgroundColor: c.card, marginTop: 6 }} keyboardType="decimal-pad" value={monto} onChangeText={setMonto} placeholderTextColor={c.muted} />
      <SelectorFecha valor={fecha} onChange={setFecha} etiqueta="Fecha" />
      <Text style={s.sub}>{debo ? 'Con qué pagás' : 'Dónde lo recibís'}</Text>
      <Metodos valor={metodo} onChange={setMetodo} />
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, alignItems: 'center' }}>
        <Pressable onPress={guardar} style={{ backgroundColor: MORADO, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 }}><Text style={{ color: c.sobre, fontWeight: '800' }}>Registrar</Text></Pressable>
        <Pressable onPress={onListo}><Text style={{ color: c.muted }}>Cancelar</Text></Pressable>
      </View>
    </View>
  );
};

const ItemDeuda = ({ r, onEditar }: { r: ResumenDeuda; onEditar: () => void }) => {
  const { guardarDeuda, borrarDeuda } = useFinanzas();
  const [pagando, setPagando] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const { deuda } = r;
  const debo = deuda.direccion === 'debo';
  const vencida = !r.saldada && !!deuda.vencimiento && deuda.vencimiento < hoyYmd();
  const pct = deuda.monto ? Math.min(100, (r.pagado / deuda.monto) * 100) : 0;
  return (
    <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border, opacity: deuda.activa ? 1 : 0.55 }}>
      <Pressable onPress={() => { tap(); setAbierta(!abierta); }} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{deuda.nombre}{r.saldada ? ' · saldada' : ''}</Text>
          <Text style={[s.sub, vencida && { color: c.aviso }]}>
            {vencida ? `Venció el ${fechaCorta(deuda.vencimiento!)}` : deuda.vencimiento && !r.saldada ? `Vence el ${fechaCorta(deuda.vencimiento)}` : `Desde ${fechaCorta(deuda.fecha)}`}
            {deuda.nota ? ` · ${deuda.nota}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: r.saldada ? c.muted : debo ? c.gasto : c.ingreso, fontWeight: '800' }}>{money(r.pendiente, deuda.moneda)}</Text>
          <Text style={s.sub}>de {money(deuda.monto, deuda.moneda)}</Text>
        </View>
      </Pressable>
      <View style={{ marginTop: 8 }}><Barra valor={pct} color={r.saldada ? c.ingreso : MORADO} /></View>
      <Text style={[s.sub, { marginTop: 4 }]}>{debo ? 'Pagaste' : 'Te pagaron'} {money(r.pagado, deuda.moneda)} ({Math.round(pct)}%)</Text>

      {!r.saldada && !pagando && (
        <Pressable onPress={() => { tap(); setPagando(true); }} accessibilityRole="button" style={{ marginTop: 10, minHeight: 44, borderRadius: radio.m, borderWidth: 1, borderColor: c.deuda, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.text, fontWeight: '700' }}>{debo ? 'Registrar un pago' : 'Registrar un cobro'}</Text>
        </Pressable>
      )}
      {pagando && <FormularioPago r={r} onListo={() => setPagando(false)} />}

      {abierta && (
        <View style={{ marginTop: 8 }}>
          {r.pagos.length === 0 ? <Text style={s.sub}>Todavía no hay pagos registrados.</Text> : r.pagos.map((m) => <Fila key={m.id} m={m} />)}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <Pressable onPress={() => { tap(); onEditar(); }}><Text style={{ color: c.accent, fontWeight: '700' }}>Editar</Text></Pressable>
            <Pressable onPress={() => { tap(); guardarDeuda({ ...deuda, activa: !deuda.activa }); }}><Text style={{ color: c.muted }}>{deuda.activa ? 'Archivar' : 'Reactivar'}</Text></Pressable>
            <Pressable onPress={async () => { if (await confirmar('¿Borrar la deuda?', `Se borra "${deuda.nombre}". Los movimientos que ya cargaste se conservan.`, 'Borrar')) borrarDeuda(deuda.id); }}><Text style={{ color: c.gasto }}>Borrar</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

export default function Deudas() {
  const resumenes = useResumenDeudas();
  const { conv, vista } = useConversor();
  const [form, setForm] = useState<Deuda | 'nueva' | null>(null);
  const [archivadas, setArchivadas] = useState(false);
  const [dir, setDir] = useState<Deuda['direccion']>('debo');
  const hojaConectada = useFinanzas((st) => !!st.url && !st.nubeUid);
  if (hojaConectada) {
    return (
      <View style={{ padding: 16, ...centrado(MAX_FORM) }}>
        <Card><Text style={{ color: c.text }}>Las deudas todavía no funcionan con una hoja de Google conectada: la hoja no tiene dónde guardarlas. Desconectá la hoja en Ajustes o usá tu cuenta de Yuro.</Text></Card>
      </View>
    );
  }

  const activas = resumenes.filter((r) => r.deuda.activa);
  const pendientes = (dir: Deuda['direccion']) => activas.filter((r) => r.deuda.direccion === dir && !r.saldada);
  const total = (dir: Deuda['direccion']) => pendientes(dir).reduce((a, r) => a + conv(r.pendiente, r.deuda.moneda), 0);
  const lista = (dir: Deuda['direccion']) => activas.filter((r) => r.deuda.direccion === dir).sort((a, b) => Number(a.saldada) - Number(b.saldada) || (a.deuda.vencimiento ?? '9').localeCompare(b.deuda.vencimiento ?? '9'));
  const archivo = resumenes.filter((r) => !r.deuda.activa);
  const editar = (r: ResumenDeuda) => setForm(r.deuda);

  return (
    <PantallaTeclado>
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Tip id="deudas-ayuda" emoji="🤝">
        Cuando pedís o prestás plata no es un ingreso ni un gasto: es una deuda. Cargala acá y registrá cada pago; la plata mueve tu dinero pero no infla tus ingresos y gastos del mes.
      </Tip>
      {form ? (
        <FormularioDeuda key={form === 'nueva' ? 'nueva' : form.id} previa={form === 'nueva' ? undefined : form} onListo={() => setForm(null)} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(['debo', 'me_deben'] as const).map((d) => (
              <Pressable key={d} onPress={() => { tap(); setDir(d); }} accessibilityRole="button" accessibilityState={{ selected: dir === d }}
                style={{ flex: 1, backgroundColor: suave(d === 'debo' ? c.gasto : c.ingreso), borderRadius: radio.l, padding: 14, borderWidth: 1.5, borderColor: dir === d ? (d === 'debo' ? c.gasto : c.ingreso) : 'transparent' }}>
                <Text style={{ color: c.muted, fontSize: 13 }}>{d === 'debo' ? 'Yo debo' : 'Me deben'}</Text>
                <Text style={{ color: d === 'debo' ? c.gasto : c.ingreso, fontWeight: '700', fontSize: 20, marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit>{money(total(d), vista)}</Text>
                <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>{pendientes(d).length} {pendientes(d).length === 1 ? 'pendiente' : 'pendientes'}</Text>
              </Pressable>
            ))}
          </View>
          {activas.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Segmentado opciones={[{ valor: 'debo', label: 'Lo que debo' }, { valor: 'me_deben', label: 'Lo que me deben' }]} valor={dir} onChange={setDir} color={c.deuda} />
            </View>
          )}
        </>
      )}

      {lista(dir).length > 0 && (
        <Card>
          {lista(dir).map((r) => <ItemDeuda key={r.deuda.id} r={r} onEditar={() => editar(r)} />)}
        </Card>
      )}
      {activas.length === 0 && !form && <Vacio icono="usuario" color={c.deuda} titulo="No tenés deudas cargadas" texto="Anotá lo que debés o lo que te deben y registrá cada pago." />}
      {activas.length > 0 && lista(dir).length === 0 && !form && <Vacio icono="check" color={c.ingreso} titulo={dir === 'debo' ? 'No le debés a nadie' : 'Nadie te debe'} />}

      {archivo.length > 0 && (
        <Card>
          <Pressable onPress={() => { tap(); setArchivadas(!archivadas); }}><Text style={s.sub}>{archivadas ? '▾' : '▸'} Archivadas ({archivo.length})</Text></Pressable>
          {archivadas && archivo.map((r) => <ItemDeuda key={r.deuda.id} r={r} onEditar={() => editar(r)} />)}
        </Card>
      )}
    </ScrollView>
    {!form && (
      <BarraAccion>
        <Boton titulo="Agregar deuda" icono="mas" color={c.deuda} onPress={() => setForm('nueva')} />
      </BarraAccion>
    )}
    </PantallaTeclado>
  );
}
