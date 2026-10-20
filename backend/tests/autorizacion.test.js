import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CONTRASENA, crearEntorno, crearReserva, pagar, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

describe('Autenticación y autorización (RF01)', () => {
  const entorno = crearEntorno();
  let esc;
  beforeAll(() => {});
  beforeEach(async () => {
    esc = await prepararEscenario(entorno.pool);
  });
  afterAll(() => entorno.pool.end());

  it('inicia sesión y el rol lo decide el backend', async () => {
    const r = await entorno.api().post('/api/auth/login').send({ correo: esc.usuarios.subsidiado1.correo, contrasena: CONTRASENA, rol: 'ADMINISTRADOR' });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTypeOf('string');
    expect(r.body.usuario.rol).toBe('ESTUDIANTE_SUBSIDIADO');
    expect(r.body.usuario).not.toHaveProperty('contrasena_hash');
  });

  it('rechaza una contraseña incorrecta sin revelar qué falló', async () => {
    const r = await entorno.api().post('/api/auth/login').send({ correo: esc.usuarios.regular1.correo, contrasena: 'otra' });
    expect(r.status).toBe(401);
    expect(r.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    const noExiste = await entorno.api().post('/api/auth/login').send({ correo: 'nadie@udes.edu.co', contrasena: 'otra' });
    expect(noExiste.body.error).toEqual(r.body.error);
  });

  it('solo acepta correos @udes.edu.co', async () => {
    const r = await entorno.api().post('/api/auth/login').send({ correo: 'laura@gmail.com', contrasena: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.error.codigo).toBe('DATOS_INVALIDOS');
  });

  it('exige un token válido', async () => {
    expect((await entorno.api().get('/api/menu/hoy')).status).toBe(401);
    const falso = await entorno.api().get('/api/menu/hoy').set('Authorization', 'Bearer abc.def.ghi');
    expect(falso.status).toBe(401);
    expect(falso.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it('GET /api/auth/me devuelve el usuario autenticado', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.empleado);
    const r = await entorno.api().get('/api/auth/me').set('Authorization', auth);
    expect(r.status).toBe(200);
    expect(r.body.usuario.rol).toBe('EMPLEADO_UDES');
  });

  it('un estudiante no puede usar rutas de administrador', async () => {
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const rutas = [
      ['get', '/api/admin/menu'],
      ['post', '/api/admin/menu'],
      ['get', '/api/admin/proteinas'],
      ['get', '/api/admin/configuracion-reserva'],
      ['post', '/api/admin/fichos/validar'],
      ['post', '/api/admin/fichos/1/entregar'],
      ['get', '/api/admin/entregas'],
    ];
    for (const [metodo, ruta] of rutas) {
      const r = await entorno.api()[metodo](ruta).set('Authorization', auth).send({});
      expect(r.status, `${metodo.toUpperCase()} ${ruta}`).toBe(403);
      expect(r.body.error.codigo).toBe('ACCESO_DENEGADO');
    }
  });

  it('el administrador no reserva y el subsidiado no paga en línea', async () => {
    const admin = await sesionDe(entorno, esc.usuarios.admin);
    expect((await crearReserva(entorno, admin, pedido(esc))).status).toBe(403);
    const sub = await sesionDe(entorno, esc.usuarios.subsidiado1);
    const r = await pagar(entorno, sub, 1, { metodo: 'NEQUI', datos: { telefono: '3001234567' } });
    expect(r.status).toBe(403);
  });

  it('nadie puede pagar ni cancelar la reserva de otra persona', async () => {
    const duena = await sesionDe(entorno, esc.usuarios.regular1);
    const otra = await sesionDe(entorno, esc.usuarios.regular2);
    const { body } = await crearReserva(entorno, duena, pedido(esc));
    const id = body.reserva.idReserva;
    expect((await pagar(entorno, otra, id, { metodo: 'NEQUI', datos: { telefono: '3001234567' } })).status).toBe(404);
    expect((await entorno.api().post(`/api/reservas/${id}/cancelar`).set('Authorization', otra)).status).toBe(404);
    expect((await entorno.api().get(`/api/reservas/${id}`).set('Authorization', otra)).status).toBe(404);
  });
});
