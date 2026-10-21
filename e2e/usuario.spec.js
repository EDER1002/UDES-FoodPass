// Recorrido del usuario: inicio de sesión, menú, los tres medios de pago,
// subsidio, ficho QR, cancelación y los estados de error.
import { USUARIOS, agotarProteina, cerrarSesion, expect, iniciarSesion, moverReloj, ordenar, responderWebhook, revisarAccesibilidad, test } from './ayudantes.js';

/** Llena los datos del medio elegido en "Tu Pedido" y pulsa "Confirmar Pago". */
async function pagar(page, medio, datos = {}) {
  await expect(page.getByRole('heading', { name: 'Tu Pedido' })).toBeVisible();
  await page.getByRole('radio', { name: medio, exact: true }).check();
  if (medio === 'Tarjeta') {
    await page.getByLabel('Número de la tarjeta').fill(datos.numero ?? '4242424242424242');
    await page.getByLabel('Nombre en la tarjeta').fill('Laura Gómez');
    await page.getByLabel('Vence (MM/AA)').fill('1230');
    await page.getByLabel('Código (CVC)').fill('123');
  }
  if (medio === 'Nequi') await page.getByLabel('Número de celular Nequi').fill(datos.telefono ?? '3001234567');
  if (medio === 'PSE') {
    await page.getByLabel('Banco').selectOption({ label: datos.banco });
    await page.getByLabel('Documento del titular').fill('1098000001');
  }
  await page.getByRole('button', { name: 'Confirmar Pago' }).click();
}

async function verQrConfirmado(page) {
  await expect(page).toHaveURL(/\/qr$/);
  await expect(page.getByText('RESERVA CONFIRMADA')).toBeVisible();
  await expect(page.getByText('Token Único:')).toBeVisible();
  await expect(page.getByRole('img', { name: /Código QR de tu ficho/ })).toBeVisible();
  return (await page.locator('.token-figma b').innerText()).trim();
}

test('inicio de sesión: contraseña incorrecta y luego ingreso correcto', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular, 'otraClave123');
  await expect(page.getByRole('alert')).toContainText(/correo o la contraseña/i);
  await revisarAccesibilidad(page);
  await page.getByLabel('Contraseña', { exact: true }).fill('FoodPass2026!');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
  await expect(page.getByText('Disponible hasta')).toBeVisible();
  await expect(page.getByText('Laura Gómez')).toBeVisible();
});

test('menú del día: porciones, plato agotado y máximo de acompañamientos', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Maduro frito/ })).toBeDisabled();
  await expect(page.getByText('¡Quedan 3!')).toBeVisible();
  await page.getByRole('radio', { name: /Almuerzo completo/ }).check();
  await page.getByRole('checkbox', { name: /Arroz blanco/ }).check();
  await page.getByRole('checkbox', { name: /Frijoles/ }).check();
  await expect(page.getByRole('checkbox', { name: /Ensalada fresca/ })).toBeDisabled();
  await expect(page.getByText('2 de 2 elegidos')).toBeVisible();
  await revisarAccesibilidad(page);
});

test('pago con tarjeta aprobado: QR, detalles y la reserva en Pagos', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await expect(page.getByText('$12.000').first()).toBeVisible();
  await revisarAccesibilidad(page);
  await pagar(page, 'Tarjeta');
  const token = await verQrConfirmado(page);
  expect(token).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
  await expect(page.getByText(/Pago aprobado · Tarjeta · \$12\.000/)).toBeVisible();
  await expect(page.getByText('El QR es de un único uso al día.')).toBeVisible();
  await revisarAccesibilidad(page);

  await page.getByRole('button', { name: 'Abrir el menú' }).click();
  await page.getByRole('link', { name: 'Pagos' }).click();
  await expect(page.getByRole('heading', { name: 'Pagos' })).toBeVisible();
  await expect(page.getByText('Confirmada').first()).toBeVisible();
  await revisarAccesibilidad(page);
});

test('pago con tarjeta rechazado y nuevo intento con Nequi', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await pagar(page, 'Tarjeta', { numero: '4111111111111111' });
  await expect(page.getByRole('heading', { name: 'Tu pago fue rechazado' })).toBeVisible();
  await revisarAccesibilidad(page);
  await page.getByRole('button', { name: 'Intentar con otro medio' }).click();
  await pagar(page, 'Nequi');
  await verQrConfirmado(page);
  await expect(page.getByText(/Pago aprobado · Nequi/)).toBeVisible();
});

test('Nequi rechazado muestra el motivo', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.empleado);
  await ordenar(page, { tipo: 'Medio almuerzo', acompanamientos: ['Arroz blanco'] });
  await pagar(page, 'Nequi', { telefono: '3992222222' });
  await expect(page.getByRole('heading', { name: 'Tu pago fue rechazado' })).toBeVisible();
});

test('PSE aprobado al momento', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await pagar(page, 'PSE', { banco: 'Banco de pruebas: aprueba el pago' });
  await verQrConfirmado(page);
});

