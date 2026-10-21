# CLAUDE.md: UDES FoodPass

Guía para Claude Code y para cualquier persona que trabaje en este repositorio. Resume el documento de requisitos, las convenciones y los comandos. **Actualízalo al cerrar cada fase.**

## 1. Qué es

Plataforma web responsiva, pensada primero para celular, para reservar y reclamar almuerzos en la cafetería principal de la Universidad de Santander (UDES, zona de buses). Es el proyecto de aula de Diseño de Software I (Ingeniería de Software).

El usuario consulta el menú del día y elige su almuerzo. Lo reserva con anticipación pagando en línea (sandbox) o aplicando su subsidio. Después lo reclama presentando un **ficho digital con código QR**.

- **Dentro del alcance:** frontend web responsivo y API REST; PostgreSQL con 16 tablas normalizadas; generación del QR y lectura del QR desde el navegador del administrador; pagos solo en sandbox; reglas de horario, porciones y subsidio.
- **Fuera del alcance:** inventario de ingredientes (solo se manejan porciones), pagos reales y notificaciones automáticas (se evaluarán con el patrón Observer).

## 2. Cómo trabajar con el usuario

- Hablar siempre en **español**, con explicaciones sencillas.
- El usuario usa **Arch Linux** y no se siente cómodo con la terminal. **Explicar y pedir confirmación** antes de cualquier comando que instale algo en el sistema, use `sudo`, toque servicios o modifique archivos fuera del proyecto. Preferir soluciones que vivan dentro de la carpeta del proyecto.
- Trabajar **por fases** (sección 12). Al cerrar cada fase: resumen corto, comandos exactos para probar y esperar el visto bueno antes de seguir.
- Ante una contradicción o una decisión no definida: **preguntar, no inventar**. Registrar la respuesta en la sección 13.
- Hacer commits pequeños con mensajes en español. Rama de trabajo: la que indique cada sesión (cada tarea llega a `main` por pull request). **Subir siempre a GitHub** (`git push -u origin <rama>`).
- `docs/` guarda el PDF del proyecto y los diagramas UML `.drawio` (componentes, clases completo, clases de procesos y secuencia). El código debe ser coherente con ellos. Si el código necesita algo que no está en los diagramas, avisar al usuario para que los actualice.
- `docs/diseno/` guarda los wireframes y mockups de todas las pantallas. Son la referencia visual del frontend.

## 3. Roles

El rol lo determina el backend a partir del usuario autenticado. El usuario **no** escoge su rol en el login.

| Rol (`rol.nombre_rol`) | Qué puede hacer |
|---|---|
| `ESTUDIANTE_REGULAR` | Consultar el menú, elegir su almuerzo, pagar en línea dentro del horario y recibir su ficho QR |
| `ESTUDIANTE_SUBSIDIADO` | Lo mismo, pero reserva **sin pagar** si tiene su beneficio diario disponible |
| `EMPLEADO_UDES` | Igual que el regular (profesores y personal administrativo) |
| `ADMINISTRADOR` | Gestionar el menú, los catálogos, las porciones y los horarios por rol, y validar los QR al entregar |

## 4. Requisitos

| ID | Requisito |
|---|---|
| RF01 | Login que diferencia los cuatro perfiles |
| RF02 | El administrador carga, edita y elimina el menú diario (tipo de almuerzo, proteínas, acompañamientos y porciones) |
| RF03 | Mostrar las opciones del menú y cuántas porciones quedan |
| RF04 | Reservar solo dentro del horario configurado y bloquear al llegar la hora límite |
| RF05 | Elegir proteína y acompañamientos dentro del horario |
| RF06 | El subsidiado reserva sin pagar si tiene beneficio diario disponible |
| RF07 | Ficho digital único (token + QR) al confirmar la reserva |
| RF08 | El administrador escanea el QR, consulta el pedido, registra la entrega e impide reutilizar el ficho |
| RF09 | Datos de pago digital: Nequi, PSE o tarjeta |
| RF10 | Verificar la transacción y mostrar de inmediato si fue aprobada o rechazada |
| RNF01 | Responder en menos de 3 s en alta demanda (hora previa al cierre) |
| RNF02 | Disponible en el horario de la cafetería; máximo 15 min de caída no programada por incidente |
| RNF03 | Contraseñas cifradas; operaciones sobre porciones **atómicas**, sin sobreventa |
| RNF04 | Reservar en **máximo 3 pasos** desde el celular |
| RNF05 | HTTPS/TLS e **idempotencia**: un reintento nunca cobra dos veces |

