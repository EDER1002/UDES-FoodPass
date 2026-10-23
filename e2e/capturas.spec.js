// Mockups de docs/diseno/mockups tomados de la aplicación real, que sigue el
// prototipo de Figma. Solo corre con: npm run diseno:capturas
// (la prueba normal, npm run prueba:navegador, lo salta).
import { mkdirSync } from 'node:fs';
import { USUARIOS, agotarProteina, expect, iniciarSesion, moverReloj, ordenar, test } from './ayudantes.js';

const DESTINO = process.env.CAPTURAS_DESTINO ?? new URL('../docs/diseno/mockups/', import.meta.url).pathname;
test.skip(!process.env.CAPTURAS, 'Solo con npm run diseno:capturas');

// Mismo tamaño que los marcos del prototipo de Figma (402 × 874).
const CELULAR = { width: 402, height: 874 };
const ESCRITORIO = { width: 1280, height: 860 };
test.use({ viewport: CELULAR, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

async function foto(page, nombre, { completa = false } = {}) {
  mkdirSync(DESTINO, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300); // animaciones
  await page.screenshot({ path: `${DESTINO}${nombre}.png`, fullPage: completa });
}

async function pagarConNequi(page, telefono = '3001234567') {
  await page.getByRole('radio', { name: 'Nequi', exact: true }).check();
  await page.getByLabel('Número de celular Nequi').fill(telefono);
  await page.getByRole('button', { name: 'Confirmar Pago' }).click();
}

async function llenarTarjeta(page, numero) {
  await page.getByRole('radio', { name: 'Tarjeta', exact: true }).check();
  await page.getByLabel('Número de la tarjeta').fill(numero);
  await page.getByLabel('Nombre en la tarjeta').fill('Laura Gómez');
  await page.getByLabel('Vence (MM/AA)').fill('1230');
  await page.getByLabel('Código (CVC)').fill('123');
}

test('usuario: cuenta, menú, pago y ficho', async ({ page }) => {
  await page.goto('/registro');
  await expect(page.getByRole('heading', { name: 'Crear Cuenta' })).toBeVisible();
  await foto(page, '00-crear-cuenta');

  await page.goto('/ingresar');
  await foto(page, '01-inicio-sesion');
  await iniciarSesion(page, USUARIOS.regular, 'otraClave123');
  await expect(page.getByRole('alert')).toBeVisible();
  await foto(page, '01-inicio-sesion-error');

  await iniciarSesion(page, USUARIOS.regular);
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
  await foto(page, '02-menu-del-dia');
  await page.getByRole('radio', { name: /Almuerzo completo/ }).check();
  await page.getByRole('radio', { name: /Carne en bistec/ }).check();
  await page.getByRole('checkbox', { name: /Arroz blanco/ }).check();
  await page.getByRole('checkbox', { name: /Frijoles/ }).check();
  await foto(page, '02-menu-del-dia-acompanamientos', { completa: true });

  await page.getByRole('button', { name: 'Abrir el menú' }).click();
  await foto(page, '03-menu-navegacion');
  await page.goto('/');

  await ordenar(page);
  await expect(page.getByRole('heading', { name: 'Tu Pedido' })).toBeVisible();
  await foto(page, '04-resumen-pago');
  await llenarTarjeta(page, '4111111111111111');
  await foto(page, '04-resumen-pago-medios', { completa: true });
  await page.getByRole('button', { name: 'Confirmar Pago' }).click();
  await expect(page.getByRole('heading', { name: 'Tu pago fue rechazado' })).toBeVisible();
  await foto(page, '08-error-pago-rechazado');

  await page.getByRole('button', { name: 'Intentar con otro medio' }).click();
  await pagarConNequi(page);
  await expect(page.getByText('RESERVA CONFIRMADA')).toBeVisible();
  await foto(page, '06-mi-ficho');
  await page.getByText('Detalles de la reserva').click();
  await foto(page, '06-mi-ficho-detalles', { completa: true });

  await page.goto('/pagos');
  await page.waitForLoadState('networkidle');
  await foto(page, '07-mis-reservas');
});

test('usuario: subsidio y estados de error', async ({ page, context }) => {
  await iniciarSesion(page, USUARIOS.subsidiado);
  await ordenar(page);
  await expect(page.getByText(/Subsidio Aplicado/i).first()).toBeVisible();
  await foto(page, '05-resumen-subsidiado');

  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await iniciarSesion(page, USUARIOS.sinBeneficio);
  await expect(page.getByText(/subsidio no está disponible/i).first()).toBeVisible();
  await foto(page, '08-error-subsidio-no-disponible');
});

test('usuario: fuera de horario, plato agotado y sin conexión', async ({ page, context }) => {
  await moverReloj(page, '11:00:00');
  await iniciarSesion(page, USUARIOS.regular);
  await expect(page.getByText(/cerraron/i).first()).toBeVisible();
  await foto(page, '08-error-fuera-de-horario');

  await moverReloj(page, '09:00:00');
  await agotarProteina('Carne en bistec');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
  await foto(page, '08-error-plato-agotado', { completa: true });

  await ordenar(page, { proteina: 'Pechuga' });
  await expect(page.getByRole('heading', { name: 'Tu Pedido' })).toBeVisible();
  await llenarTarjeta(page, '4242424242424242');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Confirmar Pago' }).click();
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
  await foto(page, '08-error-sin-conexion');
  await context.setOffline(false);
});

test('administrador: panel en escritorio', async ({ page }) => {
  await page.setViewportSize(ESCRITORIO);
  await iniciarSesion(page, USUARIOS.admin);
  await expect(page).toHaveURL(/\/admin/);
  await page.waitForLoadState('networkidle');
  await foto(page, '09-admin-menu-del-dia');
  for (const [ruta, nombre] of [['catalogos', '10-admin-catalogos'], ['horarios', '11-admin-horarios'], ['solicitudes', '14-admin-solicitudes']]) {
    await page.goto(`/admin/${ruta}`);
    await page.waitForLoadState('networkidle');
    await foto(page, nombre);
  }
});

test('administrador: validar ficho en el celular y entregas', async ({ page, browser }) => {
  const celular = await browser.newPage({ viewport: CELULAR });
  await celular.clock.setFixedTime(new Date('2026-10-19T09:05:00-05:00'));
  await iniciarSesion(celular, USUARIOS.regular);
  await ordenar(celular);
  await pagarConNequi(celular);
  await expect(celular.getByText('Token Único:')).toBeVisible();
  const token = (await celular.locator('.token-figma b').innerText()).trim();
  await celular.close();

  await iniciarSesion(page, USUARIOS.admin);
  await page.goto('/admin/validar');
  await expect(page.getByRole('heading', { name: 'Validar ficho' })).toBeVisible();
  await foto(page, '12-admin-validar-escanear');
  await page.getByLabel('Token del ficho').fill(token);
  await page.getByRole('button', { name: 'Buscar ficho' }).click();
  await expect(page.getByText('Ficho válido')).toBeVisible();
  await foto(page, '12-admin-validar-pedido', { completa: true });
  await page.getByRole('button', { name: 'Registrar entrega' }).click();
  await expect(page.getByRole('heading', { name: 'Entrega registrada' })).toBeVisible();
  await foto(page, '12-admin-validar-entregado');
  await page.getByRole('button', { name: 'Escanear siguiente' }).click();
  await page.getByLabel('Token del ficho').fill(token);
  await page.getByRole('button', { name: 'Buscar ficho' }).click();
  await expect(page.getByRole('heading', { name: 'Este ficho ya fue usado' })).toBeVisible();
  await foto(page, '12-admin-validar-ficho-usado');

  await page.setViewportSize(ESCRITORIO);
  await page.goto('/admin/entregas');
  await page.waitForLoadState('networkidle');
  await foto(page, '13-admin-entregas');
});

// Portada del README: el flujo de reserva en 3 pasos con las capturas de arriba.
test('portada: flujo de reserva en 3 pasos', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const imagen = (n) => `data:image/png;base64,${readFileSync(`${DESTINO}${n}.png`).toString('base64')}`;
  const pasos = [
    ['Elige tu almuerzo', imagen('02-menu-del-dia')],
    ['Paga o aplica tu subsidio', imagen('04-resumen-pago')],
    ['Reclama con tu ficho QR', imagen('06-mi-ficho')],
  ];
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/ingresar'); // para tener cargadas las fuentes del prototipo (Merienda y Mulish)
  await page.evaluate((pasos) => {
    document.body.innerHTML = `
      <div id="portada" style="position:fixed;inset:0;z-index:9999;padding:40px 56px;box-sizing:border-box;
        background:linear-gradient(180deg,#0f3d8c 0%,#123f86 55%,#e9e4f5 100%);font-family:Mulish,sans-serif;color:#fff">
        <div style="display:flex;align-items:center;gap:18px">
          <img src="/logo.png" width="76" height="76" style="background:#fff;border-radius:50%" alt="">
          <div><div style="font-family:Merienda,cursive;font-size:34px;font-weight:700">UDES FoodPass</div>
          <div style="font-size:17px;opacity:.9">Reserva tu almuerzo en 3 pasos y reclámalo sin hacer fila.</div></div>
        </div>
        <div style="display:flex;justify-content:center;gap:44px;margin-top:26px">
          ${pasos.map(([t, src], i) => `
            <figure style="margin:0;text-align:center">
              <figcaption style="font-family:Merienda,cursive;font-size:19px;margin-bottom:12px">
                <span style="display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#fff;color:#0f3d8c;font-weight:700;margin-right:8px">${i + 1}</span>${t}</figcaption>
              <img src="${src}" width="300" style="border-radius:26px;border:7px solid #0b1b3a;box-shadow:0 18px 40px rgba(0,0,0,.35);display:block">
            </figure>`).join('')}
        </div>
      </div>`;
  }, pasos);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  const alto = await page.locator('#portada figure').first().evaluate((f) => f.getBoundingClientRect().bottom + 40);
  await page.setViewportSize({ width: 1280, height: Math.ceil(alto) });
  await foto(page, '00-flujo-reserva-figma');
});
