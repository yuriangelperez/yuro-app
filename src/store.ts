import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { type DatosNube, esUuid, nube, nuevoId, requiereSesion } from './nube';
import { type Deuda, type ResumenDeuda, resumenDeuda } from './deudas';
import { type ProveedorIA, type SugerenciaIA, URL_OLLAMA } from './ia';
import { emparejar, type Planificado } from './planificados';
import { aplicables, buscarRegla, type Regla } from './reglas';
import { type EstadoReserva, estadosReservas, type Reserva } from './reservas';
import { detectarTransferencias, type ParTransferencia } from './transferencias';
import { type Cuenta, proveedorDe, tipoSugerido } from './proveedores';
import { sheets } from './sheets';
import { CATEGORIAS, CATEGORIAS2 } from './theme';
import { MONEDAS, type Moneda, type Movimiento } from './types';
import { norm, diasDelMes, horaAhora, hoyYmd, mesActual, sumaMes, ymdMenos } from './util';

// Las dos listas de categorías del formulario: "cat" (Categoría) y "cat2" (Categoría 2).
export type Nivel = 'cat' | 'cat2';
type PorNivel = Record<Nivel, string[]>;

export type FuenteUsd = 'blue' | 'oficial' | 'bolsa';
export type Presupuesto = { monto: number; moneda: Moneda };
// Cuántos pesos vale 1 USD / 1 USDT (0 = sin cotización)
export type Cotizaciones = { USD: number; USDT: number; fecha: string | null };

// Movimiento que se carga solo todos los meses (sueldo, suscripciones, alquiler…). Vive en el teléfono.
export type Recurrente = {
  id: string;
  concepto: string;
  valor: number; // con signo, en su moneda (gastos y ahorros negativos)
  moneda: Moneda;
  tipo: 'Ingreso' | 'Egreso' | 'Ahorro';
  metodo: string;
  categoria: string;
  categoria2: string;
  dia: number; // día del mes (si el mes es más corto, el último día)
  desde: string; // YYYY-MM desde el que corre
  activo: boolean;
  ultimoYm: string | null; // último mes ya cargado (o salteado porque ya existía)
};

type Op = { anio: number } & ({ kind: 'upsert'; m: Movimiento } | { kind: 'delete'; id: string });

interface State {
  url: string;
  token: string;
  mes: string; // YYYY-MM seleccionado
  porAnio: Record<string, Movimiento[]>;
  pendientes: Op[];
  sincronizando: boolean;
  error: string | null;
  ultimaSync: string | null;
  versionScript: number | null; // versión de Code.gs publicada (null = todavía no se sabe)
  presupuestos: Record<string, Presupuesto>; // tope mensual de gasto por categoría
  tipsOcultos: string[];
  catExtra: PorNivel; // categorías que agregaste a mano
  catOcultas: PorNivel; // categorías borradas (no se ofrecen más; los movimientos viejos las conservan)
  agregarCategoria: (nivel: Nivel, nombre: string) => void;
  borrarCategoria: (nivel: Nivel, nombre: string) => void;
  recurrentes: Recurrente[];
  recienGenerados: string[]; // conceptos cargados solos en la última pasada (para avisar)
  guardarRecurrente: (r: Omit<Recurrente, 'id'> & { id?: string }) => void;
  borrarRecurrente: (id: string) => void;
  generarRecurrentes: () => Promise<void>;
  limpiarGenerados: () => void;
  monedaVista: Moneda; // en qué moneda se muestran los totales
  fuenteUsd: FuenteUsd;
  cotizaciones: Cotizaciones;
  cotizHist: Record<string, { USD: number; USDT: number }>; // cotización de cada día en que la app la bajó (para valuar el patrimonio de meses pasados)
  saldosIniciales: Record<string, Partial<Record<Moneda, number>>>; // por año: lo que tenías el 1 de enero
  setSaldoInicial: (anio: string, m: Moneda, valor: number) => void;
  ahorrosIniciales: Record<string, Partial<Record<Moneda, number>>>; // por año: ajuste de lo ahorrado (ej. si usaste ahorros)
  setAhorroInicial: (anio: string, m: Moneda, valor: number) => void;
  cuentas: Cuenta[]; // dónde está tu plata (banco, billetera, efectivo…); en la nube las comparte con todos tus dispositivos
  planificados: Planificado[]; // movimientos esperados que todavía no ocurrieron (no entran en saldos ni estadísticas)
  guardarPlanificado: (p: Omit<Planificado, 'id' | 'estado' | 'movimientoId'> & Partial<Pick<Planificado, 'id' | 'estado' | 'movimientoId'>>) => Promise<Planificado>;
  borrarPlanificado: (id: string) => Promise<void>;
  cumplirPlanificado: (id: string) => Promise<void>; // "ya ocurrió": carga el movimiento hoy y lo vincula
  conciliarPlanificados: () => Promise<void>;
  deshacerCumplido: (id: string) => Promise<void>; // "todavía no se cumplió": borra el movimiento y el planificado vuelve a pendiente // vincula solo los que ya llegaron (notificación, Mercado Pago, extracto, a mano)
  transferenciasDescartadas: string[]; // pares que dijiste "no es una transferencia" (solo en este dispositivo)
  descartarTransferencia: (clave: string) => void;
  convertirEnTransferencia: (par: ParTransferencia) => Promise<void>; // reemplaza el gasto y el ingreso por una sola transferencia
  deudas: Deuda[]; // lo que debés y lo que te deben
  // Crea o edita una deuda. Al crear, `movimiento` registra también la plata que entró (te prestaron) o salió (prestaste).
  guardarDeuda: (d: Omit<Deuda, 'id' | 'activa'> & { id?: string; activa?: boolean }, movimiento?: { metodo: string }) => Promise<Deuda>;
  borrarDeuda: (id: string) => Promise<void>;
  pagarDeuda: (id: string, p: { monto: number; fecha: string; metodo: string }) => Promise<void>;
  iaActiva: boolean; // el asistente de IA es opcional y empieza apagado
  setIaActiva: (v: boolean) => void;
  iaProveedor: ProveedorIA; // 'ollama' (tu compu) o 'gemini' (Google AI Studio, gratis)
  setIaProveedor: (p: ProveedorIA) => void;
  iaUrl: string; // dónde corre tu Ollama
  iaModelo: string;
  setIaConfig: (url: string, modelo: string) => void;
  sugerenciasIA: SugerenciaIA[];
  iaVistos: string[]; // movimientos que ya se mandaron a revisar (no se repiten)
  setSugerenciasIA: (s: SugerenciaIA[], vistos: string[]) => void;
  descartarSugerenciaIA: (id: string) => void;
  aplicarSugerenciaIA: (s: SugerenciaIA) => Promise<'ok' | 'sin-cuentas'>;
  reservas: Reserva[]; // plata apartada dentro de una cuenta para un fin (no cambia el saldo)
  guardarReserva: (r: Omit<Reserva, 'id' | 'activa' | 'desde'> & { id?: string; activa?: boolean; desde?: string }) => Promise<Reserva>;
  borrarReserva: (id: string) => Promise<void>;
  reglas: Regla[]; // "si el concepto tiene X, es categoría Y"
  guardarRegla: (patron: string, categoria: string, categoria2?: string) => Promise<void>;
  borrarRegla: (id: string) => Promise<void>;
  aplicarReglas: () => Promise<number>; // clasifica los movimientos recientes sin categoría que alguna regla reconoce
  completarCuentas: () => Promise<void>;
  guardarCuenta: (c: Omit<Cuenta, 'id' | 'activa'> & { id?: string; activa?: boolean }) => Promise<Cuenta>;
  metaAhorro: { nombre: string; monto: number; moneda: Moneda } | null;
  setMetaAhorro: (meta: { nombre: string; monto: number; moneda: Moneda } | null) => void;
  setPresupuesto: (categoria: string, p: Presupuesto | null) => void;
  setMonedaVista: (m: Moneda) => void;
  setFuenteUsd: (f: FuenteUsd) => void;
  setCotizacion: (m: 'USD' | 'USDT', valor: number) => void;
  actualizarCotizaciones: () => Promise<void>;
  ocultarTip: (id: string) => void;
  mostrarTips: () => void;
  setConfig: (url: string, token: string) => void;
  setMes: (ym: string) => void;
  guardar: (...ms: (Omit<Movimiento, 'id'> & { id?: string })[]) => Promise<void>;
  eliminar: (m: Movimiento) => Promise<void>;
  sincronizar: () => Promise<void>;
  modoLocal: boolean; // entró con "Continuar sin cuenta": usa la app solo con los datos de este teléfono
  setModoLocal: (v: boolean) => void;
  nubeUid: string | null; // cuenta de Supabase a la que está atado este teléfono (null = datos locales / Google Sheets)
  conectarNube: (opts: { subirLocal: boolean }) => Promise<void>;
  desconectarNube: () => void;
}

