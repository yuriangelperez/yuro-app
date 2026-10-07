package expo.modules.yuronotificaciones

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

// Cola de notificaciones capturadas, guardada en el teléfono (SharedPreferences) hasta que la app las procese.
// Solo se guardan las de apps cuyo nombre o paquete contenga alguna de las palabras que la app configuró.
object Cola {
  private const val PREFS = "yuro_notificaciones"
  private const val COLA = "cola"
  private const val PALABRAS = "palabras"
  private const val MAXIMO = 500

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun setPalabras(ctx: Context, palabras: List<String>) {
    prefs(ctx).edit().putString(PALABRAS, JSONArray(palabras.map { it.lowercase() }).toString()).apply()
  }

  fun coincide(ctx: Context, vararg textos: String): Boolean {
    val json = prefs(ctx).getString(PALABRAS, null) ?: return false
    val palabras = JSONArray(json)
    val junto = textos.joinToString(" ").lowercase()
    for (i in 0 until palabras.length()) if (junto.contains(palabras.getString(i))) return true
    return false
  }

  @Synchronized
  fun agregar(ctx: Context, item: JSONObject) {
    val cola = JSONArray(prefs(ctx).getString(COLA, "[]"))
    cola.put(item)
    val recortada = if (cola.length() > MAXIMO) JSONArray((cola.length() - MAXIMO until cola.length()).map { cola.get(it) }) else cola
    prefs(ctx).edit().putString(COLA, recortada.toString()).apply()
  }

  @Synchronized
  fun leer(ctx: Context): String = prefs(ctx).getString(COLA, "[]") ?: "[]"

  // Quita las primeras `n` (las que la app ya procesó); las que llegaron mientras tanto quedan.
  @Synchronized
  fun quitar(ctx: Context, n: Int) {
    val cola = JSONArray(prefs(ctx).getString(COLA, "[]"))
    val resto = JSONArray((minOf(n, cola.length()) until cola.length()).map { cola.get(it) })
    prefs(ctx).edit().putString(COLA, resto.toString()).apply()
  }
}
