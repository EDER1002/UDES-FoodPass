// Único acceso a las tablas `usuario` y `rol` (módulo Autenticación y Roles).
const COLUMNAS = `u.id_usuario, u.nombre, u.apellido, u.documento, u.correo, u.telefono, u.id_rol, r.nombre_rol`;

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

  async buscarPorId(idUsuario) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS} FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1`,
      [idUsuario],
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

  async listarRoles() {
    const { rows } = await this.db.consulta('SELECT id_rol, nombre_rol, descripcion FROM rol ORDER BY id_rol');
    return rows;
  }
}
