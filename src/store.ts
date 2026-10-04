import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { sheets } from './sheets';
import type { Movimiento } from './types';

type Op = { kind: 'upsert'; m: Movimiento } | { kind: 'delete'; id: string };

interface State {
  url: string;
  token: string;
  movimientos: Movimiento[];
  pendientes: Op[];
  sincronizando: boolean;
  error: string | null;
  ultimaSync: string | null;
  setConfig: (url: string, token: string) => void;
  guardar: (m: Omit<Movimiento, 'id'> & { id?: string }) => Promise<void>;
  eliminar: (id: string) => Promise<void>;
  sincronizar: () => Promise<void>;
}

export const useFinanzas = create<State>()(
  persist(
    (set, get) => ({
      url: '',
      token: '',
      movimientos: [],
      pendientes: [],
      sincronizando: false,
      error: null,
      ultimaSync: null,

      setConfig: (url, token) => set({ url: url.trim(), token: token.trim() }),

      // Optimista: se aplica local y se encola; sincronizar() lo envía a la hoja.
      guardar: async (input) => {
        const m: Movimiento = { ...input, id: input.id ?? `${Date.now()}${Math.random().toString(36).slice(2, 6)}` };
        set((s) => ({
          movimientos: [m, ...s.movimientos.filter((x) => x.id !== m.id)],
          pendientes: [...s.pendientes, { kind: 'upsert', m }],
        }));
        await get().sincronizar();
      },

      eliminar: async (id) => {
        set((s) => ({
          movimientos: s.movimientos.filter((x) => x.id !== id),
          pendientes: [...s.pendientes, { kind: 'delete', id }],
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
            if (op.kind === 'upsert') await sheets.upsert(url, token, op.m);
            else await sheets.remove(url, token, op.id);
            set((s) => ({ pendientes: s.pendientes.slice(1) }));
          }
          // 2) bajar el estado de la hoja (fuente de verdad)
          const movimientos = await sheets.list(url, token);
          set({ movimientos, ultimaSync: new Date().toISOString() });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : 'Error de sincronización' });
        } finally {
          set({ sincronizando: false });
        }
      },
    }),
    {
      name: 'finanzas',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ url: s.url, token: s.token, movimientos: s.movimientos, pendientes: s.pendientes, ultimaSync: s.ultimaSync }),
    },
  ),
);
