# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

## Reglas de trabajo (permanentes)

- Responder siempre en español.
- Antes de un cambio grande, proponer un plan corto y esperar el OK del usuario.
- Cambios pequeños y enfocados; no refactorizar lo que no se pidió.
- Respetar el estilo existente. No agregar dependencias sin preguntar.
- Nunca imprimir ni subir claves, tokens ni `.env` (se pueden nombrar variables, nunca sus valores). Nunca hacer commit ni push sin que el usuario lo pida.
- Git: trabajar siempre en local, en `main`, con el usuario de git configurado (yuriangelperez). No crear ramas aparte (ni `claude/*`) ni worktrees.
- La app se llama **Yuro** (no "Mis Finanzas"). Ignorar `planmaestro.md`.
- Es una app financiera: montos sin errores de redondeo, con validaciones y con cuidado en los datos sensibles (ver "Montos y dinero").

## Qué es Yuro

App de finanzas personales (Argentina, multi‑moneda ARS/USD/USDT) para Android y web. Registra ingresos, gastos, ahorros, cambios de moneda, transferencias entre cuentas propias y deudas; además planificados, recurrentes, reservas, presupuestos, cuotas, patrimonio, reglas automáticas e IA para clasificar. Las transferencias entre cuentas propias, deudas y pagos de deuda no cuentan como ingreso ni gasto.

## Stack

- Expo SDK 57 + React Native 0.86 + React 19, TypeScript estricto (`tsconfig.json`, extiende `expo/tsconfig.base`).
- Navegación: `expo-router` (rutas por archivo en `app/`). Web con Metro (`output: single`).
- Estado: `zustand` con `persist` sobre AsyncStorage (`src/store.ts`).
- Backend: Supabase (schema `yuro`, RLS por usuario, login con Google PKCE) + Edge Functions en Deno.
- Integraciones: Mercado Pago (OAuth, solo lectura), Google Sheets vía Apps Script (modo legado), Gemini / Ollama para IA, dolarapi.com para cotizaciones.
- Módulo nativo propio Android (Kotlin) para leer notificaciones de bancos: `modules/yuro-notificaciones`.
- Tests: `vitest` (solo lógica pura en `src/`). Builds: EAS (`eas.json`: `preview` = APK, `production` = AAB).

## Cómo correr

```bash
npm install
npm start            # Expo (QR para Expo Go / dev client)
npm run web          # versión web
npm run android      # Android
npm run typecheck    # tsc --noEmit
npm test             # vitest run
```

- Las Edge Functions (`supabase/functions/*`) quedan fuera del `tsconfig` (son Deno). Se despliegan con la CLI de Supabase; sus secretos se nombran en el encabezado de cada función (`MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `STATE_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MODEL_RESPALDO`; `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los da Supabase).
- Las migraciones en `supabase/migrations/` son idempotentes y se pegan en el SQL Editor. Si se agrega una tabla, la app debe seguir funcionando aunque la migración no se haya corrido (ver `opcional` en `store.ts`).
- El módulo de notificaciones solo existe en un APK/dev client de Android; en web, iOS o Expo Go queda inerte (`requireOptionalNativeModule`).
- Builds: `eas build -p android --profile preview`. Subir `versionCode` en `app.json` en cada APK.

## Estructura

```
app/                     Pantallas (expo-router)
  _layout.tsx            Raíz: sesión, bloqueo con PIN, conexión a la nube y ciclo de sincronización
  (tabs)/                Pestañas: index (Resumen), movimientos, cuotas, ahorros, estadisticas, ajustes
  nuevo.tsx              Alta/edición de movimiento (modal)
  cuentas, deudas, planificados, recurrentes/recurrente, reservas, presupuestos,
  patrimonio, saldos, efectivo, importar, reglas, revisar, ia, calculadora .tsx
  login.tsx, auth.tsx, mp.tsx   Login y rutas de regreso (deep links yuro://auth, yuro://mp)
src/
  store.ts               Store global zustand: estado, acciones, sincronización y hooks derivados
  types.ts               Movimiento, Tipo, Moneda, Origen
  theme.ts               Colores (`c`), categorías/métodos por defecto, catInfo/metInfo
  ui.tsx                 Componentes compartidos y estilos `s`
  util.ts                Fechas, formato de dinero (`money`), `parseMonto`, `norm`
  nube.ts                Capa de acceso a Supabase (mapeo Movimiento ⇄ fila)
  supabase.ts            Cliente Supabase (schema yuro, PKCE)
  auth.ts, bloqueo.ts    Login Google; PIN/biometría
  mp.ts                  Cliente de la Edge Function mp-api
  sheets.ts              Cliente del Web App de Apps Script (modo hoja)
  notificaciones.ts, notifParser.ts   Notificaciones Android → movimientos
  dedupe, transferencias, planificados, recurrentes, reservas, deudas, cuotas,
  reglas, agenda, proyeccion, analisis, mantenimiento, importar, exportar, calc, ia   Lógica de dominio (pura, testeada)
supabase/migrations/     Schema yuro (perfiles, movimientos, cuentas, proveedores, categorias, presupuestos,
                         recurrentes, planificados, deudas, reservas, reglas_categoria, saldos_iniciales,
                         importaciones, conexiones_mp)
supabase/functions/      mp-api, mp-callback (Mercado Pago), ia-clasificar (Gemini)
modules/yuro-notificaciones/   Módulo Expo nativo (Kotlin) que encola notificaciones
apps-script/Code.gs      Backend de Google Sheets (modo legado)
tests/                   vitest; `tests/ayudas.ts` tiene la fábrica `mov()`
```

## Flujo de datos

