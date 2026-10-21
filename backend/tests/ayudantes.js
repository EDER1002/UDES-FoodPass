import bcrypt from 'bcrypt';
import request from 'supertest';
import { crearApp } from '../src/app.js';
import { cargarConfig } from '../src/config.js';
import { relojFijo } from '../src/compartido/reloj.js';
import { crearPool } from '../src/db/conexion.js';
import { firmar } from '../src/modules/reservas-pagos/pagos/webhook.js';
import { PasarelaSandbox } from '../src/modules/reservas-pagos/pagos/pasarela/PasarelaSandbox.js';

export const HOY = '2026-10-19';
export const CONTRASENA = 'Prueba2026!';
export const TARJETA = { numero: '4242 4242 4242 4242', titular: 'Laura Gómez', vencimiento: '12/30', cvc: '123' };

/** Aplicación completa sobre la base de pruebas, con reloj fijo (lunes 19/10/2026, 9:00 a. m.). */
export function crearEntorno({ fecha = HOY, hora = '09:00:00', maxConexiones = null } = {}) {
  const config = cargarConfig(process.env);
  const pool = crearPool(config.urlBaseDeDatos);
  if (maxConexiones) pool.options.max = maxConexiones;
  const reloj = relojFijo(fecha, hora);
  const pasarela = new PasarelaSandbox();
  const { app, servicios } = crearApp({ pool, config, reloj, pasarela });
  return { app, pool, reloj, pasarela, servicios, config, api: () => request(app) };
}

let hashCache = null;

/**
 * Borra los datos y carga un escenario conocido:
 * - 10 estudiantes regulares, 10 subsidiados con beneficio, 1 subsidiado sin
 *   beneficio, 1 empleado y 1 administrador.
 * - Horario por rol de 6:00 a 10:30 a. m.
 * - Menú PUBLICADO de hoy con 3 proteínas y 4 acompañamientos.
 */
export async function prepararEscenario(pool, { porciones = {} } = {}) {
  hashCache ??= await bcrypt.hash(CONTRASENA, 4);
  await pool.query(`TRUNCATE entrega, ficho_qr, pago, reserva_acompanamiento, reserva_proteina, reserva,
    menu_acompanamiento, menu_proteina, menu, acompanamiento, proteina, tipo_almuerzo,
    beneficio_subsidiado, configuracion_reserva, usuario RESTART IDENTITY CASCADE`);
  const roles = Object.fromEntries((await pool.query('SELECT id_rol, nombre_rol FROM rol')).rows.map((r) => [r.nombre_rol, r.id_rol]));

  const usuarios = {};
  const crearUsuario = async (clave, rol, nombre) => {
    const { rows } = await pool.query(
      `INSERT INTO usuario (nombre, apellido, documento, correo, contrasena_hash, telefono, id_rol)
       VALUES ($1, 'Prueba', $2, $3, $4, '3000000000', $5) RETURNING id_usuario`,
      [nombre, `10${String(Object.keys(usuarios).length).padStart(8, '0')}`, `${clave}@udes.edu.co`, hashCache, roles[rol]],
    );
    usuarios[clave] = { id: rows[0].id_usuario, correo: `${clave}@udes.edu.co` };
  };
  for (let i = 1; i <= 10; i++) await crearUsuario(`regular${i}`, 'ESTUDIANTE_REGULAR', `Regular${i}`);
  for (let i = 1; i <= 10; i++) await crearUsuario(`subsidiado${i}`, 'ESTUDIANTE_SUBSIDIADO', `Subsidiado${i}`);
  await crearUsuario('sinbeneficio', 'ESTUDIANTE_SUBSIDIADO', 'SinBeneficio');
  await crearUsuario('empleado', 'EMPLEADO_UDES', 'Empleado');
  await crearUsuario('admin', 'ADMINISTRADOR', 'Admin');

  for (const rol of ['ESTUDIANTE_REGULAR', 'ESTUDIANTE_SUBSIDIADO', 'EMPLEADO_UDES']) {
    await pool.query(
      `INSERT INTO configuracion_reserva (id_rol, hora_inicio, hora_fin, fecha_inicio_vigencia, fecha_fin_vigencia)
       VALUES ($1, '06:00', '10:30', '2026-08-01', '2026-12-15')`,
      [roles[rol]],
    );
  }
  for (let i = 1; i <= 10; i++) {
    await pool.query(
      `INSERT INTO beneficio_subsidiado (id_rol, id_usuario, codigo_qr_diario, fecha_inicio_vigencia, fecha_fin_vigencia)
       VALUES ($1, $2, $3, '2026-08-01', '2026-12-15')`,
      [roles.ESTUDIANTE_SUBSIDIADO, usuarios[`subsidiado${i}`].id, `BEN-PRUEBA-${i}`],
    );
  }
  // Beneficio vencido
  await pool.query(
    `INSERT INTO beneficio_subsidiado (id_rol, id_usuario, codigo_qr_diario, fecha_inicio_vigencia, fecha_fin_vigencia)
     VALUES ($1, $2, 'BEN-VENCIDO', '2026-01-01', '2026-06-30')`,
    [roles.ESTUDIANTE_SUBSIDIADO, usuarios.sinbeneficio.id],
  );

  const tipos = {};
  for (const [clave, nombre, precio, max] of [['completo', 'Almuerzo completo', 12000, 2], ['medio', 'Medio almuerzo', 8000, 1]]) {
    const { rows } = await pool.query(
      'INSERT INTO tipo_almuerzo (nombre, precio, max_acompanamientos) VALUES ($1, $2, $3) RETURNING id_tipo_almuerzo',
      [nombre, precio, max],
    );
    tipos[clave] = rows[0].id_tipo_almuerzo;
  }
  const proteinas = {};
  for (const clave of ['pollo', 'res', 'pescado']) {
    const { rows } = await pool.query('INSERT INTO proteina (nombre) VALUES ($1) RETURNING id_proteina', [`Proteína ${clave}`]);
    proteinas[clave] = rows[0].id_proteina;
  }
  const acompanamientos = {};
  for (const clave of ['arroz', 'frijol', 'ensalada', 'maduro']) {
    const { rows } = await pool.query('INSERT INTO acompanamiento (nombre) VALUES ($1) RETURNING id_acompanamiento', [`Acompañamiento ${clave}`]);
    acompanamientos[clave] = rows[0].id_acompanamiento;
  }

  const { rows } = await pool.query(
    `INSERT INTO menu (fecha, estado, hora_inicio_reserva, hora_fin_reserva, cantidad_disponible)
     VALUES ($1, 'PUBLICADO', '06:00', '10:30', $2) RETURNING id_menu`,
    [HOY, porciones.menu ?? 100],
  );
  const idMenu = rows[0].id_menu;
  for (const clave of Object.keys(proteinas)) {
    await pool.query('INSERT INTO menu_proteina (id_menu, id_proteina, cantidad_disponible) VALUES ($1, $2, $3)', [idMenu, proteinas[clave], porciones[clave] ?? 50]);
  }
  for (const clave of Object.keys(acompanamientos)) {
    await pool.query('INSERT INTO menu_acompanamiento (id_menu, id_acompanamiento, cantidad_disponible) VALUES ($1, $2, $3)', [idMenu, acompanamientos[clave], porciones[clave] ?? 50]);
  }
  return { usuarios, roles, tipos, proteinas, acompanamientos, idMenu };
}

