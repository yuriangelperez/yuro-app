import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, confirmar } from '../src/alerta';
import { convertir, useCategorias, useFinanzas } from '../src/store';
import { METODOS, c, catInfo, metInfo } from '../src/theme';
import type { Moneda, Movimiento, Tipo } from '../src/types';
import { centrado, Chip, MAX_FORM, NuevaCategoria, SelectorMoneda, tap } from '../src/ui';
import { horaAhora, hoyYmd, money, ymdMenos } from '../src/util';

const Etiqueta = ({ t }: { t: string }) => <Text style={{ color: c.muted, fontSize: 12, marginBottom: 8, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t}</Text>;
const Grupo = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>{children}</View>;

// Valores de la hoja + los que ya uses, sin repetir
const unir = (base: string[], usados: string[]) => [...new Set([...base, ...usados.filter(Boolean)])];

const TIPOS: { t: Tipo; label: string; color: string }[] = [
  { t: 'Egreso', label: '⬇️ Gasto', color: c.gasto },
  { t: 'Ingreso', label: '⬆️ Ingreso', color: c.ingreso },
  { t: 'Ahorro', label: '🐷 Ahorro', color: c.ahorro },
  { t: 'Cambio', label: '🔄 Cambio', color: '#5dade2' },
];
const AYUDA: Record<Tipo, string> = {
  Egreso: 'Plata que sale: compras, cuentas, cuotas.',
  Ingreso: 'Plata que entra: sueldo, ventas, devoluciones.',
  Ahorro: 'Plata que separás para no gastarla. Se descuenta de tu dinero libre.',
  Cambio: 'Compra o venta de moneda: entregás una moneda y recibís otra. No cuenta como gasto ni ingreso.',
};

// ---- Calculadora ----
// La expresión usa coma decimal y "+"/"−" (ej. "1500+2300,5").
const evaluar = (expr: string) =>
  (expr.replace(/−/g, '-').match(/[+-]?[^+-]+/g) ?? []).reduce((a, t) => a + (parseFloat(t.replace(',', '.')) || 0), 0);
const conMiles = (expr: string) => expr.replace(/\d+/g, (d, i, str) => (str[i - 1] === ',' ? d : d.replace(/\B(?=(\d{3})+(?!\d))/g, '.')));
const aExpr = (n: number) => (n ? String(Math.round(n * 100) / 100).replace('.', ',') : '');

const TECLAS = [['7', '8', '9', '⌫'], ['4', '5', '6', '+'], ['1', '2', '3', '−'], [',', '0', '000', '=']];

const pulsar = (expr: string, k: string) => {
  const ultimo = expr.slice(-1);
  const esOp = (x: string) => x === '+' || x === '−';
  if (k === '⌫') return expr.slice(0, -1);
  if (k === '=') return aExpr(Math.max(0, evaluar(expr)));
  if (esOp(k)) return !expr ? expr : esOp(ultimo) ? expr.slice(0, -1) + k : expr + k;
  const numero = expr.split(/[+−]/).pop() ?? '';
  if (k === ',') return numero.includes(',') ? expr : expr + (numero ? ',' : '0,');
  if (numero.includes(',') && numero.split(',')[1].length >= 2) return expr; // máximo 2 decimales
  if (!numero && k === '000') return expr + '0';
  if (numero === '0' && k !== ',') return expr.slice(0, -1) + (k === '000' ? '0' : k);
  return expr + k;
};

const Teclado = ({ onKey, onLimpiar }: { onKey: (k: string) => void; onLimpiar: () => void }) => (
  <View style={{ marginBottom: 12 }}>
    {TECLAS.map((fila) => (
      <View key={fila.join()} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        {fila.map((k) => {
          const especial = '⌫+−='.includes(k);
          return (
            <Pressable
              key={k}
              onPress={() => { tap(); onKey(k); }}
              onLongPress={k === '⌫' ? () => { tap(true); onLimpiar(); } : undefined}
              style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.border : especial ? c.card2 : c.card, borderWidth: 1, borderColor: c.border })}
            >
              <Text style={{ color: k === '=' ? c.accent : c.text, fontSize: 22, fontWeight: especial ? '700' : '500' }}>{k}</Text>
            </Pressable>
          );
        })}
      </View>
    ))}
    <Text style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>Podés sumar y restar (ej. 1500+2300). Mantené ⌫ para borrar todo.</Text>
  </View>
);

