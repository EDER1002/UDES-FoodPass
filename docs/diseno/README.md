# Diseño de pantallas: wireframes y mockups

Diseño de todas las pantallas de **UDES FoodPass**, en dos niveles de detalle:

| | Wireframes | Mockups |
|---|---|---|
| **Para qué sirven** | Definir la **estructura**: qué va en cada pantalla, en qué orden y por qué | Mostrar el **aspecto final**: colores, tipografía, íconos e imágenes |
| **Cómo se ven** | Escala de grises, imágenes como cajas con una X, notas numeradas que relacionan cada elemento con un requisito (RF/RNF) | El prototipo de Figma del usuario ("Prototipo"): azul UDES, café dorado, crema y lavanda, títulos en Merienda y texto en Mulish, con su logo y los logos de pago |
| **Carpeta** | [`wireframes/`](wireframes/) y, con notas, [`wireframes/anotados/`](wireframes/anotados/) | [`mockups/`](mockups/) |

**Los mockups son capturas de la aplicación real**, que sigue el prototipo de Figma. Así nunca se desalinean del código: se regeneran con `npm run diseno:capturas`.
- **Celular:** 402 × 874, el mismo tamaño de los marcos del prototipo de Figma. Es el caso de todas las pantallas del usuario y de la validación de fichos del administrador.
- **Escritorio:** 1280 × 860 para las demás pantallas del administrador.
- **Wireframes:** celular de 390 × 844 dentro de una imagen de 510 × 965, y ventana de escritorio de 1336 × 1143.

Las pantallas más largas que el celular (menú del día, resumen y pago, Mi Ficho, pedido del ficho) tienen una segunda imagen con la página completa.

> **Datos de ejemplo.** Nombres, precios, porciones y tokens son ficticios.
>
> Algunos detalles reflejan **propuestas pendientes de confirmar** (ver `CLAUDE.md`, sección 13). Por ejemplo: máximo de 2 o 1 acompañamientos, imagen de cada plato y las reglas de cancelación. Las notas de los wireframes las marcan como *pendiente*.

![Flujo de reserva en 3 pasos](mockups/00-flujo-reserva-figma.png)

## Flujo principal (máximo 3 pasos, RNF04)

```
 Inicio de sesión ──► 1. Menú del día ──► 2. Resumen y pago ──► 3. Mi Ficho (QR)
                                         (o "Subsidio aplicado")
                          │                      │
                          └──── errores ◄────────┘  fuera de horario · plato agotado ·
                                                    pago rechazado · subsidio no disponible ·
                                                    sin conexión
```

## Índice de pantallas

### Usuario (celular)

| # | Pantalla | Requisitos | Imágenes | Wireframe con notas |
|---|---|---|---|---|
| 00 | Crear cuenta | RF01 | `00-crear-cuenta` (solo mockup) | — |
| 01 | Inicio de sesión | RF01, RNF03 | `01-inicio-sesion`, `01-inicio-sesion-error` | [ver](wireframes/anotados/01-inicio-sesion.png) |
| 02 | Menú del día (paso 1) | RF03, RF04, RF05, RNF04 | `02-menu-del-dia`, `02-menu-del-dia-acompanamientos` | [ver](wireframes/anotados/02-menu-del-dia.png) |
| 03 | Menú desplegable | RF01 | `03-menu-navegacion` | [ver](wireframes/anotados/03-menu-navegacion.png) |
| 04 | Resumen y pago (paso 2) | RF09, RF10, RNF05 | `04-resumen-pago`, `04-resumen-pago-medios` | [ver](wireframes/anotados/04-resumen-pago.png) |
| 05 | Resumen con subsidio (paso 2) | RF06 | `05-resumen-subsidiado` | [ver](wireframes/anotados/05-resumen-subsidiado.png) |
| 06 | Mi Ficho (paso 3) | RF07, RF10 | `06-mi-ficho`, `06-mi-ficho-detalles` | [ver](wireframes/anotados/06-mi-ficho.png) |
| 07 | Mis reservas | RF07, RF10 | `07-mis-reservas` | [ver](wireframes/anotados/07-mis-reservas.png) |
| 08 | Estados de error | RF04, RF06, RF10, RNF03, RNF05 | `08-error-fuera-de-horario`, `08-error-plato-agotado`, `08-error-pago-rechazado`, `08-error-subsidio-no-disponible`, `08-error-sin-conexion` | [ver](wireframes/anotados/08-estados-error.png) |

### Administrador