- **Fuente única en la app: `useFinanzas` (`src/store.ts`)**, persistido en AsyncStorage. Las pantallas leen con selectores y hooks derivados (`useMovimientosMes`, `useConversor`, `saldosAl`, `saldosPorCuenta`, `usePatrimonio`, `useAlertas`, `useAgenda`…) y escriben con acciones (`guardar`, `eliminar`, `guardarCuenta`, `pagarDeuda`…).
- Movimientos en `porAnio[anio]`. Cada cambio se aplica al instante en local y se encola en `pendientes` (`upsert`/`delete`); `sincronizar()` vacía la cola y luego baja los datos.
- **Tres modos:**
  1. **Nube** (`nubeUid` definido): Supabase vía `src/nube.ts`. RLS asegura que cada usuario vea solo sus filas; no confiar en un `user_id` enviado por el cliente. Cuentas, planificados, deudas, reservas y reglas se bajan aparte con `bajarExtras` y, si falla una, se conserva lo anterior.
  2. **Google Sheets** (`url` + `token`): `src/sheets.ts` contra `apps-script/Code.gs`; la hoja es la fuente de verdad; ids `fila|fecha|concepto` o `n-…` si aún no se subió.
  3. **Local** (`modoLocal`, "Continuar sin cuenta"): solo en el teléfono.
- **Ciclo al abrir / volver a la app / cada 10 min** (`app/_layout.tsx`): `sincronizar` → Mercado Pago automático (cada 15 min) → `generarRecurrentes` → notificaciones Android → `aplicarReglas` → `conciliarPlanificados`.
- **Mercado Pago**: la app nunca ve tokens. `src/mp.ts` llama a la Edge Function `mp-api` (con la sesión del usuario), que guarda tokens en `conexiones_mp`, pide el reporte "dinero en cuenta", lo parsea e inserta movimientos con `origen: 'mercadopago'` y `external_id` para no duplicar. `mp-callback` recibe el OAuth.
- **Duplicados**: `src/dedupe.ts` y `external_id`.
- **Transferencias / depósitos a reservas**: se detectan pares gasto+ingreso (`transferencias.ts`) y el usuario confirma convertirlos.
- Planificados no entran en saldos ni estadísticas hasta cumplirse; movimientos con fecha futura tampoco (`yaPaso`).

## Montos y dinero

- `Movimiento.valor` va **con signo**: ingresos positivos; egresos y ahorros negativos. Transferencia lleva el monto positivo. `Deuda` y `Pago deuda` no son ingreso ni gasto.
- `moneda` en `ARS | USD | USDT`; `valorArs` guarda el equivalente en pesos (cotización del día). En la base: `numeric(18,2)`.
- Redondeo a centavos con `Math.round(x * 100) / 100` (patrón usado en todo el store); mantenerlo en cualquier suma o conversión nueva. Convertir monedas solo con `convertir()` del store (devuelve `null` si falta cotización: manejarlo, no asumir 0 en silencio).
- Leer montos escritos por el usuario con `parseMonto` (formato argentino: punto de miles, coma decimal). Mostrar con `money` / `moneyCorto`.
- Fechas `YYYY-MM-DD` en hora local (`hoyYmd`), nunca `toISOString()` para el día. Hora `HH:MM`.
- El texto de las notificaciones no sale del teléfono; la IA solo sugiere y el usuario confirma cada cambio.

## Convenciones de código

- Todo en español: nombres de variables, funciones, archivos, comentarios y textos de UI (voseo rioplatense en la UI: "Iniciá sesión", "volvé a conectar").
- Comentarios cortos que explican el *porqué*, en la línea anterior o al final de la línea.
- Funciones flecha y objetos compactos; líneas largas permitidas. Sin ESLint/Prettier configurados: imitar el archivo vecino.
- La lógica de dominio va en módulos puros de `src/` (sin React) y se testea en `tests/<modulo>.test.ts` con vitest y `mov()`.
- Errores: lanzar `Error` con mensaje en español entendible para el usuario; el store los guarda en `error`.
- Importaciones relativas (`../src/...`); tipos con `import type` / `type`.

## Convenciones de UI

- Tema oscuro fijo. Colores en `c` de `src/theme.ts`: `bg #0b0f14`, `card #151b23`, `card2 #1c242e`, `border #232c37`, `text #f2f5f8`, `muted #8a97a6`, `ingreso #2ecc8f`, `gasto #ff5d6c`, `ahorro #f5c542`, `aviso #ffa94d`, `accent #ff4fa3` (rosa). Transferencias `#5dade2`, deudas `#af7ac5`. Usar `c.*`, no hex nuevos sueltos.
- Categorías y métodos: emoji + color con `catInfo` / `metInfo` (colores estables por nombre para las personalizadas).
- Reutilizar componentes de `src/ui.tsx` antes de crear nuevos: `Card`, `Titulo`, `Seccion`, `Acciones`, `MenuGrupo`/`MenuItem`, `Avatar`, `Barra`, `Pastilla`, `Tip`, `Chip`, `NuevaCategoria`, `MesSelector`, `SelectorFecha`, `SelectorMoneda`, `Fila` (movimiento), `EstadoSync`, `Fab`, `PantallaTeclado`, `Tablero`/`Bloque`, `Columnas`. Estilos comunes en `s` (`s.card`, `s.titulo`, `s.sub`, `s.big`, `s.h`…). Gráficos en `src/charts.tsx` (react-native-svg).
- Responsive: `useLayout()` (`escritorio`), `centrado(MAX | MAX_FORM)`, `Columnas`. En escritorio las pestañas van en barra lateral.
- `tap()` para feedback háptico. Pantallas nuevas se registran en el `Stack` de `app/_layout.tsx` (dentro de `Stack.Protected guard={acceso}`) con título en español.
