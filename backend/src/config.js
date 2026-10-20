import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string({ error: 'Falta DATABASE_URL' }).min(1, { error: 'Falta DATABASE_URL' }),
  JWT_SECRETO: z.string({ error: 'Falta JWT_SECRETO' }).min(32, { error: 'JWT_SECRETO debe tener al menos 32 caracteres' }),
  JWT_EXPIRACION: z.string().default('8h'),
  BCRYPT_RONDAS: z.coerce.number().int().min(4).max(15).default(10),
  CORS_ORIGEN: z.string().default('http://localhost:5173'),
  PASARELA_MODO: z.enum(['sandbox'], { error: 'Por ahora solo existe la pasarela sandbox' }).default('sandbox'),
  WEBHOOK_SECRETO: z.string({ error: 'Falta WEBHOOK_SECRETO' }).min(16, { error: 'WEBHOOK_SECRETO debe tener al menos 16 caracteres' }),
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
    pasarela: { modo: config.PASARELA_MODO, secretoWebhook: config.WEBHOOK_SECRETO },
  };
}