## 5. Stack

- **Arquitectura en capas**, cliente-servidor: presentación (frontend), lógica (backend) y datos (PostgreSQL). El navegador solo habla con el backend por la API REST.
- **Backend:** Node.js LTS (≥ 22) + Express, JavaScript con módulos ES. Usa `pg` con migraciones SQL versionadas, `zod` para validar entradas, `bcrypt`, JWT y `qrcode`.
- **Frontend:** React + Vite (JavaScript), mobile-first. Lee el QR con `html5-qrcode` y permite escribir el token a mano como alternativa.
- **Base de datos:** PostgreSQL 16, con `docker compose` dentro del proyecto.
- **Zona horaria:** `America/Bogota` para todos los horarios. **Moneda:** COP.
- **Configuración:** `.env`, documentado en `.env.example`. Nunca subir secretos.
- **Pruebas:** Vitest + Supertest contra una base de datos de pruebas real (`DATABASE_URL_TEST`).

**Regla de oro:** el frontend solo presenta el flujo. **La disponibilidad, el precio, la reserva, el pago y el ficho se controlan en el backend.** El frontend nunca calcula el total ni genera el QR.

## 6. Módulos y ocultamiento de información

Cada módulo tiene sus tablas. **Un módulo nunca consulta las tablas de otro**: llama a las operaciones del servicio correspondiente. Los nombres de operación deben coincidir con los diagramas UML.

| Módulo (`backend/src/modules/`) | Servicio | Operaciones públicas principales | Tablas propias | Depende de |
|---|---|---|---|---|
| `autenticacion/` | `AutenticacionService` | `iniciarSesion()`, `validarToken()`, `obtenerRol()` | `rol`, `usuario` | — |
| `gestion-menu/` | `GestionMenuService` | `publicarMenu()`, `consultarMenu()`, `descontarPorcion()` | `menu`, `tipo_almuerzo`, `proteina`, `acompanamiento`, `menu_proteina`, `menu_acompanamiento` | — |
| `reservas-pagos/` | `ReservaService` | `crearReserva()`, `procesarPago()`, `cancelarReserva()` | `configuracion_reserva`, `beneficio_subsidiado`, `reserva`, `reserva_proteina`, `reserva_acompanamiento`, `pago` | Autenticación, Gestión de Menú, Validación QR |
| `validacion-qr/` | `ValidacionQRService` | `generarFichoQR()`, `validarQR()`, `registrarEntrega()` | `ficho_qr`, `entrega` | Reservas y Pagos, Autenticación |

Las operaciones extra que no están en los diagramas, y las dependencias nuevas, están en `docs/cambios-uml.md`. Reservas y Validación QR dependen una de la otra: se conectan en `backend/src/app.js` con `fichos.conectarReservas(reservas)`.

Cada módulo tiene esta forma:
- `*.service.js`: operaciones públicas.
- `*.repositorio.js`: el **único** lugar con SQL de esas tablas.
- `*.rutas.js`: endpoints.
- `*.esquemas.js`: validación con zod.

**Transacciones entre módulos:** confirmar la reserva y llamar a `descontarPorcion()` ocurren en la misma transacción. Los servicios aceptan un cliente de transacción opcional, pero cada uno sigue tocando solo sus propias tablas.

**Patrón Strategy (pagos):**
- `ProcesadorDePagos` es el contexto. Tiene `establecerEstrategia()`, `ejecutarPago()` y un método privado `verificarIdempotencia(referencia)`.
- `EstrategiaPago` es la interfaz, con `procesarTransaccion(pago)`. La implementan `PagoPSE`, `PagoTarjeta` y `PagoNequi`.
- Agregar un medio de pago = crear una clase nueva sin tocar las demás.
- **El subsidio no es una estrategia:** se valida en `ReservaService`.
- **Pasarela:** aún no hay proveedor (los candidatos son Wompi o ePayco). Se usa el adaptador `PasarelaSandbox` detrás de las estrategias y un webhook genérico `POST /api/pagos/webhook` firmado con HMAC-SHA256 (cabecera `X-FoodPass-Firma: sha256=<hex>`, secreto `WEBHOOK_SECRETO`).
- `ProcesadorDePagos` se crea **uno por pago**, para que dos pagos simultáneos no compartan la estrategia.
- **Nunca** guardar números de tarjeta ni datos sensibles de pago.

