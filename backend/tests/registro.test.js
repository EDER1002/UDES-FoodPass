import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearEntorno, crearReserva, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

const nuevaCuenta = (cambios = {}) => ({
  nombre: 'María José',
  apellido: "Peña D'Costa",
  documento: '1098765432',
  correo: 'maria.pena@udes.edu.co',
  telefono: '3001112233',
  contrasena: 'Almuerzo2026',
  rol: 'ESTUDIANTE_REGULAR',
  ...cambios,
});

describe('Registro de cuentas con verificación del rol', () => {
  const entorno = crearEntorno();
  let esc;
  let admin;
  beforeEach(async () => {
    esc = await prepararEscenario(entorno.pool);
    admin = await sesionDe(entorno, esc.usuarios.admin);
  });
  afterAll(() => entorno.pool.end());

  const registrar = (datos) => entorno.api().post('/api/auth/registro').send(datos);
  const ingresar = (correo, contrasena = 'Almuerzo2026') => entorno.api().post('/api/auth/login').send({ correo, contrasena });

  it('el estudiante regular queda activo y con sesión iniciada', async () => {
    const r = await registrar(nuevaCuenta());
    expect(r.status).toBe(201);
    expect(r.body.estadoCuenta).toBe('ACTIVA');
    expect(r.body.token).toBeTypeOf('string');
    expect(r.body.usuario).toMatchObject({ rol: 'ESTUDIANTE_REGULAR', nombreCompleto: "María José Peña D'Costa" });
    expect(r.body.usuario).not.toHaveProperty('contrasena_hash');

    const reserva = await crearReserva(entorno, `Bearer ${r.body.token}`, pedido(esc));
    expect(reserva.status).toBe(201);
  });

  it.each(['ESTUDIANTE_SUBSIDIADO', 'EMPLEADO_UDES', 'ADMINISTRADOR'])('%s queda en revisión y no puede iniciar sesión', async (rol) => {
    const r = await registrar(nuevaCuenta({ rol }));
    expect(r.status).toBe(201);
    expect(r.body.estadoCuenta).toBe('PENDIENTE');
    expect(r.body).not.toHaveProperty('token');

    const login = await ingresar('maria.pena@udes.edu.co');
    expect(login.status).toBe(403);
    expect(login.body.error.codigo).toBe('CUENTA_EN_REVISION');
    // Con una contraseña incorrecta no se revela que la cuenta existe.
    const mala = await ingresar('maria.pena@udes.edu.co', 'otra-cosa-1');
    expect(mala.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
  });

  it('rechaza correos repetidos, documentos repetidos y datos inválidos', async () => {
    await registrar(nuevaCuenta());
    const correo = await registrar(nuevaCuenta({ documento: '1111111111' }));
    expect(correo.status).toBe(409);
    expect(correo.body.error.codigo).toBe('CORREO_REGISTRADO');
    const documento = await registrar(nuevaCuenta({ correo: 'otra@udes.edu.co' }));
    expect(documento.body.error.codigo).toBe('DOCUMENTO_REGISTRADO');

    const invalido = await registrar(nuevaCuenta({ correo: 'maria@gmail.com', contrasena: 'corta', rol: 'SUPERUSUARIO' }));
    expect(invalido.status).toBe(400);
    const campos = invalido.body.error.detalles.campos.map((c) => c.campo);
    expect(campos).toEqual(expect.arrayContaining(['correo', 'contrasena', 'rol']));
  });

  it('el administrador aprueba a un subsidiado con la vigencia de su subsidio y ya puede reservar sin pagar', async () => {
    const registro = await registrar(nuevaCuenta({ rol: 'ESTUDIANTE_SUBSIDIADO' }));
    const id = registro.body.usuario.idUsuario;

    const lista = await entorno.api().get('/api/admin/solicitudes').set('Authorization', admin);
    expect(lista.body.solicitudes.map((s) => s.idUsuario)).toEqual([id]);

    const sinFechas = await entorno.api().post(`/api/admin/solicitudes/${id}/aprobar`).set('Authorization', admin).send({});
    expect(sinFechas.status).toBe(400);
    expect(sinFechas.body.error.codigo).toBe('VIGENCIA_REQUERIDA');

    const aprobada = await entorno
      .api()
      .post(`/api/admin/solicitudes/${id}/aprobar`)
      .set('Authorization', admin)
      .send({ fechaInicioVigencia: '2026-10-01', fechaFinVigencia: '2026-12-15' });
    expect(aprobada.status).toBe(200);
    expect(aprobada.body.usuario.estadoCuenta).toBe('ACTIVA');

    const login = await ingresar('maria.pena@udes.edu.co');
    expect(login.status).toBe(200);
    const reserva = await crearReserva(entorno, `Bearer ${login.body.token}`, pedido(esc));
    expect(reserva.status).toBe(201);
    expect(reserva.body.reserva).toMatchObject({ tipoReserva: 'SUBSIDIADA', estado: 'CONFIRMADA', valorTotal: 0 });

    const otraVez = await entorno.api().post(`/api/admin/solicitudes/${id}/aprobar`).set('Authorization', admin).send({ fechaInicioVigencia: '2026-10-01' });
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error.codigo).toBe('SOLICITUD_YA_REVISADA');
  });

  it('el administrador rechaza una solicitud con un motivo, y la persona lo ve al intentar ingresar', async () => {
    const registro = await registrar(nuevaCuenta({ rol: 'ADMINISTRADOR' }));
    const id = registro.body.usuario.idUsuario;
    const sinMotivo = await entorno.api().post(`/api/admin/solicitudes/${id}/rechazar`).set('Authorization', admin).send({});
    expect(sinMotivo.status).toBe(400);

    const r = await entorno
      .api()
      .post(`/api/admin/solicitudes/${id}/rechazar`)
      .set('Authorization', admin)
      .send({ motivo: 'No figura en la nómina de la cafetería' });
    expect(r.body.usuario.estadoCuenta).toBe('RECHAZADA');

    const login = await ingresar('maria.pena@udes.edu.co');
    expect(login.status).toBe(403);
    expect(login.body.error).toMatchObject({ codigo: 'CUENTA_RECHAZADA', detalles: { motivo: 'No figura en la nómina de la cafetería' } });
  });

  it('solo el administrador ve y revisa solicitudes', async () => {
    const registro = await registrar(nuevaCuenta({ rol: 'EMPLEADO_UDES' }));
    const estudiante = await sesionDe(entorno, esc.usuarios.regular1);
    const lista = await entorno.api().get('/api/admin/solicitudes').set('Authorization', estudiante);
    expect(lista.status).toBe(403);
    const aprobar = await entorno.api().post(`/api/admin/solicitudes/${registro.body.usuario.idUsuario}/aprobar`).set('Authorization', estudiante).send({});
    expect(aprobar.status).toBe(403);
  });

  it('una sesión deja de servir si la cuenta ya no está activa', async () => {
    const sesion = await sesionDe(entorno, esc.usuarios.regular1);
    await entorno.pool.query(`UPDATE usuario SET estado_cuenta = 'PENDIENTE' WHERE id_usuario = $1`, [esc.usuarios.regular1.id]);
    const r = await entorno.api().get('/api/auth/me').set('Authorization', sesion);
    expect(r.status).toBe(401);
  });
});
