import { crearPool } from '../src/db/conexion.js';
import { aplicarMigraciones } from '../src/db/migrar.js';

/**
 * Se ejecuta una vez antes de todas las pruebas: borra y recrea el esquema
 * de la base de datos DE PRUEBAS y aplica las migraciones.
 */
export default async function prepararBaseDePruebas() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Define DATABASE_URL_TEST en el archivo .env (ver .env.example).');
  const nombre = new URL(url).pathname.slice(1);
  if (!/test/i.test(nombre) || url === process.env.DATABASE_URL) {
    throw new Error(`Por seguridad, la base de pruebas debe ser distinta de la principal y tener "test" en el nombre (es "${nombre}").`);
  }
  const pool = crearPool(url);
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await aplicarMigraciones(pool);
  } finally {
    await pool.end();
  }
}
