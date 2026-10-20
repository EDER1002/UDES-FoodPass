import { defineConfig } from 'vitest/config';

// Lee DATABASE_URL_TEST del archivo .env de la raíz (si existe).
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // Sin .env: se usan las variables del entorno (por ejemplo, en CI).
}

export default defineConfig({
  test: {
    environment: 'node',
    // Todas las pruebas comparten una base de datos de pruebas: se ejecutan de a un archivo.
    fileParallelism: false,
    globalSetup: ['./tests/preparar-base.js'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      JWT_SECRETO: 'secreto-solo-para-las-pruebas-automaticas-0123456789',
      JWT_EXPIRACION: '1h',
      WEBHOOK_SECRETO: 'webhook-solo-para-las-pruebas-0123',
      BCRYPT_RONDAS: '4',
      CORS_ORIGEN: 'http://localhost:5173',
      PASARELA_MODO: 'sandbox',
    },
  },
});
