import { z } from 'zod';
import { estadoActivo, fechaIso, horaIso, idPositivo } from '../../compartido/validacion.js';

export const esquemaPedido = z.object({
  idTipoAlmuerzo: idPositivo('El tipo de almuerzo'),
  idProteina: idPositivo('La proteína'),
  idsAcompanamiento: z
    .array(idPositivo('El acompañamiento'), { error: 'Elige al menos un acompañamiento' })
    .min(1, { error: 'Elige al menos un acompañamiento' })
    .max(5, { error: 'Elegiste demasiados acompañamientos' }),
});

export const esquemaPago = z.object({
  metodo: z.enum(['NEQUI', 'PSE', 'TARJETA'], { error: 'Elige un medio de pago: Nequi, PSE o tarjeta' }),
  datos: z.record(z.string(), z.unknown(), { error: 'Faltan los datos del pago' }).default({}),
});

// El frontend genera una clave por intento de pago; un reintento envía la misma.
export const esquemaClaveIdempotencia = z
  .string({ error: 'Falta el encabezado Idempotency-Key' })
  .regex(/^[A-Za-z0-9_-]{8,100}$/, { error: 'El encabezado Idempotency-Key no es válido' });

export const esquemaIdReserva = z.object({ id: idPositivo('La reserva') });

export const esquemaConfiguracion = z
  .object({
    idConfiguracion: idPositivo('El horario').optional(),
    idRol: idPositivo('El rol').optional().nullable(),
    idUsuario: idPositivo('El usuario').optional().nullable(),
    horaInicio: horaIso,
    horaFin: horaIso,
    fechaInicioVigencia: fechaIso,
    fechaFinVigencia: fechaIso.optional().nullable(),
    estado: estadoActivo.default('ACTIVO'),
  })
  .transform((c) => ({ ...c, idRol: c.idRol ?? null, idUsuario: c.idUsuario ?? null, fechaFinVigencia: c.fechaFinVigencia ?? null }))
  .refine((c) => (c.idRol === null) !== (c.idUsuario === null), {
    error: 'Un horario aplica a un rol o a un usuario, nunca a ambos',
    path: ['idRol'],
  })
  .refine((c) => c.horaInicio < c.horaFin, { error: 'La hora de inicio debe ser antes de la hora de cierre', path: ['horaFin'] })
  .refine((c) => !c.fechaFinVigencia || c.fechaInicioVigencia <= c.fechaFinVigencia, {
    error: 'La vigencia termina antes de empezar',
    path: ['fechaFinVigencia'],
  });
