import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HOY, crearEntorno, crearReserva, pedido, prepararEscenario, sesionDe } from './ayudantes.js';

describe('Administración: menú, catálogos y horarios (RF02, RF04)', () => {
  const entorno = crearEntorno();
  let esc;
  let admin;
  beforeEach(async () => {
    esc = await prepararEscenario(entorno.pool);
    entorno.reloj.mover(HOY, '09:00:00');
    admin = await sesionDe(entorno, esc.usuarios.admin);
  });
  afterAll(() => entorno.pool.end());

  const menuNuevo = (cambios = {}) => ({
    fecha: '2026-10-20',
    estado: 'PUBLICADO',
    horaInicioReserva: '06:00',
    horaFinReserva: '10:30',
    cantidadDisponible: 80,
    proteinas: [{ idProteina: esc.proteinas.pollo, cantidadDisponible: 40 }],
    acompanamientos: [{ idAcompanamiento: esc.acompanamientos.arroz, cantidadDisponible: 60 }],
    ...cambios,
  });

  it('crea, consulta, edita y elimina un menú', async () => {
    const creado = await entorno.api().post('/api/admin/menu').set('Authorization', admin).send(menuNuevo());
    expect(creado.status).toBe(201);
    expect(creado.body.menu).toMatchObject({ fecha: '2026-10-20', estado: 'PUBLICADO', horaFinReserva: '10:30:00' });
    const id = creado.body.menu.idMenu;

    const duplicado = await entorno.api().post('/api/admin/menu').set('Authorization', admin).send(menuNuevo());
    expect(duplicado.body.error.codigo).toBe('MENU_EXISTE');

    const editado = await entorno.api().put(`/api/admin/menu/${id}`).set('Authorization', admin).send({
      ...menuNuevo({ estado: 'BORRADOR' }),
      proteinas: [{ idProteina: esc.proteinas.res, cantidadDisponible: 10 }],
    });
    expect(editado.status).toBe(200);
    expect(editado.body.menu.proteinas.map((p) => p.idProteina)).toEqual([esc.proteinas.res]);

    const consulta = await entorno.api().get('/api/admin/menu?fecha=2026-10-20').set('Authorization', admin);
    expect(consulta.body.menu.estado).toBe('BORRADOR');

    expect((await entorno.api().delete(`/api/admin/menu/${id}`).set('Authorization', admin)).status).toBe(204);
    expect((await entorno.api().get('/api/admin/menu?fecha=2026-10-20').set('Authorization', admin)).status).toBe(404);
  });

  it('no permite eliminar un menú con reservas', async () => {
    await crearReserva(entorno, await sesionDe(entorno, esc.usuarios.subsidiado1), pedido(esc));
    const r = await entorno.api().delete(`/api/admin/menu/${esc.idMenu}`).set('Authorization', admin);
    expect(r.status).toBe(409);
    expect(r.body.error.codigo).toBe('MENU_CON_RESERVAS');
  });

  it('muestra cuántas porciones de cada opción ya se reservaron', async () => {
    await crearReserva(entorno, await sesionDe(entorno, esc.usuarios.subsidiado1), pedido(esc));
    const r = await entorno.api().get(`/api/admin/menu?fecha=${HOY}`).set('Authorization', admin);
    expect(r.body.menu.reservadas.proteinas[esc.proteinas.pollo]).toBe(1);
    expect(r.body.menu.reservadas.acompanamientos[esc.acompanamientos.arroz]).toBe(1);
  });

  it('valida el menú: horas, porciones negativas y publicar sin opciones', async () => {
    const casos = [
      menuNuevo({ horaInicioReserva: '11:00' }),
      menuNuevo({ cantidadDisponible: -1 }),
      menuNuevo({ proteinas: [] }),
      menuNuevo({ fecha: '2026-02-30' }),
    ];
    for (const caso of casos) {
      const r = await entorno.api().post('/api/admin/menu').set('Authorization', admin).send(caso);
      expect(r.status, JSON.stringify(caso)).toBe(400);
      expect(r.body.error.codigo).toBe('DATOS_INVALIDOS');
    }
  });

  it('administra los catálogos de proteínas, acompañamientos y tipos de almuerzo', async () => {
    const proteina = await entorno.api().post('/api/admin/proteinas').set('Authorization', admin).send({ nombre: 'Cerdo BBQ', descripcion: 'En salsa dulce', imagenUrl: '/platos/bistec.svg' });
    expect(proteina.status).toBe(201);
    const editada = await entorno.api().put(`/api/admin/proteinas/${proteina.body.proteina.idProteina}`).set('Authorization', admin).send({ nombre: 'Cerdo BBQ', estado: 'INACTIVO' });
    expect(editada.body.proteina.estado).toBe('INACTIVO');
    const repetida = await entorno.api().post('/api/admin/proteinas').set('Authorization', admin).send({ nombre: 'Cerdo BBQ' });
    expect(repetida.body.error.codigo).toBe('NOMBRE_DUPLICADO');

    const acomp = await entorno.api().post('/api/admin/acompanamientos').set('Authorization', admin).send({ nombre: 'Papa criolla' });
    expect(acomp.status).toBe(201);

    const tipo = await entorno.api().post('/api/admin/tipos-almuerzo').set('Authorization', admin).send({ nombre: 'Ejecutivo', precio: 15000, maxAcompanamientos: 3 });
    expect(tipo.body.tipo).toMatchObject({ precio: 15000, maxAcompanamientos: 3 });
    const tipos = await entorno.api().get('/api/admin/tipos-almuerzo').set('Authorization', admin);
    expect(tipos.body.tipos).toHaveLength(3);
  });

  it('una proteína inactiva no aparece en el menú de los usuarios', async () => {
    await entorno.pool.query(`UPDATE proteina SET estado = 'INACTIVO' WHERE id_proteina = $1`, [esc.proteinas.res]);
    const auth = await sesionDe(entorno, esc.usuarios.regular1);
    const r = await entorno.api().get('/api/menu/hoy').set('Authorization', auth);
    expect(r.body.menu.proteinas.map((p) => p.idProteina)).not.toContain(esc.proteinas.res);
    const reserva = await crearReserva(entorno, auth, pedido(esc, { idProteina: esc.proteinas.res }));
    expect(reserva.body.error.codigo).toBe('OPCION_NO_VALIDA');
  });

  it('configura horarios por rol y por usuario, nunca ambos', async () => {
    const lista = await entorno.api().get('/api/admin/configuracion-reserva').set('Authorization', admin);
    expect(lista.body.configuraciones).toHaveLength(3);
    const regular = lista.body.configuraciones.find((c) => c.rol === 'ESTUDIANTE_REGULAR');

    const cambio = await entorno.api().put('/api/admin/configuracion-reserva').set('Authorization', admin).send({
      idConfiguracion: regular.idConfiguracion, idRol: regular.idRol, horaInicio: '06:00', horaFin: '08:00', fechaInicioVigencia: '2026-08-01', fechaFinVigencia: '2026-12-15',
    });
    expect(cambio.status).toBe(200);
    expect(cambio.body.configuracion.horaFin).toBe('08:00:00');
    // El nuevo horario se aplica de inmediato
    const reserva = await crearReserva(entorno, await sesionDe(entorno, esc.usuarios.regular1), pedido(esc));
    expect(reserva.body.error.codigo).toBe('FUERA_DE_HORARIO');

    const excepcion = await entorno.api().put('/api/admin/configuracion-reserva').set('Authorization', admin).send({
      idUsuario: esc.usuarios.regular1.id, horaInicio: '06:00', horaFin: '10:30', fechaInicioVigencia: HOY,
    });
    expect(excepcion.body.configuracion.usuario.documento).toMatch(/^\*\*\*\*\d{4}$/);

    const ambos = await entorno.api().put('/api/admin/configuracion-reserva').set('Authorization', admin).send({
      idRol: regular.idRol, idUsuario: esc.usuarios.regular1.id, horaInicio: '06:00', horaFin: '10:30', fechaInicioVigencia: HOY,
    });
    expect(ambos.status).toBe(400);

    const paraAdmin = await entorno.api().put('/api/admin/configuracion-reserva').set('Authorization', admin).send({
      idRol: esc.roles.ADMINISTRADOR, horaInicio: '06:00', horaFin: '10:30', fechaInicioVigencia: HOY,
    });
    expect(paraAdmin.body.error.codigo).toBe('ROL_NO_VALIDO');
  });

  it('busca usuarios para crear excepciones de horario', async () => {
    const r = await entorno.api().get('/api/admin/usuarios?buscar=regular1').set('Authorization', admin);
    expect(r.body.usuarios.map((u) => u.correo)).toContain('regular1@udes.edu.co');
  });
});
