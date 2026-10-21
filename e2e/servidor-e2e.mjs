// Servidor de la prueba en el navegador (npm run prueba:navegador).
//
// Arranca la API completa sobre la base de datos DE PRUEBAS con un reloj
// detenido, para que la prueba no dependa de la hora real. Agrega dos rutas
// que solo existen aquí (nunca en server.js):
//   POST /__e2e/reiniciar { fecha, hora }  borra todo y carga los datos de ejemplo
//   POST /__e2e/reloj     { fecha?, hora } mueve el reloj
//   POST /__e2e/agotar    { proteina }     deja en 0 las porciones de una proteína
//   POST /__e2e/pago-pendiente              referencia del último pago PSE pendiente
// Son atajos para preparar casos borde que en la vida real tardan horas
// (que llegue la hora límite o que otros compren la última porción).
import express from 'express';
import { crearApp } from '../backend/src/app.js';
import { cargarConfig } from '../backend/src/config.js';
import { relojFijo } from '../backend/src/compartido/reloj.js';
import { crearPool } from '../backend/src/db/conexion.js';
import { aplicarMigraciones } from '../backend/src/db/migrar.js';
import { sembrarDatosDeEjemplo } from '../backend/src/db/seeds/datos-ejemplo.js';
import { PasarelaSandbox } from '../backend/src/modules/reservas-pagos/pagos/pasarela/PasarelaSandbox.js';

export const PUERTO_API_E2E = Number(process.env.PUERTO_API_E2E ?? 3100);

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error('Define DATABASE_URL_TEST en el archivo .env (ver .env.example).');
const nombre = new URL(url).pathname.slice(1);
if (!/test/i.test(nombre) || url === process.env.DATABASE_URL) {
  throw new Error(`Por seguridad, la prueba usa la base de pruebas, que debe tener "test" en el nombre (es "${nombre}").`);
}

const config = cargarConfig({ ...process.env, DATABASE_URL: url, NODE_ENV: 'test', BCRYPT_RONDAS: '4' });
const pool = crearPool(url);
await aplicarMigraciones(pool);

let fechaActual = '2026-10-19';
const reloj = relojFijo(fechaActual, '09:00:00');
const { app } = crearApp({ pool, config, reloj, pasarela: new PasarelaSandbox({ demoraMs: 150 }) });

const control = express.Router();
control.use(express.json());
control.post('/reiniciar', async (req, res) => {
  const { fecha = fechaActual, hora = '09:00:00' } = req.body ?? {};
  fechaActual = fecha;
  reloj.mover(fecha, hora);
  await sembrarDatosDeEjemplo(pool, { hoy: fecha, dias: 3, rondasBcrypt: 4 });
  // Horario de reservas realista (los datos de ejemplo abren todo el día).
  await pool.query("UPDATE configuracion_reserva SET hora_inicio = '06:00', hora_fin = '10:30'");
  await pool.query("UPDATE menu SET hora_inicio_reserva = '06:00', hora_fin_reserva = '10:30'");
  res.json({ ok: true });
});
control.post('/reloj', (req, res) => {
  const { fecha = fechaActual, hora } = req.body ?? {};
  fechaActual = fecha;
  reloj.mover(fecha, hora);
  res.json({ ok: true, ...reloj.partes() });
});

control.post('/agotar', async (req, res) => {
  const { rowCount } = await pool.query(
    `UPDATE menu_proteina mp SET cantidad_disponible = 0
       FROM proteina p, menu m
      WHERE p.id_proteina = mp.id_proteina AND m.id_menu = mp.id_menu AND p.nombre = $1 AND m.fecha = $2`,
    [req.body?.proteina, fechaActual],
  );
  res.json({ ok: rowCount > 0 });
});

control.post('/pago-pendiente', async (_req, res) => {
  const { rows } = await pool.query("SELECT referencia_transaccion FROM pago WHERE estado_pago = 'PENDIENTE' ORDER BY id_pago DESC LIMIT 1");
  res.json({ referencia: rows[0]?.referencia_transaccion ?? null });
});

const servidor = express();
servidor.use('/__e2e', control);
servidor.use(app);
servidor.listen(PUERTO_API_E2E, '127.0.0.1', () => {
  console.log(`API de la prueba en http://127.0.0.1:${PUERTO_API_E2E} (base ${nombre}, reloj fijo)`);
});

const apagar = () => pool.end().finally(() => process.exit(0));
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
