import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CONTRASENA, HOY, crearEntorno, crearReserva, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

/** Correo de prueba: guarda lo que se "envía" para leer el código. */
function correoDePrueba() {
  const enviados = [];
  return {
    configurado: true,
    enviados,
    async enviar(mensaje) {
      enviados.push(mensaje);
    },
    codigoPara(para) {
      const ultimo = enviados.filter((m) => m.para === para).at(-1);
      return ultimo?.texto.match(/\b(\d{6})\b/)?.[1] ?? null;
    },
  };
}

describe('Recuperación de contraseña', () => {
  const correo = correoDePrueba();
  const entorno = crearEntorno({ correo });
  let esc;
  beforeEach(async () => {
    correo.enviados.length = 0;
    esc = await prepararEscenario(entorno.pool);
  });
  afterAll(() => entorno.pool.end());

  const pedirCodigo = (para) => entorno.api().post('/api/auth/recuperar/codigo').send({ correo: para });
  const restablecer = (datos) => entorno.api().post('/api/auth/recuperar/restablecer').send(datos);
  const ingresar = (para, contrasena) => entorno.api().post('/api/auth/login').send({ correo: para, contrasena });

  it('envía un código por correo y con él se crea una contraseña nueva', async () => {
    const { correo: para } = esc.usuarios.regular1;
    const r = await pedirCodigo(para);
    expect(r.status).toBe(200);
    expect(r.body.mensaje).toMatch(/código de 6 dígitos/);
    const codigo = correo.codigoPara(para);
    expect(codigo).toMatch(/^\d{6}$/);

    const cambio = await restablecer({ correo: para, codigo: `${codigo.slice(0, 3)} ${codigo.slice(3)}`, contrasena: 'NuevaClave2026' });
    expect(cambio.status).toBe(200);
    expect((await ingresar(para, 'NuevaClave2026')).status).toBe(200);
    expect((await ingresar(para, CONTRASENA)).status).toBe(401);

    // El código ya se usó: no sirve otra vez.
    const otraVez = await restablecer({ correo: para, codigo, contrasena: 'OtraClave2026' });
    expect(otraVez.body.error.codigo).toBe('CODIGO_INVALIDO');
  });

  it('responde igual si el correo no existe y no envía nada', async () => {
    const r = await pedirCodigo('nadie@udes.edu.co');
    expect(r.status).toBe(200);
    expect(r.body.mensaje).toMatch(/Si el correo pertenece/);
    expect(correo.enviados).toHaveLength(0);
  });

  it('una cuenta en revisión no recibe código', async () => {
    await entorno.api().post('/api/auth/registro').send({
      nombre: 'Ana', apellido: 'Ruiz', documento: '1234567890', correo: 'ana.ruiz@udes.edu.co', contrasena: 'Almuerzo2026', rol: 'EMPLEADO_UDES',
    });
    await pedirCodigo('ana.ruiz@udes.edu.co');
    expect(correo.enviados).toHaveLength(0);
  });

  it('rechaza el código vencido', async () => {
    const { correo: para } = esc.usuarios.regular2;
    await pedirCodigo(para);
    const codigo = correo.codigoPara(para);
    entorno.reloj.mover(HOY, '09:16:00');
    try {
      const r = await restablecer({ correo: para, codigo, contrasena: 'NuevaClave2026' });
      expect(r.status).toBe(400);
      expect(r.body.error.codigo).toBe('CODIGO_INVALIDO');
    } finally {
      entorno.reloj.mover(HOY, '09:00:00');
    }
  });

  it('después de 5 códigos equivocados bloquea el código, aunque luego llegue el correcto', async () => {
    const { correo: para } = esc.usuarios.regular3;
    await pedirCodigo(para);
    const codigo = correo.codigoPara(para);
    const malo = codigo === '000000' ? '111111' : '000000';
    const respuestas = [];
    for (let i = 0; i < 5; i++) respuestas.push((await restablecer({ correo: para, codigo: malo, contrasena: 'NuevaClave2026' })).body.error.codigo);
    expect(respuestas.slice(0, 4)).toEqual(Array(4).fill('CODIGO_INVALIDO'));
    expect(respuestas[4]).toBe('CODIGO_AGOTADO');
    const correcto = await restablecer({ correo: para, codigo, contrasena: 'NuevaClave2026' });
    expect(correcto.body.error.codigo).toBe('CODIGO_AGOTADO');
    expect((await ingresar(para, CONTRASENA)).status).toBe(200);
  });

  it('exige una contraseña nueva segura', async () => {
    const r = await restablecer({ correo: esc.usuarios.regular4.correo, codigo: '123456', contrasena: 'corta' });
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('DATOS_INVALIDOS');
  });

  it('limita los códigos por correo para no llenar el buzón', async () => {
    const { correo: para } = esc.usuarios.regular5;
    for (let i = 0; i < 3; i++) expect((await pedirCodigo(para)).status).toBe(200);
    const cuarto = await pedirCodigo(para);
    expect(cuarto.status).toBe(429);
    expect(correo.enviados).toHaveLength(3);
  });

  describe('con ayuda del administrador', () => {
    const pedirAyuda = (datos) => entorno.api().post('/api/auth/recuperar/ayuda').send(datos);
    const documentoDe = async (u) => (await entorno.pool.query('SELECT documento FROM usuario WHERE id_usuario = $1', [u.id])).rows[0].documento;

    it('el administrador ve la solicitud, genera un código y la persona cambia su contraseña', async () => {
      const persona = esc.usuarios.empleado;
      const r = await pedirAyuda({ correo: persona.correo, documento: await documentoDe(persona) });
      expect(r.status).toBe(200);
      expect(r.body.mensaje).toMatch(/Acércate a la caja/);

      const admin = await sesionDe(entorno, esc.usuarios.admin);
      const lista = await entorno.api().get('/api/admin/recuperaciones').set('Authorization', admin);
      expect(lista.body.solicitudes.map((s) => s.idUsuario)).toEqual([persona.id]);
      expect(lista.body.solicitudes[0].fechaSolicitudAyuda).toBeTruthy();

      const generado = await entorno.api().post(`/api/admin/recuperaciones/${persona.id}/codigo`).set('Authorization', admin);
      expect(generado.status).toBe(200);
      expect(generado.headers['cache-control']).toBe('no-store');
      expect(generado.body).toMatchObject({ minutos: 60 });
      expect(generado.body.codigo).toMatch(/^\d{6}$/);

      // La solicitud ya fue atendida
      expect((await entorno.api().get('/api/admin/recuperaciones').set('Authorization', admin)).body.solicitudes).toHaveLength(0);
      expect((await entorno.api().post(`/api/admin/recuperaciones/${persona.id}/codigo`).set('Authorization', admin)).status).toBe(404);

      // El código del administrador dura 60 minutos
      entorno.reloj.mover(HOY, '09:45:00');
      try {
        const cambio = await restablecer({ correo: persona.correo, codigo: generado.body.codigo, contrasena: 'Empleado2026' });
        expect(cambio.status).toBe(200);
      } finally {
        entorno.reloj.mover(HOY, '09:00:00');
      }
      expect((await ingresar(persona.correo, 'Empleado2026')).status).toBe(200);
    });

    it('si el documento no coincide no queda ninguna solicitud, pero la respuesta es la misma', async () => {
      const r = await pedirAyuda({ correo: esc.usuarios.regular6.correo, documento: '999999999' });
      expect(r.status).toBe(200);
      const admin = await sesionDe(entorno, esc.usuarios.admin);
      expect((await entorno.api().get('/api/admin/recuperaciones').set('Authorization', admin)).body.solicitudes).toHaveLength(0);
    });

    it('el administrador puede descartar una solicitud', async () => {
      const persona = esc.usuarios.regular7;
      await pedirAyuda({ correo: persona.correo, documento: await documentoDe(persona) });
      const admin = await sesionDe(entorno, esc.usuarios.admin);
      expect((await entorno.api().post(`/api/admin/recuperaciones/${persona.id}/descartar`).set('Authorization', admin)).status).toBe(204);
      expect((await entorno.api().get('/api/admin/recuperaciones').set('Authorization', admin)).body.solicitudes).toHaveLength(0);
    });

    it('un estudiante no puede usar las rutas de recuperación del administrador', async () => {
      const estudiante = await sesionDe(entorno, esc.usuarios.regular8);
      expect((await entorno.api().get('/api/admin/recuperaciones').set('Authorization', estudiante)).status).toBe(403);
      expect((await entorno.api().post(`/api/admin/recuperaciones/${esc.usuarios.regular8.id}/codigo`).set('Authorization', estudiante)).status).toBe(403);
    });
  });
});

