import { ErrorAplicacion, conflicto, noEncontrado } from '../../compartido/errores.js';
import { fechaLegible, horaLegible } from '../../compartido/reloj.js';
import { generarImagenQR, generarToken, normalizarToken } from './token.js';

/**
 * ValidacionQRService: genera y valida los fichos digitales (RF07, RF08).
 * Oculta la generación del token y el control del estado del ficho.
 * Depende de Reservas y Pagos para consultar el pedido y marcarlo entregado.
 */
export class ValidacionQRService {
  constructor({ db, repositorio, reloj, reservas = null }) {
    this.db = db;
    this.repo = repositorio;
    this.reloj = reloj;
    this.reservas = reservas;
  }

  conectarReservas(reservas) {
    this.reservas = reservas;
  }

  // =================================================================
  // Operaciones públicas del diagrama de componentes
  // =================================================================

  /** Genera el ficho único de una reserva CONFIRMADA. Vence al final del día del menú. */
  async generarFichoQR(reserva, cliente = null) {
    if (reserva.estado !== 'CONFIRMADA') {
      throw conflicto('RESERVA_NO_CONFIRMADA', 'Solo se genera el ficho de una reserva confirmada.');
    }
    for (let intento = 0; intento < 3; intento++) {
      const token = generarToken();
      const ficho = await this.repo.crear(
        {
          idReserva: reserva.id_reserva,
          token,
          codigoQr: await generarImagenQR(token),
          fechaGeneracion: this.reloj.ahora(),
          fechaExpiracion: this.reloj.finDelDia(reserva.fecha_reserva),
        },
        cliente,
      );
      if (ficho) return aFicho(ficho);
    }
    throw new Error('No se pudo generar un token único para el ficho');
  }

  /** Consulta el ficho escaneado y muestra el pedido, sin cambiar nada (RF08). */
  async validarQR(token) {
    const normalizado = normalizarToken(token);
    if (!normalizado) {
      throw new ErrorAplicacion('TOKEN_INVALIDO', 'Ese código no es un ficho de UDES FoodPass. Revisa el token.', 400);
    }
    const ficho = await this.repo.porToken(normalizado);
    if (!ficho) throw noEncontrado('FICHO_NO_ENCONTRADO', 'No existe un ficho con ese token.');
    await this.#exigirUsable(ficho);
    const reserva = await this.reservas.obtenerReserva(ficho.id_reserva);
    if (reserva.estado !== 'CONFIRMADA') throw conflicto('RESERVA_NO_CONFIRMADA', 'La reserva de este ficho no está confirmada.');
    return { ficho: aFicho(ficho, { sinImagen: true }), reserva };
  }

  // =================================================================
  // Operaciones de apoyo
  // =================================================================

  /**
   * Registra la entrega en una sola transacción: el ficho pasa a USADO, se
   * crea la entrega con el id del administrador y la reserva pasa a ENTREGADA.
   */
  async registrarEntrega(idFicho, idAdministrador) {
    const { fecha, hora } = this.reloj.partes();
    return this.db.transaccion(async (tx) => {
      const actual = await this.repo.porId(idFicho, tx);
      if (!actual) throw noEncontrado('FICHO_NO_ENCONTRADO', 'No existe ese ficho.');
      // Primero la reserva y luego el ficho, en el mismo orden que cancelarReserva():
      // así una entrega y una cancelación simultáneas no se bloquean mutuamente.
      await this.reservas.bloquearReserva(actual.id_reserva, tx);
      const usado = await this.repo.marcarUsado(idFicho, this.reloj.ahora(), tx);
      if (!usado) {
        const ficho = await this.repo.porId(idFicho, tx);
        await this.#exigirUsable(ficho, tx);
        throw conflicto('FICHO_NO_DISPONIBLE', 'Este ficho no se puede usar.');
      }
      const entrega = await this.repo.crearEntrega({ idFicho, idAdministrador, fecha, hora }, tx);
      await this.reservas.marcarEntregada(usado.id_reserva, tx);
      return { entrega: aEntrega(entrega), ficho: aFicho(usado, { sinImagen: true }) };
    });
  }

  /** Anula el ficho de una reserva cancelada. */
  async anularFicho(idReserva, cliente = null) {
    await this.repo.anularPorReserva(idReserva, cliente);
  }

  /** Map id_reserva → ficho (con la imagen del QR). */
  async obtenerPorReservas(idsReserva, cliente = null, { sinImagen = false } = {}) {
    const filas = await this.repo.porReservas(idsReserva, cliente);
    const ahora = this.reloj.ahora();
    return new Map(filas.map((f) => [f.id_reserva, aFicho(f, { ahora, sinImagen })]));
  }

  /** Entregas de una fecha con el pedido de cada una. */
  async listarEntregas(fecha) {
    const filas = await this.repo.entregasDelDia(fecha);
    const reservas = await this.reservas.obtenerReservas(filas.map((f) => f.id_reserva));
    return filas.map((f) => ({ ...aEntrega(f), token: f.token_unico, reserva: reservas.get(f.id_reserva) ?? null }));
  }

  async #exigirUsable(ficho, cliente = null) {
    if (ficho.estado === 'USADO') {
      const entrega = await this.repo.entregaPorFicho(ficho.id_ficho, cliente);
      const dia = entrega && entrega.fecha_entrega === this.reloj.hoy() ? 'hoy' : `el ${fechaLegible(entrega?.fecha_entrega)}`;
      const cuando = entrega ? `${dia} a las ${horaLegible(entrega.hora_entrega)}` : 'antes';
      throw conflicto('FICHO_YA_USADO', `Este ficho ya se usó ${cuando}: no entregues otro almuerzo.`, {
        fechaUso: ficho.fecha_uso,
        fechaEntrega: entrega?.fecha_entrega ?? null,
        horaEntrega: entrega?.hora_entrega ?? null,
        idValidador: entrega?.id_usuario_empleado ?? null,
        idReserva: ficho.id_reserva,
      });
    }
    if (ficho.estado === 'EXPIRADO' || ficho.fecha_expiracion <= this.reloj.ahora()) {
      if (ficho.estado === 'ACTIVO') await this.repo.marcarExpirado(ficho.id_ficho, cliente);
      throw new ErrorAplicacion('FICHO_EXPIRADO', 'Este ficho ya no es válido: venció o la reserva se canceló.', 410);
    }
  }
}

function aFicho(f, { sinImagen = false, ahora = null } = {}) {
  const vencido = ahora && f.estado === 'ACTIVO' && f.fecha_expiracion <= ahora;
  return {
    idFicho: f.id_ficho,
    idReserva: f.id_reserva,
    token: f.token_unico,
    ...(sinImagen ? {} : { codigoQr: f.codigo_qr }),
    estado: vencido ? 'EXPIRADO' : f.estado,
    fechaGeneracion: f.fecha_generacion,
    fechaExpiracion: f.fecha_expiracion,
    fechaUso: f.fecha_uso,
  };
}

function aEntrega(e) {
  return {
    idEntrega: e.id_entrega,
    idFicho: e.id_ficho,
    idUsuarioEmpleado: e.id_usuario_empleado,
    fechaEntrega: e.fecha_entrega,
    horaEntrega: e.hora_entrega,
    estadoEntrega: e.estado_entrega,
  };
}
