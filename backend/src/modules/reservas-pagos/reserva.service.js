import crypto from 'node:crypto';
import { ErrorAplicacion, conflicto, esViolacionUnica, noEncontrado, prohibido } from '../../compartido/errores.js';
import { horaLegible } from '../../compartido/reloj.js';
import { ROLES, ROLES_COMENSALES, ROLES_QUE_PAGAN } from '../../compartido/roles.js';
import { ProcesadorDePagos } from './pagos/ProcesadorDePagos.js';

/** Minutos que tiene un usuario para pagar una reserva pendiente. */
export const MINUTOS_PARA_PAGAR = 15;
/** Un pago con tarjeta o Nequi responde en segundos; si sigue PENDIENTE tras este tiempo, quedó trabado. */
export const MINUTOS_PAGO_TRABADO = 2;
export const LUGAR_DE_RECLAMO = 'Cafetería principal · Zona de buses';

/**
 * ReservaService: registra reservas y gestiona el pago o el subsidio.
 * Oculta las reglas de horario, el cálculo del total y la verificación del subsidio.
 * Depende de Autenticación (usuarios) y de Gestión de Menú (porciones). Genera
 * el ficho a través del servicio de fichos que recibe (Validación QR).
 */
export class ReservaService {
  constructor({ db, reservas, pagos, menu, auth, estrategias, reloj, fichos = null }) {
    this.db = db;
    this.reservas = reservas;
    this.pagos = pagos;
    this.menu = menu;
    this.auth = auth;
    this.estrategias = estrategias;
    this.reloj = reloj;
    this.fichos = fichos;
  }

  conectarFichos(fichos) {
    this.fichos = fichos;
  }

  // =================================================================
  // Operaciones públicas del diagrama de componentes
  // =================================================================

  /**
   * Crea la reserva del día (RF04, RF05, RF06).
   * - Pagada: queda PENDIENTE_PAGO con el total calculado aquí.
   * - Subsidiada: en una sola transacción valida el subsidio, descuenta la
   *   porción, confirma y genera el ficho, sin crear pago.
   */
  async crearReserva(usuario, pedido) {
    if (!ROLES_COMENSALES.includes(usuario.rol)) throw prohibido('El administrador no reserva almuerzos.');
    const { fecha, hora } = this.reloj.partes();
    const menu = await this.menu.obtenerMenuPublicado(fecha);
    const ventana = await this.#ventanaDelUsuario(usuario, menu, fecha, hora);
    if (!ventana.abierto) throw conflicto('FUERA_DE_HORARIO', ventana.motivo, { inicio: ventana.inicio, fin: ventana.fin });

    const esSubsidiado = usuario.rol === ROLES.SUBSIDIADO;
    if (esSubsidiado) {
      const subsidio = await this.#estadoSubsidio(usuario, fecha, menu);
      if (!subsidio.disponible) throw conflicto('SUBSIDIO_NO_DISPONIBLE', subsidio.motivo);
    }
    const seleccion = await this.menu.validarSeleccion(menu, pedido);
    await this.#liberarReservaPendiente(usuario, menu);

    const datos = {
      idUsuario: usuario.id,
      idMenu: menu.idMenu,
      idTipoAlmuerzo: seleccion.tipo.idTipoAlmuerzo,
      fecha,
      hora,
      idProteina: seleccion.idProteina,
      idsAcompanamiento: seleccion.idsAcompanamiento,
    };
    const idReserva = esSubsidiado
      ? await this.#reservarConSubsidio(usuario, menu, datos)
      : await this.#reservarParaPagar(datos, seleccion.tipo.precio);
    return this.obtenerDetalle(idReserva);
  }

