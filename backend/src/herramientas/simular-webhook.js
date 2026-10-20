// npm run pago:webhook — simula la respuesta del banco a un pago PSE pendiente
// (solo desarrollo). Envía a la API la notificación firmada que mandaría la
// pasarela real a POST /api/pagos/webhook.
//
//   npm run pago:webhook                      aprueba el pago pendiente más reciente
//   npm run pago:webhook -- RECHAZADO         lo rechaza
//   npm run pago:webhook -- FP-12-ab… APROBADO  responde a una referencia concreta
import { cargarConfig } from '../config.js';
import { BaseDeDatos, crearPool } from '../db/conexion.js';
import { PagoRepositorio } from '../modules/reservas-pagos/pagos/pago.repositorio.js';
import { CABECERA_FIRMA, firmar } from '../modules/reservas-pagos/pagos/webhook.js';

const config = cargarConfig();
if (config.entorno === 'production') {
  console.error('Esta herramienta es solo para el entorno de pruebas.');
  process.exit(1);
}

const argumentos = process.argv.slice(2);
const estado = (argumentos.find((a) => /^(APROBADO|RECHAZADO)$/i.test(a)) ?? 'APROBADO').toUpperCase();
let referencia = argumentos.find((a) => !/^(APROBADO|RECHAZADO)$/i.test(a));

const pool = crearPool(config.urlBaseDeDatos);
try {
  if (!referencia) {
    const [pendiente] = await new PagoRepositorio(new BaseDeDatos(pool)).listarPendientes(1);
    if (!pendiente) {
      console.log('No hay pagos pendientes. Paga con PSE y el "Banco de pruebas: respuesta pendiente".');
      process.exit(0);
    }
    referencia = pendiente.referencia_transaccion;
  }
  const cuerpo = JSON.stringify({ referencia, estado });
  const respuesta = await fetch(`http://localhost:${config.puerto}/api/pagos/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [CABECERA_FIRMA]: firmar(cuerpo, config.pasarela.secretoWebhook) },
    body: cuerpo,
  });
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error?.mensaje ?? `La API respondió ${respuesta.status}`);
  console.log(`Pago ${referencia}: ${datos.estadoPago ?? estado}. La pantalla del usuario se actualiza sola.`);
} catch (error) {
  const sinApi = error.cause?.code === 'ECONNREFUSED';
  console.error(sinApi ? 'La API no está encendida. Arráncala con "npm run dev:backend".' : `No se pudo simular el webhook: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
