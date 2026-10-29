import { z } from 'zod';

export const esquemaMensajeAsistente = z.object({
  mensaje: z
    .string({ error: 'Escribe tu pregunta' })
    .trim()
    .min(1, { error: 'Escribe tu pregunta' })
    .max(300, { error: 'La pregunta puede tener máximo 300 caracteres' }),
});
