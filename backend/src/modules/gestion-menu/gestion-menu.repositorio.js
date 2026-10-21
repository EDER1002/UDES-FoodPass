// Único acceso a las tablas menu, tipo_almuerzo, proteina, acompanamiento,
// menu_proteina y menu_acompanamiento (módulo Gestión de Menú).

const COLUMNAS_MENU = 'id_menu, fecha, estado, hora_inicio_reserva, hora_fin_reserva, cantidad_disponible';

export class GestionMenuRepositorio {
  constructor(db) {
    this.db = db;
  }

  // ---------- Menú ----------
  async menuPorFecha(fecha, cliente) {
    const { rows } = await this.db.consulta(`SELECT ${COLUMNAS_MENU} FROM menu WHERE fecha = $1`, [fecha], cliente);
    return rows[0] ?? null;
  }

  async menuPorId(idMenu, cliente, { bloquear = false } = {}) {
    const { rows } = await this.db.consulta(
      `SELECT ${COLUMNAS_MENU} FROM menu WHERE id_menu = $1 ${bloquear ? 'FOR UPDATE' : ''}`,
      [idMenu],
      cliente,
    );
    return rows[0] ?? null;
  }

  async crearMenu(m, cliente) {
    const { rows } = await this.db.consulta(
      `INSERT INTO menu (fecha, estado, hora_inicio_reserva, hora_fin_reserva, cantidad_disponible)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNAS_MENU}`,
      [m.fecha, m.estado, m.horaInicioReserva, m.horaFinReserva, m.cantidadDisponible],
      cliente,
    );
    return rows[0];
  }

  async actualizarMenu(idMenu, m, cliente) {
    const { rows } = await this.db.consulta(
      `UPDATE menu SET estado = $2, hora_inicio_reserva = $3, hora_fin_reserva = $4, cantidad_disponible = $5
       WHERE id_menu = $1 RETURNING ${COLUMNAS_MENU}`,
      [idMenu, m.estado, m.horaInicioReserva, m.horaFinReserva, m.cantidadDisponible],
      cliente,
    );
    return rows[0] ?? null;
  }

  async eliminarMenu(idMenu) {
    const { rowCount } = await this.db.consulta('DELETE FROM menu WHERE id_menu = $1', [idMenu]);
    return rowCount > 0;
  }

  async proteinasDelMenu(idMenu, cliente) {
    const { rows } = await this.db.consulta(
      `SELECT mp.id_proteina, mp.cantidad_disponible, p.nombre, p.descripcion, p.imagen_url, p.estado
       FROM menu_proteina mp JOIN proteina p ON p.id_proteina = mp.id_proteina
       WHERE mp.id_menu = $1 ORDER BY p.nombre`,
      [idMenu],
      cliente,
    );
    return rows;
  }

  async acompanamientosDelMenu(idMenu, cliente) {
    const { rows } = await this.db.consulta(
      `SELECT ma.id_acompanamiento, ma.cantidad_disponible, a.nombre, a.descripcion, a.imagen_url, a.estado
       FROM menu_acompanamiento ma JOIN acompanamiento a ON a.id_acompanamiento = ma.id_acompanamiento
       WHERE ma.id_menu = $1 ORDER BY a.nombre`,
      [idMenu],
      cliente,
    );
    return rows;
  }

  /** Deja en el menú exactamente las opciones indicadas, con sus porciones. */
  async reemplazarOpciones(idMenu, proteinas, acompanamientos, cliente) {
    const idsP = proteinas.map((p) => p.idProteina);
    const idsA = acompanamientos.map((a) => a.idAcompanamiento);
    await this.db.consulta('DELETE FROM menu_proteina WHERE id_menu = $1 AND NOT (id_proteina = ANY($2::int[]))', [idMenu, idsP], cliente);
    await this.db.consulta('DELETE FROM menu_acompanamiento WHERE id_menu = $1 AND NOT (id_acompanamiento = ANY($2::int[]))', [idMenu, idsA], cliente);
    for (const p of proteinas) {
      await this.db.consulta(
        `INSERT INTO menu_proteina (id_menu, id_proteina, cantidad_disponible) VALUES ($1, $2, $3)
         ON CONFLICT (id_menu, id_proteina) DO UPDATE SET cantidad_disponible = EXCLUDED.cantidad_disponible`,
        [idMenu, p.idProteina, p.cantidadDisponible],
        cliente,
      );
    }
    for (const a of acompanamientos) {
      await this.db.consulta(
        `INSERT INTO menu_acompanamiento (id_menu, id_acompanamiento, cantidad_disponible) VALUES ($1, $2, $3)
         ON CONFLICT (id_menu, id_acompanamiento) DO UPDATE SET cantidad_disponible = EXCLUDED.cantidad_disponible`,
        [idMenu, a.idAcompanamiento, a.cantidadDisponible],
        cliente,
      );
    }
  }

