// Único acceso a las tablas reserva, reserva_proteina, reserva_acompanamiento,
// configuracion_reserva y beneficio_subsidiado (módulo Reservas y Pagos).

const SELECCION = `
  SELECT r.id_reserva, r.id_usuario, r.id_menu, r.id_tipo_almuerzo, r.fecha_reserva, r.hora_reserva,
         r.estado, r.tipo_reserva, r.valor_total, rp.id_proteina,
         COALESCE((SELECT array_agg(ra.id_acompanamiento ORDER BY ra.id_acompanamiento)
                   FROM reserva_acompanamiento ra WHERE ra.id_reserva = r.id_reserva), '{}') AS ids_acompanamiento,
         p.id_pago, p.metodo_pago, p.estado_pago, p.monto, p.fecha_pago
  FROM reserva r
  LEFT JOIN reserva_proteina rp ON rp.id_reserva = r.id_reserva
  LEFT JOIN pago p ON p.id_reserva = r.id_reserva`;

export class ReservaRepositorio {
  constructor(db) {
    this.db = db;
  }

  // ---------- Reservas ----------
  async crear(r, cliente) {
    const { rows } = await this.db.consulta(
      `INSERT INTO reserva (id_usuario, id_menu, id_tipo_almuerzo, fecha_reserva, hora_reserva, estado, tipo_reserva, valor_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id_reserva`,
      [r.idUsuario, r.idMenu, r.idTipoAlmuerzo, r.fecha, r.hora, r.estado, r.tipoReserva, r.valorTotal],
      cliente,
    );
    const idReserva = rows[0].id_reserva;
    await this.db.consulta('INSERT INTO reserva_proteina (id_reserva, id_proteina) VALUES ($1, $2)', [idReserva, r.idProteina], cliente);
    for (const idAcompanamiento of r.idsAcompanamiento) {
      await this.db.consulta('INSERT INTO reserva_acompanamiento (id_reserva, id_acompanamiento) VALUES ($1, $2)', [idReserva, idAcompanamiento], cliente);
    }
    return idReserva;
  }

  async obtenerPorId(idReserva, cliente) {
    const { rows } = await this.db.consulta(`${SELECCION} WHERE r.id_reserva = $1`, [idReserva], cliente);
    return rows[0] ?? null;
  }

  /** Bloquea la fila de la reserva hasta el fin de la transacción y la devuelve. */
  async bloquear(idReserva, cliente) {
    const { rowCount } = await this.db.consulta('SELECT 1 FROM reserva WHERE id_reserva = $1 FOR UPDATE', [idReserva], cliente);
    return rowCount ? this.obtenerPorId(idReserva, cliente) : null;
  }

  async porIds(ids, cliente) {
    if (!ids.length) return [];
    const { rows } = await this.db.consulta(`${SELECCION} WHERE r.id_reserva = ANY($1::int[])`, [ids], cliente);
    return rows;
  }

  /** Reserva PENDIENTE_PAGO o CONFIRMADA del usuario para un menú (regla 6). */
  async reservaActiva(idUsuario, idMenu, cliente) {
    const { rows } = await this.db.consulta(
      `${SELECCION} WHERE r.id_usuario = $1 AND r.id_menu = $2 AND r.estado IN ('PENDIENTE_PAGO', 'CONFIRMADA')`,
      [idUsuario, idMenu],
      cliente,
    );
    return rows[0] ?? null;
  }

  /** ¿El usuario ya tiene una reserva subsidiada (no cancelada) para ese menú? */
  async subsidioUsado(idUsuario, idMenu, excluirIdReserva, cliente) {
    const { rowCount } = await this.db.consulta(
      `SELECT 1 FROM reserva WHERE id_usuario = $1 AND id_menu = $2 AND tipo_reserva = 'SUBSIDIADA'
         AND estado <> 'CANCELADA' AND id_reserva <> COALESCE($3, 0) LIMIT 1`,
      [idUsuario, idMenu, excluirIdReserva],
      cliente,
    );
    return rowCount > 0;
  }

  /** Cambia el estado solo si la reserva está en uno de los estados `desde`. */
  async actualizarEstado(idReserva, nuevo, desde, cliente) {
    const { rowCount } = await this.db.consulta(
      'UPDATE reserva SET estado = $2 WHERE id_reserva = $1 AND estado = ANY($3::varchar[])',
      [idReserva, nuevo, desde],
      cliente,
    );
    return rowCount > 0;
  }

  async listarPorUsuario(idUsuario, limite = 30) {
    const { rows } = await this.db.consulta(
      `${SELECCION} WHERE r.id_usuario = $1 ORDER BY r.fecha_reserva DESC, r.hora_reserva DESC, r.id_reserva DESC LIMIT $2`,
      [idUsuario, limite],
    );
    return rows;
  }

