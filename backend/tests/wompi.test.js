import crypto from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cargarConfig } from '../src/config.js';
import {
  PasarelaWompi,
  firmaIntegridad,
  verificarEventoWompi,
} from '../src/modules/reservas-pagos/pagos/pasarela/PasarelaWompi.js';
import { HOY, TARJETA, crearEntorno, crearReserva, pagar, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

const LLAVES = {
  ambiente: 'sandbox',
  llavePublica: 'pub_test_prueba',
  llavePrivada: 'prv_test_prueba',
  secretoIntegridad: 'test_integrity_prueba',
  urlRetorno: 'http://localhost:5173/pagos',
};
const SECRETO_EVENTOS = 'test_events_prueba';

/**
 * Wompi falso: responde como la API v1 del sandbox de Wompi y guarda las
 * peticiones para revisarlas. `estadoFinal(metodo, cuerpo)` decide cómo termina
 * cada transacción; `perderRespuesta` simula que la respuesta del POST se pierde.
 */
function wompiFalso({ estadoFinal = () => 'APPROVED', perderRespuesta = false } = {}) {
  const peticiones = [];
  const transacciones = new Map();
  const ok = (data, status = 200) => ({ ok: status < 300, status, json: async () => ({ data }) });
  const fetch = async (url, { method, headers, body }) => {
    const ruta = url.replace('https://sandbox.wompi.co/v1', '');
    const cuerpo = body ? JSON.parse(body) : null;
    peticiones.push({ method, ruta, cuerpo, autorizacion: headers.Authorization });
    if (ruta === '/pse/financial_institutions') {
      return ok([
        { financial_institution_code: '0', financial_institution_name: 'A continuación seleccione su banco' },
        { financial_institution_code: '1', financial_institution_name: 'Banco que aprueba' },
        { financial_institution_code: '2', financial_institution_name: 'Banco que declina' },
      ]);
    }
    if (ruta.startsWith('/merchants/')) {
      return ok({
        presigned_acceptance: { acceptance_token: 'tok-aceptacion', permalink: 'https://wompi.co/terminos.pdf' },
        presigned_personal_data_auth: { acceptance_token: 'tok-datos', permalink: 'https://wompi.co/datos.pdf' },
      });
    }
    if (ruta === '/tokens/cards') {
      if (cuerpo.number === '4000000000000000') {
        return { ok: false, status: 422, json: async () => ({ error: { type: 'INPUT_VALIDATION_ERROR', messages: { number: ['El número no es válido'] } } }) };
      }
      return ok({ id: `tok_test_${cuerpo.number.slice(-4)}` }, 201);
    }
    if (ruta === '/transactions' && method === 'POST') {
      const id = `txn-${transacciones.size + 1}`;
      const final = estadoFinal(cuerpo.payment_method.type, cuerpo);
      const tx = { id, reference: cuerpo.reference, amount_in_cents: cuerpo.amount_in_cents, status: 'PENDING', final, payment_method: { type: cuerpo.payment_method.type } };
      transacciones.set(id, tx);
      if (perderRespuesta) throw new Error('socket hang up');
      return ok({ ...tx }, 201);
    }
    if (ruta.startsWith('/transactions?reference=')) {
      const ref = decodeURIComponent(ruta.split('=')[1]);
      return ok([...transacciones.values()].filter((t) => t.reference === ref));
    }
    if (ruta.startsWith('/transactions/')) {
      const tx = transacciones.get(ruta.split('/')[2]);
      // Al consultarla, la transacción llega a su estado final (PSE se queda pendiente con la URL del banco).
      if (tx.final === 'PENDING_PSE') tx.payment_method.extra = { async_payment_url: 'https://banco.test/pagar/123' };
      else if (tx.final !== 'PENDING') tx.status = tx.final;
      if (tx.final === 'DECLINED') tx.status_message = 'Fondos insuficientes';
      return ok({ ...tx });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetch, peticiones, transacciones };
}

function eventoFirmado(transaccion, { secreto = SECRETO_EVENTOS, status = transaccion.status } = {}) {
  const data = { transaction: { ...transaccion, status } };
  const properties = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const timestamp = 1_761_000_000;
  const valores = `${data.transaction.id}${data.transaction.status}${data.transaction.amount_in_cents}`;
  const checksum = crypto.createHash('sha256').update(`${valores}${timestamp}${secreto}`).digest('hex');
  return { event: 'transaction.updated', data, environment: 'test', signature: { properties, checksum }, timestamp, sent_at: '2026-10-19T14:00:00Z' };
}

describe('Wompi: piezas sueltas', () => {
  it('la firma de integridad sigue la fórmula de Wompi', () => {
    const esperado = crypto.createHash('sha256').update('ref-1' + '1200000' + 'COP' + 'secreto').digest('hex');
    expect(firmaIntegridad({ referencia: 'ref-1', montoEnCentavos: 1_200_000, secreto: 'secreto' })).toBe(esperado);
  });

  it('verifica el checksum de los eventos y rechaza los alterados', () => {
    const evento = eventoFirmado({ id: 'txn-1', reference: 'r', amount_in_cents: 1_200_000, status: 'APPROVED' });
    expect(verificarEventoWompi(evento, SECRETO_EVENTOS)).toBe(true);
    expect(verificarEventoWompi(evento, 'otro-secreto')).toBe(false);
    const alterado = structuredClone(evento);
    alterado.data.transaction.status = 'DECLINED';
    expect(verificarEventoWompi(alterado, SECRETO_EVENTOS)).toBe(false);
    expect(verificarEventoWompi({}, SECRETO_EVENTOS)).toBe(false);
  });

  it('la configuración exige las llaves de Wompi y que correspondan al ambiente', () => {
    const base = { DATABASE_URL: 'postgres://x', JWT_SECRETO: 'x'.repeat(32), WEBHOOK_SECRETO: 'y'.repeat(16), PASARELA_MODO: 'wompi' };
    expect(() => cargarConfig(base)).toThrow(/WOMPI_LLAVE_PUBLICA/);
    expect(() => cargarConfig({ ...base, WOMPI_LLAVE_PUBLICA: 'pub_prod_1', WOMPI_LLAVE_PRIVADA: 'prv_test_1', WOMPI_SECRETO_INTEGRIDAD: 'a', WOMPI_SECRETO_EVENTOS: 'b' }))
      .toThrow(/pub_test_/);
    const config = cargarConfig({ ...base, WOMPI_LLAVE_PUBLICA: 'pub_test_1', WOMPI_LLAVE_PRIVADA: 'prv_test_1', WOMPI_SECRETO_INTEGRIDAD: 'a', WOMPI_SECRETO_EVENTOS: 'b' });
    expect(config.pasarela.wompi).toMatchObject({ ambiente: 'sandbox', urlRetorno: 'http://localhost:5173/pagos' });
  });

  it('la tarjeta se envía como token, el monto en centavos y con la firma de integridad', async () => {
    const falso = wompiFalso();
    const pasarela = new PasarelaWompi({ ...LLAVES, fetch: falso.fetch, esperaMs: 0 });
    const r = await pasarela.cobrar({
      metodo: 'TARJETA',
      referencia: 'FP-1-abc',
      monto: 12000,
      datos: { numero: '4242424242424242', titular: 'Laura', vencimiento: '12/30', cvc: '123', cuotas: 1 },
      pagador: { correo: 'laura@udes.edu.co', nombreCompleto: 'Laura Gómez' },
    });
    expect(r).toMatchObject({ estado: 'APROBADO', idTransaccion: 'txn-1' });
    const creacion = falso.peticiones.find((p) => p.ruta === '/transactions');
    expect(creacion.cuerpo).toMatchObject({
      amount_in_cents: 1_200_000,
      currency: 'COP',
      reference: 'FP-1-abc',
      customer_email: 'laura@udes.edu.co',
      acceptance_token: 'tok-aceptacion',
      accept_personal_auth: 'tok-datos',
      payment_method: { type: 'CARD', token: 'tok_test_4242', installments: 1 },
      signature: firmaIntegridad({ referencia: 'FP-1-abc', montoEnCentavos: 1_200_000, secreto: LLAVES.secretoIntegridad }),
    });
    // El número de la tarjeta solo viaja al endpoint de tokenización, nunca en la transacción.
    expect(JSON.stringify(creacion.cuerpo)).not.toContain('4242424242424242');
  });

  it('datos que Wompi no acepta (422) se rechazan sin crear transacción', async () => {
    const falso = wompiFalso();
    const pasarela = new PasarelaWompi({ ...LLAVES, fetch: falso.fetch, esperaMs: 0 });
    const r = await pasarela.cobrar({ metodo: 'TARJETA', referencia: 'FP-2', monto: 12000, datos: { numero: '4000000000000000', titular: 'L', vencimiento: '12/30', cvc: '123' }, pagador: {} });
    expect(r.estado).toBe('RECHAZADO');
    expect(r.motivo).toContain('El número no es válido');
    expect(falso.transacciones.size).toBe(0);
  });

  it('PSE queda pendiente con la dirección del banco', async () => {
    const falso = wompiFalso({ estadoFinal: () => 'PENDING_PSE' });
    const pasarela = new PasarelaWompi({ ...LLAVES, fetch: falso.fetch, esperaMs: 0 });
    await pasarela.iniciar();
    expect(pasarela.bancosPse().map((b) => b.codigo)).toEqual(['1', '2']);
    const r = await pasarela.cobrar({ metodo: 'PSE', referencia: 'FP-3', monto: 8000, datos: { banco: '1', tipoPersona: 'NATURAL', documento: '1098765432' }, pagador: { correo: 'a@udes.edu.co', nombreCompleto: 'Ana' } });
    expect(r).toMatchObject({ estado: 'PENDIENTE', urlBanco: 'https://banco.test/pagar/123' });
    const creacion = falso.peticiones.find((p) => p.ruta === '/transactions');
    expect(creacion.cuerpo).toMatchObject({
      redirect_url: LLAVES.urlRetorno,
      payment_method: { type: 'PSE', user_type: 0, user_legal_id_type: 'CC', user_legal_id: '1098765432', financial_institution_code: '1' },
    });
  });

  it('si se pierde la respuesta al crear la transacción, la busca por la referencia', async () => {
    const falso = wompiFalso({ perderRespuesta: true });
    const pasarela = new PasarelaWompi({ ...LLAVES, fetch: falso.fetch, esperaMs: 0 });
    const r = await pasarela.cobrar({ metodo: 'NEQUI', referencia: 'FP-4', monto: 12000, datos: { telefono: '3991111111' }, pagador: {} });
    expect(r.estado).toBe('APROBADO');
    expect(falso.transacciones.size).toBe(1);
  });
});

describe('Wompi: pago completo por la API', () => {
  const falso = wompiFalso({ estadoFinal: (tipo, cuerpo) => (tipo === 'NEQUI' ? 'PENDING' : cuerpo.payment_method.token === 'tok_test_1111' ? 'DECLINED' : 'APPROVED') });
  const pasarela = new PasarelaWompi({ ...LLAVES, fetch: falso.fetch, esperaMs: 0, consultas: 2 });
  const entorno = crearEntorno({
    pasarela,
    entorno: {
      PASARELA_MODO: 'wompi',
      WOMPI_LLAVE_PUBLICA: LLAVES.llavePublica,
      WOMPI_LLAVE_PRIVADA: LLAVES.llavePrivada,
      WOMPI_SECRETO_INTEGRIDAD: LLAVES.secretoIntegridad,
      WOMPI_SECRETO_EVENTOS: SECRETO_EVENTOS,
    },
  });
  let esc;
  let auth;
  let idReserva;
  beforeEach(async () => {
    await pasarela.iniciar();
    esc = await prepararEscenario(entorno.pool);
    entorno.reloj.mover(HOY, '09:00:00');
    auth = await sesionDe(entorno, esc.usuarios.regular1);
    idReserva = (await crearReserva(entorno, auth, pedido(esc))).body.reserva.idReserva;
  });
  afterAll(() => entorno.pool.end());

  const webhook = (cuerpo) => entorno.api().post('/api/pagos/webhook/wompi').send(cuerpo);

  it('los medios muestran los bancos de Wompi, sus términos y los datos de prueba de su sandbox', async () => {
    const r = await entorno.api().get('/api/pagos/medios').set('Authorization', auth);
    expect(r.body).toMatchObject({
      modo: 'wompi',
      bancosPse: [{ codigo: '1' }, { codigo: '2' }],
      terminos: { terminos: 'https://wompi.co/terminos.pdf' },
      datosDePrueba: { nequiAprobado: '3991111111', nequiRechazado: '3992222222' },
    });
  });

  it('tarjeta aprobada: confirma la reserva y envía el correo del titular', async () => {
    const r = await pagar(entorno, auth, idReserva, { metodo: 'TARJETA', datos: TARJETA });
    expect(r.body.resultado).toBe('APROBADO');
    expect(r.body.reserva.estado).toBe('CONFIRMADA');
    const creacion = falso.peticiones.filter((p) => p.ruta === '/transactions').at(-1);
    expect(creacion.cuerpo.customer_email).toBe(esc.usuarios.regular1.correo);
  });

  it('tarjeta rechazada: cancela la reserva con el motivo de Wompi', async () => {
    const r = await pagar(entorno, auth, idReserva, { metodo: 'TARJETA', datos: { ...TARJETA, numero: '4111 1111 1111 1111' } });
    expect(r.body.resultado).toBe('RECHAZADO');
    expect(r.body.mensaje).toContain('Fondos insuficientes');
    expect(r.body.reserva.estado).toBe('CANCELADA');
  });

  it('Nequi pendiente se confirma con el evento firmado de Wompi, una sola vez', async () => {
    const r = await pagar(entorno, auth, idReserva, { metodo: 'NEQUI', datos: { telefono: '3991111111' } });
    expect(r.body.resultado).toBe('PENDIENTE');
    expect(r.body.mensaje).toContain('Nequi');

    // Un pago pendiente con Wompi no se da por rechazado aunque pasen minutos: espera el evento.
    entorno.reloj.mover(HOY, '09:10:00');
    const cancelar = await entorno.api().post(`/api/reservas/${idReserva}/cancelar`).set('Authorization', auth);
    expect(cancelar.status).toBe(409);
    expect(cancelar.body.error.codigo).toBe('PAGO_EN_CURSO');

    const tx = [...falso.transacciones.values()].at(-1);
    expect((await webhook(eventoFirmado(tx, { secreto: 'secreto-falso', status: 'APPROVED' }))).status).toBe(401);
    expect((await webhook(eventoFirmado(tx, { status: 'PENDING' }))).body).toEqual({ recibido: true });

    const aprobado = await webhook(eventoFirmado(tx, { status: 'APPROVED' }));
    expect(aprobado.body).toMatchObject({ recibido: true, procesado: true, estadoPago: 'APROBADO' });
    const repetido = await webhook(eventoFirmado(tx, { status: 'APPROVED' }));
    expect(repetido.body).toMatchObject({ procesado: false });
    const reserva = (await entorno.api().get(`/api/reservas/${idReserva}`).set('Authorization', auth)).body.reserva;
    expect(reserva).toMatchObject({ estado: 'CONFIRMADA', ficho: { estado: 'ACTIVO' } });
  });

  it('un evento de una transacción que no es de FoodPass se confirma sin cambiar nada', async () => {
    const r = await webhook(eventoFirmado({ id: 'txn-otra', reference: 'OTRA-TIENDA-1', amount_in_cents: 500000, status: 'APPROVED' }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ recibido: true, procesado: false });
  });

  it('el reembolso por cancelación avisa que lo hace la cafetería', async () => {
    await pagar(entorno, auth, idReserva, { metodo: 'TARJETA', datos: TARJETA });
    const r = await entorno.api().post(`/api/reservas/${idReserva}/cancelar`).set('Authorization', auth);
    expect(r.body.reserva.pago).toMatchObject({ estado: 'REEMBOLSADO', reembolsoSimulado: false });
  });
});
