import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cargarConfig } from '../config.js';
import { crearPool } from './conexion.js';

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migraciones');

/**
 * Aplica, en orden, las migraciones SQL que aún no se han aplicado.
 * `schema_migraciones` es una tabla técnica de control: no es parte del
 * modelo de datos del negocio.
 */
export async function aplicarMigraciones(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migraciones (
    nombre      VARCHAR(200) PRIMARY KEY,
    aplicada_en TIMESTAMPTZ  NOT NULL DEFAULT now()
  )`);
  const archivos = (await readdir(carpeta)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const { rows } = await pool.query('SELECT nombre FROM schema_migraciones');
  const aplicadas = new Set(rows.map((r) => r.nombre));
  const nuevas = [];
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = await readFile(path.join(carpeta, archivo), 'utf8');
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query('INSERT INTO schema_migraciones (nombre) VALUES ($1)', [archivo]);
      await cliente.query('COMMIT');
      nuevas.push(archivo);
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw new Error(`Falló la migración ${archivo}: ${error.message}`);
    } finally {
      cliente.release();
    }
  }
  return nuevas;
}

// Ejecución directa: npm run db:migrar
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = cargarConfig();
  const pool = crearPool(config.urlBaseDeDatos);
  try {
    const nuevas = await aplicarMigraciones(pool);
    console.log(nuevas.length ? `Migraciones aplicadas:\n  ${nuevas.join('\n  ')}` : 'La base de datos ya estaba al día.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