  async delDia(idUsuario, fecha, estados) {
    const { rows } = await this.db.consulta(
      `${SELECCION} WHERE r.id_usuario = $1 AND r.fecha_reserva = $2 AND r.estado = ANY($3::varchar[])
       ORDER BY r.id_reserva DESC LIMIT 1`,
      [idUsuario, fecha, estados],
    );
    return rows[0] ?? null;
  }

  async resumenDelMenu(idMenu) {
    const { rows } = await this.db.consulta(
      `SELECT count(*) FILTER (WHERE estado IN ('CONFIRMADA', 'ENTREGADA'))::int AS confirmadas,
              count(*) FILTER (WHERE estado = 'ENTREGADA')::int AS entregadas,
              count(*) FILTER (WHERE estado = 'CONFIRMADA')::int AS por_entregar,
              count(*) FILTER (WHERE estado IN ('CONFIRMADA', 'ENTREGADA') AND tipo_reserva = 'SUBSIDIADA')::int AS subsidiadas,
              count(*) FILTER (WHERE estado IN ('CONFIRMADA', 'ENTREGADA') AND tipo_reserva = 'PAGADA')::int AS pagadas,
              count(*) FILTER (WHERE estado = 'PENDIENTE_PAGO')::int AS pendientes_de_pago
       FROM reserva WHERE id_menu = $1`,
      [idMenu],
    );
    return rows[0];
  }

  /** Porciones ya reservadas (confirmadas o entregadas) de cada opción de un menú. */
  async conteoSelecciones(idMenu) {
    const estados = `r.id_menu = $1 AND r.estado IN ('CONFIRMADA', 'ENTREGADA')`;
    const proteinas = await this.db.consulta(
      `SELECT rp.id_proteina AS id, count(*)::int AS total FROM reserva r
       JOIN reserva_proteina rp ON rp.id_reserva = r.id_reserva WHERE ${estados} GROUP BY rp.id_proteina`,
      [idMenu],
    );
    const acompanamientos = await this.db.consulta(
      `SELECT ra.id_acompanamiento AS id, count(*)::int AS total FROM reserva r
       JOIN reserva_acompanamiento ra ON ra.id_reserva = r.id_reserva WHERE ${estados} GROUP BY ra.id_acompanamiento`,
      [idMenu],
    );
    return { proteinas: proteinas.rows, acompanamientos: acompanamientos.rows };
  }

  // ---------- Horarios (configuracion_reserva) ----------
  /** Configuración vigente: la del usuario manda sobre la de su rol. */
  async configuracionVigente(idUsuario, idRol, fecha, cliente) {
    const { rows } = await this.db.consulta(
      `SELECT * FROM configuracion_reserva
       WHERE estado = 'ACTIVO' AND fecha_inicio_vigencia <= $3
         AND (fecha_fin_vigencia IS NULL OR fecha_fin_vigencia >= $3)
         AND (id_usuario = $1 OR id_rol = $2)
       ORDER BY (id_usuario IS NOT NULL) DESC, id_configuracion DESC LIMIT 1`,
      [idUsuario, idRol, fecha],
      cliente,
    );
    return rows[0] ?? null;
  }

  async listarConfiguraciones() {
    const { rows } = await this.db.consulta(
      'SELECT * FROM configuracion_reserva ORDER BY (id_usuario IS NOT NULL), id_rol NULLS LAST, id_configuracion',
    );
    return rows;
  }

  async crearConfiguracion(c) {
    const { rows } = await this.db.consulta(
      `INSERT INTO configuracion_reserva (id_rol, id_usuario, hora_inicio, hora_fin, fecha_inicio_vigencia, fecha_fin_vigencia, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [c.idRol, c.idUsuario, c.horaInicio, c.horaFin, c.fechaInicioVigencia, c.fechaFinVigencia, c.estado],
    );
    return rows[0];
  }

  async actualizarConfiguracion(id, c) {
    const { rows } = await this.db.consulta(
      `UPDATE configuracion_reserva SET id_rol = $2, id_usuario = $3, hora_inicio = $4, hora_fin = $5,
         fecha_inicio_vigencia = $6, fecha_fin_vigencia = $7, estado = $8
       WHERE id_configuracion = $1 RETURNING *`,
      [id, c.idRol, c.idUsuario, c.horaInicio, c.horaFin, c.fechaInicioVigencia, c.fechaFinVigencia, c.estado],
    );
    return rows[0] ?? null;
  }

  // ---------- Beneficio subsidiado ----------
  async beneficioVigente(idUsuario, fecha, { bloquear = false } = {}, cliente = null) {
    const { rows } = await this.db.consulta(
      `SELECT * FROM beneficio_subsidiado
       WHERE id_usuario = $1 AND estado = 'ACTIVO' AND fecha_inicio_vigencia <= $2
         AND (fecha_fin_vigencia IS NULL OR fecha_fin_vigencia >= $2)
       ORDER BY id_beneficio LIMIT 1 ${bloquear ? 'FOR UPDATE' : ''}`,
      [idUsuario, fecha],
      cliente,
    );
    return rows[0] ?? null;
  }
}
