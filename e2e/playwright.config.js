import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// La prueba firma el webhook con WEBHOOK_SECRETO, igual que la pasarela.
const archivoEnv = new URL('../.env', import.meta.url);
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);

// Prueba completa en el navegador: npm run prueba:navegador
// Arranca su propia API (puerto 3100, base de pruebas, reloj fijo) y su propia
// interfaz (puerto 5174), así que no choca con "npm run dev".
const API = 'http://127.0.0.1:3100';
const WEB = 'http://localhost:5174';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1, // Todas las pruebas comparten la misma base de datos
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  outputDir: '../test-results',
  use: {
    baseURL: WEB,
    ...devices['Pixel 7'],
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Para usar el Chromium del sistema (por ejemplo en Arch Linux): NAVEGADOR_RUTA=/usr/bin/chromium
    launchOptions: process.env.NAVEGADOR_RUTA ? { executablePath: process.env.NAVEGADOR_RUTA } : {},
  },
  webServer: [
    {
      command: 'node --env-file-if-exists=.env e2e/servidor-e2e.mjs',
      cwd: '..',
      url: `${API}/api/salud`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w frontend -- --port 5174 --strictPort',
      cwd: '..',
      url: WEB,
      env: { API_DESTINO: API },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
