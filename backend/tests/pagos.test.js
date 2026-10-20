import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HOY, TARJETA, contar, crearEntorno, crearReserva, enviarWebhook, nuevaClave, pagar, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

describe('Pagos en línea con Nequi, PSE y tarjeta (RF09, RF10)', () => {
  const entorno = crearEntorno();
  let esc;
  let auth;
  let idReserva;
  beforeEach(async () => {
    esc = await prepararEscenario(entorno.pool);
    entorno.reloj.mover(HOY, '09:00:00');
    auth = await sesionDe(entorno, esc.usuarios.regular1);
    idReserva = (await crearReserva(entorno, auth, pedido(esc))).body.reserva.idReserva;
  });
  afterAll(() => entorno.pool.end());

  it('el total lo calcula el backend a partir del tipo de almuerzo', async () => {
    const r = await entorno.api().get(`/api/reservas/${idReserva}`).set('Authorization', auth);
    expect(r.body.reserva.valorTotal).toBe(12000);
    const medio = await crearReserva(entorno, await sesionDe(entorno, esc.usuarios.regular2), pedido(esc, { idTipoAlmuerzo: esc.tipos.medio, idsAcompanamiento: [esc.acompanamientos.arroz] }));
    expect(medio.body.reserva.valorTotal).toBe(8000);
  });

  describe('Nequi', () => {
    it('aprobado: confirma la reserva, descuenta la porción y genera el ficho', async () => {
      const r = await pagar(entorno, auth, idReserva, { metodo: 'NEQUI', datos: { telefono: '300 123 4567' } });
      expect(r.status).toBe(200);
      expect(r.body.resultado).toBe('APROBADO');
      expect(r.body.reserva).toMatchObject({ estado: 'CONFIRMADA', pago: { metodo: 'NEQUI', estado: 'APROBADO', monto: 12000 } });
      expect(r.body.reserva.ficho.estado).toBe('ACTIVO');
      const { rows } = await entorno.pool.query('SELECT cantidad_disponible FROM menu_proteina WHERE id_proteina = $1', [esc.proteinas.pollo]);
      expect(rows[0].cantidad_disponible).toBe(49);
    });

    it('rechazado: cancela la reserva, informa el motivo y no descuenta porciones', async () => {
      const r = await pagar(entorno, auth, idReserva, { metodo: 'NEQUI', datos: { telefono: '3992222222' } });
      expect(r.body.resultado).toBe('RECHAZADO');
      expect(r.body.mensaje).toContain('Fondos insuficientes');
      expect(r.body.reserva).toMatchObject({ estado: 'CANCELADA', ficho: null });
      const { rows } = await entorno.pool.query('SELECT cantidad_disponible FROM menu_proteina WHERE id_proteina = $1', [esc.proteinas.pollo]);
      expect(rows[0].cantidad_disponible).toBe(50);
      // Puede volver a intentar con una reserva nueva
      const nueva = await crearReserva(entorno, auth, pedido(esc));
      expect(nueva.status).toBe(201);
    });

    it('valida el número de celular', async () => {
      const r = await pagar(entorno, auth, idReserva, { metodo: 'NEQUI', datos: { telefono: '12345' } });
      expect(r.status).toBe(400);
      expect(await contar(entorno.pool, 'SELECT count(*) FROM pago')).toBe(0);
    });
  });

  describe('Tarjeta', () => {
    it('aprobada con la tarjeta de prueba 4242…', async () => {
      const r = await pagar(entorno, auth, idReserva, { metodo: 'TARJETA', datos: TARJETA });
      expect(r.body.resultado).toBe('APROBADO');
    });

    it('rechazada con la tarjeta de prueba 4111…', async () => {
      const r = await pagar(entorno, auth, idReserva, { metodo: 'TARJETA', datos: { ...TARJETA, numero: '4111111111111111' } });
      expect(r.body.resultado).toBe('RECHAZADO');
      expect(r.body.reserva.estado).toBe('CANCELADA');
    });

    it('rechaza números inválidos, tarjetas vencidas y CVC incorrecto sin registrar el pago', async () => {
      const casos = [{ numero: '4242424242424241' }, { vencimiento: '09/26' }, { cvc: '12' }];
      for (const cambio of casos) {
        const r = await pagar(entorno, auth, idReserva, { metodo: 'TARJETA', datos: { ...TARJETA, ...cambio } });
        expect(r.status, JSON.stringify(cambio)).toBe(400);
      }
      expect(await contar(entorno.pool, 'SELECT count(*) FROM pago')).toBe(0);
    });

    it('nunca guarda el número de la tarjeta', async () => {
      await pagar(entorno, auth, idReserva, { metodo: 'TARJETA', datos: TARJETA });
      const { rows } = await entorno.pool.query('SELECT row_to_json(p)::text AS fila FROM pago p');
      expect(rows[0].fila).not.toContain('4242424242424242');
      expect(rows[0].fila).not.toContain('4242');
      expect(Object.keys(JSON.parse(rows[0].fila))).not.toContain('cvc');
    });
  });

  describe('PSE', () => {
    const pse = (banco) => ({ metodo: 'PSE', datos: { banco, tipoPersona: 'NATURAL', documento: '1098765432' } });

    it('banco que aprueba', async () => {
      expect((await pagar(entorno, auth, idReserva, pse('1'))).body.resultado).toBe('APROBADO');
    });

    it('banco que rechaza', async () => {
      const r = await pagar(entorno, auth, idReserva, pse('2'));
      expect(r.body.resultado).toBe('RECHAZADO');
      expect(r.body.mensaje).toContain('banco');
    });

    it('respuesta pendiente que se confirma por el webhook firmado', async () => {
      const r = await pagar(entorno, auth, idReserva, pse('3'));
      expect(r.body.resultado).toBe('PENDIENTE');
      expect(r.body.reserva.estado).toBe('PENDIENTE_PAGO');
      const { rows } = await entorno.pool.query('SELECT referencia_transaccion FROM pago');
      const referencia = rows[0].referencia_transaccion;

      const sinFirma = await enviarWebhook(entorno, { referencia, estado: 'APROBADO' }, { firma: 'sha256=falsa' });
      expect(sinFirma.status).toBe(401);

      const ok = await enviarWebhook(entorno, { referencia, estado: 'APROBADO' });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ recibido: true, procesado: true, estadoPago: 'APROBADO' });
      const reserva = await entorno.api().get(`/api/reservas/${idReserva}`).set('Authorization', auth);
      expect(reserva.body.reserva.estado).toBe('CONFIRMADA');
      expect(reserva.body.reserva.ficho).not.toBeNull();

      // El webhook repetido no cambia nada (idempotente)
      const repetido = await enviarWebhook(entorno, { referencia, estado: 'RECHAZADO' });
      expect(repetido.body).toMatchObject({ procesado: false, estadoPago: 'APROBADO' });
    });

    it('el webhook también puede rechazar un pago pendiente', async () => {
      await pagar(entorno, auth, idReserva, pse('3'));
      const { rows } = await entorno.pool.query('SELECT referencia_transaccion FROM pago');
      await enviarWebhook(entorno, { referencia: rows[0].referencia_transaccion, estado: 'RECHAZADO' });
      const reserva = await entorno.api().get(`/api/reservas/${idReserva}`).set('Authorization', auth);
      expect(reserva.body.reserva).toMatchObject({ estado: 'CANCELADA', pago: { estado: 'RECHAZADO' } });
    });

    it('mientras el pago está pendiente no se puede cancelar ni reservar otra vez', async () => {
      await pagar(entorno, auth, idReserva, pse('3'));
      expect((await entorno.api().post(`/api/reservas/${idReserva}/cancelar`).set('Authorization', auth)).body.error.codigo).toBe('PAGO_EN_CURSO');
      expect((await crearReserva(entorno, auth, pedido(esc))).body.error.codigo).toBe('RESERVA_ACTIVA_EXISTENTE');
    });
  });

  describe('Idempotencia (RNF05)', () => {
    it('el mismo pago enviado dos veces genera un solo cobro', async () => {
      const clave = nuevaClave();
      const cuerpo = { metodo: 'NEQUI', datos: { telefono: '3001234567' } };
      const cobrosAntes = entorno.pasarela.cobros;
      const primero = await pagar(entorno, auth, idReserva, cuerpo, clave);
      const segundo = await pagar(entorno, auth, idReserva, cuerpo, clave);
      expect(primero.body.resultado).toBe('APROBADO');
      expect(segundo.status).toBe(200);
      expect(segundo.body).toMatchObject({ resultado: 'APROBADO', repetido: true });
      expect(segundo.body.reserva.ficho.token).toBe(primero.body.reserva.ficho.token);
      expect(entorno.pasarela.cobros - cobrosAntes).toBe(1);
      expect(await contar(entorno.pool, 'SELECT count(*) FROM pago')).toBe(1);
    });

    it('dos envíos simultáneos con la misma clave también cobran una sola vez', async () => {
      const clave = nuevaClave();
      const cuerpo = { metodo: 'TARJETA', datos: TARJETA };
      const cobrosAntes = entorno.pasarela.cobros;
      const respuestas = await Promise.all([1, 2, 3].map(() => pagar(entorno, auth, idReserva, cuerpo, clave)));
      expect(respuestas.every((r) => r.body.resultado === 'APROBADO')).toBe(true);
      expect(entorno.pasarela.cobros - cobrosAntes).toBe(1);
      expect(await contar(entorno.pool, 'SELECT count(*) FROM pago')).toBe(1);
    });

    it('un pago nuevo (otra clave) sobre una reserva ya pagada se rechaza sin cobrar', async () => {
      await pagar(entorno, auth, idReserva, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
      const cobrosAntes = entorno.pasarela.cobros;
      const otro = await pagar(entorno, auth, idReserva, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
      expect(otro.status).toBe(409);
      expect(otro.body.error.codigo).toBe('RESERVA_NO_PENDIENTE');
      expect(entorno.pasarela.cobros).toBe(cobrosAntes);
    });

    it('exige el encabezado Idempotency-Key', async () => {
      const r = await entorno.api().post(`/api/reservas/${idReserva}/pago`).set('Authorization', auth).send({ metodo: 'NEQUI', datos: { telefono: '3001234567' } });
      expect(r.status).toBe(400);
    });
  });

  describe('Reglas antes de cobrar', () => {
    it('una reserva pendiente vence a los 15 minutos', async () => {
      entorno.reloj.mover(HOY, '09:16:00');
      const r = await pagar(entorno, auth, idReserva, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
      expect(r.status).toBe(409);
      expect(r.body.error.codigo).toBe('RESERVA_EXPIRADA');
      expect(await contar(entorno.pool, 'SELECT count(*) FROM pago')).toBe(0);
    });

    it('si el plato se agotó antes de pagar, no cobra y cancela la reserva', async () => {
      await entorno.pool.query('UPDATE menu_proteina SET cantidad_disponible = 0 WHERE id_proteina = $1', [esc.proteinas.pollo]);
      const r = await pagar(entorno, auth, idReserva, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
      expect(r.body.error.codigo).toBe('PLATO_AGOTADO');
      expect(await contar(entorno.pool, 'SELECT count(*) FROM pago')).toBe(0);
      expect(await contar(entorno.pool, `SELECT count(*) FROM reserva WHERE estado = 'CANCELADA'`)).toBe(1);
    });

    it('volver a elegir antes de pagar reemplaza la reserva pendiente', async () => {
      const otra = await crearReserva(entorno, auth, pedido(esc, { idProteina: esc.proteinas.res }));
      expect(otra.status).toBe(201);
      expect(await contar(entorno.pool, `SELECT count(*) FROM reserva WHERE estado = 'PENDIENTE_PAGO'`)).toBe(1);
      expect(await contar(entorno.pool, `SELECT count(*) FROM reserva WHERE estado = 'CANCELADA'`)).toBe(1);
    });

    it('con la reserva confirmada no se puede crear otra el mismo día (regla 6)', async () => {
      await pagar(entorno, auth, idReserva, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
      const r = await crearReserva(entorno, auth, pedido(esc));
      expect(r.status).toBe(409);
      expect(r.body.error.codigo).toBe('RESERVA_ACTIVA_EXISTENTE');
    });
  });

  it('GET /api/pagos/medios informa los datos de prueba del sandbox', async () => {
    const r = await entorno.api().get('/api/pagos/medios').set('Authorization', auth);
    expect(r.body).toMatchObject({ modo: 'sandbox', metodos: ['NEQUI', 'PSE', 'TARJETA'] });
    expect(r.body.bancosPse).toHaveLength(3);
  });
});
