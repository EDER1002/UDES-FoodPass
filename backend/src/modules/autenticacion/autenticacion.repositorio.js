// Único acceso a las tablas `usuario` y `rol` (módulo Autenticación y Roles).
const COLUMNAS = `u.id_usuario, u.nombre, u.apellido, u.documento, u.correo, u.telefono, u.id_rol, r.nombre_rol,
  u.estado_cuenta, u.fecha_registro, u.fecha_revision, u.motivo_rechazo, u.fecha_solicitud_ayuda`;

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

  // ---------------------------------------------------------------
  // Recuperación de contraseña
  // ---------------------------------------------------------------

  /** Bloquea la fila del usuario con los datos de su código de recuperación. */
  async bloquearPorCorreo(correo, cliente) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS}, u.codigo_recuperacion_hash, u.codigo_recuperacion_expira, u.codigo_recuperacion_intentos
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.correo = $1 FOR UPDATE OF u`,
      [correo],
      cliente,
    );
    return rows[0] ?? null;
  }

  async bloquearConCodigo(idUsuario, cliente) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS}, u.codigo_recuperacion_expira FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = $1 FOR UPDATE OF u`,
      [idUsuario],
      cliente,
    );
    return rows[0] ?? null;
  }

  /** Guarda un código nuevo (reemplaza el anterior) y reinicia los intentos. */
  async guardarCodigoRecuperacion(idUsuario, { hash, expira, quitarAyuda = false }, cliente) {
    await this.db.consulta(
      `UPDATE usuario SET codigo_recuperacion_hash = $2, codigo_recuperacion_expira = $3, codigo_recuperacion_intentos = 0,
         fecha_solicitud_ayuda = CASE WHEN $4 THEN NULL ELSE fecha_solicitud_ayuda END
       WHERE id_usuario = $1`,
      [idUsuario, hash, expira, quitarAyuda],
      cliente,
    );
  }

  async registrarIntentoFallido(idUsuario, cliente) {
    await this.db.consulta('UPDATE usuario SET codigo_recuperacion_intentos = codigo_recuperacion_intentos + 1 WHERE id_usuario = $1', [idUsuario], cliente);
  }

  /** Cambia la contraseña y borra el código y la solicitud de ayuda. */
  async cambiarContrasena(idUsuario, contrasenaHash, cliente) {
    await this.db.consulta(
      `UPDATE usuario SET contrasena_hash = $2, codigo_recuperacion_hash = NULL, codigo_recuperacion_expira = NULL,
         codigo_recuperacion_intentos = 0, fecha_solicitud_ayuda = NULL
       WHERE id_usuario = $1`,
      [idUsuario, contrasenaHash],
      cliente,
    );
  }

  async marcarSolicitudAyuda(idUsuario, fecha) {
    await this.db.consulta('UPDATE usuario SET fecha_solicitud_ayuda = $2 WHERE id_usuario = $1', [idUsuario, fecha]);
  }

  async quitarSolicitudAyuda(idUsuario) {
    const { rowCount } = await this.db.consulta(
      'UPDATE usuario SET fecha_solicitud_ayuda = NULL WHERE id_usuario = $1 AND fecha_solicitud_ayuda IS NOT NULL',
      [idUsuario],
    );
    return rowCount > 0;
  }

  async listarSolicitudesAyuda(limite = 100) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS} FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.fecha_solicitud_ayuda IS NOT NULL ORDER BY u.fecha_solicitud_ayuda, u.id_usuario LIMIT $1`,
      [limite],
    );
    return rows;
  }

  async listarRoles() {
    const { rows } = await this.db.consulta('SELECT id_rol, nombre_rol, descripcion FROM rol ORDER BY id_rol');
    return rows;
  }
}
