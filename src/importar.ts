import * as XLSX from 'xlsx';
import type { Moneda, Movimiento } from './types';
import { parseMonto } from './util';

// Lee el extracto de un banco o billetera (Excel o CSV) y lo traduce a movimientos de la app.
// Los bancos usan formatos distintos: se busca la fila de encabezados y se detectan las columnas por nombre.

type Celda = string | number | boolean | Date | null | undefined;

export const norm = (x: unknown) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const CLAVES = {
  hora: ['hora', 'time'],
  fecha: ['fecha', 'date', 'f. operacion', 'f operacion'], // 'date' cubre RELEASE_DATE de Mercado Pago
  debito: ['debito', 'debit', 'egreso', 'salida', 'retiro', 'debe', 'gasto'],
  credito: ['credito', 'credit', 'ingreso', 'entrada', 'deposito', 'haber'],
  monto: ['importe', 'monto', 'valor', 'amount', 'total'],
  concepto: ['concepto', 'descripcion', 'detalle', 'movimiento', 'referencia', 'description', 'leyenda', 'observacion', 'comercio'],
} as const;
type Campo = keyof typeof CLAVES;

const campoDe = (encabezado: string): Campo | null => {
  const h = norm(encabezado);
  if (!h) return null;
  // Orden importa: "importe debito" es débito, no monto.
  for (const campo of ['fecha', 'hora', 'debito', 'credito', 'monto', 'concepto'] as Campo[]) if (CLAVES[campo].some((k) => h.includes(k))) return campo;
  return null;
};

const p2 = (n: number) => String(n).padStart(2, '0');
const ymd = (a: number, m: number, d: number) => {
  const f = new Date(a, m - 1, d);
  return f.getFullYear() === a && f.getMonth() === m - 1 && f.getDate() === d && a > 1990 && a < 2100 ? `${a}-${p2(m)}-${p2(d)}` : null;
};

// Fechas ISO con zona (ej. 2026-10-05T10:00:00Z, como el reporte de Mercado Pago): se pasan a hora argentina (UTC-3, sin horario de verano).
const isoConZona = (t: string): { fecha: string; hora: string } | null => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(t.trim())) return null;
  const ms = Date.parse(t.trim());
  if (isNaN(ms)) return null;
  const d = new Date(ms - 3 * 3600_000);
  return { fecha: `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`, hora: `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` };
};

export const fechaDe = (x: Celda): string | null => {
  if (x instanceof Date) return isNaN(+x) ? null : ymd(x.getFullYear(), x.getMonth() + 1, x.getDate());
  if (typeof x === 'number') {
    const f = XLSX.SSF.parse_date_code(x); // fecha serial de Excel
    return f ? ymd(f.y, f.m, f.d) : null;
  }
  if (typeof x !== 'string') return null;
  const t = x.trim();
  const iso = isoConZona(t);
  if (iso) return iso.fecha;
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); // en Argentina: día/mes/año
  if (m) return ymd(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
};

// Hora HH:MM de una celda de fecha (con hora incluida) o de una columna de hora aparte.
export const horaDe = (x: Celda): string | null => {
  if (x instanceof Date) return isNaN(+x) || (!x.getHours() && !x.getMinutes()) ? null : `${p2(x.getHours())}:${p2(x.getMinutes())}`;
  if (typeof x === 'number' && x > 0 && x < 1) { // fracción de día de Excel
    const min = Math.round(x * 1440);
    return `${p2(Math.floor(min / 60) % 24)}:${p2(min % 60)}`;
  }
  if (typeof x === 'number' && x > 1) { const f = XLSX.SSF.parse_date_code(x); return f && (f.H || f.M) ? `${p2(f.H)}:${p2(f.M)}` : null; }
  if (typeof x === 'string') {
    const iso = isoConZona(x);
    if (iso) return iso.hora;
  }
  const m = typeof x === 'string' ? x.match(/(\d{1,2}):(\d{2})/) : null;
  return m && +m[1] < 24 && +m[2] < 60 ? `${p2(+m[1])}:${m[2]}` : null;
};

const numeroDe = (x: Celda): number | null => {
  if (typeof x === 'number') return x;
  if (typeof x !== 'string' || !x.trim()) return null;
  const n = parseMonto(x);
  return n !== null && /^\(.*\)$/.test(x.trim()) ? -Math.abs(n) : n; // (1.234,00) = negativo
};

export type Fila = { fecha: string; hora: string | null; concepto: string; valor: number };
export type Lectura = {
  filas: Fila[];
  columnas: string; // qué se detectó, para mostrarle al usuario
  sinSigno: boolean; // los montos vienen todos positivos en una sola columna: hay que preguntar si son gastos o ingresos
};

// SheetJS interpreta los CSV a la americana (05/10 = 10 de mayo, "9.999,00" = 9,999): por eso los CSV se leen acá, como texto.
// TextDecoder no está en los tipos de este proyecto y en algunos motores solo soporta UTF-8.
type Decodificador = new (etiqueta: string, opts?: { fatal: boolean }) => { decode: (b: Uint8Array) => string };
const aTexto = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  const TD = (globalThis as unknown as { TextDecoder?: Decodificador }).TextDecoder;
  let texto: string | null = null;
  try { texto = TD ? new TD('utf-8', { fatal: true }).decode(bytes) : null; } catch { /* no es UTF-8 */ }
  if (texto === null) { // Latin-1 / Windows-1252: cada byte es un carácter
    texto = '';
    for (let i = 0; i < bytes.length; i += 8192) texto += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return texto.replace(/^\uFEFF/, '');
};

