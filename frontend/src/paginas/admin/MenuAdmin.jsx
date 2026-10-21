import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Cargando, PantallaDeError } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { dinero, fechaLarga, hora, hoyEnBogota, mayuscula } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';
import { imagenDePlato, tinteDePlato } from '../../utilidades/platos.js';
import { SelectorFecha } from './DisenoAdmin.jsx';

const ESTADOS = [
  ['BORRADOR', 'Borrador (no visible)'],
  ['PUBLICADO', 'Publicado (se puede reservar)'],
  ['CERRADO', 'Cerrado (no recibe reservas)'],
];
const PORCIONES_INICIALES = 30;

// `cantidadVista` guarda lo que había al abrir: el servidor aplica solo el cambio del
// administrador y respeta las porciones que se vendan mientras edita (sin sobreventa).
const aBorrador = (m) => ({
  estado: m.estado,
  horaInicioReserva: m.horaInicioReserva.slice(0, 5),
  horaFinReserva: m.horaFinReserva.slice(0, 5),
  cantidadDisponible: m.cantidadDisponible,
  cantidadDisponibleVista: m.cantidadDisponible,
  proteinas: m.proteinas.map((p) => ({ ...p, cantidadDisponible: p.porciones, cantidadVista: p.porciones })),
  acompanamientos: m.acompanamientos.map((a) => ({ ...a, cantidadDisponible: a.porciones, cantidadVista: a.porciones })),
});

const esCantidadValida = (valor) => String(valor).trim() !== '' && Number.isInteger(Number(valor)) && Number(valor) >= 0;

