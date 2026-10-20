import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HOY, crearEntorno, crearReserva, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

describe('Horario de reservas (RF04)', () => {
  const entorno = crearEntorno();
  let esc;
  beforeEach(async () => {
    esc = await prepararEscenario(entorno.pool);
    entorno.reloj.mover(HOY, '09:00:00');
  });
  afterAll(() => entorno.pool.end());

  it('permite reservar dentro del horario', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const r = await crearReserva(entorno, auth, pedido(esc));
    expect(r.status).toBe(201);
    expect(r.body.reserva.estado).toBe('PENDIENTE_PAGO');
  });

  it('rechaza la reserva después de la hora límite', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    entorno.reloj.mover(HOY, '10:30:00');
    const r = await crearReserva(entorno, auth, pedido(esc));
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('FUERA_DE_HORARIO');
    expect(r.body.error.mensaje).toContain('cerraron');
    expect(await entorno.pool.query('SELECT 1 FROM reserva')).toHaveProperty('rowCount', 0);
  });

  it('rechaza la reserva antes de que abra el horario', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    entorno.reloj.mover(HOY, '05:59:00');
    const r = await crearReserva(entorno, auth, pedido(esc));
    expect(r.body.error.codigo).toBe('FUERA_DE_HORARIO');
    expect(r.body.error.mensaje).toContain('abren');
  });

  it('el horario propio de un usuario manda sobre el de su rol', async () => {
    await entorno.pool.query(
      `INSERT INTO configuracion_reserva (id_usuario, hora_inicio, hora_fin, fecha_inicio_vigencia) VALUES ($1, '06:00', '11:30', '2026-10-01')`,
      [esc.usuarios.regular1.id],
    );
    // El menú también debe estar abierto
    await entorno.pool.query(`UPDATE menu SET hora_fin_reserva = '12:00'`);
    entorno.reloj.mover(HOY, '11:00:00');
    const conExcepcion = await crearReserva(entorno, await sesionDe(entorno, esc.usuarios.regular1), pedido(esc));
    const sinExcepcion = await crearReserva(entorno, await sesionDe(entorno, esc.usuarios.regular2), pedido(esc));
    expect(conExcepcion.status).toBe(201);
    expect(sinExcepcion.body.error.codigo).toBe('FUERA_DE_HORARIO');
  });

  it('también respeta la ventana del menú del día', async () => {
    await entorno.pool.query(`UPDATE menu SET hora_fin_reserva = '08:00'`);
    const r = await crearReserva(entorno, await sesionDe(entorno, esc.usuarios.regular1), pedido(esc));
    expect(r.body.error.codigo).toBe('FUERA_DE_HORARIO');
  });

  it('sin menú publicado no se puede reservar', async () => {
    await entorno.pool.query(`UPDATE menu SET estado = 'BORRADOR'`);
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    expect((await crearReserva(entorno, auth, pedido(esc))).body.error.codigo).toBe('MENU_NO_DISPONIBLE');
    expect((await entorno.api().get('/api/menu/hoy').set('Authorization', auth)).status).toBe(404);
  });

  it('el contexto del día informa el horario y si está abierto', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const abierto = await entorno.api().get('/api/reservas/contexto').set('Authorization', auth);
    expect(abierto.body.contexto.horario).toMatchObject({ abierto: true, inicio: '06:00:00', fin: '10:30:00' });
    entorno.reloj.mover(HOY, '10:45:00');
    const cerrado = await entorno.api().get('/api/reservas/contexto').set('Authorization', auth);
    expect(cerrado.body.contexto.horario.abierto).toBe(false);
  });
});