const Monto = ({ expr, moneda, color, activo, onPress, titulo, nota }: { expr: string; moneda: Moneda; color: string; activo: boolean; onPress: () => void; titulo?: string; nota?: string }) => {
  const tieneOp = /[+−]/.test(expr.slice(1));
  return (
    <Pressable onPress={() => { tap(); onPress(); }} style={{ backgroundColor: c.card, borderRadius: 16, padding: 14, borderWidth: 2, borderColor: activo ? color : c.border, marginBottom: 10 }}>
      {titulo && <Text style={{ color: c.muted, fontSize: 12, marginBottom: 2 }}>{titulo}</Text>}
      <Text style={{ color: expr ? color : c.muted, fontSize: tieneOp ? 22 : 34, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>
        {expr ? `${moneda === 'ARS' ? '$' : moneda + ' '}${conMiles(expr)}` : `${moneda === 'ARS' ? '$' : moneda + ' '}0`}
      </Text>
      {tieneOp && <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>= {money(evaluar(expr), moneda)}</Text>}
      {nota && <Text style={{ color: c.muted, fontSize: 11, marginTop: 2 }}>{nota}</Text>}
    </Pressable>
  );
};

export default function Nuevo() {
  const { id, fecha: fechaParam } = useLocalSearchParams<{ id?: string; fecha?: string }>();
  const porAnio = useFinanzas((s) => s.porAnio);
  const { guardar, eliminar, cotizaciones } = useFinanzas();
  const todos = useMemo(() => Object.values(porAnio).flat(), [porAnio]);
  const previo = id ? (porAnio[(fechaParam ?? '').slice(0, 4)] ?? todos).find((m) => m.id === id) : undefined;

  const [tipo, setTipo] = useState<Tipo>(previo?.tipo ?? 'Egreso');
  const [expr, setExpr] = useState(previo ? aExpr(Math.abs(previo.valor)) : '');
  const [moneda, setMoneda] = useState<Moneda>(previo?.moneda ?? 'ARS');
  const [expr2, setExpr2] = useState(''); // lo que recibís en un cambio
  const [moneda2, setMoneda2] = useState<Moneda>('USD');
  const [auto, setAuto] = useState<'a' | 'b' | null>(null); // en un cambio, el monto que se calcula solo con la cotización
  const [entradaArs, setEntradaArs] = useState<boolean | null>(null); // escribir el monto en pesos aunque la moneda sea USD/USDT
  const [desdePesos, setDesdePesos] = useState(true); // ahorro en USD/USDT pagado con pesos: registra también el cambio
  const [repetir, setRepetir] = useState(false); // crear un recurrente con este movimiento
  const { recurrentes, guardarRecurrente } = useFinanzas();
  const yaRecurrente = previo && recurrentes.find((r) => r.tipo === previo.tipo && r.concepto.trim().toLowerCase() === previo.concepto.trim().toLowerCase());
  const [campo, setCampo] = useState<'a' | 'b' | null>(previo ? null : 'a'); // monto con el teclado abierto
  const [concepto, setConcepto] = useState(previo?.concepto ?? '');
  const [metodo, setMetodo] = useState(previo?.metodo ?? 'Efectivo');
  const [categoria, setCategoria] = useState(previo?.categoria ?? '');
  const [categoria2, setCategoria2] = useState(previo?.categoria2 ?? '');
  const [fecha, setFecha] = useState(previo?.fecha ?? hoyYmd());
  const [cumplidas, setCumplidas] = useState(previo?.cuotasCumplidas != null ? String(previo.cuotasCumplidas) : '');
  const [totales, setTotales] = useState(previo?.cuotasTotales != null ? String(previo.cuotasTotales) : '');

  const metodos = useMemo(() => unir(METODOS, todos.map((m) => m.metodo)), [todos]);
  // La elegida se muestra aunque la hayas borrado de la lista (ej. al editar un movimiento viejo)
  const listaCat = useCategorias('cat');
  const listaCat2 = useCategorias('cat2');
  const categorias = useMemo(() => unir(listaCat, [previo?.categoria ?? '']), [listaCat, previo]);
  const categorias2 = useMemo(() => unir(listaCat2, [previo?.categoria2 ?? '']), [listaCat2, previo]);
  const borrarCategoria = useFinanzas((st) => st.borrarCategoria);
  const onBorrarCategoria = async (nivel: 'cat' | 'cat2', x: string) => {
    tap(true);
    if (!(await confirmar('¿Borrar categoría?', `"${x}" deja de aparecer en la lista. Los movimientos que ya la usan no cambian.`, 'Borrar'))) return;
    borrarCategoria(nivel, x);
    if (nivel === 'cat' && categoria === x) setCategoria('');
    if (nivel === 'cat2' && categoria2 === x) setCategoria2('');
  };
  const color = TIPOS.find((x) => x.t === tipo)!.color;
  const cambioDoble = tipo === 'Cambio' && !previo; // un cambio nuevo carga las dos monedas
  const sinTildes = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Habilita las cuotas: método de crédito (con o sin tilde), categoría "Cuota" o un movimiento que ya tenía cuotas.
  const credito = sinTildes(metodo).includes('credito') || sinTildes(categoria) === 'cuota' || !!previo?.cuotasTotales;
  const input = { backgroundColor: c.card, color: c.text, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: c.border } as const;

  // Sugerencias: conceptos que ya usaste (los más frecuentes, o los que coinciden con lo que escribís)
  const sugerencias = useMemo(() => {
    if (previo) return [];
    const q = concepto.trim().toLowerCase();
    const cuenta = new Map<string, { n: number; m: Movimiento }>();
    for (const m of todos) {
      if (m.tipo !== tipo || !m.concepto) continue;
      if (q && (!m.concepto.toLowerCase().includes(q) || m.concepto.toLowerCase() === q)) continue;
      const k = m.concepto.toLowerCase();
      const prev = cuenta.get(k);
      cuenta.set(k, { n: (prev?.n ?? 0) + 1, m: !prev || m.fecha > prev.m.fecha ? m : prev.m });
    }
    return [...cuenta.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((x) => x.m);
  }, [todos, concepto, tipo, previo]);

  const usarSugerencia = (m: Movimiento) => {
    tap();
    setConcepto(m.concepto);
    setCategoria(m.categoria);
    setCategoria2(m.categoria2);
    setMetodo(m.metodo);
    setMoneda(m.moneda);
    if (!expr) {
      setExpr(aExpr(Math.abs(m.valor)));
      if (m.moneda !== 'ARS') setEntradaArs(false); // el monto sugerido viene en su moneda, no en pesos
    }
  };

  const a = evaluar(expr);
  const b = evaluar(expr2);
  // Monto escrito en pesos y convertido a la moneda elegida (por defecto en ahorros nuevos en USD/USDT)
  const enArs = moneda !== 'ARS' && !cambioDoble && (entradaArs ?? (tipo === 'Ahorro' && !previo));
  const convertido = enArs ? convertir(a, 'ARS', moneda, cotizaciones) : null;
  const ahorroConPesos = tipo === 'Ahorro' && moneda !== 'ARS' && !previo && desdePesos;
  const puedeRepetir = tipo !== 'Cambio' && !ahorroConPesos && !(credito && totales) && !yaRecurrente;
  // Cotización implícita del cambio: cuántas unidades de la moneda "fuerte" por 1
  const tasa = cambioDoble && a > 0 && b > 0 && moneda !== moneda2
    ? moneda === 'ARS' ? `1 ${moneda2} = ${money(a / b)}` : moneda2 === 'ARS' ? `1 ${moneda} = ${money(b / a)}` : `1 ${moneda} = ${(b / a).toFixed(4).replace('.', ',')} ${moneda2}`
    : null;
  const ref = cambioDoble && moneda !== moneda2 ? (moneda === 'ARS' ? cotizaciones[moneda2 as 'USD' | 'USDT'] : moneda2 === 'ARS' ? cotizaciones[moneda as 'USD' | 'USDT'] : 0) : 0;

  // Se guarda local al instante y la hoja se sincroniza en segundo plano: se cierra enseguida
  // y un doble toque no crea duplicados.
  const [enviado, setEnviado] = useState(false);
  // Equivalente en pesos para la columna C de la hoja. Al editar se mantiene la cotización con la que se cargó.
  const enPesos = (valor: number, mon: Moneda) => {
    if (mon === 'ARS') return valor;
    const tasa = previo && previo.moneda === mon && previo.valorArs && previo.valor ? previo.valorArs / previo.valor : convertir(1, mon, 'ARS', cotizaciones);
    return tasa === null ? null : Math.round(valor * tasa * 100) / 100; // null: la hoja lo convierte con la cotización de hoy
  };

  const onGuardar = () => {
    if (enviado) return;
    if (!(a > 0)) return avisar('Ingresá un valor válido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return avisar('Fecha con formato AAAA-MM-DD');
    if (cambioDoble) {
      if (!(b > 0)) return avisar('Ingresá cuánto recibiste');
      if (moneda === moneda2) return avisar('Elegí dos monedas distintas');
      const comun = { fecha, tipo: 'Cambio' as Tipo, metodo, categoria, categoria2, cuotasCumplidas: null, cuotasTotales: null };
      const nombre = concepto.trim() || `Cambio ${moneda} → ${moneda2}`;
      tap(true);
      setEnviado(true);
      // Con pesos de por medio se usa lo que realmente pagaste/recibiste, así en la hoja las dos filas se compensan.
      const arsA = moneda === 'ARS' ? -a : moneda2 === 'ARS' ? -b : enPesos(-a, moneda);
      const arsB = moneda2 === 'ARS' ? b : moneda === 'ARS' ? a : enPesos(b, moneda2);
      guardar({ ...comun, concepto: nombre, valor: -a, moneda, valorArs: arsA }, { ...comun, concepto: nombre, valor: b, moneda: moneda2, valorArs: arsB });
      return router.back();
    }
    if (!concepto.trim()) return avisar('Ingresá un concepto');
    if (enArs && !convertido) return avisar(`Falta la cotización de ${moneda}: cargala en Ajustes o escribí el monto en ${moneda}`);
    // Como en tu hoja: ingresos en positivo; egresos y ahorros en negativo. "Cambio" conserva su signo.
    const signo = tipo === 'Ingreso' ? 1 : tipo === 'Cambio' ? Math.sign(previo?.valor ?? -1) || -1 : -1;
    const monto = Math.round((enArs ? convertido! : a) * 100) / 100; // en la moneda del movimiento
    const valor = signo * monto;
    const pesos = enArs ? signo * Math.round(a * 100) / 100 : enPesos(valor, moneda); // columna C de la hoja
    if (ahorroConPesos && pesos === null) return avisar(`Falta la cotización de ${moneda}: cargala en Ajustes`);
    tap(true);
    setEnviado(true);
    const mov = {
      id: previo?.id, fecha, hora: previo?.hora ?? horaAhora(), concepto: concepto.trim(), valor, valorArs: pesos, tipo, metodo, categoria, categoria2, moneda,
      cuotasCumplidas: credito && cumplidas ? +cumplidas : null,
      cuotasTotales: credito && totales ? +totales : null,
    };
    if (ahorroConPesos) {
      // Los pesos salen de tu billetera en ARS y el ahorro queda en USD/USDT: cambio ARS → moneda + ahorro.
      const ars = Math.abs(pesos!);
      const cambio = { fecha, hora: mov.hora, tipo: 'Cambio' as Tipo, concepto: `Cambio ARS → ${moneda} (${concepto.trim()})`, metodo, categoria: '', categoria2, cuotasCumplidas: null, cuotasTotales: null };
      guardar({ ...cambio, valor: -ars, moneda: 'ARS', valorArs: -ars }, { ...cambio, valor: monto, moneda, valorArs: ars }, mov);
    } else guardar(mov);
    if (repetir && puedeRepetir) {
      // Este mes ya queda cargado con este movimiento; desde el próximo se carga solo el mismo día
      guardarRecurrente({
        concepto: mov.concepto, valor, moneda, tipo: tipo as 'Ingreso' | 'Egreso' | 'Ahorro', metodo, categoria, categoria2,
        dia: +fecha.slice(8), desde: fecha.slice(0, 7), activo: true, ultimoYm: fecha.slice(0, 7),
      });
    }
    router.back();
  };

  const onEliminar = async () => {
    if (enviado || !previo) return;
    if (!(await confirmar('¿Eliminar movimiento?', `"${previo.concepto}" se borrará también de la hoja.`, 'Eliminar'))) return;
    tap(true);
    setEnviado(true);
    eliminar(previo);
    router.back();
  };

  const setActivo = campo === 'b' ? setExpr2 : setExpr;

  // Cambio: al escribir un monto, el otro se completa con la cotización del día (si está vacío o ya era automático).
  // Si escribís en el automático, pasa a ser tuyo y no se recalcula más.
  const onKey = (k: string) => {
    const pisar = cambioDoble && auto === campo; // el número calculado se reemplaza, no se le agregan dígitos
    setActivo((e) => pulsar(pisar && k !== '⌫' ? '' : e, k));
    if (!cambioDoble || !campo) return;
    const otro = campo === 'a' ? 'b' : 'a';
    if (auto === campo) setAuto(null);
    else if (auto === otro || !(otro === 'a' ? expr : expr2)) setAuto(otro);
  };
  useEffect(() => {
    if (!cambioDoble || !auto) return;
    const [src, de, a2] = auto === 'b' ? [expr, moneda, moneda2] : [expr2, moneda2, moneda];
    const v = convertir(evaluar(src), de, a2, cotizaciones);
    const texto = v && v > 0 ? aExpr(a2 === 'ARS' ? Math.round(v) : Math.round(v * 100) / 100) : '';
    (auto === 'b' ? setExpr2 : setExpr)(texto);
  }, [cambioDoble, auto, expr, expr2, moneda, moneda2, cotizaciones]);
  const notaAuto = 'Calculado con la cotización de hoy · tocá para poner lo que pagaste'

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      {/* Tipo */}
      <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, padding: 4, marginBottom: 6 }}>
        {TIPOS.filter((x) => x.t !== 'Cambio' || !previo || previo.tipo === 'Cambio').map((x) => (
          <Pressable key={x.t} onPress={() => { tap(); setTipo(x.t); }} style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: tipo === x.t ? x.color : 'transparent' }}>
            <Text style={{ color: tipo === x.t ? '#fff' : c.muted, fontWeight: '700', fontSize: 13 }}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: c.muted, fontSize: 12, marginBottom: 12, marginLeft: 4 }}>{AYUDA[tipo]}</Text>

      {/* Monto(s) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: c.muted, fontSize: 12, textTransform: 'uppercase' }}>{cambioDoble ? 'Entregás' : 'Moneda'}</Text>
        <SelectorMoneda valor={moneda} onChange={setMoneda} chico />
      </View>
      {moneda !== 'ARS' && !cambioDoble && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: c.muted, fontSize: 12, marginRight: 8 }}>Escribir el monto en</Text>
          <Chip label="$ Pesos" on={enArs} onPress={() => { setEntradaArs(true); setExpr(''); }} />
          <Chip label={moneda} on={!enArs} onPress={() => { setEntradaArs(false); setExpr(''); }} />
        </View>
      )}
      <Monto
        expr={expr}
        moneda={enArs ? 'ARS' : moneda}
        color={cambioDoble ? c.gasto : color}
        activo={campo === 'a'}
        onPress={() => setCampo(campo === 'a' ? null : 'a')}
        nota={
          cambioDoble ? (auto === 'a' && expr ? notaAuto : undefined)
          : enArs && a > 0 ? (convertido ? `= ${money(convertido, moneda)} con la cotización de hoy` : `Falta la cotización de ${moneda}`)
          : undefined
        }
      />
      {tipo === 'Ahorro' && moneda !== 'ARS' && !previo && (
        <View style={{ backgroundColor: c.card, borderRadius: 14, padding: 12, marginBottom: 10 }}>
          <Text style={{ color: c.muted, fontSize: 12, marginBottom: 8 }}>¿Con qué plata ahorrás?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip label={`💱 Con pesos`} on={desdePesos} color={c.ahorro} onPress={() => setDesdePesos(true)} />
            <Chip label={`🪙 Con ${moneda} que ya tenía`} on={!desdePesos} color={c.ahorro} onPress={() => setDesdePesos(false)} />
          </View>
          <Text style={{ color: c.muted, fontSize: 11 }}>
            {desdePesos
              ? `Se registra el cambio ARS → ${moneda} y el ahorro: tus pesos bajan y tu ahorro en ${moneda} sube.`
              : `Solo pasa ${moneda} de disponible a ahorrado.`}
          </Text>
        </View>
      )}
      {cambioDoble && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: c.muted, fontSize: 12, textTransform: 'uppercase' }}>Recibís</Text>
            <SelectorMoneda valor={moneda2} onChange={setMoneda2} chico />
          </View>
          <Monto expr={expr2} moneda={moneda2} color={c.ingreso} activo={campo === 'b'} onPress={() => setCampo(campo === 'b' ? null : 'b')} nota={auto === 'b' && expr2 ? notaAuto : undefined} />
          {tasa && (
            <Text style={{ color: c.text, marginBottom: 10, marginLeft: 4 }}>
              💱 Te salió a {tasa}
              {ref > 0 && <Text style={{ color: c.muted }}> (referencia hoy {money(ref)})</Text>}
            </Text>
          )}
        </>
      )}
      {campo && <Teclado onKey={onKey} onLimpiar={() => { setActivo(''); if (auto === campo) setAuto(null); }} />}

      {/* Concepto + sugerencias */}
      <TextInput
        style={input}
        placeholder={cambioDoble ? `Concepto (opcional) · Cambio ${moneda} → ${moneda2}` : 'Concepto (ej. Supermercado)'}
        placeholderTextColor={c.muted}
        value={concepto}
        onChangeText={setConcepto}
        onFocus={() => setCampo(null)}
      />
      {sugerencias.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} keyboardShouldPersistTaps="handled">
          {sugerencias.map((m) => (
            <Pressable key={m.id} onPress={() => usarSugerencia(m)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 }}>
              <Text style={{ marginRight: 6 }}>{catInfo(m.categoria).emoji}</Text>
              <Text style={{ color: c.text }}>{m.concepto}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Categoría */}
      {!cambioDoble && (
        <>
          <Etiqueta t="Categoría" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 6 }}>
            {categorias.map((x) => {
              const i = catInfo(x);
              const on = categoria === x;
              return (
                <View key={x} style={{ width: '25%', padding: 4 }}>
                  <Pressable onPress={() => { tap(); setCategoria(on ? '' : x); }} onLongPress={() => onBorrarCategoria('cat', x)} style={{ alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: on ? i.color + '40' : c.card, borderWidth: 2, borderColor: on ? i.color : 'transparent' }}>
                    <Text style={{ fontSize: 24 }}>{i.emoji}</Text>
                    <Text style={{ color: on ? c.text : c.muted, fontSize: 11, marginTop: 4 }} numberOfLines={1}>{x}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <NuevaCategoria nivel="cat" onCreada={setCategoria} />
          </View>
          <Text style={{ color: c.muted, fontSize: 11, marginBottom: 6 }}>Mantené apretada una categoría para borrarla.</Text>
        </>
      )}

      <Etiqueta t="Método" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
        {metodos.map((x) => <Chip key={x} label={`${metInfo(x).emoji} ${x}`} on={metodo === x} onPress={() => setMetodo(x)} />)}
      </ScrollView>

      {credito && !cambioDoble && (
        <>
          <Etiqueta t="Cuotas (cumplidas / totales)" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput style={{ ...input, flex: 1 }} placeholder="Cumplidas" placeholderTextColor={c.muted} keyboardType="number-pad" value={cumplidas} onChangeText={setCumplidas} onFocus={() => setCampo(null)} />
            <TextInput style={{ ...input, flex: 1 }} placeholder="Totales" placeholderTextColor={c.muted} keyboardType="number-pad" value={totales} onChangeText={setTotales} onFocus={() => setCampo(null)} />
          </View>
          {!!totales && a > 0 && <Text style={{ color: c.muted, fontSize: 12, marginBottom: 8 }}>Total de la compra en {totales} cuotas: {money(a * +totales, moneda)}</Text>}
        </>
      )}

      <Etiqueta t="Categoría 2" />
      <Grupo>
        {categorias2.map((x) => (
          <Chip key={x} label={x} on={categoria2 === x} onPress={() => setCategoria2(categoria2 === x ? '' : x)} onLongPress={() => onBorrarCategoria('cat2', x)} />
        ))}
        <NuevaCategoria nivel="cat2" onCreada={setCategoria2} />
      </Grupo>

      {puedeRepetir && (
        <Pressable onPress={() => { tap(); setRepetir(!repetir); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: repetir ? c.accent + '22' : c.card, borderWidth: 1, borderColor: repetir ? c.accent : c.border, borderRadius: 14, padding: 12, marginTop: 6 }}>
          <Text style={{ fontSize: 20, marginRight: 10 }}>🔁</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>Repetir todos los meses</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{repetir ? `Se va a cargar solo el día ${+fecha.slice(8)} de cada mes` : 'Para sueldo, suscripciones, alquiler…'}</Text>
          </View>
          <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: repetir ? c.accent : c.border, justifyContent: 'center', paddingHorizontal: 3 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: repetir ? 'flex-end' : 'flex-start' }} />
          </View>
        </Pressable>
      )}
      {yaRecurrente && (
        <Pressable onPress={() => { tap(); router.push({ pathname: '/recurrente', params: { id: yaRecurrente.id } }); }} style={{ backgroundColor: c.card, borderRadius: 14, padding: 12, marginTop: 6 }}>
          <Text style={{ color: c.text }}>🔁 Se repite todos los meses (día {yaRecurrente.dia}) · <Text style={{ color: c.accent, fontWeight: '700' }}>Editar recurrente ›</Text></Text>
        </Pressable>
      )}

      <Etiqueta t="Fecha" />
      <Grupo>
        <Chip label="Hoy" on={fecha === hoyYmd()} onPress={() => setFecha(hoyYmd())} />
        <Chip label="Ayer" on={fecha === ymdMenos(1)} onPress={() => setFecha(ymdMenos(1))} />
        <Chip label="Anteayer" on={fecha === ymdMenos(2)} onPress={() => setFecha(ymdMenos(2))} />
      </Grupo>
      <TextInput style={input} placeholder="Otra fecha AAAA-MM-DD" placeholderTextColor={c.muted} value={fecha} onChangeText={setFecha} onFocus={() => setCampo(null)} />

      <Pressable onPress={onGuardar} style={({ pressed }) => ({ backgroundColor: color, padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 6, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{previo ? 'Guardar cambios' : cambioDoble ? 'Registrar cambio' : 'Guardar'}</Text>
      </Pressable>
      {previo && (
        <Pressable onPress={onEliminar} style={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ color: c.gasto }}>🗑 Eliminar</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
