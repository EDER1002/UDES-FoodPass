import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HOY, TARJETA, contar, crearEntorno, crearReserva, enviarWebhook, pagar, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

// Errores encontrados en la revisión con agentes; cada prueba reproduce uno.

describe('Muchas peticiones a la vez no agotan la base de datos (RNF01)', () => {
  // Con un pool de 3 conexiones, 8 pagos simultáneos dejaban la API colgada para siempre.
  const entorno = crearEntorno({ maxConexiones: 3 });
  afterAll(() => entorno.pool.end());

  it('8 pagos simultáneos con un pool de 3 conexiones terminan todos', async () => {
    const esc = await prepararEscenario(entorno.pool, { porciones: { pollo: 3 } });
    const pagos = [];
    for (let i = 1; i <= 8; i++) {
      const auth = await sesionDe(entorno, esc.usuarios[`regular${i}`]);
      const { body } = await crearReserva(entorno, auth, pedido(esc));
      pagos.push(() => pagar(entorno, auth, body.reserva.idReserva, { metodo: 'TARJETA', datos: TARJETA }));
    }
    const respuestas = await Promise.all(pagos.map((p) => p()));
    // Todos responden: aprobado, reembolsado (se agotó tras cobrar) o agotado antes de cobrar.
    const resultados = respuestas.map((r) => r.body.resultado ?? r.body.error?.codigo);
    expect(resultados.every((r) => ['APROBADO', 'REEMBOLSADO', 'PLATO_AGOTADO'].includes(r))).toBe(true);
    expect(resultados.filter((r) => r === 'APROBADO')).toHaveLength(3);
    const salud = await entorno.api().get('/api/salud');
    expect(salud.status).toBe(200);
  }, 30_000);
});

describe('Pagos que llegan tarde o fallan', () => {
  const entorno = crearEntorno();
  let esc;
  let auth;
  beforeEach(async () => {
    entorno.reloj.mover(HOY, '09:00:00');
    esc = await prepararEscenario(entorno.pool);
    auth = await sesionDe(entorno, esc.usuarios.regular1);
  });
  afterAll(() => entorno.pool.end());

  const reservar = async () => (await crearReserva(entorno, auth, pedido(esc))).body.reserva.idReserva;
  const estado = async (idReserva) =>
    (await entorno.pool.query('SELECT r.estado, p.estado_pago FROM reserva r LEFT JOIN pago p USING (id_reserva) WHERE id_reserva = $1', [idReserva])).rows[0];

  it('no se puede pagar después de la hora límite (RF04): se cancela sin cobrar', async () => {
    entorno.reloj.mover(HOY, '10:25:00');
    const idReserva = await reservar();
    entorno.reloj.mover(HOY, '10:31:00');
    const cobros = entorno.pasarela.cobros;
    const r = await pagar(entorno, auth, idReserva, { metodo: 'TARJETA', datos: TARJETA });
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('FUERA_DE_HORARIO');
    expect(entorno.pasarela.cobros).toBe(cobros);
    expect(await estado(idReserva)).toEqual({ estado: 'CANCELADA', estado_pago: null });
  });

  it('un PSE que el banco aprueba al día siguiente se reembolsa en vez de dar error', async () => {
    const idReserva = await reservar();
    await pagar(entorno, auth, idReserva, { metodo: 'PSE', datos: { banco: '3', tipoPersona: 'NATURAL', documento: '1098765432' } });
    const { rows } = await entorno.pool.query('SELECT referencia_transaccion FROM pago WHERE id_reserva = $1', [idReserva]);
    entorno.reloj.mover('2026-10-20', '00:10:00');
    const webhook = await enviarWebhook(entorno, { referencia: rows[0].referencia_transaccion, estado: 'APROBADO' });
    expect(webhook.status).toBe(200);
    expect(await estado(idReserva)).toEqual({ estado: 'CANCELADA', estado_pago: 'REEMBOLSADO' });
    expect(await contar(entorno.pool, 'SELECT count(*) FROM ficho_qr')).toBe(0);
  });

  it('si la pasarela falla, el pago queda rechazado y la persona puede volver a reservar', async () => {
    const idReserva = await reservar();
    const cobrar = entorno.pasarela.cobrar;
    entorno.pasarela.cobrar = async () => {
      throw new Error('tiempo de espera agotado');
    };
    try {
      const r = await pagar(entorno, auth, idReserva, { metodo: 'TARJETA', datos: TARJETA });
      expect(r.status).toBe(200);
      expect(r.body.resultado).toBe('RECHAZADO');
    } finally {
      entorno.pasarela.cobrar = cobrar;
    }
    expect(await estado(idReserva)).toEqual({ estado: 'CANCELADA', estado_pago: 'RECHAZADO' });
    expect((await crearReserva(entorno, auth, pedido(esc))).status).toBe(201);
  });

  it('un pago con tarjeta trabado en PENDIENTE (el servidor se cayó a mitad del cobro) vence y libera el día', async () => {
    const idReserva = await reservar();
    await entorno.pool.query(
      `INSERT INTO pago (id_reserva, monto, fecha_pago, estado_pago, referencia_transaccion, metodo_pago)
       VALUES ($1, 12000, $2, 'PENDIENTE', 'FP-TRABADO-1', 'TARJETA')`,
      [idReserva, new Date(entorno.reloj.ahora() - 60_000)],
    );
    const pronto = await crearReserva(entorno, auth, pedido(esc));
    expect(pronto.status).toBe(409);
    entorno.reloj.mover(HOY, '09:05:00');
    const despues = await crearReserva(entorno, auth, pedido(esc));
    expect(despues.status).toBe(201);
    expect(await estado(idReserva)).toEqual({ estado: 'CANCELADA', estado_pago: 'RECHAZADO' });
  });
});

