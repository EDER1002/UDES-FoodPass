import { Router } from 'express';
import { z } from 'zod';
import { permitirRoles } from '../autenticacion/autenticacion.middleware.js';
import { ROLES_COMENSALES } from '../../compartido/roles.js';
import { fechaIso, idPositivo, validar } from '../../compartido/validacion.js';

const esquemaToken = z.object({ token: z.string({ error: 'Escanea el QR o escribe el token' }).trim().min(1, { error: 'Escanea el QR o escribe el token' }).max(40) });
const esquemaId = z.object({ id: idPositivo('El ficho') });

export function rutasValidacionQR({ fichos, reservas, auth, reloj, sesion, soloAdmin }) {
  const rutas = Router();

  // GET /api/fichos/actual → ficho vigente del usuario (Mi Ficho)
  rutas.get('/fichos/actual', sesion, permitirRoles(...ROLES_COMENSALES), async (req, res) => {
    res.json({ reserva: await reservas.reservaVigenteDeHoy(req.usuario) });
  });

  // POST /api/admin/fichos/validar → validarQR(token): consulta el pedido
  rutas.post('/admin/fichos/validar', soloAdmin, async (req, res) => {
    const { token } = validar(esquemaToken, req.body);
    try {
      res.json(await fichos.validarQR(token));
    } catch (error) {
      // Para el segundo escaneo, se agrega quién recibió el almuerzo y quién lo entregó.
      if (error.codigo === 'FICHO_YA_USADO' && error.detalles) {
        const reserva = await reservas.obtenerReserva(error.detalles.idReserva);
        const validador = error.detalles.idValidador ? await auth.obtenerUsuario(error.detalles.idValidador) : null;
        error.detalles = { ...error.detalles, titular: reserva.comensal?.nombreCompleto ?? null, validador: validador?.nombreCompleto ?? null };
      }
      throw error;
    }
  });

  // POST /api/admin/fichos/:id/entregar → registra la entrega y marca el ficho como USADO
  rutas.post('/admin/fichos/:id/entregar', soloAdmin, async (req, res) => {
    const { id } = validar(esquemaId, req.params);
    const resultado = await fichos.registrarEntrega(id, req.usuario.id);
    res.json({ ...resultado, reserva: await reservas.obtenerReserva(resultado.ficho.idReserva) });
  });

  // GET /api/admin/entregas?fecha= → entregas del día
  rutas.get('/admin/entregas', soloAdmin, async (req, res) => {
    const { fecha } = validar(z.object({ fecha: fechaIso }), { fecha: req.query.fecha ?? reloj.hoy() });
    const [entregas, resumen] = await Promise.all([fichos.listarEntregas(fecha), reservas.resumenDelDia(fecha)]);
    const validadores = await auth.obtenerUsuarios(entregas.map((e) => e.idUsuarioEmpleado));
    res.json({
      fecha,
      resumen,
      entregas: entregas.map((e) => ({ ...e, validador: validadores.get(e.idUsuarioEmpleado)?.nombreCompleto ?? null })),
    });
  });

  return rutas;
}
