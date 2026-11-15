package expo.modules.yuronotificaciones

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject

class NotificacionesService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      val paquete = sbn.packageName ?: return
      if (paquete == applicationContext.packageName) return
      val n = sbn.notification ?: return
      if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return // el resumen de un grupo repite las notificaciones individuales

      val extras = n.extras
      val titulo = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
      val texto = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
      if (titulo.isBlank() && texto.isBlank()) return

      // El nombre visible de la app puede no estar disponible (visibilidad de paquetes): en ese caso se usa el paquete.
      val app = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(paquete, 0)).toString()
      } catch (e: Exception) {
        paquete
      }
      if (!Cola.coincide(applicationContext, app, paquete)) return

      Cola.agregar(
        applicationContext,
        JSONObject().put("paquete", paquete).put("app", app).put("titulo", titulo).put("texto", texto).put("hora", sbn.postTime),
      )
    } catch (e: Exception) {
      // Una notificación rara nunca debe tumbar el servicio
    }
  }
}
