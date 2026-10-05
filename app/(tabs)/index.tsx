import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Dona, type Porcion } from '../../src/charts';
import { calcularCuotas } from '../../src/cuotas';
import { convertir, movimientosDe, saldosAl, useConversor, useFinanzas, useMovimientosMes } from '../../src/store';
import { c, catInfo } from '../../src/theme';
import type { Moneda, Movimiento } from '../../src/types';
import { Barra, Card, Columnas, EstadoSync, Fab, Fila, centrado, MesSelector, SelectorMoneda, Tip, Titulo, s, tap } from '../../src/ui';
import { MESES, diasDelMes, etiquetaMes, hoyYmd, mesActual, money, pct, sumaMes } from '../../src/util';

// Totales del mes convertidos a la moneda de vista
const totales = (lista: Movimiento[], conv: (v: number, de: Moneda) => number) => {
  const suma = (f: (m: Movimiento) => boolean) => lista.filter(f).reduce((a, m) => a + conv(m.valor, m.moneda), 0);
  const porCat: Record<string, number> = {};
  for (const m of lista) if (m.tipo === 'Egreso') porCat[m.categoria || 'Sin categoría'] = (porCat[m.categoria || 'Sin categoría'] ?? 0) - conv(m.valor, m.moneda);
  const ingresos = suma((m) => m.tipo === 'Ingreso');
  const gastos = -suma((m) => m.tipo === 'Egreso');
  const ahorro = -suma((m) => m.tipo === 'Ahorro');
  return {
    ingresos, gastos, ahorro, porCat,
    libre: ingresos - gastos - ahorro,
    digital: -suma((m) => m.tipo === 'Egreso' && m.metodo !== 'Efectivo'),
    efectivo: -suma((m) => m.tipo === 'Egreso' && m.metodo === 'Efectivo'),
  };
};

const Mini = ({ emoji, titulo, valor, color, moneda }: { emoji: string; titulo: string; valor: number; color: string; moneda: Moneda }) => (
  <View style={{ flex: 1, backgroundColor: c.card2, borderRadius: 14, padding: 10 }}>
    <Text style={{ fontSize: 16 }}>{emoji}</Text>
    <Text style={{ color: c.muted, fontSize: 11, marginTop: 4 }}>{titulo}</Text>
    <Text style={{ color, fontWeight: '800', fontSize: 14 }} numberOfLines={1} adjustsFontSizeToFit>{money(valor, moneda)}</Text>
  </View>
);

const Leyenda = ({ color, t }: { color: string; t: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14, marginTop: 6 }}>
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 6 }} />
    <Text style={{ color: c.muted, fontSize: 12 }}>{t}</Text>
  </View>
);

