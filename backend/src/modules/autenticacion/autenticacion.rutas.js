import { Router } from 'express';
import { z } from 'zod';
import { idPositivo, validar } from '../../compartido/validacion.js';
import { crearLimitadorDeIntentos } from './autenticacion.middleware.js';
import {
  esquemaAprobacion,
  esquemaBusquedaUsuarios,
  esquemaLogin,
  esquemaRechazo,
  esquemaRegistro,
  esquemaRestablecer,
  esquemaSolicitarAyuda,
  esquemaSolicitarCodigo,
} from './autenticacion.esquemas.js';

const esquemaId = z.object({ id: idPositivo('La solicitud') });

export function rutasAutenticacion({ auth, sesion, soloAdmin }) {
  const rutas = Router();
  const limitador = crearLimitadorDeIntentos();
  // Cada registro cuenta como intento: frena la creación masiva de cuentas desde una IP.
  // Es holgado porque en el campus muchos estudiantes comparten la misma IP.
  const limitadorRegistro = crearLimitadorDeIntentos({ maximo: 30, ventanaMs: 15 * 60 * 1000 });
  // Recuperación: pocos códigos por correo (no llenar el buzón de nadie) y pocos intentos por IP.
  const limitadorCodigoCorreo = crearLimitadorDeIntentos({ maximo: 3, ventanaMs: 15 * 60 * 1000 });
  const limitadorRecuperacionIp = crearLimitadorDeIntentos({ maximo: 30, ventanaMs: 15 * 60 * 1000 });

  // POST /api/auth/login → iniciarSesion() (público)
  rutas.post('/auth/login', async (req, res) => {
    const { correo, contrasena } = validar(esquemaLogin, req.body);
    const clave = `${req.ip}|${correo}`;
    limitador.verificar(clave);
    try {
      const resultado = await auth.iniciarSesion(correo, contrasena);
      limitador.reiniciar(clave);
      res.json(resultado);
    } catch (error) {
      if (error.codigo === 'CREDENCIALES_INVALIDAS') limitador.registrarFallo(clave);
      throw error;
    }
  });

  // POST /api/auth/registro → cada persona crea su cuenta y elige su rol (público)
  rutas.post('/auth/registro', async (req, res) => {
    limitadorRegistro.verificar(req.ip);
    const datos = validar(esquemaRegistro, req.body);
    limitadorRegistro.registrarFallo(req.ip);
    const resultado = await auth.registrarse(datos);
    res.status(201).json(resultado);
  });

  // POST /api/auth/recuperar/codigo → envía un código al correo (público)
  rutas.post('/auth/recuperar/codigo', async (req, res) => {
    limitadorRecuperacionIp.verificar(req.ip);
    const { correo } = validar(esquemaSolicitarCodigo, req.body);
    limitadorCodigoCorreo.verificar(correo);
    limitadorCodigoCorreo.registrarFallo(correo);
    limitadorRecuperacionIp.registrarFallo(req.ip);
    res.json(await auth.solicitarCodigoRecuperacion(correo));
  });

  // POST /api/auth/recuperar/ayuda → pide ayuda al administrador (público)
  rutas.post('/auth/recuperar/ayuda', async (req, res) => {
    limitadorRecuperacionIp.verificar(req.ip);
    const { correo, documento } = validar(esquemaSolicitarAyuda, req.body);
    limitadorRecuperacionIp.registrarFallo(req.ip);
    res.json(await auth.solicitarAyudaRecuperacion(correo, documento));
  });

  // POST /api/auth/recuperar/restablecer → código + contraseña nueva (público)
  rutas.post('/auth/recuperar/restablecer', async (req, res) => {
    const datos = validar(esquemaRestablecer, req.body);
    const clave = `${req.ip}|${datos.correo}`;
    limitador.verificar(clave);
    try {
      res.json(await auth.restablecerContrasena(datos));
    } catch (error) {
      if (error.codigo?.startsWith('CODIGO_')) limitador.registrarFallo(clave);
      throw error;
    }
  });

  // GET /api/auth/me → datos del usuario autenticado
  rutas.get('/auth/me', sesion, async (req, res) => {
    res.json({ usuario: await auth.obtenerUsuario(req.usuario.id) });
  });

  // Apoyo para la pantalla de horarios del administrador
  rutas.get('/admin/roles', soloAdmin, async (_req, res) => {
    res.json({ roles: await auth.listarRoles() });
  });

  rutas.get('/admin/usuarios', soloAdmin, async (req, res) => {
    const { buscar } = validar(esquemaBusquedaUsuarios, req.query);
    res.json({ usuarios: await auth.buscarUsuarios(buscar) });
  });

  // Solicitudes de cuenta (subsidiado, empleado y administrador se verifican aquí)
  rutas.get('/admin/solicitudes', soloAdmin, async (_req, res) => {
    res.json({ solicitudes: await auth.listarSolicitudes() });
  });

  rutas.post('/admin/solicitudes/:id/aprobar', soloAdmin, async (req, res) => {
    const { id } = validar(esquemaId, req.params);
    const datos = validar(esquemaAprobacion, req.body ?? {});
    res.json({ usuario: await auth.aprobarCuenta(id, req.usuario.id, datos) });
  });

  rutas.post('/admin/solicitudes/:id/rechazar', soloAdmin, async (req, res) => {
    const { id } = validar(esquemaId, req.params);
    const { motivo } = validar(esquemaRechazo, req.body);
    res.json({ usuario: await auth.rechazarCuenta(id, req.usuario.id, motivo) });
  });

  // Ayuda para recuperar la contraseña (el administrador verifica en persona)
  rutas.get('/admin/recuperaciones', soloAdmin, async (_req, res) => {
    res.json({ solicitudes: await auth.listarSolicitudesAyuda() });
  });

  rutas.post('/admin/recuperaciones/:id/codigo', soloAdmin, async (req, res) => {
    const { id } = validar(esquemaId, req.params);
    // El código se muestra una sola vez: que ningún navegador o proxy lo guarde.
    res.set('Cache-Control', 'no-store');
    res.json(await auth.generarCodigoPorAdministrador(id));
  });

  rutas.post('/admin/recuperaciones/:id/descartar', soloAdmin, async (req, res) => {
    const { id } = validar(esquemaId, req.params);
    await auth.descartarSolicitudAyuda(id);
    res.status(204).end();
  });

  return rutas;
}
