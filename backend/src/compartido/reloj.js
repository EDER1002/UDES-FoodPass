// Todas las reglas de horario se calculan en America/Bogota (UTC-5).
// Colombia no tiene horario de verano, por eso el desfase es fijo.
export const ZONA_HORARIA = 'America/Bogota';
const DESFASE = '-05:00';

const formato = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Reloj del sistema. Se inyecta en los servicios para que las pruebas puedan
 * fijar la hora (por ejemplo, "fuera del horario de reservas").
 */
export function crearReloj(ahora = () => new Date()) {
  const partes = (instante = ahora()) => {
    const p = Object.fromEntries(formato.formatToParts(instante).map((x) => [x.type, x.value]));
    return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}:${p.second}` };
  };
  return {
    ahora,
    /** Fecha y hora actuales en Bogotá: { fecha: 'AAAA-MM-DD', hora: 'HH:MM:SS' } */
    partes,
    hoy: () => partes().fecha,
    /** Instante exacto de una fecha y hora de Bogotá. */
    instante: (fecha, hora) => new Date(`${fecha}T${hora}${DESFASE}`),
    /** Último instante del día en Bogotá (vencimiento del ficho). */
    finDelDia: (fecha) => new Date(`${fecha}T23:59:59.999${DESFASE}`),
  };
}

/** Reloj detenido en una fecha y hora de Bogotá. Solo para pruebas. */
export function relojFijo(fecha, hora) {
  let instante = new Date(`${fecha}T${hora}${DESFASE}`);
  const reloj = crearReloj(() => instante);
  reloj.mover = (nuevaFecha, nuevaHora) => {
    instante = new Date(`${nuevaFecha}T${nuevaHora}${DESFASE}`);
  };
  return reloj;
}

/** Suma días a una fecha 'AAAA-MM-DD'. */
export function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** '2026-10-19' → '19/10/2026' */
export function fechaLegible(fecha) {
  if (!fecha) return '';
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** '06:00:00' → '6:00 a. m.' */
export function horaLegible(hora) {
  const [h, m] = hora.split(':').map(Number);
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
}
