# Pasarela de pago real: Wompi

**Estado:** el adaptador de Wompi ya está en el código y se activa con `PASARELA_MODO=wompi`. Por defecto la aplicación sigue usando el sandbox simulado (`PasarelaSandbox`), que no necesita cuentas ni llaves. Si el usuario prefiere ePayco, se crea otro adaptador con los mismos métodos.

## Por qué Wompi y no ePayco

1. **El sandbox ya imitaba a Wompi.** Los datos de prueba (tarjeta `4242…` que aprueba y `4111…` que rechaza, bancos PSE "1" y "2") son los mismos del sandbox de Wompi, así que el flujo probado casi no cambia.
2. **Los tres medios de RF09 en una sola API.** Tarjeta, PSE y Nequi se crean con el mismo endpoint de transacciones; solo cambia `payment_method.type` (`CARD`, `PSE`, `NEQUI`). Encaja directo con `PagoTarjeta`, `PagoPSE` y `PagoNequi`.
3. **Ambiente de pruebas gratuito y separado** (llaves `pub_test_…` / `prv_test_…`), con su propia URL de eventos. Basta para la entrega del curso.
4. **Encaja con la idempotencia (RNF05).** La `reference` de cada transacción es única en Wompi, igual que `pago.referencia_transaccion` aquí.

ePayco también serviría (tiene modo de pruebas, PSE, tarjeta y Nequi), pero su confirmación llega a una `url_confirmation` con campos `x_*` y otra firma, lo que se aleja más del webhook actual. Es buena opción si la universidad ya tiene cuenta con ePayco o Davivienda.

> **Por confirmar antes de usarlo con dinero real:** las tarifas (comisión por transacción) y los requisitos para abrir la cuenta comercial a nombre de la cafetería o de la universidad. El adaptador se probó con un Wompi simulado (`backend/tests/wompi.test.js`), no contra los servidores de Wompi, porque el entorno de Claude no tiene acceso a ellos. La primera prueba con las llaves reales de pruebas conviene hacerla con calma, revisando la documentación oficial (docs.wompi.co).

## Cómo funciona

| Pieza | Dónde | Qué hace |
|---|---|---|
| `PasarelaWompi` | `backend/src/modules/reservas-pagos/pagos/pasarela/PasarelaWompi.js` | Mismos métodos que `PasarelaSandbox`: `cobrar()` y `bancosPse()`. Al arrancar (`iniciar()`) carga los bancos PSE y los enlaces de términos del comercio |
| Elegir el adaptador | `pasarela/index.js` → `crearPasarela(config)` | `PASARELA_MODO=sandbox` o `wompi`. Las llaves `WOMPI_*` se validan al arrancar (deben empezar por `pub_test_` / `prv_test_` en el ambiente sandbox) |
| Cobro | `cobrar()` | Pide los tokens de aceptación, convierte la tarjeta en un token de Wompi, firma la transacción (SHA-256 de referencia + monto en centavos + `COP` + secreto de integridad) y la crea. Consulta unos segundos el resultado |
| Tarjeta | Backend | El número viaja solo hasta el endpoint de tokenización de Wompi; nunca se guarda ni va en la transacción |
| PSE | Frontend | La respuesta trae la dirección del banco: la pantalla muestra **"Ir a mi banco para pagar"** y sigue esperando el resultado |
| Nequi | Frontend | Queda pendiente hasta que la persona acepta la notificación en su celular |
| Webhook | `POST /api/pagos/webhook/wompi` | Verifica el checksum del evento (SHA-256 de las propiedades firmadas + `timestamp` + secreto de eventos) y aplica APROBADO o RECHAZADO con `confirmarPagoDesdePasarela()`. Los eventos repetidos o de transacciones ajenas responden 200 sin cambiar nada |
| Pagos pendientes | `ReservaService` | Con Wompi, un pago pendiente nunca se da por rechazado por tiempo: siempre espera el webhook |
| Respuesta perdida | `cobrar()` | Si se pierde la respuesta al crear la transacción, la busca por su referencia antes de decidir |
| Términos | Pantalla de pago | Wompi exige mostrar sus términos y su política de datos: aparecen como enlaces junto a "Confirmar Pago" |

## Lo que falta para dinero real

- **Reembolsos automáticos.** Hoy, cuando se agota un plato después de pagar o alguien cancela una reserva pagada, el pago queda REEMBOLSADO y la persona ve "La cafetería te devolverá el dinero". La devolución se hace a mano desde el panel de Wompi. Wompi permite anular transacciones con tarjeta por API, pero no las de PSE ni Nequi.
- **URL pública para los eventos.** Wompi necesita una dirección `https://` pública para avisar el resultado. En desarrollo se puede usar un túnel (por ejemplo, ngrok o Cloudflare Tunnel).
- **Tokenizar la tarjeta en el navegador.** Hoy la tarjeta pasa por el backend de FoodPass (sin guardarse) para tokenizarla. Para cumplir mejor PCI DSS, el frontend puede tokenizarla directamente con la llave pública y enviar solo el token.

## Cómo probarlo

1. Crea una cuenta de comercio en Wompi y copia las llaves de pruebas.
2. En `.env`: `PASARELA_MODO=wompi` y las variables `WOMPI_*` (ver `.env.example`).
3. En el panel de Wompi, URL de eventos: `https://<tu-servidor>/api/pagos/webhook/wompi`.
4. `npm run dev` y paga con los datos de prueba: tarjeta `4242 4242 4242 4242`, Nequi `3991111111` (aprueba) o `3992222222` (rechaza), PSE con el banco que aprueba o el que rechaza.
