import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Link, router } from 'expo-router';
import { Children, Fragment, type ReactElement, isValidElement, useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { type Nivel, useFinanzas } from './store';
import { c, catInfo, PALETA, suave, TOQUE } from './theme';
import { Icono, ICONOS_CATEGORIA, iconoDe, type NombreIcono } from './iconos';
import { MONEDAS, type Moneda, type Movimiento } from './types';
import { diasDelMes, etiquetaMes, fechaCorta, hoyYmd, MESES, money, sumaMes } from './util';

// ---- Responsive (web en compu/tablet) ----
// escritorio: barra lateral y dos columnas; el contenido nunca se estira más que MAX.
export const MAX = 1560;
export const MAX_FORM = 680;
export const useLayout = () => {
  const { width } = useWindowDimensions();
  return { ancho: width, escritorio: width >= 900, tablet: width >= 600 };
};
export const centrado = (max = MAX) => ({ width: '100%', maxWidth: max, alignSelf: 'center' }) as const;

const aplanar = (n: React.ReactNode): React.ReactNode[] =>
  Children.toArray(n).flatMap((x) => (isValidElement(x) && x.type === Fragment ? aplanar((x.props as { children?: React.ReactNode }).children) : [x]));

// En pantallas anchas reparte los bloques en 2 columnas (3 si hay mucho ancho); en el celu, uno abajo del otro.
export const Columnas = ({ izq, der }: { izq: React.ReactNode; der: React.ReactNode }) => {
  const { ancho, escritorio } = useLayout();
  if (!escritorio) return <>{izq}{der}</>;
  const tres = ancho - 230 >= 1250;
  const cols: React.ReactNode[][] = tres ? [[], [], []] : [aplanar(izq), aplanar(der)];
  if (tres) {
    // reparte en 3 columnas parejas, manteniendo el orden de lectura (izquierda a derecha)
    const todos = [...aplanar(izq), ...aplanar(der)];
    const por = Math.ceil(todos.length / 3);
    todos.forEach((x, i) => cols[Math.min(2, Math.floor(i / por))].push(x));
  }
  return (
    <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
      {cols.map((col, i) => <View key={i} style={{ flex: 1, minWidth: 0 }}>{col}</View>)}
    </View>
  );
};

// ---- Tablero: tarjetas que se pueden reordenar y ocultar (se guarda en el dispositivo) ----
type BloqueProps = { id: string; nombre: string; children?: React.ReactNode };
export const Bloque = ({ children }: BloqueProps) => <>{children}</>;

type PrefTablero = { orden: string[]; ocultos: string[]; colum: Record<string, number> };
type Rect = { x: number; y: number; w: number; h: number };
const PREF0: PrefTablero = { orden: [], ocultos: [], colum: {} };

export const Tablero = ({ id, children, ocultosPorDefecto = [], ordenPorDefecto = [], unaColumna = false }: { id: string; children: React.ReactNode; ocultosPorDefecto?: string[]; ordenPorDefecto?: string[]; unaColumna?: boolean }) => {
  const { ancho, escritorio } = useLayout();
  const clave = `tablero:${id}`;
  const [pref, setPref] = useState<PrefTablero>({ ...PREF0, orden: ordenPorDefecto, ocultos: ocultosPorDefecto }); // sin preferencia guardada, se parte de una vista limpia
  const [editando, setEditando] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [destino, setDestino] = useState<{ col: number; idx: number } | null>(null);
  const desp = useRef(new Animated.ValueXY()).current;
  useEffect(() => {
    AsyncStorage.getItem(clave).then((v) => { if (v) setPref({ ...PREF0, ...JSON.parse(v) }); }).catch(() => {});
  }, [clave]);
  const guardar = (p: PrefTablero) => { setPref(p); AsyncStorage.setItem(clave, JSON.stringify(p)).catch(() => {}); };

  const bloques = aplanar(children).filter((x): x is ReactElement<BloqueProps> => isValidElement(x) && !!(x.props as BloqueProps).id);
  const pos = (b: ReactElement<BloqueProps>) => { const i = pref.orden.indexOf(b.props.id); return i < 0 ? 1e6 : i; };
  const ordenados = bloques.map((b, i) => ({ b, i })).sort((x, y) => pos(x.b) - pos(y.b) || x.i - y.i).map((x) => x.b);
  const visibles = editando ? ordenados : ordenados.filter((b) => !pref.ocultos.includes(b.props.id));

  const n = !escritorio || unaColumna ? 1 : ancho - 230 >= 1250 ? 3 : 2;
  const por = Math.max(1, Math.ceil(visibles.length / n));
  // cada tarjeta va en la columna que elegiste; las que no elegiste se reparten parejo
  const cols: ReactElement<BloqueProps>[][] = Array.from({ length: n }, () => []);
  visibles.forEach((b, i) => cols[Math.min(n - 1, pref.colum[b.props.id] ?? Math.floor(i / por))].push(b));

  // ---- arrastre ----
  const medidas = useRef<{ cols: Rect[]; cards: { id: string; col: number; r: Rect }[] }>({ cols: [], cards: [] });
  const refCols = useRef<(View | null)[]>([]);
  const refCards = useRef<Record<string, View | null>>({});
  const vivo = useRef({ cols, pref, ordenados, n });
  vivo.current = { cols, pref, ordenados, n };
  const pans = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});

  const medir = (v: View | null) => new Promise<Rect>((ok) => (v ? v.measureInWindow((x, y, w, h) => ok({ x, y, w, h })) : ok({ x: 0, y: 0, w: 0, h: 0 })));
  const calcular = (bid: string, mx: number, my: number) => {
    const { cols: cs, cards } = medidas.current;
    if (!cs.length) return null;
    let col = cs.findIndex((r) => mx >= r.x && mx <= r.x + r.w);
    if (col < 0) col = cs.reduce((best, r, i) => (Math.abs(mx - (r.x + r.w / 2)) < Math.abs(mx - (cs[best].x + cs[best].w / 2)) ? i : best), 0);
    const idx = cards.filter((k) => k.col === col && k.id !== bid && k.r.y + k.r.h / 2 < my).length;
    return { col, idx };
  };
  const panDe = (bid: string) => (pans.current[bid] ??= PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: async () => {
      tap(true);
      desp.setValue({ x: 0, y: 0 });
      setArrastrando(bid);
      const { cols: cs } = vivo.current;
      const rc = await Promise.all(refCols.current.slice(0, cs.length).map(medir));
      const cards: { id: string; col: number; r: Rect }[] = [];
      for (let ci = 0; ci < cs.length; ci++) for (const b of cs[ci]) cards.push({ id: b.props.id, col: ci, r: await medir(refCards.current[b.props.id] ?? null) });
      medidas.current = { cols: rc, cards };
    },
    onPanResponderMove: (_e, g) => {
      desp.setValue({ x: g.dx, y: g.dy });
      const d = calcular(bid, g.moveX, g.moveY);
      setDestino((prev) => (prev && d && prev.col === d.col && prev.idx === d.idx ? prev : d));
    },
    onPanResponderRelease: (_e, g) => {
      const d = calcular(bid, g.moveX, g.moveY);
      const { cols: cs, pref: pf, ordenados: ord } = vivo.current;
      if (d) {
        const nuevas = cs.map((col) => col.map((b) => b.props.id).filter((x) => x !== bid));
        nuevas[d.col].splice(d.idx, 0, bid);
        const colum: Record<string, number> = { ...pf.colum };
        nuevas.forEach((col, ci) => col.forEach((x) => { colum[x] = ci; }));
        const enOrden = nuevas.flat();
        const resto = ord.map((b) => b.props.id).filter((x) => !enOrden.includes(x)); // ocultas que no se ven en las columnas
        guardar({ ...pf, orden: [...enOrden, ...resto], colum });
      }
      setArrastrando(null); setDestino(null); desp.setValue({ x: 0, y: 0 });
    },
    onPanResponderTerminate: () => { setArrastrando(null); setDestino(null); desp.setValue({ x: 0, y: 0 }); },
  }));

  const alternar = (bid: string) => {
    tap();
    guardar({ ...pref, orden: ordenados.map((b) => b.props.id), ocultos: pref.ocultos.includes(bid) ? pref.ocultos.filter((x) => x !== bid) : [...pref.ocultos, bid] });
  };
  const boton = (txt: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: c.card }}>
      <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{txt}</Text>
    </Pressable>
  );
  const marca = <View style={{ height: 56, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: c.accent, backgroundColor: c.accent + '22', marginBottom: 12 }} />;

  const pintar = (b: ReactElement<BloqueProps>) => {
    if (!editando) return <View key={b.props.id}>{b}</View>;
    const bid = b.props.id;
    const oculto = pref.ocultos.includes(bid);
    const mueve = arrastrando === bid;
    return (
      <Animated.View
        key={bid}
        ref={(v) => { refCards.current[bid] = v as unknown as View | null; }}
        style={[{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent, borderRadius: 14, padding: 6, marginBottom: 12, backgroundColor: c.bg }, mueve && { zIndex: 50, opacity: 0.9, transform: desp.getTranslateTransform(), shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 12 }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <View {...panDe(bid).panHandlers} style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: c.accent + '33' }, { cursor: 'grab', userSelect: 'none', touchAction: 'none' } as object]}>
            <Text style={{ color: c.text, fontSize: 18 }}>⠿</Text>
            <Text style={{ color: c.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>{b.props.nombre}</Text>
          </View>
          {boton(oculto ? 'Mostrar' : 'Ocultar', () => alternar(bid))}
        </View>
        <View pointerEvents="none" style={{ opacity: oculto ? 0.35 : 1, maxHeight: 220, overflow: 'hidden' }}>{b}</View>
      </Animated.View>
    );
  };

  return (
    <>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        {editando && boton('↺ Restablecer', () => { tap(); guardar(PREF0); })}
        {boton(editando ? '✓ Listo' : 'Editar tarjetas', () => { tap(); setEditando((x) => !x); })}
      </View>
      {editando && <Text style={[s.sub, { marginBottom: 10 }]}>Agarrá una tarjeta de la barra ⠿ y soltala donde quieras: en otra columna o en otro lugar. Con “Ocultar” la sacás de la vista.</Text>}
      <View style={{ flexDirection: 'row', gap: 20, alignItems: editando ? 'stretch' : 'flex-start', zIndex: 1 }}>
        {cols.map((col, k) => (
          <View key={k} ref={(v) => { refCols.current[k] = v; }} style={{ flex: 1, minWidth: 0, minHeight: editando ? 120 : undefined }}>
            {col.flatMap((b, i) => {
              const marcar = destino && arrastrando && destino.col === k && destino.idx === col.filter((x) => x.props.id !== arrastrando).findIndex((x) => x === b) ? [<View key={`m${i}`}>{marca}</View>] : [];
              return [...marcar, pintar(b)];
            })}
            {destino && arrastrando && destino.col === k && destino.idx >= col.filter((x) => x.props.id !== arrastrando).length && marca}
          </View>
        ))}
      </View>
    </>
  );
};

