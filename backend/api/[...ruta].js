import { crearApp } from '../src/app.js';
import { cargarConfig } from '../src/config.js';
import { crearPool } from '../src/db/conexion.js';
import { crearPasarela } from '../src/modules/reservas-pagos/pagos/pasarela/index.js';

const config = cargarConfig();
const pool = crearPool(config.urlBaseDeDatos);
const pasarela = crearPasarela(config, { demoraSandboxMs: 700 });
await pasarela.iniciar?.();

const { app } = crearApp({ pool, config, pasarela });

export default app;
