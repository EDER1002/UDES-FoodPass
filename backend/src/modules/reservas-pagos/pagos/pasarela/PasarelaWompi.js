import crypto from 'node:crypto';

/**
 * Adaptador de la pasarela real Wompi (Bancolombia). Tiene los mismos métodos
 * que PasarelaSandbox (cobrar, bancosPse), así que las estrategias no cambian.
 *
 * - En el ambiente "sandbox" de Wompi no se mueve dinero real y sirven los
 *   mismos datos de prueba del README.
 * - Los datos de la tarjeta se convierten en un token de Wompi antes de crear
 *   la transacción; nunca se guardan.
 * - Una transacción que sigue PENDIENTE (Nequi espera la aprobación en el
 *   celular y PSE espera al banco) se resuelve con el evento que Wompi envía a
 *   POST /api/pagos/webhook/wompi.
 */
export const URLS_WOMPI = Object.freeze({
  sandbox: 'https://sandbox.wompi.co/v1',
  produccion: 'https://production.wompi.co/v1',
});

/** Datos de prueba del ambiente sandbox de Wompi. */
export const DATOS_DE_PRUEBA_WOMPI = Object.freeze({
  tarjetaAprobada: '4242424242424242',
  tarjetaRechazada: '4111111111111111',
  nequiAprobado: '3991111111',
  nequiRechazado: '3992222222',
});

const ESTADOS = Object.freeze({
  APPROVED: 'APROBADO',
  DECLINED: 'RECHAZADO',
  VOIDED: 'RECHAZADO',
  ERROR: 'RECHAZADO',
  PENDING: 'PENDIENTE',
});

/** Traduce el estado de Wompi al de FoodPass. */
export function estadoDesdeWompi(estado) {
  return ESTADOS[estado] ?? 'PENDIENTE';
}

/**
 * Verifica el checksum de un evento de Wompi: SHA-256 de los valores de
 * `signature.properties` (leídos de `data`), seguidos de `timestamp` y del
 * secreto de eventos. Devuelve true si coincide.
 */
export function verificarEventoWompi(evento, secretoEventos) {
  const propiedades = evento?.signature?.properties;
  const recibido = String(evento?.signature?.checksum ?? '').toLowerCase();
  if (!Array.isArray(propiedades) || !recibido || evento.timestamp == null) return false;
  const valores = propiedades
    .map((ruta) => String(ruta).split('.').reduce((obj, clave) => (obj == null ? undefined : obj[clave]), evento.data))
    .map((v) => (v == null ? '' : String(v)))
    .join('');
  const esperado = crypto.createHash('sha256').update(`${valores}${evento.timestamp}${secretoEventos}`).digest('hex');
  return esperado.length === recibido.length && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recibido));
}

/** Firma de integridad que Wompi exige al crear la transacción. */
export function firmaIntegridad({ referencia, montoEnCentavos, moneda = 'COP', secreto }) {
  return crypto.createHash('sha256').update(`${referencia}${montoEnCentavos}${moneda}${secreto}`).digest('hex');
}

export class PasarelaWompi {
  /** Wompi responde estos pagos por el webhook: un pendiente nunca se da por rechazado. */
  confirmaPorWebhook = true;
  #bancos = [];
  #terminos = null;

  constructor({
    ambiente = 'sandbox',
    llavePublica,
    llavePrivada,
    secretoIntegridad,
    urlRetorno,
    fetch: fetchInyectado = globalThis.fetch,
    esperaMs = 1000,
    consultas = 6,
  }) {
    this.base = URLS_WOMPI[ambiente];
    this.ambiente = ambiente;
    this.llavePublica = llavePublica;
    this.llavePrivada = llavePrivada;
    this.secretoIntegridad = secretoIntegridad;
    this.urlRetorno = urlRetorno;
    this.fetch = fetchInyectado;
    this.esperaMs = esperaMs;
    this.consultas = consultas;
  }

