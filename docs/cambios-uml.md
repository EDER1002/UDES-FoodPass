# Cambios para los diagramas UML

El código quedó coherente con la arquitectura de los diagramas: cuatro módulos, ocultamiento de información y Strategy para los pagos. Durante la construcción aparecieron algunas cosas que **no están en los diagramas** (o que se decidieron después, sección 13 de `CLAUDE.md`). Esta es la lista para actualizar los `.drawio` de `docs/`.

Cada punto dice en qué diagrama va y por qué existe.

## 1. Diagrama de clases (completo): atributos nuevos

| Clase | Atributo nuevo | Tipo | Por qué |
|---|---|---|---|
| `TipoAlmuerzo` | `maxAcompanamientos` | entero (1–5) | Decisión 1: el almuerzo completo admite 2 acompañamientos y el medio, 1 |
| `Proteina` | `imagenUrl` | texto, opcional | Decisión 3: la foto o ilustración del plato en el menú |
| `Acompanamiento` | `imagenUrl` | texto, opcional | Decisión 3 |
| `BeneficioSubsidiado` | `fechaInicioVigencia`, `fechaFinVigencia` | fecha | Decisión 5: saber si el subsidio está vigente hoy |
| `BeneficioSubsidiado` | `estado` | ACTIVO / INACTIVO | Decisión 5 |

**Valores nuevos en enumeraciones**

- `Pago.estadoPago`: se agrega **`REEMBOLSADO`**. Se usa en dos casos (regla 9 y decisión 6):
  - la porción se agotó justo después de aprobarse el pago;
  - el usuario cancela una reserva pagada antes de la hora límite.
  En ambos casos el reembolso es simulado: el pago se marca como REEMBOLSADO y no se llama a ninguna pasarela. Con un proveedor real habrá que agregar la llamada de reembolso.

**Precisiones de tipo** (no cambian el diagrama, pero conviene anotarlas)

- `FichoQR.tokenUnico`: 19 caracteres con el formato `XXXX-XXXX-XXXX-XXXX` (base32 de Crockford, sin letras que se confundan como O/0 o I/1). Se genera con `crypto.randomBytes` (80 bits).
- Precios y montos: enteros en pesos colombianos (COP), sin decimales.
- `TipoAlmuerzo.tipoServicio`: texto libre que describe el servicio, por ejemplo "Sopa, seco y jugo" (decisión 7).
- `BeneficioSubsidiado.codigoQrDiario`: se conserva por compatibilidad con el diagrama, pero el sistema no lo usa. El ficho de cada día ya cumple esa función (decisión 5).

## 2. Diagrama de clases de procesos: operaciones nuevas

Las operaciones de los diagramas existen con el mismo nombre. Además se necesitaron estas:

**`GestionMenuService`**

| Operación | Para qué |
|---|---|
| `devolverPorcion(idMenu, idProteina, idsAcompanamiento)` | Inversa de `descontarPorcion()`: devuelve las porciones al cancelar una reserva |
| `validarSeleccion(menu, pedido)` | Comprueba que la proteína y los acompañamientos pertenezcan al menú del día y respeten el máximo del tipo de almuerzo |
| `verificarDisponibilidad(idMenu, pedido)` | Revisa que haya porciones **antes de cobrar** (regla 9) |
| `obtenerMenuPublicado(fecha)` / `obtenerMenu(id)` | Lectura para `ReservaService` |
| `obtenerNombres(...)` | Nombres de los platos para el historial y el ficho |
| `consultarMenuAdmin`, `actualizarMenu`, `eliminarMenu` | Pantalla del administrador (RF02) |
| CRUD de catálogos: `listar/crear/actualizar` + `Tipo`, `Proteina`, `Acompanamiento` | Catálogos (RF02) |

Nota: `descontarPorcion()` recibe una **lista** de acompañamientos y descuenta menú, proteína y acompañamientos en una sola operación atómica (decisión 4).

**`ReservaService`**

| Operación | Para qué |
|---|---|
| `contextoDelDia(usuario)` | Le dice al frontend si el horario está abierto, si aplica el subsidio y si ya hay una reserva activa |
| `obtenerReserva(id)` / `obtenerReservas(ids)` | Las usa Validación QR para mostrar el pedido al escanear |
| `marcarEntregada(idReserva, tx)` | La usa Validación QR dentro de la transacción de entrega (regla 11) |
| `confirmarPagoDesdePasarela(referencia, estado)` | Procesa el webhook de la pasarela (pagos PSE que quedan pendientes) |
| `listarMias(usuario)` / `obtenerDeUsuario(id, usuario)` / `reservaVigenteDeHoy(usuario)` | Mis reservas y Mi Ficho |
| `conteoSelecciones(idMenu)` / `resumenDelDia(fecha)` | Panel del administrador: cuántas porciones se reservaron y entregaron |
| `listarConfiguraciones()` / `guardarConfiguracion(datos)` | Horarios por rol o por usuario |

