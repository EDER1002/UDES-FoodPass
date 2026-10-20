import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HOY, crearEntorno, crearReserva, pagar, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

describe('Cancelación de reservas (decisión 6)', () => {
  const entorno = crearEntorno();
  let esc;
  beforeEach(async () => {
    esc = await prepararEscenario(entorno.pool);
    entorno.reloj.mover(HOY, '09:00:00');
  });
  afterAll(() => entorno.pool.end());

  const porciones = async () => {
    const { rows } = await entorno.pool.query('SELECT cantidad_disponible FROM menu_proteina WHERE id_proteina = $1', [esc.proteinas.pollo]);
    return rows[0].cantidad_disponible;
  };

  it('cancelar una pagada antes de la hora límite devuelve porciones, reembolsa y anula el ficho', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const { body } = await crearReserva(entorno, auth, pedido(esc));
    const pago = await pagar(entorno, auth, body.reserva.idReserva, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
    expect(await porciones()).toBe(49);
    entorno.reloj.mover(HOY, '10:00:00');
    const r = await entorno.api().post(`/api/reservas/${body.reserva.idReserva}/cancelar`).set('Authorization', auth);
    expect(r.status).toBe(200);
    expect(r.body.reserva).toMatchObject({ estado: 'CANCELADA', pago: { estado: 'REEMBOLSADO' }, ficho: { estado: 'EXPIRADO' } });
    expect(await porciones()).toBe(50);
    const admin = await sesionDe(entorno, esc.usuarios.admin);
    const escaneo = await entorno.api().post('/api/admin/fichos/validar').set('Authorization', admin).send({ token: pago.body.reserva.ficho.token });
    expect(escaneo.body.error.codigo).toBe('FICHO_EXPIRADO');
  });

  it('cancelar una subsidiada deja el subsidio libre para reservar otra vez', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.subsidiado1);
    const { body } = await crearReserva(entorno, auth, pedido(esc));
    await entorno.api().post(`/api/reservas/${body.reserva.idReserva}/cancelar`).set('Authorization', auth);
    const otra = await crearReserva(entorno, auth, pedido(esc, { idProteina: esc.proteinas.res }));
    expect(otra.status).toBe(201);
    expect(otra.body.reserva.estado).toBe('CONFIRMADA');
  });

  it('después de la hora límite ya no se puede cancelar', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.subsidiado1);
    const { body } = await crearReserva(entorno, auth, pedido(esc));
    entorno.reloj.mover(HOY, '10:31:00');
    const r = await entorno.api().post(`/api/reservas/${body.reserva.idReserva}/cancelar`).set('Authorization', auth);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('CANCELACION_FUERA_DE_HORARIO');
  });

  it('no se puede cancelar un almuerzo entregado ni una reserva ya cancelada', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.subsidiado2);
    const { body } = await crearReserva(entorno, auth, pedido(esc));
    await entorno.pool.query(`UPDATE reserva SET estado = 'ENTREGADA'`);
    expect((await entorno.api().post(`/api/reservas/${body.reserva.idReserva}/cancelar`).set('Authorization', auth)).body.error.codigo).toBe('RESERVA_ENTREGADA');
    await entorno.pool.query(`UPDATE reserva SET estado = 'CANCELADA'`);
    expect((await entorno.api().post(`/api/reservas/${body.reserva.idReserva}/cancelar`).set('Authorization', auth)).body.error.codigo).toBe('RESERVA_YA_CANCELADA');
  });

  it('Mis reservas muestra el historial con su estado', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const primera = await crearReserva(entorno, auth, pedido(esc));
    await pagar(entorno, auth, primera.body.reserva.idReserva, { metodo: 'NEQUI', datos: { telefono: '3992222222' } });
    const segunda = await crearReserva(entorno, auth, pedido(esc));
    await pagar(entorno, auth, segunda.body.reserva.idReserva, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
    const r = await entorno.api().get('/api/reservas/mias').set('Authorization', auth);
    expect(r.body.reservas.map((x) => x.estado)).toEqual(['CONFIRMADA', 'CANCELADA']);
    expect(r.body.reservas[1].pago.estado).toBe('RECHAZADO');
  });
});
