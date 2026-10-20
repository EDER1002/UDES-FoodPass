const BASE = import.meta.env.VITE_API_URL || '/api';

/** Error de la API con el formato uniforme { error: { codigo, mensaje, detalles } }. */
export class ErrorApi extends Error {
  constructor(codigo, mensaje, estado, detalles) {
    super(mensaje);
    this.codigo = codigo;
    this.estado = estado;
    this.detalles = detalles;
  }
}

export const MENSAJE_SIN_CONEXION = 'No pudimos comunicarnos con el sistema. Revisa tus datos móviles o el Wi‑Fi.';

/**
 * Llama a la API REST. El frontend solo presenta el flujo: precios,
 * porciones, horarios, pagos y fichos los decide siempre el backend.
 */
export async function llamarApi(ruta, { metodo = 'GET', cuerpo, token, encabezados = {}, senal } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...encabezados,
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      signal: senal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ErrorApi('SIN_CONEXION', MENSAJE_SIN_CONEXION, 0);
  }
  if (respuesta.status === 204) return null;
  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    // Respuesta sin JSON (por ejemplo, el backend está apagado y responde el proxy)
  }
  if (!respuesta.ok) {
    if (!datos?.error && respuesta.status >= 500) throw new ErrorApi('SIN_CONEXION', MENSAJE_SIN_CONEXION, respuesta.status);
    throw new ErrorApi(datos?.error?.codigo ?? 'ERROR', datos?.error?.mensaje ?? 'Ocurrió un error inesperado.', respuesta.status, datos?.error?.detalles);
  }
  return datos;
}

/**
 * Clave de idempotencia para un intento de pago. Usa getRandomValues porque
 * randomUUID no existe en páginas sin HTTPS (por ejemplo, al probar en la red local).
 */
export function generarClaveIdempotencia() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
