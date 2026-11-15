import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { avisar } from '../src/alerta';
import { type Recurrente, useConversor, useFinanzas } from '../src/store';
import { c } from '../src/theme';
import { descripcion, faltaCargar, proxima, tieneMovimiento, vecesPorMes } from '../src/recurrentes';
import { Avatar, Card, centrado, MAX_FORM, s, tap, Tip, Titulo } from '../src/ui';
import { diasDelMes, fechaCorta, hoyYmd, mesActual, money } from '../src/util';
import { Icono } from '../src/iconos';

// Estado de este mes: ya cargado, o en qué día se carga
const estado = (r: Recurrente, movsMes: { tipo: string; concepto: string }[]) => {
  if (!r.activo) return { t: 'Pausado', col: c.muted };
  if ((r.frecuencia ?? 'mensual') !== 'mensual') {
    const prox = proxima(r, hoyYmd(), r.ultimaFecha);
    return { t: prox ? `Próxima: ${fechaCorta(prox)}` : 'Al día', col: c.aviso };
  }
  const ym = mesActual();
  if (tieneMovimiento(r, movsMes)) return { t: 'Cargado este mes', col: c.ingreso };
  const dia = Math.min(r.dia, diasDelMes(ym));
  if (faltaCargar(r, movsMes, hoyYmd())) return { t: 'Falta cargar este mes', col: c.gasto };
  const faltan = dia - +hoyYmd().slice(8);
  return { t: faltan <= 0 ? 'Se carga al abrir la app' : faltan === 1 ? 'Se carga mañana' : `Se carga el día ${dia} (en ${faltan} días)`, col: c.aviso };
};

const Fila = ({ r, movsMes }: { r: Recurrente; movsMes: { tipo: string; concepto: string }[] }) => {
  const e = estado(r, movsMes);
  const cargarAhora = useFinanzas((st) => st.cargarRecurrenteAhora);
  const sinCargar = r.activo && !tieneMovimiento(r, movsMes);
  return (
    <Pressable
      onPress={() => { tap(); router.push({ pathname: '/recurrente', params: { id: r.id } }); }}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border, opacity: r.activo ? 1 : 0.5 }}
    >
      <Avatar categoria={r.categoria || (r.tipo === 'Ahorro' ? 'Ahorro' : '')} size={38} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={s.titulo} numberOfLines={1}>{r.concepto}</Text>
        <Text style={s.sub}>{descripcion(r)} · {r.metodo}</Text>
        <Text style={{ color: e.col, fontSize: 12, marginTop: 2 }}>{e.t}</Text>
        {sinCargar && (
          <Pressable onPress={async () => { tap(true); if (await cargarAhora(r.id)) avisar(`Cargado: ${r.concepto}.`); }} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 6, backgroundColor: c.accent + '26', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
            <Text style={{ color: c.accent, fontWeight: '700', fontSize: 12 }}>＋ Cargar ahora</Text>
          </Pressable>
        )}
      </View>
      <Text style={{ color: r.tipo === 'Ingreso' ? c.ingreso : r.tipo === 'Ahorro' ? c.ahorro : c.gasto, fontWeight: '700' }}>{money(r.valor, r.moneda)}</Text>
    </Pressable>
  );
};

export default function Recurrentes() {
  const recurrentes = useFinanzas((st) => st.recurrentes);
  const porAnio = useFinanzas((st) => st.porAnio);
  const recargarRecurrentes = useFinanzas((st) => st.recargarRecurrentes);
  const { vista, conv } = useConversor();
  const movsMes = useMemo(() => (porAnio[mesActual().slice(0, 4)] ?? []).filter((m) => m.fecha.startsWith(mesActual())), [porAnio]);
  const faltan = recurrentes.filter((r) => faltaCargar(r, movsMes, hoyYmd()));
  const activos = recurrentes.filter((r) => r.activo);
  const total = (t: Recurrente['tipo']) => activos.filter((r) => r.tipo === t).reduce((a, r) => a + Math.abs(conv(r.valor, r.moneda)) * vecesPorMes(r), 0);
  const ingresos = total('Ingreso');
  const gastos = total('Egreso');
  const ahorro = total('Ahorro');
  const grupos: { t: Recurrente['tipo']; titulo: string }[] = [
    { t: 'Ingreso', titulo: 'Ingresos fijos' },
    { t: 'Egreso', titulo: 'Gastos fijos' },
    { t: 'Ahorro', titulo: 'Ahorro automático' },
  ];
  const ordenar = (a: Recurrente, b: Recurrente) => a.dia - b.dia;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }}>
      <Tip id="recurrentes" emoji="🔁">
        Lo que se repite (sueldo, suscripciones, alquiler, o algo semanal o quincenal) se carga solo el día que toque. Si un mes cambia el monto, editá ese movimiento como cualquier otro.
      </Tip>

      {faltan.length > 0 && (
        <Pressable onPress={async () => { tap(true); const n = await recargarRecurrentes(); avisar(n ? `Listo: se cargaron ${n} recurrentes de este mes.` : 'No había nada para cargar.'); }} style={{ backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: c.sobre, fontWeight: '800' }}>↻ Cargar los {faltan.length} que faltan este mes</Text>
        </Pressable>
      )}

      {activos.length > 0 && (
        <Card>
          <Text style={s.h}>Por mes, fijo</Text>
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <View style={{ flex: 1 }}><Text style={s.sub}>Entra</Text><Text style={{ color: c.ingreso, fontWeight: '800' }}>{money(ingresos, vista)}</Text></View>
            <View style={{ flex: 1 }}><Text style={s.sub}>Sale</Text><Text style={{ color: c.gasto, fontWeight: '800' }}>{money(gastos + ahorro, vista)}</Text></View>
            <View style={{ flex: 1 }}><Text style={s.sub}>Te queda</Text><Text style={{ color: ingresos - gastos - ahorro < 0 ? c.gasto : c.text, fontWeight: '800' }}>{money(ingresos - gastos - ahorro, vista)}</Text></View>
          </View>
          {ingresos > 0 && gastos > 0 && (
            <Text style={[s.sub, { marginTop: 8 }]}>Tus gastos fijos se llevan el {Math.round((gastos / ingresos) * 100)}% de tus ingresos fijos.</Text>
          )}
        </Card>
      )}

      {grupos.map(({ t, titulo }) => {
        const lista = recurrentes.filter((r) => r.tipo === t).sort(ordenar);
        if (!lista.length) return null;
        return (
          <Card key={t}>
            <Titulo t={titulo} />
            {lista.map((r) => <Fila key={r.id} r={r} movsMes={movsMes} />)}
          </Card>
        );
      })}

      {recurrentes.length === 0 && (
        <View style={{ alignItems: 'center', marginVertical: 30 }}>
          <Icono nombre="repetir" color={c.muted} size={44} />
          <Text style={{ color: c.text, fontWeight: '700', marginTop: 8 }}>Todavía no tenés recurrentes</Text>
          <Text style={{ color: c.muted, textAlign: 'center', marginTop: 4 }}>Creá uno acá o, al cargar un movimiento, activá “Repetir todos los meses”.</Text>
        </View>
      )}

      <Pressable onPress={() => { tap(); router.push('/recurrente'); }} style={{ backgroundColor: c.accent, padding: 16, borderRadius: 14, alignItems: 'center' }}>
        <Text style={{ color: c.sobre, fontWeight: '800' }}>+ Nuevo recurrente</Text>
      </Pressable>
      <Text style={[s.sub, { textAlign: 'center', marginTop: 10 }]}>Se guardan en este teléfono.</Text>
    </ScrollView>
  );
}
