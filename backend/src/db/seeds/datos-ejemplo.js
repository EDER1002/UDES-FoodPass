// =====================================================================
// DATOS DE EJEMPLO — SOLO PARA DESARROLLO
// Nombres, documentos, precios y porciones son ficticios.
// =====================================================================
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { sumarDias } from '../../compartido/reloj.js';

export const CONTRASENA_DE_PRUEBA = 'FoodPass2026!';

export const USUARIOS_DE_PRUEBA = [
  { nombre: 'Laura', apellido: 'Gómez', documento: '1098000001', correo: 'estudiante.regular@udes.edu.co', telefono: '3001234567', rol: 'ESTUDIANTE_REGULAR' },
  { nombre: 'Andrés', apellido: 'Rincón', documento: '1098000002', correo: 'estudiante.subsidiado@udes.edu.co', telefono: '3001234568', rol: 'ESTUDIANTE_SUBSIDIADO' },
  { nombre: 'Valentina', apellido: 'Díaz', documento: '1098000005', correo: 'subsidiado.sin.beneficio@udes.edu.co', telefono: '3001234571', rol: 'ESTUDIANTE_SUBSIDIADO' },
  { nombre: 'Diana', apellido: 'Ruiz', documento: '1098000003', correo: 'empleado@udes.edu.co', telefono: '3001234569', rol: 'EMPLEADO_UDES' },
  { nombre: 'Carlos', apellido: 'Pérez', documento: '1098000004', correo: 'admin@udes.edu.co', telefono: '3001234570', rol: 'ADMINISTRADOR' },
  // Cuentas recién registradas que esperan verificación (pantalla "Solicitudes" del administrador).
  { nombre: 'Sofía', apellido: 'Méndez', documento: '1098000006', correo: 'nueva.subsidiada@udes.edu.co', telefono: '3001234572', rol: 'ESTUDIANTE_SUBSIDIADO', estado: 'PENDIENTE' },
  { nombre: 'Jorge', apellido: 'Castro', documento: '1098000007', correo: 'nuevo.profesor@udes.edu.co', telefono: '3001234573', rol: 'EMPLEADO_UDES', estado: 'PENDIENTE' },
];

const TIPOS = [
  { nombre: 'Almuerzo completo', descripcion: 'Sopa, proteína, 2 acompañamientos y jugo', precio: 12000, tipo_servicio: 'Sopa, seco y jugo', max: 2 },
  { nombre: 'Medio almuerzo', descripcion: 'Proteína, 1 acompañamiento y jugo', precio: 8000, tipo_servicio: 'Seco y jugo', max: 1 },
];

const PROTEINAS = [
  { nombre: 'Pechuga a la plancha', descripcion: 'Con especias de la casa', imagen: '/platos/pechuga.svg', estado: 'ACTIVO', menu: 40 },
  { nombre: 'Carne en bistec', descripcion: 'Res en salsa criolla', imagen: '/platos/bistec.svg', estado: 'ACTIVO', menu: 25 },
  { nombre: 'Filete de tilapia', descripcion: 'A la plancha con limón', imagen: '/platos/tilapia.svg', estado: 'ACTIVO', menu: 3 },
  { nombre: 'Cerdo en salsa BBQ', descripcion: 'Lomo de cerdo en salsa dulce', imagen: '/platos/bistec.svg', estado: 'ACTIVO', menu: null },
  { nombre: 'Albóndigas', descripcion: 'En salsa de tomate', imagen: '/platos/bistec.svg', estado: 'INACTIVO', menu: null },
];

const ACOMPANAMIENTOS = [
  { nombre: 'Arroz blanco', descripcion: 'Arroz blanco del día', imagen: '/platos/arroz.svg', estado: 'ACTIVO', menu: 60 },
  { nombre: 'Frijoles', descripcion: 'Frijol rojo guisado', imagen: '/platos/frijoles.svg', estado: 'ACTIVO', menu: 35 },
  // Con 0 porciones a propósito, para ver el estado "Agotado".
  { nombre: 'Maduro frito', descripcion: 'Plátano maduro dorado', imagen: '/platos/maduro.svg', estado: 'ACTIVO', menu: 0 },
  { nombre: 'Ensalada fresca', descripcion: 'Lechuga, tomate y zanahoria', imagen: '/platos/ensalada.svg', estado: 'ACTIVO', menu: 25 },
  { nombre: 'Papa criolla', descripcion: 'Papa criolla dorada', imagen: '/platos/maduro.svg', estado: 'ACTIVO', menu: null },
];

const TABLAS = [
  'entrega', 'ficho_qr', 'pago', 'reserva_acompanamiento', 'reserva_proteina', 'reserva',
  'menu_acompanamiento', 'menu_proteina', 'menu', 'acompanamiento', 'proteina', 'tipo_almuerzo',
  'beneficio_subsidiado', 'configuracion_reserva', 'usuario',
];

