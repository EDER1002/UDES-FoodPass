import { ErrorAplicacion, conflicto, esViolacionLlaveForanea, esViolacionUnica, noEncontrado } from '../../compartido/errores.js';

/**
 * GestionMenuService: menú del día, catálogos y porciones (RF02, RF03).
 * Oculta las consultas y actualizaciones de menu, menu_proteina y menu_acompanamiento:
 * ningún otro módulo toca esas tablas, solo llama a estas operaciones.
 */
export class GestionMenuService {
  constructor({ db, repositorio }) {
    this.db = db;
    this.repo = repositorio;
  }

  // =================================================================
  // Operaciones públicas del diagrama de componentes
  // =================================================================

  /** Crea el menú de una fecha con sus opciones y porciones (RF02). */
  async publicarMenu(datos) {
    await this.#validarOpcionesDelCatalogo(datos);
    try {
      return await this.db.transaccion(async (c) => {
        const menu = await this.repo.crearMenu(datos, c);
        await this.repo.reemplazarOpciones(menu.id_menu, datos.proteinas, datos.acompanamientos, c);
        return this.#detalleMenu(menu, { incluirInactivas: true }, c);
      });
    } catch (error) {
      if (esViolacionUnica(error, 'menu_fecha_key')) {
        throw conflicto('MENU_EXISTE', `Ya existe un menú para el ${datos.fecha}. Edítalo en lugar de crear otro.`);
      }
      throw error;
    }
  }

  /** Menú publicado de una fecha, con porciones restantes (RF03). */
  async consultarMenu(fecha) {
    const menu = await this.repo.menuPorFecha(fecha);
    if (!menu || menu.estado !== 'PUBLICADO') {
      throw noEncontrado('MENU_NO_DISPONIBLE', 'Todavía no hay un menú publicado para hoy. Vuelve más tarde.');
    }
    return this.#detalleMenu(menu, { incluirInactivas: false });
  }