const anioDe = (fecha: string) => +fecha.slice(0, 4);

// Cuentas, planificados, deudas y reservas son extras: si todavía no corriste su migración en Supabase (la tabla no existe)
// la sincronización de los movimientos no tiene que fallar por eso. Se conserva lo que ya había.
const opcional = async <T>(que: string, cargar: () => Promise<T>, previo: T): Promise<T> => {
  try {
    return await cargar();
  } catch (e) {
    console.warn(`No se pudo bajar ${que}: ${e instanceof Error ? e.message : e}`);
    return previo;
  }
};

// Movimiento de una deuda (el préstamo o un pago): mueve plata pero no es ingreso ni gasto
const movDeuda = (d: Deuda, tipo: 'Deuda' | 'Pago deuda', signo: 1 | -1, monto: number, fecha: string, metodo: string, concepto: string): Omit<Movimiento, 'id'> => {
  const ars = convertir(signo * monto, d.moneda, 'ARS', useFinanzas.getState().cotizaciones);
  return {
    fecha, hora: fecha === hoyYmd() ? horaAhora() : null, concepto, valor: signo * monto, moneda: d.moneda, valorArs: ars === null ? null : Math.round(ars * 100) / 100,
    tipo, metodo, categoria: '', categoria2: '', cuotasCumplidas: null, cuotasTotales: null, deudaId: d.id,
  };
};

// Cuenta de un movimiento: la que trae, o la que se llama como su "método". Si no existe se crea acá, salvo en la nube,
// donde la crea la base al guardar el movimiento (evita que dos dispositivos creen la misma cuenta a la vez).
const cuentaDe = async (m: Movimiento): Promise<string | null> => {
  if (m.cuentaId) return m.cuentaId;
  const nombre = m.metodo.trim();
  if (!nombre) return null;
  const { cuentas, nubeUid, guardarCuenta } = useFinanzas.getState();
  const existente = cuentas.find((x) => x.nombre.toLowerCase() === nombre.toLowerCase());
  if (existente) return existente.id;
  if (nubeUid) return null;
  const p = proveedorDe(nombre);
  return (await guardarCuenta({ nombre, proveedorId: p?.id ?? null, tipo: tipoSugerido(nombre), moneda: m.moneda, saldoInicial: 0 })).id;
};

// Lo que vive en tablas aparte de los movimientos. Cada una se baja por separado y, si falla, conserva lo anterior.
const bajarExtras = async () => {
  const s = useFinanzas.getState();
  const [cuentas, planificados, deudas, reservas, reglas] = await Promise.all([
    opcional('las cuentas', () => nube.listarCuentas(), s.cuentas),
    opcional('los planificados', () => nube.listarPlanificados(), s.planificados),
    opcional('las deudas', () => nube.listarDeudas(), s.deudas),
    opcional('las reservas', () => nube.listarReservas(), s.reservas),
    opcional('las reglas', () => nube.listarReglas(), s.reglas),
  ]);
  return { cuentas, planificados, deudas, reservas, reglas };
};

