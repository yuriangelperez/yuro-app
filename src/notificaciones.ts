import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { disponible, leer, quitar, setPalabras, tieneAcceso } from '../modules/yuro-notificaciones';
import { interpretar, PALABRAS_APPS } from './notifParser';
import { convertir, useFinanzas } from './store';
import type { Movimiento } from './types';

// Lee las notificaciones de bancos y billeteras que el servicio de Android fue guardando y las convierte en movimientos.
// Corre al abrir la app (y al volver a ella). Todo ocurre en el teléfono: el texto de las notificaciones no se sube a ningún lado.

const LOG = 'notificaciones-log';
export type EntradaLog = { t: number; app: string; texto: string; ok: boolean; concepto?: string; valor?: number };

export const hayServicio = Platform.OS === 'android' && disponible;

export const leerLog = async (): Promise<EntradaLog[]> => {
  try {
    return JSON.parse((await AsyncStorage.getItem(LOG)) ?? '[]');
  } catch {
    return [];
  }
};

const p2 = (n: number) => String(n).padStart(2, '0');
let corriendo = false;

export async function procesarNotificaciones(): Promise<{ guardados: number; sinReconocer: number }> {
  const nada = { guardados: 0, sinReconocer: 0 };
  if (!hayServicio || corriendo) return nada;
  corriendo = true;
  try {
    setPalabras(PALABRAS_APPS); // el servicio solo guarda las apps de esta lista
    if (!tieneAcceso()) return nada;
    const crudas = leer();
    if (!crudas.length) return nada;

    const { porAnio, cotizaciones, guardar } = useFinanzas.getState();
    // Una notificación puede llegar dos veces (el banco la actualiza): se compara contra lo ya cargado.
    const vistos = new Set(Object.values(porAnio).flat().filter((m) => m.hora).map((m) => `${m.fecha}|${m.hora}|${m.valor}`));
    const nuevos: Omit<Movimiento, 'id'>[] = [];
    const log: EntradaLog[] = [];

    for (const n of crudas) {
      const r = interpretar(n.app, n.titulo, n.texto);
      const texto = [n.titulo, n.texto].filter(Boolean).join(' · ').slice(0, 200);
      if (!r) {
        log.push({ t: n.hora, app: n.app, texto, ok: false });
        continue;
      }
      const d = new Date(n.hora);
      const fecha = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
      const hora = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
      const clave = `${fecha}|${hora}|${r.valor}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const ars = convertir(r.valor, r.moneda, 'ARS', cotizaciones);
      nuevos.push({
        fecha, hora, concepto: r.concepto, valor: r.valor, moneda: r.moneda, valorArs: ars === null ? null : Math.round(ars * 100) / 100,
        tipo: r.valor > 0 ? 'Ingreso' : 'Egreso', metodo: /mercado/i.test(n.app) ? 'Mercado pago' : n.app, categoria: '', categoria2: '',
        cuotasCumplidas: null, cuotasTotales: null,
      });
      log.push({ t: n.hora, app: n.app, texto, ok: true, concepto: r.concepto, valor: r.valor });
    }

    if (nuevos.length) await guardar(...nuevos);
    quitar(crudas.length); // recién ahora: si guardar fallara antes, las notificaciones siguen en la cola
    await AsyncStorage.setItem(LOG, JSON.stringify([...log.reverse(), ...(await leerLog())].slice(0, 30)));
    return { guardados: nuevos.length, sinReconocer: log.filter((x) => !x.ok).length };
  } finally {
    corriendo = false;
  }
}
