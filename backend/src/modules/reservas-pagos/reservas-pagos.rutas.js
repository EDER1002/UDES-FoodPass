import { Router } from 'express';
import { ErrorAplicacion } from '../../compartido/errores.js';
import { validar } from '../../compartido/validacion.js';
import { ROLES_COMENSALES, ROLES_QUE_PAGAN } from '../../compartido/roles.js';
import { permitirRoles } from '../autenticacion/autenticacion.middleware.js';
import { DATOS_DE_PRUEBA } from './pagos/pasarela/PasarelaSandbox.js';
import { estadoDesdeWompi, verificarEventoWompi } from './pagos/pasarela/PasarelaWompi.js';
import { CABECERA_FIRMA, esquemaEventoWompi, esquemaWebhook, verificarFirma } from './pagos/webhook.js';
import {
  esquemaClaveIdempotencia,
  esquemaConfiguracion,
  esquemaIdReserva,
  esquemaPago,
  esquemaPedido,
} from './reservas-pagos.esquemas.js';

export function rutasReservasPagos({ reservas, pasarela, config, sesion, soloAdmin }) {
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

  // Medios de pago disponibles y datos de prueba (sandbox propio o de Wompi)
  rutas.get('/pagos/medios', sesion, (_req, res) => {
    const wompi = config.pasarela.modo === 'wompi';
    const prueba = wompi ? pasarela.datosDePrueba : DATOS_DE_PRUEBA;
    res.json({
      modo: config.pasarela.modo,
      metodos: ['NEQUI', 'PSE', 'TARJETA'],
      bancosPse: pasarela.bancosPse(),
      terminos: wompi ? pasarela.terminos() : null,
      datosDePrueba: prueba
        ? {
            tarjetaAprobada: prueba.tarjetaAprobada,
            tarjetaRechazada: prueba.tarjetaRechazada,
            nequiAprobado: prueba.nequiAprobado ?? null,
            nequiRechazado: prueba.nequiRechazado,
          }
        : null,
    });
  });

  // POST /api/pagos/webhook → confirmación genérica de la pasarela (firma HMAC verificada)
  rutas.post('/pagos/webhook', async (req, res) => {
    verificarFirma(req.cuerpoCrudo, req.get(CABECERA_FIRMA), config.pasarela.secretoWebhook);
    const notificacion = validar(esquemaWebhook, req.body);
    res.json({ recibido: true, ...(await reservas.confirmarPagoDesdePasarela(notificacion)) });
  });

  // POST /api/pagos/webhook/wompi → eventos de Wompi (checksum SHA-256 con el secreto de eventos)
  rutas.post('/pagos/webhook/wompi', async (req, res) => {
    if (config.pasarela.modo !== 'wompi') throw new ErrorAplicacion('NO_ENCONTRADO', 'Esta ruta no existe.', 404);
    if (!verificarEventoWompi(req.body, config.pasarela.wompi.secretoEventos)) {
      throw new ErrorAplicacion('FIRMA_INVALIDA', 'La firma del evento de Wompi no es válida.', 401);
    }
    const evento = validar(esquemaEventoWompi, req.body);
    const estado = estadoDesdeWompi(evento.data.transaction.status);
    // Wompi reintenta si no recibe 200: los eventos que no cambian nada también se confirman.
    if (evento.event !== 'transaction.updated' || estado === 'PENDIENTE') return res.json({ recibido: true });
    try {
      res.json({ recibido: true, ...(await reservas.confirmarPagoDesdePasarela({ referencia: evento.data.transaction.reference, estado })) });
    } catch (error) {
      // Una transacción del comercio que no salió de FoodPass: se confirma para que Wompi no la reenvíe.
      if (error.codigo === 'PAGO_NO_ENCONTRADO') return res.json({ recibido: true, procesado: false });
      throw error;
    }
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
