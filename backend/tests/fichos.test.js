import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generarImagenQR } from '../src/modules/validacion-qr/token.js';
import { HOY, contar, crearEntorno, crearReserva, pagar, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

describe('Ficho QR y entrega (RF07, RF08)', () => {
  const entorno = crearEntorno();
  let esc;
  let admin;
  beforeEach(async () => {
    esc = await prepararEscenario(entorno.pool);
    entorno.reloj.mover(HOY, '09:00:00');
    admin = await sesionDe(entorno, esc.usuarios.admin);
  });
  afterAll(() => entorno.pool.end());

  async function reservaConfirmada(usuario = esc.usuarios.regular1) {
    const auth = await sesionDe(entorno, usuario);
    const { body } = await crearReserva(entorno, auth, pedido(esc));
    const pago = await pagar(entorno, auth, body.reserva.idReserva, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
    return { auth, reserva: pago.body.reserva };
  }

  it('el ficho solo se genera cuando la reserva queda confirmada', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const { body } = await crearReserva(entorno, auth, pedido(esc));
    expect(body.reserva.ficho).toBeNull();
    expect(await contar(entorno.pool, 'SELECT count(*) FROM ficho_qr')).toBe(0);
    const sinFicho = await entorno.api().get('/api/fichos/actual').set('Authorization', auth);
    expect(sinFicho.status).toBe(404);
    expect(sinFicho.body.error.codigo).toBe('SIN_FICHO');

    await pagar(entorno, auth, body.reserva.idReserva, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
    const conFicho = await entorno.api().get('/api/fichos/actual').set('Authorization', auth);
    expect(conFicho.status).toBe(200);
    expect(conFicho.body.reserva.ficho).toMatchObject({ estado: 'ACTIVO' });
    // Vence al final del día del menú (23:59:59 en Bogotá = 04:59:59 UTC del día siguiente)
    expect(conFicho.body.reserva.ficho.fechaExpiracion).toBe('2026-10-20T04:59:59.999Z');
  });

  it('el QR contiene solo el token, nunca datos personales', async () => {
    const { reserva } = await reservaConfirmada();
    const { token, codigoQr } = reserva.ficho;
    expect(codigoQr).toBe(await generarImagenQR(token));
    const svg = Buffer.from(codigoQr.split(',')[1], 'base64').toString('utf8');
    expect(svg).not.toMatch(/Regular1|udes\.edu\.co|1000000/);
  });

  it('cada ficho tiene un token distinto', async () => {
    const a = await reservaConfirmada(esc.usuarios.regular1);
    const b = await reservaConfirmada(esc.usuarios.regular2);
    expect(a.reserva.ficho.token).not.toBe(b.reserva.ficho.token);
  });

  it('validar muestra el pedido sin cambiar nada, y entregar marca el ficho como usado', async () => {
    const { auth, reserva } = await reservaConfirmada();
    const validacion = await entorno.api().post('/api/admin/fichos/validar').set('Authorization', admin).send({ token: reserva.ficho.token });
    expect(validacion.status).toBe(200);
    expect(validacion.body.reserva).toMatchObject({ idReserva: reserva.idReserva, estado: 'CONFIRMADA', comensal: { nombreCompleto: 'Regular1 Prueba' } });
    expect(validacion.body.ficho.estado).toBe('ACTIVO');

    entorno.reloj.mover(HOY, '12:14:00');
    const entrega = await entorno.api().post(`/api/admin/fichos/${validacion.body.ficho.idFicho}/entregar`).set('Authorization', admin);
    expect(entrega.status).toBe(200);
    expect(entrega.body.entrega).toMatchObject({ idUsuarioEmpleado: esc.usuarios.admin.id, fechaEntrega: HOY, horaEntrega: '12:14:00' });
    expect(entrega.body.reserva.estado).toBe('ENTREGADA');
    expect(entrega.body.ficho.estado).toBe('USADO');
    const miFicho = await entorno.api().get('/api/fichos/actual').set('Authorization', auth);
    expect(miFicho.body.reserva.ficho.estado).toBe('USADO');
  });

  it('un segundo escaneo del mismo ficho se rechaza con un mensaje claro', async () => {
    const { reserva } = await reservaConfirmada();
    const { body } = await entorno.api().post('/api/admin/fichos/validar').set('Authorization', admin).send({ token: reserva.ficho.token });
    await entorno.api().post(`/api/admin/fichos/${body.ficho.idFicho}/entregar`).set('Authorization', admin);

    const segundo = await entorno.api().post('/api/admin/fichos/validar').set('Authorization', admin).send({ token: reserva.ficho.token });
    expect(segundo.status).toBe(409);
    expect(segundo.body.error.codigo).toBe('FICHO_YA_USADO');
    expect(segundo.body.error.mensaje).toContain('no entregues otro almuerzo');
    expect(segundo.body.error.detalles).toMatchObject({ titular: 'Regular1 Prueba', validador: 'Admin Prueba' });

    const segundaEntrega = await entorno.api().post(`/api/admin/fichos/${body.ficho.idFicho}/entregar`).set('Authorization', admin);
    expect(segundaEntrega.status).toBe(409);
    expect(await contar(entorno.pool, 'SELECT count(*) FROM entrega')).toBe(1);
  });

  it('dos entregas simultáneas del mismo ficho: solo una se registra', async () => {
    const { reserva } = await reservaConfirmada();
    const respuestas = await Promise.all(
      [1, 2, 3, 4].map(() => entorno.api().post(`/api/admin/fichos/${reserva.ficho.idFicho}/entregar`).set('Authorization', admin)),
    );
    expect(respuestas.filter((r) => r.status === 200)).toHaveLength(1);
    expect(respuestas.filter((r) => r.body.error?.codigo === 'FICHO_YA_USADO')).toHaveLength(3);
    expect(await contar(entorno.pool, 'SELECT count(*) FROM entrega')).toBe(1);
  });

  it('acepta el token escrito a mano en minúsculas, sin guiones y con letras parecidas', async () => {
    const { reserva } = await reservaConfirmada();
    const aMano = reserva.ficho.token.toLowerCase().replace(/-/g, ' ').replace(/1/g, 'l').replace(/0/g, 'o');
    const r = await entorno.api().post('/api/admin/fichos/validar').set('Authorization', admin).send({ token: aMano });
    expect(r.status).toBe(200);
    expect(r.body.ficho.token).toBe(reserva.ficho.token);
  });

  it('rechaza tokens inexistentes, mal formados y fichos vencidos', async () => {
    const inexistente = await entorno.api().post('/api/admin/fichos/validar').set('Authorization', admin).send({ token: 'AAAA-BBBB-CCCC-DDDD' });
    expect(inexistente.body.error.codigo).toBe('FICHO_NO_ENCONTRADO');
    const malo = await entorno.api().post('/api/admin/fichos/validar').set('Authorization', admin).send({ token: 'hola' });
    expect(malo.body.error.codigo).toBe('TOKEN_INVALIDO');

    const { reserva } = await reservaConfirmada();
    entorno.reloj.mover('2026-10-20', '08:00:00');
    const vencido = await entorno.api().post('/api/admin/fichos/validar').set('Authorization', admin).send({ token: reserva.ficho.token });
    expect(vencido.status).toBe(410);
    expect(vencido.body.error.codigo).toBe('FICHO_EXPIRADO');
  });

  it('las entregas del día muestran el resumen y quién validó', async () => {
    const { reserva } = await reservaConfirmada();
    await crearReserva(entorno, await sesionDe(entorno, esc.usuarios.subsidiado1), pedido(esc));
    await entorno.api().post(`/api/admin/fichos/${reserva.ficho.idFicho}/entregar`).set('Authorization', admin);
    const r = await entorno.api().get(`/api/admin/entregas?fecha=${HOY}`).set('Authorization', admin);
    expect(r.status).toBe(200);
    expect(r.body.resumen).toMatchObject({ confirmadas: 2, entregadas: 1, porEntregar: 1, subsidiadas: 1, pagadas: 1 });
    expect(r.body.entregas).toHaveLength(1);
    expect(r.body.entregas[0]).toMatchObject({ validador: 'Admin Prueba', reserva: { comensal: { nombreCompleto: 'Regular1 Prueba' } } });
  });
});
