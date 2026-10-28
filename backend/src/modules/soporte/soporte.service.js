import { ROLES } from '../../compartido/roles.js';
import { horaLegible } from '../../compartido/reloj.js';
import { PREGUNTAS, TEMAS } from './preguntas-frecuentes.js';

/**
 * SoporteService: preguntas frecuentes y el asistente de la app.
 *
 * El asistente no usa IA externa (decisión del usuario): reconoce algunas
 * preguntas sobre el día de hoy (menú, horario, mi reserva) y las responde
 * con datos reales pidiéndolos a los otros módulos; para lo demás busca la
 * pregunta frecuente que más se parece. No tiene tablas propias.
 */
export class SoporteService {
  constructor({ menu, reservas, reloj }) {
    this.menu = menu;
    this.reservas = reservas;
    this.reloj = reloj;
  }

  /** Temas y preguntas de la página de Ayuda. Las de administración solo se muestran a administradores. */
  listarPreguntas({ esAdmin = false } = {}) {
    const temas = TEMAS.filter((t) => esAdmin || !t.soloAdmin);
    const ids = new Set(temas.map((t) => t.id));
    return {
      temas: temas.map(({ id, nombre }) => ({ id, nombre })),
      preguntas: PREGUNTAS.filter((p) => ids.has(p.tema)).map(({ id, tema, pregunta, respuesta }) => ({ id, tema, pregunta, respuesta })),
    };
  }

  /** Responde un mensaje del asistente: { respuesta, relacionadas, tipo }. */
  async responder(usuario, mensaje) {
    const texto = normalizar(mensaje);
    const esAdmin = usuario.rol === ROLES.ADMIN;

    if (!texto) return this.#sinCoincidencia(esAdmin);
    if (esSaludo(texto)) {
      return respuesta('saludo', 'Hola, soy el asistente de UDES FoodPass. Pregúntame por el menú de hoy, la hora límite, tu reserva, los pagos, el ficho QR o cómo recuperar tu contraseña.', this.#populares(esAdmin));
    }
    if (esAgradecimiento(texto)) return respuesta('gracias', '¡Con gusto! Si necesitas algo más, aquí estoy. Buen provecho.');

    if (!esAdmin) {
      const intencion = detectarIntencion(texto);
      if (intencion === 'menu') return this.#menuDeHoy();
      if (intencion === 'horario') return this.#horarioDeHoy(usuario);
      if (intencion === 'reserva') return this.#miReserva(usuario);
    }

    const candidatas = PREGUNTAS.filter((p) => esAdmin || p.tema !== 'admin')
      .map((p) => ({ p, puntaje: puntuar(texto, p) }))
      .filter((c) => c.puntaje >= 1)
      .sort((a, b) => b.puntaje - a.puntaje);
    if (!candidatas.length) return this.#sinCoincidencia(esAdmin);
    const [mejor, ...otras] = candidatas;
    return respuesta('pregunta', mejor.p.respuesta, otras.slice(0, 2).map((c) => c.p), mejor.p.pregunta);
  }

  async #menuDeHoy() {
    let menu;
    try {
      menu = await this.menu.consultarMenu(this.reloj.hoy());
    } catch (error) {
      if (error.codigo === 'MENU_NO_DISPONIBLE') return respuesta('menu', 'Todavía no hay un menú publicado para hoy. Vuelve a revisar en un rato.');
      throw error;
    }
    const conPorciones = (lista) => lista.filter((x) => x.porciones > 0).map((x) => x.nombre);
    const proteinas = conPorciones(menu.proteinas);
    const acompanamientos = conPorciones(menu.acompanamientos);
    if (!proteinas.length || menu.cantidadDisponible === 0) {
      return respuesta('menu', 'Hoy ya se agotaron las porciones del menú. Lo siento.');
    }
    const precios = menu.tipos.map((t) => `${t.nombre} ${pesos(t.precio)}`).join(' · ');
    return respuesta(
      'menu',
      `Hoy hay ${lista(proteinas)} de proteína, con ${lista(acompanamientos)}. ${precios ? `Precios: ${precios}.` : ''} Para elegir, ve a Inicio.`.replace(/\s+/g, ' ').trim(),
      [],
    );
  }

