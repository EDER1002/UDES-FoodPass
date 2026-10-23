import { crearApp } from './app.js';
import { cargarConfig } from './config.js';
import { crearPool } from './db/conexion.js';
import { crearPasarela } from './modules/reservas-pagos/pagos/pasarela/index.js';

const config = cargarConfig();
const pool = crearPool(config.urlBaseDeDatos);

try {
  await pool.query('SELECT 1');
} catch (error) {
  console.error(`No se pudo conectar a PostgreSQL (${error.message}).`);
  console.error('¿Encendiste la base de datos con "docker compose up -d" y revisaste DATABASE_URL en .env?');
  process.exit(1);
}

// En el sandbox, la demora imita el tiempo de respuesta de una pasarela real.
const pasarela = crearPasarela(config, { demoraSandboxMs: 700 });
try {
  await pasarela.iniciar?.();
} catch (error) {
  console.error(`No se pudo conectar con la pasarela de pagos (${error.message}).`);
  console.error('Revisa las llaves WOMPI_* de tu .env y tu conexión a internet.');
  process.exit(1);
}
const { app } = crearApp({ pool, config, pasarela });
const servidor = app.listen(config.puerto, () => {
  console.log(`API de UDES FoodPass escuchando en http://localhost:${config.puerto}/api (pagos: ${config.pasarela.modo})`);
});

const apagar = () => {
  servidor.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