// Vibración corta al tocar (no disponible en web: se ignora).
export const tap = (fuerte = false) => {
  (fuerte ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) : Haptics.selectionAsync()).catch(() => {});
};

export const colorValor = (m: Movimiento) => (m.tipo === 'Deuda' || m.tipo === 'Pago deuda' ? c.deuda : m.tipo === 'Transferencia' ? c.transferencia : m.tipo === 'Ingreso' || m.valor > 0 ? c.ingreso : m.tipo === 'Ahorro' ? c.ahorro : c.gasto);

export const Card = ({ children, style }: { children: React.ReactNode; style?: object }) => <View style={[s.card, style]}>{children}</View>;

export const Titulo = ({ t, sub }: { t: string; sub?: string }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={s.cardTitulo}>{t}</Text>
    {sub && <Text style={s.sub}>{sub}</Text>}
  </View>
);

// Encabezado de sección: título a la izquierda y, si hay, un enlace "Ver todo ›" a la derecha.
export const Seccion = ({ t, sub, accion, ruta }: { t: string; sub?: string; accion?: string; ruta?: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
    <View style={{ flex: 1 }}>
      <Text style={s.cardTitulo}>{t}</Text>
      {sub && <Text style={s.sub}>{sub}</Text>}
    </View>
    {accion && ruta && (
      <Link href={ruta as never} asChild>
        <Pressable onPress={() => tap()} hitSlop={10}><Text style={{ color: c.accent, fontWeight: '600', fontSize: 13 }}>{accion} ›</Text></Pressable>
      </Link>
    )}
  </View>
);

// Fila de accesos rápidos: botón redondo con ícono y nombre debajo (como la botonera de Binance).
export const Acciones = ({ items }: { items: { emoji: string; label: string; ruta: string }[] }) => {
  const { escritorio } = useLayout();
  const botones = items.map((a) => (
    <Link key={a.ruta} href={a.ruta as never} asChild>
      <Pressable onPress={() => tap()} style={{ width: escritorio ? 84 : 70, alignItems: 'center' }}>
        <View style={{ width: escritorio ? 56 : 48, height: escritorio ? 56 : 48, borderRadius: 28, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
          <Icono nombre={iconoDe(a.emoji)} color={c.text} size={escritorio ? 24 : 22} />
        </View>
        <Text style={{ color: c.muted, fontSize: escritorio ? 12 : 11, marginTop: 6, fontWeight: '500' }} numberOfLines={1}>{a.label}</Text>
      </Pressable>
    </Link>
  ));
  if (escritorio) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>{botones}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
      {botones}
    </ScrollView>
  );
};

// Variación en pastilla: verde si sube, roja si baja.
export const Pastilla = ({ texto, positivo }: { texto: string; positivo: boolean }) => (
  <View style={{ alignSelf: 'flex-start', backgroundColor: (positivo ? c.ingreso : c.gasto) + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
    <Text style={{ color: positivo ? c.ingreso : c.gasto, fontWeight: '600', fontSize: 12 }}>{texto}</Text>
  </View>
);

// Lista de accesos agrupada: ícono en baldosa de color, título, una línea que explica y flecha (estilo ajustes de una billetera).
export const MenuGrupo = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <View style={{ marginBottom: 16 }}>
    <Text style={[s.h, { marginLeft: 4, marginBottom: 8 }]}>{titulo}</Text>
    <View style={{ backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' }}>{children}</View>
  </View>
);

export const MenuItem = ({ emoji, color = c.accent, titulo, sub, ruta, onPress, ultimo = false }: { emoji: string; color?: string; titulo: string; sub?: string; ruta?: string; onPress?: () => void; ultimo?: boolean }) => {
  const fila = (
    <Pressable onPress={() => { tap(); onPress?.(); }} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: ultimo ? 0 : 1, borderBottomColor: c.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: color + '26', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <Icono nombre={iconoDe(emoji)} color={color} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.titulo}>{titulo}</Text>
        {sub && <Text style={s.sub} numberOfLines={2}>{sub}</Text>}
      </View>
      <View style={{ marginLeft: 8 }}><Icono nombre="adelante" color={c.muted} size={18} /></View>
    </Pressable>
  );
  return ruta ? <Link href={ruta as never} asChild>{fila}</Link> : fila;
};

export const Avatar = ({ categoria, size = 40 }: { categoria: string; size?: number }) => {
  const i = catInfo(categoria);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: i.color + '26', alignItems: 'center', justifyContent: 'center' }}>
      <Icono nombre={i.icono ?? 'tag'} color={i.color} size={Math.round(size * 0.55)} />
    </View>
  );
};

// ---- Componentes del sistema de diseño ----

// Botón principal. Texto oscuro sobre color (contraste AA); deshabilitado queda gris.
export const Boton = ({ titulo, onPress, color = c.accent, deshabilitado = false, variante = 'lleno', icono }: { titulo: string; onPress: () => void; color?: string; deshabilitado?: boolean; variante?: 'lleno' | 'borde'; icono?: NombreIcono }) => {
  const lleno = variante === 'lleno';
  const fg = deshabilitado ? c.muted : lleno ? c.sobre : c.text;
  return (
    <Pressable
      onPress={() => { if (deshabilitado) return; tap(true); onPress(); }}
      accessibilityRole="button"
      accessibilityState={{ disabled: deshabilitado }}
      style={({ pressed }) => ({ minHeight: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16,
        backgroundColor: deshabilitado ? c.card2 : lleno ? color : 'transparent', borderWidth: lleno ? 0 : 1, borderColor: lleno ? 'transparent' : deshabilitado ? c.border : color,
        transform: [{ scale: pressed && !deshabilitado ? 0.98 : 1 }] })}
    >
      {icono && <Icono nombre={icono} color={fg} size={20} grosor={2.4} />}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 16 }}>{titulo}</Text>
    </Pressable>
  );
};