**`ValidacionQRService`**

| Operación | Para qué |
|---|---|
| `registrarEntrega(idFicho, idAdministrador)` | Segundo paso de RF08: después de `validarQR()` y de ver el pedido, el administrador confirma la entrega |
| `anularFicho(idReserva, tx)` | Al cancelar una reserva, su ficho pasa a EXPIRADO |
| `obtenerPorReservas(ids)` | Mi Ficho y Mis reservas muestran el ficho de cada reserva |
| `listarEntregas(fecha)` | Entregas del día |

**`AutenticacionService`**

| Operación | Para qué |
|---|---|
| `obtenerUsuario(id)` / `obtenerUsuarios(ids)` | Nombre del titular del ficho y del administrador que entregó |
| `buscarUsuarios(texto)` / `listarRoles()` | Pantalla de horarios: excepción para un usuario concreto |

**Patrón Strategy (sin cambios de estructura)**

- `ProcesadorDePagos`: `establecerEstrategia()`, `ejecutarPago()` y el método privado `verificarIdempotencia(referencia)`, como en el diagrama.
- `EstrategiaPago.procesarTransaccion(pago)`, implementada por `PagoNequi`, `PagoPSE` y `PagoTarjeta`.
- **Agregar** la clase `PasarelaSandbox` (adaptador simulado de la pasarela). Las tres estrategias la usan por medio de `cobrar()`; `PagoPSE` también usa `bancosPse()`. El día que haya un proveedor real (Wompi o ePayco), se crea otro adaptador con esos mismos métodos.

## 3. Diagrama de componentes: dependencias

| Desde | Hacia | Operaciones que usa | ¿Está en el diagrama? |
|---|---|---|---|
| Reservas y Pagos | Autenticación | `obtenerUsuarios`, `listarRoles` | Sí |
| Reservas y Pagos | Gestión de Menú | `obtenerMenuPublicado`, `obtenerMenu`, `validarSeleccion`, `verificarDisponibilidad`, `descontarPorcion`, `devolverPorcion`, `obtenerNombres`, `consultarMenuAdmin` | Sí |
| Validación QR | Reservas y Pagos | `obtenerReserva`, `obtenerReservas`, `marcarEntregada` | Sí |
| **Validación QR** | **Autenticación** | `obtenerUsuario` (nombre del administrador que ya entregó un ficho usado) | **No: agregar** |
| **Reservas y Pagos** | **Validación QR** | `generarFichoQR` (al confirmar), `anularFicho` (al cancelar) | **No: agregar** |
| Reservas y Pagos | Pasarela de pagos (externa) | `cobrar` y el webhook `POST /api/pagos/webhook` | Revisar |

La dependencia de Reservas hacia Validación QR existe porque **el ficho se genera en la misma transacción que confirma la reserva**: si algo falla, no queda una reserva confirmada sin ficho. Para no crear un ciclo al construir los objetos, los dos servicios se conectan después de crearse (`fichos.conectarReservas(reservas)` en `backend/src/app.js`). Cada uno sigue tocando solo sus propias tablas.

**Reparto de tablas:** quedó igual que la propuesta de `CLAUDE.md` (sección 6).

## 4. Diagrama de secuencia: pasos que conviene mostrar

1. **Verificar la disponibilidad antes de cobrar:** `ReservaService` → `GestionMenuService.verificarDisponibilidad()` antes de `ProcesadorDePagos.ejecutarPago()`.
2. **Una sola transacción al aprobarse el pago:** reserva CONFIRMADA + `descontarPorcion()` + `generarFichoQR()`.
3. **Rama alternativa:** si `descontarPorcion()` falla después de un pago aprobado, el pago pasa a REEMBOLSADO (simulado) y la reserva a CANCELADA.
4. **Pago pendiente (PSE):** la pasarela responde después por el webhook firmado → `confirmarPagoDesdePasarela()`.
5. **Entrega en dos pasos:** `validarQR(token)` muestra el pedido → el administrador confirma → `registrarEntrega()`. Esta última, en una transacción, marca el ficho como USADO, crea la `entrega` y llama a `ReservaService.marcarEntregada()`.
