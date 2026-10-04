/**
 * API de Google Sheets para la app "Mis Finanzas".
 *
 * Instalación: en tu hoja → Extensiones → Apps Script → pegar este archivo.
 * Luego: Configuración del proyecto → Propiedades del script → agregar TOKEN = <una clave larga que inventes>.
 * Implementar → Nueva implementación → Aplicación web:
 *   Ejecutar como: Yo · Quién tiene acceso: Cualquier persona
 * Copiar la URL /exec en la app (Ajustes) junto con el TOKEN.
 *
 * Usa la pestaña "Movimientos" (se crea sola si no existe) con columnas:
 *   ID | Fecha | Tipo | Categoría | Descripción | Monto | Cuenta
 * Si ya tenés tus finanzas en otra pestaña, cambiá HOJA y COLUMNAS abajo.
 */
var HOJA = 'Movimientos';
var COLUMNAS = ['id', 'fecha', 'tipo', 'categoria', 'descripcion', 'monto', 'cuenta'];
var ENCABEZADOS = ['ID', 'Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Cuenta'];

function hoja_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(HOJA);
  if (!sh) {
    sh = ss.insertSheet(HOJA);
    sh.appendRow(ENCABEZADOS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function autorizado_(token) {
  var t = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!t && token === t;
}

function fechaStr_(v) {
  return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v);
}

function doGet(e) {
  if (!autorizado_(e.parameter.token)) return json_({ error: 'Token inválido' });
  var rows = hoja_().getDataRange().getValues().slice(1);
  var movimientos = rows
    .filter(function (r) { return r[0] !== ''; })
    .map(function (r) {
      return { id: String(r[0]), fecha: fechaStr_(r[1]), tipo: String(r[2]), categoria: String(r[3]),
               descripcion: String(r[4]), monto: Number(r[5]), cuenta: String(r[6]) };
    });
  return json_({ movimientos: movimientos });
}

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (!autorizado_(body.token)) return json_({ error: 'Token inválido' });
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = hoja_();
    var ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().map(function (r) { return String(r[0]); });
    if (body.action === 'upsert') {
      var m = body.movimiento;
      var fila = COLUMNAS.map(function (k) { return m[k]; });
      var i = ids.indexOf(String(m.id));
      if (i > 0) sh.getRange(i + 1, 1, 1, fila.length).setValues([fila]);
      else sh.appendRow(fila);
    } else if (body.action === 'delete') {
      var j = ids.indexOf(String(body.id));
      if (j > 0) sh.deleteRow(j + 1);
    } else {
      return json_({ error: 'Acción desconocida' });
    }
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}
