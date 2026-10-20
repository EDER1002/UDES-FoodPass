import { Router } from 'express';
import { validar } from '../../compartido/validacion.js';
import { crearLimitadorDeIntentos } from './autenticacion.middleware.js';
import { esquemaBusquedaUsuarios, esquemaLogin } from './autenticacion.esquemas.js';

export function rutasAutenticacion({ auth, sesion, soloAdmin }) {
  const rutas = Router();
  const limitador = crearLimitadorDeIntentos();

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

  return rutas;
}