describe('Ayuda y asistente', () => {
  const entorno = crearEntorno();
  let esc;
  beforeEach(async () => {
    esc = await prepararEscenario(entorno.pool);
  });
  afterAll(() => entorno.pool.end());

  const preguntar = (auth, mensaje) => entorno.api().post('/api/soporte/asistente').set('Authorization', auth).send({ mensaje });

  it('las preguntas frecuentes son públicas y no incluyen las de administración', async () => {
    const r = await entorno.api().get('/api/soporte/preguntas');
    expect(r.status).toBe(200);
    expect(r.body.temas.map((t) => t.id)).toContain('cuenta');
    expect(r.body.temas.map((t) => t.id)).not.toContain('admin');
    expect(r.body.preguntas.some((p) => p.id === 'olvide-contrasena')).toBe(true);
    expect(r.body.preguntas.every((p) => p.tema !== 'admin')).toBe(true);

    const admin = await sesionDe(entorno, esc.usuarios.admin);
    const todas = await entorno.api().get('/api/soporte/preguntas/todas').set('Authorization', admin);
    expect(todas.body.temas.map((t) => t.id)).toContain('admin');
  });

  it('el asistente exige sesión', async () => {
    expect((await entorno.api().post('/api/soporte/asistente').send({ mensaje: 'hola' })).status).toBe(401);
  });

  it('responde con la pregunta frecuente más parecida', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const r = await preguntar(auth, 'Olvidé mi contraseña, ¿qué hago?');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tipo: 'pregunta', pregunta: '¿Qué hago si olvidé mi contraseña?' });

    const pago = await preguntar(auth, 'me rechazaron el pago con la tarjeta');
    expect(pago.body.pregunta).toBe('Mi pago fue rechazado');
  });

  it('dice el menú de hoy con datos reales', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const r = await preguntar(auth, '¿Qué hay de menú hoy?');
    expect(r.body.tipo).toBe('menu');
    expect(r.body.respuesta).toMatch(/proteína pollo/);
    expect(r.body.respuesta).toMatch(/\$12\.000/);
  });

  it('dice la hora límite y el estado de mi reserva', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.subsidiado1);
    const horario = await preguntar(auth, '¿Hasta qué hora puedo reservar?');
    expect(horario.body.respuesta).toMatch(/hasta las 10:30 a\. m\./);

    expect((await preguntar(auth, '¿Tengo reserva?')).body.respuesta).toMatch(/No tienes una reserva activa/);
    expect((await crearReserva(entorno, auth, pedido(esc))).status).toBe(201);
    expect((await preguntar(auth, 'estado de mi reserva')).body.respuesta).toMatch(/confirmada con subsidio/);
  });

  it('si no entiende, sugiere preguntas', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const r = await preguntar(auth, 'xyzzy');
    expect(r.body.tipo).toBe('sin-respuesta');
    expect(r.body.relacionadas.length).toBeGreaterThan(0);
  });

  it('valida el largo del mensaje', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    expect((await preguntar(auth, 'a'.repeat(301))).status).toBe(400);
    expect((await preguntar(auth, '   ')).status).toBe(400);
  });
});
