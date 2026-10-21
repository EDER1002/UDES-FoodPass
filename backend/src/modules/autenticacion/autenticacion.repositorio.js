// Único acceso a las tablas `usuario` y `rol` (módulo Autenticación y Roles).
const COLUMNAS = `u.id_usuario, u.nombre, u.apellido, u.documento, u.correo, u.telefono, u.id_rol, r.nombre_rol,
  u.estado_cuenta, u.fecha_registro, u.fecha_revision, u.motivo_rechazo`;

export class AutenticacionRepositorio {
  constructor(db) {
    this.db = db;
  }

  async buscarPorCorreo(correo) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS}, u.contrasena_hash FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.correo = $1`,
      [correo],
    );
    return rows[0] ?? null;
  }

  async buscarPorId(idUsuario, cliente = null) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS} FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1`,
      [idUsuario],
      cliente,
    );
    return rows[0] ?? null;
  }

  async buscarPorIds(ids) {
    if (!ids.length) return [];
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS} FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = ANY($1::int[])`,
      [ids],
    );
    return rows;
  }

  /** Búsqueda por nombre, correo o documento (para el administrador). */
  async buscar(texto, limite = 10) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS} FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.correo ILIKE $1 OR u.documento ILIKE $1 OR (u.nombre || ' ' || u.apellido) ILIKE $1
       ORDER BY u.nombre, u.apellido LIMIT $2`,
      [`%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limite],
    );
    return rows;
  }

  /** Crea la cuenta; el UNIQUE de correo y documento lo decide la base de datos. */
  async crear(u, cliente) {
    const { rows } = await this.db.consulta(
      `INSERT INTO usuario (nombre, apellido, documento, correo, contrasena_hash, telefono, id_rol, estado_cuenta)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT id_rol FROM rol WHERE nombre_rol = $7), $8)
       RETURNING id_usuario`,
      [u.nombre, u.apellido, u.documento, u.correo, u.contrasenaHash, u.telefono, u.rol, u.estadoCuenta],
      cliente,
    );
    return this.buscarPorId(rows[0].id_usuario, cliente);
  }

  async listarPorEstado(estado, limite = 100) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS} FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.estado_cuenta = $1 ORDER BY u.fecha_registro, u.id_usuario LIMIT $2`,
      [estado, limite],
    );
    return rows;
  }

  async bloquear(idUsuario, cliente) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS} FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1 FOR UPDATE OF u`,
      [idUsuario],
      cliente,
    );
    return rows[0] ?? null;
  }

  /** Aprueba o rechaza una cuenta PENDIENTE. Devuelve null si ya no estaba pendiente. */
  async revisar(idUsuario, { estado, idRevisor, motivo, fecha }, cliente) {
    const { rowCount } = await this.db.consulta(
      `UPDATE usuario SET estado_cuenta = $2, id_revisor = $3, motivo_rechazo = $4, fecha_revision = $5
       WHERE id_usuario = $1 AND estado_cuenta = 'PENDIENTE'`,
      [idUsuario, estado, idRevisor, motivo ?? null, fecha],
      cliente,
    );
    return rowCount ? this.buscarPorId(idUsuario, cliente) : null;
  }

  async listarRoles() {
    const { rows } = await this.db.consulta('SELECT id_rol, nombre_rol, descripcion FROM rol ORDER BY id_rol');
    return rows;
  }
}
