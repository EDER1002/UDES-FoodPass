import { Router } from 'express';
import { validar } from '../../compartido/validacion.js';
import {
  esquemaAcompanamiento,
  esquemaActualizarMenu,
  esquemaCrearMenu,
  esquemaFecha,
  esquemaId,
  esquemaProteina,
  esquemaTipoAlmuerzo,
} from './gestion-menu.esquemas.js';

/**
 * Rutas de Gestión de Menú. `contarSelecciones` lo entrega la composición
 * de la aplicación (viene de Reservas) para mostrar al administrador cuántas
 * porciones de cada opción ya se reservaron, sin que este módulo dependa de Reservas.
 */
export function rutasGestionMenu({ menu, reloj, sesion, soloAdmin, contarSelecciones }) {
  const rutas = Router();

  // GET /api/menu/hoy → consultarMenu() con porciones y hora límite
  rutas.get('/menu/hoy', sesion, async (_req, res) => {
    res.json({ menu: await menu.consultarMenu(reloj.hoy()) });
  });

  // ---------- Administración del menú (RF02) ----------
  rutas.get('/admin/menu', soloAdmin, async (req, res) => {
    const { fecha } = validar(esquemaFecha, { fecha: req.query.fecha ?? reloj.hoy() });
    const detalle = await menu.consultarMenuAdmin(fecha);
    res.json({ menu: { ...detalle, reservadas: await contarSelecciones(detalle.idMenu) } });
  });

  rutas.post('/admin/menu', soloAdmin, async (req, res) => {
    const creado = await menu.publicarMenu(validar(esquemaCrearMenu, req.body));
    res.status(201).json({ menu: { ...creado, reservadas: await contarSelecciones(creado.idMenu) } });
  });

  rutas.put('/admin/menu/:id', soloAdmin, async (req, res) => {
    const { id } = validar(esquemaId, req.params);
    const actualizado = await menu.actualizarMenu(id, validar(esquemaActualizarMenu, req.body));
    res.json({ menu: { ...actualizado, reservadas: await contarSelecciones(actualizado.idMenu) } });
  });

  rutas.delete('/admin/menu/:id', soloAdmin, async (req, res) => {
    const { id } = validar(esquemaId, req.params);
    await menu.eliminarMenu(id);
    res.status(204).end();
  });

  // ---------- Catálogos ----------
  const catalogo = (ruta, clave, esquema, operaciones) => {
    rutas.get(`/admin/${ruta}`, soloAdmin, async (_req, res) => {
      res.json({ [clave]: await operaciones.listar() });
    });
    rutas.post(`/admin/${ruta}`, soloAdmin, async (req, res) => {
      res.status(201).json({ [clave.replace(/s$/, '')]: await operaciones.crear(validar(esquema, req.body)) });
    });
    rutas.put(`/admin/${ruta}/:id`, soloAdmin, async (req, res) => {
      const { id } = validar(esquemaId, req.params);
      res.json({ [clave.replace(/s$/, '')]: await operaciones.actualizar(id, validar(esquema, req.body)) });
    });
  };

  catalogo('proteinas', 'proteinas', esquemaProteina, {
    listar: () => menu.listarProteinas(),
    crear: (d) => menu.crearProteina(d),
    actualizar: (id, d) => menu.actualizarProteina(id, d),
  });
  catalogo('acompanamientos', 'acompanamientos', esquemaAcompanamiento, {
    listar: () => menu.listarAcompanamientos(),
    crear: (d) => menu.crearAcompanamiento(d),
    actualizar: (id, d) => menu.actualizarAcompanamiento(id, d),
  });
  catalogo('tipos-almuerzo', 'tipos', esquemaTipoAlmuerzo, {
    listar: () => menu.listarTipos(),
    crear: (d) => menu.crearTipo(d),
    actualizar: (id, d) => menu.actualizarTipo(id, d),
  });

  return rutas;
}
