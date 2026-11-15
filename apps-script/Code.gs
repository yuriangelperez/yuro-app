/**
 * API de Google Sheets para la app "Mis Finanzas".
 * Trabaja sobre la pestaña del año (por defecto "2026", "2027"…) con el formato de tu hoja:
 *   A Fecha | B Concepto | C Valor | D Tipo | E Método | F Categoría | G Categoría 2 | H Cuotas cumplidas | I Cuotas totales
 *   J Moneda | K Monto en dólares
 * C Valor va SIEMPRE en pesos, así las sumas de la hoja siguen funcionando. Si el movimiento es en USD o USDT,
 * J dice la moneda, K tiene el monto original y C el equivalente en pesos (con la cotización del día en que se cargó).
 * J vacía = ARS. Si J o K ya las usás para otra cosa, cambiá COL_MONEDA / COL_ORIGINAL por columnas libres.
 * Movimientos en dólares que tienen el monto en dólares en C: en la hoja, menú 💰 Mis Finanzas → Convertir dólares a pesos.
 *
 * Instalación: en tu hoja → Extensiones → Apps Script → pegar este archivo.
 * Configuración del proyecto → Propiedades del script → TOKEN = <una clave larga que inventes>.
 * Primera vez: Implementar → Nueva implementación → Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona).
 * Al ACTUALIZAR: Implementar → Administrar implementaciones → ✏️ editar → Versión: Nueva versión.
 *   (No uses "Nueva implementación" para actualizar: crea otra URL y la app sigue usando la vieja.)
 *
 * Lectura: toma las filas con una fecha en A y un Tipo válido en D (se ignoran títulos de mes, subtítulos y totales).
 * Escritura: edita la fila en el lugar; los movimientos nuevos se insertan al final del bloque de su mes
 * (debajo del título del mes, ej. "SEPTIEMBRE"), copiando formato y desplegables de la fila de arriba.
 * Al insertar/borrar filas, lo que esté a la derecha en esas filas (resúmenes, tablas) se desplaza con ellas.
 */
var MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
var TIPOS = { INGRESO: 'Ingreso', EGRESO: 'Egreso', AHORRO: 'Ahorro', CAMBIO: 'Cambio' };
var COL_MONEDA = 10; // J
var COL_ORIGINAL = 11; // K: monto en USD/USDT
var NCOLS = 11;
var MONEDAS = ['ARS', 'USD', 'USDT'];
var VERSION = 4; // la app avisa si la implementación publicada es más vieja

// Menú en la hoja (aparece al abrirla; la primera vez pide permisos).
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💰 Mis Finanzas')
    .addItem('Convertir filas en USD/USDT a pesos', 'migrarMonedas')
    .addToUi();
}

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
function moneda_(v) { var k = norm_(v); return MONEDAS.indexOf(k) >= 0 ? k : 'ARS'; }
function num_(v) { var n = Number(v); return v === '' || isNaN(n) ? null : n; }

