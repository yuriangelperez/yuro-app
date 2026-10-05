import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { type Recurrente, useConversor, useFinanzas } from '../src/store';
import { c } from '../src/theme';
import { Avatar, Card, centrado, MAX_FORM, s, tap, Tip, Titulo } from '../src/ui';
import { diasDelMes, hoyYmd, mesActual, money } from '../src/util';

// Estado de este mes: ya cargado, o en qué día se carga
const estado = (r: Recurrente) => {
  if (!r.activo) return { t: '⏸ Pausado', col: c.muted };
  const ym = mesActual();
  if (r.ultimoYm && r.ultimoYm >= ym) return { t: '✅ Cargado este mes', col: c.ingreso };
  const dia = Math.min(r.dia, diasDelMes(ym));
  const faltan = dia - +hoyYmd().slice(8);
  return { t: faltan <= 0 ? '⏳ Se carga al abrir la app' : faltan === 1 ? '⏳ Se carga mañana' : `⏳ Se carga el día ${dia} (en ${faltan} días)`, col: c.aviso };
};

const Fila = ({ r }: { r: Recurrente }) => {
  const e = estado(r);
  return (
    <Pressable
      onPress={() => { tap(); router.push({ pathname: '/recurrente', params: { id: r.id } }); }}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border, opacity: r.activo ? 1 : 0.5 }}
    >
      <Avatar categoria={r.categoria || (r.tipo === 'Ahorro' ? 'Ahorro' : '')} size={38} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={s.titulo} numberOfLines={1}>{r.concepto}</Text>
        <Text style={s.sub}>Día {r.dia} · {r.metodo}</Text>
        <Text style={{ color: e.col, fontSize: 12, marginTop: 2 }}>{e.t}</Text>
      </View>
      <Text style={{ color: r.tipo === 'Ingreso' ? c.ingreso : r.tipo === 'Ahorro' ? c.ahorro : c.gasto, fontWeight: '700' }}>{money(r.valor, r.moneda)}</Text>
    </Pressable>
  );
};

export default function Recurrentes() {
  const recurrentes = useFinanzas((st) => st.recurrentes);
  const { vista, conv } = useConversor();
  const activos = recurrentes.filter((r) => r.activo);
  const total = (t: Recurrente['tipo']) => activos.filter((r) => r.tipo === t).reduce((a, r) => a + Math.abs(conv(r.valor, r.moneda)), 0);
  const ingresos = total('Ingreso');
  const gastos = total('Egreso');
  const ahorro = total('Ahorro');
  const grupos: { t: Recurrente['tipo']; titulo: string }[] = [
    { t: 'Ingreso', titulo: '⬆️ Ingresos fijos' },
    { t: 'Egreso', titulo: '⬇️ Gastos fijos' },
    { t: 'Ahorro', titulo: '🐷 Ahorro automático' },
  ];
  const ordenar = (a: Recurrente, b: Recurrente) => a.dia - b.dia;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }}>
      <Tip id="recurrentes" emoji="🔁">
        Lo que se repite todos los meses (sueldo, suscripciones, alquiler) se carga solo el día que elijas. Si un mes cambia el monto, editá ese movimiento como cualquier otro.
      </Tip>

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
            {lista.map((r) => <Fila key={r.id} r={r} />)}
          </Card>
        );
      })}

      {recurrentes.length === 0 && (
        <View style={{ alignItems: 'center', marginVertical: 30 }}>
          <Text style={{ fontSize: 44 }}>🔁</Text>
          <Text style={{ color: c.text, fontWeight: '700', marginTop: 8 }}>Todavía no tenés recurrentes</Text>
          <Text style={{ color: c.muted, textAlign: 'center', marginTop: 4 }}>Creá uno acá o, al cargar un movimiento, activá “Repetir todos los meses”.</Text>
        </View>
      )}

      <Pressable onPress={() => { tap(); router.push('/recurrente'); }} style={{ backgroundColor: c.accent, padding: 16, borderRadius: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800' }}>+ Nuevo recurrente</Text>
      </Pressable>
      <Text style={[s.sub, { textAlign: 'center', marginTop: 10 }]}>Se guardan en este teléfono.</Text>
    </ScrollView>
  );
}
