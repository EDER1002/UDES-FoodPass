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
- **Agregar** la clase `PasarelaSandbox` (adaptador simulado de la pasarela). Las tres estrategias la usan por medio de `cobrar()`; `PagoPSE` también usa `bancosPse()`.
- **Agregar** la clase `PasarelaWompi` (adaptador de la pasarela real Wompi) con los mismos métodos, más `iniciar()` y `terminos()`. Se elige con `PASARELA_MODO` (`crearPasarela(config)`). Conviene dibujar una interfaz `Pasarela` con `cobrar()` y `bancosPse()`, implementada por `PasarelaSandbox` y `PasarelaWompi`, y la dependencia de las tres estrategias hacia esa interfaz (ver `docs/pasarela-de-pago.md`).
- `EstrategiaPago.procesarTransaccion(pago)` recibe además `pagador` (correo, nombre y teléfono del titular), que Wompi exige. No se guarda en `pago`.

## 3. Diagrama de componentes: dependencias

| Desde | Hacia | Operaciones que usa | ¿Está en el diagrama? |
|---|---|---|---|
| Reservas y Pagos | Autenticación | `obtenerUsuarios`, `listarRoles` | Sí |
| Reservas y Pagos | Gestión de Menú | `obtenerMenuPublicado`, `obtenerMenu`, `validarSeleccion`, `verificarDisponibilidad`, `descontarPorcion`, `devolverPorcion`, `obtenerNombres`, `consultarMenuAdmin` | Sí |
| Validación QR | Reservas y Pagos | `obtenerReserva`, `obtenerReservas`, `marcarEntregada` | Sí |
| **Validación QR** | **Autenticación** | `obtenerUsuario` (nombre del administrador que ya entregó un ficho usado) | **No: agregar** |
| **Reservas y Pagos** | **Validación QR** | `generarFichoQR` (al confirmar), `anularFicho` (al cancelar) | **No: agregar** |
| Reservas y Pagos | Pasarela de pagos (externa: sandbox o Wompi) | `cobrar`, `bancosPse` y los webhooks `POST /api/pagos/webhook` y `POST /api/pagos/webhook/wompi` | Revisar: agregar Wompi como componente externo |

La dependencia de Reservas hacia Validación QR existe porque **el ficho se genera en la misma transacción que confirma la reserva**: si algo falla, no queda una reserva confirmada sin ficho. Para no crear un ciclo al construir los objetos, los dos servicios se conectan después de crearse (`fichos.conectarReservas(reservas)` en `backend/src/app.js`). Cada uno sigue tocando solo sus propias tablas.

**Reparto de tablas:** quedó igual que la propuesta de `CLAUDE.md` (sección 6).

## 4. Diagrama de secuencia: pasos que conviene mostrar

1. **Verificar la disponibilidad antes de cobrar:** `ReservaService` → `GestionMenuService.verificarDisponibilidad()` antes de `ProcesadorDePagos.ejecutarPago()`.
2. **Una sola transacción al aprobarse el pago:** reserva CONFIRMADA + `descontarPorcion()` + `generarFichoQR()`.
3. **Rama alternativa:** si `descontarPorcion()` falla después de un pago aprobado, el pago pasa a REEMBOLSADO (simulado) y la reserva a CANCELADA.
4. **Pago pendiente (PSE, y Nequi con Wompi):** la pasarela responde después por el webhook firmado → `confirmarPagoDesdePasarela()`. Con Wompi, PSE devuelve además la dirección del banco a la que va la persona.
5. **Entrega en dos pasos:** `validarQR(token)` muestra el pedido → el administrador confirma → `registrarEntrega()`. Esta última, en una transacción, marca el ficho como USADO, crea la `entrega` y llama a `ReservaService.marcarEntregada()`.

## 5. Registro de cuentas y Solicitudes

Se agregó después de los diagramas (decisión "Registro de cuentas" de `CLAUDE.md`, sección 13; migración `005_registro_de_cuentas.sql`). Cada persona crea su cuenta con su correo `@udes.edu.co`, su contraseña y el rol que dice tener. El backend decide si la cuenta queda activa o en revisión:

- **Estudiante regular:** queda ACTIVA y con la sesión iniciada.
- **Subsidiado, empleado y administrador:** quedan PENDIENTE hasta que un administrador verifique sus datos en la pantalla **Solicitudes**. Mientras tanto no pueden iniciar sesión.
- El administrador puede **aprobar** (al subsidiado le indica desde y hasta qué fecha tiene vigente el subsidio) o **rechazar** con un motivo, que la persona ve al intentar entrar.

### 5.1 Diagrama de clases (completo): atributos nuevos de `Usuario`

