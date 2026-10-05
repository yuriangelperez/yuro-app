import * as Haptics from 'expo-haptics';
import { Link } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFinanzas } from './store';
import { c, catInfo } from './theme';
import { MONEDAS, type Moneda, type Movimiento } from './types';
import { etiquetaMes, fechaCorta, money, sumaMes } from './util';

// ---- Responsive (web en compu/tablet) ----
// escritorio: barra lateral y dos columnas; el contenido nunca se estira más que MAX.
export const MAX = 1180;
export const MAX_FORM = 680;
export const useLayout = () => {
  const { width } = useWindowDimensions();
  return { ancho: width, escritorio: width >= 900, tablet: width >= 600 };
};
export const centrado = (max = MAX) => ({ width: '100%', maxWidth: max, alignSelf: 'center' }) as const;

// En pantallas anchas pone los bloques en dos columnas; en el celu, uno abajo del otro (izq primero).
export const Columnas = ({ izq, der }: { izq: React.ReactNode; der: React.ReactNode }) => {
  const { escritorio } = useLayout();
  if (!escritorio) return <>{izq}{der}</>;
  return (
    <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
      <View style={{ flex: 1, minWidth: 0 }}>{izq}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{der}</View>
    </View>
  );
};

// Vibración corta al tocar (no disponible en web: se ignora).
export const tap = (fuerte = false) => {
  (fuerte ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) : Haptics.selectionAsync()).catch(() => {});
};

export const colorValor = (m: Movimiento) => (m.tipo === 'Ingreso' || m.valor > 0 ? c.ingreso : m.tipo === 'Ahorro' ? c.ahorro : c.gasto);

export const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => <View style={[s.card, style]}>{children}</View>;

export const Titulo = ({ t, sub }: { t: string; sub?: string }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={s.cardTitulo}>{t}</Text>
    {sub && <Text style={s.sub}>{sub}</Text>}
  </View>
);

export const Avatar = ({ categoria, size = 40 }: { categoria: string; size?: number }) => {
  const i = catInfo(categoria);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: i.color + '33', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.48 }}>{i.emoji}</Text>
    </View>
  );
};

// Barra de progreso que se llena con animación
export const Barra = ({ valor, color, alto = 8 }: { valor: number; color: string; alto?: number }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.max(0, Math.min(100, valor)), duration: 700, useNativeDriver: false }).start();
  }, [valor, anim]);
  return (
    <View style={{ height: alto, backgroundColor: c.border, borderRadius: alto / 2, overflow: 'hidden' }}>
      <Animated.View style={{ height: alto, borderRadius: alto / 2, backgroundColor: color, width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
};

// Consejo que explica algo de la pantalla; se cierra y no vuelve (se reactivan desde Ajustes).
export const Tip = ({ id, emoji = '💡', children }: { id: string; emoji?: string; children: React.ReactNode }) => {
  const oculto = useFinanzas((st) => st.tipsOcultos.includes(id));
  const ocultarTip = useFinanzas((st) => st.ocultarTip);
  if (oculto) return null;
  return (
    <View style={s.tip}>
      <Text style={{ fontSize: 20, marginRight: 10 }}>{emoji}</Text>
      <Text style={{ color: c.text, flex: 1, lineHeight: 19 }}>{children}</Text>
      <Pressable onPress={() => { tap(); ocultarTip(id); }} hitSlop={12}>
        <Text style={{ color: c.muted, fontSize: 18, marginLeft: 8 }}>✕</Text>
      </Pressable>
    </View>
  );
};

export const Chip = ({ label, on, onPress, color = c.accent }: { label: string; on: boolean; onPress: () => void; color?: string }) => (
  <Pressable
    onPress={() => { tap(); onPress(); }}
    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: on ? color : c.card, borderWidth: 1, borderColor: on ? color : c.border, marginRight: 8, marginBottom: 8 }}
  >
    <Text style={{ color: on ? '#fff' : c.text, fontWeight: on ? '700' : '400' }}>{label}</Text>
  </Pressable>
);

export const MesSelector = () => {
  const mes = useFinanzas((st) => st.mes);
  const setMes = useFinanzas((st) => st.setMes);
  const mover = (d: number) => { tap(); setMes(sumaMes(mes, d)); };
  return (
    <View style={[s.mes, centrado()]}>
      <Pressable onPress={() => mover(-1)} hitSlop={12} style={s.flechaBtn}><Text style={s.flecha}>‹</Text></Pressable>
      <Text style={s.mesTxt}>{etiquetaMes(mes)}</Text>
      <Pressable onPress={() => mover(1)} hitSlop={12} style={s.flechaBtn}><Text style={s.flecha}>›</Text></Pressable>
    </View>
  );
};

