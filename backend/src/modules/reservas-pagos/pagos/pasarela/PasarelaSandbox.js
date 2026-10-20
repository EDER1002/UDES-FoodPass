import crypto from 'node:crypto';

/**
 * Adaptador SIMULADO (sandbox) de la pasarela de pagos. No mueve dinero real.
 * Imita el comportamiento de una pasarela como Wompi o ePayco con datos de
 * prueba fijos, para poder probar aprobaciones, rechazos y pagos pendientes.
 * Cuando exista un proveedor real, se crea otro adaptador con los mismos
 * métodos (cobrar, bancosPse) y se conecta en app.js.
 */
export const DATOS_DE_PRUEBA = Object.freeze({
  tarjetaAprobada: '4242424242424242',
  tarjetaRechazada: '4111111111111111',
  nequiRechazado: '3992222222',
  bancosPse: Object.freeze([
    Object.freeze({ codigo: '1', nombre: 'Banco de pruebas: aprueba el pago' }),
    Object.freeze({ codigo: '2', nombre: 'Banco de pruebas: rechaza el pago' }),
    Object.freeze({ codigo: '3', nombre: 'Banco de pruebas: respuesta pendiente (llega por webhook)' }),
  ]),
});

export class PasarelaSandbox {
  constructor({ demoraMs = 0 } = {}) {
    this.demoraMs = demoraMs;
    this.cobros = 0; // cuántas veces se llamó a cobrar (lo usan las pruebas de idempotencia)
  }

  bancosPse() {
    return DATOS_DE_PRUEBA.bancosPse;
  }

  async cobrar({ metodo, referencia, monto, datos }) {
    this.cobros += 1;
    if (this.demoraMs) await new Promise((r) => setTimeout(r, this.demoraMs));
    const idTransaccion = `SBX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const respuesta = (estado, motivo = null) => ({ estado, motivo, idTransaccion, referencia, monto });

    switch (metodo) {
      case 'NEQUI':
        return datos.telefono === DATOS_DE_PRUEBA.nequiRechazado
          ? respuesta('RECHAZADO', 'Fondos insuficientes en la cuenta Nequi.')
          : respuesta('APROBADO');
      case 'TARJETA':
        if (datos.numero === DATOS_DE_PRUEBA.tarjetaAprobada) return respuesta('APROBADO');
        if (datos.numero === DATOS_DE_PRUEBA.tarjetaRechazada) return respuesta('RECHAZADO', 'La tarjeta no tiene fondos suficientes.');
        return respuesta('RECHAZADO', 'En el entorno de pruebas usa la tarjeta 4242 4242 4242 4242.');
      case 'PSE':
        if (datos.banco === '1') return respuesta('APROBADO');
        if (datos.banco === '2') return respuesta('RECHAZADO', 'El banco rechazó la transacción.');
        return respuesta('PENDIENTE', 'El banco está procesando el pago.');
      default:
        return respuesta('RECHAZADO', 'Medio de pago no soportado por la pasarela.');
    }
  }
}
