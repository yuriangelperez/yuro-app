package expo.modules.yuronotificaciones

import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class YuroNotificacionesModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("YuroNotificaciones")

    // ¿El usuario ya activó "Acceso a notificaciones" para esta app?
    Function("tieneAcceso") {
      val activos = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: ""
      activos.contains(context.packageName)
    }

    // Abre la pantalla del sistema donde se activa el acceso (no se puede activar desde la app).
    Function("abrirAjustes") {
      context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    Function("setPalabras") { palabras: List<String> -> Cola.setPalabras(context, palabras) }

    Function("leer") { Cola.leer(context) }

    Function("quitar") { n: Int -> Cola.quitar(context, n) }
  }
}
