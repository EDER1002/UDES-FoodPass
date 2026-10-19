# Diseño de pantallas: wireframes y mockups

Diseño de todas las pantallas de **UDES FoodPass**, en dos niveles de detalle:

| | Wireframes | Mockups |
|---|---|---|
| **Para qué sirven** | Definir la **estructura**: qué va en cada pantalla, en qué orden y por qué | Mostrar el **aspecto final**: colores, tipografía, íconos e imágenes |
| **Cómo se ven** | Escala de grises, imágenes como cajas con una X, **notas numeradas** que relacionan cada elemento con un requisito (RF/RNF) | Identidad UDES en azules y blanco, ilustraciones de los platos y un QR real |
| **Carpeta** | [`wireframes/`](wireframes/) | [`mockups/`](mockups/) |

> **Datos de ejemplo.** Nombres, precios, porciones y tokens son ficticios.
>
> Algunos detalles reflejan **propuestas pendientes de confirmar** (ver `CLAUDE.md`, sección 13). Por ejemplo: máximo de 2 o 1 acompañamientos, imagen de cada plato y las reglas de cancelación. Las notas de los wireframes las marcan como *pendiente*.

## Flujo principal (máximo 3 pasos, RNF04)

```
 Inicio de sesión ──► 1. Menú del día ──► 2. Resumen y pago ──► 3. Mi Ficho (QR)
                                         (o "Subsidio aplicado")
                          │                      │
                          └──── errores ◄────────┘  fuera de horario · plato agotado ·
                                                    pago rechazado · subsidio no disponible ·
                                                    sin conexión
```

## Pantallas del usuario (celular)

| # | Pantalla | Requisitos | Wireframe | Mockup |
|---|---|---|---|---|
| 01 | Inicio de sesión (normal y con error) | RF01, RNF03 | [ver](wireframes/01-inicio-sesion.png) | [ver](mockups/01-inicio-sesion.png) |
| 02 | Menú del día (paso 1) | RF03, RF04, RF05, RNF04 | [ver](wireframes/02-menu-del-dia.png) | [ver](mockups/02-menu-del-dia.png) |
| 03 | Menú desplegable | RF01 | [ver](wireframes/03-menu-navegacion.png) | [ver](mockups/03-menu-navegacion.png) |
| 04 | Resumen y pago (paso 2) | RF09, RF10, RNF05 | [ver](wireframes/04-resumen-pago.png) | [ver](mockups/04-resumen-pago.png) |
| 05 | Resumen con subsidio (paso 2) | RF06 | [ver](wireframes/05-resumen-subsidiado.png) | [ver](mockups/05-resumen-subsidiado.png) |
| 06 | Mi Ficho (paso 3) | RF07, RF10 | [ver](wireframes/06-mi-ficho.png) | [ver](mockups/06-mi-ficho.png) |
| 07 | Mis reservas | RF07, RF10 | [ver](wireframes/07-mis-reservas.png) | [ver](mockups/07-mis-reservas.png) |
| 08 | Estados de error (5) | RF04, RF06, RF10, RNF03, RNF05 | [ver](wireframes/08-estados-error.png) | [ver](mockups/08-estados-error.png) |

## Pantallas del administrador

| # | Pantalla | Dispositivo | Requisitos | Wireframe | Mockup |
|---|---|---|---|---|---|
| 09 | Menú del día y porciones | Escritorio | RF02, RF03, RF04 | [ver](wireframes/09-admin-menu-del-dia.png) | [ver](mockups/09-admin-menu-del-dia.png) |
| 10 | Catálogos | Escritorio | RF02 | [ver](wireframes/10-admin-catalogos.png) | [ver](mockups/10-admin-catalogos.png) |
| 11 | Horarios de reserva | Escritorio | RF04 | [ver](wireframes/11-admin-horarios.png) | [ver](mockups/11-admin-horarios.png) |
| 12 | Validación de fichos (4 pasos) | Celular | RF08 | [ver](wireframes/12-admin-validar-ficho.png) | [ver](mockups/12-admin-validar-ficho.png) |
| 13 | Entregas del día | Escritorio | RF08 | [ver](wireframes/13-admin-entregas.png) | [ver](mockups/13-admin-entregas.png) |

