// npm run db:seed — carga los DATOS DE EJEMPLO (solo desarrollo).
import { cargarConfig } from '../config.js';
import { crearReloj } from '../compartido/reloj.js';
import { crearPool } from './conexion.js';
import { aplicarMigraciones } from './migrar.js';
import { CONTRASENA_DE_PRUEBA, USUARIOS_DE_PRUEBA, sembrarDatosDeEjemplo } from './seeds/datos-ejemplo.js';

const config = cargarConfig();
if (config.entorno === 'production') {
  console.error('El seed borra todos los datos: no se puede ejecutar en producción.');
  process.exit(1);
}

const pool = crearPool(config.urlBaseDeDatos);
try {
  await aplicarMigraciones(pool);
  const hoy = crearReloj().hoy();
  const resumen = await sembrarDatosDeEjemplo(pool, { hoy, rondasBcrypt: config.bcryptRondas });
  console.log(`Datos de ejemplo cargados: ${resumen.usuarios} usuarios y menú publicado desde ${hoy} (${resumen.menus} días).\n`);
  console.log(`Contraseña de todos los usuarios de prueba: ${CONTRASENA_DE_PRUEBA}`);
  for (const u of USUARIOS_DE_PRUEBA) console.log(`  ${u.rol.padEnd(22)} ${u.correo}${u.estado === 'PENDIENTE' ? '  (en revisión)' : ''}`);
} catch (error) {
  console.error('No se pudieron cargar los datos de ejemplo:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
