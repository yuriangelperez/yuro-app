---
name: yuro
description: Reglas de diseño y de finanzas de Yuro (app de gastos Expo/React Native + Supabase, ARS/USD/USDT). Usala antes de crear o cambiar una pantalla o componente, y antes de tocar cualquier lógica que sume, convierta, redondee o muestre montos, fechas, saldos, cuotas, deudas o sincronización. También para revisar un diff de Yuro contra estas reglas.
---

# Yuro: reglas de diseño y de finanzas

Complementa `CLAUDE.md` (que manda si algo difiere). Seguí estos pasos según lo que vayas a tocar y, al terminar, recorré la checklist final.

## Antes de empezar

- Respondé en español. Si el cambio es grande (varias pantallas, el store o el esquema), proponé un plan corto y esperá el OK.
- No agregues dependencias, no hagas commit/push y no muestres valores de `.env`, claves ni tokens.
- Cambios chicos y enfocados; no refactorices lo que no se pidió.

## Diseño de pantallas y componentes

1. **Tema oscuro fijo.** Colores solo desde `c` de `src/theme.ts` (`bg`, `card`, `card2`, `border`, `text`, `muted`, `ingreso`, `gasto`, `ahorro`, `aviso`, `accent` rosa). Transferencias `#5dade2`, deudas `#af7ac5`. Nada de hex nuevos sueltos.
2. **Significado del color:** verde = ingreso, rojo = gasto, amarillo = ahorro, naranja = aviso, rosa = acción principal. No uses rojo/verde para decorar.
3. **Reutilizá `src/ui.tsx` antes de crear algo:** `Card`, `Titulo`, `Seccion`, `Acciones`, `MenuGrupo`/`MenuItem`, `Avatar`, `Barra`, `Pastilla`, `Tip`, `Chip`, `NuevaCategoria`, `MesSelector`, `SelectorFecha`, `SelectorMoneda`, `Fila`, `EstadoSync`, `Fab`, `PantallaTeclado`, `Tablero`/`Bloque`, `Columnas`, y estilos `s` (`s.card`, `s.titulo`, `s.sub`, `s.big`, `s.h`). Gráficos con `src/charts.tsx` (react-native-svg), no con librerías nuevas.
4. **Categorías y métodos** siempre con `catInfo` / `metInfo` (emoji + color estable).
5. **Responsive:** `useLayout()` (`escritorio`), `centrado(MAX)` para listas/tableros y `centrado(MAX_FORM)` para formularios, `Columnas` para repartir en escritorio. Probá mentalmente ancho de teléfono (~360 px) y escritorio (barra lateral).
6. **Formularios:** envolvé con `PantallaTeclado`; montos con teclado numérico; validá antes de guardar y mostrá el error en español.
7. **Feedback:** `tap()` en acciones (`tap(true)` en confirmaciones fuertes). Estados vacíos con un `Tip` que diga qué hacer.
8. **Textos de UI en voseo rioplatense** ("Guardá", "Iniciá sesión", "Volvé a conectar"), cortos y claros.
9. **Pantalla nueva:** archivo en `app/` y registro en el `Stack` de `app/_layout.tsx`, dentro de `Stack.Protected guard={acceso}`, con título en español.

## Montos, monedas y fechas

1. **Signo:** `Movimiento.valor` lleva signo. Ingreso `+`; gasto y ahorro `−`; transferencia positiva. `Deuda` y `Pago deuda` no cuentan como ingreso ni gasto. Las transferencias entre cuentas propias no inflan ingresos ni gastos.
2. **Redondeo:** toda suma, resta, prorrateo o conversión nueva termina en `Math.round(x * 100) / 100`. Al repartir (cuotas, divisiones) asigná el resto de centavos a la última parte para que la suma cierre exacta.
3. **Conversión:** solo con `convertir(v, de, a, cotizaciones)` de `src/store.ts`. Devuelve `null` si falta la cotización: manejalo (avisá, excluí o mostrá "sin cotización"), nunca lo trates como 0 en silencio. `valorArs` guarda el equivalente del día.
4. **Entrada del usuario:** `parseMonto` (punto de miles, coma decimal). Si devuelve `null`, es inválido. Rechazá 0 o negativos donde no tengan sentido; el signo lo pone el tipo, no el usuario.
5. **Salida:** `money` / `moneyCorto` con la moneda correcta. No mezcles monedas en un mismo total sin convertir.
6. **Fechas:** `YYYY-MM-DD` en hora local con `hoyYmd` y helpers de `src/util.ts`; nunca `toISOString()` para el día. Hora `HH:MM`. Planificados y movimientos futuros no entran en saldos ni estadísticas hasta cumplirse (`yaPaso`).
7. **Base de datos:** `numeric(18,2)`. Migraciones nuevas idempotentes y la app tiene que seguir andando si no se corrieron (`opcional` en `store.ts`).

## Datos y seguridad

- Cada cambio local se aplica al instante y se encola en `pendientes`; no saltees la cola ni escribas directo a Supabase desde pantallas (usá `src/nube.ts` vía el store).
- RLS por usuario: no confíes en un `user_id` mandado por el cliente.
- Mercado Pago: la app nunca ve tokens; todo pasa por la Edge Function `mp-api`. Evitá duplicados con `external_id` y `src/dedupe.ts`.
- El texto de las notificaciones no sale del teléfono. La IA solo sugiere; el usuario confirma cada cambio.
- No loguees montos ni datos personales en `console.log` que puedan quedar en producción.

## Lógica y tests

- La lógica de dominio va en módulos puros de `src/` (sin React) y se prueba en `tests/<modulo>.test.ts` con vitest y la fábrica `mov()` de `tests/ayudas.ts`.
- Para cálculos de dinero, agregá casos con decimales (p. ej. 0,1 + 0,2), monedas mixtas, cotización faltante y signo de cada tipo.
- Al terminar corré `npm run typecheck` y `npm test`.

## Checklist final

- [ ] Colores de `c`, componentes de `ui.tsx`, `catInfo`/`metInfo`, voseo.
- [ ] Se ve bien en teléfono y en escritorio (`useLayout`, `centrado`).
- [ ] Signos correctos y transferencias/deudas fuera de ingresos y gastos.
- [ ] Todo redondeado a centavos; repartos que suman exacto.
- [ ] `convertir` con manejo de `null`; `parseMonto` para leer, `money` para mostrar.
- [ ] Fechas locales con `hoyYmd`; futuros y planificados excluidos.
- [ ] Sin secretos, sin dependencias nuevas, sin commit.
- [ ] `npm run typecheck` y `npm test` pasan (o se explica por qué no).