| # | Pantalla | Dispositivo | Requisitos | Imágenes | Wireframe con notas |
|---|---|---|---|---|---|
| 09 | Menú del día y porciones | Escritorio | RF02, RF03, RF04 | `09-admin-menu-del-dia` | [ver](wireframes/anotados/09-admin-menu-del-dia.png) |
| 10 | Catálogos | Escritorio | RF02 | `10-admin-catalogos` | [ver](wireframes/anotados/10-admin-catalogos.png) |
| 11 | Horarios de reserva | Escritorio | RF04 | `11-admin-horarios` | [ver](wireframes/anotados/11-admin-horarios.png) |
| 12 | Validación de fichos | Celular | RF08 | `12-admin-validar-escanear`, `12-admin-validar-pedido`, `12-admin-validar-entregado`, `12-admin-validar-ficho-usado` | [ver](wireframes/anotados/12-admin-validar-ficho.png) |
| 13 | Entregas del día | Escritorio | RF08 | `13-admin-entregas` | [ver](wireframes/anotados/13-admin-entregas.png) |
| 14 | Solicitudes de cuenta | Escritorio | RF01 | `14-admin-solicitudes` (solo mockup) | — |

Cada nombre de la columna "Imágenes" existe como `mockups/<nombre>.png` y, salvo los marcados "solo mockup", como `wireframes/<nombre>.png`.

## Criterios de diseño

