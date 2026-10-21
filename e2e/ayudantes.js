import AxeBuilder from '@axe-core/playwright';
import { test as base, expect } from '@playwright/test';
import { firmar } from '../backend/src/modules/reservas-pagos/pagos/webhook.js';

const API = 'http://127.0.0.1:3100';
export const CONTRASENA = 'FoodPass2026!';
export const HOY = '2026-10-19'; // lunes
export const USUARIOS = {
  regular: 'estudiante.regular@udes.edu.co',
  subsidiado: 'estudiante.subsidiado@udes.edu.co',
  sinBeneficio: 'subsidiado.sin.beneficio@udes.edu.co',
  empleado: 'empleado@udes.edu.co',
  admin: 'admin@udes.edu.co',
};

async function control(ruta, cuerpo) {
  const r = await fetch(`${API}/__e2e/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`/__e2e/${ruta} respondió ${r.status}`);
  return r.json();
}
/** Datos de ejemplo desde cero, con la hora de Bogotá fija. */
export const reiniciar = (hora = '09:00:00', fecha = HOY) => control('reiniciar', { fecha, hora });
const instante = (hora, fecha = HOY) => new Date(`${fecha}T${hora}-05:00`);
/** Mueve el reloj de la API y el del navegador, para que digan la misma hora. */
export async function moverReloj(page, hora, fecha = HOY) {
  await control('reloj', { fecha, hora });
  await page.clock.setFixedTime(instante(hora, fecha));
}
export const agotarProteina = (proteina) => control('agotar', { proteina });

/** Lo que haría la pasarela al confirmar un pago PSE pendiente (firma HMAC). */
export async function responderWebhook(estado) {
  const { referencia } = await control('pago-pendiente', {});
  expect(referencia, 'no hay un pago pendiente').toBeTruthy();
  const cuerpo = JSON.stringify({ referencia, estado });
  const r = await fetch(`${API}/api/pagos/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-FoodPass-Firma': firmar(cuerpo, process.env.WEBHOOK_SECRETO) },
    body: cuerpo,
  });
  expect(r.ok, await r.text()).toBeTruthy();
}

/**
 * Cada prueba empieza con datos limpios y falla si la página muestra errores
 * en la consola del navegador.
 */
export const test = base.extend({
  page: async ({ page }, usar) => {
    const errores = [];
    page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    page.on('pageerror', (e) => errores.push(e.message));
    await reiniciar();
    await page.clock.setFixedTime(instante('09:00:00'));
    await usar(page);
    // Los errores de red que la prueba provoca a propósito (sin conexión) no cuentan.
    expect(errores.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(e)), 'errores en la consola').toEqual([]);
  },
});
export { expect };

export async function iniciarSesion(page, correo, contrasena = CONTRASENA) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

export async function cerrarSesion(page) {
  await page.getByRole('button', { name: 'Abrir el menú' }).click();
  await page.getByRole('button', { name: 'Cerrar Sesión' }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
}

/** Paso 1: elige almuerzo, proteína y acompañamientos y pulsa "Ordenar". */
export async function ordenar(page, { tipo = 'Almuerzo completo', proteina = 'Carne en bistec', acompanamientos = ['Arroz blanco', 'Frijoles'] } = {}) {
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(tipo) }).check();
  await page.getByRole('radio', { name: new RegExp(proteina) }).check();
  for (const a of acompanamientos) await page.getByRole('checkbox', { name: new RegExp(a) }).check();
  await page.getByRole('button', { name: 'Ordenar' }).click();
}

/** Revisión automática de accesibilidad (WCAG 2.2 AA) de lo que se ve en pantalla. */
export async function revisarAccesibilidad(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), 'problemas de accesibilidad').toEqual([]);
}
