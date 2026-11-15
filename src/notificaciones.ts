import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { disponible, leer, quitar, setPalabras, tieneAcceso } from '../modules/yuro-notificaciones';
import { buscarDuplicados } from './dedupe';
import { norm } from './util';
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

export async function procesarNotificaciones(): Promise<{ guardados: number; sinReconocer: number; leidas: number; yaCargadas: number }> {
  const nada = { guardados: 0, sinReconocer: 0, leidas: 0, yaCargadas: 0 };
  if (!hayServicio || corriendo) return nada;
  corriendo = true;
  try {
    setPalabras(PALABRAS_APPS); // el servicio solo guarda las apps de esta lista
    if (!tieneAcceso()) return nada;
    const crudas = leer();
    if (!crudas.length) return nada;

    const { porAnio, cotizaciones, guardar, cuentas } = useFinanzas.getState();
    // Una notificación puede llegar dos veces (el banco la actualiza) o ser algo que ya cargaste a mano / bajó Mercado Pago:
    // se compara contra lo ya cargado (dedupe.ts). Dentro del mismo lote, misma hora e importe = la misma notificación repetida.
    const existentes = Object.values(porAnio).flat();
    const vistos = new Set<string>();
    const reclamados = new Set<string>(); // cada movimiento ya cargado cubre una sola notificación
    const nuevos: Omit<Movimiento, 'id'>[] = [];
    const log: EntradaLog[] = [];
    let yaCargadas = 0;

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
      const clave = `${fecha}|${hora}|${r.valor}|${r.moneda}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const metodo = /mercado/i.test(n.app) ? 'Mercado pago' : n.app;
      const [dup] = buscarDuplicados([{ fecha, hora, valor: r.valor, moneda: r.moneda, concepto: r.concepto, metodo }], existentes.filter((e) => !reclamados.has(e.id)));
      // Se descarta si es la misma operación (id, o importe+día con concepto/cuenta parecidos). Un "probable" de otra cuenta se carga.
      if (dup && (dup.exacto || dup.nivel === 'external_id')) {
        reclamados.add(dup.existente.id);
        yaCargadas++;
        log.push({ t: n.hora, app: n.app, texto, ok: true, concepto: `${r.concepto} (ya estaba cargado)`, valor: r.valor });
        continue;
      }
      // Una notificación de "te transferiste $X" es la otra punta de una transferencia entre tus cuentas ya cargada (a mano o por Mercado Pago):
      // el importe se compara sin signo y la cuenta de la notificación tiene que ser el origen o el destino.
      const delBanco = cuentas.filter((x) => norm(x.nombre).includes(norm(n.app)) || norm(n.app).includes(norm(x.nombre))).map((x) => x.id);
      const transf = existentes.find((e) => e.tipo === 'Transferencia' && !reclamados.has(e.id) && e.moneda === r.moneda && Math.abs(e.valor) === Math.abs(r.valor)
        && Math.abs(Date.parse(e.fecha) - Date.parse(fecha)) <= 86400000
        && ((!!e.cuentaId && delBanco.includes(e.cuentaId)) || (!!e.cuentaDestinoId && delBanco.includes(e.cuentaDestinoId))));
      if (transf) {
        reclamados.add(transf.id);
        yaCargadas++;
        log.push({ t: n.hora, app: n.app, texto, ok: true, concepto: `${r.concepto} (ya estaba cargado como transferencia)`, valor: r.valor });
        continue;
      }
      const ars = convertir(r.valor, r.moneda, 'ARS', cotizaciones);
      nuevos.push({
        fecha, hora, concepto: r.concepto, valor: r.valor, moneda: r.moneda, valorArs: ars === null ? null : Math.round(ars * 100) / 100,
        tipo: r.valor > 0 ? 'Ingreso' : 'Egreso', metodo, categoria: '', categoria2: '', origen: 'notificacion',
        cuotasCumplidas: null, cuotasTotales: null,
      });
      log.push({ t: n.hora, app: n.app, texto, ok: true, concepto: r.concepto, valor: r.valor });
    }

    if (nuevos.length) await guardar(...nuevos);
    quitar(crudas.length); // recién ahora: si guardar fallara antes, las notificaciones siguen en la cola
    await AsyncStorage.setItem(LOG, JSON.stringify([...log.reverse(), ...(await leerLog())].slice(0, 30)));
    return { guardados: nuevos.length, sinReconocer: log.filter((x) => !x.ok).length, leidas: crudas.length, yaCargadas };
  } finally {
    corriendo = false;
  }
}