// Barra fija abajo de la pantalla para la acción principal (Guardar), siempre a mano con el pulgar.
export const BarraAccion = ({ children }: { children: React.ReactNode }) => (
  <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.border }}>
    <View style={centrado(MAX_FORM)}>{children}</View>
  </View>
);

// Interruptor accesible en una fila con título y explicación.
export const Interruptor = ({ on, onPress, titulo, sub, color = c.accent }: { on: boolean; onPress: () => void; titulo: string; sub?: string; color?: string }) => (
  <Pressable onPress={() => { tap(); onPress(); }} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={titulo} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: 8, gap: 12 }}>
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.text, fontSize: 15, fontWeight: '500' }}>{titulo}</Text>
      {sub && <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{sub}</Text>}
    </View>
    <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: on ? color : c.border, justifyContent: 'center', paddingHorizontal: 3 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? c.sobre : '#ffffff', alignSelf: on ? 'flex-end' : 'flex-start' }} />
    </View>
  </Pressable>
);

// Hoja inferior: opciones secundarias (filtros, acciones de una fila) sin salir de la pantalla.
export const Hoja = ({ visible, onCerrar, titulo, children }: { visible: boolean; onCerrar: () => void; titulo: string; children: React.ReactNode }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
    <Pressable onPress={onCerrar} accessibilityLabel="Cerrar" style={{ flex: 1, backgroundColor: '#000000aa' }} />
    <View style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, maxHeight: '85%' }}>
      <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 8 }} />
      <View style={[{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }, centrado(MAX_FORM)]}>
        <Text style={{ color: c.text, fontSize: 17, fontWeight: '700', flex: 1 }}>{titulo}</Text>
        <Pressable onPress={onCerrar} accessibilityRole="button" accessibilityLabel="Cerrar" style={{ width: TOQUE, height: TOQUE, alignItems: 'center', justifyContent: 'center' }}>
          <Icono nombre="cerrar" color={c.muted} size={20} />
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={centrado(MAX_FORM)}>{children}</ScrollView>
    </View>
  </Modal>
);