/** Inicia sesión y devuelve el encabezado Authorization listo para usar. */
export async function sesionDe(entorno, usuario) {
  const respuesta = await entorno.api().post('/api/auth/login').send({ correo: usuario.correo, contrasena: CONTRASENA });
  if (respuesta.status !== 200) throw new Error(`No se pudo iniciar sesión como ${usuario.correo}: ${JSON.stringify(respuesta.body)}`);
  return `Bearer ${respuesta.body.token}`;
}

/** Pedido típico: almuerzo completo con pollo, arroz y ensalada. */
export function pedido(esc, cambios = {}) {
  return {
    idTipoAlmuerzo: esc.tipos.completo,
    idProteina: esc.proteinas.pollo,
    idsAcompanamiento: [esc.acompanamientos.arroz, esc.acompanamientos.ensalada],
    ...cambios,
  };
}

export async function crearReserva(entorno, auth, datos) {
  return entorno.api().post('/api/reservas').set('Authorization', auth).send(datos);
}

let consecutivo = 0;
export const nuevaClave = () => `clave-prueba-${Date.now()}-${++consecutivo}`;

export async function pagar(entorno, auth, idReserva, cuerpo, clave = nuevaClave()) {
  return entorno.api().post(`/api/reservas/${idReserva}/pago`).set('Authorization', auth).set('Idempotency-Key', clave).send(cuerpo);
}

export async function enviarWebhook(entorno, cuerpo, { firma } = {}) {
  const texto = JSON.stringify(cuerpo);
  return entorno
    .api()
    .post('/api/pagos/webhook')
    .set('Content-Type', 'application/json')
    .set('X-FoodPass-Firma', firma ?? firmar(texto, entorno.config.pasarela.secretoWebhook))
    .send(texto);
}

export async function contar(pool, sql, valores = []) {
  const { rows } = await pool.query(sql, valores);
  return Number(rows[0].count ?? rows[0].n ?? Object.values(rows[0])[0]);
}