  /**
   * Cobra una reserva pendiente con Nequi, PSE o tarjeta (RF09, RF10, RNF05).
   * La clave de idempotencia identifica el intento: si llega dos veces, se
   * responde lo mismo sin cobrar otra vez.
   */
  async procesarPago(usuario, idReserva, entrada, claveIdempotencia) {
    if (!ROLES_QUE_PAGAN.includes(usuario.rol)) {
      throw prohibido('Tu perfil no paga en línea: tu almuerzo se confirma con tu subsidio.');
    }
    const estrategia = this.estrategias.obtener(entrada.metodo);
    const datos = estrategia.validarDatos(entrada.datos);
    const referencia = referenciaDesdeClave(idReserva, claveIdempotencia);

    // Bloqueo consultivo por referencia: dos peticiones con la misma clave se atienden una tras otra.
    const desenlace = await this.db.conCliente(async (cliente) => {
      await cliente.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [referencia]);
      try {
        const reserva = await this.reservas.obtenerPorId(idReserva, cliente);
        if (!reserva || reserva.id_usuario !== usuario.id) {
          throw noEncontrado('RESERVA_NO_ENCONTRADA', 'No encontramos esa reserva.');
        }
        if (reserva.estado === 'PENDIENTE_PAGO' && !reserva.id_pago) await this.#prevalidarPago(reserva, usuario, cliente);

        const procesador = new ProcesadorDePagos({ db: this.db, pagoRepositorio: this.pagos });
        procesador.establecerEstrategia(estrategia);
        const { pago, resultado, repetido } = await procesador.ejecutarPago(
          { idReserva, monto: reserva.valor_total, metodo: estrategia.metodo, referencia, datos, fecha: this.reloj.ahora() },
          { cliente, antesDeCobrar: (tx) => this.#exigirPendienteSinPago(idReserva, tx) },
        );
        if (repetido) return { repetido: true };
        // `return await`: el bloqueo se suelta en el finally solo cuando el resultado ya quedó guardado.
        return await this.#aplicarResultado(idReserva, pago, resultado, cliente);
      } finally {
        await cliente.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [referencia]);
      }
    });
    // La respuesta se arma con la conexión ya liberada.
    return this.#respuestaDePago(idReserva, desenlace);
  }

  /**
   * Cancela una reserva del usuario. Una confirmada solo se cancela antes de
   * la hora límite: vuelven las porciones, el pago pasa a REEMBOLSADO
   * (simulado), el ficho a EXPIRADO y el subsidio queda libre (decisión 6).
   */
  async cancelarReserva(usuario, idReserva) {
    await this.db.transaccion(async (tx) => {
      const r = await this.reservas.bloquear(idReserva, tx);
      if (!r || r.id_usuario !== usuario.id) throw noEncontrado('RESERVA_NO_ENCONTRADA', 'No encontramos esa reserva.');
      if (r.estado === 'CANCELADA') throw conflicto('RESERVA_YA_CANCELADA', 'Esta reserva ya estaba cancelada.');
      if (r.estado === 'ENTREGADA') throw conflicto('RESERVA_ENTREGADA', 'Este almuerzo ya fue entregado: no se puede cancelar.');
      if (r.estado === 'PENDIENTE_PAGO') {
        if (r.id_pago && !(await this.#vencerPagoTrabado(r, tx))) {
          throw conflicto('PAGO_EN_CURSO', 'Tu pago está en proceso. Espera el resultado antes de cancelar.');
        }
        if (r.id_pago) return;
        await this.reservas.actualizarEstado(idReserva, 'CANCELADA', ['PENDIENTE_PAGO'], tx);
        return;
      }
      const { fecha, hora } = this.reloj.partes();
      const menu = await this.menu.obtenerMenu(r.id_menu, tx);
      const ventana = await this.#ventanaDelUsuario(usuario, menu, fecha, hora, tx);
      if (menu.fecha !== fecha || !ventana.fin || hora >= ventana.fin) {
        const limite = ventana.fin ? ` (${horaLegible(ventana.fin)})` : '';
        throw conflicto('CANCELACION_FUERA_DE_HORARIO', `Ya pasó la hora límite${limite}: la reserva no se puede cancelar.`);
      }
      await this.menu.devolverPorcion(r.id_menu, r.id_proteina, r.ids_acompanamiento, tx);
      await this.fichos.anularFicho(idReserva, tx);
      if (r.id_pago && r.estado_pago === 'APROBADO') await this.pagos.actualizarEstado(r.id_pago, 'REEMBOLSADO', ['APROBADO'], tx);
      await this.reservas.actualizarEstado(idReserva, 'CANCELADA', ['CONFIRMADA'], tx);
    });
    return this.obtenerDetalle(idReserva);
  }

  // =================================================================
  // Consultas del usuario
  // =================================================================

  /** Lo que el frontend necesita saber hoy: horario, reserva activa y subsidio. */
  async contextoDelDia(usuario) {
    const { fecha, hora } = this.reloj.partes();
    let menu = null;
    try {
      menu = await this.menu.obtenerMenuPublicado(fecha);
    } catch (error) {
      if (error.codigo !== 'MENU_NO_DISPONIBLE') throw error;
    }
    const horario = await this.#ventanaDelUsuario(usuario, menu, fecha, hora);
    const activa = menu ? await this.reservas.reservaActiva(usuario.id, menu.idMenu) : null;
    const subsidio = usuario.rol === ROLES.SUBSIDIADO ? { aplica: true, ...(await this.#estadoSubsidio(usuario, fecha, menu)) } : { aplica: false };
    return {
      fecha,
      hora,
      menuPublicado: Boolean(menu),
      horario,
      pagaEnLinea: ROLES_QUE_PAGAN.includes(usuario.rol),
      subsidio,
      reservaActiva: activa
        ? { idReserva: activa.id_reserva, estado: activa.estado, tipoReserva: activa.tipo_reserva, conPago: Boolean(activa.id_pago) }
        : null,
      minutosParaPagar: MINUTOS_PARA_PAGAR,
    };
  }

  async obtenerDeUsuario(usuario, idReserva) {
    const fila = await this.reservas.obtenerPorId(idReserva);
    if (!fila || fila.id_usuario !== usuario.id) throw noEncontrado('RESERVA_NO_ENCONTRADA', 'No encontramos esa reserva.');
    return (await this.#armarDetalles([fila]))[0];
  }

  async listarMias(usuario) {
    return this.#armarDetalles(await this.reservas.listarPorUsuario(usuario.id));
  }

  /** Reserva confirmada (o ya entregada) de hoy, con su ficho: pantalla "Mi Ficho". */
  async reservaVigenteDeHoy(usuario) {
    const fila = await this.reservas.delDia(usuario.id, this.reloj.hoy(), ['CONFIRMADA', 'ENTREGADA']);
    if (!fila) throw noEncontrado('SIN_FICHO', 'No tienes un ficho para hoy. Reserva tu almuerzo en el menú del día.');
    return (await this.#armarDetalles([fila]))[0];
  }

  // =================================================================
  // Pasarela (webhook genérico)
  // =================================================================

  /** Aplica la respuesta tardía de la pasarela a un pago PENDIENTE. Es idempotente. */
  async confirmarPagoDesdePasarela({ referencia, estado }) {
    return this.db.conCliente(async (cliente) => {
      await cliente.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [referencia]);
      try {
        const pago = await this.pagos.buscarPorReferencia(referencia, cliente);
        if (!pago) throw noEncontrado('PAGO_NO_ENCONTRADO', 'No existe un pago con esa referencia.');
        if (pago.estado_pago !== 'PENDIENTE') return { procesado: false, estadoPago: pago.estado_pago };
        await this.#aplicarResultado(pago.id_reserva, pago, { estado, motivo: estado === 'RECHAZADO' ? 'El banco rechazó la transacción.' : null }, cliente);
        const actualizado = await this.pagos.buscarPorReferencia(referencia, cliente);
        return { procesado: true, estadoPago: actualizado.estado_pago };
      } finally {
        await cliente.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [referencia]);
      }
    });
  }

  // =================================================================
  // Operaciones para Validación QR
  // =================================================================

  async obtenerReserva(idReserva, cliente = null) {
    const fila = await this.reservas.obtenerPorId(idReserva, cliente);
    if (!fila) throw noEncontrado('RESERVA_NO_ENCONTRADA', 'No encontramos esa reserva.');
    return (await this.#armarDetalles([fila], cliente, { conComensal: true }))[0];
  }

  /** Para Validación QR: el pedido y su titular, sin la imagen del QR (no hace falta en la caja). */
  async obtenerReservas(ids) {
    const detalles = await this.#armarDetalles(await this.reservas.porIds([...new Set(ids)]), null, { conComensal: true, sinImagenQr: true });
    return new Map(detalles.map((d) => [d.idReserva, d]));
  }

  /** Bloquea la reserva dentro de la transacción de entrega (orden de bloqueo: reserva → ficho). */
  async bloquearReserva(idReserva, tx) {
    await this.reservas.bloquear(idReserva, tx);
  }

  async marcarEntregada(idReserva, cliente = null) {
    const ok = await this.reservas.actualizarEstado(idReserva, 'ENTREGADA', ['CONFIRMADA'], cliente);
    if (!ok) throw conflicto('RESERVA_NO_CONFIRMADA', 'La reserva de este ficho no está confirmada.');
  }

  // =================================================================
  // Administración
  // =================================================================

  /** Porciones reservadas por opción: { proteinas: {id: n}, acompanamientos: {id: n} }. */
  async conteoSelecciones(idMenu) {
    const { proteinas, acompanamientos } = await this.reservas.conteoSelecciones(idMenu);
    const aObjeto = (filas) => Object.fromEntries(filas.map((f) => [f.id, f.total]));
    return { proteinas: aObjeto(proteinas), acompanamientos: aObjeto(acompanamientos) };
  }

  async resumenDelDia(fecha) {
    let menu;
    try {
      menu = await this.menu.consultarMenuAdmin(fecha);
    } catch (error) {
      if (error.codigo === 'MENU_NO_ENCONTRADO') return { confirmadas: 0, entregadas: 0, porEntregar: 0, subsidiadas: 0, pagadas: 0, pendientesDePago: 0 };
      throw error;
    }
    const r = await this.reservas.resumenDelMenu(menu.idMenu);
    return {
      confirmadas: r.confirmadas,
      entregadas: r.entregadas,
      porEntregar: r.por_entregar,
      subsidiadas: r.subsidiadas,
      pagadas: r.pagadas,
      pendientesDePago: r.pendientes_de_pago,
    };
  }

  async listarConfiguraciones() {
    const filas = await this.reservas.listarConfiguraciones();
    return this.#armarConfiguraciones(filas);
  }

  /** Crea (sin idConfiguracion) o actualiza un horario de reserva (RF04). */
  /**
   * Crea el beneficio diario de un estudiante subsidiado recién aprobado.
   * Lo llama Autenticación, dentro de la transacción que aprueba la cuenta.
   */
  async otorgarBeneficio({ idUsuario, idRol, fechaInicioVigencia, fechaFinVigencia }, tx) {
    if (!fechaInicioVigencia) {
      throw new ErrorAplicacion('VIGENCIA_REQUERIDA', 'Indica desde qué fecha tiene vigente el subsidio.', 400, {
        campos: [{ campo: 'fechaInicioVigencia', mensaje: 'Indica desde qué fecha tiene vigente el subsidio.' }],
      });
    }
    await this.reservas.crearBeneficio(
      { idUsuario, idRol, codigo: `BEN-${crypto.randomBytes(8).toString('hex')}`, desde: fechaInicioVigencia, hasta: fechaFinVigencia ?? null },
      tx,
    );
  }

  async guardarConfiguracion(datos) {
    if (datos.idRol) {
      const rol = (await this.auth.listarRoles()).find((r) => r.idRol === datos.idRol);
      if (!rol) throw new ErrorAplicacion('ROL_NO_VALIDO', 'Ese rol no existe.', 400);
      if (rol.nombreRol === ROLES.ADMIN) throw new ErrorAplicacion('ROL_NO_VALIDO', 'El administrador no reserva almuerzos: no necesita horario.', 400);
    } else {
      const usuario = (await this.auth.obtenerUsuarios([datos.idUsuario])).get(datos.idUsuario);
      if (!usuario) throw new ErrorAplicacion('USUARIO_NO_VALIDO', 'Ese usuario no existe.', 400);
      if (usuario.rol === ROLES.ADMIN) throw new ErrorAplicacion('USUARIO_NO_VALIDO', 'El administrador no reserva almuerzos: no necesita horario.', 400);
    }
    const fila = datos.idConfiguracion
      ? await this.reservas.actualizarConfiguracion(datos.idConfiguracion, datos)
      : await this.reservas.crearConfiguracion(datos);
    if (!fila) throw noEncontrado('CONFIGURACION_NO_ENCONTRADA', 'No encontramos ese horario.');
    return (await this.#armarConfiguraciones([fila]))[0];
  }

  // =================================================================
  // Privados
  // =================================================================

  /**
   * Ventana en la que el usuario puede reservar hoy: la intersección entre su
   * configuración vigente (la propia manda sobre la del rol) y la ventana del menú.
   */
  async #ventanaDelUsuario(usuario, menu, fecha, hora, cliente = null) {
    const config = await this.reservas.configuracionVigente(usuario.id, usuario.idRol, fecha, cliente);
    if (!config) {
      return { abierto: false, inicio: null, fin: null, motivo: 'No tienes un horario de reservas configurado. Pregunta en la cafetería.' };
    }
    if (!menu) return { abierto: false, inicio: config.hora_inicio, fin: config.hora_fin, motivo: 'Todavía no hay un menú publicado para hoy.' };
    const inicio = config.hora_inicio > menu.horaInicioReserva ? config.hora_inicio : menu.horaInicioReserva;
    const fin = config.hora_fin < menu.horaFinReserva ? config.hora_fin : menu.horaFinReserva;
    if (inicio >= fin) return { abierto: false, inicio, fin, motivo: 'Hoy no hay reservas en tu horario.' };
    if (hora < inicio) return { abierto: false, inicio, fin, motivo: `Las reservas de hoy abren a las ${horaLegible(inicio)}` };
    if (hora >= fin) {
      return { abierto: false, inicio, fin, motivo: `Las reservas de hoy cerraron a las ${horaLegible(fin)} Tu horario es de ${horaLegible(inicio)} a ${horaLegible(fin)}` };
    }
    return { abierto: true, inicio, fin, motivo: null };
  }

  /** validarSubsidio(): beneficio vigente y sin usar ese día (RF06). */
  async #estadoSubsidio(usuario, fecha, menu, cliente = null, { bloquear = false, excluir = null } = {}) {
    const beneficio = await this.reservas.beneficioVigente(usuario.id, fecha, { bloquear }, cliente);
    if (!beneficio) {
      return { disponible: false, motivo: 'Tu beneficio de almuerzo subsidiado no está vigente hoy. Acércate a Bienestar Universitario.' };
    }
    if (menu && (await this.reservas.subsidioUsado(usuario.id, menu.idMenu, excluir, cliente))) {
      return { disponible: false, motivo: 'Ya usaste tu subsidio de hoy. Puedes reservar un almuerzo subsidiado por día.' };
    }
    return { disponible: true, motivo: null };
  }

  /**
   * Regla 6: una reserva activa por día. Si el usuario vuelve a elegir antes
   * de pagar, su reserva pendiente (sin pago) se reemplaza por la nueva.
   */
  async #liberarReservaPendiente(usuario, menu) {
    const activa = await this.reservas.reservaActiva(usuario.id, menu.idMenu);
    if (!activa) return;
    if (activa.estado === 'PENDIENTE_PAGO') {
      const liberada = await this.db.transaccion(async (tx) => {
        const r = await this.reservas.bloquear(activa.id_reserva, tx);
        if (r.estado !== 'PENDIENTE_PAGO') return false;
        if (r.id_pago) return this.#vencerPagoTrabado(r, tx);
        return this.reservas.actualizarEstado(r.id_reserva, 'CANCELADA', ['PENDIENTE_PAGO'], tx);
      });
      if (liberada) return;
    }
    throw conflicto(
      'RESERVA_ACTIVA_EXISTENTE',
      activa.estado === 'CONFIRMADA'
        ? 'Ya tienes un almuerzo reservado para hoy. Puedes verlo en "Mi Ficho".'
        : 'Tienes un pago en proceso para tu reserva de hoy. Espera el resultado.',
      { idReserva: activa.id_reserva, estado: activa.estado },
    );
  }

  async #reservarParaPagar(datos, precio) {
    try {
      return await this.db.transaccion((tx) =>
        this.reservas.crear({ ...datos, estado: 'PENDIENTE_PAGO', tipoReserva: 'PAGADA', valorTotal: precio }, tx),
      );
    } catch (error) {
      throw traducirReservaDuplicada(error);
    }
  }

  async #reservarConSubsidio(usuario, menu, datos) {
    let resultado;
    try {
      resultado = await this.db.transaccion(async (tx) => {
        const idReserva = await this.reservas.crear({ ...datos, estado: 'PENDIENTE_PAGO', tipoReserva: 'SUBSIDIADA', valorTotal: 0 }, tx);
        // El beneficio se bloquea para que dos peticiones del mismo usuario no lo usen a la vez.
        const subsidio = await this.#estadoSubsidio(usuario, datos.fecha, menu, tx, { bloquear: true, excluir: idReserva });
        if (!subsidio.disponible) {
          await this.reservas.actualizarEstado(idReserva, 'CANCELADA', ['PENDIENTE_PAGO'], tx);
          return { idReserva, error: conflicto('SUBSIDIO_NO_DISPONIBLE', subsidio.motivo) };
        }
        const descuento = await this.menu.descontarPorcion(datos.idMenu, datos.idProteina, datos.idsAcompanamiento, tx);
        if (!descuento.ok) {
          await this.reservas.actualizarEstado(idReserva, 'CANCELADA', ['PENDIENTE_PAGO'], tx);
          return { idReserva, error: errorAgotado(descuento.agotado) };
        }
        await this.reservas.actualizarEstado(idReserva, 'CONFIRMADA', ['PENDIENTE_PAGO'], tx);
        await this.fichos.generarFichoQR({ id_reserva: idReserva, estado: 'CONFIRMADA', fecha_reserva: datos.fecha }, tx);
        return { idReserva, error: null };
      });
    } catch (error) {
      throw traducirReservaDuplicada(error);
    }
    // La reserva cancelada queda registrada (como en el diagrama de secuencia) y se informa el motivo.
    if (resultado.error) throw resultado.error;
    return resultado.idReserva;
  }

  /** Antes de cobrar: plazo para pagar, horario (RF04) y porciones disponibles (regla 9). */
  async #prevalidarPago(reserva, usuario, cliente) {
    if (reserva.tipo_reserva !== 'PAGADA') throw conflicto('RESERVA_NO_REQUIERE_PAGO', 'Esta reserva no necesita pago.');
    const creada = this.reloj.instante(reserva.fecha_reserva, reserva.hora_reserva);
    if (this.reloj.ahora() - creada > MINUTOS_PARA_PAGAR * 60_000) {
      await this.reservas.actualizarEstado(reserva.id_reserva, 'CANCELADA', ['PENDIENTE_PAGO'], cliente);
      throw conflicto('RESERVA_EXPIRADA', `Pasaron más de ${MINUTOS_PARA_PAGAR} minutos sin pagar y la reserva se canceló. Vuelve a elegir tu almuerzo.`);
    }
    const { fecha, hora } = this.reloj.partes();
    const menu = await this.menu.obtenerMenu(reserva.id_menu, cliente);
    const ventana = await this.#ventanaDelUsuario(usuario, menu, fecha, hora, cliente);
    if (menu.fecha !== fecha || !ventana.abierto) {
      await this.reservas.actualizarEstado(reserva.id_reserva, 'CANCELADA', ['PENDIENTE_PAGO'], cliente);
      throw conflicto('FUERA_DE_HORARIO', `${ventana.motivo ?? 'Las reservas de ese día ya cerraron.'} No se hizo ningún cobro.`, {
        inicio: ventana.inicio,
        fin: ventana.fin,
      });
    }
    try {
      await this.menu.verificarDisponibilidad(reserva.id_menu, reserva.id_proteina, reserva.ids_acompanamiento, cliente);
    } catch (error) {
      if (['PLATO_AGOTADO', 'MENU_NO_DISPONIBLE'].includes(error.codigo)) {
        await this.reservas.actualizarEstado(reserva.id_reserva, 'CANCELADA', ['PENDIENTE_PAGO'], cliente);
      }
      throw error;
    }
  }

  /**
   * Un pago con tarjeta o Nequi que sigue PENDIENTE después de unos minutos
   * quedó trabado (por ejemplo, el servidor se reinició a mitad del cobro).
   * En el sandbox se da por no cobrado: pago RECHAZADO y reserva CANCELADA.
   * PSE no se vence aquí porque su respuesta llega por el webhook.
   */
  async #vencerPagoTrabado(r, tx) {
    if (r.estado_pago !== 'PENDIENTE' || r.metodo_pago === 'PSE') return false;
    if (this.reloj.ahora() - new Date(r.fecha_pago) < MINUTOS_PAGO_TRABADO * 60_000) return false;
    await this.pagos.actualizarEstado(r.id_pago, 'RECHAZADO', ['PENDIENTE'], tx);
    await this.reservas.actualizarEstado(r.id_reserva, 'CANCELADA', ['PENDIENTE_PAGO'], tx);
    return true;
  }

  /** Se ejecuta con la reserva bloqueada, en la misma transacción que registra el pago. */
  async #exigirPendienteSinPago(idReserva, tx) {
    const r = await this.reservas.bloquear(idReserva, tx);
    if (r.tipo_reserva !== 'PAGADA') throw conflicto('RESERVA_NO_REQUIERE_PAGO', 'Esta reserva no necesita pago.');
    if (r.estado !== 'PENDIENTE_PAGO') throw conflicto('RESERVA_NO_PENDIENTE', 'Esta reserva ya no está pendiente de pago.');
    if (r.id_pago) throw conflicto('PAGO_EN_CURSO', 'Esta reserva ya tiene un pago registrado. Espera su resultado.');
  }

  /**
   * Aplica el resultado de la pasarela en una transacción:
   * APROBADO → descontarPorcion() → CONFIRMADA → generarFichoQR(); si ya no hay
   * porciones, CANCELADA y pago REEMBOLSADO (regla 9).
   * RECHAZADO → pago RECHAZADO y reserva CANCELADA. PENDIENTE → espera el webhook.
   */
  async #aplicarResultado(idReserva, pago, resultado, cliente) {
    return this.db.transaccion(async (tx) => {
      const reserva = await this.reservas.bloquear(idReserva, tx);
      if (resultado.estado === 'APROBADO') {
        await this.pagos.actualizarEstado(pago.id_pago, 'APROBADO', ['PENDIENTE'], tx);
        // Un pago que llega cuando ya no se puede servir ese almuerzo (por ejemplo, un
        // PSE que el banco confirma después de medianoche o con el menú cerrado) se reembolsa.
        const menu = await this.menu.obtenerMenu(reserva.id_menu, tx);
        if (reserva.estado !== 'PENDIENTE_PAGO' || menu.estado !== 'PUBLICADO' || menu.fecha !== this.reloj.hoy()) {
          await this.pagos.actualizarEstado(pago.id_pago, 'REEMBOLSADO', ['APROBADO'], tx);
          await this.reservas.actualizarEstado(idReserva, 'CANCELADA', ['PENDIENTE_PAGO'], tx);
          return { motivo: 'La confirmación del pago llegó cuando ese almuerzo ya no se podía reservar. Te devolvimos el dinero (reembolso simulado) y la reserva se canceló.' };
        }
        const descuento = await this.menu.descontarPorcion(reserva.id_menu, reserva.id_proteina, reserva.ids_acompanamiento, tx);
        if (!descuento.ok) {
          await this.pagos.actualizarEstado(pago.id_pago, 'REEMBOLSADO', ['APROBADO'], tx);
          await this.reservas.actualizarEstado(idReserva, 'CANCELADA', ['PENDIENTE_PAGO'], tx);
          return { motivo: `${descuento.agotado.mensaje} Te devolvimos el dinero (reembolso simulado) y la reserva se canceló.` };
        }
        await this.reservas.actualizarEstado(idReserva, 'CONFIRMADA', ['PENDIENTE_PAGO'], tx);
        await this.fichos.generarFichoQR({ ...reserva, estado: 'CONFIRMADA' }, tx);
        return { motivo: null };
      }
      if (resultado.estado === 'RECHAZADO') {
        await this.pagos.actualizarEstado(pago.id_pago, 'RECHAZADO', ['PENDIENTE'], tx);
        await this.reservas.actualizarEstado(idReserva, 'CANCELADA', ['PENDIENTE_PAGO'], tx);
        return { motivo: resultado.motivo };
      }
      return { motivo: resultado.motivo };
    }, cliente);
  }

  async #respuestaDePago(idReserva, { motivo = null, repetido = false }, cliente) {
    const reserva = await this.obtenerDetalle(idReserva, cliente);
    const resultado = reserva.pago?.estado ?? 'PENDIENTE';
    const mensajes = {
      APROBADO: 'Pago aprobado. Tu almuerzo está reservado.',
      RECHAZADO: `${motivo ?? 'La entidad rechazó el pago.'} Tu reserva se canceló y no se hizo ningún cobro.`,
      PENDIENTE: 'Tu banco está procesando el pago. Te mostraremos el resultado apenas llegue.',
      REEMBOLSADO: motivo ?? 'Una opción de tu almuerzo se agotó mientras pagabas. Te devolvimos el dinero y la reserva se canceló.',
    };
    return { resultado, mensaje: mensajes[resultado], repetido, reserva };
  }

  async obtenerDetalle(idReserva, cliente = null) {
    const fila = await this.reservas.obtenerPorId(idReserva, cliente);
    if (!fila) throw noEncontrado('RESERVA_NO_ENCONTRADA', 'No encontramos esa reserva.');
    return (await this.#armarDetalles([fila], cliente))[0];
  }

  async #armarDetalles(filas, cliente = null, { conComensal = false, sinImagenQr = false } = {}) {
    if (!filas.length) return [];
    const nombres = await this.menu.obtenerNombres(
      {
        idsTipo: filas.map((f) => f.id_tipo_almuerzo),
        idsProteina: filas.map((f) => f.id_proteina),
        idsAcompanamiento: filas.flatMap((f) => f.ids_acompanamiento),
      },
      cliente,
    );
    const fichos = await this.fichos.obtenerPorReservas(filas.map((f) => f.id_reserva), cliente, { sinImagen: sinImagenQr });
    const comensales = conComensal ? await this.auth.obtenerUsuarios(filas.map((f) => f.id_usuario)) : null;
    return filas.map((f) => {
      const comensal = comensales?.get(f.id_usuario);
      return {
        idReserva: f.id_reserva,
        estado: f.estado,
        tipoReserva: f.tipo_reserva,
        valorTotal: f.valor_total,
        fechaReserva: f.fecha_reserva,
        horaReserva: f.hora_reserva,
        idMenu: f.id_menu,
        lugarReclamo: LUGAR_DE_RECLAMO,
        tipoAlmuerzo: { idTipoAlmuerzo: f.id_tipo_almuerzo, nombre: nombres.tipos.get(f.id_tipo_almuerzo) },
        proteina: { idProteina: f.id_proteina, nombre: nombres.proteinas.get(f.id_proteina) },
        acompanamientos: f.ids_acompanamiento.map((id) => ({ idAcompanamiento: id, nombre: nombres.acompanamientos.get(id) })),
        pago: f.id_pago ? { metodo: f.metodo_pago, estado: f.estado_pago, monto: f.monto, fecha: f.fecha_pago } : null,
        ficho: fichos.get(f.id_reserva) ?? null,
        ...(conComensal
          ? { comensal: comensal ? { idUsuario: comensal.idUsuario, nombreCompleto: comensal.nombreCompleto, rol: comensal.rol, nombreRol: comensal.nombreRol } : null }
          : {}),
      };
    });
  }

  async #armarConfiguraciones(filas) {
    const roles = new Map((await this.auth.listarRoles()).map((r) => [r.idRol, r]));
    const usuarios = await this.auth.obtenerUsuarios(filas.map((f) => f.id_usuario));
    const hoy = this.reloj.hoy();
    return filas.map((f) => {
      const usuario = usuarios.get(f.id_usuario);
      return {
        idConfiguracion: f.id_configuracion,
        idRol: f.id_rol,
        rol: f.id_rol ? roles.get(f.id_rol)?.nombreRol : null,
        nombreRol: f.id_rol ? roles.get(f.id_rol)?.nombre : null,
        idUsuario: f.id_usuario,
        usuario: usuario
          ? { nombreCompleto: usuario.nombreCompleto, correo: usuario.correo, documento: `****${usuario.documento.slice(-4)}`, nombreRol: usuario.nombreRol }
          : null,
        horaInicio: f.hora_inicio,
        horaFin: f.hora_fin,
        fechaInicioVigencia: f.fecha_inicio_vigencia,
        fechaFinVigencia: f.fecha_fin_vigencia,
        estado: f.estado,
        vigente: f.estado === 'ACTIVO' && f.fecha_inicio_vigencia <= hoy && (!f.fecha_fin_vigencia || f.fecha_fin_vigencia >= hoy),
      };
    });
  }
}

/** La referencia se deriva de la reserva y de la clave de idempotencia (RNF05). */
export function referenciaDesdeClave(idReserva, clave) {
  return `FP-${idReserva}-${crypto.createHash('sha256').update(clave).digest('hex').slice(0, 32)}`;
}

function errorAgotado(agotado) {
  return conflicto('PLATO_AGOTADO', `${agotado.mensaje} Alguien reservó la última porción. Elige otra opción; no se te cobró nada.`, {
    nombre: agotado.nombre,
  });
}

function traducirReservaDuplicada(error) {
  if (esViolacionUnica(error, 'ux_reserva_activa_por_dia') || esViolacionUnica(error, 'ux_reserva_subsidiada_por_dia')) {
    return conflicto('RESERVA_ACTIVA_EXISTENTE', 'Ya tienes una reserva activa para hoy. Revisa "Mi Ficho".');
  }
  return error;
}
