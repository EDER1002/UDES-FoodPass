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
/** Id entero positivo dentro del rango de INTEGER; acepta el número o sus dígitos (para la URL). */
export const idPositivo = (campo) =>
  z.preprocess(
    (v) => (typeof v === 'string' && /^\d{1,10}$/.test(v) ? Number(v) : v),
    z
      .number({ error: `${campo} no es válido` })
      .int({ error: `${campo} no es válido` })
      .positive({ error: `${campo} no es válido` })
      .max(2_147_483_647, { error: `${campo} no es válido` }),
  );

export const fechaIso = z
  .string({ error: 'La fecha es obligatoria' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'La fecha debe tener el formato AAAA-MM-DD' })
  .refine((f) => !Number.isNaN(Date.parse(`${f}T00:00:00Z`)) && new Date(`${f}T00:00:00Z`).toISOString().startsWith(f), {
    error: 'La fecha no existe',
  })
  .refine((f) => f >= '2000-01-01' && f <= '2100-12-31', { error: 'La fecha debe estar entre los años 2000 y 2100' });

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
