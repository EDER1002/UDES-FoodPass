import { Router } from 'express';
import { validar } from '../../compartido/validacion.js';
import { ROLES } from '../../compartido/roles.js';
import { crearLimitadorDeIntentos } from '../autenticacion/autenticacion.middleware.js';
import { esquemaMensajeAsistente } from './soporte.esquemas.js';

export function rutasSoporte({ soporte, sesion }) {
  const rutas = Router();
  // Frena el abuso del asistente: 40 mensajes cada 10 minutos por persona.
  const limitador = crearLimitadorDeIntentos({ maximo: 40, ventanaMs: 10 * 60 * 1000 });

  // GET /api/soporte/preguntas → preguntas frecuentes de la página de Ayuda (público)
  rutas.get('/soporte/preguntas', (_req, res) => {
    res.json(soporte.listarPreguntas());
  });

  // GET /api/soporte/preguntas/todas → con sesión; al administrador le suma las de administración
  rutas.get('/soporte/preguntas/todas', sesion, (req, res) => {
    res.json(soporte.listarPreguntas({ esAdmin: req.usuario.rol === ROLES.ADMIN }));
  });

  // POST /api/soporte/asistente → responde una pregunta (con sesión)
  rutas.post('/soporte/asistente', sesion, async (req, res) => {
    const clave = String(req.usuario.id);
    limitador.verificar(clave);
    const { mensaje } = validar(esquemaMensajeAsistente, req.body);
    limitador.registrarFallo(clave);
    res.json(await soporte.responder(req.usuario, mensaje));
  });

  return rutas;
}
