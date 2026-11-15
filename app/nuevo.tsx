import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, confirmar } from '../src/alerta';
import { emparejar } from '../src/planificados';
import { descripcion as descripcionRec } from '../src/recurrentes';
import { emojiCuenta } from '../src/proveedores';
import { convertir, useCategorias, useFinanzas } from '../src/store';
import { nuevoId } from '../src/nube';
import { METODOS, c, catInfo, metInfo, radio, suave, tipo as tipoTxt, TOQUE } from '../src/theme';
import { Icono, type NombreIcono, iconoCuenta, iconoMetodo } from '../src/iconos';
import type { Moneda, Movimiento, Tipo } from '../src/types';
import { BarraAccion, Boton, centrado, Chip, Interruptor, MAX_FORM, NuevaCategoria, PantallaTeclado, Segmentado, SelectorFecha, SelectorMoneda, tap } from '../src/ui';
import { horaAhora, hoyYmd, money, ymdMenos } from '../src/util';

const Etiqueta = ({ t }: { t: string }) => <Text style={{ ...tipoTxt.etiqueta, color: c.muted, marginBottom: 8, marginTop: 12 }}>{t}</Text>;
const Grupo = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>{children}</View>;

// Valores de la hoja + los que ya uses, sin repetir
const unir = (base: string[], usados: string[]) => [...new Set([...base, ...usados.filter(Boolean)])];

