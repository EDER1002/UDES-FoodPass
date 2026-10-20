import { z } from 'zod';
import { EstrategiaPago } from '../EstrategiaPago.js';

/** Algoritmo de Luhn: detecta números de tarjeta mal escritos. */
export function pasaLuhn(numero) {
  let suma = 0;
  for (let i = 0; i < numero.length; i++) {
    let digito = Number(numero[numero.length - 1 - i]);
    if (i % 2 === 1) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    suma += digito;
  }
  return suma % 10 === 0;
}

/** El número de tarjeta solo viaja hasta la pasarela: nunca se guarda ni se registra en logs. */
export class PagoTarjeta extends EstrategiaPago {
  constructor({ pasarela, reloj }) {
    super();
    this.pasarela = pasarela;
    this.reloj = reloj;
  }

  get metodo() {
    return 'TARJETA';
  }

  get esquemaDatos() {
    return z.object({
      numero: z
        .string({ error: 'Escribe el número de la tarjeta' })
        .transform((n) => n.replace(/[\s-]/g, ''))
        .pipe(z.string().regex(/^\d{13,19}$/, { error: 'El número de tarjeta debe tener entre 13 y 19 dígitos' }))
        .refine(pasaLuhn, { error: 'El número de tarjeta no es válido. Revísalo.' }),
      titular: z.string({ error: 'Escribe el nombre que aparece en la tarjeta' }).trim().min(3, { error: 'Escribe el nombre que aparece en la tarjeta' }).max(80),
      vencimiento: z
        .string({ error: 'Escribe la fecha de vencimiento (MM/AA)' })
        .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, { error: 'La fecha de vencimiento debe tener el formato MM/AA' })
        .refine((v) => !this.#vencida(v), { error: 'La tarjeta está vencida' }),
      cvc: z.string({ error: 'Escribe el código de seguridad' }).regex(/^\d{3,4}$/, { error: 'El código de seguridad tiene 3 o 4 dígitos' }),
      cuotas: z.coerce.number().int().min(1).max(36).default(1),
    });
  }

  async procesarTransaccion({ referencia, monto, datos }) {
    return this.pasarela.cobrar({ metodo: this.metodo, referencia, monto, datos });
  }

  #vencida(vencimiento) {
    const [mes, anio] = vencimiento.split('/').map(Number);
    const [anioActual, mesActual] = this.reloj.hoy().split('-').map(Number);
    return 2000 + anio < anioActual || (2000 + anio === anioActual && mes < mesActual);
  }
}
