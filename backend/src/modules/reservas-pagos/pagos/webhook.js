import crypto from 'node:crypto';
import { z } from 'zod';
import { ErrorAplicacion } from '../../../compartido/errores.js';

export const CABECERA_FIRMA = 'x-foodpass-firma';

/** Firma HMAC-SHA256 del cuerpo exacto de la petición: "sha256=<hex>". */
export function firmar(cuerpo, secreto) {
  return `sha256=${crypto.createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;
}

/** Compara la firma recibida en tiempo constante. Lanza 401 si no coincide. */
export function verificarFirma(cuerpoCrudo, firmaRecibida, secreto) {
  const esperada = Buffer.from(firmar(cuerpoCrudo ?? Buffer.alloc(0), secreto));
  const recibida = Buffer.from(String(firmaRecibida ?? ''));
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) {
    throw new ErrorAplicacion('FIRMA_INVALIDA', 'La firma del webhook no es válida.', 401);
  }
}

/** Notificación genérica de la pasarela; un adaptador real traduciría su formato a este. */
export const esquemaWebhook = z.object({
  referencia: z.string({ error: 'Falta la referencia' }).min(5).max(80),
  estado: z.enum(['APROBADO', 'RECHAZADO'], { error: 'El estado debe ser APROBADO o RECHAZADO' }),
  idTransaccion: z.string().max(80).optional(),
});