- **Mobile-first:** las pantallas del usuario se diseñaron a 390 px de ancho. Las del administrador son para escritorio, salvo la validación de fichos, que se hace en la caja con el celular.
- **Identidad UDES (prototipo de Figma):** azul institucional, café dorado, crema y lavanda; encabezado con avatar, nombre y menú desplegable (Inicio, Pagos, QR's, Cerrar Sesión).
- **Accesibilidad (WCAG 2.2 AA):**
  - Lo seleccionado se marca con borde grueso + ícono ✓ + texto "Seleccionado", nunca solo con color.
  - Los estados (Confirmada, Agotado, Rechazado…) siempre llevan ícono y texto.
  - Botones de 52 px de alto, con contraste suficiente.
  - Foco visible y textos alternativos en las imágenes.
- **Botones honestos:** cada botón dice lo que hace ("Continuar al pago", "Pagar $12.000", "Confirmar reserva", "Registrar entrega").
- **El frontend no decide:** el precio, las porciones, el horario, el resultado del pago y el QR los entrega el backend. La interfaz solo los muestra.

## Mockups

### Usuario

| 00 · Crear cuenta | | |
|---|---|---|
| ![Crear cuenta](mockups/00-crear-cuenta.png) | | |

| 01 · Inicio de sesión | 01 · Error de credenciales | 03 · Menú desplegable |
|---|---|---|
| ![Inicio de sesión](mockups/01-inicio-sesion.png) | ![Inicio de sesión con error](mockups/01-inicio-sesion-error.png) | ![Menú desplegable](mockups/03-menu-navegacion.png) |

| 02 · Menú del día | 02 · Acompañamientos | 05 · Resumen con subsidio |
|---|---|---|
| ![Menú del día](mockups/02-menu-del-dia.png) | ![Menú del día, acompañamientos](mockups/02-menu-del-dia-acompanamientos.png) | ![Resumen con subsidio](mockups/05-resumen-subsidiado.png) |

| 04 · Resumen y pago | 04 · Medio de pago | 07 · Mis reservas |
|---|---|---|
| ![Resumen y pago](mockups/04-resumen-pago.png) | ![Medio de pago](mockups/04-resumen-pago-medios.png) | ![Mis reservas](mockups/07-mis-reservas.png) |

| 06 · Mi Ficho | 06 · Detalles del ficho | 08 · Fuera de horario |
|---|---|---|
| ![Mi Ficho](mockups/06-mi-ficho.png) | ![Detalles del ficho](mockups/06-mi-ficho-detalles.png) | ![Fuera de horario](mockups/08-error-fuera-de-horario.png) |

| 08 · Plato agotado | 08 · Pago rechazado | 08 · Subsidio no disponible |
|---|---|---|
| ![Plato agotado](mockups/08-error-plato-agotado.png) | ![Pago rechazado](mockups/08-error-pago-rechazado.png) | ![Subsidio no disponible](mockups/08-error-subsidio-no-disponible.png) |

| 08 · Sin conexión | | |
|---|---|---|
| ![Sin conexión](mockups/08-error-sin-conexion.png) | | |

### Administrador

| 12 · Escanear | 12 · Revisar pedido |
|---|---|
| ![Escanear ficho](mockups/12-admin-validar-escanear.png) | ![Revisar pedido](mockups/12-admin-validar-pedido.png) |

| 12 · Entrega registrada | 12 · Ficho ya usado |
|---|---|
| ![Entrega registrada](mockups/12-admin-validar-entregado.png) | ![Ficho ya usado](mockups/12-admin-validar-ficho-usado.png) |

| 09 · Menú del día y porciones | 10 · Catálogos |
|---|---|
| ![Menú del día (administrador)](mockups/09-admin-menu-del-dia.png) | ![Catálogos](mockups/10-admin-catalogos.png) |

| 11 · Horarios de reserva | 13 · Entregas del día |
|---|---|
| ![Horarios de reserva](mockups/11-admin-horarios.png) | ![Entregas del día](mockups/13-admin-entregas.png) |

| 14 · Solicitudes de cuenta | |
|---|---|
| ![Solicitudes de cuenta](mockups/14-admin-solicitudes.png) | |

## Wireframes

### Usuario

| 01 · Inicio de sesión | 01 · Error de credenciales | 03 · Menú desplegable |
|---|---|---|
| ![Wireframe: inicio de sesión](wireframes/01-inicio-sesion.png) | ![Wireframe: error de credenciales](wireframes/01-inicio-sesion-error.png) | ![Wireframe: menú desplegable](wireframes/03-menu-navegacion.png) |

| 02 · Menú del día | 02 · Acompañamientos | 05 · Resumen con subsidio |
|---|---|---|
| ![Wireframe: menú del día](wireframes/02-menu-del-dia.png) | ![Wireframe: acompañamientos](wireframes/02-menu-del-dia-acompanamientos.png) | ![Wireframe: resumen con subsidio](wireframes/05-resumen-subsidiado.png) |

| 04 · Resumen y pago | 04 · Medio de pago | 07 · Mis reservas |
|---|---|---|
| ![Wireframe: resumen y pago](wireframes/04-resumen-pago.png) | ![Wireframe: medio de pago](wireframes/04-resumen-pago-medios.png) | ![Wireframe: mis reservas](wireframes/07-mis-reservas.png) |

| 06 · Mi Ficho | 06 · Detalles del ficho | 08 · Fuera de horario |
|---|---|---|
| ![Wireframe: Mi Ficho](wireframes/06-mi-ficho.png) | ![Wireframe: detalles del ficho](wireframes/06-mi-ficho-detalles.png) | ![Wireframe: fuera de horario](wireframes/08-error-fuera-de-horario.png) |

| 08 · Plato agotado | 08 · Pago rechazado | 08 · Subsidio no disponible |
|---|---|---|
| ![Wireframe: plato agotado](wireframes/08-error-plato-agotado.png) | ![Wireframe: pago rechazado](wireframes/08-error-pago-rechazado.png) | ![Wireframe: subsidio no disponible](wireframes/08-error-subsidio-no-disponible.png) |

| 08 · Sin conexión | | |
|---|---|---|
| ![Wireframe: sin conexión](wireframes/08-error-sin-conexion.png) | | |

### Administrador

| 12 · Escanear | 12 · Revisar pedido |
|---|---|
| ![Wireframe: escanear ficho](wireframes/12-admin-validar-escanear.png) | ![Wireframe: revisar pedido](wireframes/12-admin-validar-pedido.png) |

| 12 · Entrega registrada | 12 · Ficho ya usado |
|---|---|
| ![Wireframe: entrega registrada](wireframes/12-admin-validar-entregado.png) | ![Wireframe: ficho ya usado](wireframes/12-admin-validar-ficho-usado.png) |

| 09 · Menú del día y porciones | 10 · Catálogos |
|---|---|
| ![Wireframe: menú del día (administrador)](wireframes/09-admin-menu-del-dia.png) | ![Wireframe: catálogos](wireframes/10-admin-catalogos.png) |

| 11 · Horarios de reserva | 13 · Entregas del día |
|---|---|
| ![Wireframe: horarios de reserva](wireframes/11-admin-horarios.png) | ![Wireframe: entregas del día](wireframes/13-admin-entregas.png) |

### Wireframes con notas

Cada tablero de [`wireframes/anotados/`](wireframes/anotados/) muestra la pantalla con círculos numerados, y a un lado la explicación de cada número y del requisito que cumple.

![Wireframe anotado: menú del día](wireframes/anotados/02-menu-del-dia.png)

## Cómo editar o regenerar

**Mockups:** se toman de la aplicación real con `npm run diseno:capturas` (archivo [`e2e/capturas.spec.js`](../../e2e/capturas.spec.js)). Usa la misma base de pruebas y el mismo reloj fijo que `npm run prueba:navegador`, así que las capturas siempre muestran los mismos datos. Si cambias una pantalla del frontend, vuelve a correrlo para actualizar las imágenes.

**Wireframes:** salen de [`fuente/pantallas.html`](fuente/pantallas.html).

1. Ábrelo en el navegador con `pantallas.html?modo=wireframe` para ver los wireframes con sus notas. Si agregas `&exportar=1`, cada pantalla aparece en su propio marco, tal como queda en las imágenes.
2. Para regenerar los PNG después de editarlo: `node docs/diseno/fuente/renderizar.mjs`. Requiere Playwright con Chromium.

> El modo mockup de `pantallas.html` es el diseño anterior al prototipo de Figma y ya no se usa.