/** Administración del menú del día y sus porciones (RF02). */
export function MenuAdmin() {
  const { api } = useSesion();
  const [fecha, setFecha] = useState(hoyEnBogota);
  const { datos, error, cargando, recargar } = useDatos(
    async (senal) => {
      const [menu, proteinas, acompanamientos, tipos] = await Promise.all([
        api(`/admin/menu?fecha=${fecha}`, { senal }).catch((e) => {
          if (e.codigo === 'MENU_NO_ENCONTRADO') return { menu: null };
          throw e;
        }),
        api('/admin/proteinas', { senal }),
        api('/admin/acompanamientos', { senal }),
        api('/admin/tipos-almuerzo', { senal }),
      ]);
      return { menu: menu.menu, proteinas: proteinas.proteinas, acompanamientos: acompanamientos.acompanamientos, tipos: tipos.tipos };
    },
    [api, fecha],
  );
  const [borrador, setBorrador] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  useEffect(() => {
    setBorrador(datos?.menu ? aBorrador(datos.menu) : null);
    setConfirmarEliminar(false);
  }, [datos]);
  useEffect(() => setMensaje(null), [fecha]);

  const reservadas = datos?.menu?.reservadas ?? { proteinas: {}, acompanamientos: {} };
  const totalReservadas = useMemo(() => Object.values(reservadas.proteinas).reduce((a, b) => a + b, 0), [reservadas]);

  if (cargando && !datos) return <Cargando texto="Cargando el menú…" />;
  if (error) return <div className="admin-cuerpo"><PantallaDeError error={error} alReintentar={recargar} /></div>;

  // Mientras carga otra fecha, el borrador visible es el de la anterior: no se permite guardar.
  const ocupado = guardando || cargando;
  const activos = (lista) => lista.filter((x) => x.estado === 'ACTIVO');
  const crearMenuNuevo = () =>
    setBorrador({
      estado: 'BORRADOR',
      horaInicioReserva: '06:00',
      horaFinReserva: '10:30',
      cantidadDisponible: 120,
      proteinas: activos(datos.proteinas).map((p) => ({ ...p, cantidadDisponible: PORCIONES_INICIALES })),
      acompanamientos: activos(datos.acompanamientos).map((a) => ({ ...a, cantidadDisponible: PORCIONES_INICIALES })),
    });

  const guardar = async (cambios = {}) => {
    const cuerpo = { ...borrador, ...cambios };
    // Un campo vacío no se guarda como 0 (agotado) sin avisar.
    const vacio = [{ nombre: 'el total de platos', cantidadDisponible: cuerpo.cantidadDisponible }, ...cuerpo.proteinas, ...cuerpo.acompanamientos]
      .find((x) => !esCantidadValida(x.cantidadDisponible));
    if (vacio) {
      setMensaje({ tono: 'peligro', texto: `Escribe las porciones de ${vacio.nombre} (un número entero, 0 o más).` });
      return;
    }
    const conVista = (x) => (x.cantidadVista === undefined ? {} : { cantidadVista: x.cantidadVista });
    const datosMenu = {
      estado: cuerpo.estado,
      horaInicioReserva: cuerpo.horaInicioReserva,
      horaFinReserva: cuerpo.horaFinReserva,
      cantidadDisponible: Number(cuerpo.cantidadDisponible),
      ...(cuerpo.cantidadDisponibleVista === undefined ? {} : { cantidadDisponibleVista: cuerpo.cantidadDisponibleVista }),
      proteinas: cuerpo.proteinas.map((p) => ({ idProteina: p.idProteina, cantidadDisponible: Number(p.cantidadDisponible), ...conVista(p) })),
      acompanamientos: cuerpo.acompanamientos.map((a) => ({ idAcompanamiento: a.idAcompanamiento, cantidadDisponible: Number(a.cantidadDisponible), ...conVista(a) })),
    };
    setGuardando(true);
    setMensaje(null);
    try {
      if (datos.menu) await api(`/admin/menu/${datos.menu.idMenu}`, { metodo: 'PUT', cuerpo: datosMenu });
      else await api('/admin/menu', { metodo: 'POST', cuerpo: { ...datosMenu, fecha } });
      setMensaje({ tono: 'exito', texto: cambios.estado === 'CERRADO' ? 'Reservas cerradas para este menú.' : cambios.estado === 'PUBLICADO' ? 'Menú publicado: los usuarios ya pueden reservar.' : 'Cambios guardados.' });
      recargar();
    } catch (e) {
      setMensaje({ tono: 'peligro', texto: e.message });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    setGuardando(true);
    try {
      await api(`/admin/menu/${datos.menu.idMenu}`, { metodo: 'DELETE' });
      setMensaje({ tono: 'exito', texto: 'Menú eliminado.' });
      recargar();
    } catch (e) {
      setMensaje({ tono: 'peligro', texto: e.message });
      setConfirmarEliminar(false);
    } finally {
      setGuardando(false);
    }
  };

  const titulo = (
    <div className="titulo-pagina">
      <h1>Menú del día</h1>
      <SelectorFecha fecha={fecha} alCambiar={setFecha} etiqueta="Fecha del menú" />
      {datos.menu && <EstadoMenu estado={datos.menu.estado} />}
      <p>{mayuscula(fechaLarga(fecha, { conAnio: true }))}</p>
    </div>
  );

  if (!borrador) {
    return (
      <div className="admin-cuerpo">
        {titulo}
        {mensaje && <Aviso tono={mensaje.tono} icono={mensaje.tono === 'exito' ? 'check-circulo' : 'x-circulo'} titulo={mensaje.texto} rol="status" />}
        <section className="tarjeta" style={{ alignItems: 'flex-start' }}>
          <h2>No hay menú para esta fecha</h2>
          <p className="pista">Crea el menú con las proteínas y acompañamientos del catálogo. Queda como borrador hasta que lo publiques.</p>
          <button type="button" className="btn btn-primario auto" onClick={crearMenuNuevo} disabled={ocupado}><Icono nombre="mas" />Crear menú</button>
        </section>
      </div>
    );
  }

  const cambiar = (campo) => (e) => setBorrador((b) => ({ ...b, [campo]: e.target.value }));
  const cambiarPorciones = (lista, clave, id) => (e) =>
    setBorrador((b) => ({ ...b, [lista]: b[lista].map((x) => (x[clave] === id ? { ...x, cantidadDisponible: e.target.value } : x)) }));
  const quitar = (lista, clave, id) => setBorrador((b) => ({ ...b, [lista]: b[lista].filter((x) => x[clave] !== id) }));
  const agregar = (lista, item) => setBorrador((b) => ({ ...b, [lista]: [...b[lista], { ...item, cantidadDisponible: PORCIONES_INICIALES }] }));
  const agotadas = [...borrador.proteinas, ...borrador.acompanamientos].filter((x) => Number(x.cantidadDisponible) <= 0);

  return (
    <div className="admin-cuerpo">
      {titulo}
      <div className="titulo-pagina" style={{ marginTop: -6 }}>
        <div className="acciones" style={{ marginLeft: 0 }}>
          <button type="button" className="btn btn-primario chico auto" onClick={() => guardar()} disabled={ocupado}><Icono nombre="check" />Guardar cambios</button>
          {borrador.estado !== 'PUBLICADO' && (
            <button type="button" className="btn btn-secundario chico auto" onClick={() => guardar({ estado: 'PUBLICADO' })} disabled={ocupado}>Publicar menú</button>
          )}
          {datos.menu?.estado === 'PUBLICADO' && (
            <button type="button" className="btn btn-secundario chico auto" onClick={() => guardar({ estado: 'CERRADO' })} disabled={ocupado}><Icono nombre="candado" />Cerrar reservas</button>
          )}
          {datos.menu && !confirmarEliminar && (
            <button type="button" className="btn btn-peligro chico auto" onClick={() => setConfirmarEliminar(true)} disabled={ocupado}><Icono nombre="basura" />Eliminar menú</button>
          )}
        </div>
      </div>
      {confirmarEliminar && (
        <div className="aviso peligro" role="alertdialog" aria-labelledby="eliminar-titulo">
          <Icono nombre="alerta" />
          <div style={{ flex: 1 }}>
            <strong id="eliminar-titulo">¿Eliminar el menú de esta fecha?</strong>
            <span>Solo se puede eliminar si no tiene reservas. Si tiene, usa "Cerrar reservas".</span>
            <div className="fila-botones" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-peligro-lleno chico auto" onClick={eliminar} disabled={ocupado}>Sí, eliminar</button>
              <button type="button" className="btn btn-secundario chico auto" onClick={() => setConfirmarEliminar(false)}>No</button>
            </div>
          </div>
        </div>
      )}
      {mensaje && <Aviso tono={mensaje.tono} icono={mensaje.tono === 'exito' ? 'check-circulo' : 'x-circulo'} titulo={mensaje.texto} rol={mensaje.tono === 'exito' ? 'status' : 'alert'} />}

      {datos.menu && (
        <div className="kpis">
          <div className="kpi"><span className="lbl"><Icono nombre="reloj" />Ventana de reserva</span><span className="valor">{hora(datos.menu.horaInicioReserva)} – {hora(datos.menu.horaFinReserva)}</span></div>
          <div className="kpi"><span className="lbl"><Icono nombre="plato" />Platos disponibles</span><span className="valor">{datos.menu.cantidadDisponible}</span><span className="sub">{totalReservadas} reservados</span></div>
          <div className="kpi"><span className="lbl"><Icono nombre="check-circulo" />Reservas confirmadas</span><span className="valor">{totalReservadas}</span><span className="sub">Incluye las ya entregadas</span></div>
          <div className="kpi"><span className="lbl"><Icono nombre="alerta" />Opciones agotadas</span><span className="valor">{agotadas.length}</span><span className="sub">{agotadas.map((x) => x.nombre).join(', ') || 'Ninguna'}</span></div>
        </div>
      )}

      <div className="rejilla">
        <div className="columna-tarjetas">
          <section className="tarjeta" aria-labelledby="datos-menu">
            <h2 id="datos-menu">Datos del menú</h2>
            <div className="form-rejilla">
              <div className="campo completo">
                <label htmlFor="estado-menu">Estado</label>
                <div className="entrada chica"><select id="estado-menu" value={borrador.estado} onChange={cambiar('estado')}>{ESTADOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
              </div>
              <div className="campo">
                <label htmlFor="desde">Reservas desde</label>
                <div className="entrada chica"><input id="desde" type="time" value={borrador.horaInicioReserva} onChange={cambiar('horaInicioReserva')} /></div>
              </div>
              <div className="campo">
                <label htmlFor="hasta">Reservas hasta</label>
                <div className="entrada chica"><input id="hasta" type="time" value={borrador.horaFinReserva} onChange={cambiar('horaFinReserva')} /></div>
              </div>
              <div className="campo completo">
                <label htmlFor="total">Total de platos disponibles</label>
                <div className="entrada chica"><input id="total" type="number" min="0" inputMode="numeric" value={borrador.cantidadDisponible} onChange={cambiar('cantidadDisponible')} /></div>
              </div>
            </div>
            <p className="pista"><Icono nombre="info" /><span>Se combina con el horario de cada rol (pantalla Horarios). Hora de Colombia.</span></p>
          </section>
          <section className="tarjeta" aria-labelledby="tipos-menu">
            <h2 id="tipos-menu">Tipos de almuerzo <Link to="/admin/catalogos" style={{ fontSize: 14 }}>Editar en Catálogos</Link></h2>
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead><tr><th scope="col">Tipo</th><th scope="col">Precio</th><th scope="col">Acomp.</th></tr></thead>
                <tbody>{datos.tipos.map((t) => <tr key={t.idTipoAlmuerzo}><td><b>{t.nombre}</b></td><td>{dinero(t.precio)}</td><td>máx. {t.maxAcompanamientos}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>
        <div className="columna-tarjetas">
          <TablaOpciones titulo="Proteínas del menú" lista={borrador.proteinas} clave="idProteina" reservadas={reservadas.proteinas}
            catalogo={activos(datos.proteinas)} alCambiar={(id) => cambiarPorciones('proteinas', 'idProteina', id)}
            alQuitar={(id) => quitar('proteinas', 'idProteina', id)} alAgregar={(item) => agregar('proteinas', item)} />
          <TablaOpciones titulo="Acompañamientos del menú" lista={borrador.acompanamientos} clave="idAcompanamiento" reservadas={reservadas.acompanamientos}
            catalogo={activos(datos.acompanamientos)} alCambiar={(id) => cambiarPorciones('acompanamientos', 'idAcompanamiento', id)}
            alQuitar={(id) => quitar('acompanamientos', 'idAcompanamiento', id)} alAgregar={(item) => agregar('acompanamientos', item)} />
        </div>
      </div>
    </div>
  );
}

function EstadoMenu({ estado }) {
  const vista = { BORRADOR: ['neutro', 'editar', 'Borrador'], PUBLICADO: ['ok', 'check', 'Publicado'], CERRADO: ['alerta', 'candado', 'Cerrado'] }[estado];
  return <span className={`estado ${vista[0]}`}><Icono nombre={vista[1]} />{vista[2]}</span>;
}

function TablaOpciones({ titulo, lista, clave, reservadas, catalogo, alCambiar, alQuitar, alAgregar }) {
  const [elegido, setElegido] = useState('');
  const disponibles = catalogo.filter((c) => !lista.some((x) => x[clave] === c[clave]));
  const idSelect = `agregar-${clave}`;
  return (
    <section className="tarjeta" aria-label={titulo}>
      <h2>{titulo}</h2>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead><tr><th scope="col">Opción</th><th scope="col">Porciones disponibles</th><th scope="col">Reservadas</th><th scope="col">Estado</th><th scope="col"><span className="solo-lectores">Acciones</span></th></tr></thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={5} className="suave">Agrega al menos una opción del catálogo.</td></tr>}
            {lista.map((x) => {
              const porciones = Number(x.cantidadDisponible);
              return (
                <tr key={x[clave]}>
                  <td>
                    <span className="con-ilus">
                      <span className="ilus peq" style={{ background: tinteDePlato(x.imagenUrl) }}><img src={imagenDePlato(x.imagenUrl)} alt="" width="36" height="36" /></span>
                      {x.nombre}
                    </span>
                  </td>
                  <td>
                    <label className="solo-lectores" htmlFor={`porciones-${clave}-${x[clave]}`}>Porciones de {x.nombre}</label>
                    <input id={`porciones-${clave}-${x[clave]}`} className={`num ${porciones <= 0 ? 'cero' : ''}`} type="number" min="0" inputMode="numeric" value={x.cantidadDisponible} onChange={alCambiar(x[clave])} />
                  </td>
                  <td>{reservadas[x[clave]] ?? 0}</td>
                  <td>
                    {porciones <= 0 ? <span className="estado peligro"><Icono nombre="x-circulo" />Agotado</span>
                      : porciones <= 5 ? <span className="estado alerta"><Icono nombre="alerta" />Pocas</span>
                        : <span className="estado ok">Disponible</span>}
                  </td>
                  <td><button type="button" className="icono-btn" onClick={() => alQuitar(x[clave])} aria-label={`Quitar ${x.nombre} del menú`}><Icono nombre="basura" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {disponibles.length > 0 && (
        <div className="agregar">
          <label className="solo-lectores" htmlFor={idSelect}>Opción del catálogo para agregar</label>
          <select id={idSelect} value={elegido} onChange={(e) => setElegido(e.target.value)}>
            <option value="">Elige una opción del catálogo</option>
            {disponibles.map((c) => <option key={c[clave]} value={c[clave]}>{c.nombre}</option>)}
          </select>
          <button type="button" className="btn btn-secundario chico auto" disabled={!elegido}
            onClick={() => { alAgregar(disponibles.find((c) => String(c[clave]) === elegido)); setElegido(''); }}>
            <Icono nombre="mas" />Agregar al menú
          </button>
        </div>
      )}
      <p className="pista"><Icono nombre="info" /><span>Las porciones bajan solas con cada reserva confirmada. Recuerda pulsar "Guardar cambios".</span></p>
    </section>
  );
}
