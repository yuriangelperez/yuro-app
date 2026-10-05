import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { calcularCuotas, type Plan, proyeccion, siguienteCuota } from '../../src/cuotas';
import { useConversor, useFinanzas } from '../../src/store';
import { c, catInfo } from '../../src/theme';
import { Avatar, Barra, Card, Columnas, MesSelector, Tip, Titulo, centrado, s, tap } from '../../src/ui';
import { MESES, etiquetaMes, mesActual, money, moneyCorto } from '../../src/util';

const nombreMes = (ym: string) => `${MESES[+ym.slice(5) - 1]}${ym.slice(0, 4) !== mesActual().slice(0, 4) ? ' ' + ym.slice(0, 4) : ''}`;

const FilaPlan = ({ p, detalle, accion }: { p: Plan; detalle: string; accion?: React.ReactNode }) => (
  <Pressable
    onPress={() => { tap(); router.push({ pathname: '/nuevo', params: { id: p.ultima.id, fecha: p.ultima.fecha } }); }}
    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}
  >
    <Avatar categoria={p.ultima.categoria} size={36} />
    <View style={{ flex: 1, marginLeft: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.titulo} numberOfLines={1}>{p.ultima.concepto}</Text>
        <Text style={{ color: c.text, fontWeight: '700' }}>{money(p.cuota, p.moneda)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
        <View style={{ flex: 1 }}><Barra valor={(p.pagadas / p.totales) * 100} color={p.restantes === 0 ? c.ingreso : catInfo(p.ultima.categoria).color} alto={6} /></View>
        <Text style={{ color: c.muted, fontSize: 12 }}>{p.pagadas}/{p.totales}</Text>
      </View>
      <Text style={[s.sub, { marginTop: 4 }]}>{detalle}</Text>
    </View>
    {accion}
  </Pressable>
);

export default function Cuotas() {
  const { mes, porAnio, guardar, sincronizando, sincronizar } = useFinanzas();
  const { vista, conv } = useConversor();
  const [cargadas, setCargadas] = useState<string[]>([]); // evita cargar dos veces la misma cuota
  const $ = (n: number) => money(n, vista);

  const todos = useMemo(() => Object.values(porAnio).flat(), [porAnio]);
  const r = useMemo(() => calcularCuotas(todos, mes), [todos, mes]);
  const proximos = useMemo(() => proyeccion(r.planes, mes, 6, conv), [r, mes, vista]); // eslint-disable-line react-hooks/exhaustive-deps

  const suma = (l: Plan[], f: (p: Plan) => number) => l.reduce((a, p) => a + conv(f(p), p.moneda), 0);
  const pagasEsteMes = suma([...r.delMes, ...r.porCargar], (p) => p.cuota);
  const deuda = suma(r.activas, (p) => p.deuda);
  const max = Math.max(1, ...proximos.map((x) => x.total));
  const pendientes = r.porCargar.filter((p) => !cargadas.includes(p.clave));

  const cargar = (lista: Plan[]) => {
    tap(true);
    setCargadas((x) => [...x, ...lista.map((p) => p.clave)]);
    guardar(...lista.map((p) => siguienteCuota(p, mes)));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <MesSelector />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40, ...centrado() }} refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}>
        <Columnas izq={<>
        <Card>
          <Text style={s.h}>En {nombreMes(mes)} pagás de cuotas</Text>
          <Text style={s.big}>{$(pagasEsteMes)}</Text>
          <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
            {[
              { e: '⏳', t: 'Te falta pagar', v: $(deuda), col: c.gasto },
              { e: '💳', t: 'Compras activas', v: String(r.activas.length + r.terminan.length), col: c.text },
              { e: '🎉', t: 'Terminás este mes', v: String(r.terminan.length), col: c.ingreso },
            ].map((x) => (
              <View key={x.t} style={{ flex: 1, backgroundColor: c.card2, borderRadius: 14, padding: 10 }}>
                <Text style={{ fontSize: 16 }}>{x.e}</Text>
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 4 }}>{x.t}</Text>
                <Text style={{ color: x.col, fontWeight: '800', fontSize: 14 }} numberOfLines={1} adjustsFontSizeToFit>{x.v}</Text>
              </View>
            ))}
          </View>
        </Card>
        <Tip id="cuotas" emoji="💳">
          Las cuotas salen de las columnas “Cuotas cumplidas” y “Cuotas totales” de tu hoja. “Te falta pagar” es lo que queda de cada compra después de la cuota de este mes.
        </Tip>

        {pendientes.length > 0 && (
          <Card style={{ borderColor: c.aviso }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><Titulo t="📌 Te faltan cargar" sub={`Cuotas que corresponden a ${nombreMes(mes)} y todavía no están en la hoja`} /></View>
              {pendientes.length > 1 && (
                <Pressable onPress={() => cargar(pendientes)} hitSlop={8}><Text style={{ color: c.accent, fontWeight: '700' }}>Cargar todas</Text></Pressable>
              )}
            </View>
            {pendientes.map((p) => (
              <FilaPlan
                key={p.clave}
                p={p}
                detalle={`Cuota ${p.porCargar} de ${p.totales}`}
                accion={
                  <Pressable onPress={() => cargar([p])} style={{ backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginLeft: 10 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Cargar</Text>
                  </Pressable>
                }
              />
            ))}
          </Card>
        )}

        <Card>
          <Titulo t={`✅ Pagadas en ${nombreMes(mes)}`} sub={r.delMes.length ? `${r.delMes.length} cuota(s) cargada(s)` : undefined} />
          {r.delMes.length === 0 && <Text style={{ color: c.muted }}>No hay cuotas cargadas este mes.</Text>}
          {r.delMes.map((p) => (
            <FilaPlan key={p.clave} p={p} detalle={p.restantes === 0 ? '🎉 ¡Última cuota! Terminaste de pagarla' : `Cuota ${p.pagadas} de ${p.totales} · faltan ${p.restantes} (${money(p.deuda, p.moneda)})`} />
          ))}
        </Card>

        </>} der={<>
        <Card>
          <Titulo t="⏳ Lo que te falta pagar" sub={r.activas.length ? `Total ${$(deuda)}` : undefined} />
          {r.activas.length === 0 && <Text style={{ color: c.muted }}>¡No te quedan cuotas por pagar! 🎉</Text>}
          {r.activas.map((p) => (
            <FilaPlan key={p.clave} p={p} detalle={`Faltan ${p.restantes} cuota(s) · ${money(p.deuda, p.moneda)} · terminás en ${nombreMes(p.finYm)}`} />
          ))}
        </Card>

        {r.activas.length > 0 && (
          <Card>
            <Titulo t="📅 Próximos meses" sub="Cuánto vas a pagar de cuotas ya comprometidas" />
            {proximos.map((x) => (
              <View key={x.ym} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: c.text }}>{nombreMes(x.ym)}</Text>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{x.total ? $(x.total) : '—'}</Text>
                </View>
                <Barra valor={(x.total / max) * 100} color={c.accent} alto={6} />
                {x.terminan.length > 0 && (
                  <Text style={[s.sub, { color: c.ingreso }]}>
                    🎉 Terminás {x.terminan.map((p) => p.ultima.concepto).join(', ')}: después se liberan {$(suma(x.terminan, (p) => p.cuota))} por mes
                  </Text>
                )}
              </View>
            ))}
            <Text style={[s.sub, { marginTop: 10 }]}>Máximo: {moneyCorto(max, vista)} en {etiquetaMes(proximos.reduce((a, b) => (b.total > a.total ? b : a)).ym)}</Text>
          </Card>
        )}
        </>} />
      </ScrollView>
    </View>
  );
}