## 7. Modelo de datos (16 tablas, `snake_case`)

Reglas generales: todas las llaves foráneas llevan su restricción, y los estados se definen con `CHECK` o `ENUM`.

**Identidad y configuración**
- `rol` (id_rol, nombre_rol UNIQUE, descripcion)
- `usuario` (id_usuario, nombre, apellido, documento UNIQUE, correo UNIQUE, contrasena_hash, telefono, id_rol FK)
- `configuracion_reserva` (id_configuracion, id_rol FK NULL, id_usuario FK NULL, hora_inicio, hora_fin, fecha_inicio_vigencia, fecha_fin_vigencia, estado). Aplica a un rol **o** a un usuario, nunca a ambos.
- `beneficio_subsidiado` (id_beneficio, id_rol FK, id_usuario FK, codigo_qr_diario UNIQUE)

**Catálogo del menú**
- `menu` (id_menu, fecha, estado BORRADOR/PUBLICADO/CERRADO, hora_inicio_reserva, hora_fin_reserva, cantidad_disponible)
- `tipo_almuerzo` (id_tipo_almuerzo, nombre, descripcion, precio, tipo_servicio)
- `proteina` (id_proteina, nombre, descripcion, cantidad_disponible, estado)
- `acompanamiento` (id_acompanamiento, nombre, descripcion, estado)
- `menu_proteina` (id_menu_proteina, id_menu FK, id_proteina FK, cantidad_disponible CHECK ≥ 0)
- `menu_acompanamiento` (id_menu_acompanamiento, id_menu FK, id_acompanamiento FK, cantidad_disponible CHECK ≥ 0)

