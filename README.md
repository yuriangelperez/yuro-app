# Mis Finanzas

App móvil (Expo / React Native) que se sincroniza con tu Google Sheet mediante un Web App de Google Apps Script.
Proyecto independiente: no usa los workspaces del monorepo de Sabor y Sazón.

## 1. Conectar tu hoja
1. Abrí tu hoja → **Extensiones → Apps Script** y reemplazá el código por `apps-script/Code.gs`.
2. **Configuración del proyecto → Propiedades del script** → `TOKEN` = una clave larga inventada.
3. **Implementar → Administrar implementaciones → ✏️ editar → Versión: Nueva versión → Implementar** (la URL `/exec` no cambia).

La app usa el formato de tu pestaña del año (`2026`, `2027`…):
`Fecha | Concepto | Valor | Tipo | Método | Categoría | Categoría 2 | Cuotas cumplidas | Cuotas totales`.
Los movimientos nuevos se insertan al final del bloque de su mes. Ingresos van en positivo; egresos y ahorros en negativo.

## 2. Correr la app
```bash
cd finanzas-app
npm install
npm start        # escaneá el QR con Expo Go
```
En **Ajustes** pegá la URL y el token → *Guardar y sincronizar*.

## Cómo sincroniza
- Al abrir y con *pull-to-refresh* baja la hoja (la hoja es la fuente de verdad).
- Los cambios hechos en la app se guardan al instante en local y se suben a la hoja; si no hay internet quedan en cola y se envían en la próxima sincronización.
