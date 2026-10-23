import { z } from 'zod';
import { EstrategiaPago } from '../EstrategiaPago.js';

export class PagoNequi extends EstrategiaPago {
  constructor({ pasarela }) {
    super();
    this.pasarela = pasarela;
  }

  get metodo() {
    return 'NEQUI';
  }

  get esquemaDatos() {
    return z.object({
      telefono: z
        .string({ error: 'Escribe el número de celular de tu cuenta Nequi' })
        .transform((t) => t.replace(/[\s-]/g, ''))
        .pipe(z.string().regex(/^3\d{9}$/, { error: 'El celular Nequi debe tener 10 dígitos y empezar por 3' })),
    });
  }

  async procesarTransaccion({ referencia, monto, datos, pagador }) {
    return this.pasarela.cobrar({ metodo: this.metodo, referencia, monto, datos: { telefono: datos.telefono }, pagador });
  }
}
