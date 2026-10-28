// Soporte: recuperar la contraseña (por correo y con ayuda del administrador),
// la página de Ayuda y el asistente.
import { CONTRASENA, USUARIOS, expect, iniciarSesion, revisarAccesibilidad, test } from './ayudantes.js';

const API = 'http://127.0.0.1:3100';
async function ultimoCodigo(correo) {
  const r = await fetch(`${API}/__e2e/ultimo-codigo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo }) });
  return (await r.json()).codigo;
}

async function crearContrasenaNueva(page, { correo, codigo, contrasena }) {
  await expect(page.getByRole('heading', { name: 'Crea tu contraseña nueva' })).toBeVisible();
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Código de 6 dígitos').fill(codigo);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(contrasena);
  await page.getByLabel('Repite la contraseña nueva').fill(contrasena);
  await revisarAccesibilidad(page);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
  await expect(page.getByRole('status').filter({ hasText: 'tu contraseña cambió' })).toBeVisible();
}

test('olvidé mi contraseña: llega un código al correo y creo una nueva', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeVisible();
  await revisarAccesibilidad(page);

  // Sin correo, avisa qué falta
  await page.getByRole('button', { name: 'Enviarme un código' }).click();
  await expect(page.getByText('Escribe tu correo institucional', { exact: true })).toBeVisible();

  await page.getByLabel('Correo').fill(USUARIOS.regular);
  await page.getByRole('button', { name: 'Enviarme un código' }).click();
  await expect(page.getByRole('status')).toContainText('te enviamos un código de 6 dígitos');

  // Un código equivocado se rechaza con un mensaje claro
  const codigo = await ultimoCodigo(USUARIOS.regular);
  expect(codigo).toMatch(/^\d{6}$/);
  await page.getByLabel('Código de 6 dígitos').fill(codigo === '000000' ? '111111' : '000000');
  await page.getByLabel('Contraseña nueva', { exact: true }).fill('NuevaClave2026');
  await page.getByLabel('Repite la contraseña nueva').fill('NuevaClave2026');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('El código no es correcto o ya venció')).toBeVisible();

  await crearContrasenaNueva(page, { correo: USUARIOS.regular, codigo, contrasena: 'NuevaClave2026' });
  await revisarAccesibilidad(page);

  await iniciarSesion(page, USUARIOS.regular, CONTRASENA);
  await expect(page.getByRole('alert')).toContainText('El correo o la contraseña no son correctos');
  await iniciarSesion(page, USUARIOS.regular, 'NuevaClave2026');
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
});

test('sin acceso al correo: el administrador verifica el documento y da un código', async ({ page }) => {
  await page.goto('/recuperar');
  await page.getByRole('button', { name: /pedir ayuda al administrador/ }).click();
  await expect(page.getByRole('heading', { name: 'Pedir ayuda al administrador' })).toBeVisible();
  await page.getByLabel('Correo').fill(USUARIOS.empleado);
  await page.getByLabel('Documento').fill('1098000003');
  await page.getByRole('button', { name: 'Pedir ayuda' }).click();
  await expect(page.getByRole('heading', { name: 'Solicitud enviada' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Acércate a la caja de la cafetería');
  await revisarAccesibilidad(page);

  await page.setViewportSize({ width: 1280, height: 860 });
  await iniciarSesion(page, USUARIOS.admin);
  await page.getByRole('navigation', { name: 'Administración' }).getByRole('link', { name: 'Solicitudes' }).click();
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();
  const tarjeta = page.getByRole('listitem').filter({ hasText: 'Diana Ruiz' });
  await expect(tarjeta).toContainText('1098000003');
  await revisarAccesibilidad(page);
  await tarjeta.getByRole('button', { name: /generar código/ }).click();
  const aviso = page.getByRole('status').filter({ hasText: 'Código para Diana Ruiz' });
  await expect(aviso).toBeVisible();
  const codigo = (await aviso.locator('.codigo-recuperacion').textContent()).trim();
  expect(codigo).toMatch(/^\d{6}$/);
  await expect(page.getByText('No hay solicitudes de ayuda pendientes.')).toBeVisible();
  await revisarAccesibilidad(page);
  await page.getByRole('banner').getByRole('button', { name: 'Cerrar sesión' }).click();

  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/recuperar');
  await page.getByRole('button', { name: 'Ya tengo un código' }).click();
  await crearContrasenaNueva(page, { correo: USUARIOS.empleado, codigo, contrasena: 'Empleada2026' });
  await iniciarSesion(page, USUARIOS.empleado, 'Empleada2026');
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
});

test('la página de Ayuda se ve sin iniciar sesión y permite buscar', async ({ page }) => {
  await page.goto('/ingresar');
  await page.getByRole('link', { name: 'Ayuda y soporte' }).click();
  await expect(page.getByRole('heading', { name: 'Ayuda y soporte' })).toBeVisible();
  await expect(page.getByRole('link', { name: /¿Olvidaste tu contraseña\?/ })).toBeVisible();
  await expect(page.getByText('Administración', { exact: true })).toHaveCount(0);
  await revisarAccesibilidad(page);

  await page.getByLabel('Buscar en las preguntas frecuentes').fill('ficho');
  await expect(page.getByRole('status')).toContainText('resultado');
  await page.getByText('¿Puedo usar el ficho más de una vez?').click();
  await expect(page.getByText('El ficho es de uso único')).toBeVisible();
  await revisarAccesibilidad(page);
});

test('el asistente responde con el menú de hoy y con las preguntas frecuentes', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir el menú' }).click();
  await page.getByRole('link', { name: 'Ayuda' }).click();
  await expect(page.getByRole('heading', { name: 'Asistente FoodPass' })).toBeVisible();
  await revisarAccesibilidad(page);

  const conversacion = page.getByRole('log', { name: 'Conversación con el asistente' });
  await page.getByRole('button', { name: '¿Qué hay de menú hoy?' }).click();
  await expect(conversacion).toContainText(/Proteínas: .*Carne en bistec/);

  await page.getByLabel('Escribe tu pregunta').fill('perdí mi clave');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(conversacion).toContainText('¿Olvidaste tu contraseña?');

  await page.getByLabel('Escribe tu pregunta').fill('¿hasta qué hora puedo reservar?');
  await page.getByLabel('Escribe tu pregunta').press('Enter');
  await expect(conversacion).toContainText('Puedes reservar hoy hasta las 10:30 a. m.');
  await revisarAccesibilidad(page);
});

test('el administrador tiene su Ayuda con preguntas de administración', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await iniciarSesion(page, USUARIOS.admin);
  await page.getByRole('navigation', { name: 'Administración' }).getByRole('link', { name: 'Ayuda' }).click();
  await expect(page.getByRole('heading', { name: 'Ayuda y soporte' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
  await page.getByRole('button', { name: '¿Cómo valido un ficho?' }).click();
  await expect(page.getByRole('log')).toContainText('Validar fichos');
  await revisarAccesibilidad(page);
});
