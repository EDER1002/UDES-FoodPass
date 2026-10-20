/**
 * Error de negocio con código y mensaje en español. Se responde siempre con
 * el formato uniforme { error: { codigo, mensaje } }.
 */
export class ErrorAplicacion extends Error {
  constructor(codigo, mensaje, estadoHttp = 400, detalles = undefined) {
    super(mensaje);
    this.codigo = codigo;
    this.estadoHttp = estadoHttp;
    this.detalles = detalles;
  }
}

export const noEncontrado = (codigo, mensaje) => new ErrorAplicacion(codigo, mensaje, 404);
export const conflicto = (codigo, mensaje, detalles) => new ErrorAplicacion(codigo, mensaje, 409, detalles);
export const prohibido = (mensaje = 'No tienes permiso para hacer esto.') =>
  new ErrorAplicacion('ACCESO_DENEGADO', mensaje, 403);
export const noAutenticado = (mensaje = 'Inicia sesión para continuar.') =>
  new ErrorAplicacion('NO_AUTENTICADO', mensaje, 401);

/** ¿El error es una violación de restricción de PostgreSQL? */
export const esViolacionUnica = (error, restriccion) =>
  error?.code === '23505' && (!restriccion || error.constraint === restriccion);
export const esViolacionLlaveForanea = (error) => error?.code === '23503';

/** Middleware final de Express: traduce cualquier error al formato uniforme. */
export function manejarErrores(error, req, res, _next) {
  if (error instanceof ErrorAplicacion) {
    return res.status(error.estadoHttp).json({
      error: { codigo: error.codigo, mensaje: error.message, ...(error.detalles ? { detalles: error.detalles } : {}) },
    });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es un JSON válido.' } });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: { codigo: 'PETICION_MUY_GRANDE', mensaje: 'La petición es demasiado grande.' } });
  }
  console.error('[error no controlado]', error);
  return res.status(500).json({
    error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. Inténtalo de nuevo en un momento.' },
  });
}

export function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'La ruta solicitada no existe.' } });
}
