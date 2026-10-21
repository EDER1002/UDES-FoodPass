// Recorrido del administrador: registro con verificación (Solicitudes),
// validación de fichos, entregas del día y las demás pantallas del panel.
import { USUARIOS, expect, iniciarSesion, ordenar, revisarAccesibilidad, test } from './ayudantes.js';

test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false });

const NUEVA = { nombre: 'Mariana', apellido: 'Rojas', documento: '1098123456', correo: 'mariana.rojas@udes.edu.co', contrasena: 'Almuerzo2026' };

async function crearCuenta(page, rol, datos = NUEVA) {
  await page.goto('/ingresar');
  await page.getByRole('link', { name: /Registrarse|Crear cuenta/i }).click();
  await expect(page.getByRole('heading', { name: 'Crear Cuenta' })).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill(datos.nombre);
  await page.getByLabel('Apellido').fill(datos.apellido);
  await page.getByLabel('Documento').fill(datos.documento);
  await page.getByLabel('Correo').fill(datos.correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(datos.contrasena);
  await page.getByLabel('Repite la contraseña').fill(datos.contrasena);
  await page.getByLabel('Rol').selectOption({ label: rol });
  await revisarAccesibilidad(page);
  await page.getByRole('button', { name: /Crear|Registrar/ }).click();
}

async function irA(page, seccion) {
  await page.getByRole('navigation', { name: 'Administración' }).getByRole('link', { name: seccion }).click();
}

test('registro de un subsidiado: queda en revisión y el administrador lo aprueba', async ({ page }) => {
  await crearCuenta(page, 'Estudiante subsidiado');
  await expect(page.getByRole('heading', { name: 'Tu cuenta está en revisión' })).toBeVisible();

  await iniciarSesion(page, NUEVA.correo, NUEVA.contrasena);
  await expect(page.getByRole('alert')).toContainText('Tu cuenta está en revisión');

  await iniciarSesion(page, USUARIOS.admin);
  await irA(page, 'Solicitudes');
  await expect(page.getByRole('heading', { name: 'Solicitudes de cuenta' })).toBeVisible();
  await expect(page.getByText('3 pendientes')).toBeVisible();
  await revisarAccesibilidad(page);
  const tarjeta = page.getByRole('listitem').filter({ hasText: 'Mariana Rojas' });
  await tarjeta.getByRole('button', { name: 'Aprobar' }).click();
  await expect(tarjeta.getByLabel('Subsidio vigente desde')).toHaveValue('2026-10-19');
  await revisarAccesibilidad(page);
  await tarjeta.getByRole('button', { name: 'Confirmar aprobación' }).click();
  await expect(page.getByText('Se aprobó la cuenta de Mariana Rojas como estudiante subsidiado.')).toBeVisible();
  await expect(page.getByText('2 pendientes')).toBeVisible();

  // Ya puede entrar y su subsidio está vigente
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await iniciarSesion(page, NUEVA.correo, NUEVA.contrasena);
  await ordenar(page);
  await expect(page.getByRole('heading', { name: 'Subsidio Aplicado' })).toBeVisible();
});

test('solicitud rechazada: la persona ve el motivo al ingresar', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.admin);
  await irA(page, 'Solicitudes');
  const tarjeta = page.getByRole('listitem').filter({ hasText: 'Jorge Castro' });
  await tarjeta.getByRole('button', { name: 'Rechazar' }).click();
  await tarjeta.getByLabel('Motivo del rechazo').fill('No figura en la nómina de la universidad');
  await tarjeta.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.getByText('Se rechazó la solicitud de Jorge Castro.')).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await iniciarSesion(page, 'nuevo.profesor@udes.edu.co');
  await expect(page.getByRole('alert')).toContainText('Tu solicitud de cuenta fue rechazada');
  await expect(page.getByRole('alert')).toContainText('No figura en la nómina de la universidad');
});

test('el estudiante regular queda activo de inmediato', async ({ page }) => {
  await crearCuenta(page, 'Estudiante regular');
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
});

