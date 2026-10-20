import { Router } from 'express';
import { validar } from '../../compartido/validacion.js';
import { ROLES_COMENSALES, ROLES_QUE_PAGAN } from '../../compartido/roles.js';
import { permitirRoles } from '../autenticacion/autenticacion.middleware.js';
import { DATOS_DE_PRUEBA } from './pagos/pasarela/PasarelaSandbox.js';
import { CABECERA_FIRMA, esquemaWebhook, verificarFirma } from './pagos/webhook.js';
import {
  esquemaClaveIdempotencia,
  esquemaConfiguracion,
  esquemaIdReserva,
  esquemaPago,
  esquemaPedido,
} from './reservas-pagos.esquemas.js';

export function rutasReservasPagos({ reservas, config, sesion, soloAdmin }) {
  const rutas = Router();
  const comensal = [sesion, permitirRoles(...ROLES_COMENSALES)];

  // Lo que el frontend necesita saber hoy: horario, subsidio y reserva activa
  rutas.get('/reservas/contexto', comensal, async (req, res) => {
    res.json({ contexto: await reservas.contextoDelDia(req.usuario) });
  });

  // GET /api/reservas/mias → historial del usuario
  rutas.get('/reservas/mias', comensal, async (req, res) => {
    res.json({ reservas: await reservas.listarMias(req.usuario) });
  });

  // POST /api/reservas → crearReserva()
  rutas.post('/reservas', comensal, async (req, res) => {
    const pedido = validar(esquemaPedido, req.body);
    res.status(201).json({ reserva: await reservas.crearReserva(req.usuario, pedido) });
  });

  rutas.get('/reservas/:id', comensal, async (req, res) => {
    const { id } = validar(esquemaIdReserva, req.params);
    res.json({ reserva: await reservas.obtenerDeUsuario(req.usuario, id) });
  });

  // POST /api/reservas/:id/pago → procesarPago() con Idempotency-Key
  rutas.post('/reservas/:id/pago', sesion, permitirRoles(...ROLES_QUE_PAGAN), async (req, res) => {
    const { id } = validar(esquemaIdReserva, req.params);
    const clave = validar(esquemaClaveIdempotencia, req.get('idempotency-key'));
    const entrada = validar(esquemaPago, req.body);
    res.json(await reservas.procesarPago(req.usuario, id, entrada, clave));
  });

  // POST /api/reservas/:id/cancelar → cancelarReserva() (solo el dueño)
  rutas.post('/reservas/:id/cancelar', comensal, async (req, res) => {
    const { id } = validar(esquemaIdReserva, req.params);
    res.json({ reserva: await reservas.cancelarReserva(req.usuario, id) });
  });

  // Medios de pago disponibles y datos de prueba del sandbox
  rutas.get('/pagos/medios', sesion, (_req, res) => {
    res.json({
      modo: config.pasarela.modo,
      metodos: ['NEQUI', 'PSE', 'TARJETA'],
      bancosPse: DATOS_DE_PRUEBA.bancosPse,
      datosDePrueba: {
        tarjetaAprobada: DATOS_DE_PRUEBA.tarjetaAprobada,
        tarjetaRechazada: DATOS_DE_PRUEBA.tarjetaRechazada,
        nequiRechazado: DATOS_DE_PRUEBA.nequiRechazado,
      },
    });
  });

  // POST /api/pagos/webhook → confirmación genérica de la pasarela (firma HMAC verificada)
  rutas.post('/pagos/webhook', async (req, res) => {
    verificarFirma(req.cuerpoCrudo, req.get(CABECERA_FIRMA), config.pasarela.secretoWebhook);
    const notificacion = validar(esquemaWebhook, req.body);
    res.json({ recibido: true, ...(await reservas.confirmarPagoDesdePasarela(notificacion)) });
  });

  // GET/PUT /api/admin/configuracion-reserva → horarios por rol o usuario (RF04)
  rutas.get('/admin/configuracion-reserva', soloAdmin, async (_req, res) => {
    res.json({ configuraciones: await reservas.listarConfiguraciones() });
  });

  rutas.put('/admin/configuracion-reserva', soloAdmin, async (req, res) => {
    res.json({ configuracion: await reservas.guardarConfiguracion(validar(esquemaConfiguracion, req.body)) });
  });

  return rutas;
}
