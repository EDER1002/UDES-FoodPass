# Pasarela de pago real: recomendación

**Estado:** pendiente de decisión del usuario. Mientras tanto, la aplicación usa el adaptador simulado `PasarelaSandbox` (decisión "Pagos: sandbox simulado completo", `CLAUDE.md`, sección 13).

## Recomendación: Wompi

Para este proyecto recomiendo **Wompi** sobre ePayco, por cuatro razones:

1. **El sandbox actual ya imita a Wompi.** Los datos de prueba del README (una tarjeta que aprueba y otra que rechaza, Nequi y PSE con un banco que aprueba y otro que rechaza) siguen el estilo de Wompi. Pasar al proveedor real cambia muy poco del flujo que ya está probado.
2. **Los tres medios de RF09 en una sola API.** Tarjeta, PSE y Nequi se crean con el mismo endpoint de transacciones; solo cambia `payment_method.type` (`CARD`, `PSE`, `NEQUI`). Encaja directo con las tres estrategias `PagoTarjeta`, `PagoPSE` y `PagoNequi`.
3. **Ambiente de pruebas gratuito y separado** (llaves `pub_test_…` / `prv_test_…`), con su propia URL de eventos. Se puede probar sin dinero real ni contrato comercial, lo que basta para la entrega del curso.
4. **Encaja con la idempotencia (RNF05).** La `reference` de cada transacción es única en Wompi, igual que `pago.referencia_transaccion` aquí, así que un reintento con la misma referencia no puede cobrar dos veces.

**ePayco** también serviría (tiene modo de pruebas, PSE, tarjeta y Nequi), pero su confirmación llega a una `url_confirmation` con campos `x_*` y una firma propia, lo que se aleja más del webhook genérico actual. Es buena opción si la universidad ya tiene cuenta con ePayco o Davivienda.

> **Por confirmar antes de decidir:** las tarifas (comisión por transacción) y los requisitos para abrir una cuenta comercial a nombre de la cafetería o de la universidad. Desde el entorno de Claude no se pudieron consultar las páginas oficiales de ninguno de los dos, así que los detalles técnicos de abajo hay que verificarlos en la documentación de Wompi (docs.wompi.co) al momento de integrarlo.

## Qué cambia en el código si se elige Wompi

El diseño ya lo previó: las estrategias no hablan con el proveedor, sino con un adaptador. Basta con:

| Cambio | Dónde | Detalle |
|---|---|---|
| Clase nueva `PasarelaWompi` | `backend/src/modules/reservas-pagos/pagos/pasarela/` | Mismos métodos que `PasarelaSandbox`: `cobrar({ metodo, referencia, monto, datos })` y `bancosPse()`. Monto en centavos (`monto * 100`), moneda `COP` |
| Elegir el adaptador | Configuración (`PASARELA_MODO=wompi`) | Nuevas variables en `.env.example`: llave pública, llave privada, secreto de eventos y secreto de integridad. Nunca se suben a GitHub |
| Datos de la tarjeta | Frontend | La tarjeta se **tokeniza en el navegador** con la llave pública de Wompi; el backend solo recibe el token. Así se cumple "nunca guardar números de tarjeta" |
| Webhook | `POST /api/pagos/webhook` | Wompi firma sus eventos con un checksum SHA-256 (no HMAC) de ciertos campos del evento + la fecha + el secreto de eventos. Hay que agregar ese verificador junto al actual y traducir `APPROVED` / `DECLINED` / `ERROR` a APROBADO / RECHAZADO |
| Reembolsos | `ReservaService` (cancelación y regla 9) | Hoy el reembolso solo cambia el estado a REEMBOLSADO. Con Wompi hay que llamar a su API de anulación o reembolso |
| Pruebas | `backend/tests/` | Las pruebas siguen usando `PasarelaSandbox`; se agrega una prueba del verificador de firma de Wompi con un evento de ejemplo |

Nada de esto toca `ProcesadorDePagos`, `EstrategiaPago` ni las tablas: es justamente lo que permite el patrón Strategy más el adaptador.
