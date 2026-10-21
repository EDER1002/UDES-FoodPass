import { z } from 'zod';
import { estadoActivo, fechaIso, horaIso, idPositivo, textoOpcional } from '../../compartido/validacion.js';

const porciones = z.coerce
  .number({ error: 'Las porciones deben ser un número' })
  .int({ error: 'Las porciones deben ser un número entero' })
  .min(0, { error: 'Las porciones no pueden ser negativas' })
  .max(5000, { error: 'Máximo 5000 porciones' });

const sinRepetidos = (lista, clave) => new Set(lista.map((x) => x[clave])).size === lista.length;

const camposMenu = z.object({
  estado: z.enum(['BORRADOR', 'PUBLICADO', 'CERRADO'], { error: 'El estado debe ser BORRADOR, PUBLICADO o CERRADO' }).default('BORRADOR'),
  horaInicioReserva: horaIso,
  horaFinReserva: horaIso,
  cantidadDisponible: porciones,
  // `cantidadVista`: lo que el administrador vio al abrir el menú. Si llega, el
  // servidor aplica solo su cambio y respeta las porciones vendidas mientras tanto.
  cantidadDisponibleVista: porciones.optional(),
  proteinas: z
    .array(z.object({ idProteina: idPositivo('La proteína'), cantidadDisponible: porciones, cantidadVista: porciones.optional() }))
    .max(30)
    .default([]),
  acompanamientos: z
    .array(z.object({ idAcompanamiento: idPositivo('El acompañamiento'), cantidadDisponible: porciones, cantidadVista: porciones.optional() }))
    .max(30)
    .default([]),
});

const reglasMenu = (esquema) =>
  esquema
    .refine((m) => m.horaInicioReserva < m.horaFinReserva, { error: 'La hora de inicio debe ser antes de la hora de cierre', path: ['horaFinReserva'] })
    .refine((m) => sinRepetidos(m.proteinas, 'idProteina'), { error: 'Hay una proteína repetida en el menú', path: ['proteinas'] })
    .refine((m) => sinRepetidos(m.acompanamientos, 'idAcompanamiento'), { error: 'Hay un acompañamiento repetido en el menú', path: ['acompanamientos'] })
    .refine((m) => m.estado !== 'PUBLICADO' || (m.proteinas.length > 0 && m.acompanamientos.length > 0), {
      error: 'Para publicar el menú agrega al menos una proteína y un acompañamiento',
      path: ['estado'],
    });

export const esquemaCrearMenu = reglasMenu(camposMenu.extend({ fecha: fechaIso }));
export const esquemaActualizarMenu = reglasMenu(camposMenu);

export const esquemaFecha = z.object({ fecha: fechaIso });

const nombre = z.string({ error: 'El nombre es obligatorio' }).trim().min(2, { error: 'El nombre debe tener al menos 2 caracteres' }).max(80, { error: 'Máximo 80 caracteres' });

const imagenUrl = textoOpcional(300).refine((u) => !u || (u.startsWith('/') && !u.startsWith('//')) || /^https?:\/\//.test(u), {
  error: 'La imagen debe ser una ruta (/platos/...) o una dirección http(s)',
});

export const esquemaProteina = z.object({
  nombre,
  descripcion: textoOpcional(200),
  cantidadDisponible: porciones.default(0),
  estado: estadoActivo.default('ACTIVO'),
  imagenUrl,
});

export const esquemaAcompanamiento = z.object({
  nombre,
  descripcion: textoOpcional(200),
  estado: estadoActivo.default('ACTIVO'),
  imagenUrl,
});

export const esquemaTipoAlmuerzo = z.object({
  nombre: nombre.max(60, { error: 'Máximo 60 caracteres' }),
  descripcion: textoOpcional(200),
  precio: z.coerce.number({ error: 'El precio debe ser un número' }).int({ error: 'El precio debe ser en pesos, sin centavos' })
    .min(100, { error: 'El precio mínimo es $100' }).max(1_000_000, { error: 'El precio es demasiado alto' }),
  tipoServicio: textoOpcional(60),
  maxAcompanamientos: z.coerce.number({ error: 'El máximo de acompañamientos debe ser un número' }).int()
    .min(1, { error: 'Debe permitir al menos 1 acompañamiento' }).max(5, { error: 'Máximo 5 acompañamientos' }),
});

export const esquemaId = z.object({ id: idPositivo('El identificador') });