  /** Carga la lista de bancos PSE y los términos del comercio. Se llama al arrancar el servidor. */
  async iniciar() {
    const [bancos, comercio] = await Promise.all([
      this.#pedir('GET', '/pse/financial_institutions', { llave: this.llavePublica }),
      this.#pedir('GET', `/merchants/${this.llavePublica}`, { llave: this.llavePublica }),
    ]);
    this.#bancos = bancos
      .filter((b) => b.financial_institution_code !== '0')
      .map((b) => Object.freeze({ codigo: String(b.financial_institution_code), nombre: b.financial_institution_name }));
    this.#terminos = {
      terminos: comercio.presigned_acceptance?.permalink ?? null,
      datosPersonales: comercio.presigned_personal_data_auth?.permalink ?? null,
    };
  }

  get esDePrueba() {
    return this.ambiente === 'sandbox';
  }

  get datosDePrueba() {
    return this.esDePrueba ? DATOS_DE_PRUEBA_WOMPI : null;
  }

  bancosPse() {
    return this.#bancos;
  }

  /** Enlaces que la persona acepta al pagar (Wompi exige mostrarlos). */
  terminos() {
    return this.#terminos;
  }

  async cobrar({ metodo, referencia, monto, datos, pagador = {} }) {
    const respuesta = (estado, motivo = null, extra = {}) => ({ estado, motivo, referencia, monto, ...extra });
    let transaccion;
    try {
      // Los tokens de aceptación se piden de nuevo en cada pago: vencen.
      const comercio = await this.#pedir('GET', `/merchants/${this.llavePublica}`, { llave: this.llavePublica });
      const montoEnCentavos = monto * 100;
      const cuerpo = {
        acceptance_token: comercio.presigned_acceptance?.acceptance_token,
        accept_personal_auth: comercio.presigned_personal_data_auth?.acceptance_token,
        amount_in_cents: montoEnCentavos,
        currency: 'COP',
        signature: firmaIntegridad({ referencia, montoEnCentavos, secreto: this.secretoIntegridad }),
        customer_email: pagador.correo,
        reference: referencia,
        payment_method: await this.#medioDePago(metodo, datos, pagador),
      };
      if (metodo === 'PSE') {
        cuerpo.redirect_url = this.urlRetorno;
        cuerpo.customer_data = { full_name: pagador.nombreCompleto, phone_number: pagador.telefono ?? undefined };
      }
      transaccion = await this.#crearTransaccion(cuerpo);
    } catch (error) {
      if (error.rechazo) return respuesta('RECHAZADO', error.rechazo);
      throw error; // Antes de crear la transacción: no hubo cobro (ProcesadorDePagos lo da por rechazado)
    }
    if (!transaccion) return respuesta('RECHAZADO', 'No pudimos comunicarnos con la entidad de pago. No se hizo ningún cobro.');
    try {
      transaccion = await this.#esperarResultado(transaccion, metodo);
    } catch {
      // La transacción ya existe en Wompi: su resultado llegará por el webhook.
    }

    const estado = estadoDesdeWompi(transaccion.status);
    const extra = { idTransaccion: transaccion.id };
    if (estado === 'APROBADO') return respuesta('APROBADO', null, extra);
    if (estado === 'RECHAZADO') return respuesta('RECHAZADO', motivoRechazo(transaccion), extra);
    const urlBanco = transaccion.payment_method?.extra?.async_payment_url ?? null;
    const motivo = metodo === 'NEQUI' ? 'Aprueba el pago en la notificación que te llegó a Nequi.' : 'El banco está procesando el pago.';
    return respuesta('PENDIENTE', motivo, { ...extra, urlBanco });
  }

  async #medioDePago(metodo, datos, pagador) {
    switch (metodo) {
      case 'TARJETA': {
        const [mes, anio] = datos.vencimiento.split('/');
        const token = await this.#pedir('POST', '/tokens/cards', {
          llave: this.llavePublica,
          cuerpo: { number: datos.numero, cvc: datos.cvc, exp_month: mes, exp_year: anio, card_holder: datos.titular },
        });
        return { type: 'CARD', token: token.id, installments: datos.cuotas ?? 1 };
      }
      case 'NEQUI':
        return { type: 'NEQUI', phone_number: datos.telefono };
      case 'PSE':
        return {
          type: 'PSE',
          user_type: datos.tipoPersona === 'JURIDICA' ? 1 : 0,
          user_legal_id_type: datos.tipoPersona === 'JURIDICA' ? 'NIT' : 'CC',
          user_legal_id: datos.documento,
          financial_institution_code: datos.banco,
          payment_description: `Almuerzo UDES FoodPass ${pagador.nombreCompleto ?? ''}`.trim().slice(0, 64),
        };
      default: {
        const error = new Error('Medio no soportado');
        error.rechazo = 'Medio de pago no soportado por la pasarela.';
        throw error;
      }
    }
  }

  /**
   * Crea la transacción. Si la respuesta se pierde (por ejemplo, un corte de red),
   * no se sabe si Wompi la creó: se busca por la referencia. Devuelve null si no existe.
   */
  async #crearTransaccion(cuerpo) {
    try {
      return await this.#pedir('POST', '/transactions', { llave: this.llavePublica, cuerpo });
    } catch (error) {
      if (error.rechazo) throw error;
      const encontradas = await this.#pedir('GET', `/transactions?reference=${encodeURIComponent(cuerpo.reference)}`, { llave: this.llavePrivada });
      return encontradas?.[0] ?? null;
    }
  }

  /**
   * Consulta la transacción unos segundos: la tarjeta suele resolverse enseguida,
   * y PSE necesita la dirección del banco. Si sigue pendiente, decide el webhook.
   */
  async #esperarResultado(transaccion, metodo) {
    let actual = transaccion;
    for (let i = 0; i < this.consultas && actual.status === 'PENDING'; i++) {
      if (metodo === 'PSE' && actual.payment_method?.extra?.async_payment_url) break;
      await new Promise((r) => setTimeout(r, this.esperaMs));
      actual = await this.#pedir('GET', `/transactions/${actual.id}`, { llave: this.llavePrivada });
    }
    return actual;
  }

  async #pedir(verbo, ruta, { llave, cuerpo } = {}) {
    const res = await this.fetch(`${this.base}${ruta}`, {
      method: verbo,
      headers: { Authorization: `Bearer ${llave}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json.data;
    // 422: Wompi rechazó los datos (tarjeta inválida, firma, etc.). No hubo cobro.
    const error = new Error(`Wompi respondió ${res.status} en ${verbo} ${ruta}`);
    if (res.status === 422 || res.status === 400) error.rechazo = mensajeDeError(json);
    throw error;
  }
}

function motivoRechazo(transaccion) {
  if (transaccion.status_message) return `La entidad rechazó el pago: ${transaccion.status_message}.`;
  return 'La entidad rechazó el pago.';
}

function mensajeDeError(json) {
  const mensajes = json?.error?.messages;
  if (mensajes && typeof mensajes === 'object') {
    const primero = Object.values(mensajes).flat()[0];
    if (primero) return `La entidad de pago no aceptó los datos: ${primero}.`;
  }
  return 'La entidad de pago no aceptó los datos. Revísalos e inténtalo de nuevo.';
}
