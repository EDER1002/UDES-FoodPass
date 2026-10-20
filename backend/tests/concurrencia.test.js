import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HOY, TARJETA, contar, crearEntorno, crearReserva, pagar, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

describe('Porciones atómicas con peticiones simultáneas (RNF03)', () => {
  const entorno = crearEntorno();
  afterAll(() => entorno.pool.end());
  beforeEach(() => entorno.reloj.mover(HOY, '09:00:00'));

  it('10 reservas simultáneas por la última porción: solo una se confirma', async () => {
    const esc = await prepararEscenario(entorno.pool, { porciones: { pescado: 1 } });
    const sesiones = await Promise.all([...Array(10)].map((_, i) => sesionDe(entorno, esc.usuarios[`subsidiado${i + 1}`])));
    const respuestas = await Promise.all(
      sesiones.map((auth) => crearReserva(entorno, auth, pedido(esc, { idProteina: esc.proteinas.pescado }))),
    );
    const confirmadas = respuestas.filter((r) => r.status === 201);
    expect(confirmadas).toHaveLength(1);
    expect(respuestas.filter((r) => r.body.error?.codigo === 'PLATO_AGOTADO')).toHaveLength(9);
    const { rows } = await entorno.pool.query('SELECT cantidad_disponible FROM menu_proteina WHERE id_proteina = $1', [esc.proteinas.pescado]);
    expect(rows[0].cantidad_disponible).toBe(0);
    expect(await contar(entorno.pool, `SELECT count(*) FROM reserva WHERE estado = 'CONFIRMADA'`)).toBe(1);
    expect(await contar(entorno.pool, 'SELECT count(*) FROM ficho_qr')).toBe(1);
  });

  it('10 pagos simultáneos por la última porción: uno se confirma y los demás se reembolsan', async () => {
    const esc = await prepararEscenario(entorno.pool, { porciones: { pescado: 1 } });
    const sesiones = await Promise.all([...Array(10)].map((_, i) => sesionDe(entorno, esc.usuarios[`regular${i + 1}`])));
    // Todos reservan antes de que alguien pague (la porción se descuenta al confirmar)
    const reservas = [];
    for (const auth of sesiones) {
      const r = await crearReserva(entorno, auth, pedido(esc, { idProteina: esc.proteinas.pescado }));
      expect(r.status).toBe(201);
      reservas.push(r.body.reserva.idReserva);
    }
    const cobrosAntes = entorno.pasarela.cobros;
    const pagos = await Promise.all(
      sesiones.map((auth, i) => pagar(entorno, auth, reservas[i], { metodo: 'TARJETA', datos: TARJETA })),
    );
    const aprobados = pagos.filter((p) => p.body.resultado === 'APROBADO');
    const reembolsados = pagos.filter((p) => p.body.resultado === 'REEMBOLSADO');
    // Si al llegar el pago la porción ya se vendió, se detiene ANTES de cobrar (regla 9).
    const sinCobro = pagos.filter((p) => p.status === 409 && p.body.error.codigo === 'PLATO_AGOTADO');
    expect(aprobados).toHaveLength(1);
    expect(reembolsados.length + sinCobro.length).toBe(9);
    expect(entorno.pasarela.cobros - cobrosAntes).toBe(1 + reembolsados.length);
    expect(await contar(entorno.pool, `SELECT count(*) FROM reserva WHERE estado = 'CONFIRMADA'`)).toBe(1);
    expect(await contar(entorno.pool, `SELECT count(*) FROM reserva WHERE estado = 'CANCELADA'`)).toBe(9);
    expect(await contar(entorno.pool, `SELECT count(*) FROM pago WHERE estado_pago = 'REEMBOLSADO'`)).toBe(reembolsados.length);
    expect(await contar(entorno.pool, `SELECT count(*) FROM pago WHERE estado_pago = 'APROBADO'`)).toBe(1);
    const { rows } = await entorno.pool.query('SELECT cantidad_disponible FROM menu_proteina WHERE id_proteina = $1', [esc.proteinas.pescado]);
    expect(rows[0].cantidad_disponible).toBe(0);
  });

  it('el total de platos del menú tampoco se vende de más', async () => {
    const esc = await prepararEscenario(entorno.pool, { porciones: { menu: 3 } });
    const sesiones = await Promise.all([...Array(10)].map((_, i) => sesionDe(entorno, esc.usuarios[`subsidiado${i + 1}`])));
    const respuestas = await Promise.all(sesiones.map((auth) => crearReserva(entorno, auth, pedido(esc))));
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(3);
    const { rows } = await entorno.pool.query('SELECT cantidad_disponible FROM menu');
    expect(rows[0].cantidad_disponible).toBe(0);
  });
});
