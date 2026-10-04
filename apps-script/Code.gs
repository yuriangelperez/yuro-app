/**
 * API de Google Sheets para la app "Mis Finanzas".
 * Trabaja sobre la pestaña del año (por defecto "2026", "2027"…) con el formato de tu hoja:
 *   A Fecha | B Concepto | C Valor | D Tipo | E Método | F Categoría | G Categoría 2 | H Cuotas cumplidas | I Cuotas totales
 *
 * Instalación: en tu hoja → Extensiones → Apps Script → pegar este archivo.
 * Configuración del proyecto → Propiedades del script → TOKEN = <una clave larga que inventes>.
 * Implementar → Nueva implementación (o Administrar → editar → Nueva versión) → Aplicación web:
 *   Ejecutar como: Yo · Quién tiene acceso: Cualquier persona
 *
 * Lectura: toma las filas con una fecha en A y un Tipo válido en D (se ignoran títulos de mes, subtítulos y totales).
 * Escritura: edita la fila en el lugar; los movimientos nuevos se insertan al final del bloque de su mes
 * (debajo del título del mes, ej. "SEPTIEMBRE"), copiando formato y desplegables de la fila de arriba.
 * Al insertar/borrar filas, lo que esté a la derecha en esas filas (resúmenes, tablas) se desplaza con ellas.
 */
var MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
var TIPOS = { INGRESO: 'Ingreso', EGRESO: 'Egreso', AHORRO: 'Ahorro', CAMBIO: 'Cambio' };
var NCOLS = 9;

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function norm_(s) {
  return String(s).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone(); }
function fechaStr_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function autorizado_(token) {
  var t = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!t && token === t;
}
function hoja_(anio) {
  var sh = SpreadsheetApp.getActive().getSheetByName(String(anio));
  if (!sh) throw new Error('No existe la pestaña "' + anio + '"');
  return sh;
}
function num_(v) { var n = Number(v); return v === '' || isNaN(n) ? null : n; }

function doGet(e) {
  try {
    if (!autorizado_(e.parameter.token)) return json_({ error: 'Token inválido' });
    var sh = hoja_(e.parameter.anio || new Date().getFullYear());
    var n = sh.getLastRow();
    var vals = n > 1 ? sh.getRange(2, 1, n - 1, NCOLS).getValues() : [];
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      var tipo = TIPOS[norm_(r[3])];
      if (!(r[0] instanceof Date) || !tipo) continue;
      var fecha = fechaStr_(r[0]);
      out.push({
        id: (i + 2) + '|' + fecha + '|' + r[1],
        fecha: fecha, concepto: String(r[1]), valor: num_(r[2]) || 0, tipo: tipo,
        metodo: String(r[4]), categoria: String(r[5]), categoria2: String(r[6]),
        cuotasCumplidas: num_(r[7]), cuotasTotales: num_(r[8])
      });
    }
    return json_({ movimientos: out });
  } catch (err) {
    return json_({ error: String(err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents);
    if (!autorizado_(body.token)) return json_({ error: 'Token inválido' });
    lock.waitLock(15000);
    var sh = hoja_(body.anio);
    if (body.action === 'upsert') upsert_(sh, body.movimiento);
    else if (body.action === 'delete') sh.deleteRow(filaVerificada_(sh, body.id));
    else return json_({ error: 'Acción desconocida' });
    return json_({ ok: true });
  } catch (err) {
    return json_({ error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// El id es "fila|fecha|concepto": se comprueba que esa fila siga siendo la misma antes de tocarla.
function filaVerificada_(sh, id) {
  var p = String(id).split('|');
  var fila = Number(p[0]);
  var fecha = p[1];
  var concepto = p.slice(2).join('|');
  if (!fila || fila > sh.getLastRow()) throw new Error('FILA_CAMBIO');
  var r = sh.getRange(fila, 1, 1, 2).getValues()[0];
  if (!(r[0] instanceof Date) || fechaStr_(r[0]) !== fecha || String(r[1]) !== concepto) throw new Error('FILA_CAMBIO');
  return fila;
}

function upsert_(sh, m) {
  var fecha = Utilities.parseDate(m.fecha, tz_(), 'yyyy-MM-dd');
  var base = [fecha, m.concepto, m.valor, m.tipo, m.metodo, m.categoria, m.categoria2];
  var fila;
  if (String(m.id).indexOf('n-') === 0) {
    var ref = filaReferencia_(sh, fecha);
    sh.insertRowAfter(ref);
    fila = ref + 1;
    var origen = sh.getRange(ref, 1, 1, NCOLS), destino = sh.getRange(fila, 1, 1, NCOLS);
    origen.copyTo(destino, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    origen.copyTo(destino, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
  } else {
    fila = filaVerificada_(sh, m.id);
  }
  sh.getRange(fila, 1, 1, base.length).setValues([base]);
  // Las cuotas pueden ser fórmulas en tu hoja: solo se escriben si la app las envía.
  if (m.cuotasCumplidas !== null && m.cuotasCumplidas !== undefined) sh.getRange(fila, 8).setValue(m.cuotasCumplidas);
  if (m.cuotasTotales !== null && m.cuotasTotales !== undefined) sh.getRange(fila, 9).setValue(m.cuotasTotales);
}

// Última fila con datos del bloque del mes (entre su título y el título del mes siguiente).
function filaReferencia_(sh, fecha) {
  var mes = MESES[Number(Utilities.formatDate(fecha, tz_(), 'M')) - 1];
  var n = sh.getLastRow();
  var a = sh.getRange(1, 1, n, 1).getValues();
  var inicio = -1, fin = n;
  for (var i = 0; i < n; i++) {
    var v = a[i][0];
    if (typeof v !== 'string') continue;
    var k = norm_(v).split(' ')[0];
    if (MESES.indexOf(k) < 0) continue;
    if (inicio < 0) { if (k === mes) inicio = i + 1; }
    else { fin = i; break; }
  }
  if (inicio < 0) return n; // no hay bloque de ese mes: se agrega al final
  for (var r = fin; r > inicio; r--) if (a[r - 1][0] instanceof Date) return r;
  return inicio + 1;
}
