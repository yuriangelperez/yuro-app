import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar } from '../src/alerta';
import { type Cuenta, emojiCuenta, PROVEEDORES, proveedorDe, TIPOS_CUENTA, type TipoCuenta, tipoSugerido } from '../src/proveedores';
import { saldosPorCuenta, useDepositosReserva, useFinanzas, useTransferenciasSugeridas } from '../src/store';
import { c } from '../src/theme';
import type { Moneda } from '../src/types';
import { Card, centrado, Chip, MAX_FORM, s, SelectorMoneda, tap, Tip, Titulo } from '../src/ui';
import { fechaCorta, money, parseMonto } from '../src/util';

const input = { backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16, marginBottom: 8 } as const;

// Alta / edición de una cuenta. Al escribir el nombre se sugiere proveedor y tipo (ej. "Naranja X" → billetera).
const Formulario = ({ previa, saldoActual, onListo }: { previa?: Cuenta; saldoActual?: number; onListo: () => void }) => {
  const guardarCuenta = useFinanzas((st) => st.guardarCuenta);
  const [nombre, setNombre] = useState(previa?.nombre ?? '');
  const [proveedorId, setProveedorId] = useState<string | null>(previa?.proveedorId ?? null);
  const [tipo, setTipo] = useState<TipoCuenta>(previa?.tipo ?? 'wallet');
  const [moneda, setMoneda] = useState<Moneda>(previa?.moneda ?? 'ARS');
  const [saldo, setSaldo] = useState(previa?.saldoInicial ? String(previa.saldoInicial).replace('.', ',') : '');
  const [enviando, setEnviando] = useState(false);
  const [real, setReal] = useState(''); // conciliar: lo que dice tu banco/billetera hoy

  const elegirProveedor = (id: string) => {
    tap();
    const p = PROVEEDORES.find((x) => x.id === id);
    if (!p) return;
    const quita = proveedorId === id;
    setProveedorId(quita ? null : id);
    if (!quita) {
      setTipo(p.tipo);
      if (!nombre.trim()) setNombre(p.nombre);
    }
  };

  const guardar = async () => {
    const n = nombre.trim();
    if (!n || enviando) return;
    let inicial = saldo.trim() ? parseMonto(saldo) : 0;
    if (inicial === null) return avisar('El saldo inicial tiene que ser un número');
    // Conciliar: la diferencia entre lo real y lo calculado se absorbe en el saldo inicial (los movimientos no se tocan)
    if (real.trim()) {
      const r = parseMonto(real);
      if (r === null) return avisar('El saldo real tiene que ser un número');
      inicial = Math.round((inicial + (r - (saldoActual ?? 0))) * 100) / 100;
    }
    const otra = useFinanzas.getState().cuentas.find((x) => x.id !== previa?.id && x.nombre.toLowerCase() === n.toLowerCase());
    if (otra) return avisar(`Ya tenés una cuenta llamada "${otra.nombre}"`);
    tap(true);
    setEnviando(true);
    await guardarCuenta({ id: previa?.id, nombre: n, proveedorId: proveedorId ?? proveedorDe(n)?.id ?? null, tipo, moneda, saldoInicial: inicial });
    onListo();
  };

  return (
    <Card>
      <Titulo t={previa ? 'Editar cuenta' : 'Nueva cuenta'} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
        {PROVEEDORES.map((p) => <Chip key={p.id} label={`${p.emoji} ${p.nombre}`} on={proveedorId === p.id} onPress={() => elegirProveedor(p.id)} />)}
      </View>
      <TextInput
        style={input}
        placeholder="Nombre (ej. Caja de ahorro Santander)"
        placeholderTextColor={c.muted}
        value={nombre}
        onChangeText={(t) => { setNombre(t); if (!previa && !proveedorId) setTipo(tipoSugerido(t)); }}
      />
      <Text style={s.sub}>Tipo</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
        {TIPOS_CUENTA.map((t) => <Chip key={t.t} label={t.label} on={tipo === t.t} onPress={() => setTipo(t.t)} />)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 }}>
        <Text style={s.sub}>Moneda habitual</Text>
        <SelectorMoneda valor={moneda} onChange={setMoneda} chico />
      </View>
      {previa && saldoActual !== undefined && (
        <View style={{ backgroundColor: c.card2, borderRadius: 12, padding: 12, marginBottom: 8 }}>
          <Text style={{ color: c.text, fontWeight: '700' }}>Conciliar con tu {previa.nombre}</Text>
          <Text style={[s.sub, { marginTop: 2 }]}>Según Yuro tenés {money(saldoActual, previa.moneda)}. Si tu banco o billetera dice otra cosa, escribí lo real y la diferencia se ajusta sola.</Text>
          <TextInput style={{ ...input, marginTop: 8, marginBottom: 0, backgroundColor: c.card }} placeholder={`Saldo real hoy en ${previa.moneda}`} placeholderTextColor={c.muted} keyboardType="decimal-pad" value={real} onChangeText={setReal} />
          {!!real.trim() && parseMonto(real) !== null && Math.abs((parseMonto(real) ?? 0) - saldoActual) >= 0.01 && (
            <Text style={{ color: c.aviso, fontSize: 12, marginTop: 6 }}>Diferencia: {money((parseMonto(real) ?? 0) - saldoActual, previa.moneda)}. Si es grande, puede faltar un movimiento o haber uno duplicado.</Text>
          )}
        </View>
      )}
      <TextInput style={input} placeholder={`Saldo inicial en ${moneda} (opcional)`} placeholderTextColor={c.muted} keyboardType="decimal-pad" value={saldo} onChangeText={setSaldo} />
      <Pressable onPress={guardar} disabled={!nombre.trim()} style={{ backgroundColor: nombre.trim() ? c.accent : c.border, borderRadius: 12, padding: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>{previa ? 'Guardar cambios' : 'Crear cuenta'}</Text>
      </Pressable>
      <Pressable onPress={onListo} style={{ padding: 12, alignItems: 'center' }}>
        <Text style={{ color: c.muted }}>Cancelar</Text>
      </Pressable>
    </Card>
  );
};

export default function Cuentas() {
  const cuentas = useFinanzas((st) => st.cuentas);
  const porAnio = useFinanzas((st) => st.porAnio);
  const guardarCuenta = useFinanzas((st) => st.guardarCuenta);
  const [editando, setEditando] = useState<Cuenta | 'nueva' | null>(null);
  const [verArchivadas, setVerArchivadas] = useState(false);

  const saldos = useMemo(() => saldosPorCuenta(porAnio, cuentas), [porAnio, cuentas]);
  const activas = cuentas.filter((x) => x.activa);
  const archivadas = cuentas.filter((x) => !x.activa);
  const totales = useMemo(() => {
    const suma: Partial<Record<Moneda, number>> = {};
    for (const x of cuentas.filter((q) => q.activa)) for (const [m, v] of Object.entries(saldos.get(x.id) ?? {})) suma[m as Moneda] = (suma[m as Moneda] ?? 0) + (v as number);
    return (Object.entries(suma) as [Moneda, number][]).filter(([m, v]) => v !== 0 || m === 'ARS').sort((a, b) => (a[0] === 'ARS' ? -1 : b[0] === 'ARS' ? 1 : 0));
  }, [cuentas, saldos]);
  const hayTransf = useMemo(() => Object.values(porAnio).flat().some((m) => m.tipo === 'Transferencia'), [porAnio]);

  const sugeridas = useTransferenciasSugeridas();
  const depositos = useDepositosReserva();
  const { convertirEnTransferencia, convertirEnDeposito, descartarTransferencia } = useFinanzas();
  const nombre = (id?: string | null) => cuentas.find((x) => x.id === id)?.nombre ?? '?';

  const Fila = ({ cuenta }: { cuenta: Cuenta }) => {
    const sal = saldos.get(cuenta.id) ?? {};
    const monedas = (Object.keys(sal) as Moneda[]).filter((m) => sal[m] !== 0 || m === cuenta.moneda);
    return (
      <Pressable onPress={() => { tap(); setEditando(cuenta); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: c.border, opacity: cuenta.activa ? 1 : 0.55 }}>
        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: c.card2, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Text style={{ fontSize: 22 }}>{emojiCuenta(cuenta)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{cuenta.nombre}</Text>
          <Text style={s.sub}>{TIPOS_CUENTA.find((t) => t.t === cuenta.tipo)?.label.replace(/^\S+\s/, '')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {(monedas.length ? monedas : [cuenta.moneda]).map((m) => {
            const v = sal[m] ?? 0;
            return <Text key={m} style={{ color: v < 0 ? c.gasto : c.text, fontWeight: '700' }}>{money(v, m)}</Text>;
          })}
        </View>
      </Pressable>
    );
  };

  if (editando) return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Formulario previa={editando === 'nueva' ? undefined : editando} saldoActual={editando === 'nueva' ? undefined : saldos.get(editando.id)?.[editando.moneda] ?? 0} onListo={() => setEditando(null)} />
      {editando !== 'nueva' && (
        <Pressable
          onPress={async () => { tap(true); await guardarCuenta({ ...editando, activa: !editando.activa }); setEditando(null); }}
          style={{ padding: 14, alignItems: 'center' }}
        >
          <Text style={{ color: editando.activa ? c.gasto : c.ingreso }}>{editando.activa ? '📦 Archivar cuenta' : '♻️ Reactivar cuenta'}</Text>
        </Pressable>
      )}
    </ScrollView>
  );

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }}>
      <Tip id="cuentas-ayuda" emoji="🏦">
        Una cuenta es dónde está tu plata: un banco, una billetera, efectivo. Cuando pasás plata de una a otra, usá Transferencia: no cuenta como gasto ni como ingreso. Archivar una cuenta la saca de las listas sin borrar sus movimientos.
      </Tip>

      {sugeridas.length > 0 && (
        <Card>
          <Titulo t="↔️ ¿Son transferencias entre tus cuentas?" sub="Figuran como un gasto en una cuenta y un ingreso en otra, así que inflan tus ingresos y gastos. Si las unís, dejan de contarse." />
          {sugeridas.slice(0, 8).map((p) => (
            <View key={p.clave} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo}>{nombre(p.egreso.cuentaId)} → {nombre(p.ingreso.cuentaId)}</Text>
              <Text style={s.sub}>{money(p.ingreso.valor, p.ingreso.moneda)} · {fechaCorta(p.egreso.fecha)}{p.egreso.hora ? ` ${p.egreso.hora}` : ''}{p.segura ? ' · casi seguro' : ''}{p.comision > 0 ? ` · el banco se quedó ${money(p.comision, p.ingreso.moneda)}` : ''}</Text>
              <Text style={[s.sub, { marginTop: 2 }]} numberOfLines={1}>«{p.egreso.concepto}» y «{p.ingreso.concepto}»</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <Pressable onPress={() => { tap(true); convertirEnTransferencia(p); }}><Text style={{ color: c.accent, fontWeight: '700' }}>{p.comision > 0 ? 'Unir (y registrar la comisión)' : 'Unir en una transferencia'}</Text></Pressable>
                <Pressable onPress={() => { tap(); descartarTransferencia(p.clave); }}><Text style={{ color: c.muted }}>No lo es</Text></Pressable>
              </View>
            </View>
          ))}
        </Card>
      )}

      {depositos.length > 0 && (
        <Card>
          <Titulo t="🗂️ ¿Es plata que pasaste a una reserva?" sub="Figuran como un gasto de categoría “Reserva”, pero la plata no salió de tu bolsillo: pasó de una cuenta tuya a otra. Si las convertís en transferencia, dejan de contarse como gasto." />
          {depositos.slice(0, 10).map((d) => (
            <View key={d.clave} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
              <Text style={s.titulo}>{money(-d.mov.valor, d.mov.moneda)} · {fechaCorta(d.mov.fecha)}</Text>
              <Text style={s.sub} numberOfLines={1}>«{d.mov.concepto}»</Text>
              <Text style={[s.sub, { marginTop: 2 }]}>Pasaría de {d.origen.nombre} a {d.destino.nombre}</Text>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <Pressable onPress={() => { tap(true); convertirEnDeposito(d); }}><Text style={{ color: c.accent, fontWeight: '700' }}>Convertir en transferencia</Text></Pressable>
                <Pressable onPress={() => { tap(); descartarTransferencia(d.clave); }}><Text style={{ color: c.muted }}>Es un gasto</Text></Pressable>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Total por moneda, sumando todas las cuentas activas */}
      <View style={{ marginBottom: 14 }}>
        <Text style={s.h}>Total en tus cuentas</Text>
        {totales.length === 0 ? <Text style={s.big}>{money(0, 'ARS')}</Text> : totales.map(([m, v], i) => (
          <Text key={m} style={i === 0 ? { ...s.big, color: v < 0 ? c.gasto : c.text } : { color: v < 0 ? c.gasto : c.muted, fontSize: 18, fontWeight: '600', marginTop: 2 }}>{money(v, m)}</Text>
        ))}
        <Text style={[s.sub, { marginTop: 4 }]}>{activas.length} {activas.length === 1 ? 'cuenta activa' : 'cuentas activas'}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <Pressable onPress={() => { tap(); setEditando('nueva'); }} style={{ flex: 1, backgroundColor: c.accent, borderRadius: 12, padding: 13, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>＋ Agregar cuenta</Text>
        </Pressable>
        {activas.length >= 2 && (
          <Pressable onPress={() => { tap(); router.push('/nuevo'); }} style={{ flex: 1, backgroundColor: c.card, borderRadius: 12, padding: 13, alignItems: 'center' }}>
            <Text style={{ color: '#5dade2', fontWeight: '700' }}>↔️ Transferir{hayTransf ? '' : ' entre cuentas'}</Text>
          </Pressable>
        )}
      </View>
      <Text style={[s.h, { marginLeft: 4, marginBottom: 8 }]}>Cuentas</Text>
      <View style={{ backgroundColor: c.card, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
        {activas.length === 0 && <Text style={[s.sub, { padding: 16 }]}>Todavía no tenés cuentas. Se crean solas con el método de cada movimiento, o podés agregarlas a mano.</Text>}
        {activas.map((x) => <Fila key={x.id} cuenta={x} />)}
      </View>

      {archivadas.length > 0 && (
        <Card>
          <Pressable onPress={() => { tap(); setVerArchivadas(!verArchivadas); }}>
            <Text style={s.sub}>{verArchivadas ? '▾' : '▸'} Archivadas ({archivadas.length})</Text>
          </Pressable>
          {verArchivadas && archivadas.map((x) => <Fila key={x.id} cuenta={x} />)}
        </Card>
      )}
      <Text style={[s.sub, { marginTop: 4 }]}>Los saldos salen del saldo inicial de cada cuenta más sus movimientos. Un ahorro no cambia el saldo de la cuenta: la plata sigue ahí, solo queda marcada como ahorrada.</Text>
    </ScrollView>
  );
}
