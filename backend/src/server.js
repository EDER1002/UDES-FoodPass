import { crearApp } from './app.js';
import { cargarConfig } from './config.js';
import { crearPool } from './db/conexion.js';
import { PasarelaSandbox } from './modules/reservas-pagos/pagos/pasarela/PasarelaSandbox.js';

const config = cargarConfig();
const pool = crearPool(config.urlBaseDeDatos);

try {
  await pool.query('SELECT 1');
} catch (error) {
  console.error(`No se pudo conectar a PostgreSQL (${error.message}).`);
  console.error('¿Encendiste la base de datos con "docker compose up -d" y revisaste DATABASE_URL en .env?');
  process.exit(1);
}

// La demora imita el tiempo de respuesta de una pasarela real.
const { app } = crearApp({ pool, config, pasarela: new PasarelaSandbox({ demoraMs: 700 }) });
const servidor = app.listen(config.puerto, () => {
  console.log(`API de UDES FoodPass escuchando en http://localhost:${config.puerto}/api (pagos: ${config.pasarela.modo})`);
});

const apagar = () => {
  servidor.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
