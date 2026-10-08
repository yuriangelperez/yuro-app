import { Platform, Share } from 'react-native';
import * as XLSX from 'xlsx';
import { useFinanzas } from './store';
import { hoyYmd } from './util';

// Exportar a Excel y copia de seguridad (JSON). En la web se descarga el archivo; en el celular se abre el menú de compartir
// (ahí el Excel se comparte como CSV de movimientos, que cualquier planilla abre).

const datos = () => {
  const s = useFinanzas.getState();
  const nombreCuenta = (id?: string | null) => s.cuentas.find((x) => x.id === id)?.nombre ?? '';
  const movimientos = Object.values(s.porAnio).flat().sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '').localeCompare(b.hora ?? ''));
  return { s, nombreCuenta, movimientos };
};

// Descarga en el navegador (el proyecto no incluye los tipos del DOM, por eso se tipa a mano lo mínimo)
type Enlace = { href: string; download: string; click: () => void };
type Web = {
  document: { createElement: (tag: 'a') => Enlace };
  URL: { createObjectURL: (b: unknown) => string; revokeObjectURL: (u: string) => void };
  Blob: new (partes: unknown[], opciones: { type: string }) => unknown;
};
const descargar = (nombre: string, contenido: unknown, tipo: string) => {
  const g = globalThis as unknown as Web;
  const url = g.URL.createObjectURL(new g.Blob([contenido], { type: tipo }));
  const a = g.document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  g.URL.revokeObjectURL(url);
};

export async function exportarExcel(): Promise<string> {
  const { s, nombreCuenta, movimientos } = datos();
  const filasMov = movimientos.map((m) => ({
    Fecha: m.fecha, Hora: m.hora ?? '', Concepto: m.concepto, Valor: m.valor, Moneda: m.moneda, 'Valor en pesos': m.valorArs ?? '', Tipo: m.tipo, Método: m.metodo,
    Cuenta: nombreCuenta(m.cuentaId), 'Cuenta destino': nombreCuenta(m.cuentaDestinoId), Categoría: m.categoria, 'Categoría 2': m.categoria2,
    'Cuotas cumplidas': m.cuotasCumplidas ?? '', 'Cuotas totales': m.cuotasTotales ?? '',
  }));
  if (Platform.OS !== 'web') {
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(filasMov));
    await Share.share({ message: csv, title: `Yuro movimientos ${hoyYmd()}.csv` });
    return `${movimientos.length} movimientos (CSV)`;
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasMov), 'Movimientos');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(s.cuentas.map((x) => ({ Cuenta: x.nombre, Tipo: x.tipo, Moneda: x.moneda, 'Saldo inicial': x.saldoInicial, Activa: x.activa ? 'sí' : 'no' }))), 'Cuentas');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(s.planificados.map((p) => ({ Fecha: p.fecha, Concepto: p.concepto, Valor: p.valor, Moneda: p.moneda, Estado: p.estado }))), 'Planificados');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(s.deudas.map((d) => ({ Con: d.nombre, Sentido: d.direccion === 'debo' ? 'Yo debo' : 'Me deben', Monto: d.monto, Moneda: d.moneda, Fecha: d.fecha, Vence: d.vencimiento ?? '', Nota: d.nota }))), 'Deudas');
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(s.reservas.map((r) => ({ Reserva: r.nombre, Monto: r.monto, Moneda: r.moneda, Categoría: r.categoria, Palabra: r.patron, Mensual: r.mensual ? 'sí' : 'no' }))), 'Reservas');
  const bytes = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  descargar(`yuro-${hoyYmd()}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return `${movimientos.length} movimientos`;
}

// Todo lo que Yuro guarda de tu cuenta, en un JSON (sin tokens ni claves)
export async function exportarRespaldo(): Promise<string> {
  const { s, movimientos } = datos();
  const respaldo = {
    app: 'yuro', version: 1, creado: new Date().toISOString(),
    movimientos, cuentas: s.cuentas, planificados: s.planificados, deudas: s.deudas, reservas: s.reservas, reglas: s.reglas, recurrentes: s.recurrentes,
    presupuestos: s.presupuestos, saldosIniciales: s.saldosIniciales, ahorrosIniciales: s.ahorrosIniciales, metaAhorro: s.metaAhorro, catExtra: s.catExtra, catOcultas: s.catOcultas,
  };
  const texto = JSON.stringify(respaldo, null, 2);
  if (Platform.OS === 'web') descargar(`yuro-respaldo-${hoyYmd()}.json`, texto, 'application/json');
  else await Share.share({ message: texto, title: `Yuro respaldo ${hoyYmd()}.json` });
  return `${movimientos.length} movimientos`;
}
