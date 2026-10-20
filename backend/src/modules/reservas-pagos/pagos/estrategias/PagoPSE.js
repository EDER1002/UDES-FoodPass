import { z } from 'zod';
import { EstrategiaPago } from '../EstrategiaPago.js';

export class PagoPSE extends EstrategiaPago {
  constructor({ pasarela }) {
    super();
    this.pasarela = pasarela;
  }

  get metodo() {
    return 'PSE';
  }

  get esquemaDatos() {
    const bancos = this.pasarela.bancosPse().map((b) => b.codigo);
    return z.object({
      banco: z.string({ error: 'Elige tu banco' }).refine((b) => bancos.includes(b), { error: 'Elige un banco de la lista' }),
      tipoPersona: z.enum(['NATURAL', 'JURIDICA'], { error: 'Elige si eres persona natural o jurídica' }),
      documento: z
        .string({ error: 'Escribe el documento del titular de la cuenta' })
        .transform((d) => d.replace(/[\s.-]/g, ''))
        .pipe(z.string().regex(/^\d{5,15}$/, { error: 'El documento debe tener entre 5 y 15 dígitos' })),
    });
  }

  async procesarTransaccion({ referencia, monto, datos }) {
    return this.pasarela.cobrar({ metodo: this.metodo, referencia, monto, datos });
  }
}