| Atributo nuevo | Tipo | Para qué |
|---|---|---|
| `estadoCuenta` | PENDIENTE / ACTIVA / RECHAZADA | Solo las cuentas ACTIVA inician sesión. Las cuentas existentes quedaron ACTIVA |
| `fechaRegistro` | fecha y hora | Orden de la lista de Solicitudes (la más antigua primero) |
| `fechaRevision` | fecha y hora, opcional | Cuándo se aprobó o rechazó |
| `idRevisor` | referencia a `Usuario`, opcional | El administrador que revisó la solicitud (asociación reflexiva de `Usuario` consigo mismo, 0..1) |
| `motivoRechazo` | texto (máx. 200), opcional | Obligatorio cuando la cuenta queda RECHAZADA |

**Enumeración nueva:** `EstadoCuenta` con PENDIENTE, ACTIVA y RECHAZADA.

**Otra restricción nueva** (migración `006`): los nombres de `TipoAlmuerzo`, `Proteina` y `Acompanamiento` son únicos sin distinguir mayúsculas. No cambia el dibujo; se puede anotar como restricción `{unique}` en `nombre`.

### 5.2 Diagrama de clases de procesos: operaciones nuevas

**`AutenticacionService`**

| Operación | Para qué |
|---|---|
| `registrarse(datos)` | Crea la cuenta con la contraseña cifrada (bcrypt). Devuelve el JWT si queda ACTIVA, o el aviso "en revisión" si queda PENDIENTE |
| `listarSolicitudes()` | Cuentas PENDIENTE para la pantalla Solicitudes |
| `aprobarCuenta(idUsuario, idRevisor, datos)` | En una transacción: bloquea la solicitud, crea el beneficio si es subsidiado y deja la cuenta ACTIVA |
| `rechazarCuenta(idUsuario, idRevisor, motivo)` | Deja la cuenta RECHAZADA con el motivo |
| `conectarAlAprobar(fn)` | Conexión con Reservas y Pagos (ver 5.3). Se llama una vez al armar la aplicación |

`iniciarSesion()` ahora también revisa `estadoCuenta`: con PENDIENTE responde `CUENTA_EN_REVISION` y con RECHAZADA, `CUENTA_RECHAZADA` con el motivo. `validarToken()` rechaza el JWT de una cuenta que ya no está ACTIVA.

**`ReservaService`**

| Operación | Para qué |
|---|---|
| `otorgarBeneficio({ idUsuario, idRol, fechaInicioVigencia, fechaFinVigencia }, tx)` | Crea el `BeneficioSubsidiado` del estudiante subsidiado recién aprobado, dentro de la misma transacción de la aprobación |

### 5.3 Diagrama de componentes: dependencia nueva

| Desde | Hacia | Operación que usa | ¿Está en el diagrama? |
|---|---|---|---|
| **Autenticación** | **Reservas y Pagos** | `otorgarBeneficio` (al aprobar a un subsidiado) | **No: agregar** |

Autenticación no importa a Reservas: recibe una función con `auth.conectarAlAprobar(...)` en `backend/src/app.js`, igual que se hace con `fichos.conectarReservas(reservas)`. Así la tabla `beneficio_subsidiado` la sigue tocando solo Reservas y Pagos. En el diagrama puede dibujarse como una dependencia punteada «callback» o como una interfaz `AlAprobarCuenta` que Reservas y Pagos implementa.

### 5.4 Endpoints nuevos

| Método y ruta | Operación | Acceso |
|---|---|---|
| `POST /api/auth/registro` | `registrarse()` | Público (con límite de intentos por IP) |
| `GET /api/admin/solicitudes` | `listarSolicitudes()` | Admin |
| `POST /api/admin/solicitudes/:id/aprobar` | `aprobarCuenta()` | Admin |
| `POST /api/admin/solicitudes/:id/rechazar` | `rechazarCuenta()` | Admin |

### 5.5 Diagrama de secuencia nuevo (sugerido): "Crear cuenta y aprobarla"

1. La persona llena Crear Cuenta → `POST /api/auth/registro` → `AutenticacionService.registrarse()`.
2. Si eligió estudiante regular: la cuenta queda ACTIVA y el frontend entra con el JWT. Fin.
3. Si no: la cuenta queda PENDIENTE y la pantalla dice "Tu cuenta quedó en revisión".
4. El administrador abre Solicitudes → `listarSolicitudes()`.
5. **Aprobar:** `aprobarCuenta()` abre una transacción → bloquea la fila (`SELECT ... FOR UPDATE`) → si es subsidiado, `ReservaService.otorgarBeneficio()` crea el beneficio → la cuenta pasa a ACTIVA con `idRevisor` y `fechaRevision`.
6. **Rama alternativa, rechazar:** `rechazarCuenta()` deja la cuenta RECHAZADA con el motivo. Al intentar entrar, la persona ve ese motivo.
7. **Rama alternativa, ya revisada:** si otro administrador la revisó primero, responde `SOLICITUD_YA_REVISADA`.