test('validar ficho con el token: pedido, entrega y segundo escaneo rechazado', async ({ page, browser }) => {
  // Un estudiante reserva y paga desde su celular
  const celular = await browser.newPage({ viewport: { width: 412, height: 915 } });
  await celular.clock.setFixedTime(new Date('2026-10-19T09:05:00-05:00'));
  await iniciarSesion(celular, USUARIOS.regular);
  await ordenar(celular);
  await celular.getByRole('radio', { name: 'Nequi', exact: true }).check();
  await celular.getByLabel('Número de celular Nequi').fill('3001234567');
  await celular.getByRole('button', { name: 'Confirmar Pago' }).click();
  await expect(celular.getByText('Token Único:')).toBeVisible();
  const token = (await celular.locator('.token-figma b').innerText()).trim();
  await celular.close();

  await iniciarSesion(page, USUARIOS.admin);
  await irA(page, 'Validar fichos');
  await expect(page.getByRole('heading', { name: 'Validar ficho' })).toBeVisible();
  await revisarAccesibilidad(page);
  // Escrito a mano, en minúsculas y sin guiones: también se acepta
  await page.getByLabel('Token del ficho').fill(token.replaceAll('-', '').toLowerCase());
  await page.getByRole('button', { name: 'Buscar ficho' }).click();
  await expect(page.getByText('Ficho válido')).toBeVisible();
  const pedido = page.getByRole('region', { name: 'Pedido' });
  await expect(pedido).toContainText('Laura Gómez');
  await expect(pedido).toContainText('Carne en bistec');
  await revisarAccesibilidad(page);
  await page.getByRole('button', { name: 'Registrar entrega' }).click();
  await expect(page.getByRole('heading', { name: 'Entrega registrada' })).toBeVisible();

  await page.getByRole('button', { name: 'Escanear siguiente' }).click();
  await page.getByLabel('Token del ficho').fill(token);
  await page.getByRole('button', { name: 'Buscar ficho' }).click();
  await expect(page.getByRole('heading', { name: 'Este ficho ya fue usado' })).toBeVisible();

  await irA(page, 'Entregas');
  await expect(page.getByRole('heading', { name: 'Entregas del día' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Laura Gómez/ })).toBeVisible();
  await revisarAccesibilidad(page);
});

test('token inexistente', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.admin);
  await irA(page, 'Validar fichos');
  await page.getByLabel('Token del ficho').fill('AAAA-BBBB-CCCC-DDDD');
  await page.getByRole('button', { name: 'Buscar ficho' }).click();
  await expect(page.getByRole('heading', { name: 'No encontramos ese ficho' })).toBeVisible();
  await page.getByRole('button', { name: 'Escanear otro ficho' }).click();
  await expect(page.getByLabel('Token del ficho')).toBeVisible();
});

test('pantallas del panel: menú, catálogos y horarios', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.admin);
  await expect(page.getByRole('heading', { name: 'Menú del día' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Carne en bistec/ }).first()).toBeVisible();
  await revisarAccesibilidad(page);
  await irA(page, 'Catálogos');
  await expect(page.getByRole('heading', { name: 'Catálogos' })).toBeVisible();
  await revisarAccesibilidad(page);
  await irA(page, 'Horarios');
  await expect(page.getByRole('heading', { name: /Horarios/ })).toBeVisible();
  await revisarAccesibilidad(page);
  // El encabezado cabe en una sola fila
  expect((await page.locator('.admin-header').boundingBox()).height).toBeLessThan(80);
});

test('panel del administrador en celular: menú desplegable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await iniciarSesion(page, USUARIOS.admin);
  await page.getByRole('button', { name: /Menú/ }).click();
  await irA(page, 'Solicitudes');
  await expect(page.getByRole('heading', { name: 'Solicitudes de cuenta' })).toBeVisible();
  // Nada se sale de la pantalla
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await revisarAccesibilidad(page);
});

test('un estudiante no puede entrar al panel del administrador', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
  await page.goto('/admin/solicitudes');
  await expect(page.getByRole('heading', { name: 'Solicitudes de cuenta' })).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/admin/);
});