export default function Resumen() {
  const { sincronizando, sincronizar, presupuestos, porAnio, url, setMonedaVista, actualizarCotizaciones, saldosIniciales, ahorrosIniciales, recurrentes, recienGenerados, limpiarGenerados } = useFinanzas();
  const { mes, movimientos } = useMovimientosMes();
  const { vista, cot, conv, puede } = useConversor();
  const [sel, setSel] = useState<string | null>(null);
  const $ = (n: number) => money(n, vista);

  const r = useMemo(() => totales(movimientos, conv), [movimientos, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => totales(movimientosDe(porAnio, sumaMes(mes, -1)), conv), [porAnio, mes, vista, cot]); // eslint-disable-line react-hooks/exhaustive-deps
  const sinCotizar = [...new Set(movimientos.filter((m) => !puede(m.moneda)).map((m) => m.moneda))];

  // Cuánto tenés de cada moneda (acumulado) y cuánto se movió este mes
  const saldos = useMemo(() => saldosAl(porAnio, saldosIniciales, ahorrosIniciales, mes), [porAnio, saldosIniciales, ahorrosIniciales, mes]);
  const delMes = (mon: Moneda) => movimientos.filter((m) => m.moneda === mon).reduce((a, m) => a + m.valor, 0);
  const visibles = saldos.filter((x) => x.usada || x.moneda === 'ARS');
  const totalTodo = saldos.reduce((a, x) => a + conv(x.total, x.moneda), 0);

  const porciones: Porcion[] = useMemo(
    () => Object.entries(r.porCat).sort((a, b) => b[1] - a[1]).map(([label, valor]) => ({ label, valor, ...catInfo(label) })),
    [r],
  );

  // Frases que explican el mes en palabras
  const datos = useMemo(() => {
    const out: { e: string; t: string }[] = [];
    const esActual = mes === mesActual();
    const dias = esActual ? +hoyYmd().slice(8) : diasDelMes(mes);
    const top = porciones[0];
    if (top) out.push({ e: top.emoji, t: `${top.label} es donde más gastaste: ${$(top.valor)} (${pct(top.valor, r.gastos)}% de tus gastos).` });
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
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 100, ...centrado() }} refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}>
        <EstadoSync />
        {recienGenerados.length > 0 && (
          <View style={[s.tip, { borderColor: c.ingreso, backgroundColor: '#2ecc8f1a' }]}>
            <Text style={{ fontSize: 20, marginRight: 10 }}>🔁</Text>
            <Text style={{ color: c.text, flex: 1, lineHeight: 19 }}>
              Se cargaron solos: <Text style={{ fontWeight: '700' }}>{recienGenerados.join(', ')}</Text>. Si algún monto cambió, editalo en Movimientos.
            </Text>
            <Pressable onPress={() => { tap(); limpiarGenerados(); }} hitSlop={12}><Text style={{ color: c.muted, fontSize: 18, marginLeft: 8 }}>✕</Text></Pressable>
          </View>
        )}
        {!url && <Tip id="config" emoji="⚙️">Tus movimientos se guardan en este teléfono. Si querés tenerlos también en una hoja de Google, conectala en Ajustes (es opcional).</Tip>}
        {sinCotizar.length > 0 && (
          <Pressable onPress={() => { tap(); actualizarCotizaciones(); }} style={[s.tip, { borderColor: c.aviso }]}>
            <Text style={{ color: c.aviso, flex: 1 }}>⚠️ Falta la cotización de {sinCotizar.join(', ')}: esos movimientos no se suman al total. Tocá para bajarla o cargala en Ajustes.</Text>
          </Pressable>
        )}

        <Columnas izq={<>
        {/* Tu dinero por moneda */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Titulo t="💰 Tu dinero" sub={mes === mesActual() ? 'Lo que tenés hoy en cada moneda' : `Lo que tenías al cierre de ${etiquetaMes(mes)}`} />
            </View>
            <Link href="/saldos" asChild>
              <Pressable onPress={() => tap()} hitSlop={10}><Text style={{ color: c.accent, fontWeight: '700' }}>Ajustar</Text></Pressable>
            </Link>
          </View>
          {visibles.map((x) => (
            <View key={x.moneda} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
              <View style={{ width: 54, paddingVertical: 6, borderRadius: 10, backgroundColor: c.card2, alignItems: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 16 }}>{x.moneda === 'ARS' ? '🇦🇷' : x.moneda === 'USD' ? '💵' : '🪙'}</Text>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 11 }}>{x.moneda}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: x.total < 0 ? c.gasto : c.text, fontWeight: '800', fontSize: 20 }} numberOfLines={1} adjustsFontSizeToFit>{money(x.total, x.moneda)}</Text>
                <Text style={s.sub} numberOfLines={2}>
                  Disponible {money(x.disponible, x.moneda)}{x.ahorrado ? ` · 🐷 ahorrado ${money(x.ahorrado, x.moneda)}` : ''}
                  {delMes(x.moneda) ? ` · este mes ${delMes(x.moneda) > 0 ? '+' : ''}${money(delMes(x.moneda), x.moneda)}` : ''}
                </Text>
              </View>
              {x.moneda !== vista && puede(x.moneda) && x.total !== 0 && <Text style={{ color: c.muted, fontSize: 12, marginLeft: 6 }}>≈ {$(conv(x.total, x.moneda))}</Text>}
            </View>
          ))}
          {visibles.length > 1 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
              <Text style={{ color: c.muted }}>Todo junto en {vista}</Text>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>{$(totalTodo)}</Text>
            </View>
          )}
          {(cot.USD > 0 || cot.USDT > 0) && (
            <Text style={[s.sub, { marginTop: 6 }]}>
              Cotización: {cot.USD > 0 ? `USD ${money(cot.USD)}` : ''}{cot.USD > 0 && cot.USDT > 0 ? ' · ' : ''}{cot.USDT > 0 ? `USDT ${money(cot.USDT)}` : ''}
            </Text>
          )}
        </Card>
        <Tip id="saldos" emoji="👛">Acá ves cuánto tenés en cada moneda, sumando todo lo del año. Para que coincida con tu plata real, tocá “Ajustar” y cargá cuánto tenías de cada moneda el 1 de enero.</Tip>

        {/* Balance */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={[s.h, { marginBottom: 0 }]}>Dinero libre del mes</Text>
            <SelectorMoneda valor={vista} onChange={setMonedaVista} chico />
          </View>
          <Text style={{ ...s.big, color: r.libre < 0 ? c.gasto : c.text }}>{$(r.libre)}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
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
        <Tip id="libre">“Dinero libre” es lo que te queda: ingresos − gastos − ahorro. Si se pone en rojo, gastaste más de lo que entró. Con ARS / USD / USDT elegís en qué moneda ver los totales.</Tip>


        {/* Torta de gastos */}
        <Card>
          <Titulo t="¿En qué se fue tu plata?" sub="Tocá una porción o una categoría para ver el detalle" />
          {porciones.length === 0 ? (
            <Text style={{ color: c.muted, textAlign: 'center', paddingVertical: 24 }}>Sin gastos este mes 🎉</Text>
          ) : (
            <>
              <Dona data={porciones} sel={sel} onSel={setSel} moneda={vista} />
              <View style={{ marginTop: 12 }}>
                {porciones.map((p) => {
                  const activo = sel === p.label;
                  return (
                    <Pressable key={p.label} onPress={() => { tap(); setSel(activo ? null : p.label); }} style={{ paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, backgroundColor: activo ? c.card2 : 'transparent', opacity: sel && !activo ? 0.5 : 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 16, marginRight: 8 }}>{p.emoji}</Text>
                        <Text style={{ color: c.text, flex: 1 }}>{p.label}</Text>
                        <Text style={{ color: c.muted, marginRight: 8 }}>{pct(p.valor, r.gastos)}%</Text>
                        <Text style={{ color: c.text, fontWeight: '700' }}>{$(p.valor)}</Text>
                      </View>
                      <Barra valor={pct(p.valor, porciones[0].valor)} color={p.color} alto={6} />
                    </Pressable>
                  );
                })}
              </View>
              {sel && (
                <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 4 }}>
                  {movimientos.filter((m) => m.tipo === 'Egreso' && (m.categoria || 'Sin categoría') === sel).sort((a, b) => conv(a.valor, a.moneda) - conv(b.valor, b.moneda)).map((m) => <Fila key={m.id} m={m} />)}
                </View>
              )}
            </>
          )}
        </Card>

        </>} der={<>
        {/* Cuotas */}
        {cuotas.planes.length > 0 && (
          <Link href="/cuotas" asChild>
            <Pressable onPress={() => tap()} style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><Titulo t="💳 Cuotas" sub="Tocá para ver el detalle" /></View>
                <Text style={{ color: c.accent, fontWeight: '700' }}>Ver ›</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Mini emoji="📆" titulo="Este mes" valor={cuotasMes} color={c.text} moneda={vista} />
                <Mini emoji="⏳" titulo="Te falta pagar" valor={cuotasDeuda} color={c.gasto} moneda={vista} />
              </View>
              {cuotas.porCargar.length > 0 && <Text style={{ color: c.aviso, marginTop: 8 }}>📌 {cuotas.porCargar.length} cuota(s) de este mes todavía sin cargar</Text>}
              {cuotas.terminan.length > 0 && <Text style={{ color: c.ingreso, marginTop: 8 }}>🎉 Este mes terminás: {cuotas.terminan.map((p) => p.ultima.concepto).join(', ')}</Text>}
            </Pressable>
          </Link>
        )}

        {/* Recurrentes */}
        <Link href="/recurrentes" asChild>
          <Pressable onPress={() => tap()} style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><Titulo t="🔁 Recurrentes" sub={recurrentes.length ? 'Se cargan solos cada mes' : 'Sueldo, suscripciones, alquiler: cargalos una vez y se repiten solos'} /></View>
              <Text style={{ color: c.accent, fontWeight: '700' }}>{recurrentes.length ? 'Ver ›' : 'Crear ›'}</Text>
            </View>
            {recurrentes.filter((r) => r.activo).sort((a, b) => a.dia - b.dia).slice(0, 4).map((r) => {
              const cargado = !!r.ultimoYm && r.ultimoYm >= mesActual();
              return (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  <Text style={{ width: 22 }}>{cargado ? '✅' : '⏳'}</Text>
                  <Text style={{ color: c.text, flex: 1 }} numberOfLines={1}>{r.concepto} <Text style={{ color: c.muted, fontSize: 12 }}>· día {r.dia}</Text></Text>
                  <Text style={{ color: r.tipo === 'Ingreso' ? c.ingreso : c.muted, fontWeight: '600' }}>{money(r.valor, r.moneda)}</Text>
                </View>
              );
            })}
          </Pressable>
        </Link>

        {/* Presupuestos */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Titulo t="🎯 Presupuestos" sub="Cuánto querés gastar como máximo por categoría" /></View>
            <Link href="/presupuestos" asChild>
              <Pressable onPress={() => tap()} hitSlop={10}><Text style={{ color: c.accent, fontWeight: '700' }}>Editar</Text></Pressable>
            </Link>
          </View>
          {presu.length === 0 && (
            <Link href="/presupuestos" asChild>
              <Pressable style={{ backgroundColor: c.card2, borderRadius: 12, padding: 14 }}>
                <Text style={{ color: c.text }}>Definí un tope mensual (ej. Comida $200.000) y la app te avisa cuando te estés por pasar. 👉 Tocá para crear uno</Text>
              </Pressable>
            </Link>
          )}
          {presu.map(({ cat, tope, gastado }) => {
            const p = pct(gastado, tope);
            const color = p >= 100 ? c.gasto : p >= 80 ? c.aviso : c.ingreso;
            return (
              <View key={cat} style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 16, marginRight: 8 }}>{catInfo(cat).emoji}</Text>
                  <Text style={{ color: c.text, flex: 1 }}>{cat}</Text>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{$(gastado)} / {$(tope)}</Text>
                </View>
                <Barra valor={p} color={color} />
                <Text style={{ color, fontSize: 12, marginTop: 4 }}>
                  {p >= 100 ? `⚠️ Te pasaste por ${$(gastado - tope)}` : p >= 80 ? `Cuidado: te quedan ${$(tope - gastado)}` : `Te quedan ${$(tope - gastado)} (${100 - p}%)`}
                </Text>
              </View>
            );
          })}
        </Card>

        {/* Datos del mes */}
        {datos.length > 0 && (
          <Card>
            <Titulo t="🧠 Tu mes en palabras" />
            {datos.map((d, i) => (
              <View key={i} style={{ flexDirection: 'row', marginTop: i ? 10 : 0 }}>
                <Text style={{ fontSize: 16, marginRight: 10 }}>{d.e}</Text>
                <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>{d.t}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Efectivo vs digital */}
        {r.gastos > 0 && (
          <Card>
            <Titulo t="💵 Efectivo vs 📱 digital" />
            <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.border }}>
              <View style={{ width: `${pct(r.efectivo, r.gastos)}%`, backgroundColor: c.ingreso }} />
              <View style={{ width: `${pct(r.digital, r.gastos)}%`, backgroundColor: '#5dade2' }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ color: c.muted }}>Efectivo {$(r.efectivo)}</Text>
              <Text style={{ color: c.muted }}>Digital {$(r.digital)}</Text>
            </View>
          </Card>
        )}

        <Text style={[s.h, { marginTop: 4 }]}>Últimos del mes</Text>
        <Card style={{ padding: 0, paddingVertical: 4 }}>
          {movimientos.length === 0 && <Text style={{ color: c.muted, padding: 16 }}>Todavía no hay movimientos. Tocá el + para cargar el primero.</Text>}
          {[...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5).map((m) => <Fila key={m.id} m={m} />)}
        </Card>
        </>} />
      </ScrollView>
      <Fab />
    </View>
  );
}