// Control segmentado: opciones de un mismo grupo, una elegida. 44 px de alto.
export function Segmentado<T extends string>({ opciones, valor, onChange, color = c.accent, colorDe }: { opciones: { valor: T; label: string }[]; valor: T; onChange: (v: T) => void; color?: string; colorDe?: (v: T) => string }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, padding: 4, gap: 4, borderWidth: 1, borderColor: c.border }}>
      {opciones.map((o) => {
        const on = o.valor === valor;
        const col = colorDe ? colorDe(o.valor) : color;
        return (
          <Pressable key={o.valor} onPress={() => { tap(); onChange(o.valor); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
            style={{ flex: 1, minHeight: TOQUE, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, backgroundColor: on ? col : 'transparent' }}>
            <Text style={{ color: on ? c.sobre : c.muted, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Estado vacío: ícono, qué pasa y qué hacer.
export const Vacio = ({ icono = 'tag', color = c.accent, titulo, texto, accion, onPress }: { icono?: NombreIcono; color?: string; titulo: string; texto?: string; accion?: string; onPress?: () => void }) => (
  <View style={{ alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 8 }}>
    <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: suave(color), alignItems: 'center', justifyContent: 'center' }}>
      <Icono nombre={icono} color={color} size={30} />
    </View>
    <Text style={{ color: c.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>{titulo}</Text>
    {texto && <Text style={{ color: c.muted, fontSize: 15, lineHeight: 20, textAlign: 'center', maxWidth: 300 }}>{texto}</Text>}
    {accion && onPress && (
      <Pressable onPress={() => { tap(); onPress(); }} style={{ marginTop: 8, minHeight: 48, paddingHorizontal: 20, borderRadius: 14, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: c.sobre, fontWeight: '700', fontSize: 15 }}>{accion}</Text>
      </Pressable>
    )}
  </View>
);

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
      <View style={{ marginRight: 10 }}><Icono nombre={iconoDe(emoji)} color={c.accent} size={20} /></View>
      <Text style={{ color: c.text, flex: 1, lineHeight: 19 }}>{children}</Text>
      <Pressable onPress={() => { tap(); ocultarTip(id); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar consejo" style={{ marginLeft: 8 }}>
        <Icono nombre="cerrar" color={c.muted} size={18} />
      </Pressable>
    </View>
  );
};

export const Chip = ({ label, on, onPress, onLongPress, color = c.accent, icono }: { label: string; on: boolean; onPress: () => void; onLongPress?: () => void; color?: string; icono?: string }) => (
  <Pressable
    onPress={() => { tap(); onPress(); }}
    onLongPress={onLongPress}
    accessibilityRole="button"
    accessibilityState={{ selected: on }}
    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: on ? color : c.card2, marginRight: 8, marginBottom: 8 }}
  >
    {icono && <Icono nombre={icono} color={on ? c.sobre : c.muted} size={16} />}
    <Text style={{ color: on ? c.sobre : c.muted, fontWeight: on ? '700' : '500', fontSize: 13 }}>{label}</Text>
  </Pressable>
);

// Elegir el ícono y el color de una categoría (al crearla o desde Ajustes › Categorías).
export const SelectorEstilo = ({ icono, color, onIcono, onColor }: { icono: string; color: string; onIcono: (i: string) => void; onColor: (col: string) => void }) => (
  <View>
    <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>Ícono</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      {ICONOS_CATEGORIA.map((i) => (
        <Pressable key={i} onPress={() => { tap(); onIcono(i); }} accessibilityRole="radio" accessibilityState={{ selected: icono === i }} accessibilityLabel={`Ícono ${i}`}
          style={{ width: TOQUE, height: TOQUE, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: icono === i ? suave(color) : c.card2, borderWidth: 1.5, borderColor: icono === i ? color : 'transparent' }}>
          <Icono nombre={i} color={icono === i ? color : c.muted} size={22} />
        </Pressable>
      ))}
    </View>
    <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>Color</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      {PALETA.map((col) => (
        <Pressable key={col} onPress={() => { tap(); onColor(col); }} accessibilityRole="radio" accessibilityState={{ selected: color === col }} accessibilityLabel={`Color ${col}`}
          style={{ width: TOQUE, height: TOQUE, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color === col ? c.text : 'transparent' }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: col, alignItems: 'center', justifyContent: 'center' }}>
            {color === col && <Icono nombre="check" color={c.sobre} size={16} grosor={3} />}
          </View>
        </Pressable>
      ))}
    </View>
  </View>
);

// Chip "+ Nueva" que se abre en un campo para escribir una categoría; al confirmar la agrega y la elige.
export const NuevaCategoria = ({ nivel, onCreada }: { nivel: Nivel; onCreada?: (nombre: string) => void }) => {
  const agregar = useFinanzas((st) => st.agregarCategoria);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const setEstilo = useFinanzas((st) => st.setEstiloCategoria);
  const [icono, setIcono] = useState('tag');
  const [color, setColor] = useState<string>(PALETA[0]);
  const confirmar = () => {
    const n = texto.trim();
    if (n) { tap(); agregar(nivel, n); if (nivel === 'cat') setEstilo(n, { icono, color }); onCreada?.(n); }
    setTexto('');
    setAbierto(false);
  };
  if (!abierto) return <Chip label="Nueva" icono="mas" on={false} onPress={() => setAbierto(true)} />;
  return (
    <View style={{ flexBasis: '100%', marginBottom: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
      <TextInput
        autoFocus
        style={{ flex: 1, backgroundColor: c.card, color: c.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: c.accent }}
        placeholder="Nombre de la categoría"
        placeholderTextColor={c.muted}
        value={texto}
        onChangeText={setTexto}
        returnKeyType="done"
        onSubmitEditing={confirmar}
      />
      <Pressable onPress={confirmar} accessibilityRole="button" style={{ backgroundColor: c.accent, borderRadius: 12, paddingHorizontal: 14, minHeight: TOQUE, justifyContent: 'center' }}>
        <Text style={{ color: c.sobre, fontWeight: '700' }}>Agregar</Text>
      </Pressable>
    </View>
    {nivel === 'cat' && <SelectorEstilo icono={icono} color={color} onIcono={setIcono} onColor={setColor} />}
    </View>
  );
};

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

// Evita que el teclado tape los campos en móvil (sobre todo los del final del formulario).
export const PantallaTeclado = ({ children }: { children: React.ReactNode }) => (
  <KeyboardAvoidingView
    style={{ flex: 1, backgroundColor: c.bg }}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
  >
    {children}
  </KeyboardAvoidingView>
);

const p2 = (n: number) => String(n).padStart(2, '0');
const ymDe = (f: string) => `${f.slice(0, 4)}-${f.slice(5, 7)}`;
const inicioSemana = (ym: string) => new Date(+ym.slice(0, 4), +ym.slice(5) - 1, 1).getDay();

type SelectorFechaProps = {
  valor: string;
  onChange: (fecha: string) => void;
  etiqueta?: string;
  onOpen?: () => void;
};

// Selector visual de fecha para evitar escribir "AAAA-MM-DD".
export const SelectorFecha = ({ valor, onChange, etiqueta = 'Fecha', onOpen }: SelectorFechaProps) => {
  const [abierto, setAbierto] = useState(false);
  const [ym, setYm] = useState(ymDe(valor));
  useEffect(() => setYm(ymDe(valor)), [valor]);
  const dias = diasDelMes(ym);
  const offset = inicioSemana(ym);
  const celdas = [...Array(offset).fill(0), ...Array.from({ length: dias }, (_, i) => i + 1)];
  const elegir = (d: number) => {
    tap();
    onChange(`${ym}-${p2(d)}`);
    setAbierto(false);
  };
  return (
    <View style={{ marginTop: 4, marginBottom: 8 }}>
      <Text style={s.sub}>{etiqueta}</Text>
      <Pressable
        onPress={() => { tap(); onOpen?.(); setAbierto((x) => !x); }}
        style={{ backgroundColor: c.card2, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: c.border, marginTop: 6 }}
      >
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{fechaCorta(valor)}</Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>{valor} · tocar para elegir en calendario</Text>
      </Pressable>
      {abierto && (
        <View style={{ backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 10, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Pressable onPress={() => { tap(); setYm((m) => sumaMes(m, -1)); }} style={s.flechaBtn}><Text style={s.flecha}>‹</Text></Pressable>
            <Text style={{ color: c.text, fontWeight: '700' }}>{MESES[+ym.slice(5) - 1]} {ym.slice(0, 4)}</Text>
            <Pressable onPress={() => { tap(); setYm((m) => sumaMes(m, 1)); }} style={s.flechaBtn}><Text style={s.flecha}>›</Text></Pressable>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => <Text key={`${d}${i}`} style={{ flex: 1, textAlign: 'center', color: c.muted, fontSize: 12 }}>{d}</Text>)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {celdas.map((d, i) => {
              if (!d) return <View key={`x${i}`} style={{ width: '14.2857%', padding: 2 }} />;
              const f = `${ym}-${p2(d)}`;
              const on = f === valor;
              return (
                <View key={f} style={{ width: '14.2857%', padding: 2 }}>
                  <Pressable onPress={() => elegir(d)} style={{ borderRadius: 8, paddingVertical: 9, alignItems: 'center', backgroundColor: on ? c.accent : c.card2 }}>
                    <Text style={{ color: on ? c.sobre : c.text, fontWeight: on ? '700' : '500' }}>{d}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
};

// Estado de la sincronización con la hoja: script desactualizado, error (con reintento) y cambios en cola.
export const EstadoSync = () => {
  const { url, nubeUid, versionScript, error, pendientes, sincronizando, sincronizar } = useFinanzas();
  if (!url && !nubeUid) return null;
  return (
    <>
      {!nubeUid && versionScript !== null && versionScript < 4 && (
        <View style={[s.tip, { borderColor: c.gasto, backgroundColor: '#ff5d6c1a' }]}>
          <Text style={{ color: c.text, flex: 1, lineHeight: 19 }}>
            Tu hoja usa una versión vieja del Apps Script: <Text style={{ fontWeight: '700' }}>los movimientos en USD/USDT no se guardan bien</Text>. Pegá el Code.gs nuevo y en
            Implementar → Administrar implementaciones → editar elegí "Nueva versión". No uses "Nueva implementación": cambia la URL.
          </Text>
        </View>
      )}
      {!!error && (
        <Pressable onPress={() => { tap(); sincronizar(); }} style={[s.tip, { borderColor: c.gasto, backgroundColor: '#ff5d6c1a' }]}>
          <Text style={{ color: c.text, flex: 1, lineHeight: 19 }}>{error}</Text>
          <Text style={{ color: c.accent, fontWeight: '700', marginLeft: 8 }}>{sincronizando ? '…' : 'Reintentar'}</Text>
        </Pressable>
      )}
      {pendientes.length > 0 && (
        <Text style={{ color: c.aviso, marginBottom: 8 }}>
          {pendientes.length} cambio(s) todavía no llegaron a {nubeUid ? 'la nube' : 'la hoja'}{sincronizando ? ' · subiendo…' : ''}
        </Text>
      )}
    </>
  );
};

const Pendiente = ({ id }: { id: string }) => {
  // Sin hoja conectada todo vive en el teléfono: no hay nada "sin subir"
  const enCola = useFinanzas((st) => (!!st.url || !!st.nubeUid) && st.pendientes.some((p) => p.kind === 'upsert' && p.m.id === id));
  return enCola ? <Text style={{ color: c.aviso, fontSize: 11 }}>sin subir</Text> : null;
};

// "Mercado Pago → Naranja X" para una transferencia; el método para el resto
const useCuentasDe = (m: Movimiento) => {
  const cuentas = useFinanzas((st) => st.cuentas);
  if (m.tipo !== 'Transferencia') return m.metodo;
  const nombre = (id?: string | null) => cuentas.find((x) => x.id === id)?.nombre ?? '?';
  return `${m.cuentaId ? nombre(m.cuentaId) : m.metodo || '?'} → ${nombre(m.cuentaDestinoId)}`;
};

export const Fila = ({ m, conFecha = true }: { m: Movimiento; conFecha?: boolean }) => {
  const donde = useCuentasDe(m);
  const programado = m.fecha > hoyYmd() && (m.tipo === 'Ingreso' || m.tipo === 'Egreso' || m.tipo === 'Ahorro'); // fecha futura: todavía no ocurrió
  const planificado = useFinanzas((st) => st.planificados.some((p) => p.movimientoId === m.id)); // este movimiento cumplió algo que habías planificado
  return (
  <Link href={{ pathname: '/nuevo', params: { id: m.id, fecha: m.fecha } }} asChild>
    {/* Estilo fijo: con Link asChild los estilos-función se pierden en web */}
    <Pressable style={s.fila} android_ripple={{ color: c.card2 }}>
      <Avatar categoria={m.categoria || (m.tipo === 'Ahorro' || m.tipo === 'Cambio' ? m.tipo : m.tipo === 'Transferencia' ? 'Transferencia' : m.tipo === 'Deuda' || m.tipo === 'Pago deuda' ? 'Deuda' : '')} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.titulo} numberOfLines={1}>{m.concepto}{planificado ? ' · planificado' : ''}{programado ? ' · programado' : ''}</Text>
        <Text style={s.sub} numberOfLines={1}>
          {programado ? `Programado para el ${fechaCorta(m.fecha)} · ` : planificado ? 'Planificado · ' : ''}{[m.categoria || m.tipo, donde].filter(Boolean).join(' · ')}
          {conFecha ? ` · ${fechaCorta(m.fecha)}` : ''}
          {m.hora ? ` · ${m.hora}` : ''}
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
};

// Selector ARS / USD / USDT tipo "segmented control"
export const SelectorMoneda = ({ valor, onChange, chico = false }: { valor: Moneda; onChange: (m: Moneda) => void; chico?: boolean }) => (
  <View style={{ flexDirection: 'row', backgroundColor: c.card2, borderRadius: 10, padding: 3, gap: 2 }}>
    {MONEDAS.map((m) => (
      <Pressable key={m} onPress={() => { tap(); onChange(m); }} style={{ paddingHorizontal: chico ? 12 : 16, minHeight: chico ? 36 : TOQUE, justifyContent: 'center', borderRadius: 8, backgroundColor: valor === m ? c.accent : 'transparent' }}>
        <Text style={{ color: valor === m ? c.sobre : c.muted, fontWeight: '700', fontSize: chico ? 12 : 14 }}>{m}</Text>
      </Pressable>
    ))}
  </View>
);

// El color va en un View propio: en Android el Link con asChild no siempre pasaba el fondo al botón.
export const Fab = () => {
  const { ancho, escritorio } = useLayout();
  // en compu: el botón queda dentro de la columna de contenido (junto a la barra lateral), no pegado al borde
  const right = escritorio ? Math.max(20, (ancho - 230 - MAX) / 2 + 20) : 20;
  return (
  <View style={[s.fab, { right }]}>
    <Pressable onPress={() => { tap(true); router.push('/nuevo'); }} style={s.fabBtn} android_ripple={{ color: '#ffffff55' }}>
      <Icono nombre="mas" color={c.sobre} size={28} grosor={2.6} />
    </Pressable>
  </View>
  );
};

export const s = StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.card, marginBottom: 12 }, // el borde es del color del fondo: las alertas lo pintan con su color
  cardTitulo: { color: c.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  titulo: { color: c.text, fontSize: 15, fontWeight: '600' },
  sub: { color: c.muted, fontSize: 12, marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 16, backgroundColor: c.accent, overflow: 'hidden', elevation: 6, shadowColor: c.accent, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent },
  h: { color: c.muted, fontSize: 12, marginBottom: 4, fontWeight: '500' },
  big: { color: c.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  mes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  mesTxt: { color: c.text, fontSize: 17, fontWeight: '700' },
  flechaBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' },
  flecha: { color: c.accent, fontSize: 28, lineHeight: 30, marginTop: -3 },
  tip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ff4fa31a', borderColor: '#ff4fa355', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
});
