import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HOY, contar, crearEntorno, crearReserva, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

describe('Reserva subsidiada (RF06)', () => {
  const entorno = crearEntorno();
  let esc;
  beforeEach(async () => {
    esc = await prepararEscenario(entorno.pool);
    entorno.reloj.mover(HOY, '09:00:00');
  });
  afterAll(() => entorno.pool.end());

  it('se confirma sin pagar, con total $0 y ficho QR', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.subsidiado1);
    const r = await crearReserva(entorno, auth, pedido(esc));
    expect(r.status).toBe(201);
    expect(r.body.reserva).toMatchObject({ estado: 'CONFIRMADA', tipoReserva: 'SUBSIDIADA', valorTotal: 0, pago: null });
    expect(r.body.reserva.ficho.token).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    expect(await contar(entorno.pool, 'SELECT count(*) FROM pago')).toBe(0);
    // La porción se descontó
    const { rows } = await entorno.pool.query('SELECT cantidad_disponible FROM menu_proteina WHERE id_proteina = $1', [esc.proteinas.pollo]);
    expect(rows[0].cantidad_disponible).toBe(49);
  });

  it('bloquea una segunda reserva subsidiada el mismo día', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.subsidiado1);
    expect((await crearReserva(entorno, auth, pedido(esc))).status).toBe(201);
    const segunda = await crearReserva(entorno, auth, pedido(esc, { idProteina: esc.proteinas.res }));
    expect(segunda.status).toBe(409);
    expect(segunda.body.error.codigo).toBe('SUBSIDIO_NO_DISPONIBLE');
    // Aun después de entregado el almuerzo, el subsidio del día ya se usó
    await entorno.pool.query(`UPDATE reserva SET estado = 'ENTREGADA'`);
    const tercera = await crearReserva(entorno, auth, pedido(esc));
    expect(tercera.body.error.codigo).toBe('SUBSIDIO_NO_DISPONIBLE');
    expect(await contar(entorno.pool, `SELECT count(*) FROM reserva WHERE tipo_reserva = 'SUBSIDIADA' AND estado <> 'CANCELADA'`)).toBe(1);
  });

  it('dos peticiones simultáneas del mismo subsidiado solo usan el beneficio una vez', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.subsidiado2);
    const respuestas = await Promise.all([1, 2, 3].map(() => crearReserva(entorno, auth, pedido(esc))));
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await contar(entorno.pool, `SELECT count(*) FROM reserva WHERE estado = 'CONFIRMADA'`)).toBe(1);
  });

  it('rechaza el subsidio si el beneficio no está vigente', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.sinbeneficio);
    const r = await crearReserva(entorno, auth, pedido(esc));
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('SUBSIDIO_NO_DISPONIBLE');
    expect(r.body.error.mensaje).toContain('no está vigente');
  });

  it('el contexto indica si el subsidio está disponible', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.subsidiado3);
    const antes = await entorno.api().get('/api/reservas/contexto').set('Authorization', auth);
    expect(antes.body.contexto.subsidio).toMatchObject({ aplica: true, disponible: true });
    await crearReserva(entorno, auth, pedido(esc));
    const despues = await entorno.api().get('/api/reservas/contexto').set('Authorization', auth);
    expect(despues.body.contexto.subsidio.disponible).toBe(false);
    expect(despues.body.contexto.reservaActiva.estado).toBe('CONFIRMADA');
  });

  it('valida el máximo de acompañamientos por tipo de almuerzo', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.subsidiado4);
    const r = await crearReserva(entorno, auth, pedido(esc, { idTipoAlmuerzo: esc.tipos.medio }));
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('ACOMPANAMIENTOS_INVALIDOS');
  });
});
