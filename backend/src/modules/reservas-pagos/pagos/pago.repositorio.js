import { conflicto, esViolacionUnica } from '../../../compartido/errores.js';

// Único acceso a la tabla `pago`. Nunca guarda datos sensibles (número de tarjeta, CVC...).
export class PagoRepositorio {
  constructor(db) {
    this.db = db;
  }

  async buscarPorReferencia(referencia, cliente) {
    const { rows } = await this.db.consulta('SELECT * FROM pago WHERE referencia_transaccion = $1', [referencia], cliente);
    return rows[0] ?? null;
  }

  async buscarPorReserva(idReserva, cliente) {
    const { rows } = await this.db.consulta('SELECT * FROM pago WHERE id_reserva = $1', [idReserva], cliente);
    return rows[0] ?? null;
  }

  async crearPendiente(p, cliente) {
    try {
      const { rows } = await this.db.consulta(
        `INSERT INTO pago (id_reserva, monto, fecha_pago, estado_pago, referencia_transaccion, metodo_pago)
         VALUES ($1, $2, $3, 'PENDIENTE', $4, $5) RETURNING *`,
        [p.idReserva, p.monto, p.fecha, p.referencia, p.metodo],
        cliente,
      );
      return rows[0];
    } catch (error) {
      // pago.id_reserva es UNIQUE: la reserva ya tiene un pago (con otra clave de idempotencia).
      if (esViolacionUnica(error, 'pago_id_reserva_key')) {
        throw conflicto('PAGO_EN_CURSO', 'Esta reserva ya tiene un pago registrado. Espera su resultado.');
      }
      throw error;
    }
  }

  /** Cambia el estado solo si el pago está en uno de los estados `desde`. */
  async actualizarEstado(idPago, nuevo, desde, cliente) {
    const { rowCount } = await this.db.consulta(
      'UPDATE pago SET estado_pago = $2 WHERE id_pago = $1 AND estado_pago = ANY($3::varchar[])',
      [idPago, nuevo, desde],
      cliente,
    );
    return rowCount > 0;
  }
}