  /**
   * Descuenta, de forma atómica, una porción del menú, de la proteína y de
   * cada acompañamiento (RNF03). Se usa dentro de la transacción que confirma
   * la reserva. Si alguna opción ya no tiene porciones, deshace los descuentos
   * de esta llamada y devuelve { ok: false, agotado }.
   */
  async descontarPorcion(idMenu, idProteina, idsAcompanamiento, cliente = null) {
    return this.db.transaccion(async (c) => {
      await c.query('SAVEPOINT descontar_porcion');
      const ordenados = [...idsAcompanamiento].sort((a, b) => a - b);
      const agotado = await this.repo.descontar(idMenu, idProteina, ordenados, c);
      if (agotado) {
        await c.query('ROLLBACK TO SAVEPOINT descontar_porcion');
        return { ok: false, agotado: await this.#describirAgotado(agotado) };
      }
      await c.query('RELEASE SAVEPOINT descontar_porcion');
      return { ok: true };
    }, cliente);
  }

  // =================================================================
  // Operaciones de apoyo (usadas por Reservas y por el administrador)
  // =================================================================

  /** Devuelve las porciones de una reserva cancelada. */
  async devolverPorcion(idMenu, idProteina, idsAcompanamiento, cliente = null) {
    const ordenados = [...idsAcompanamiento].sort((a, b) => a - b);
    await this.db.transaccion((c) => this.repo.devolver(idMenu, idProteina, ordenados, c), cliente);
  }

  /** Menú publicado de una fecha (sin opciones). Lanza MENU_NO_DISPONIBLE si no existe. */
  async obtenerMenuPublicado(fecha) {
    const menu = await this.repo.menuPorFecha(fecha);
    if (!menu || menu.estado !== 'PUBLICADO') {
      throw conflicto('MENU_NO_DISPONIBLE', 'No hay un menú publicado para hoy, así que todavía no se puede reservar.');
    }
    return aMenu(menu);
  }

  async obtenerMenu(idMenu, cliente = null) {
    const menu = await this.repo.menuPorId(idMenu, cliente);
    if (!menu) throw noEncontrado('MENU_NO_ENCONTRADO', 'No encontramos ese menú.');
    return aMenu(menu);
  }

  /**
   * Valida un pedido contra el menú: tipo de almuerzo, proteína y
   * acompañamientos del menú, máximo de acompañamientos y porciones.
   * Devuelve el precio, que solo se calcula en el backend.
   */
  async validarSeleccion(menu, pedido) {
    const tipo = await this.repo.tipoPorId(pedido.idTipoAlmuerzo);
    if (!tipo) throw new ErrorAplicacion('OPCION_NO_VALIDA', 'El tipo de almuerzo elegido no existe.', 400);
    const ids = pedido.idsAcompanamiento;
    if (new Set(ids).size !== ids.length) {
      throw new ErrorAplicacion('ACOMPANAMIENTOS_INVALIDOS', 'Elegiste el mismo acompañamiento dos veces.', 400);
    }
    if (ids.length < 1 || ids.length > tipo.max_acompanamientos) {
      const max = tipo.max_acompanamientos;
      throw new ErrorAplicacion(
        'ACOMPANAMIENTOS_INVALIDOS',
        `El ${tipo.nombre.toLowerCase()} incluye de 1 a ${max} acompañamiento${max === 1 ? '' : 's'}.`,
        400,
      );
    }
    const proteinas = await this.repo.proteinasDelMenu(menu.idMenu);
    const acompanamientos = await this.repo.acompanamientosDelMenu(menu.idMenu);
    const proteina = proteinas.find((p) => p.id_proteina === pedido.idProteina && p.estado === 'ACTIVO');
    if (!proteina) throw new ErrorAplicacion('OPCION_NO_VALIDA', 'La proteína elegida no está en el menú de hoy.', 400);
    const elegidos = ids.map((id) => acompanamientos.find((a) => a.id_acompanamiento === id && a.estado === 'ACTIVO'));
    if (elegidos.some((a) => !a)) {
      throw new ErrorAplicacion('OPCION_NO_VALIDA', 'Uno de los acompañamientos elegidos no está en el menú de hoy.', 400);
    }
    // Disponibilidad (se verifica antes de cobrar; la garantía final la da descontarPorcion)
    if (menu.cantidadDisponible <= 0) throw errorAgotado('Se agotaron los almuerzos de hoy.');
    if (proteina.cantidad_disponible <= 0) throw errorAgotado(`Se agotó: ${proteina.nombre}.`, proteina.nombre);
    const sinPorciones = elegidos.find((a) => a.cantidad_disponible <= 0);
    if (sinPorciones) throw errorAgotado(`Se agotó: ${sinPorciones.nombre}.`, sinPorciones.nombre);
    return {
      tipo: { idTipoAlmuerzo: tipo.id_tipo_almuerzo, nombre: tipo.nombre, precio: tipo.precio, maxAcompanamientos: tipo.max_acompanamientos },
      idProteina: proteina.id_proteina,
      idsAcompanamiento: elegidos.map((a) => a.id_acompanamiento),
    };
  }

  /** Verifica, justo antes de cobrar, que el menú siga abierto y que haya porciones. */
  async verificarDisponibilidad(idMenu, idProteina, idsAcompanamiento, cliente = null) {
    const menu = await this.repo.menuPorId(idMenu, cliente);
    if (!menu || menu.estado !== 'PUBLICADO') {
      throw conflicto('MENU_NO_DISPONIBLE', 'El menú de hoy ya no está disponible para reservas.');
    }
    if (menu.cantidad_disponible <= 0) throw errorAgotado('Se agotaron los almuerzos de hoy.');
    const proteina = (await this.repo.proteinasDelMenu(idMenu, cliente)).find((p) => p.id_proteina === idProteina);
    if (!proteina || proteina.cantidad_disponible <= 0) throw errorAgotado(`Se agotó: ${proteina?.nombre ?? 'la proteína elegida'}.`, proteina?.nombre);
    const acompanamientos = await this.repo.acompanamientosDelMenu(idMenu, cliente);
    for (const id of idsAcompanamiento) {
      const a = acompanamientos.find((x) => x.id_acompanamiento === id);
      if (!a || a.cantidad_disponible <= 0) throw errorAgotado(`Se agotó: ${a?.nombre ?? 'un acompañamiento elegido'}.`, a?.nombre);
    }
  }

  /** Nombres de tipos, proteínas y acompañamientos, para mostrar reservas. */
  async obtenerNombres({ idsTipo = [], idsProteina = [], idsAcompanamiento = [] }) {
    const unicos = (xs) => [...new Set(xs.filter(Boolean))];
    const [tipos, proteinas, acompanamientos] = await Promise.all([
      this.repo.tiposPorIds(unicos(idsTipo)),
      this.repo.proteinasPorIds(unicos(idsProteina)),
      this.repo.acompanamientosPorIds(unicos(idsAcompanamiento)),
    ]);
    return {
      tipos: new Map(tipos.map((t) => [t.id_tipo_almuerzo, t.nombre])),
      proteinas: new Map(proteinas.map((p) => [p.id_proteina, p.nombre])),
      acompanamientos: new Map(acompanamientos.map((a) => [a.id_acompanamiento, a.nombre])),
    };
  }

  // =================================================================
  // Administración (RF02)
  // =================================================================

  /** Menú de una fecha en cualquier estado (vista del administrador). */
  async consultarMenuAdmin(fecha) {
    const menu = await this.repo.menuPorFecha(fecha);
    if (!menu) throw noEncontrado('MENU_NO_ENCONTRADO', `No hay menú para el ${fecha}.`);
    return this.#detalleMenu(menu, { incluirInactivas: true });
  }

  async actualizarMenu(idMenu, datos) {
    await this.#validarOpcionesDelCatalogo(datos);
    return this.db.transaccion(async (c) => {
      const menu = await this.repo.actualizarMenu(idMenu, datos, c);
      if (!menu) throw noEncontrado('MENU_NO_ENCONTRADO', 'No encontramos ese menú.');
      await this.repo.reemplazarOpciones(idMenu, datos.proteinas, datos.acompanamientos, c);
      return this.#detalleMenu(menu, { incluirInactivas: true }, c);
    });
  }

  /** Solo se elimina un menú sin reservas; si tiene, la base de datos lo impide. */
  async eliminarMenu(idMenu) {
    try {
      const eliminado = await this.repo.eliminarMenu(idMenu);
      if (!eliminado) throw noEncontrado('MENU_NO_ENCONTRADO', 'No encontramos ese menú.');
    } catch (error) {
      if (esViolacionLlaveForanea(error)) {
        throw conflicto('MENU_CON_RESERVAS', 'Este menú ya tiene reservas: no se puede eliminar. Cámbialo a "Cerrado" para bloquear nuevas reservas.');
      }
      throw error;
    }
  }

  async listarTipos() {
    return (await this.repo.listarTipos()).map(aTipo);
  }

  async crearTipo(datos) {
    return aTipo(await this.#conNombreUnico(() => this.repo.crearTipo(datos), datos.nombre));
  }

  async actualizarTipo(id, datos) {
    const fila = await this.#conNombreUnico(() => this.repo.actualizarTipo(id, datos), datos.nombre);
    if (!fila) throw noEncontrado('TIPO_NO_ENCONTRADO', 'No encontramos ese tipo de almuerzo.');
    return aTipo(fila);
  }

  async listarProteinas() {
    return (await this.repo.listarProteinas()).map(aProteina);
  }

  async crearProteina(datos) {
    return aProteina(await this.#conNombreUnico(() => this.repo.crearProteina(datos), datos.nombre));
  }

  async actualizarProteina(id, datos) {
    const fila = await this.#conNombreUnico(() => this.repo.actualizarProteina(id, datos), datos.nombre);
    if (!fila) throw noEncontrado('PROTEINA_NO_ENCONTRADA', 'No encontramos esa proteína.');
    return aProteina(fila);
  }

  async listarAcompanamientos() {
    return (await this.repo.listarAcompanamientos()).map(aAcompanamiento);
  }

  async crearAcompanamiento(datos) {
    return aAcompanamiento(await this.#conNombreUnico(() => this.repo.crearAcompanamiento(datos), datos.nombre));
  }

  async actualizarAcompanamiento(id, datos) {
    const fila = await this.#conNombreUnico(() => this.repo.actualizarAcompanamiento(id, datos), datos.nombre);
    if (!fila) throw noEncontrado('ACOMPANAMIENTO_NO_ENCONTRADO', 'No encontramos ese acompañamiento.');
    return aAcompanamiento(fila);
  }

  // =================================================================
  // Privados
  // =================================================================

  async #detalleMenu(menu, { incluirInactivas }, cliente = null) {
    const [tipos, proteinas, acompanamientos] = await Promise.all([
      this.repo.listarTipos(),
      this.repo.proteinasDelMenu(menu.id_menu, cliente),
      this.repo.acompanamientosDelMenu(menu.id_menu, cliente),
    ]);
    const visible = (x) => incluirInactivas || x.estado === 'ACTIVO';
    return {
      ...aMenu(menu),
      tipos: tipos.map(aTipo),
      proteinas: proteinas.filter(visible).map((p) => ({
        idProteina: p.id_proteina,
        nombre: p.nombre,
        descripcion: p.descripcion,
        imagenUrl: p.imagen_url,
        estado: p.estado,
        porciones: p.cantidad_disponible,
      })),
      acompanamientos: acompanamientos.filter(visible).map((a) => ({
        idAcompanamiento: a.id_acompanamiento,
        nombre: a.nombre,
        descripcion: a.descripcion,
        imagenUrl: a.imagen_url,
        estado: a.estado,
        porciones: a.cantidad_disponible,
      })),
    };
  }

  async #validarOpcionesDelCatalogo(datos) {
    const idsP = datos.proteinas.map((p) => p.idProteina);
    const idsA = datos.acompanamientos.map((a) => a.idAcompanamiento);
    const proteinas = await this.repo.proteinasPorIds(idsP);
    const acompanamientos = await this.repo.acompanamientosPorIds(idsA);
    if (proteinas.length !== new Set(idsP).size || acompanamientos.length !== new Set(idsA).size) {
      throw new ErrorAplicacion('OPCION_NO_VALIDA', 'Alguna proteína o acompañamiento del menú no existe en el catálogo.', 400);
    }
    const inactiva = [...proteinas, ...acompanamientos].find((x) => x.estado !== 'ACTIVO');
    if (inactiva && datos.estado === 'PUBLICADO') {
      throw new ErrorAplicacion('OPCION_INACTIVA', `"${inactiva.nombre}" está inactiva en el catálogo. Actívala o quítala del menú.`, 400);
    }
  }

  async #describirAgotado({ tipo, id }) {
    if (tipo === 'menu') return { tipo, id, nombre: null, mensaje: 'Se agotaron los almuerzos de hoy.' };
    const nombres = await this.obtenerNombres(tipo === 'proteina' ? { idsProteina: [id] } : { idsAcompanamiento: [id] });
    const nombre = (tipo === 'proteina' ? nombres.proteinas : nombres.acompanamientos).get(id) ?? null;
    return { tipo, id, nombre, mensaje: `Se agotó: ${nombre}.` };
  }

  async #conNombreUnico(operacion, nombre) {
    try {
      return await operacion();
    } catch (error) {
      if (esViolacionUnica(error)) throw conflicto('NOMBRE_DUPLICADO', `Ya existe un elemento llamado "${nombre}".`);
      throw error;
    }
  }
}

