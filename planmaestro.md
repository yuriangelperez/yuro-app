Yuro — Plan Maestro de Producto y Arquitectura

1. Visión del proyecto

Yuro será una aplicación de finanzas personales que permita al usuario:

- Registrar ingresos y gastos.
- Planificar movimientos futuros.
- Administrar múltiples cuentas financieras.
- Detectar automáticamente movimientos desde notificaciones.
- Identificar transferencias internas.
- Administrar deudas.
- Sincronizar diferentes proveedores financieros.
- Analizar el comportamiento financiero.
- Utilizar IA para interpretar movimientos ambiguos.
- Visualizar patrimonio y evolución financiera.
- Compartir determinadas finanzas con otra persona.
- Funcionar bajo un modelo Freemium.

La filosofía principal será:

«Yuro no debe limitarse a registrar movimientos. Debe entender qué ocurrió realmente con el dinero.»

---

2. Principio contable central

Yuro debe diferenciar:

Eventos económicos

- Ingreso
- Gasto
- Deuda
- Pago de deuda
- Devolución

Movimientos de dinero

- Transferencia entre cuentas propias
- Depósito
- Retiro
- Movimiento entre proveedores
- Cambio de activo

Esto evita inflar artificialmente los ingresos y gastos.

Ejemplo

Usuario gana:

$1.000.000

Luego:

Mercado Pago → Naranja X
$200.000

Yuro debe registrar:

TRANSFERENCIA

No:

INGRESO +$200.000
GASTO -$200.000

---

3. Tipos de transacciones

El sistema deberá soportar como mínimo:

income
expense
transfer
debt_payment
debt_repayment
refund
withdrawal
deposit
asset_exchange
fee

No todos los tipos necesariamente afectan el cálculo de ingresos/gastos.

---

4. Cuentas financieras

Crear una entidad "accounts".

Ejemplos:

Mercado Pago
Naranja X
Santander
Galicia
PayPal
Binance
Efectivo
Caja de ahorro
Cuenta corriente
Ahorros

Modelo conceptual:

accounts
---------
id
user_id
name
provider_id
type
currency
is_active
created_at
updated_at

Tipos posibles:

bank
wallet
cash
payment
exchange
savings
investment

---

5. Proveedores

Crear una entidad independiente para identificar de dónde viene cada movimiento.

providers
---------
id
name
type
logo
country
is_active

Ejemplos:

Mercado Pago
Naranja X
Santander
Galicia
PayPal
Binance

Esto permitirá agregar proveedores sin modificar la estructura principal de transacciones.

---

6. Conectores financieros

Yuro debe utilizar una arquitectura basada en conectores.

Conceptualmente:

FinancialConnector
│
├── BankConnector
├── MercadoPagoConnector
├── PayPalConnector
├── BinanceConnector
└── NotificationConnector

Cada conector deberá encargarse de:

connect()
authenticate()
syncAccounts()
syncTransactions()
refreshToken()
disconnect()

El resto de Yuro no debería preocuparse por cómo funciona cada proveedor.

---

7. Normalización

Todas las fuentes deben convertirse a una estructura común.

Ejemplo:

PayPal
    ↓
PayPal transaction
    ↓
Normalizer
    ↓
Yuro transaction

Lo mismo:

Banco
Mercado Pago
Binance
Notificación
CSV
XLSX
Manual
       ↓
Normalizer
       ↓
Yuro transaction

---

8. Transacciones

Modelo conceptual:

transactions
------------
id
user_id
account_id
destination_account_id
provider_id
type
amount
currency
asset
description
category_id
transaction_date
source
external_id
fingerprint
planned_transaction_id
debt_id
metadata
created_at
updated_at

La aplicación debe considerar "user_id" como propiedad del servidor y no confiar ciegamente en un "user_id" enviado por el cliente.

---

9. Prevención de duplicados

Una misma operación puede llegar por:

Notificación
API de Mercado Pago
API bancaria
CSV
Importación
Registro manual

Yuro debe evitar que se registre dos veces.

Prioridad:

1. "external_id"
2. ID del proveedor
3. fingerprint
4. coincidencia de monto
5. fecha
6. cuenta
7. descripción
8. margen de tolerancia

Ejemplo:

Mercado Pago API
        ↓
$50.000
        ↓
Ya existe una transacción
        ↓
NO crear otra
        ↓
Asociar nueva fuente

---

10. Transacciones planificadas

El usuario puede registrar algo antes de que ocurra.

Ejemplo:

15/10
Sueldo esperado
+$1.000.000

Eso NO significa que ya haya recibido el dinero.