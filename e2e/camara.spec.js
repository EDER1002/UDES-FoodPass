// Validación con la cámara: Chromium usa como "cámara" un video falso que
// muestra el QR del ficho, y el escáner del administrador debe leerlo solo.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import QRCode from 'qrcode';
import { USUARIOS, expect, iniciarSesion, ordenar, test } from './ayudantes.js';

/** Video .y4m (formato sin comprimir que entiende Chromium) con el QR en el centro. */
function videoConQr(texto, archivo) {
  const ancho = 640;
  const alto = 480;
  const { modules } = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  const escala = 8;
  const lado = (modules.size + 8) * escala; // con margen blanco de 4 módulos
  const x0 = (ancho - lado) / 2;
  const y0 = (alto - lado) / 2;
  const luz = Buffer.alloc(ancho * alto, 235);
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (!modules.get(y, x)) continue;
      for (let dy = 0; dy < escala; dy++) {
        const fila = (y0 + (y + 4) * escala + dy) * ancho;
        luz.fill(16, fila + x0 + (x + 4) * escala, fila + x0 + (x + 5) * escala);
      }
    }
  }
  const color = Buffer.alloc((ancho / 2) * (alto / 2) * 2, 128);
  const cuadro = Buffer.concat([Buffer.from('FRAME\n'), luz, color]);
  const cabecera = Buffer.from(`YUV4MPEG2 W${ancho} H${alto} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(archivo, Buffer.concat([cabecera, ...Array(10).fill(cuadro)]));
}

test('el escáner lee el QR con la cámara y muestra el pedido', async ({ page }, info) => {
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await page.getByRole('radio', { name: 'Nequi', exact: true }).check();
  await page.getByLabel('Número de celular Nequi').fill('3001234567');
  await page.getByRole('button', { name: 'Confirmar Pago' }).click();
  await expect(page.getByText('Token Único:')).toBeVisible();
  const token = (await page.locator('.token-figma b').innerText()).trim();

  // Chromium no abre el video si la ruta tiene tildes (como la carpeta de resultados): va a la carpeta temporal.
  const carpeta = mkdtempSync(path.join(tmpdir(), 'foodpass-camara-'));
  const video = path.join(carpeta, 'qr.y4m');
  videoConQr(token, video);
  const navegador = await chromium.launch({
    executablePath: process.env.NAVEGADOR_RUTA,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  });
  try {
    const contexto = await navegador.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 412, height: 915 }, permissions: ['camera'] });
    const admin = await contexto.newPage();
    await admin.clock.setFixedTime(new Date('2026-10-19T09:10:00-05:00'));
    await iniciarSesion(admin, USUARIOS.admin);
    await admin.goto('/admin/validar');
    await admin.getByRole('button', { name: 'Activar cámara' }).click();
    await expect(admin.getByText('Ficho válido')).toBeVisible({ timeout: 20_000 });
    await expect(admin.getByRole('region', { name: 'Pedido' })).toContainText('Laura Gómez');
    await admin.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(admin.getByRole('heading', { name: 'Entrega registrada' })).toBeVisible();
  } finally {
    await navegador.close();
    rmSync(carpeta, { recursive: true, force: true });
  }

  // El estudiante ve su ficho como usado
  await page.reload();
  await expect(page.getByText(/Entregado hoy a las/)).toBeVisible();
});