function errorAgotado(mensaje, nombre = null) {
  return conflicto('PLATO_AGOTADO', `${mensaje} Elige otra opción; no se te cobró nada.`, { nombre });
}

function aMenu(m) {
  return {
    idMenu: m.id_menu,
    fecha: m.fecha,
    estado: m.estado,
    horaInicioReserva: m.hora_inicio_reserva,
    horaFinReserva: m.hora_fin_reserva,
    cantidadDisponible: m.cantidad_disponible,
  };
}

function aTipo(t) {
  return {
    idTipoAlmuerzo: t.id_tipo_almuerzo,
    nombre: t.nombre,
    descripcion: t.descripcion,
    precio: t.precio,
    tipoServicio: t.tipo_servicio,
    maxAcompanamientos: t.max_acompanamientos,
  };
}

function aProteina(p) {
  return {
    idProteina: p.id_proteina,
    nombre: p.nombre,
    descripcion: p.descripcion,
    cantidadDisponible: p.cantidad_disponible,
    estado: p.estado,
    imagenUrl: p.imagen_url,
  };
}

function aAcompanamiento(a) {
  return { idAcompanamiento: a.id_acompanamiento, nombre: a.nombre, descripcion: a.descripcion, estado: a.estado, imagenUrl: a.imagen_url };
}
