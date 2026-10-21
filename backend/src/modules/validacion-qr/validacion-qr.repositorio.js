// Único acceso a las tablas ficho_qr y entrega (módulo Validación QR).
export class ValidacionQRRepositorio {
  constructor(db) {
    this.db = db;
  }

  /** Devuelve null si el token ya existía (prácticamente imposible: 80 bits aleatorios). */
  async crear(f, cliente) {
    const { rows } = await this.db.consulta(
      `INSERT INTO ficho_qr (id_reserva, token_unico, codigo_qr, fecha_generacion, fecha_expiracion, estado)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVO')
       ON CONFLICT (token_unico) DO NOTHING RETURNING *`,
      [f.idReserva, f.token, f.codigoQr, f.fechaGeneracion, f.fechaExpiracion],
      cliente,
    );
    return rows[0] ?? null;
  }

  async porToken(token) {
    const { rows } = await this.db.consulta('SELECT * FROM ficho_qr WHERE token_unico = $1', [token]);
    return rows[0] ?? null;
  }

  async porId(idFicho, cliente) {
    const { rows } = await this.db.consulta('SELECT * FROM ficho_qr WHERE id_ficho = $1', [idFicho], cliente);
    return rows[0] ?? null;
  }

  async porReservas(idsReserva, cliente) {
    if (!idsReserva.length) return [];
    const { rows } = await this.db.consulta('SELECT * FROM ficho_qr WHERE id_reserva = ANY($1::int[])', [idsReserva], cliente);
    return rows;
  }

  /**
   * Marca el ficho como USADO solo si sigue ACTIVO y vigente. Con peticiones
   * simultáneas, solo una logra actualizar la fila: el ficho no se usa dos veces.
   */
  async marcarUsado(idFicho, instante, cliente) {
    const { rows } = await this.db.consulta(
      `UPDATE ficho_qr SET estado = 'USADO', fecha_uso = $2
       WHERE id_ficho = $1 AND estado = 'ACTIVO' AND fecha_expiracion > $2 RETURNING *`,
      [idFicho, instante],
      cliente,
    );
    return rows[0] ?? null;
  }

  async marcarExpirado(idFicho, cliente = null) {
    await this.db.consulta(`UPDATE ficho_qr SET estado = 'EXPIRADO' WHERE id_ficho = $1 AND estado = 'ACTIVO'`, [idFicho], cliente);
  }

  async anularPorReserva(idReserva, cliente) {
    await this.db.consulta(`UPDATE ficho_qr SET estado = 'EXPIRADO' WHERE id_reserva = $1 AND estado = 'ACTIVO'`, [idReserva], cliente);
  }

  async crearEntrega(e, cliente) {
    const { rows } = await this.db.consulta(
      `INSERT INTO entrega (id_ficho, id_usuario_empleado, fecha_entrega, hora_entrega, estado_entrega)
       VALUES ($1, $2, $3, $4, 'ENTREGADO') RETURNING *`,
      [e.idFicho, e.idAdministrador, e.fecha, e.hora],
      cliente,
    );
    return rows[0];
  }

  async entregaPorFicho(idFicho, cliente = null) {
    const { rows } = await this.db.consulta('SELECT * FROM entrega WHERE id_ficho = $1', [idFicho], cliente);
    return rows[0] ?? null;
  }

  async entregasDelDia(fecha) {
    const { rows } = await this.db.consulta(
      `SELECT e.*, f.id_reserva, f.token_unico FROM entrega e JOIN ficho_qr f ON f.id_ficho = e.id_ficho
       WHERE e.fecha_entrega = $1 ORDER BY e.hora_entrega DESC, e.id_entrega DESC`,
      [fecha],
    );
    return rows;
  }
}