  async #horarioDeHoy(usuario) {
    const { horario } = await this.reservas.contextoDelDia(usuario);
    if (horario.abierto) {
      return respuesta('horario', `Las reservas están abiertas. Puedes reservar hoy hasta las ${horaLegible(horario.fin)}.`);
    }
    return respuesta('horario', horario.motivo ? `${horario.motivo.replace(/\.?$/, '.')}` : 'Ahora no se puede reservar.');
  }

  async #miReserva(usuario) {
    const contexto = await this.reservas.contextoDelDia(usuario);
    const activa = contexto.reservaActiva;
    if (!activa) {
      const extra = contexto.horario.abierto ? ` Aún puedes reservar hasta las ${horaLegible(contexto.horario.fin)}.` : '';
      return respuesta('reserva', `No tienes una reserva activa para hoy.${extra}`);
    }
    if (activa.estado === 'CONFIRMADA') {
      return respuesta('reserva', `Tu reserva de hoy está confirmada${activa.tipoReserva === 'SUBSIDIADA' ? ' con subsidio' : ''}. Muestra tu ficho QR (sección QR's) en la caja de la cafetería para reclamar tu almuerzo.`);
    }
    if (activa.estado === 'PENDIENTE_PAGO') {
      return respuesta(
        'reserva',
        activa.conPago
          ? 'Tu reserva está esperando la respuesta del banco (PSE). Apenas confirme el pago verás tu ficho QR.'
          : `Tu reserva está pendiente de pago. Tienes ${contexto.minutosParaPagar} minutos desde que elegiste para pagarla en la sección Pagos.`,
      );
    }
    return respuesta('reserva', 'Revisa la sección Pagos para ver el estado de tu reserva.');
  }

  #populares(esAdmin) {
    const ids = esAdmin ? ['admin-recuperacion', 'admin-validar', 'admin-menu'] : ['como-reservar', 'olvide-contrasena', 'reclamar'];
    return ids.map((id) => PREGUNTAS.find((p) => p.id === id));
  }

  #sinCoincidencia(esAdmin) {
    return respuesta(
      'sin-respuesta',
      'No estoy seguro de haber entendido. Prueba con otras palabras, revisa estas preguntas o acércate a la caja de la cafetería principal (zona de buses).',
      this.#populares(esAdmin),
    );
  }
}

function respuesta(tipo, texto, relacionadas = [], pregunta = null) {
  return {
    tipo,
    respuesta: texto,
    ...(pregunta ? { pregunta } : {}),
    relacionadas: relacionadas.map((p) => ({ id: p.id, pregunta: p.pregunta })),
  };
}

/** Minúsculas, sin tildes ni signos: "¿Cuál es el MENÚ?" → "cual es el menu". */
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PALABRAS_VACIAS = new Set(
  'a al como con cual cuales de del el en es esta este hay la las lo los me mi mis no o para por que se si su sus te tu un una y ya yo puedo hago hacer dice'.split(' '),
);

const contiene = (texto, frase) => ` ${texto} `.includes(` ${frase} `);

// Raíz aproximada para que "rechazaron" y "rechazado" coincidan.
const raiz = (palabra) => (palabra.length > 5 ? palabra.slice(0, 5) : palabra);

/** Puntaje de parecido: frases clave (pesan más si son largas) + palabras en común con la pregunta. */
function puntuar(texto, p) {
  const raices = new Set(texto.split(' ').filter((t) => t.length > 2 && !PALABRAS_VACIAS.has(t)).map(raiz));
  let puntaje = 0;
  for (const palabra of new Set(p.palabras.map(normalizar))) {
    if (contiene(texto, palabra)) puntaje += palabra.split(' ').length;
    else if (!palabra.includes(' ') && raices.has(raiz(palabra))) puntaje += 0.75;
  }
  for (const t of new Set(normalizar(p.pregunta).split(' '))) {
    if (t.length > 2 && !PALABRAS_VACIAS.has(t) && raices.has(raiz(t))) puntaje += 0.5;
  }
  return puntaje;
}

const esSaludo = (t) => /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal)( [a-z]+)?$/.test(t);
const esAgradecimiento = (t) => /^(muchas )?(gracias|grac|ok gracias|listo gracias|mil gracias)( [a-z]+)?$/.test(t);

/** Preguntas sobre el día de hoy que se responden con datos reales. */
function detectarIntencion(t) {
  // Estas palabras apuntan a una pregunta frecuente, no a los datos de hoy.
  if (/\b(contrasena|clave|cuenta|registr|cancel|reembols|devol|rechaz|subsidio)/.test(t)) return null;
  if (/\b(menu|que hay|que dan|que (almuerzo|comida)|proteinas?|acompanamientos?|platos?|precios?|cuanto (cuesta|vale))\b/.test(t)) return 'menu';
  if (/\b(mi reserva|mis reservas|mi pedido|ya reserve|estado de mi|tengo reserva|reserve)\b/.test(t)) return 'reserva';
  if (/\b(hasta que hora|a que hora|hora limite|horario|cierran|cierra|abren|abre)\b/.test(t)) return 'horario';
  return null;
}

const lista = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`).toLowerCase();
const pesos = (valor) => `$${Number(valor).toLocaleString('es-CO')}`;
