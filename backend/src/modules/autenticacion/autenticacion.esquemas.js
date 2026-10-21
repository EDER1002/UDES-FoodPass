import { z } from 'zod';
import { fechaIso } from '../../compartido/validacion.js';
import { ROLES } from '../../compartido/roles.js';

const correoInstitucional = z
  .string({ error: 'Escribe tu correo institucional' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'El correo no es válido' }))
  .refine((c) => c.endsWith('@udes.edu.co'), { error: 'Usa tu correo institucional @udes.edu.co' });

const nombrePropio = (campo) =>
  z
    .string({ error: `Escribe tu ${campo}` })
    .trim()
    .min(2, { error: `Escribe tu ${campo}` })
    .max(80, { error: `El ${campo} es demasiado largo` })
    .regex(/^[\p{L}' .-]+$/u, { error: `El ${campo} solo puede tener letras` });

export const esquemaLogin = z.object({
  correo: correoInstitucional,
  contrasena: z
    .string({ error: 'Escribe tu contraseña' })
    .min(1, { error: 'Escribe tu contraseña' })
    .max(100, { error: 'La contraseña es demasiado larga' }),
});

export const esquemaBusquedaUsuarios = z.object({
  buscar: z.string({ error: 'Escribe un nombre, correo o documento' }).trim().min(2, { error: 'Escribe al menos 2 caracteres' }).max(60),
});

export const esquemaRegistro = z.object({
  nombre: nombrePropio('nombre'),
  apellido: nombrePropio('apellido'),
  documento: z
    .string({ error: 'Escribe tu número de documento' })
    .trim()
    .regex(/^\d{6,15}$/, { error: 'El documento debe tener entre 6 y 15 dígitos, sin puntos' }),
  correo: correoInstitucional,
  telefono: z
    .string()
    .trim()
    .regex(/^3\d{9}$/, { error: 'El celular debe tener 10 dígitos y empezar por 3' })
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // bcrypt solo usa los primeros 72 bytes.
  contrasena: z
    .string({ error: 'Crea una contraseña' })
    .min(8, { error: 'La contraseña debe tener al menos 8 caracteres' })
    .max(72, { error: 'La contraseña puede tener máximo 72 caracteres' })
    .refine((c) => /\p{L}/u.test(c) && /\d/.test(c), { error: 'La contraseña debe tener letras y números' }),
  rol: z.enum(Object.values(ROLES), { error: 'Elige tu rol' }),
});

export const esquemaAprobacion = z
  .object({
    fechaInicioVigencia: fechaIso.optional(),
    fechaFinVigencia: fechaIso.optional(),
  })
  .refine((d) => !d.fechaInicioVigencia || !d.fechaFinVigencia || d.fechaInicioVigencia <= d.fechaFinVigencia, {
    error: 'La fecha final del subsidio no puede ser anterior a la inicial',
    path: ['fechaFinVigencia'],
  });

export const esquemaRechazo = z.object({
  motivo: z
    .string({ error: 'Escribe el motivo del rechazo' })
    .trim()
    .min(5, { error: 'Escribe el motivo del rechazo (mínimo 5 caracteres)' })
    .max(200, { error: 'El motivo puede tener máximo 200 caracteres' }),
});
