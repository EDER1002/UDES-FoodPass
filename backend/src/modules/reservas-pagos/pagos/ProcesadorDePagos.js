import { EstrategiaPago } from './EstrategiaPago.js';

/**
 * Contexto del patrón Strategy. No sabe cómo se cobra con cada medio: delega
 * en la estrategia establecida. Se crea uno por cada pago, para que dos
 * pagos simultáneos nunca compartan la estrategia.
 */
export class ProcesadorDePagos {
  #estrategia = null;

  constructor({ db, pagoRepositorio }) {
    this.db = db;
    this.pagos = pagoRepositorio;
  }

  establecerEstrategia(estrategia) {
    if (!(estrategia instanceof EstrategiaPago)) throw new TypeError('La estrategia debe implementar EstrategiaPago');
    this.#estrategia = estrategia;
  }

  /**
   * Registra el pago en PENDIENTE y cobra con la estrategia.
   * Si ya existe un pago con la misma referencia (un reintento), no cobra otra
   * vez: devuelve ese pago con `repetido: true` (RNF05).
   * `antesDeCobrar(cliente)` corre en la misma transacción que registra el pago,
   * para verificar (con la reserva bloqueada) que todavía se puede cobrar.
   */
  async ejecutarPago(pago, { cliente = null, antesDeCobrar = null } = {}) {
    if (!this.#estrategia) throw new Error('Primero se debe establecer la estrategia de pago');
    const previo = await this.#verificarIdempotencia(pago.referencia, cliente);
    if (previo) return { pago: previo, repetido: true };
    const registrado = await this.db.transaccion(async (tx) => {
      if (antesDeCobrar) await antesDeCobrar(tx);
      return this.pagos.crearPendiente(pago, tx);
    }, cliente);
    const resultado = await this.#estrategia.procesarTransaccion({
      referencia: registrado.referencia_transaccion,
      monto: registrado.monto,
      datos: pago.datos,
    });
    return { pago: registrado, resultado, repetido: false };
  }

  /** ¿Ya se procesó un pago con esta referencia? */
  async #verificarIdempotencia(referencia, cliente) {
    return this.pagos.buscarPorReferencia(referencia, cliente);
  }
}
