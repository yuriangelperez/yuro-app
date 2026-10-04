import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { sheets } from './sheets';
import type { Movimiento } from './types';
import { mesActual } from './util';

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
  setConfig: (url: string, token: string) => void;
  setMes: (ym: string) => void;
  guardar: (m: Omit<Movimiento, 'id'> & { id?: string }) => Promise<void>;
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

      setConfig: (url, token) => set({ url: url.trim(), token: token.trim() }),

      setMes: (ym) => {
        const cambioAnio = ym.slice(0, 4) !== get().mes.slice(0, 4);
        set({ mes: ym });
        if (cambioAnio) get().sincronizar();
      },

      // Optimista: se aplica local y se encola; sincronizar() lo envía a la hoja.
      guardar: async (input) => {
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
        await get().sincronizar();
      },

      eliminar: async (m) => {
        const anio = anioDe(m.fecha);
        const nuevo = m.id.startsWith('n-'); // nunca llegó a la hoja: basta con descartarlo
        set((s) => ({
          porAnio: { ...s.porAnio, [anio]: (s.porAnio[anio] ?? []).filter((x) => x.id !== m.id) },
          pendientes: [
            ...s.pendientes.filter((p) => !(p.kind === 'upsert' && p.m.id === m.id)),
            ...(nuevo ? [] : [{ kind: 'delete', anio, id: m.id } as Op]),
          ],
        }));
        await get().sincronizar();
      },

      sincronizar: async () => {
        const { url, token, sincronizando } = get();
        if (!url || !token || sincronizando) return;
        set({ sincronizando: true, error: null });
        try {
          // 1) subir cambios pendientes en orden
          for (const op of [...get().pendientes]) {
            try {
              if (op.kind === 'upsert') await sheets.upsert(url, token, op.anio, op.m);
              else await sheets.remove(url, token, op.anio, op.id);
            } catch (e) {
              // La fila ya no es la misma en la hoja: se descarta para no trabar la cola.
              if (!(e instanceof Error) || e.message !== 'FILA_CAMBIO') throw e;
              set({ error: 'Una fila cambió en la hoja y no se pudo aplicar ese cambio.' });
            }
            set((s) => ({ pendientes: s.pendientes.filter((p) => p !== op) }));
          }
          // 2) bajar el año seleccionado (la hoja es la fuente de verdad)
          const anio = +get().mes.slice(0, 4);
          const movimientos = await sheets.list(url, token, anio);
          set((s) => ({ porAnio: { ...s.porAnio, [anio]: movimientos }, ultimaSync: new Date().toISOString() }));
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Error de sincronización' });
        } finally {
          set({ sincronizando: false });
        }
      },
    }),
    {
      name: 'finanzas-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ url: s.url, token: s.token, porAnio: s.porAnio, pendientes: s.pendientes, ultimaSync: s.ultimaSync }),
    },
  ),
);

export const useMovimientosMes = () => {
  const mes = useFinanzas((s) => s.mes);
  const lista = useFinanzas((s) => s.porAnio[mes.slice(0, 4)]);
  return { mes, movimientos: (lista ?? []).filter((m) => m.fecha.startsWith(mes)) };
};
