// Formatos para Colombia: pesos sin decimales y horas en formato de 12 horas.

export function dinero(valor) {
  return `$${Math.round(valor ?? 0).toLocaleString('es-CO')}`;
}

/** '06:00:00' → '6:00 a. m.' */
export function hora(texto) {
  if (!texto) return '';
  const [h, m] = texto.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const aFecha = (texto) => new Date(`${texto}T12:00:00Z`);

/** '2026-10-19' → 'lunes 19 de octubre' */
export function fechaLarga(texto, { conAnio = false } = {}) {
  if (!texto) return '';
  const d = aFecha(texto);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}${conAnio ? ` de ${d.getUTCFullYear()}` : ''}`;
}

/** '2026-10-19' → 'lun 19 oct' */
export function fechaCorta(texto) {
  if (!texto) return '';
  const d = aFecha(texto);
  return `${DIAS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`;
}

export const mayuscula = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

export const segundosDelDia = (texto) => {
  const [h, m, s = 0] = texto.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

/** 4320 → '1 h 12 min' */
export function duracion(segundos) {
  const total = Math.max(0, Math.round(segundos / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export const NOMBRE_METODO = { NEQUI: 'Nequi', PSE: 'PSE', TARJETA: 'Tarjeta' };

/** Fecha y hora local de Bogotá a partir de un instante ISO. */
export function horaDeInstante(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

/** Fecha de hoy en Bogotá ('AAAA-MM-DD'), según el reloj del dispositivo. */
export const hoyEnBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

/** Suma días a 'AAAA-MM-DD'. */
export function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