// Estado de la sincronización con la hoja: script desactualizado, error (con reintento) y cambios en cola.
export const EstadoSync = () => {
  const { url, versionScript, error, pendientes, sincronizando, sincronizar } = useFinanzas();
  if (!url) return null;
  return (
    <>
      {versionScript !== null && versionScript < 4 && (
        <View style={[s.tip, { borderColor: c.gasto, backgroundColor: '#ff5d6c1a' }]}>
          <Text style={{ color: c.text, flex: 1, lineHeight: 19 }}>
            ⚠️ Tu hoja usa una versión vieja del Apps Script: <Text style={{ fontWeight: '700' }}>los movimientos en USD/USDT no se guardan bien</Text>. Pegá el Code.gs nuevo y en
            Implementar → Administrar implementaciones → ✏️ editar elegí "Nueva versión". No uses "Nueva implementación": cambia la URL.
          </Text>
        </View>
      )}
      {error && (
        <Pressable onPress={() => { tap(); sincronizar(); }} style={[s.tip, { borderColor: c.gasto, backgroundColor: '#ff5d6c1a' }]}>
          <Text style={{ color: c.text, flex: 1, lineHeight: 19 }}>⚠️ {error}</Text>
          <Text style={{ color: c.accent, fontWeight: '700', marginLeft: 8 }}>{sincronizando ? '…' : 'Reintentar'}</Text>
        </Pressable>
      )}
      {pendientes.length > 0 && (
        <Text style={{ color: c.aviso, marginBottom: 8 }}>
          ⏳ {pendientes.length} cambio(s) todavía no llegaron a la hoja{sincronizando ? ' · subiendo…' : ''}
        </Text>
      )}
    </>
  );
};

const Pendiente = ({ id }: { id: string }) => {
  // Sin hoja conectada todo vive en el teléfono: no hay nada "sin subir"
  const enCola = useFinanzas((st) => !!st.url && st.pendientes.some((p) => p.kind === 'upsert' && p.m.id === id));
  return enCola ? <Text style={{ color: c.aviso, fontSize: 11 }}>⏳ sin subir</Text> : null;
};

export const Fila = ({ m, conFecha = true }: { m: Movimiento; conFecha?: boolean }) => (
  <Link href={{ pathname: '/nuevo', params: { id: m.id, fecha: m.fecha } }} asChild>
    {/* Estilo fijo: con Link asChild los estilos-función se pierden en web */}
    <Pressable style={s.fila} android_ripple={{ color: c.card2 }}>
      <Avatar categoria={m.categoria || (m.tipo === 'Ahorro' || m.tipo === 'Cambio' ? m.tipo : '')} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.titulo} numberOfLines={1}>{m.concepto}</Text>
        <Text style={s.sub} numberOfLines={1}>
          {[m.categoria || m.tipo, m.metodo].filter(Boolean).join(' · ')}
          {conFecha ? ` · ${fechaCorta(m.fecha)}` : ''}
          {m.cuotasTotales ? ` · cuota ${m.cuotasCumplidas ?? 0}/${m.cuotasTotales}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: colorValor(m), fontWeight: '700' }}>{money(m.valor, m.moneda)}</Text>
        {m.moneda !== 'ARS' && m.valorArs != null && <Text style={{ color: c.muted, fontSize: 11 }}>≈ {money(m.valorArs)}</Text>}
        <Pendiente id={m.id} />
      </View>
    </Pressable>
  </Link>
);

// Selector ARS / USD / USDT tipo "segmented control"
export const SelectorMoneda = ({ valor, onChange, chico = false }: { valor: Moneda; onChange: (m: Moneda) => void; chico?: boolean }) => (
  <View style={{ flexDirection: 'row', backgroundColor: c.card2, borderRadius: 12, padding: 3 }}>
    {MONEDAS.map((m) => (
      <Pressable key={m} onPress={() => { tap(); onChange(m); }} style={{ paddingHorizontal: chico ? 10 : 16, paddingVertical: chico ? 5 : 8, borderRadius: 9, backgroundColor: valor === m ? c.accent : 'transparent' }}>
        <Text style={{ color: valor === m ? '#fff' : c.muted, fontWeight: '700', fontSize: chico ? 12 : 14 }}>{m}</Text>
      </Pressable>
    ))}
  </View>
);

export const Fab = () => (
  <Link href="/nuevo" asChild>
    <Pressable onPressIn={() => tap(true)} style={s.fab} android_ripple={{ color: '#ffffff55', borderless: true }}>
      <Text style={{ color: '#fff', fontSize: 30, marginTop: -2 }}>+</Text>
    </Pressable>
  </Link>
);

export const s = StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: c.border, marginBottom: 12 },
  cardTitulo: { color: c.text, fontSize: 16, fontWeight: '700' },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  titulo: { color: c.text, fontSize: 15, fontWeight: '600' },
  sub: { color: c.muted, fontSize: 12, marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 10px ${c.accent}80` },
  h: { color: c.muted, fontSize: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  big: { color: c.text, fontSize: 34, fontWeight: '800' },
  mes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  mesTxt: { color: c.text, fontSize: 18, fontWeight: '700' },
  flechaBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
  flecha: { color: c.accent, fontSize: 28, lineHeight: 30, marginTop: -3 },
  tip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ff4fa31a', borderColor: '#ff4fa355', borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
});
