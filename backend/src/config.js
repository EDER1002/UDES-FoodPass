import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string({ error: 'Falta DATABASE_URL' }).min(1, { error: 'Falta DATABASE_URL' }),
  JWT_SECRETO: z.string({ error: 'Falta JWT_SECRETO' }).min(32, { error: 'JWT_SECRETO debe tener al menos 32 caracteres' }),
  JWT_EXPIRACION: z.string().default('8h'),
  BCRYPT_RONDAS: z.coerce.number().int().min(4).max(15).default(10),
  CORS_ORIGEN: z.string().default('http://localhost:5173'),
  PASARELA_MODO: z.enum(['sandbox', 'wompi'], { error: 'PASARELA_MODO debe ser sandbox o wompi' }).default('sandbox'),
  WEBHOOK_SECRETO: z.string({ error: 'Falta WEBHOOK_SECRETO' }).min(16, { error: 'WEBHOOK_SECRETO debe tener al menos 16 caracteres' }),
  // Solo con PASARELA_MODO=wompi (ver docs/pasarela-de-pago.md)
  WOMPI_AMBIENTE: z.enum(['sandbox', 'produccion'], { error: 'WOMPI_AMBIENTE debe ser sandbox o produccion' }).default('sandbox'),
  WOMPI_LLAVE_PUBLICA: z.string().optional(),
  WOMPI_LLAVE_PRIVADA: z.string().optional(),
  WOMPI_SECRETO_INTEGRIDAD: z.string().optional(),
  WOMPI_SECRETO_EVENTOS: z.string().optional(),
  WOMPI_URL_RETORNO: z.url({ error: 'WOMPI_URL_RETORNO debe ser una dirección web completa' }).optional(),
  // Correo para la recuperación de contraseña (opcional, ver .env.example)
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PUERTO: z.coerce.number().int().positive().default(587),
  SMTP_USUARIO: z.string().trim().optional(),
  SMTP_CLAVE: z.string().optional(),
  SMTP_REMITENTE: z.string().trim().optional(),
}).superRefine((c, ctx) => {
  if (c.PASARELA_MODO !== 'wompi') return;
  const prefijo = c.WOMPI_AMBIENTE === 'sandbox' ? 'test' : 'prod';
  const exigir = (campo, inicio) => {
    const valor = c[campo];
    if (!valor) ctx.addIssue({ code: 'custom', path: [campo], message: `Falta ${campo} (la encuentras en el panel de Wompi)` });
    else if (inicio && !valor.startsWith(`${inicio}_${prefijo}_`)) {
      ctx.addIssue({ code: 'custom', path: [campo], message: `${campo} debe empezar por ${inicio}_${prefijo}_ en el ambiente ${c.WOMPI_AMBIENTE}` });
    }
  };
  exigir('WOMPI_LLAVE_PUBLICA', 'pub');
  exigir('WOMPI_LLAVE_PRIVADA', 'prv');
  exigir('WOMPI_SECRETO_INTEGRIDAD');
  exigir('WOMPI_SECRETO_EVENTOS');
}).superRefine((c, ctx) => {
  if (c.SMTP_HOST && (!c.SMTP_USUARIO || !c.SMTP_CLAVE)) {
    ctx.addIssue({ code: 'custom', path: ['SMTP_USUARIO'], message: 'Con SMTP_HOST también debes llenar SMTP_USUARIO y SMTP_CLAVE' });
  }
});

/**
 * Lee y valida las variables de entorno. Falla al arrancar, con un mensaje
 * claro, si falta alguna obligatoria (ver .env.example).
 */
export function cargarConfig(entorno = process.env) {
  const resultado = esquema.safeParse(entorno);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida (revisa tu archivo .env):\n${problemas}`);
  }
  const config = resultado.data;
  if (config.NODE_ENV === 'production' && /cambia_esto/.test(config.JWT_SECRETO + config.WEBHOOK_SECRETO)) {
    throw new Error('En producción debes cambiar JWT_SECRETO y WEBHOOK_SECRETO.');
  }
  return {
    entorno: config.NODE_ENV,
    puerto: config.PORT,
    urlBaseDeDatos: config.DATABASE_URL,
    jwt: { secreto: config.JWT_SECRETO, expiracion: config.JWT_EXPIRACION },
    bcryptRondas: config.BCRYPT_RONDAS,
    origenesCors: config.CORS_ORIGEN.split(',').map((o) => o.trim()).filter(Boolean),
    pasarela: {
      modo: config.PASARELA_MODO,
      secretoWebhook: config.WEBHOOK_SECRETO,
      wompi:
        config.PASARELA_MODO === 'wompi'
          ? {
              ambiente: config.WOMPI_AMBIENTE,
              llavePublica: config.WOMPI_LLAVE_PUBLICA,
              llavePrivada: config.WOMPI_LLAVE_PRIVADA,
              secretoIntegridad: config.WOMPI_SECRETO_INTEGRIDAD,
              secretoEventos: config.WOMPI_SECRETO_EVENTOS,
              // A esta página vuelve la persona después de pagar en su banco (PSE).
              urlRetorno: config.WOMPI_URL_RETORNO ?? `${config.CORS_ORIGEN.split(',')[0].trim()}/pagos`,
            }
          : null,
    },
    correo: config.SMTP_HOST
      ? {
          host: config.SMTP_HOST,
          puerto: config.SMTP_PUERTO,
          usuario: config.SMTP_USUARIO,
          clave: config.SMTP_CLAVE,
          remitente: config.SMTP_REMITENTE || `UDES FoodPass <${config.SMTP_USUARIO}>`,
        }
      : null,
  };
}
