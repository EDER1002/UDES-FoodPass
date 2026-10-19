# UDES FoodPass

Plataforma web responsiva para **reservar y reclamar almuerzos** en la cafetería principal de la Universidad de Santander (UDES, zona de buses), con **ficho digital QR**.

Proyecto de aula de **Diseño de Software I**, Ingeniería de Software.

> **Estado:** Fase 0 (preparación) en revisión. Ya están listos la estructura del repositorio, los wireframes y los mockups. La base de datos, el backend y el frontend llegan en las fases siguientes.

## ¿Qué problema resuelve?

A la hora del almuerzo se forman filas largas para comprar y reclamar los fichos, y no se puede reservar con anticipación. Los estudiantes con subsidio hacen fila dos veces.

Con UDES FoodPass, desde el celular, puedes:
1. Ver el menú del día y cuántas porciones quedan.
2. Elegir tu almuerzo y pagarlo en línea (Nequi, PSE o tarjeta), o aplicar tu subsidio.
3. Recibir un **ficho QR de uso único** y reclamar tu almuerzo sin hacer fila.

El administrador gestiona el menú, las porciones y los horarios. En la entrega escanea el QR, que ya no puede usarse otra vez.

> Los pagos funcionan solo en **entorno de pruebas (sandbox)**: no se mueve dinero real.

## Diseño de pantallas

Los **wireframes** (estructura, en escala de grises y con anotaciones) y los **mockups** (diseño final con la identidad UDES) de todas las pantallas están en [`docs/diseno/`](docs/diseno/README.md).

| Menú del día | Resumen y pago | Mi Ficho |
|---|---|---|
| ![Mockup del menú del día](docs/diseno/mockups/02-menu-del-dia.png) | ![Mockup del resumen y pago](docs/diseno/mockups/04-resumen-pago.png) | ![Mockup de Mi Ficho](docs/diseno/mockups/06-mi-ficho.png) |

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite (JavaScript), mobile-first; `html5-qrcode` para leer el QR |
| Backend | Node.js (LTS) + Express, módulos ES; `zod`, `bcrypt`, JWT, `qrcode` |
| Datos | PostgreSQL 16 (con Docker Compose), migraciones SQL con `pg` |
| Pruebas | Vitest + Supertest |

Arquitectura en capas con cuatro módulos: **Autenticación y Roles**, **Gestión de Menú**, **Reservas y Pagos** (con patrón Strategy para los medios de pago) y **Validación QR**.

## Estructura del repositorio

```
udes-foodpass/
├── backend/            API REST (Node.js + Express)
│   ├── src/modules/    autenticacion · gestion-menu · reservas-pagos · validacion-qr
│   ├── src/db/         conexión, migraciones y seeds
│   └── tests/
├── frontend/           Interfaz web (React + Vite)
├── docs/               PDF del proyecto, diagramas UML (.drawio) y diseño de pantallas
├── docker/             Scripts de inicio de PostgreSQL
├── docker-compose.yml  Base de datos para desarrollo
├── .env.example        Plantilla de configuración (documentada)
└── CLAUDE.md           Guía del proyecto, convenciones y decisiones
```

## Requisitos

| Programa | Para qué | Cómo ver si lo tienes |
|---|---|---|
| git | Descargar el código | `git --version` |
| Node.js 22 o superior (trae npm) | Ejecutar el backend y el frontend | `node --version` |
| Docker + Docker Compose | Ejecutar PostgreSQL sin instalarlo en el sistema | `docker --version` y `docker compose version` |

## Instalación y uso

> Algunos pasos todavía no funcionan: se habilitan en la fase indicada.

```bash
# 1. Descargar el proyecto (rama de trabajo)
git clone https://github.com/eder1002/udes-foodpass.git
cd udes-foodpass
git checkout claude/udes-foodpass-platform-9ik1hk

# 2. Crear tu configuración local y editar los valores "cambia_esto"
cp .env.example .env

# 3. Encender la base de datos
docker compose up -d

# 4. Instalar dependencias, crear tablas y cargar datos de ejemplo   (Fase 1)
npm install
npm run db:migrar
npm run db:seed

# 5. Arrancar la API y la interfaz, cada una en su terminal         (Fases 2 y 3)
npm run dev:backend
npm run dev:frontend

# 6. Pruebas automáticas del backend                               (Fase 2)
npm test
```

### Usuarios de prueba

Los usuarios de prueba (uno por rol, con correo `@udes.edu.co`) y su contraseña se documentarán aquí en la **Fase 1**. Serán **datos de ejemplo, solo para desarrollo**.

## Plan de trabajo

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Estructura, documentación, wireframes y mockups | En revisión |
| 1 | Base de datos: 16 tablas, índices y datos de ejemplo | Pendiente |
| 2 | Backend: 4 módulos, pagos sandbox, API y pruebas | Pendiente |
| 3 | Frontend del usuario | Pendiente |
| 4 | Frontend del administrador | Pendiente |
| 5 | Cierre: documentación, seguridad y coherencia con UML | Pendiente |

## Licencia

GNU GPL v2. Ver [LICENSE](LICENSE).