export const useFinanzas = create<State>()(
  persist(
    (set, get) => ({
      url: '',
      token: '',
      mes: mesActual(),
      porAnio: {},
      pendientes: [],
      sincronizando: false,
      nubeUid: null,
      modoLocal: false,
      setModoLocal: (modoLocal) => set({ modoLocal }),
      error: null,
      ultimaSync: null,
      versionScript: null,
      presupuestos: {},
      saldosIniciales: {},
      ahorrosIniciales: {},
      cuentas: [],
      planificados: [],
      deudas: [],
      reglas: [],
      guardarRegla: async (patron, categoria, categoria2 = '') => {
        const p = patron.trim();
        if (!p || !categoria) return;
        const previa = get().reglas.find((r) => norm(r.patron) === norm(p));
        const regla: Regla = { id: previa?.id ?? nuevoId(), patron: p, categoria, categoria2 };
        set((s) => ({ reglas: previa ? s.reglas.map((r) => (r.id === regla.id ? regla : r)) : [...s.reglas, regla] }));
        if (get().nubeUid) await nube.guardarRegla(regla).catch((e) => set({ error: `No se pudo guardar la regla: ${e instanceof Error ? e.message : e}` }));
      },
      borrarRegla: async (id) => {
        set((s) => ({ reglas: s.reglas.filter((r) => r.id !== id) }));
        if (get().nubeUid) await nube.borrarRegla(id).catch((e) => set({ error: `No se pudo borrar la regla: ${e instanceof Error ? e.message : e}` }));
      },
      aplicarReglas: async () => {
        const { reglas, porAnio } = get();
        if (!reglas.length) return 0;
        const hallados = aplicables(reglas, Object.values(porAnio).flat(), ymdMenos(90), hoyYmd());
        if (hallados.length) await get().guardar(...hallados.map(({ m, regla }) => ({ ...m, categoria: regla.categoria, categoria2: m.categoria2 || regla.categoria2 })));
        return hallados.length;
      },
      reservas: [],
      guardarReserva: async (r) => {
        const previa = r.id ? get().reservas.find((x) => x.id === r.id) : undefined;
        const reserva: Reserva = { ...r, id: r.id ?? nuevoId(), activa: r.activa ?? previa?.activa ?? true, desde: r.desde ?? previa?.desde ?? hoyYmd() };
        set((s) => ({ reservas: previa ? s.reservas.map((x) => (x.id === reserva.id ? reserva : x)) : [...s.reservas, reserva] }));
        if (get().nubeUid) await nube.guardarReserva(reserva).catch((e) => set({ error: `No se pudo guardar la reserva: ${e instanceof Error ? e.message : e}` }));
        return reserva;
      },
      borrarReserva: async (id) => {
        set((s) => ({ reservas: s.reservas.filter((x) => x.id !== id) }));
        if (get().nubeUid) await nube.borrarReserva(id).catch((e) => set({ error: `No se pudo borrar la reserva: ${e instanceof Error ? e.message : e}` }));
      },
      iaActiva: false,
      setIaActiva: (iaActiva) => set({ iaActiva }),
      iaProveedor: 'ollama',
      setIaProveedor: (iaProveedor) => set({ iaProveedor }),
      iaUrl: URL_OLLAMA,
      iaModelo: '',
      setIaConfig: (iaUrl, iaModelo) => set({ iaUrl: iaUrl.trim(), iaModelo: iaModelo.trim() }),
      sugerenciasIA: [],
      iaVistos: [],
      setSugerenciasIA: (nuevas, vistos) => set((s) => ({ sugerenciasIA: [...s.sugerenciasIA.filter((x) => !nuevas.some((n) => n.id === x.id)), ...nuevas], iaVistos: [...new Set([...s.iaVistos, ...vistos])].slice(-2000) })),
      descartarSugerenciaIA: (id) => set((s) => ({ sugerenciasIA: s.sugerenciasIA.filter((x) => x.id !== id) })),
      aplicarSugerenciaIA: async (sug) => {
        const m = Object.values(get().porAnio).flat().find((x) => x.id === sug.id);
        set((s) => ({ sugerenciasIA: s.sugerenciasIA.filter((x) => x.id !== sug.id) }));
        if (!m) return 'ok';
        const conHoja = !!get().url && !get().nubeUid; // la hoja de Google no tiene tipo Transferencia: ahí solo se aplica la categoría
        // Transferencia entre cuentas propias: el movimiento pasa a ser una transferencia (no ingreso ni gasto)
        if (sug.tipo === 'Transferencia' && sug.cuentaContraria && !conHoja) {
          const { cuentas } = get();
          const contraria = cuentas.find((x) => x.nombre.toLowerCase() === sug.cuentaContraria.trim().toLowerCase());
          const propia = cuentas.find((x) => x.id === m.cuentaId) ?? cuentas.find((x) => x.nombre.toLowerCase() === m.metodo.trim().toLowerCase());
          if (!contraria || !propia || contraria.id === propia.id) return 'sin-cuentas';
          const [origen, destino] = m.valor < 0 ? [propia, contraria] : [contraria, propia];
          await get().guardar({ ...m, tipo: 'Transferencia', valor: Math.abs(m.valor), valorArs: m.valorArs == null ? null : Math.abs(m.valorArs), cuentaId: origen.id, cuentaDestinoId: destino.id, metodo: origen.nombre, categoria: '', categoria2: '' });
          return 'ok';
        }
        if (sug.categoria) {
          get().agregarCategoria('cat', sug.categoria); // si es nueva queda disponible para el resto
          await get().guardar({ ...m, categoria: sug.categoria });
        }
        return 'ok';
      },
      guardarDeuda: async (d, movimiento) => {
        const previa = d.id ? get().deudas.find((x) => x.id === d.id) : undefined;
        const deuda: Deuda = { ...d, id: d.id ?? nuevoId(), activa: d.activa ?? previa?.activa ?? true };
        set((s) => ({ deudas: previa ? s.deudas.map((x) => (x.id === deuda.id ? deuda : x)) : [...s.deudas, deuda] }));
        // En la nube la deuda tiene que existir antes que los movimientos que la referencian
        if (get().nubeUid) await nube.guardarDeuda(deuda).catch((e) => set({ error: `No se pudo guardar la deuda: ${e instanceof Error ? e.message : e}` }));
        if (movimiento && !previa) {
          const debo = deuda.direccion === 'debo';
          await get().guardar(movDeuda(deuda, 'Deuda', debo ? 1 : -1, deuda.monto, deuda.fecha, movimiento.metodo, debo ? `Préstamo de ${deuda.nombre}` : `Préstamo a ${deuda.nombre}`));
        }
        return deuda;
      },
      borrarDeuda: async (id) => {
        // Los movimientos de la deuda se conservan (quedan sueltos): la plata ya se movió
        set((s) => ({ deudas: s.deudas.filter((x) => x.id !== id), porAnio: Object.fromEntries(Object.entries(s.porAnio).map(([a, l]) => [a, l.map((m) => (m.deudaId === id ? { ...m, deudaId: null } : m))])) }));
        if (get().nubeUid) await nube.borrarDeuda(id).catch((e) => set({ error: `No se pudo borrar la deuda: ${e instanceof Error ? e.message : e}` }));
      },
      pagarDeuda: async (id, { monto, fecha, metodo }) => {
        const d = get().deudas.find((x) => x.id === id);
        if (!d) return;
        const debo = d.direccion === 'debo';
        await get().guardar(movDeuda(d, 'Pago deuda', debo ? -1 : 1, monto, fecha, metodo, debo ? `Pago a ${d.nombre}` : `Cobro de ${d.nombre}`));
      },
      transferenciasDescartadas: [],
      descartarTransferencia: (clave) => set((s) => ({ transferenciasDescartadas: [...s.transferenciasDescartadas, clave] })),
      convertirEnTransferencia: async ({ egreso: e, ingreso: i, comision }) => {
        if (get().url && !get().nubeUid) return; // la hoja de Google no tiene tipo Transferencia
        const nombre = (id?: string | null) => get().cuentas.find((x) => x.id === id)?.nombre ?? '?';
        await get().eliminar(e);
        await get().eliminar(i);
        await get().guardar({
          fecha: e.fecha, hora: e.hora ?? i.hora ?? null, concepto: `Transferencia ${nombre(e.cuentaId)} → ${nombre(i.cuentaId)}`, valor: i.valor, moneda: e.moneda,
          valorArs: i.valorArs ?? null, tipo: 'Transferencia', metodo: nombre(e.cuentaId), categoria: '', categoria2: '', cuotasCumplidas: null, cuotasTotales: null,
          cuentaId: e.cuentaId, cuentaDestinoId: i.cuentaId,
        });
        // Lo que se quedó el banco en el camino sí es un gasto: queda registrado aparte
        if (comision > 0) {
          await get().guardar({
            fecha: e.fecha, hora: e.hora ?? null, concepto: `Comisión transferencia ${nombre(e.cuentaId)} → ${nombre(i.cuentaId)}`, valor: -comision, moneda: e.moneda,
            valorArs: e.valorArs == null || !e.valor ? null : Math.round(-comision * (e.valorArs / e.valor) * 100) / 100, tipo: 'Egreso', metodo: nombre(e.cuentaId),
            categoria: '', categoria2: '', cuotasCumplidas: null, cuotasTotales: null, cuentaId: e.cuentaId,
          });
        }
      },
      guardarPlanificado: async (p) => {
        const plan: Planificado = { estado: 'pendiente', movimientoId: null, ...p, id: p.id ?? nuevoId() };
        set((s) => ({ planificados: s.planificados.some((x) => x.id === plan.id) ? s.planificados.map((x) => (x.id === plan.id ? plan : x)) : [...s.planificados, plan] }));
        if (get().nubeUid) await nube.guardarPlanificado(plan).catch((e) => set({ error: `No se pudo guardar lo planificado: ${e instanceof Error ? e.message : e}` }));
        return plan;
      },
      borrarPlanificado: async (id) => {
        set((s) => ({ planificados: s.planificados.filter((x) => x.id !== id) }));
        if (get().nubeUid) await nube.borrarPlanificado(id).catch((e) => set({ error: `No se pudo borrar: ${e instanceof Error ? e.message : e}` }));
      },
      cumplirPlanificado: async (id) => {
        const p = get().planificados.find((x) => x.id === id);
        if (!p || p.estado !== 'pendiente') return;
        const { cotizaciones } = get();
        const ars = convertir(p.valor, p.moneda, 'ARS', cotizaciones);
        const movId = get().nubeUid ? nuevoId() : undefined;
        await get().guardar({
          id: movId, fecha: hoyYmd(), hora: null, concepto: p.concepto, valor: p.valor, moneda: p.moneda, tipo: p.tipo, metodo: p.metodo, categoria: p.categoria, categoria2: p.categoria2,
          cuentaId: p.cuentaId, valorArs: ars === null ? null : Math.round(ars * 100) / 100, cuotasCumplidas: null, cuotasTotales: null,
        });
        // El movimiento recién creado es el más nuevo con ese concepto e importe
        const mov = Object.values(get().porAnio).flat().filter((m) => m.concepto === p.concepto && m.valor === p.valor && m.moneda === p.moneda && m.fecha === hoyYmd()).sort((a, b) => (b.id === movId ? 1 : 0) - (a.id === movId ? 1 : 0))[0];
        await get().guardarPlanificado({ ...p, estado: 'cumplido', movimientoId: mov && (!get().nubeUid || !get().pendientes.some((q) => q.kind === 'upsert' && q.m.id === mov.id)) ? mov.id : null });
      },
      deshacerCumplido: async (id) => {
        const p = get().planificados.find((x) => x.id === id);
        if (!p) return;
        const mov = p.movimientoId ? Object.values(get().porAnio).flat().find((m) => m.id === p.movimientoId) : undefined;
        if (mov) await get().eliminar(mov);
        await get().guardarPlanificado({ ...p, estado: 'pendiente', movimientoId: null });
      },
      conciliarPlanificados: async () => {
        const { planificados, porAnio, pendientes, nubeUid } = get();
        const pend = planificados.filter((p) => p.estado === 'pendiente');
        if (!pend.length) return;
        const ocupados = new Set(planificados.map((p) => p.movimientoId).filter(Boolean));
        // En la nube, un movimiento que todavía no se subió no puede enlazarse (el vínculo es una clave foránea)
        const sinSubir = new Set(pendientes.flatMap((q) => (q.kind === 'upsert' ? [q.m.id] : [])));
        const libres = Object.values(porAnio).flat().filter((m) => !ocupados.has(m.id) && m.fecha <= hoyYmd() && // uno con fecha futura todavía no cumplió nada
           !(nubeUid && sinSubir.has(m.id)));
        for (const { plan, mov } of emparejar(pend, libres)) await get().guardarPlanificado({ ...plan, estado: 'cumplido', movimientoId: mov.id });
      },
      // Modo sin nube: crea una cuenta por cada "método" que ya usaste (en la nube lo hace la migración / la base)
      completarCuentas: async () => {
        if (get().nubeUid) return;
        const usados = new Map<string, Movimiento>();
        for (const m of Object.values(get().porAnio).flat()) if (m.metodo.trim() && !usados.has(m.metodo.trim().toLowerCase())) usados.set(m.metodo.trim().toLowerCase(), m);
        for (const m of usados.values()) await cuentaDe({ ...m, cuentaId: null });
      },
      // Crea o edita una cuenta. En la nube se sube ya, antes de que algún movimiento la use.
      guardarCuenta: async (c) => {
        const previa = c.id ? get().cuentas.find((x) => x.id === c.id) : undefined;
        const cuenta: Cuenta = { ...c, id: c.id ?? nuevoId(), activa: c.activa ?? previa?.activa ?? true };
        set((s) => ({ cuentas: previa ? s.cuentas.map((x) => (x.id === cuenta.id ? cuenta : x)) : [...s.cuentas, cuenta] }));
        if (get().nubeUid) {
          try {
            await nube.guardarCuenta(cuenta);
          } catch (e) {
            set({ error: `No se pudo guardar la cuenta: ${e instanceof Error ? e.message : e}` });
          }
        }
        return cuenta;
      },
      metaAhorro: null,
      setMetaAhorro: (metaAhorro) => set({ metaAhorro }),
      tipsOcultos: [],
      catExtra: { cat: [], cat2: [] },
      catOcultas: { cat: [], cat2: ['YUSARI'] },
      agregarCategoria: (nivel, nombre) =>
        set((s) => {
          const n = nombre.trim();
          if (!n) return {};
          const k = claveCat(n);
          return {
            catOcultas: { ...s.catOcultas, [nivel]: s.catOcultas[nivel].filter((x) => claveCat(x) !== k) },
            catExtra: { ...s.catExtra, [nivel]: [...s.catExtra[nivel].filter((x) => claveCat(x) !== k), n] },
          };
        }),
      borrarCategoria: (nivel, nombre) =>
        set((s) => {
          const k = claveCat(nombre);
          return {
            catExtra: { ...s.catExtra, [nivel]: s.catExtra[nivel].filter((x) => claveCat(x) !== k) },
            catOcultas: { ...s.catOcultas, [nivel]: [...s.catOcultas[nivel].filter((x) => claveCat(x) !== k), nombre] },
          };
        }),
      recurrentes: [],
      recienGenerados: [],

      guardarRecurrente: (r) =>
        set((s) => {
          const nuevo: Recurrente = { ...r, id: r.id ?? nuevoId() };
          return { recurrentes: r.id ? s.recurrentes.map((x) => (x.id === r.id ? nuevo : x)) : [...s.recurrentes, nuevo] };
        }),
      borrarRecurrente: (id) => set((s) => ({ recurrentes: s.recurrentes.filter((x) => x.id !== id) })),
      limpiarGenerados: () => set({ recienGenerados: [] }),

      // Carga los recurrentes que ya vencieron (hasta hoy), recuperando hasta 12 meses atrasados.
      // Si en ese mes ya hay un movimiento del mismo tipo y concepto (ej. lo cargaste a mano), no lo duplica.
      generarRecurrentes: async () => {
        const { recurrentes, porAnio, cotizaciones } = get();
        const hoy = hoyYmd();
        const ym = hoy.slice(0, 7);
        const nuevos: Omit<Movimiento, 'id'>[] = [];
        const nombres: string[] = [];
        const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
        const actualizados = recurrentes.map((r) => {
          if (!r.activo) return r;
          let mes = r.ultimoYm && r.ultimoYm >= r.desde ? sumaMes(r.ultimoYm, 1) : r.desde;
          let ultimo = r.ultimoYm;
          for (let n = 0; mes <= ym && n < 12; n++, mes = sumaMes(mes, 1)) {
            const dia = Math.min(r.dia, diasDelMes(mes));
            if (mes === ym && dia > +hoy.slice(8)) break; // todavía no llegó el día
            ultimo = mes;
            if (movimientosDe(porAnio, mes).some((m) => m.tipo === r.tipo && igual(m.concepto, r.concepto))) continue;
            const { id: _, dia: __, desde: ___, activo: ____, ultimoYm: _____, ...campos } = r;
            const valorArs = convertir(r.valor, r.moneda, 'ARS', cotizaciones);
            nuevos.push({ ...campos, fecha: `${mes}-${String(dia).padStart(2, '0')}`, valorArs: valorArs === null ? null : Math.round(valorArs * 100) / 100, cuotasCumplidas: null, cuotasTotales: null });
            nombres.push(r.concepto);
          }
          return ultimo === r.ultimoYm ? r : { ...r, ultimoYm: ultimo };
        });
        set({ recurrentes: actualizados, ...(nombres.length ? { recienGenerados: nombres } : {}) });
        if (nuevos.length) await get().guardar(...nuevos);
      },

      setSaldoInicial: (anio, m, valor) =>
        set((s) => ({ saldosIniciales: { ...s.saldosIniciales, [anio]: { ...s.saldosIniciales[anio], [m]: valor } } })),
      setAhorroInicial: (anio, m, valor) =>
        set((s) => ({ ahorrosIniciales: { ...s.ahorrosIniciales, [anio]: { ...s.ahorrosIniciales[anio], [m]: valor } } })),
      monedaVista: 'ARS',
      fuenteUsd: 'blue',
      cotizaciones: { USD: 0, USDT: 0, fecha: null },
      cotizHist: {},

      setPresupuesto: (categoria, p) =>
        set((s) => {
          const { [categoria]: _, ...resto } = s.presupuestos;
          return { presupuestos: p && p.monto > 0 ? { ...resto, [categoria]: p } : resto };
        }),
      setMonedaVista: (monedaVista) => set({ monedaVista }),
      setFuenteUsd: (fuenteUsd) => {
        set({ fuenteUsd });
        get().actualizarCotizaciones();
      },
      setCotizacion: (m, valor) => set((s) => ({ cotizaciones: { ...s.cotizaciones, [m]: valor } })),

      // Cotizaciones de dolarapi.com (precio de venta). Si falla, se mantienen las anteriores.
      actualizarCotizaciones: async () => {
        try {
          const venta = async (casa: string) => {
            const r = await fetch(`https://dolarapi.com/v1/dolares/${casa}`);
            const j = await r.json();
            if (!(j.venta > 0)) throw new Error('Cotización inválida');
            return j.venta as number;
          };
          const [USD, USDT] = await Promise.all([venta(get().fuenteUsd), venta('cripto')]);
          set((s) => ({
            cotizaciones: { USD, USDT, fecha: new Date().toISOString() },
            // Se guarda la de hoy (se pisa si se baja de nuevo); solo se conservan las últimas ~2 años
            cotizHist: Object.fromEntries(Object.entries({ ...s.cotizHist, [hoyYmd()]: { USD, USDT } }).sort(([a], [b]) => a.localeCompare(b)).slice(-740)),
          }));
        } catch {
          // sin internet: se usan las últimas guardadas
        }
      },
      ocultarTip: (id) => set((s) => ({ tipsOcultos: [...s.tipsOcultos, id] })),
      mostrarTips: () => set({ tipsOcultos: [] }),

      setConfig: (url, token) => set({ url: url.trim(), token: token.trim() }),

      setMes: (ym) => {
        const cambioAnio = ym.slice(0, 4) !== get().mes.slice(0, 4);
        set({ mes: ym });
        if (cambioAnio) get().sincronizar();
      },

      // Optimista: se aplica local y se encola; sincronizar() lo envía a la hoja.
      // Acepta varios movimientos (ej. las dos patas de un cambio de moneda).
      guardar: async (...inputs) => {
        for (const input of inputs) {
          // El script de la hoja de Google solo conoce estos tipos: otro se escribiría y desaparecería al sincronizar
          if (get().url && !get().nubeUid && !['Ingreso', 'Egreso', 'Ahorro', 'Cambio'].includes(input.tipo)) {
            set({ error: `Con la hoja de Google conectada no se puede guardar un movimiento de tipo "${input.tipo}". Usá tu cuenta de Yuro.` });
            continue;
          }
          const m: Movimiento = { ...input, id: input.id ?? (get().nubeUid ? nuevoId() : `n-${Date.now()}${Math.random().toString(36).slice(2, 6)}`) };
          m.cuentaId = await cuentaDe(m);
          if (!m.categoria && (m.tipo === 'Ingreso' || m.tipo === 'Egreso')) {
            const regla = buscarRegla(get().reglas, m.concepto);
            if (regla) { m.categoria = regla.categoria; m.categoria2 = m.categoria2 || regla.categoria2; }
          }
          const anio = anioDe(m.fecha);
          set((s) => {
            const lista = s.porAnio[anio] ?? [];
            const yaEncolado = s.pendientes.some((p) => p.kind === 'upsert' && p.m.id === m.id);
            return {
              porAnio: { ...s.porAnio, [anio]: [m, ...lista.filter((x) => x.id !== m.id)] },
              pendientes: yaEncolado
                ? s.pendientes.map((p) => (p.kind === 'upsert' && p.m.id === m.id ? { ...p, anio, m } : p))
                : [...s.pendientes, { kind: 'upsert', anio, m }],
            };
          });
        }
        await get().sincronizar();
        await get().conciliarPlanificados();
      },

      eliminar: async (m) => {
        // Si este movimiento había cumplido algo planificado, eso vuelve a quedar pendiente (lo esperado no ocurrió)
        for (const p of get().planificados.filter((x) => x.movimientoId === m.id && x.estado === 'cumplido')) {
          void get().guardarPlanificado({ ...p, estado: 'pendiente', movimientoId: null });
        }
        const anio = anioDe(m.fecha);
        set((s) => {
          // Un "n-…" con su alta todavía en cola nunca llegó a la hoja: basta con descartarlo.
          // Si ya se subió (pero aún no tiene id real), se borra buscándolo por fecha y concepto (fila 0).
          const enCola = s.pendientes.some((p) => p.kind === 'upsert' && p.m.id === m.id);
          const id = m.id.startsWith('n-') ? `0|${m.fecha}|${m.concepto}` : m.id;
          return {
            porAnio: { ...s.porAnio, [anio]: (s.porAnio[anio] ?? []).filter((x) => x.id !== m.id) },
            pendientes: [
              ...s.pendientes.filter((p) => !(p.kind === 'upsert' && p.m.id === m.id)),
              ...(m.id.startsWith('n-') && enCola ? [] : [{ kind: 'delete', anio, id } as Op]),
            ],
          };
        });
        await get().sincronizar();
      },

      conectarNube: async ({ subirLocal }) => {
        const uid = await requiereSesion();
        let porAnio = get().porAnio;
        if (subirLocal) {
          const { url, token } = get();
          // Con una hoja conectada, primero se sube lo pendiente y después se lee la hoja entera (es la fuente de verdad).
          if (url && token) {
            await get().sincronizar();
            if (get().error || get().pendientes.length) throw new Error('Antes de migrar hay que sincronizar bien con Google Sheets');
            const hoy = new Date().getFullYear();
            porAnio = { ...porAnio };
            for (const a of new Set([hoy, hoy - 1, ...Object.keys(porAnio).map(Number)])) {
              try {
                const r = await sheets.list(url, token, a);
                if (r.version < 3) throw new Error('Actualizá el Apps Script antes de migrar: la versión vieja no guarda la moneda');
                porAnio[a] = r.movimientos;
              } catch (e) {
                if (!(e instanceof Error) || !e.message.includes('No existe la pestaña')) throw e;
              }
            }
          }
          // Solo se sube lo que todavía no está en la nube (ids no uuid). Repetir la migración no duplica nada.
          const conteo = new Map<string, number>();
          const movs = Object.values(porAnio).flat().filter((m) => !esUuid(m.id)).map((m) => {
            const base = `${m.fecha}|${m.concepto}|${m.valor}|${m.moneda}`;
            const k = conteo.get(base) ?? 0;
            conteo.set(base, k + 1);
            return { m, externalId: `mig|${base}|${k}` };
          });
          const remap = await nube.guardarCuentas(uid, get().cuentas);
          const planesLocales = get().planificados.map((p) => ({ ...p, id: esUuid(p.id) ? p.id : nuevoId(), cuentaId: p.cuentaId ? remap.get(p.cuentaId) ?? p.cuentaId : null, movimientoId: null }));
          const reenlazar = (id?: string | null) => (id ? remap.get(id) ?? id : null);
          await nube.importar(uid, movs.map(({ m, externalId }) => ({ m: { ...m, cuentaId: reenlazar(m.cuentaId), cuentaDestinoId: reenlazar(m.cuentaDestinoId) }, externalId })));
          set((s) => ({ recurrentes: s.recurrentes.map((r) => (esUuid(r.id) ? r : { ...r, id: nuevoId() })) }));
          await nube.subirAjustes(ajustesDe(get()));
          await nube.guardarPlanificados(uid, planesLocales);
          await nube.guardarDeudas(uid, get().deudas);
          await nube.guardarReglas(uid, get().reglas);
          await nube.guardarReservas(uid, get().reservas.map((r) => ({ ...r, cuentaId: r.cuentaId ? remap.get(r.cuentaId) ?? r.cuentaId : null })));
        }
        // Se baja todo de la nube: de acá en más los ids locales son los de la base.
        const todos = await nube.listar('1900-01-01', '2999-12-31');
        const nuevo: Record<string, Movimiento[]> = {};
        for (const m of todos) (nuevo[m.fecha.slice(0, 4)] ??= []).push(m);
        const ajustes = subirLocal ? null : await nube.bajarAjustes();
        const extras = await bajarExtras();
        const { cuentas, planificados, deudas, reservas, reglas } = extras;
        aplicandoRemoto = true;
        set({ ...ajustes, cuentas, planificados, deudas, reservas, reglas, nubeUid: uid, porAnio: nuevo, pendientes: [], error: null, ultimaSync: new Date().toISOString() });
        aplicandoRemoto = false;
      },

      desconectarNube: () => {
        clearTimeout(temporizador); // un cambio de ajustes pendiente de subir no debe correr después de vaciar el teléfono
        set({
          nubeUid: null, porAnio: {}, pendientes: [], recienGenerados: [], cuentas: [], planificados: [], deudas: [], reservas: [], reglas: [], sugerenciasIA: [], iaVistos: [], ultimaSync: null, presupuestos: {}, recurrentes: [], saldosIniciales: {}, ahorrosIniciales: {},
          metaAhorro: null, catExtra: { cat: [], cat2: [] }, catOcultas: { cat: [], cat2: ['YUSARI'] },
        });
      },

      sincronizar: async () => {
        const { url, token, sincronizando } = get();
        const sincronizarNube = async () => {
          if (sincronizando) return;
          set({ sincronizando: true, error: null });
          try {
            await requiereSesion();
            let op: Op | undefined;
            while ((op = get().pendientes[0])) {
              try {
                if (op.kind === 'upsert') await nube.guardar(op.m);
                else await nube.borrar(op.id);
              } catch (e) {
                const que = op.kind === 'upsert' ? `subir "${op.m.concepto}"` : 'borrar un movimiento';
                throw new Error(`No se pudo ${que}: ${e instanceof Error ? e.message : e}`);
              }
              const hecho = op;
              set((s) => ({ pendientes: s.pendientes.filter((p) => p !== hecho) }));
            }
            const anio = +get().mes.slice(0, 4);
            const bajados = await nube.listar(`${anio}-01-01`, `${anio}-12-31`);
            set(await bajarExtras());
            set((s) => {
              // Lo que se cargó mientras se bajaba todavía no está en la nube: se mantiene a la vista hasta subirlo
              const enCola = s.pendientes.flatMap((p) => (p.kind === 'upsert' && p.anio === anio ? [p.m] : []));
              const lista = [...enCola, ...bajados.filter((m) => !enCola.some((x) => x.id === m.id))];
              return { porAnio: { ...s.porAnio, [anio]: lista }, ultimaSync: new Date().toISOString() };
            });
            // Los saldos arrastran de un año al siguiente: si todavía no están los años anteriores, se bajan (una sola vez).
            if (!((anio - 1) in get().porAnio)) {
              const antes: Record<string, Movimiento[]> = { [anio - 1]: [] };
              for (const m of await nube.listar('1900-01-01', `${anio - 1}-12-31`)) (antes[m.fecha.slice(0, 4)] ??= []).push(m);
              set((s) => ({ porAnio: { ...antes, ...s.porAnio } }));
            }
          } catch (e) {
            set({ error: e instanceof Error ? e.message : 'Error de sincronización' });
          } finally {
            set({ sincronizando: false });
          }
          if (!get().error && get().pendientes.length) await get().sincronizar();
        };
        // Un alta ya subida pasa a tener su id real: si se edita o borra antes de recargar, no se duplica.
        const reemplazarId = (viejo: string, nuevo: string) =>
          set((s) => ({
            porAnio: Object.fromEntries(Object.entries(s.porAnio).map(([a, l]) => [a, l.map((x) => (x.id === viejo ? { ...x, id: nuevo } : x))])),
            pendientes: s.pendientes.map((p) => (p.kind === 'upsert' && p.m.id === viejo ? { ...p, m: { ...p.m, id: nuevo } } : p)),
          }));
        const { fecha } = get().cotizaciones;
        if (!fecha || Date.now() - Date.parse(fecha) > 3600_000) get().actualizarCotizaciones();
        if (get().nubeUid) return sincronizarNube();
        if (!url || !token || sincronizando) return;
        set({ sincronizando: true, error: null });
        try {
          // 1) subir cambios pendientes en orden (incluye los que se agreguen mientras tanto)
          let op: Op | undefined;
          while ((op = get().pendientes[0])) {
            try {
              if (op.kind === 'upsert') {
                const r = await sheets.upsert(url, token, op.anio, op.m);
                const hecho = op;
                set((s) => ({ pendientes: s.pendientes.filter((p) => p !== hecho) }));
                if (r.id && op.m.id.startsWith('n-')) reemplazarId(op.m.id, r.id);
              } else await sheets.remove(url, token, op.anio, op.id);
            } catch (e) {
              // La fila ya no es la misma en la hoja: se descarta para no trabar la cola.
              if (!(e instanceof Error) || e.message !== 'FILA_CAMBIO') {
                const que = op.kind === 'upsert' ? `subir "${op.m.concepto}"` : 'borrar un movimiento';
                throw new Error(`No se pudo ${que}: ${e instanceof Error ? e.message : e}`);
              }
              set({ error: 'Una fila cambió en la hoja y no se pudo aplicar ese cambio.' });
            }
            set((s) => ({ pendientes: s.pendientes.filter((p) => p !== op) }));
          }
          // 2) bajar el año seleccionado (la hoja es la fuente de verdad)
          const anio = +get().mes.slice(0, 4);
          const { movimientos, version } = await sheets.list(url, token, anio);
          set((s) => {
            // Un script viejo no devuelve la moneda: se conserva la que ya se conocía para no pasar todo a ARS.
            const antes = new Map((s.porAnio[anio] ?? []).map((m) => [m.id, m.moneda]));
            const bajados = version >= 3 ? movimientos : movimientos.map((m) => ({ ...m, moneda: antes.get(m.id) ?? m.moneda }));
            // Lo que se cargó mientras se bajaba la hoja todavía no está en ella: se mantiene a la vista hasta subirlo
            const enCola = s.pendientes.flatMap((p) => (p.kind === 'upsert' && p.anio === anio ? [p.m] : []));
            const lista = [...enCola, ...bajados.filter((m) => !enCola.some((x) => x.id === m.id))];
            return { porAnio: { ...s.porAnio, [anio]: lista }, ultimaSync: new Date().toISOString(), versionScript: version };
          });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Error de sincronización' });
        } finally {
          set({ sincronizando: false });
        }
        // Si se agregaron cambios al final (ej. recurrentes generados mientras se bajaba la hoja), se suben ya
        if (!get().error && get().pendientes.length) await get().sincronizar();
      },
    }),
    {
      name: 'finanzas-v2',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // v0 → v1: los movimientos guardados no tenían moneda (eran todos en pesos)
      migrate: (viejo, version) => {
        const st = viejo as Partial<State>;
        if (version < 1) {
          const conMoneda = (m: Movimiento) => ({ ...m, moneda: m.moneda ?? 'ARS' });
          st.porAnio = Object.fromEntries(Object.entries(st.porAnio ?? {}).map(([a, l]) => [a, l.map(conMoneda)]));
          st.pendientes = (st.pendientes ?? []).map((p) => (p.kind === 'upsert' ? { ...p, m: conMoneda(p.m) } : p));
          st.presupuestos = {};
        }
        return st as State;
      },
      partialize: (s) => ({
        nubeUid: s.nubeUid, modoLocal: s.modoLocal, url: s.url, token: s.token, porAnio: s.porAnio, pendientes: s.pendientes, ultimaSync: s.ultimaSync, versionScript: s.versionScript,
        presupuestos: s.presupuestos, recurrentes: s.recurrentes, recienGenerados: s.recienGenerados, saldosIniciales: s.saldosIniciales, ahorrosIniciales: s.ahorrosIniciales, cuentas: s.cuentas, planificados: s.planificados, deudas: s.deudas, reservas: s.reservas, reglas: s.reglas, iaActiva: s.iaActiva, iaProveedor: s.iaProveedor, iaUrl: s.iaUrl, iaModelo: s.iaModelo, sugerenciasIA: s.sugerenciasIA, iaVistos: s.iaVistos, transferenciasDescartadas: s.transferenciasDescartadas, metaAhorro: s.metaAhorro, tipsOcultos: s.tipsOcultos, catExtra: s.catExtra, catOcultas: s.catOcultas, monedaVista: s.monedaVista, fuenteUsd: s.fuenteUsd, cotizaciones: s.cotizaciones, cotizHist: s.cotizHist,
      }),
    },
  ),
);

