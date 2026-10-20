import { ErrorAplicacion, noAutenticado, prohibido } from '../../compartido/errores.js';

/** Exige un JWT válido en `Authorization: Bearer <token>` y deja el usuario en req.usuario. */
export function requiereSesion(auth) {
  return async (req, _res, next) => {
    const [tipo, token] = (req.get('authorization') ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw noAutenticado();
    req.usuario = await auth.validarToken(token);
    next();
  };
}

/** Deja pasar solo a los roles indicados (el rol sale del backend, nunca del cliente). */
export function permitirRoles(...roles) {
  return (req, _res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) throw prohibido();
    next();
  };
}

/**
 * Limita los intentos fallidos de inicio de sesión por IP y correo,
 * para frenar ataques de fuerza bruta.
 */
export function crearLimitadorDeIntentos({ maximo = 10, ventanaMs = 15 * 60 * 1000 } = {}) {
  const intentos = new Map();
  const limpiar = (ahora) => {
    for (const [clave, registro] of intentos) if (ahora - registro.inicio > ventanaMs) intentos.delete(clave);
  };
  return {
    verificar(clave) {
      const ahora = Date.now();
      if (intentos.size > 5000) limpiar(ahora);
      const registro = intentos.get(clave);
      if (registro && ahora - registro.inicio <= ventanaMs && registro.fallos >= maximo) {
        throw new ErrorAplicacion('DEMASIADOS_INTENTOS', 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.', 429);
      }
    },
    registrarFallo(clave) {
      const ahora = Date.now();
      const registro = intentos.get(clave);
      if (!registro || ahora - registro.inicio > ventanaMs) intentos.set(clave, { inicio: ahora, fallos: 1 });
      else registro.fallos += 1;
    },
    reiniciar(clave) {
      intentos.delete(clave);
    },
  };
}