test('PSE pendiente: la pantalla espera el webhook del banco', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await pagar(page, 'PSE', { banco: 'Banco de pruebas: respuesta pendiente (llega por webhook)' });
  await expect(page.getByRole('heading', { name: 'Tu banco está procesando el pago' })).toBeVisible();
  await revisarAccesibilidad(page);
  await responderWebhook('APROBADO');
  await verQrConfirmado(page);
});

test('PSE pendiente que el banco rechaza', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await pagar(page, 'PSE', { banco: 'Banco de pruebas: respuesta pendiente (llega por webhook)' });
  await expect(page.getByRole('heading', { name: 'Tu banco está procesando el pago' })).toBeVisible();
  await responderWebhook('RECHAZADO');
  await expect(page.getByRole('heading', { name: 'Tu pago fue rechazado' })).toBeVisible();
});

test('subsidiado: "Subsidio Aplicado", total $0 y QR', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.subsidiado);
  await ordenar(page);
  await expect(page.getByRole('heading', { name: 'Subsidio Aplicado' })).toBeVisible();
  await expect(page.locator('.total-linea b')).toHaveText('$0');
  await expect(page.getByText('Beneficio de hoy:')).toBeVisible();
  await revisarAccesibilidad(page);
  await page.getByRole('button', { name: 'Confirmar Reserva' }).click();
  await verQrConfirmado(page);
  await expect(page.getByText('Subsidio aplicado · $0')).toBeVisible();

  // Cancelar devuelve el subsidio del día
  await page.getByRole('button', { name: 'Cancelar reserva' }).click();
  await page.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Reserva cancelada' })).toBeVisible();
  await expect(page.getByText('Tu subsidio de hoy queda disponible otra vez.')).toBeVisible();
});

test('subsidiado sin beneficio vigente: el subsidio no está disponible', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.sinBeneficio);
  await expect(page.getByRole('heading', { name: 'Tu subsidio no está disponible' })).toBeVisible();
  await expect(page.getByText(/Bienestar Universitario/)).toBeVisible();
  await revisarAccesibilidad(page);
});

test('cancelar una reserva pagada la reembolsa', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await pagar(page, 'Tarjeta');
  await verQrConfirmado(page);
  await page.getByRole('button', { name: 'Cancelar reserva' }).click();
  await page.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(page.getByRole('heading', { name: 'Reserva cancelada' })).toBeVisible();
  await expect(page.getByText(/Te devolvimos \$12\.000/)).toBeVisible();
});

test('fuera del horario: antes de abrir y después de la hora límite', async ({ page }) => {
  await moverReloj(page, '05:30:00');
  await iniciarSesion(page, USUARIOS.regular);
  await expect(page.getByRole('heading', { name: 'Fuera del horario de reservas' })).toBeVisible();
  await revisarAccesibilidad(page);
  await moverReloj(page, '11:15:00');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Las reservas de hoy ya cerraron' })).toBeVisible();
  await expect(page.getByText(/10:30 a\. m\./).first()).toBeVisible();
});

test('la hora límite llega con el pedido en pantalla: no deja pagar', async ({ page }) => {
  await moverReloj(page, '10:29:00');
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await expect(page.getByRole('heading', { name: 'Tu Pedido' })).toBeVisible();
  await moverReloj(page, '10:31:00');
  await page.getByRole('radio', { name: 'Nequi', exact: true }).check();
  await page.getByLabel('Número de celular Nequi').fill('3001234567');
  await page.getByRole('button', { name: 'Confirmar Pago' }).click();
  await expect(page.getByRole('heading', { name: /horario|cerraron|venció/i })).toBeVisible();
});

test('plato agotado mientras la persona elegía', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await expect(page.getByRole('heading', { name: 'Menú del Día' })).toBeVisible();
  await agotarProteina('Carne en bistec');
  await ordenar(page);
  await expect(page.getByRole('heading', { name: 'Se agotó una opción' })).toBeVisible();
  await page.getByRole('button', { name: 'Elegir otra opción' }).click();
  await expect(page.getByRole('radio', { name: /Carne en bistec/ })).toBeDisabled();
});

test('sin conexión: el aviso aparece y "Reintentar" funciona', async ({ page, context }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await expect(page.getByRole('heading', { name: 'Tu Pedido' })).toBeVisible();
  await page.getByRole('radio', { name: 'Tarjeta', exact: true }).check();
  await page.getByLabel('Número de la tarjeta').fill('4242424242424242');
  await page.getByLabel('Nombre en la tarjeta').fill('Laura Gómez');
  await page.getByLabel('Vence (MM/AA)').fill('1230');
  await page.getByLabel('Código (CVC)').fill('123');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Confirmar Pago' }).click();
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
  await revisarAccesibilidad(page);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await verQrConfirmado(page);
});

test('una reserva activa por día: al volver al inicio se ve el QR', async ({ page }) => {
  await iniciarSesion(page, USUARIOS.regular);
  await ordenar(page);
  await pagar(page, 'Tarjeta');
  await verQrConfirmado(page);
  await page.goto('/');
  await expect(page.getByText(/ya tienes|tu almuerzo de hoy/i).first()).toBeVisible();
  await cerrarSesion(page);
});