## Criterios de diseño

- **Mobile-first:** las pantallas del usuario se diseñaron a 375 px de ancho; las del administrador, para escritorio, salvo la validación de fichos, que se hace en la caja con el celular.
- **Identidad UDES:** azul institucional y blanco, con encabezado superior y menú desplegable (Inicio, Mis reservas, Mi Ficho, Cerrar sesión).
- **Accesibilidad (WCAG 2.2 AA):**
  - Lo seleccionado se marca con borde grueso + ícono ✓ + texto "Seleccionado", nunca solo con color.
  - Los estados (Confirmada, Agotado, Rechazado…) siempre llevan ícono y texto.
  - Botones de 52 px de alto y contraste suficiente.
  - El foco del teclado es visible y las imágenes tienen texto alternativo.
- **Botones honestos:** cada botón dice lo que hace ("Continuar al pago", "Pagar $12.000", "Confirmar reserva", "Registrar entrega").
- **El frontend no decide:** el precio, las porciones, el horario, el resultado del pago y el QR los entrega el backend. La interfaz solo los muestra.

## Galería de mockups

### Usuario

| Inicio de sesión | Menú del día | Resumen y pago |
|---|---|---|
| ![Inicio de sesión](mockups/01-inicio-sesion.png) | ![Menú del día](mockups/02-menu-del-dia.png) | ![Resumen y pago](mockups/04-resumen-pago.png) |

| Resumen con subsidio | Mi Ficho | Mis reservas |
|---|---|---|
| ![Resumen con subsidio](mockups/05-resumen-subsidiado.png) | ![Mi Ficho](mockups/06-mi-ficho.png) | ![Mis reservas](mockups/07-mis-reservas.png) |

![Menú desplegable](mockups/03-menu-navegacion.png)

![Estados de error](mockups/08-estados-error.png)

### Administrador

![Menú del día (administrador)](mockups/09-admin-menu-del-dia.png)

![Catálogos](mockups/10-admin-catalogos.png)

![Horarios de reserva](mockups/11-admin-horarios.png)

![Validación de fichos](mockups/12-admin-validar-ficho.png)

![Entregas del día](mockups/13-admin-entregas.png)

## Galería de wireframes

![Wireframe: inicio de sesión](wireframes/01-inicio-sesion.png)
![Wireframe: menú del día](wireframes/02-menu-del-dia.png)
![Wireframe: menú desplegable](wireframes/03-menu-navegacion.png)
![Wireframe: resumen y pago](wireframes/04-resumen-pago.png)
![Wireframe: resumen con subsidio](wireframes/05-resumen-subsidiado.png)
![Wireframe: Mi Ficho](wireframes/06-mi-ficho.png)
![Wireframe: mis reservas](wireframes/07-mis-reservas.png)
![Wireframe: estados de error](wireframes/08-estados-error.png)
![Wireframe: administrador, menú del día](wireframes/09-admin-menu-del-dia.png)
![Wireframe: administrador, catálogos](wireframes/10-admin-catalogos.png)
![Wireframe: administrador, horarios](wireframes/11-admin-horarios.png)
![Wireframe: administrador, validación de fichos](wireframes/12-admin-validar-ficho.png)
![Wireframe: administrador, entregas](wireframes/13-admin-entregas.png)

## Cómo editar o regenerar

Todo sale de **un solo archivo**: [`fuente/pantallas.html`](fuente/pantallas.html). Así los wireframes y los mockups no se desalinean nunca.

1. Ábrelo en el navegador para verlo en vivo:
   - `pantallas.html` muestra los mockups.
   - `pantallas.html?modo=wireframe` muestra los wireframes.
2. Para regenerar los PNG después de editarlo: `node docs/diseno/fuente/renderizar.mjs`. Requiere Playwright con Chromium, que no es una dependencia del proyecto.