describe('Entregar y cancelar a la vez', () => {
  const entorno = crearEntorno();
  afterAll(() => entorno.pool.end());

  it('nunca termina en un error interno (antes: bloqueo mutuo de PostgreSQL)', async () => {
    const esc = await prepararEscenario(entorno.pool);
    const admin = await sesionDe(entorno, esc.usuarios.admin);
    for (let i = 1; i <= 5; i++) {
      const auth = await sesionDe(entorno, esc.usuarios[`subsidiado${i}`]);
      const { body } = await crearReserva(entorno, auth, pedido(esc));
      const { idReserva } = body.reserva;
      const idFicho = body.reserva.ficho.idFicho;
      const [cancelar, entregar] = await Promise.all([
        entorno.api().post(`/api/reservas/${idReserva}/cancelar`).set('Authorization', auth),
        entorno.api().post(`/api/admin/fichos/${idFicho}/entregar`).set('Authorization', admin),
      ]);
      expect([cancelar.status, entregar.status]).not.toContain(500);
      expect([cancelar.status, entregar.status].filter((s) => s === 200)).toHaveLength(1);
    }
  });
});

describe('Entradas fuera de rango', () => {
  const entorno = crearEntorno();
  let auth;
  let admin;
  beforeEach(async () => {
    const esc = await prepararEscenario(entorno.pool);
    auth = await sesionDe(entorno, esc.usuarios.regular1);
    admin = await sesionDe(entorno, esc.usuarios.admin);
  });
  afterAll(() => entorno.pool.end());

  it('ids enormes o raros responden 400, no 500', async () => {
    for (const id of ['99999999999', '1e0', '0x1']) {
      const r = await entorno.api().get(`/api/reservas/${id}`).set('Authorization', auth);
      expect(r.status).toBe(400);
    }
    const r = await crearReserva(entorno, auth, { idTipoAlmuerzo: true, idProteina: [1], idsAcompanamiento: [2147483648] });
    expect(r.status).toBe(400);
  });

  it('el año 0000 responde 400', async () => {
    const r = await entorno.api().get('/api/admin/menu?fecha=0000-01-01').set('Authorization', admin);
    expect(r.status).toBe(400);
  });

  it('una ruta fuera de /api responde el error en JSON', async () => {
    const r = await entorno.api().get('/noapi');
    expect(r.status).toBe(404);
    expect(r.body.error.codigo).toBe('RUTA_NO_ENCONTRADA');
  });

  it('una imagen de otro sitio con "//" se rechaza', async () => {
    const r = await entorno.api().post('/api/admin/proteinas').set('Authorization', admin).send({ nombre: 'Cerdo', imagenUrl: '//otro.sitio/x.svg' });
    expect(r.status).toBe(400);
  });
});

describe('Guardar el menú respeta las porciones vendidas mientras se editaba (RNF03)', () => {
  const entorno = crearEntorno();
  afterAll(() => entorno.pool.end());

  it('aplica solo el cambio del administrador', async () => {
    const esc = await prepararEscenario(entorno.pool, { porciones: { pescado: 3 } });
    const admin = await sesionDe(entorno, esc.usuarios.admin);
    const { body: vista } = await entorno.api().get(`/api/admin/menu?fecha=${HOY}`).set('Authorization', admin);
    const menu = vista.menu;

    // Mientras el administrador edita, se venden las 3 porciones de pescado.
    for (let i = 1; i <= 3; i++) {
      const auth = await sesionDe(entorno, esc.usuarios[`subsidiado${i}`]);
      expect((await crearReserva(entorno, auth, pedido(esc, { idProteina: esc.proteinas.pescado }))).status).toBe(201);
    }

    // El administrador solo cambia la hora de cierre y sube el pollo de 50 a 60.
    const proteinas = menu.proteinas.map((p) => ({
      idProteina: p.idProteina,
      cantidadVista: p.porciones,
      cantidadDisponible: p.idProteina === esc.proteinas.pollo ? 60 : p.porciones,
    }));
    const acompanamientos = menu.acompanamientos.map((a) => ({ idAcompanamiento: a.idAcompanamiento, cantidadVista: a.porciones, cantidadDisponible: a.porciones }));
    const r = await entorno
      .api()
      .put(`/api/admin/menu/${menu.idMenu}`)
      .set('Authorization', admin)
      .send({
        estado: 'PUBLICADO',
        horaInicioReserva: '06:00',
        horaFinReserva: '10:00',
        cantidadDisponible: menu.cantidadDisponible,
        cantidadDisponibleVista: menu.cantidadDisponible,
        proteinas,
        acompanamientos,
      });
    expect(r.status).toBe(200);
    const porciones = Object.fromEntries(r.body.menu.proteinas.map((p) => [p.idProteina, p.porciones]));
    expect(porciones[esc.proteinas.pescado]).toBe(0);
    expect(porciones[esc.proteinas.pollo]).toBe(60);
    expect(r.body.menu.cantidadDisponible).toBe(menu.cantidadDisponible - 3);

    const otro = await sesionDe(entorno, esc.usuarios.subsidiado4);
    const agotado = await crearReserva(entorno, otro, pedido(esc, { idProteina: esc.proteinas.pescado }));
    expect(agotado.body.error.codigo).toBe('PLATO_AGOTADO');
  });
});