**Reservas y pagos**
- `reserva` (id_reserva, id_usuario FK, id_menu FK, id_tipo_almuerzo FK, fecha_reserva, hora_reserva, estado PENDIENTE_PAGO/CONFIRMADA/ENTREGADA/CANCELADA, tipo_reserva PAGADA/SUBSIDIADA, valor_total)
- `reserva_proteina` (id_reserva_proteina, id_reserva FK, id_proteina FK)
- `reserva_acompanamiento` (id_reserva_acompanamiento, id_reserva FK, id_acompanamiento FK)
- `pago` (id_pago, id_reserva FK UNIQUE, monto, fecha_pago, estado_pago PENDIENTE/APROBADO/RECHAZADO/**REEMBOLSADO**, referencia_transaccion UNIQUE, metodo_pago PSE/TARJETA/NEQUI). Solo existe si la reserva es PAGADA.

**Entrega**
- `ficho_qr` (id_ficho, id_reserva FK UNIQUE, token_unico UNIQUE, codigo_qr, fecha_generacion, fecha_expiracion, estado ACTIVO/USADO/EXPIRADO, fecha_uso)
- `entrega` (id_entrega, id_ficho FK UNIQUE, id_usuario_empleado FK (el administrador que valida), fecha_entrega, hora_entrega, estado_entrega)

**Índices previstos (RNF01):** menú por fecha, reservas por usuario y fecha, ficho por token.

## 8. Reglas de negocio

1. **Sesión:** toda operación de reserva exige un JWT válido. El rol sale del backend.
2. **Horario:** se reserva solo si la hora de Bogotá está dentro de la `configuracion_reserva` vigente (del usuario o de su rol) **y** dentro de la ventana del menú del día.
3. **Selección:** una proteína y uno o más acompañamientos del menú del día, con porciones disponibles. El máximo de acompañamientos depende del tipo de almuerzo (decisión pendiente, sección 13).
4. **Precio:** `valor_total` lo calcula el backend a partir de `tipo_almuerzo.precio`. Para las reservas subsidiadas es 0.
5. **Subsidio:** aplica si el rol es ESTUDIANTE_SUBSIDIADO y tiene beneficio vigente sin usar ese día. La reserva queda SUBSIDIADA y CONFIRMADA sin crear `pago`. Máximo una reserva subsidiada por día.
6. **Una reserva activa por día** (PENDIENTE_PAGO o CONFIRMADA) por usuario. Decisión pendiente.
7. **Porciones atómicas:** `UPDATE ... SET cantidad_disponible = cantidad_disponible - 1 WHERE ... AND cantidad_disponible > 0`, en la misma transacción que la confirmación de la reserva. Si el `UPDATE` no afecta filas, el plato está agotado.
8. **Pago:**
   - Se crea el `pago` en PENDIENTE con una referencia única y se elige la estrategia según el método. El resultado es APROBADO o RECHAZADO.
   - Un reintento con la misma referencia o la misma `Idempotency-Key` devuelve el mismo resultado sin cobrar de nuevo.
   - Si el pago se rechaza, la reserva se cancela y el usuario ve el motivo.
9. **Caso borde:** verificar la disponibilidad antes de cobrar. Si `descontarPorcion()` falla después de un pago aprobado, se cancela la reserva y el pago pasa a **REEMBOLSADO** (simulado). *Avisado al usuario: falta agregarlo al diagrama de clases.*
10. **Ficho:**
    - Solo se genera con la reserva CONFIRMADA.
    - El token se crea con `crypto.randomBytes`.
    - El QR contiene **solo el token**, nunca datos personales.
    - Expira al final del día del menú.
11. **Entrega:** se hace en una sola transacción: el ficho pasa a USADO con `fecha_uso`, se crea la `entrega` con el id del administrador y la reserva pasa a ENTREGADA. Un segundo escaneo se rechaza con un mensaje claro.
12. **Seguridad:** bcrypt, JWT con expiración, middleware por rol, consultas parametrizadas, validación de toda entrada y CORS restringido al frontend.

## 9. API REST

Todas las respuestas son JSON. Los errores tienen siempre la forma `{ "error": { "codigo", "mensaje" } }`, con el mensaje en español.

| Método y ruta | Operación | Acceso |
|---|---|---|
| `POST /api/auth/login` | `iniciarSesion()` | Público |
| `GET /api/auth/me` | Datos del usuario | Autenticado |
| `GET /api/menu/hoy` | `consultarMenu()` | Autenticado |
| `POST /api/reservas` | `crearReserva()` | No administradores |
| `POST /api/reservas/:id/pago` | `procesarPago()` + `Idempotency-Key` | Regular y Empleado |
| `POST /api/reservas/:id/cancelar` | `cancelarReserva()` | Dueño |
| `GET /api/reservas/mias` | Historial | Autenticado |
| `GET /api/fichos/actual` | Mi Ficho | Autenticado |
| `POST /api/pagos/webhook` | Confirmación de la pasarela | Pasarela (firma) |
| `POST/PUT/DELETE /api/admin/menu[/:id]` | `publicarMenu()` y edición | Admin |
| `GET/POST/PUT /api/admin/{proteinas,acompanamientos,tipos-almuerzo}` | Catálogos | Admin |
| `GET/PUT /api/admin/configuracion-reserva` | Horarios | Admin |
| `POST /api/admin/fichos/validar` | `validarQR(token)` | Admin |
| `POST /api/admin/fichos/:id/entregar` | Registrar entrega | Admin |
| `GET /api/admin/entregas?fecha=` | Entregas del día | Admin |

## 10. Frontend

- **Estilo:** prototipo de Figma del usuario ("Prototipo", archivo `JijfUQGzwWWd6qzJ9Hv03A`): azul UDES, café dorado, crema, lavanda y morado; títulos en Merienda y texto en Mulish. Encabezado con avatar, nombre y menú desplegable (Inicio, Pagos, QR's, Cerrar Sesión). Mobile-first. Claude no tiene permiso de edición en ese archivo, así que trabaja con capturas; para lo que el prototipo no cubre (subsidio, administrador) se sigue `docs/diseno/` con la paleta del prototipo.
- **Pantallas del usuario:**
  - Inicio de sesión.
  - Menú del día, con la hora límite visible.
  - Resumen y pago (o "Subsidio aplicado, total $0").
  - Mi Ficho: QR grande, token y el aviso "Ficho de uso único".
  - Mis reservas.
  - Estados de error: fuera de horario, plato agotado, pago rechazado, subsidio no disponible y sin conexión.
- **Pantallas del administrador:** menú del día y porciones, catálogos, horarios por rol, validación de fichos (cámara + token manual, mostrando el pedido antes de confirmar) y entregas del día.
- **Usabilidad y accesibilidad (WCAG 2.2 AA):**
  - Lo seleccionado se distingue con borde + ícono + texto, nunca solo con color.
  - Los botones dicen lo que hacen ("Continuar al pago", no "Siguiente").
  - Contraste suficiente, navegación con teclado y textos alternativos.
- **Cámara en el celular:** el navegador solo la permite con HTTPS. Para probar el escáner se usará un certificado de desarrollo local (carpeta `certs/`, ignorada por git).

## 11. Comandos

Se ejecutan desde la raíz del proyecto. Funcionan a medida que avanzan las fases.

| Comando | Qué hace | Disponible desde |
|---|---|---|
| `cp .env.example .env` | Crea tu archivo de configuración local | Fase 0 |
| `docker compose up -d` (o `npm run db:levantar`) | Enciende PostgreSQL en un contenedor | Fase 0 |
| `docker compose down` (o `npm run db:apagar`) | Apaga PostgreSQL | Fase 0 |
| `npm install` | Instala las dependencias de backend y frontend (npm workspaces) | Fase 1 |
| `npm run db:migrar` | Crea o actualiza las tablas | Fase 1 |
| `npm run db:seed` | Carga los datos de ejemplo (solo desarrollo) | Fase 1 |
| `npm run dev:backend` | API en `http://localhost:3000` | Fase 2 |
| `npm test` | Pruebas del backend (97) | Fase 2 |
| `npm run prueba:navegador` | Prueba completa en Chromium con Playwright (25 casos, `e2e/`). La primera vez: `npx playwright install chromium` | Fase 6 |
| `npm run pago:webhook [-- RECHAZADO]` | Simula la respuesta del banco al pago PSE pendiente más reciente | Fase 5 |
| `npm run dev:frontend` | Interfaz en `http://localhost:5173` | Fase 3 |
| `npm run dev` | API e interfaz juntas | Fase 3 |
| `npm run dev:celular` | Igual, con HTTPS en la red local para la cámara del celular | Fase 4 |
| `npm run build` | Compila la interfaz en `frontend/dist/` | Fase 3 |

## 12. Fases

| Fase | Entregable | Estado |
|---|---|---|
| 0. Preparación | Estructura, `CLAUDE.md`, `README.md`, `.env.example`, `docker-compose.yml`, **wireframes y mockups** | Completa |
| 1. Base de datos | Migraciones de las 16 tablas, índices y seeds | Completa |
| 2. Backend | 4 módulos, Strategy + sandbox, webhook, API y pruebas de la sección 14 del documento | Completa |
| 3. Frontend del usuario | Login, Menú, Resumen y pago, Mi Ficho, errores | Completa |
| 4. Frontend del administrador | Menú, catálogos, horarios, validación QR, entregas | Completa |
| 5. Cierre | README final, revisión de seguridad y coherencia con UML (`docs/cambios-uml.md`) | Completa |
| 6. Diseño de Figma y registro | Pantallas con el prototipo de Figma, Crear Cuenta con verificación de rol (Solicitudes) y prueba en el navegador guardada en `e2e/` | Completa |

**Verificación:** las 97 pruebas del backend pasan, y `npm run prueba:navegador` pasa sus 25 casos: los tres medios de pago, rechazo, PSE pendiente con webhook (aprobado y rechazado), subsidio y subsidio vencido, fuera de horario y hora límite, plato agotado, sin conexión, cancelación con reembolso, registro con aprobación y rechazo, validación manual y con cámara simulada, entregas y acceso denegado al panel. Cada pantalla se revisa con axe-core (WCAG 2.2 AA) y sin errores de consola. **Antes de dar por terminado un cambio del frontend, correr esa prueba.**

**Pruebas mínimas (Fase 2):**
- Reserva fuera de horario rechazada.
- Reserva subsidiada sin pago y bloqueo de una segunda el mismo día.
- 10 reservas simultáneas por la última porción: solo una se confirma.
- El mismo pago enviado dos veces genera un solo cobro.
- El ficho se genera solo con la reserva confirmada, y un segundo escaneo se rechaza.
- Un estudiante no puede usar rutas de administrador.

## 13. Decisiones

**Confirmadas**
- Repositorio con npm workspaces (`backend/`, `frontend/`).
- PostgreSQL con `docker compose` (imagen `postgres:16-alpine`, puerto expuesto solo en `127.0.0.1`).
- El estado de pago `REEMBOLSADO` se agrega por la regla 9.

**Confirmadas por el usuario** (aceptó todas las propuestas; ya están en el código):
1. Máximo de acompañamientos: 2 para el almuerzo completo y 1 para el medio, con una columna nueva `tipo_almuerzo.max_acompanamientos`. *Cambia el diagrama de clases.*
2. Una reserva activa por día por usuario: sí.
3. Imágenes: columna `imagen_url` (opcional) en `proteina` y `acompanamiento`. *Cambia el diagrama de clases.*
4. Porciones:
   - `menu.cantidad_disponible` es el total de platos del día.
   - `menu_proteina` y `menu_acompanamiento` son las porciones por opción.
   - `descontarPorcion(idMenu, idProteina, idsAcompanamiento)` descuenta las tres a la vez, y recibe una lista de acompañamientos.
   - `proteina.cantidad_disponible` es solo informativa.
5. Subsidio vigente: agregar `fecha_inicio_vigencia`, `fecha_fin_vigencia` y `estado` a `beneficio_subsidiado`. `codigo_qr_diario` se conserva (UNIQUE) pero no se usa: el ficho del día cumple esa función.
6. Cancelar una reserva confirmada: solo antes de la hora límite. Al cancelar, las porciones vuelven, el pago pasa a REEMBOLSADO, el ficho a EXPIRADO y el subsidio queda libre.
7. `tipo_almuerzo.tipo_servicio`: texto libre que describe el servicio ("Sopa, seco y jugo", "Seco y jugo"). Revisar contra el PDF cuando esté en `docs/`.

**Pagos:** sandbox simulado completo (decisión del usuario). Datos de prueba en el README.

**Decisiones técnicas** (aplicadas):
- **Menú:** un menú por fecha. Solo se elimina si no tiene reservas; si las tiene, se cierra.
- **Horario:** el horario propio de un usuario manda sobre el de su rol. Si no hay ninguno vigente, la reserva se rechaza.
- **Login:** solo correos `@udes.edu.co`.
- **Idempotencia:** `referencia_transaccion` se deriva de `Idempotency-Key`, y el UNIQUE de `pago.id_reserva` garantiza un solo cobro por reserva.
- **Sandbox:** datos de prueba al estilo Wompi (una tarjeta que aprueba y otra que rechaza).
- **Operaciones extra:** `ReservaService` tendrá algunas para Validación QR (por ejemplo `obtenerReserva()` y `marcarEntregada()`). Avisar al usuario si no están en los diagramas.
- **Reloj:** reloj inyectable (zona Bogotá) para que las pruebas fijen la hora.
- **Token del ficho:** 16 caracteres en base32 de Crockford (80 bits), con el formato `7K3Q-9XWA-2M4D-H8PN`. Al escribirlo a mano no importan mayúsculas, espacios ni guiones, y se aceptan O/0 e I/L/1 como el mismo carácter.
- **Pago pendiente:** una reserva PENDIENTE_PAGO sin pago vence a los 15 minutos; con un pago PSE pendiente espera el webhook.
- **Reembolso:** simulado; solo cambia el estado del pago a REEMBOLSADO.
- **Registro de cuentas (decisión del usuario):** cada persona crea su cuenta con correo `@udes.edu.co`, contraseña y rol. El estudiante regular queda activo; subsidiado, empleado y administrador quedan en revisión hasta que un administrador los aprueba en Solicitudes (o los rechaza con un motivo).
- **Pago que llega tarde:** si el banco confirma un pago después de la hora límite, se reembolsa (simulado) en vez de confirmar el almuerzo.
- **Prueba en el navegador:** `e2e/servidor-e2e.mjs` arranca la API con reloj fijo sobre la base de pruebas y agrega rutas `/__e2e/*` que solo existen ahí (nunca en `server.js`).

## 14. Entorno de trabajo de Claude

Claude Code trabaja en un contenedor en la nube (Ubuntu), no en el PC del usuario. Lo que se hace aquí llega al usuario solo por GitHub, así que hay que hacer commit y push de todo.
