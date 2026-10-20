import { validar } from '../../../compartido/validacion.js';

/**
 * Interfaz del patrón Strategy para los medios de pago.
 * Cada medio (PagoPSE, PagoTarjeta, PagoNequi) la implementa. Agregar un medio
 * nuevo es crear otra clase y registrarla en estrategias/index.js, sin tocar las demás.
 */
export class EstrategiaPago {
  /** Código guardado en pago.metodo_pago (PSE, TARJETA, NEQUI). */
  get metodo() {
    throw new Error('Cada estrategia debe definir su método');
  }

  /** Esquema zod con los datos que el usuario ingresa para este medio (RF09). */
  get esquemaDatos() {
    throw new Error('Cada estrategia debe definir sus datos');
  }

  /** Valida los datos del pago antes de registrar nada. */
  validarDatos(datos) {
    return validar(this.esquemaDatos, datos ?? {});
  }

  /**
   * Envía la transacción a la pasarela y devuelve
   * { estado: 'APROBADO' | 'RECHAZADO' | 'PENDIENTE', motivo?, idTransaccion? }.
   * @param {{ referencia: string, monto: number, datos: object }} pago
   */
  // eslint-disable-next-line no-unused-vars
  async procesarTransaccion(pago) {
    throw new Error('Cada estrategia debe implementar procesarTransaccion()');
  }
}
