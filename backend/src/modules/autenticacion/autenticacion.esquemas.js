import { z } from 'zod';

export const esquemaLogin = z.object({
  correo: z
    .string({ error: 'Escribe tu correo institucional' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'El correo no es válido' }))
    .refine((c) => c.endsWith('@udes.edu.co'), { error: 'Usa tu correo institucional @udes.edu.co' }),
  contrasena: z
    .string({ error: 'Escribe tu contraseña' })
    .min(1, { error: 'Escribe tu contraseña' })
    .max(100, { error: 'La contraseña es demasiado larga' }),
});

export const esquemaBusquedaUsuarios = z.object({
  buscar: z.string({ error: 'Escribe un nombre, correo o documento' }).trim().min(2, { error: 'Escribe al menos 2 caracteres' }).max(60),
});