// Los ajustes (presupuestos, recurrentes, saldos…) se suben solos a la nube unos segundos después de cada cambio.
const ajustesDe = (s: State): DatosNube => ({
  monedaVista: s.monedaVista, fuenteUsd: s.fuenteUsd, metaAhorro: s.metaAhorro, presupuestos: s.presupuestos, recurrentes: s.recurrentes,
  saldosIniciales: s.saldosIniciales, ahorrosIniciales: s.ahorrosIniciales, catExtra: s.catExtra, catOcultas: s.catOcultas,
});
let aplicandoRemoto = false;
let temporizador: ReturnType<typeof setTimeout> | undefined;
useFinanzas.subscribe((s, previo) => {
  if (!s.nubeUid || aplicandoRemoto) return;
  const a = ajustesDe(s);
  const b = ajustesDe(previo);
  if ((Object.keys(a) as (keyof DatosNube)[]).every((k) => a[k] === b[k])) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    // Si mientras tanto se cerró la sesión (el teléfono se vació), subir ajustes vacíos borraría los de la cuenta
    if (!useFinanzas.getState().nubeUid) return;
    nube.subirAjustes(ajustesDe(useFinanzas.getState())).catch((e) => useFinanzas.setState({ error: `No se pudieron guardar los ajustes: ${e instanceof Error ? e.message : e}` }));
  }, 2000);
});