export const parseCsv = (texto: string): string[][] => {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
  const fuera = (l: string) => l.replace(/"[^"]*"/g, '');
  const sep = [';', ',', '\t'].map((d) => ({ d, n: lineas.reduce((a, l) => a + fuera(l).split(d).length - 1, 0) })).sort((x, y) => y.n - x.n)[0].d;
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  const cierraCelda = () => { fila.push(celda); celda = ''; };
  const cierraFila = () => { cierraCelda(); if (fila.some((x) => x.trim())) filas.push(fila); fila = []; };
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false; } else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) cierraCelda();
    else if (ch === '\n') cierraFila();
    else if (ch !== '\r') celda += ch;
  }
  if (celda || fila.length) cierraFila();
  return filas;
};

const esLibro = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf.slice(0, 4));
  return (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf); // .xlsx (zip) o .xls (OLE)
};

export function leerExtracto(buf: ArrayBuffer): Lectura {
  let filas: Celda[][];
  if (esLibro(buf)) {
    const libro = XLSX.read(buf, { type: 'array', cellDates: true });
    // La hoja con más filas (los extractos suelen traer una sola)
    const hojas = libro.SheetNames.map((n) => XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }));
    filas = hojas.sort((a, b) => b.length - a.length)[0] ?? [];
  } else filas = parseCsv(aTexto(buf));

  let cab = -1;
  let col: Partial<Record<Campo, number>> = {};
  for (let i = 0; i < Math.min(filas.length, 60) && cab < 0; i++) {
    const c: Partial<Record<Campo, number>> = {};
    filas[i].forEach((x, j) => {
      const campo = typeof x === 'string' ? campoDe(x) : null;
      if (campo && c[campo] === undefined) c[campo] = j;
    });
    if (c.fecha !== undefined && (c.monto !== undefined || c.debito !== undefined || c.credito !== undefined)) { cab = i; col = c; }
  }
  if (cab < 0) throw new Error('No encontré las columnas de Fecha e Importe. El archivo necesita una fila de encabezados con esos nombres (ej. Fecha, Descripción, Importe).');

  // Débito y crédito en columnas distintas (si existen, mandan sobre un "importe bruto" siempre positivo, como GROSS_AMOUNT de Mercado Pago)
  const separados = col.debito !== undefined || col.credito !== undefined;
  const out: Fila[] = [];
  let negativos = 0;
  for (const f of filas.slice(cab + 1)) {
    const fecha = fechaDe(f[col.fecha!]);
    if (!fecha) continue; // totales, saldos, líneas de pie
    let valor: number | null;
    if (separados) {
      const d = col.debito === undefined ? null : numeroDe(f[col.debito]);
      const cr = col.credito === undefined ? null : numeroDe(f[col.credito]);
      valor = (cr ? Math.abs(cr) : 0) - (d ? Math.abs(d) : 0);
    } else valor = numeroDe(f[col.monto!]);
    if (!valor) continue;
    if (valor < 0) negativos++;
    const concepto = col.concepto === undefined ? '' : String(f[col.concepto] ?? '').replace(/\s+/g, ' ').trim();
    out.push({ fecha, hora: (col.hora !== undefined ? horaDe(f[col.hora]) : null) ?? horaDe(f[col.fecha!]), concepto: concepto || 'Sin concepto', valor: Math.round(valor * 100) / 100 });
  }
  if (!out.length) throw new Error('Encontré los encabezados pero ninguna fila con fecha e importe válidos.');
  const nombre = (c?: number) => (c === undefined ? '—' : String(filas[cab][c]));
  return {
    filas: out,
    sinSigno: !separados && negativos === 0,
    columnas: `Fecha: ${nombre(col.fecha)} · Concepto: ${nombre(col.concepto)} · ${separados ? `Débito: ${nombre(col.debito)} · Crédito: ${nombre(col.credito)}` : `Importe: ${nombre(col.monto)}`}`,
  };
}

// ───────── Categorías y duplicados a partir de lo que ya cargaste ─────────

export const sugeridor = (historial: Movimiento[]) => {
  const conocidos = new Map<string, { categoria: string; categoria2: string }>();
  for (const m of [...historial].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (m.categoria) conocidos.set(norm(m.concepto), { categoria: m.categoria, categoria2: m.categoria2 }); // gana el más reciente
  }
  const claves = [...conocidos.keys()].filter((k) => k.length >= 5);
  return (concepto: string) => {
    const n = norm(concepto);
    const exacto = conocidos.get(n);
    if (exacto) return exacto;
    const parcial = claves.find((k) => n.includes(k));
    return parcial ? conocidos.get(parcial)! : null;
  };
};

export type Duplicado = 'exacto' | 'probable' | null;

// "exacto": misma fecha, importe y concepto. "probable": misma fecha e importe (el banco escribe el concepto distinto).
export const detectarDuplicados = (nuevas: Fila[], existentes: Movimiento[], moneda: Moneda): Duplicado[] => {
  const cuenta = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const exactos = new Map<string, number>();
  const probables = new Map<string, number>();
  for (const e of existentes) {
    if (e.moneda !== moneda) continue;
    cuenta(exactos, `${e.fecha}|${e.valor}|${norm(e.concepto)}`);
    cuenta(probables, `${e.fecha}|${e.valor}`);
  }
  const gastar = (m: Map<string, number>, k: string) => {
    const n = m.get(k) ?? 0;
    if (n > 0) m.set(k, n - 1);
    return n > 0;
  };
  return nuevas.map((f) => {
    const exacto = gastar(exactos, `${f.fecha}|${f.valor}|${norm(f.concepto)}`);
    const probable = gastar(probables, `${f.fecha}|${f.valor}`);
    return exacto ? 'exacto' : probable ? 'probable' : null;
  });
};
