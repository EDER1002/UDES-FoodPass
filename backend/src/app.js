import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { manejarErrores, rutaNoEncontrada } from './compartido/errores.js';
import { crearReloj } from './compartido/reloj.js';
import { ROLES } from './compartido/roles.js';
import { BaseDeDatos } from './db/conexion.js';
import { AutenticacionRepositorio } from './modules/autenticacion/autenticacion.repositorio.js';
import { AutenticacionService } from './modules/autenticacion/autenticacion.service.js';
import { permitirRoles, requiereSesion } from './modules/autenticacion/autenticacion.middleware.js';
import { rutasAutenticacion } from './modules/autenticacion/autenticacion.rutas.js';
import { GestionMenuRepositorio } from './modules/gestion-menu/gestion-menu.repositorio.js';
import { GestionMenuService } from './modules/gestion-menu/gestion-menu.service.js';
import { rutasGestionMenu } from './modules/gestion-menu/gestion-menu.rutas.js';
import { crearEstrategias } from './modules/reservas-pagos/pagos/estrategias/index.js';
import { PagoRepositorio } from './modules/reservas-pagos/pagos/pago.repositorio.js';
import { PasarelaSandbox } from './modules/reservas-pagos/pagos/pasarela/PasarelaSandbox.js';
import { ReservaRepositorio } from './modules/reservas-pagos/reserva.repositorio.js';
import { ReservaService } from './modules/reservas-pagos/reserva.service.js';
import { rutasReservasPagos } from './modules/reservas-pagos/reservas-pagos.rutas.js';
import { ValidacionQRRepositorio } from './modules/validacion-qr/validacion-qr.repositorio.js';
import { ValidacionQRService } from './modules/validacion-qr/validacion-qr.service.js';
import { rutasValidacionQR } from './modules/validacion-qr/validacion-qr.rutas.js';

/**
 * Composición de la aplicación: crea los cuatro módulos y conecta sus
 * dependencias. Las pruebas la usan con su propia base de datos, un reloj
 * fijo y una pasarela sandbox observable.
 */
export function crearApp({ pool, config, reloj = crearReloj(), pasarela = new PasarelaSandbox() }) {
  const db = new BaseDeDatos(pool);

  const auth = new AutenticacionService({ db, repositorio: new AutenticacionRepositorio(db), config, reloj });
  const menu = new GestionMenuService({ db, repositorio: new GestionMenuRepositorio(db) });
  const fichos = new ValidacionQRService({ db, repositorio: new ValidacionQRRepositorio(db), reloj });
  const reservas = new ReservaService({
    db,
    reservas: new ReservaRepositorio(db),
    pagos: new PagoRepositorio(db),
    menu,
    auth,
    estrategias: crearEstrategias({ pasarela, reloj }),
    reloj,
    fichos,
    pasarelaReal: Boolean(pasarela.confirmaPorWebhook),
  });
  fichos.conectarReservas(reservas);
  // Al aprobar la cuenta de un subsidiado se crea su beneficio en la misma transacción.
  auth.conectarAlAprobar(async (usuario, datos, tx) => {
    if (usuario.rol === ROLES.SUBSIDIADO) await reservas.otorgarBeneficio({ ...datos, idUsuario: usuario.idUsuario, idRol: usuario.idRol }, tx);
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(cors({ origin: config.origenesCors }));
  // Se guarda el cuerpo exacto para verificar la firma del webhook.
  app.use(express.json({ limit: '20kb', verify: (req, _res, buffer) => { req.cuerpoCrudo = buffer; } }));

  const sesion = requiereSesion(auth);
  const soloAdmin = [sesion, permitirRoles(ROLES.ADMIN)];

  app.get('/api/salud', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', hora: reloj.partes() });
  });
  app.use('/api', rutasAutenticacion({ auth, sesion, soloAdmin }));
  app.use('/api', rutasGestionMenu({ menu, reloj, sesion, soloAdmin, contarSelecciones: (idMenu) => reservas.conteoSelecciones(idMenu) }));
  app.use('/api', rutasReservasPagos({ reservas, pasarela, config, sesion, soloAdmin }));
  app.use('/api', rutasValidacionQR({ fichos, reservas, auth, reloj, sesion, soloAdmin }));
  app.use(rutaNoEncontrada);
  app.use(manejarErrores);

  return { app, servicios: { auth, menu, reservas, fichos }, pasarela };
}