  // ---------- Porciones (RNF03) ----------
  /**
   * Descuenta una porción del total del menú, de la proteína y de cada
   * acompañamiento. Cada UPDATE solo afecta la fila si aún hay porciones
   * (cantidad_disponible > 0). Se actualiza siempre en el mismo orden
   * (menú → proteína → acompañamientos por id) para evitar interbloqueos.
   * Devuelve null si todo se descontó o la opción que se agotó.
   */
  async descontar(idMenu, idProteina, idsAcompanamiento, cliente) {
    const menu = await this.db.consulta(
      'UPDATE menu SET cantidad_disponible = cantidad_disponible - 1 WHERE id_menu = $1 AND cantidad_disponible > 0',
      [idMenu],
      cliente,
    );
    if (menu.rowCount === 0) return { tipo: 'menu', id: idMenu };
    const proteina = await this.db.consulta(
      `UPDATE menu_proteina SET cantidad_disponible = cantidad_disponible - 1
       WHERE id_menu = $1 AND id_proteina = $2 AND cantidad_disponible > 0`,
      [idMenu, idProteina],
      cliente,
    );
    if (proteina.rowCount === 0) return { tipo: 'proteina', id: idProteina };
    for (const idAcompanamiento of idsAcompanamiento) {
      const acomp = await this.db.consulta(
        `UPDATE menu_acompanamiento SET cantidad_disponible = cantidad_disponible - 1
         WHERE id_menu = $1 AND id_acompanamiento = $2 AND cantidad_disponible > 0`,
        [idMenu, idAcompanamiento],
        cliente,
      );
      if (acomp.rowCount === 0) return { tipo: 'acompanamiento', id: idAcompanamiento };
    }
    return null;
  }

  async devolver(idMenu, idProteina, idsAcompanamiento, cliente) {
    await this.db.consulta('UPDATE menu SET cantidad_disponible = cantidad_disponible + 1 WHERE id_menu = $1', [idMenu], cliente);
    await this.db.consulta(
      'UPDATE menu_proteina SET cantidad_disponible = cantidad_disponible + 1 WHERE id_menu = $1 AND id_proteina = $2',
      [idMenu, idProteina],
      cliente,
    );
    for (const idAcompanamiento of idsAcompanamiento) {
      await this.db.consulta(
        'UPDATE menu_acompanamiento SET cantidad_disponible = cantidad_disponible + 1 WHERE id_menu = $1 AND id_acompanamiento = $2',
        [idMenu, idAcompanamiento],
        cliente,
      );
    }
  }

  // ---------- Catálogos ----------
  async listarTipos() {
    const { rows } = await this.db.consulta('SELECT * FROM tipo_almuerzo ORDER BY precio DESC, nombre');
    return rows;
  }

  async tipoPorId(id, cliente) {
    const { rows } = await this.db.consulta('SELECT * FROM tipo_almuerzo WHERE id_tipo_almuerzo = $1', [id], cliente);
    return rows[0] ?? null;
  }

  async crearTipo(t) {
    const { rows } = await this.db.consulta(
      `INSERT INTO tipo_almuerzo (nombre, descripcion, precio, tipo_servicio, max_acompanamientos)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [t.nombre, t.descripcion, t.precio, t.tipoServicio, t.maxAcompanamientos],
    );
    return rows[0];
  }

  async actualizarTipo(id, t) {
    const { rows } = await this.db.consulta(
      `UPDATE tipo_almuerzo SET nombre = $2, descripcion = $3, precio = $4, tipo_servicio = $5, max_acompanamientos = $6
       WHERE id_tipo_almuerzo = $1 RETURNING *`,
      [id, t.nombre, t.descripcion, t.precio, t.tipoServicio, t.maxAcompanamientos],
    );
    return rows[0] ?? null;
  }

  async listarProteinas() {
    const { rows } = await this.db.consulta('SELECT * FROM proteina ORDER BY estado, nombre');
    return rows;
  }

  async proteinasPorIds(ids, cliente = null) {
    const { rows } = await this.db.consulta('SELECT * FROM proteina WHERE id_proteina = ANY($1::int[])', [ids], cliente);
    return rows;
  }

  async crearProteina(p) {
    const { rows } = await this.db.consulta(
      `INSERT INTO proteina (nombre, descripcion, cantidad_disponible, estado, imagen_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [p.nombre, p.descripcion, p.cantidadDisponible, p.estado, p.imagenUrl],
    );
    return rows[0];
  }

  async actualizarProteina(id, p) {
    const { rows } = await this.db.consulta(
      `UPDATE proteina SET nombre = $2, descripcion = $3, cantidad_disponible = $4, estado = $5, imagen_url = $6
       WHERE id_proteina = $1 RETURNING *`,
      [id, p.nombre, p.descripcion, p.cantidadDisponible, p.estado, p.imagenUrl],
    );
    return rows[0] ?? null;
  }

  async listarAcompanamientos() {
    const { rows } = await this.db.consulta('SELECT * FROM acompanamiento ORDER BY estado, nombre');
    return rows;
  }

  async acompanamientosPorIds(ids, cliente = null) {
    const { rows } = await this.db.consulta('SELECT * FROM acompanamiento WHERE id_acompanamiento = ANY($1::int[])', [ids], cliente);
    return rows;
  }

  async crearAcompanamiento(a) {
    const { rows } = await this.db.consulta(
      `INSERT INTO acompanamiento (nombre, descripcion, estado, imagen_url) VALUES ($1, $2, $3, $4) RETURNING *`,
      [a.nombre, a.descripcion, a.estado, a.imagenUrl],
    );
    return rows[0];
  }

  async actualizarAcompanamiento(id, a) {
    const { rows } = await this.db.consulta(
      `UPDATE acompanamiento SET nombre = $2, descripcion = $3, estado = $4, imagen_url = $5
       WHERE id_acompanamiento = $1 RETURNING *`,
      [id, a.nombre, a.descripcion, a.estado, a.imagenUrl],
    );
    return rows[0] ?? null;
  }

  async tiposPorIds(ids, cliente = null) {
    const { rows } = await this.db.consulta('SELECT * FROM tipo_almuerzo WHERE id_tipo_almuerzo = ANY($1::int[])', [ids], cliente);
    return rows;
  }
}