function doGet(e) {
  try {
    if (!autorizado_(e.parameter.token)) return json_({ error: 'Token inválido' });
    var sh = hoja_(e.parameter.anio || new Date().getFullYear());
    var n = sh.getLastRow();
    var vals = n > 1 ? sh.getRange(2, 1, n - 1, Math.max(NCOLS, COL_MONEDA, COL_ORIGINAL)).getValues() : [];
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      var tipo = TIPOS[norm_(r[3])];
      if (!(r[0] instanceof Date) || !tipo) continue;
      var fecha = fechaStr_(r[0]);
      var moneda = moneda_(r[COL_MONEDA - 1]);
      var enPesos = num_(r[2]) || 0;
      var original = moneda === 'ARS' ? null : num_(r[COL_ORIGINAL - 1]);
      out.push({
        id: (i + 2) + '|' + fecha + '|' + r[1],
        fecha: fecha, concepto: String(r[1]), tipo: tipo,
        // valor en su moneda; si K está vacía (filas viejas) se usa C como antes
        valor: original !== null ? original : enPesos,
        valorArs: moneda === 'ARS' || original !== null ? enPesos : null,
        metodo: String(r[4]), categoria: String(r[5]), categoria2: String(r[6]),
        cuotasCumplidas: num_(r[7]), cuotasTotales: num_(r[8]), moneda: moneda
      });
    }
    return json_({ movimientos: out, version: VERSION });
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
    if (body.action === 'upsert') {
      var m = body.movimiento;
      var fila = upsert_(sh, m);
      // Devuelve el id real para que la app no lo vuelva a insertar si se edita antes de recargar
      return json_({ ok: true, id: fila + '|' + m.fecha + '|' + m.concepto });
    }
    if (body.action === 'delete') {
      sh.deleteRow(filaVerificada_(sh, body.id));
      return json_({ ok: true });
    }
    return json_({ error: 'Acción desconocida' });
  } catch (err) {
    return json_({ error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// El id es "fila|fecha|concepto". Si esa fila ya no es la misma (se insertaron o borraron filas arriba),
// se busca la fila con la misma fecha y concepto más cercana a la original.
function filaVerificada_(sh, id) {
  var p = String(id).split('|');
  var fila = Number(p[0]);
  var fecha = p[1];
  var concepto = p.slice(2).join('|');
  var n = sh.getLastRow();
  if (n < 1) throw new Error('FILA_CAMBIO');
  var vals = sh.getRange(1, 1, n, 2).getValues();
  var coincide = function (r) { return r[0] instanceof Date && fechaStr_(r[0]) === fecha && String(r[1]) === concepto; };
  if (fila >= 1 && fila <= n && coincide(vals[fila - 1])) return fila; // fila 0 = no se sabe, solo buscar
  var mejor = -1;
  for (var i = 0; i < n; i++) {
    if (coincide(vals[i]) && (mejor < 0 || Math.abs(i + 1 - fila) < Math.abs(mejor - fila))) mejor = i + 1;
  }
  if (mejor < 0) throw new Error('FILA_CAMBIO');
  return mejor;
}

function upsert_(sh, m) {
  var fecha = Utilities.parseDate(m.fecha, tz_(), 'yyyy-MM-dd');
  var moneda = moneda_(m.moneda || 'ARS');
  // C siempre en pesos: la app manda valorArs; si no lo tiene, se convierte acá con la cotización de hoy.
  var enPesos = moneda === 'ARS' ? m.valor : (typeof m.valorArs === 'number' ? m.valorArs : Math.round(m.valor * cotizacion_(moneda) * 100) / 100);
  var base = [fecha, m.concepto, enPesos, m.tipo, m.metodo, m.categoria, m.categoria2];
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
  escribir_(sh.getRange(fila, COL_MONEDA), moneda);
  escribir_(sh.getRange(fila, COL_ORIGINAL), moneda === 'ARS' ? '' : m.valor);
  return fila;
}

// Una validación de datos copiada de la fila de arriba puede rechazar el valor: se quita solo en esa celda.
function escribir_(celda, v) {
  try {
    celda.setValue(v);
  } catch (e) {
    celda.clearDataValidations();
    celda.setValue(v);
  }
}

// Pesos por 1 USD (dólar blue) o 1 USDT (dólar cripto), de dolarapi.com.
function cotizacion_(moneda) {
  var casa = moneda === 'USDT' ? 'cripto' : 'blue';
  var j = JSON.parse(UrlFetchApp.fetch('https://dolarapi.com/v1/dolares/' + casa).getContentText());
  if (!(j.venta > 0)) throw new Error('No se pudo obtener la cotización de ' + moneda);
  return j.venta;
}

// Menú 💰 Mis Finanzas → Convertir (o desde el editor: elegí migrarMonedas en el desplegable y ▶ Ejecutar). Para cada fila que diga USD o USDT en la columna J
// y tenga K vacía: pasa el monto de C (que está en dólares) a K y pone en C el equivalente en pesos de hoy.
// Si una fila en dólares no dice nada en J, escribí USD o USDT en J a mano y volvé a ejecutarla.
// Se puede ejecutar varias veces: las filas que ya tienen K no se tocan.
function migrarMonedas() {
  var hojas = SpreadsheetApp.getActive().getSheets();
  var cot = {}, log = [], total = 0;
  for (var h = 0; h < hojas.length; h++) {
    var sh = hojas[h];
    if (!/^\s*\d{4}\s*$/.test(sh.getName())) continue;
    if (sh.getLastRow() < 2) { log.push('Pestaña "' + sh.getName() + '": vacía'); continue; }
    var n = sh.getLastRow() - 1;
    var vals = sh.getRange(2, 1, n, Math.max(NCOLS, COL_MONEDA, COL_ORIGINAL)).getValues();
    var enDolares = 0, yaMigradas = 0, convertidas = [];
    // Títulos de las columnas nuevas, si están vacíos
    if (sh.getRange(1, COL_MONEDA).getValue() === '') sh.getRange(1, COL_MONEDA).setValue('Moneda');
    if (sh.getRange(1, COL_ORIGINAL).getValue() === '') sh.getRange(1, COL_ORIGINAL).setValue('Monto USD/USDT');
    for (var i = 0; i < n; i++) {
      var r = vals[i];
      var moneda = moneda_(r[COL_MONEDA - 1]);
      if (moneda === 'ARS' || !(r[0] instanceof Date)) continue;
      enDolares++;
      if (num_(r[COL_ORIGINAL - 1]) !== null) { yaMigradas++; continue; }
      if (num_(r[2]) === null) continue;
      if (!cot[moneda]) cot[moneda] = cotizacion_(moneda);
      var pesos = Math.round(r[2] * cot[moneda] * 100) / 100;
      escribir_(sh.getRange(i + 2, COL_ORIGINAL), r[2]);
      sh.getRange(i + 2, 3).setValue(pesos);
      convertidas.push('  fila ' + (i + 2) + ': ' + r[1] + ' ' + r[2] + ' ' + moneda + ' → $' + pesos);
    }
    total += convertidas.length;
    log.push('Pestaña "' + sh.getName() + '": ' + enDolares + ' fila(s) con USD/USDT en la columna J, ' +
      yaMigradas + ' ya estaban bien, ' + convertidas.length + ' convertida(s)' + (convertidas.length ? ':\n' + convertidas.join('\n') : ''));
  }
  if (!log.length) log.push('No encontré pestañas con nombre de año (ej. "2026").');
  if (!total) log.push('Nada para convertir. Si tenés filas en dólares, escribí USD o USDT en su columna J y ejecutá de nuevo.');
  for (var m in cot) log.push('Cotización usada ' + m + ': $' + cot[m]);
  Logger.log(log.join('\n'));
  try {
    SpreadsheetApp.getUi().alert('Convertir dólares a pesos', log.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // ejecutado desde el editor sin la hoja abierta: el resultado queda en el registro de ejecución
  }
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
