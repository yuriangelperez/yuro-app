import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { sheets } from './sheets';
import { MONEDAS, type Moneda, type Movimiento } from './types';
import { diasDelMes, hoyYmd, mesActual, sumaMes } from './util';

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
  recurrentes: Recurrente[];
  recienGenerados: string[]; // conceptos cargados solos en la última pasada (para avisar)
  guardarRecurrente: (r: Omit<Recurrente, 'id'> & { id?: string }) => void;
  borrarRecurrente: (id: string) => void;
  generarRecurrentes: () => Promise<void>;
  limpiarGenerados: () => void;
  monedaVista: Moneda; // en qué moneda se muestran los totales
  fuenteUsd: FuenteUsd;
  cotizaciones: Cotizaciones;
  saldosIniciales: Record<string, Partial<Record<Moneda, number>>>; // por año: lo que tenías el 1 de enero
  setSaldoInicial: (anio: string, m: Moneda, valor: number) => void;
  ahorrosIniciales: Record<string, Partial<Record<Moneda, number>>>; // por año: ajuste de lo ahorrado (ej. si usaste ahorros)
  setAhorroInicial: (anio: string, m: Moneda, valor: number) => void;
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
}

const anioDe = (fecha: string) => +fecha.slice(0, 4);

export const useFinanzas = create<State>()(
  persist(
    (set, get) => ({
      url: '',
      token: '',
      mes: mesActual(),
      porAnio: {},
      pendientes: [],
      sincronizando: false,
      error: null,
      ultimaSync: null,
      versionScript: null,
      presupuestos: {},
      saldosIniciales: {},
      ahorrosIniciales: {},
      metaAhorro: null,
      setMetaAhorro: (metaAhorro) => set({ metaAhorro }),
      tipsOcultos: [],
      recurrentes: [],
      recienGenerados: [],

      guardarRecurrente: (r) =>
        set((s) => {
          const nuevo: Recurrente = { ...r, id: r.id ?? `r-${Date.now()}${Math.random().toString(36).slice(2, 6)}` };
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
          set({ cotizaciones: { USD, USDT, fecha: new Date().toISOString() } });
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
          const m: Movimiento = { ...input, id: input.id ?? `n-${Date.now()}${Math.random().toString(36).slice(2, 6)}` };
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
      },

      eliminar: async (m) => {
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

      sincronizar: async () => {
        const { url, token, sincronizando } = get();
        // Un alta ya subida pasa a tener su id real: si se edita o borra antes de recargar, no se duplica.
        const reemplazarId = (viejo: string, nuevo: string) =>
          set((s) => ({
            porAnio: Object.fromEntries(Object.entries(s.porAnio).map(([a, l]) => [a, l.map((x) => (x.id === viejo ? { ...x, id: nuevo } : x))])),
            pendientes: s.pendientes.map((p) => (p.kind === 'upsert' && p.m.id === viejo ? { ...p, m: { ...p.m, id: nuevo } } : p)),
          }));
        const { fecha } = get().cotizaciones;
        if (!fecha || Date.now() - Date.parse(fecha) > 3600_000) get().actualizarCotizaciones();
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
        url: s.url, token: s.token, porAnio: s.porAnio, pendientes: s.pendientes, ultimaSync: s.ultimaSync, versionScript: s.versionScript,
        presupuestos: s.presupuestos, recurrentes: s.recurrentes, recienGenerados: s.recienGenerados, saldosIniciales: s.saldosIniciales, ahorrosIniciales: s.ahorrosIniciales, metaAhorro: s.metaAhorro, tipsOcultos: s.tipsOcultos, monedaVista: s.monedaVista, fuenteUsd: s.fuenteUsd, cotizaciones: s.cotizaciones,
      }),
    },
  ),
);

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

// Cuánto tenés de cada moneda al cierre del mes `ym`, sumando los movimientos del año hasta ese mes.
// - total: saldo inicial + todo lo que entró/salió (los movimientos de Ahorro no restan: esa plata sigue siendo tuya)
// - ahorrado: ajuste de ahorro + movimientos de Ahorro. Ajustarlo solo mueve plata entre disponible y ahorrado.
export const saldosAl = (porAnio: Record<string, Movimiento[]>, iniciales: Ajustes, ahorros: Ajustes, ym: string): Saldo[] => {
  const anio = ym.slice(0, 4);
  const lista = (porAnio[anio] ?? []).filter((m) => m.fecha.slice(0, 7) <= ym);
  return MONEDAS.map((moneda) => {
    const l = lista.filter((m) => m.moneda === moneda);
    const inicial = iniciales[anio]?.[moneda] ?? 0;
    const ahorroIni = ahorros[anio]?.[moneda] ?? 0;
    const ahorroMov = -l.filter((m) => m.tipo === 'Ahorro').reduce((a, m) => a + m.valor, 0);
    const total = inicial + l.reduce((a, m) => a + m.valor, 0) + ahorroMov;
    const ahorrado = ahorroIni + ahorroMov;
    return { moneda, disponible: total - ahorrado, ahorrado, total, usada: l.length > 0 || inicial !== 0 || ahorroIni !== 0 };
  });
};