const claveCat = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Categorías para elegir: las de base + las que agregaste + las usadas en la hoja, sin las borradas.
export const useCategorias = (nivel: Nivel) => {
  const porAnio = useFinanzas((s) => s.porAnio);
  const extra = useFinanzas((s) => s.catExtra[nivel]);
  const ocultas = useFinanzas((s) => s.catOcultas[nivel]);
  return useMemo(() => {
    const fuera = new Set(ocultas.map(claveCat));
    const vistas = new Set<string>();
    const usadas = Object.values(porAnio).flat().map((m) => (nivel === 'cat' ? m.categoria : m.categoria2));
    return [...(nivel === 'cat' ? CATEGORIAS : CATEGORIAS2), ...extra, ...usadas].filter((x) => {
      const k = claveCat(x ?? '');
      if (!k || fuera.has(k) || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
  }, [porAnio, extra, ocultas, nivel]);
};

export const movimientosDe = (porAnio: Record<string, Movimiento[]>, ym: string) =>
  (porAnio[ym.slice(0, 4)] ?? []).filter((m) => m.fecha.startsWith(ym));

export const useMovimientosMes = () => {
  const mes = useFinanzas((s) => s.mes);
  const lista = useFinanzas((s) => s.porAnio[mes.slice(0, 4)]);
  return { mes, movimientos: (lista ?? []).filter((m) => m.fecha.startsWith(mes)) };
};

// Convierte entre monedas pasando por pesos. Devuelve null si falta la cotización.
export const convertir = (v: number, de: Moneda, a: Moneda, cot: Cotizaciones) => {
  if (de === a) return v;
  const enPesos = (m: Moneda) => (m === 'ARS' ? 1 : cot[m]);
  if (!enPesos(de) || !enPesos(a)) return null;
  return (v * enPesos(de)) / enPesos(a);
};

// Conversor a la moneda de vista; `falta` avisa si algún movimiento no se pudo convertir.
export const useConversor = () => {
  const vista = useFinanzas((s) => s.monedaVista);
  const cot = useFinanzas((s) => s.cotizaciones);
  return {
    vista,
    cot,
    conv: (v: number, de: Moneda) => convertir(v, de, vista, cot) ?? 0,
    puede: (de: Moneda) => convertir(1, de, vista, cot) !== null,
  };
};

export type Saldo = { moneda: Moneda; disponible: number; ahorrado: number; total: number; usada: boolean };
type Ajustes = State['saldosIniciales'];

// Cuánto tenés de cada moneda al cierre del mes `ym`. Arrastra año a año: lo que cerró diciembre es lo que abre enero.
// - total: saldo inicial + todo lo que entró/salió (los movimientos de Ahorro no restan: esa plata sigue siendo tuya)
// - ahorrado: ajuste de ahorro + movimientos de Ahorro. Ajustarlo solo mueve plata entre disponible y ahorrado.
// Los ajustes de cada año (iniciales / ahorros) se suman al saldo que venía del año anterior.
export const saldosAl = (porAnio: Record<string, Movimiento[]>, iniciales: Ajustes, ahorros: Ajustes, ym: string): Saldo[] => {
  const anio = +ym.slice(0, 4);
  const hoy = hoyYmd();
  const conDatos = Object.keys(porAnio).filter((a) => porAnio[a]?.length);
  const primero = Math.min(anio, ...[...conDatos, ...Object.keys(iniciales), ...Object.keys(ahorros)].map(Number));
  return MONEDAS.map((moneda) => {
    let total = 0;
    let ahorrado = 0;
    let usada = false;
    for (let a = primero; a <= anio; a++) {
      const hasta = a === anio ? ym : `${a}-12`;
      // Una transferencia entre cuentas propias no cambia cuánto tenés en total
      const l = (porAnio[a] ?? []).filter((m) => m.moneda === moneda && m.fecha.slice(0, 7) <= hasta && m.fecha <= hoy && m.tipo !== 'Transferencia'); // lo programado para más adelante todavía no cuenta
      const inicial = iniciales[a]?.[moneda] ?? 0;
      const ahorroIni = ahorros[a]?.[moneda] ?? 0;
      const ahorroMov = -l.filter((m) => m.tipo === 'Ahorro').reduce((x, m) => x + m.valor, 0);
      total += inicial + l.reduce((x, m) => x + m.valor, 0) + ahorroMov;
      ahorrado += ahorroIni + ahorroMov;
      usada ||= l.length > 0 || inicial !== 0 || ahorroIni !== 0;
    }
    return { moneda, disponible: total - ahorrado, ahorrado, total, usada };
  });
};

export type SaldosCuenta = Partial<Record<Moneda, number>>;

// Cuánta plata hay en cada cuenta (por moneda): saldo inicial + lo que entró − lo que salió. Una transferencia resta en el
// origen y suma en el destino. Los movimientos sin cuenta no entran. Los ahorros se cuentan como plata que salió de la cuenta.
export const saldosPorCuenta = (porAnio: Record<string, Movimiento[]>, cuentas: Cuenta[]): Map<string, SaldosCuenta> => {
  const out = new Map<string, SaldosCuenta>();
  const sumar = (id: string | null | undefined, moneda: Moneda, v: number) => {
    if (!id) return;
    const s = out.get(id) ?? {};
    s[moneda] = Math.round(((s[moneda] ?? 0) + v) * 100) / 100;
    out.set(id, s);
  };
  for (const c of cuentas) if (c.saldoInicial) sumar(c.id, c.moneda, c.saldoInicial);
  const hoy = hoyYmd();
  for (const m of Object.values(porAnio).flat()) {
    if (m.fecha > hoy) continue; // lo programado para más adelante todavía no está en la cuenta
    if (m.tipo === 'Transferencia') {
      sumar(m.cuentaId, m.moneda, -Math.abs(m.valor));
      sumar(m.cuentaDestinoId, m.moneda, Math.abs(m.valor));
    } else sumar(m.cuentaId, m.moneda, m.valor);
  }
  return out;
};

// Gastos e ingresos de las últimas semanas que parecen una transferencia entre tus cuentas (para confirmar o descartar)
export const useTransferenciasSugeridas = () => {
  const porAnio = useFinanzas((s) => s.porAnio);
  const descartadas = useFinanzas((s) => s.transferenciasDescartadas);
  return useMemo(() => {
    const desde = ymdMenos(180);
    const recientes = Object.values(porAnio).flat().filter((m) => m.fecha >= desde);
    return detectarTransferencias(recientes, new Set(descartadas));
  }, [porAnio, descartadas]);
};

// Agenda del mes elegido: todo lo que todavía no pasó o ya se cumplió, venga de donde venga.
//  - plan: un planificado cargado a mano
//  - movimiento: un gasto/ingreso/ahorro con fecha futura (programado)
//  - recurrente: una suscripción o movimiento que se repite todos los meses
// Los pendientes de meses anteriores que no llegaron siguen a la vista solo en el mes actual.
export type ItemAgenda = {
  id: string; concepto: string; valor: number; moneda: Moneda; fecha: string; estado: 'pendiente' | 'cumplido';
  origen: 'plan' | 'movimiento' | 'recurrente'; plan?: Planificado; movimiento?: Movimiento; recurrenteId?: string;
};

export const useAgenda = (): ItemAgenda[] => {
  const mes = useFinanzas((s) => s.mes);
  const planificados = useFinanzas((s) => s.planificados);
  const recurrentes = useFinanzas((s) => s.recurrentes);
  const delAnio = useFinanzas((s) => s.porAnio[mes.slice(0, 4)]);
  return useMemo(() => {
    const hoy = hoyYmd();
    const delMes = (delAnio ?? []).filter((m) => m.fecha.startsWith(mes));
    const lista: ItemAgenda[] = planificados
      .filter((p) => (p.estado === 'cumplido' && p.fecha.startsWith(mes)) || (p.estado === 'pendiente' && (p.fecha.startsWith(mes) || (mes === mesActual() && p.fecha.slice(0, 7) < mes))))
      .map((p) => ({ id: p.id, concepto: p.concepto, valor: p.valor, moneda: p.moneda, fecha: p.fecha, estado: p.estado as 'pendiente' | 'cumplido', origen: 'plan' as const, plan: p }));
    for (const m of delMes) {
      if (m.fecha > hoy && (m.tipo === 'Ingreso' || m.tipo === 'Egreso' || m.tipo === 'Ahorro')) {
        lista.push({ id: m.id, concepto: m.concepto, valor: m.valor, moneda: m.moneda, fecha: m.fecha, estado: 'pendiente', origen: 'movimiento', movimiento: m });
      }
    }
    const mismo = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    for (const r of recurrentes) {
      if (!r.activo || r.desde > mes) continue;
      // Si ese mes ya hay un movimiento igual (cargado a mano) la recurrente no suma otro: si ya ocurrió figura cumplida; si es futuro ya está como programado
      const real = delMes.find((m) => m.tipo === r.tipo && mismo(m.concepto, r.concepto));
      if (real && real.fecha > hoy) continue;
      const cargado = !!real || (!!r.ultimoYm && r.ultimoYm >= mes);
      if (!cargado && lista.some((i) => i.estado === 'pendiente' && mismo(i.concepto, r.concepto))) continue; // ya está como planificado: no se cuenta dos veces
      lista.push({
        id: `rec-${r.id}`, concepto: r.concepto, valor: r.valor, moneda: r.moneda, estado: cargado ? 'cumplido' : 'pendiente', origen: 'recurrente', recurrenteId: r.id,
        fecha: `${mes}-${String(Math.min(r.dia, diasDelMes(mes))).padStart(2, '0')}`,
      });
    }
    return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [planificados, recurrentes, delAnio, mes]);
};

// Cada deuda con lo pagado y lo que falta (los pagos salen de los movimientos cargados)
export const useResumenDeudas = (): ResumenDeuda[] => {
  const deudas = useFinanzas((s) => s.deudas);
  const porAnio = useFinanzas((s) => s.porAnio);
  return useMemo(() => {
    const movs = Object.values(porAnio).flat().filter((m) => m.deudaId);
    return deudas.map((d) => resumenDeuda(d, movs));
  }, [deudas, porAnio]);
};

// ───────── Patrimonio ─────────
// Patrimonio = todo lo que tenés (dinero en todas tus monedas, ahorros incluidos) + lo que te deben − lo que debés.
// Se valúa en la moneda de vista con la cotización de cada mes cuando la app la tiene guardada (se guarda una por día en que
// se actualiza); los meses anteriores a eso usan la de hoy.
export type PuntoPatrimonio = { ym: string; efectivo: number; cobrar: number; deber: number; total: number };

export const usePatrimonio = (meses: number): PuntoPatrimonio[] => {
  const porAnio = useFinanzas((s) => s.porAnio);
  const iniciales = useFinanzas((s) => s.saldosIniciales);
  const ahorros = useFinanzas((s) => s.ahorrosIniciales);
  const deudas = useFinanzas((s) => s.deudas);
  const cot = useFinanzas((s) => s.cotizaciones);
  const hist = useFinanzas((s) => s.cotizHist);
  const vista = useFinanzas((s) => s.monedaVista);
  return useMemo(() => {
    const fechasHist = Object.keys(hist).sort();
    const pagos = Object.values(porAnio).flat().filter((m) => m.deudaId && m.tipo === 'Pago deuda');
    const hoy = mesActual();
    return Array.from({ length: meses }, (_, i) => {
      const ym = sumaMes(hoy, i - (meses - 1));
      const fin = `${ym}-${String(diasDelMes(ym)).padStart(2, '0')}`;
      // Cotización de ese mes: la última guardada hasta fin de mes (si todavía no hay, la de hoy)
      const f = [...fechasHist].reverse().find((d) => d <= fin);
      const cotMes = f ? { ...hist[f], fecha: f } : cot;
      const enVista = (v: number, m: Moneda) => convertir(v, m, vista, cotMes) ?? convertir(v, m, vista, cot) ?? 0;
      const efectivo = saldosAl(porAnio, iniciales, ahorros, ym).reduce((a, x) => a + enVista(x.total, x.moneda), 0);
      let cobrar = 0;
      let deber = 0;
      for (const d of deudas) {
        if (d.fecha > fin) continue; // todavía no existía
        const pagado = pagos.filter((m) => m.deudaId === d.id && m.fecha <= fin).reduce((a, m) => a + Math.abs(m.valor), 0);
        const pendiente = enVista(Math.max(0, d.monto - pagado), d.moneda);
        if (d.direccion === 'me_deben') cobrar += pendiente;
        else deber += pendiente;
      }
      return { ym, efectivo, cobrar, deber, total: efectivo + cobrar - deber };
    });
  }, [porAnio, iniciales, ahorros, deudas, cot, hist, vista, meses]);
};

// Cuánto queda de cada reserva según los gastos reales que la descuentan
export const useReservas = (): EstadoReserva[] => {
  const reservas = useFinanzas((s) => s.reservas);
  const cuentas = useFinanzas((s) => s.cuentas);
  const porAnio = useFinanzas((s) => s.porAnio);
  return useMemo(() => estadosReservas(reservas, Object.values(porAnio).flat(), cuentas, hoyYmd()), [reservas, cuentas, porAnio]);
};

// ───────── Alertas ─────────
// Lo que necesita atención hoy, en un solo lugar: presupuestos, reservas, deudas y planificados.
export type Alerta = { id: string; nivel: 'rojo' | 'amarillo'; texto: string; ruta: '/presupuestos' | '/reservas' | '/deudas' | '/planificados' };

export const useAlertas = (): Alerta[] => {
  const presupuestos = useFinanzas((s) => s.presupuestos);
  const planificados = useFinanzas((s) => s.planificados);
  const porAnio = useFinanzas((s) => s.porAnio);
  const cot = useFinanzas((s) => s.cotizaciones);
  const reservas = useReservas();
  const deudas = useResumenDeudas();
  return useMemo(() => {
    const out: Alerta[] = [];
    const hoy = hoyYmd();
    const ym = hoy.slice(0, 7);
    // Presupuestos: lo gastado este mes (en pesos) contra el tope de cada categoría
    const gastado: Record<string, number> = {};
    for (const m of porAnio[ym.slice(0, 4)] ?? []) {
      if (m.tipo === 'Egreso' && m.fecha.startsWith(ym) && m.fecha <= hoy) gastado[m.categoria] = (gastado[m.categoria] ?? 0) - (convertir(m.valor, m.moneda, 'ARS', cot) ?? 0);
    }
    for (const [cat, p] of Object.entries(presupuestos)) {
      const tope = convertir(p.monto, p.moneda, 'ARS', cot) ?? 0;
      const g = gastado[cat] ?? 0;
      if (tope <= 0) continue;
      if (g >= tope) out.push({ id: `pre-${cat}`, nivel: 'rojo', texto: `Te pasaste del presupuesto de ${cat}`, ruta: '/presupuestos' });
      else if (g >= tope * 0.8) out.push({ id: `pre-${cat}`, nivel: 'amarillo', texto: `Vas por el ${Math.round((g / tope) * 100)}% del presupuesto de ${cat}`, ruta: '/presupuestos' });
    }
    for (const e of reservas) {
      if (e.queda < 0) out.push({ id: `res-${e.reserva.id}`, nivel: 'rojo', texto: `Te pasaste de la reserva "${e.reserva.nombre}"`, ruta: '/reservas' });
      else if (e.reserva.monto > 0 && e.queda <= e.reserva.monto * 0.2) out.push({ id: `res-${e.reserva.id}`, nivel: 'amarillo', texto: `A la reserva "${e.reserva.nombre}" le queda poco`, ruta: '/reservas' });
    }
    const en3 = new Date(Date.now() + 3 * 86400000);
    const limite = `${en3.getFullYear()}-${String(en3.getMonth() + 1).padStart(2, '0')}-${String(en3.getDate()).padStart(2, '0')}`;
    for (const r of deudas) {
      if (!r.deuda.activa || r.saldada || !r.deuda.vencimiento) continue;
      if (r.deuda.vencimiento < hoy) out.push({ id: `deu-${r.deuda.id}`, nivel: 'rojo', texto: `${r.deuda.direccion === 'debo' ? 'Venció tu deuda con' : 'Venció lo que te debe'} ${r.deuda.nombre}`, ruta: '/deudas' });
      else if (r.deuda.vencimiento <= limite) out.push({ id: `deu-${r.deuda.id}`, nivel: 'amarillo', texto: `${r.deuda.direccion === 'debo' ? 'Vence pronto tu deuda con' : 'Vence pronto lo que te debe'} ${r.deuda.nombre}`, ruta: '/deudas' });
    }
    for (const p of planificados) {
      if (p.estado === 'pendiente' && p.fecha < hoy) out.push({ id: `pla-${p.id}`, nivel: 'amarillo', texto: `Todavía no llegó: ${p.concepto}`, ruta: '/planificados' });
    }
    return out.sort((a, b) => Number(b.nivel === 'rojo') - Number(a.nivel === 'rojo'));
  }, [presupuestos, planificados, porAnio, cot, reservas, deudas]);
};
