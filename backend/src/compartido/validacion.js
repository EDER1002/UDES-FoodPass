import { z } from 'zod';
import { ErrorAplicacion } from './errores.js';

/**
 * Valida `datos` con un esquema de zod. Si no cumple, lanza un error 400 con
 * el detalle de cada campo, en español.
 */
export function validar(esquema, datos) {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return resultado.data;
  const campos = resultado.error.issues.map((i) => ({ campo: i.path.join('.') || '(cuerpo)', mensaje: i.message }));
  throw new ErrorAplicacion('DATOS_INVALIDOS', campos[0]?.mensaje ?? 'Revisa los datos enviados.', 400, { campos });
}

// Piezas reutilizables por los esquemas de los módulos
export const idPositivo = (campo) =>
  z.coerce.number({ error: `${campo} no es válido` }).int({ error: `${campo} no es válido` }).positive({ error: `${campo} no es válido` });

export const fechaIso = z
  .string({ error: 'La fecha es obligatoria' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'La fecha debe tener el formato AAAA-MM-DD' })
  .refine((f) => !Number.isNaN(Date.parse(`${f}T00:00:00Z`)) && new Date(`${f}T00:00:00Z`).toISOString().startsWith(f), {
    error: 'La fecha no existe',
  });

/** Acepta '06:00' o '06:00:00' y devuelve siempre 'HH:MM:SS'. */
export const horaIso = z
  .string({ error: 'La hora es obligatoria' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { error: 'La hora debe tener el formato HH:MM' })
  .transform((h) => (h.length === 5 ? `${h}:00` : h));

export const estadoActivo = z.enum(['ACTIVO', 'INACTIVO'], { error: 'El estado debe ser ACTIVO o INACTIVO' });

export const textoOpcional = (max) =>
  z
    .string()
    .trim()
    .max(max, { error: `Máximo ${max} caracteres` })
    .optional()
    .nullable()
    .transform((t) => (t ? t : null));