/**
 * Borra los datos (menos los roles) y carga los datos de ejemplo:
 * un usuario por rol, horarios, beneficio subsidiado, catálogo y un menú
 * PUBLICADO para hoy y los próximos días.
 *
 * Los horarios de ejemplo van de 00:00 a 23:59 para que puedas probar a
 * cualquier hora. Para probar el bloqueo por horario, cámbialos en
 * Administrador → Horarios (por ejemplo, de 6:00 a 10:30 a. m.).
 */
export async function sembrarDatosDeEjemplo(pool, { hoy, dias = 14, rondasBcrypt = 10 }) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE`);

    const roles = Object.fromEntries((await cliente.query('SELECT id_rol, nombre_rol FROM rol')).rows.map((r) => [r.nombre_rol, r.id_rol]));
    const hash = await bcrypt.hash(CONTRASENA_DE_PRUEBA, rondasBcrypt);
    const usuarios = {};
    for (const u of USUARIOS_DE_PRUEBA) {
      const { rows } = await cliente.query(
        `INSERT INTO usuario (nombre, apellido, documento, correo, contrasena_hash, telefono, id_rol, estado_cuenta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_usuario`,
        [u.nombre, u.apellido, u.documento, u.correo, hash, u.telefono, roles[u.rol], u.estado ?? 'ACTIVA'],
      );
      usuarios[u.correo] = rows[0].id_usuario;
    }

    // Horarios por rol (el administrador no reserva)
    for (const rol of ['ESTUDIANTE_REGULAR', 'ESTUDIANTE_SUBSIDIADO', 'EMPLEADO_UDES']) {
      await cliente.query(
        `INSERT INTO configuracion_reserva (id_rol, hora_inicio, hora_fin, fecha_inicio_vigencia, fecha_fin_vigencia, estado)
         VALUES ($1, '00:00', '23:59', $2, $3, 'ACTIVO')`,
        [roles[rol], sumarDias(hoy, -30), sumarDias(hoy, 180)],
      );
    }

    // Beneficio vigente para Andrés y uno vencido para Valentina
    const beneficios = [
      [usuarios['estudiante.subsidiado@udes.edu.co'], sumarDias(hoy, -30), sumarDias(hoy, 180)],
      [usuarios['subsidiado.sin.beneficio@udes.edu.co'], sumarDias(hoy, -60), sumarDias(hoy, -1)],
    ];
    for (const [idUsuario, desde, hasta] of beneficios) {
      await cliente.query(
        `INSERT INTO beneficio_subsidiado (id_rol, id_usuario, codigo_qr_diario, fecha_inicio_vigencia, fecha_fin_vigencia, estado)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVO')`,
        [roles.ESTUDIANTE_SUBSIDIADO, idUsuario, `BEN-${crypto.randomBytes(8).toString('hex')}`, desde, hasta],
      );
    }

    for (const t of TIPOS) {
      await cliente.query(
        `INSERT INTO tipo_almuerzo (nombre, descripcion, precio, tipo_servicio, max_acompanamientos) VALUES ($1, $2, $3, $4, $5)`,
        [t.nombre, t.descripcion, t.precio, t.tipo_servicio, t.max],
      );
    }
    const proteinas = [];
    for (const p of PROTEINAS) {
      const { rows } = await cliente.query(
        `INSERT INTO proteina (nombre, descripcion, cantidad_disponible, estado, imagen_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING id_proteina`,
        [p.nombre, p.descripcion, 200, p.estado, p.imagen],
      );
      proteinas.push({ id: rows[0].id_proteina, porciones: p.menu });
    }
    const acompanamientos = [];
    for (const a of ACOMPANAMIENTOS) {
      const { rows } = await cliente.query(
        `INSERT INTO acompanamiento (nombre, descripcion, estado, imagen_url) VALUES ($1, $2, $3, $4) RETURNING id_acompanamiento`,
        [a.nombre, a.descripcion, a.estado, a.imagen],
      );
      acompanamientos.push({ id: rows[0].id_acompanamiento, porciones: a.menu });
    }

    // Menú PUBLICADO para hoy y los próximos días
    for (let d = 0; d < dias; d++) {
      const { rows } = await cliente.query(
        `INSERT INTO menu (fecha, estado, hora_inicio_reserva, hora_fin_reserva, cantidad_disponible)
         VALUES ($1, 'PUBLICADO', '00:00', '23:59', 120) RETURNING id_menu`,
        [sumarDias(hoy, d)],
      );
      const idMenu = rows[0].id_menu;
      for (const p of proteinas.filter((x) => x.porciones !== null)) {
        await cliente.query('INSERT INTO menu_proteina (id_menu, id_proteina, cantidad_disponible) VALUES ($1, $2, $3)', [idMenu, p.id, p.porciones]);
      }
      for (const a of acompanamientos.filter((x) => x.porciones !== null)) {
        await cliente.query('INSERT INTO menu_acompanamiento (id_menu, id_acompanamiento, cantidad_disponible) VALUES ($1, $2, $3)', [idMenu, a.id, a.porciones]);
      }
    }

    await cliente.query('COMMIT');
    return { usuarios: USUARIOS_DE_PRUEBA.length, menus: dias };
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}