const TIPOS: { t: Tipo; label: string; color: string; icono: NombreIcono }[] = [
  { t: 'Egreso', label: 'Gasto', color: c.gasto, icono: 'compras' },
  { t: 'Ingreso', label: 'Ingreso', color: c.ingreso, icono: 'sueldo' },
  { t: 'Ahorro', label: 'Ahorro', color: c.ahorro, icono: 'ahorro' },
  { t: 'Cambio', label: 'Cambio de moneda', color: c.transferencia, icono: 'cambio' },
  { t: 'Transferencia', label: 'Entre mis cuentas', color: c.transferencia, icono: 'transferir' },
  { t: 'Deuda', label: 'Deuda', color: c.deuda, icono: 'usuario' }, // solo al editar un préstamo o un pago: se crean desde Deudas
  { t: 'Pago deuda', label: 'Pago deuda', color: c.deuda, icono: 'usuario' },
];
const AYUDA: Record<Tipo, string> = {
  Egreso: 'Plata que sale: compras, cuentas, cuotas.',
  Ingreso: 'Plata que entra: sueldo, ventas, devoluciones.',
  Ahorro: 'Plata que separás para no gastarla. Se descuenta de tu dinero libre.',
  Cambio: 'Compra o venta de moneda: entregás una moneda y recibís otra. No cuenta como gasto ni ingreso.',
  Deuda: 'Plata que pediste o prestaste. No cuenta como ingreso ni gasto. Se maneja desde Deudas.',
  'Pago deuda': 'Pago de una deuda (lo que pagás o te pagan). No cuenta como ingreso ni gasto.',
  Transferencia: 'Plata que pasás de una cuenta tuya a otra (ej. Mercado Pago → Naranja X). No cuenta como gasto ni ingreso.',
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
    <Text style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>Podés sumar y restar (ej. 1500+2300). Mantené ⌫ para borrar todo.{Platform.OS === 'web' ? ' En la compu escribí con el teclado.' : ''}</Text>
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
  const { id, fecha: fechaParam, monto: montoParam, tipo: tipoParam } = useLocalSearchParams<{ id?: string; fecha?: string; monto?: string; tipo?: string }>(); // monto/tipo vienen de la calculadora
  const porAnio = useFinanzas((s) => s.porAnio);
  const { guardar, eliminar, cotizaciones, guardarPlanificado, borrarPlanificado } = useFinanzas();
  const planificados = useFinanzas((st) => st.planificados);
  const nubeUid = useFinanzas((st) => st.nubeUid);
  const todos = useMemo(() => Object.values(porAnio).flat(), [porAnio]);
  const previo = id ? (porAnio[(fechaParam ?? '').slice(0, 4)] ?? todos).find((m) => m.id === id) : undefined;

  const [tipo, setTipo] = useState<Tipo>(previo?.tipo ?? (tipoParam === 'Ingreso' ? 'Ingreso' : tipoParam === 'Ahorro' ? 'Ahorro' : 'Egreso'));
  const [expr, setExpr] = useState(previo ? aExpr(Math.abs(previo.valor)) : montoParam ?? '');
  const [moneda, setMoneda] = useState<Moneda>(previo?.moneda ?? 'ARS');
  const [expr2, setExpr2] = useState(''); // lo que recibís en un cambio
  const [moneda2, setMoneda2] = useState<Moneda>('USD');
  const [auto, setAuto] = useState<'a' | 'b' | null>(null); // en un cambio, el monto que se calcula solo con la cotización
  const [entradaArs, setEntradaArs] = useState<boolean | null>(null); // escribir el monto en pesos aunque la moneda sea USD/USDT
  const [desdePesos, setDesdePesos] = useState(true); // ahorro en USD/USDT pagado con pesos: registra también el cambio
  // Planificado: al editar, si este movimiento cumple algo planificado; al crear, si es uno planificado
  // ('nuevo' = todavía no ocurrió, se guarda como pendiente; un id = cumple ese planificado que ya tenías)
  const planDePrevio = previo ? planificados.find((p) => p.movimientoId === previo.id) : undefined;
  const [esPlan, setEsPlan] = useState(!!planDePrevio);
  const [planSel, setPlanSel] = useState<string | null>(null);
  const [planYaPaso, setPlanYaPaso] = useState(true); // al marcar uno ya cargado: ¿ya se cumplió o todavía no?
  const [repetir, setRepetir] = useState(false); // crear un recurrente con este movimiento
  const { recurrentes, guardarRecurrente } = useFinanzas();
  const yaRecurrente = previo && recurrentes.find((r) => r.tipo === previo.tipo && r.concepto.trim().toLowerCase() === previo.concepto.trim().toLowerCase());
  const [campo, setCampo] = useState<'a' | 'b' | null>(previo ? null : 'a'); // monto con el teclado abierto
  const [concepto, setConcepto] = useState(previo?.concepto ?? '');
  const [metodo, setMetodo] = useState(previo?.metodo ?? 'Efectivo');
  const cuentas = useFinanzas((st) => st.cuentas);
  const hojaConectada = useFinanzas((st) => !!st.url && !st.nubeUid); // la hoja de Google no tiene columnas para cuentas
  const cuentasActivas = useMemo(() => cuentas.filter((x) => x.activa || x.id === previo?.cuentaId || x.id === previo?.cuentaDestinoId), [cuentas, previo]);
  const [origenId, setOrigenId] = useState<string | null>(previo?.tipo === 'Transferencia' ? previo.cuentaId ?? null : null);
  const [destinoId, setDestinoId] = useState<string | null>(previo?.tipo === 'Transferencia' ? previo.cuentaDestinoId ?? null : null);
  const [categoria, setCategoria] = useState(previo?.categoria ?? '');
  const [categoria2, setCategoria2] = useState(previo?.categoria2 ?? '');
  const [fecha, setFecha] = useState(previo?.fecha ?? hoyYmd());
  const [cumplidas, setCumplidas] = useState(previo?.cuotasCumplidas != null ? String(previo.cuotasCumplidas) : '');
  const [totales, setTotales] = useState(previo?.cuotasTotales != null ? String(previo.cuotasTotales) : '');

  const metodos = useMemo(() => unir(METODOS, [...cuentas.filter((x) => x.activa).map((x) => x.nombre), ...todos.map((m) => m.metodo)]), [todos, cuentas]);
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
  // Las cuotas valen para cualquier método de pago (tarjeta, Mercado Pago, efectivo…). Se activan solas con un método de crédito, la categoría
  // "Cuota" o un movimiento que ya tenía cuotas, y en un gasto se pueden prender o apagar a mano.
  const esTransf = tipo === 'Transferencia';
  const cuotasAuto = (!esTransf && sinTildes(metodo).includes('credito')) || sinTildes(categoria) === 'cuota' || !!previo?.cuotasTotales;
  const [cuotasManual, setCuotasManual] = useState<boolean | null>(null); // null = automático
  const puedeCuotas = tipo === 'Egreso' && !esTransf;
  const credito = !esTransf && (cuotasManual ?? cuotasAuto) && (puedeCuotas || cuotasAuto);
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
  const puedePlanificar = (tipo === 'Ingreso' || tipo === 'Egreso' || tipo === 'Ahorro') && !cambioDoble;
  const planesPendientes = useMemo(() => planificados.filter((p) => p.estado === 'pendiente' && p.tipo === tipo), [planificados, tipo]);
  const puedeRepetir = tipo !== 'Cambio' && !esTransf && !ahorroConPesos && !(credito && totales) && !yaRecurrente;
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
      // Un cambio de divisa mueve plata entre cuentas (ej. Mercado Pago en pesos → Binance en USDT): cada pata queda en su cuenta
      const cuentaSale = cuentas.find((x) => x.id === origenId);
      const cuentaEntra = cuentas.find((x) => x.id === destinoId);
      if (cuentasActivas.length > 0 && !cuentaSale && !cuentaEntra) return avisar('Elegí de qué cuenta sale la plata y en cuál entra');
      const pata = (cu?: typeof cuentaSale) => (cu ? { metodo: cu.nombre, cuentaId: cu.id } : { metodo });
      const comun = { fecha, tipo: 'Cambio' as Tipo, categoria, categoria2, cuotasCumplidas: null, cuotasTotales: null };
      const nombre = concepto.trim() || `Cambio ${moneda} → ${moneda2}`;
      tap(true);
      setEnviado(true);
      // Con pesos de por medio se usa lo que realmente pagaste/recibiste, así en la hoja las dos filas se compensan.
      const arsA = moneda === 'ARS' ? -a : moneda2 === 'ARS' ? -b : enPesos(-a, moneda);
      const arsB = moneda2 === 'ARS' ? b : moneda === 'ARS' ? a : enPesos(b, moneda2);
      guardar(
        { ...comun, ...pata(cuentaSale ?? cuentaEntra), concepto: nombre, valor: -a, moneda, valorArs: arsA },
        { ...comun, ...pata(cuentaEntra ?? cuentaSale), concepto: nombre, valor: b, moneda: moneda2, valorArs: arsB },
      );
      return router.back();
    }
    const origen = cuentas.find((x) => x.id === origenId);
    const destino = cuentas.find((x) => x.id === destinoId);
    if (esTransf) {
      if (!origen || !destino) return avisar('Elegí desde qué cuenta sale y a cuál llega');
      if (origen.id === destino.id) return avisar('Las dos cuentas son la misma');
    } else if (!concepto.trim()) return avisar('Ingresá un concepto');
    if (enArs && !convertido) return avisar(`Falta la cotización de ${moneda}: cargala en Ajustes o escribí el monto en ${moneda}`);
    // Como en tu hoja: ingresos en positivo; egresos y ahorros en negativo. "Cambio" conserva su signo.
    const signo = tipo === 'Ingreso' || esTransf ? 1 : tipo === 'Cambio' || tipo === 'Deuda' || tipo === 'Pago deuda' ? Math.sign(previo?.valor ?? -1) || -1 : -1;
    const monto = Math.round((enArs ? convertido! : a) * 100) / 100; // en la moneda del movimiento
    const valor = signo * monto;
    const pesos = enArs ? signo * Math.round(a * 100) / 100 : enPesos(valor, moneda); // columna C de la hoja
    if (ahorroConPesos && pesos === null) return avisar(`Falta la cotización de ${moneda}: cargala en Ajustes`);
    tap(true);
    setEnviado(true);
    // Uno ya cargado que todavía no se cumplió: deja de ser un movimiento y pasa a pendiente en Planificados
    if (previo && puedePlanificar && esPlan && !planDePrevio && !planYaPaso) {
      (async () => {
        if (!(await confirmar('¿Pasar a pendiente?', `"${previo.concepto}" deja de contar en tus saldos y estadísticas hasta que ocurra. Lo vas a ver en Planificados.`, 'Pasar a pendiente'))) return setEnviado(false);
        await eliminar(previo);
        await guardarPlanificado({
          fecha, concepto: concepto.trim(), valor, moneda, tipo: tipo as 'Ingreso' | 'Egreso' | 'Ahorro', metodo, cuentaId: previo.cuentaId ?? null, categoria, categoria2,
        });
        router.back();
      })();
      return;
    }
    const planNuevo = !previo && puedePlanificar && esPlan && planSel === 'nuevo';
    const planCumple = !previo && puedePlanificar && esPlan && planSel && planSel !== 'nuevo' ? planificados.find((p) => p.id === planSel) : undefined;
    // Con un planificado elegido el id se define acá para poder vincularlo cuando el movimiento esté guardado
    const idPropio = planCumple ? (nubeUid ? nuevoId() : `n-${Date.now()}${Math.random().toString(36).slice(2, 6)}`) : undefined;
    const mov = {
      id: previo?.id ?? idPropio, fecha, hora: previo?.hora ?? horaAhora(), valor, valorArs: pesos, tipo, moneda,
      concepto: esTransf ? concepto.trim() || `Transferencia ${origen!.nombre} → ${destino!.nombre}` : concepto.trim(),
      metodo: esTransf ? origen!.nombre : metodo, categoria: esTransf ? '' : categoria, categoria2: esTransf ? '' : categoria2,
      // Si cambió el método, la cuenta se vuelve a buscar por nombre al guardar
      cuentaId: esTransf ? origen!.id : metodo === previo?.metodo ? previo?.cuentaId ?? null : null,
      cuentaDestinoId: esTransf ? destino!.id : null,
      origen: previo?.origen, externalId: previo?.externalId, deudaId: previo?.deudaId ?? null,
      cuotasCumplidas: credito && cumplidas ? +cumplidas : null,
      cuotasTotales: credito && totales ? +totales : null,
    };
    if (planNuevo) {
      // Todavía no ocurrió: queda como pendiente en Planificados y no toca saldos ni estadísticas
      guardarPlanificado({
        fecha, concepto: mov.concepto, valor, moneda, tipo: tipo as 'Ingreso' | 'Egreso' | 'Ahorro', metodo,
        cuentaId: cuentas.find((x) => x.nombre.toLowerCase() === metodo.trim().toLowerCase())?.id ?? null, categoria, categoria2,
      });
      return router.back();
    }
    if (ahorroConPesos) {
      // Los pesos salen de tu billetera en ARS y el ahorro queda en USD/USDT: cambio ARS → moneda + ahorro.
      const ars = Math.abs(pesos!);
      const cambio = { fecha, hora: mov.hora, tipo: 'Cambio' as Tipo, concepto: `Cambio ARS → ${moneda} (${concepto.trim()})`, metodo, categoria: '', categoria2, cuotasCumplidas: null, cuotasTotales: null };
      guardar({ ...cambio, valor: -ars, moneda: 'ARS', valorArs: -ars }, { ...cambio, valor: monto, moneda, valorArs: ars }, mov);
    } else if (planCumple) guardar(mov).then(() => guardarPlanificado({ ...planCumple, estado: 'cumplido', movimientoId: idPropio! }));
    else guardar(mov);
    if (previo && puedePlanificar) {
      if (esPlan && !planDePrevio) {
        // Marcar uno ya cargado: cumple un planificado pendiente parecido o, si no hay, queda registrado como planificado cumplido
        const actual = { ...previo, ...mov, id: previo.id } as Movimiento;
        const par = emparejar(planificados.filter((p) => p.estado === 'pendiente'), [actual])[0];
        if (par) guardarPlanificado({ ...par.plan, estado: 'cumplido', movimientoId: previo.id });
        else guardarPlanificado({ fecha, concepto: mov.concepto, valor, moneda, tipo: tipo as 'Ingreso' | 'Egreso' | 'Ahorro', metodo, cuentaId: previo.cuentaId ?? null, categoria, categoria2, estado: 'cumplido', movimientoId: previo.id });
      } else if (!esPlan && planDePrevio) borrarPlanificado(planDePrevio.id);
    }
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
  // En la web (compu) el monto se escribe con el teclado físico: números, coma o punto, + y −, borrar y Enter (=)
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => {
    const doc = (globalThis as unknown as { document?: { addEventListener: (t: string, f: (e: TeclaWeb) => void) => void; removeEventListener: (t: string, f: (e: TeclaWeb) => void) => void } }).document;
    if (Platform.OS !== 'web' || !campo || !doc) return;
    type TeclaWeb = { key: string; target: { tagName?: string } | null; ctrlKey: boolean; metaKey: boolean; altKey: boolean; preventDefault: () => void };
    const alTeclear = (e: TeclaWeb) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.ctrlKey || e.metaKey || e.altKey) return; // escribiendo en otro campo, o un atajo del navegador
      const k = /^\d$/.test(e.key) ? e.key : e.key === ',' || e.key === '.' ? ',' : e.key === '+' ? '+' : e.key === '-' ? '−' : e.key === 'Backspace' ? '⌫' : e.key === 'Enter' || e.key === '=' ? '=' : null;
      if (k) { e.preventDefault(); onKeyRef.current(k); }
    };
    doc.addEventListener('keydown', alTeclear);
    return () => doc.removeEventListener('keydown', alTeclear);
  }, [campo]);
  useEffect(() => {
    if (!cambioDoble || !auto) return;
    const [src, de, a2] = auto === 'b' ? [expr, moneda, moneda2] : [expr2, moneda2, moneda];
    const v = convertir(evaluar(src), de, a2, cotizaciones);
    const texto = v && v > 0 ? aExpr(a2 === 'ARS' ? Math.round(v) : Math.round(v * 100) / 100) : '';
    (auto === 'b' ? setExpr2 : setExpr)(texto);
  }, [cambioDoble, auto, expr, expr2, moneda, moneda2, cotizaciones]);
  const notaAuto = 'Calculado con la cotización de hoy · tocá para poner lo que pagaste'

  const tiposVisibles = TIPOS.filter((x) => (x.t !== 'Cambio' || !previo || previo.tipo === 'Cambio') && (x.t !== 'Transferencia' || !hojaConectada || previo?.tipo === 'Transferencia') && ((x.t !== 'Deuda' && x.t !== 'Pago deuda') || previo?.tipo === x.t));
  const tiposPrincipales = tiposVisibles.filter((x) => x.t === 'Egreso' || x.t === 'Ingreso' || x.t === 'Ahorro');
  const tiposOtros = tiposVisibles.filter((x) => !tiposPrincipales.includes(x));
  const colorTipo = (t: Tipo) => TIPOS.find((x) => x.t === t)?.color ?? c.accent;
  const hayOpciones = (puedeCuotas && !cambioDoble) || puedePlanificar || puedeRepetir || !!yaRecurrente;
  const textoGuardar = previo ? (puedePlanificar && esPlan && !planDePrevio && !planYaPaso ? 'Pasar a pendiente' : 'Guardar cambios') : cambioDoble ? 'Registrar cambio' : puedePlanificar && esPlan && planSel === 'nuevo' ? 'Guardar como pendiente' : 'Guardar';

  return (
    <PantallaTeclado>
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 32, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      {/* Tipo */}
      <Segmentado opciones={tiposPrincipales.map((x) => ({ valor: x.t, label: x.label }))} valor={tipo} onChange={setTipo} colorDe={colorTipo} />
      {tiposOtros.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {tiposOtros.map((x) => {
            const on = tipo === x.t;
            return (
              <Pressable key={x.t} onPress={() => { tap(); setTipo(x.t); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radio.total, borderWidth: 1, borderColor: on ? x.color : c.border, backgroundColor: on ? suave(x.color) : 'transparent' }}>
                <Icono nombre={x.icono} color={on ? x.color : c.muted} size={16} />
                <Text style={{ color: on ? c.text : c.muted, fontSize: 13, fontWeight: '600' }}>{x.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Text style={{ ...tipoTxt.sub, color: c.muted, marginTop: 8, marginBottom: 16, marginLeft: 4 }}>{AYUDA[tipo]}</Text>

      {/* Monto(s) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ ...tipoTxt.etiqueta, color: c.muted }}>{cambioDoble ? 'Entregás' : 'Monto'}</Text>
        <SelectorMoneda valor={moneda} onChange={setMoneda} chico />
      </View>
      {moneda !== 'ARS' && !cambioDoble && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: c.muted, fontSize: 13, marginRight: 8 }}>Escribir el monto en</Text>
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
        <View style={{ backgroundColor: c.card, borderRadius: radio.l, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: c.border }}>
          <Text style={{ color: c.muted, fontSize: 13, marginBottom: 8 }}>¿Con qué plata ahorrás?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip label="Con pesos" on={desdePesos} color={c.ahorro} onPress={() => setDesdePesos(true)} />
            <Chip label={`Con ${moneda} que ya tenía`} on={!desdePesos} color={c.ahorro} onPress={() => setDesdePesos(false)} />
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {desdePesos
              ? `Se registra el cambio ARS → ${moneda} y el ahorro: tus pesos bajan y tu ahorro en ${moneda} sube.`
              : `Solo pasa ${moneda} de disponible a ahorrado.`}
          </Text>
        </View>
      )}
      {cambioDoble && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ ...tipoTxt.etiqueta, color: c.muted }}>Recibís</Text>
            <SelectorMoneda valor={moneda2} onChange={setMoneda2} chico />
          </View>
          <Monto expr={expr2} moneda={moneda2} color={c.ingreso} activo={campo === 'b'} onPress={() => setCampo(campo === 'b' ? null : 'b')} nota={auto === 'b' && expr2 ? notaAuto : undefined} />
          {tasa && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginLeft: 4 }}>
              <Icono nombre="cambio" color={c.transferencia} size={16} />
              <Text style={{ color: c.text }}>
                Te salió a {tasa}
                {ref > 0 && <Text style={{ color: c.muted }}> (referencia hoy {money(ref)})</Text>}
              </Text>
            </View>
          )}
        </>
      )}
      {campo && <Teclado onKey={onKey} onLimpiar={() => { setActivo(''); if (auto === campo) setAuto(null); }} />}

      {/* Concepto + sugerencias */}
      <TextInput
        style={input}
        placeholder={cambioDoble ? `Concepto (opcional) · Cambio ${moneda} → ${moneda2}` : esTransf ? 'Concepto (opcional)' : 'Concepto (ej. Supermercado)'}
        placeholderTextColor={c.muted}
        value={concepto}
        onChangeText={setConcepto}
        onFocus={() => setCampo(null)}
      />
      {sugerencias.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} keyboardShouldPersistTaps="handled">
          {sugerencias.map((m) => {
            const i = catInfo(m.categoria);
            return (
              <Pressable key={m.id} onPress={() => usarSugerencia(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.card2, borderRadius: radio.total, paddingHorizontal: 12, minHeight: 36, marginRight: 8 }}>
                <Icono nombre={i.icono ?? 'tag'} color={i.color} size={16} />
                <Text style={{ color: c.text }}>{m.concepto}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Categoría */}
      {!cambioDoble && !esTransf && (
        <>
          <Etiqueta t="Categoría" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 6 }}>
            {categorias.map((x) => {
              const i = catInfo(x);
              const on = categoria === x;
              return (
                <View key={x} style={{ width: '25%', padding: 4 }}>
                  <Pressable onPress={() => { tap(); setCategoria(on ? '' : x); }} onLongPress={() => onBorrarCategoria('cat', x)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={x}
                    style={{ alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: radio.m, backgroundColor: on ? suave(i.color) : c.card, borderWidth: 1.5, borderColor: on ? i.color : c.border }}>
                    <View style={{ width: 40, height: 40, borderRadius: radio.m, alignItems: 'center', justifyContent: 'center', backgroundColor: suave(i.color) }}>
                      <Icono nombre={i.icono ?? 'tag'} color={i.color} size={22} />
                    </View>
                    <Text style={{ color: on ? c.text : c.muted, fontSize: 12, fontWeight: on ? '600' : '400', marginTop: 6 }} numberOfLines={1}>{x}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <NuevaCategoria nivel="cat" onCreada={setCategoria} />
          </View>
          <Text style={{ color: c.muted, fontSize: 12, marginBottom: 6 }}>Mantené apretada una categoría para borrarla.</Text>
        </>
      )}

      {esTransf ? (
        cuentasActivas.length < 2 ? (
          <Link href="/cuentas" asChild>
            <Pressable style={{ backgroundColor: c.card, borderRadius: radio.l, padding: 12, marginTop: 6, borderWidth: 1, borderColor: c.border }}>
              <Text style={{ color: c.text }}>Necesitás al menos dos cuentas para transferir. <Text style={{ color: c.accent, fontWeight: '700' }}>Crear cuentas ›</Text></Text>
            </Pressable>
          </Link>
        ) : (
          <>
            <Etiqueta t="Desde" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} keyboardShouldPersistTaps="handled">
              {cuentasActivas.map((x) => <Chip key={x.id} label={x.nombre} icono={iconoCuenta(x)} on={origenId === x.id} onPress={() => setOrigenId(x.id)} color={c.transferencia} />)}
            </ScrollView>
            <Etiqueta t="Hacia" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} keyboardShouldPersistTaps="handled">
              {cuentasActivas.filter((x) => x.id !== origenId).map((x) => <Chip key={x.id} label={x.nombre} icono={iconoCuenta(x)} on={destinoId === x.id} onPress={() => setDestinoId(x.id)} color={c.transferencia} />)}
            </ScrollView>
          </>
        )
      ) : cambioDoble && cuentasActivas.length > 0 ? (
        <>
          <Etiqueta t="Sale de (cuenta)" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} keyboardShouldPersistTaps="handled">
            {cuentasActivas.map((x) => <Chip key={x.id} label={x.nombre} icono={iconoCuenta(x)} on={origenId === x.id} onPress={() => setOrigenId(origenId === x.id ? null : x.id)} color={c.transferencia} />)}
          </ScrollView>
          <Etiqueta t="Entra en (cuenta)" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} keyboardShouldPersistTaps="handled">
            {cuentasActivas.map((x) => <Chip key={x.id} label={x.nombre} icono={iconoCuenta(x)} on={destinoId === x.id} onPress={() => setDestinoId(destinoId === x.id ? null : x.id)} color={c.transferencia} />)}
          </ScrollView>
          <Text style={{ color: c.muted, fontSize: 12, marginBottom: 6 }}>Si cambiás dentro de la misma cuenta (ej. una billetera con pesos y dólares), elegí la misma en las dos.</Text>
        </>
      ) : (
        <>
          <Etiqueta t="Método" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
            {metodos.map((x) => <Chip key={x} label={x} icono={iconoMetodo(x)} on={metodo === x} onPress={() => setMetodo(x)} />)}
          </ScrollView>
        </>
      )}

      {/* Fecha */}
      <Etiqueta t="Fecha" />
      <Grupo>
        <Chip label="Hoy" on={fecha === hoyYmd()} onPress={() => setFecha(hoyYmd())} />
        <Chip label="Ayer" on={fecha === ymdMenos(1)} onPress={() => setFecha(ymdMenos(1))} />
        <Chip label="Anteayer" on={fecha === ymdMenos(2)} onPress={() => setFecha(ymdMenos(2))} />
      </Grupo>
      <SelectorFecha valor={fecha} onChange={setFecha} etiqueta="Otra fecha" onOpen={() => setCampo(null)} />

      {/* Opciones: cuotas, planificado y repetir, siempre a la vista */}
      {hayOpciones && (
        <>
          <Etiqueta t="Opciones" />
          <View style={{ backgroundColor: c.card, borderRadius: radio.l, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16, marginBottom: 6 }}>
            {puedeCuotas && !cambioDoble && (
              <View>
                <Interruptor on={credito} onPress={() => setCuotasManual(!credito)} titulo="En cuotas" sub={credito ? 'Cargá cuántas pagaste y cuántas son' : 'Para compras con tarjeta en cuotas'} color={c.accent} />
                {credito && (
                  <View style={{ paddingBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TextInput style={{ ...input, flex: 1, marginBottom: 0 }} placeholder="Cumplidas" placeholderTextColor={c.muted} keyboardType="number-pad" value={cumplidas} onChangeText={setCumplidas} onFocus={() => setCampo(null)} accessibilityLabel="Cuotas cumplidas" />
                      <TextInput style={{ ...input, flex: 1, marginBottom: 0 }} placeholder="Totales" placeholderTextColor={c.muted} keyboardType="number-pad" value={totales} onChangeText={setTotales} onFocus={() => setCampo(null)} accessibilityLabel="Cuotas totales" />
                    </View>
                    {!!totales && a > 0 && <Text style={{ color: c.muted, fontSize: 13, marginTop: 8 }}>Total de la compra en {totales} cuotas: {money(a * +totales, moneda)}</Text>}
                  </View>
                )}
              </View>
            )}
            {puedePlanificar && (
              <View style={{ borderTopWidth: puedeCuotas && !cambioDoble ? 1 : 0, borderTopColor: c.border }}>
                <Interruptor
                  on={esPlan}
                  color={c.transferencia}
                  titulo="Es un movimiento planificado"
                  sub={previo ? (esPlan ? (planDePrevio ? 'Está vinculado a un planificado cumplido' : planYaPaso ? 'Queda como planificado ya cumplido' : 'Pasa a pendiente en Planificados') : 'Marcalo si lo habías planificado de antes') : esPlan ? 'Elegí si todavía no ocurrió o si cumple uno que ya planificaste' : 'Para algo que esperás cobrar o pagar'}
                  onPress={() => {
                    const on = !esPlan;
                    setEsPlan(on);
                    // Al crear: si es a futuro, lo normal es dejarlo pendiente; si no, cumplir el planificado pendiente que más se le parece
                    if (on && !previo) setPlanSel(fecha > hoyYmd() || !planesPendientes.length ? 'nuevo' : planesPendientes[0].id);
                  }}
                />
                {esPlan && previo && !planDePrevio && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 6 }}>
                    <Chip label="Ya se cumplió" on={planYaPaso} color={c.transferencia} onPress={() => setPlanYaPaso(true)} />
                    <Chip label="Todavía no se cumplió" on={!planYaPaso} color={c.transferencia} onPress={() => setPlanYaPaso(false)} />
                  </View>
                )}
                {esPlan && !previo && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 6 }}>
                    <Chip label="Todavía no ocurrió (queda pendiente)" on={planSel === 'nuevo'} color={c.transferencia} onPress={() => setPlanSel('nuevo')} />
                    {planesPendientes.map((p) => (
                      <Chip key={p.id} label={`Cumple: ${p.concepto} (${p.fecha.slice(8)}/${p.fecha.slice(5, 7)})`} on={planSel === p.id} color={c.transferencia} onPress={() => setPlanSel(p.id)} />
                    ))}
                  </View>
                )}
              </View>
            )}
            {puedeRepetir && (
              <View style={{ borderTopWidth: (puedeCuotas && !cambioDoble) || puedePlanificar ? 1 : 0, borderTopColor: c.border }}>
                <Interruptor on={repetir} onPress={() => setRepetir(!repetir)} titulo="Repetir todos los meses" sub={repetir ? `Se va a cargar solo el día ${+fecha.slice(8)} de cada mes` : 'Para sueldo, suscripciones, alquiler…'} color={c.accent} />
              </View>
            )}
            {yaRecurrente && (
              <Pressable onPress={() => { tap(); router.push({ pathname: '/recurrente', params: { id: yaRecurrente.id } }); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: (puedeCuotas && !cambioDoble) || puedePlanificar || puedeRepetir ? 1 : 0, borderTopColor: c.border }}>
                <Icono nombre="repetir" color={c.accent} size={20} />
                <Text style={{ color: c.text, flex: 1 }}>Se repite: {descripcionRec(yaRecurrente).toLowerCase()} · <Text style={{ color: c.accent, fontWeight: '700' }}>Editar ›</Text></Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {!esTransf && <Etiqueta t="Categoría 2" />}
      {!esTransf && <Grupo>
        {categorias2.map((x) => (
          <Chip key={x} label={x} on={categoria2 === x} onPress={() => setCategoria2(categoria2 === x ? '' : x)} onLongPress={() => onBorrarCategoria('cat2', x)} />
        ))}
        <NuevaCategoria nivel="cat2" onCreada={setCategoria2} />
      </Grupo>}

      {previo && (
        <Pressable onPress={onEliminar} accessibilityRole="button" style={{ flexDirection: 'row', gap: 8, minHeight: TOQUE, marginTop: 12, alignItems: 'center', justifyContent: 'center' }}>
          <Icono nombre="basura" color={c.gasto} size={18} />
          <Text style={{ color: c.gasto, fontWeight: '600' }}>Eliminar movimiento</Text>
        </Pressable>
      )}
    </ScrollView>
    <BarraAccion>
      <Boton titulo={textoGuardar} onPress={onGuardar} color={color} icono="check" />
    </BarraAccion>
    </PantallaTeclado>
  );
}
