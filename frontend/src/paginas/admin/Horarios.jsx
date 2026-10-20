import { useState } from 'react';
import { Aviso, Cargando, PantallaDeError } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { hora, hoyEnBogota } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';

const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'sin fin');

/** Horarios de reserva por rol y excepciones por usuario (RF04). */
export function Horarios() {
  const { api } = useSesion();
  const { datos, error, cargando, recargar } = useDatos(
    async (senal) => {
      const [c, r] = await Promise.all([api('/admin/configuracion-reserva', { senal }), api('/admin/roles', { senal })]);
      return { configuraciones: c.configuraciones, roles: r.roles.filter((x) => x.nombreRol !== 'ADMINISTRADOR') };
    },
    [api],
  );
  const [edicion, setEdicion] = useState(null);
  const [errorForm, setErrorForm] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState(null);

  if (cargando && !datos) return <Cargando texto="Cargando horarios…" />;
  if (error) return <div className="admin-cuerpo"><PantallaDeError error={error} alReintentar={recargar} /></div>;

  const porRol = datos.configuraciones.filter((c) => c.idRol);
  const porUsuario = datos.configuraciones.filter((c) => c.idUsuario);

  const abrir = (c, tipo = 'rol') => {
    setMensaje(null);
    setErrorForm(null);
    setResultados(null);
    setBusqueda('');
    setEdicion(
      c
        ? { ...c, horaInicio: c.horaInicio.slice(0, 5), horaFin: c.horaFin.slice(0, 5), fechaFinVigencia: c.fechaFinVigencia ?? '' }
        : { tipo, idRol: tipo === 'rol' ? datos.roles[0]?.idRol : null, idUsuario: null, usuario: null, horaInicio: '06:00', horaFin: '10:30', fechaInicioVigencia: hoyEnBogota(), fechaFinVigencia: '', estado: 'ACTIVO' },
    );
  };

  const buscarUsuarios = async () => {
    try {
      const { usuarios } = await api(`/admin/usuarios?buscar=${encodeURIComponent(busqueda)}`);
      setResultados(usuarios.filter((u) => u.rol !== 'ADMINISTRADOR'));
    } catch (e) {
      setErrorForm(e);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setErrorForm(null);
    try {
      await api('/admin/configuracion-reserva', {
        metodo: 'PUT',
        cuerpo: {
          ...(edicion.idConfiguracion ? { idConfiguracion: edicion.idConfiguracion } : {}),
          idRol: edicion.idUsuario ? null : Number(edicion.idRol),
          idUsuario: edicion.idUsuario ?? null,
          horaInicio: edicion.horaInicio,
          horaFin: edicion.horaFin,
          fechaInicioVigencia: edicion.fechaInicioVigencia,
          fechaFinVigencia: edicion.fechaFinVigencia || null,
          estado: edicion.estado,
        },
      });
      setMensaje('Horario guardado. Se aplica de inmediato.');
      setEdicion(null);
      recargar();
    } catch (err) {
      setErrorForm(err);
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (campo) => (e) => setEdicion((x) => ({ ...x, [campo]: e.target.value }));
  const filaConfig = (c, nombre, detalle) => (
    <tr key={c.idConfiguracion} className={edicion?.idConfiguracion === c.idConfiguracion ? 'marcada' : ''}>
      <td><b>{nombre}</b>{detalle && <><br /><span className="suave">{detalle}</span></>}</td>
      <td>{hora(c.horaInicio)}</td>
      <td>{hora(c.horaFin)}</td>
      <td className="suave">{fechaCorta(c.fechaInicioVigencia)} – {fechaCorta(c.fechaFinVigencia)}</td>
      <td>{c.vigente ? <span className="estado ok">Vigente</span> : <span className="estado neutro">{c.estado === 'INACTIVO' ? 'Inactivo' : 'No vigente'}</span>}</td>
      <td><button type="button" className="icono-btn" onClick={() => abrir(c)} aria-label={`Editar el horario de ${nombre}`}><Icono nombre="editar" /></button></td>
    </tr>
  );
  const cabecera = (primera) => (
    <thead><tr><th scope="col">{primera}</th><th scope="col">Desde</th><th scope="col">Hasta</th><th scope="col">Vigencia</th><th scope="col">Estado</th><th scope="col"><span className="solo-lectores">Editar</span></th></tr></thead>
  );

  return (
    <div className="admin-cuerpo">
      <div className="titulo-pagina">
        <h1>Horarios de reserva</h1>
        <div className="acciones">
          <button type="button" className="btn btn-secundario chico auto" onClick={() => abrir(null, 'rol')}><Icono nombre="grupo" />Horario por rol</button>
          <button type="button" className="btn btn-secundario chico auto" onClick={() => abrir(null, 'usuario')}><Icono nombre="usuario" />Excepción por usuario</button>
        </div>
        <p>Hora de Colombia (America/Bogota). Se combinan con la ventana del menú de cada día.</p>
      </div>
      {mensaje && <Aviso tono="exito" icono="check-circulo" titulo={mensaje} rol="status" />}

      <div className="rejilla lateral">
        <div className="columna-tarjetas">
          <section className="tarjeta" aria-labelledby="t-rol">
            <h2 id="t-rol"><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icono nombre="grupo" />Por tipo de usuario</span></h2>
            <div className="tabla-envoltura">
              <table className="tabla">{cabecera('Rol')}<tbody>{porRol.map((c) => filaConfig(c, c.nombreRol))}</tbody></table>
            </div>
            <p className="pista"><Icono nombre="info" /><span>El administrador no reserva almuerzos, por eso no aparece en la lista.</span></p>
          </section>
          <section className="tarjeta" aria-labelledby="t-usuario">
            <h2 id="t-usuario"><span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icono nombre="usuario" />Excepciones por usuario</span></h2>
            {porUsuario.length === 0 ? (
              <p className="pista">No hay excepciones. Úsalas para dar a una persona un horario distinto al de su rol: el suyo manda.</p>
            ) : (
              <div className="tabla-envoltura">
                <table className="tabla">{cabecera('Usuario')}<tbody>{porUsuario.map((c) => filaConfig(c, c.usuario?.nombreCompleto, `${c.usuario?.nombreRol} · CC ${c.usuario?.documento}`))}</tbody></table>
              </div>
            )}
          </section>
        </div>

        {edicion ? (
          <form className="tarjeta" onSubmit={guardar} aria-labelledby="titulo-horario" noValidate>
            <h2 id="titulo-horario">
              {edicion.idConfiguracion ? 'Editar horario' : edicion.tipo === 'usuario' ? 'Nueva excepción' : 'Nuevo horario por rol'}
              <button type="button" className="icono-btn" onClick={() => setEdicion(null)} aria-label="Cerrar el formulario"><Icono nombre="cerrar" /></button>
            </h2>
            {errorForm && <Aviso tono="peligro" icono="x-circulo" titulo={errorForm.message} rol="alert" />}
            {edicion.idConfiguracion ? (
              <div className="campo"><span className="rotulo">Aplica a</span><div className="entrada chica"><Icono nombre={edicion.idRol ? 'grupo' : 'usuario'} /><span>{edicion.idRol ? `Rol: ${edicion.nombreRol}` : `Usuario: ${edicion.usuario?.nombreCompleto}`}</span></div></div>
            ) : edicion.tipo === 'rol' ? (
              <div className="campo"><label htmlFor="h-rol">Rol</label><div className="entrada chica"><select id="h-rol" value={edicion.idRol ?? ''} onChange={cambiar('idRol')}>{datos.roles.map((r) => <option key={r.idRol} value={r.idRol}>{r.nombre}</option>)}</select></div></div>
            ) : (
              <div className="campo">
                <label htmlFor="h-buscar">Usuario</label>
                {edicion.usuario ? (
                  <div className="entrada chica"><Icono nombre="usuario" /><span>{edicion.usuario.nombreCompleto} · {edicion.usuario.correo}</span>
                    <button type="button" className="accion" onClick={() => setEdicion((x) => ({ ...x, usuario: null, idUsuario: null }))}>Cambiar</button></div>
                ) : (
                  <>
                    <div className="agregar">
                      <div className="entrada chica" style={{ flex: 1 }}><Icono nombre="buscar" /><input id="h-buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre, correo o documento"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarUsuarios(); } }} /></div>
                      <button type="button" className="btn btn-secundario chico auto" onClick={buscarUsuarios} disabled={busqueda.trim().length < 2}>Buscar</button>
                    </div>
                    {resultados && (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Resultados">
                        {resultados.length === 0 && <li className="pista">No se encontraron usuarios.</li>}
                        {resultados.map((u) => (
                          <li key={u.idUsuario}><button type="button" className="btn btn-secundario chico" style={{ justifyContent: 'flex-start' }} onClick={() => setEdicion((x) => ({ ...x, usuario: u, idUsuario: u.idUsuario }))}>
                            {u.nombreCompleto} · {u.nombreRol}</button></li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="form-rejilla">
              <div className="campo"><label htmlFor="h-desde">Desde</label><div className="entrada chica"><input id="h-desde" type="time" value={edicion.horaInicio} onChange={cambiar('horaInicio')} /></div></div>
              <div className="campo"><label htmlFor="h-hasta">Hasta</label><div className="entrada chica"><input id="h-hasta" type="time" value={edicion.horaFin} onChange={cambiar('horaFin')} /></div></div>
              <div className="campo"><label htmlFor="h-vdesde">Vigente desde</label><div className="entrada chica"><input id="h-vdesde" type="date" value={edicion.fechaInicioVigencia} onChange={cambiar('fechaInicioVigencia')} /></div></div>
              <div className="campo"><label htmlFor="h-vhasta">Vigente hasta</label><div className="entrada chica"><input id="h-vhasta" type="date" value={edicion.fechaFinVigencia} onChange={cambiar('fechaFinVigencia')} /></div></div>
            </div>
            <div className="campo">
              <span className="rotulo">Estado</span>
              <label className="interruptor">
                <input type="checkbox" checked={edicion.estado === 'ACTIVO'} onChange={(e) => setEdicion((x) => ({ ...x, estado: e.target.checked ? 'ACTIVO' : 'INACTIVO' }))} />
                <i aria-hidden="true" />{edicion.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}
              </label>
            </div>
            <Aviso icono="info">Un horario aplica a <b>un rol o a un usuario</b>, nunca a ambos.</Aviso>
            <div className="fila-botones">
              <button type="button" className="btn btn-secundario chico" onClick={() => setEdicion(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primario chico" disabled={guardando || (edicion.tipo === 'usuario' && !edicion.idUsuario && !edicion.idConfiguracion)}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </form>
        ) : (
          <section className="tarjeta">
            <h2>Edición</h2>
            <p className="pista"><Icono nombre="info" /><span>Elige un horario para editarlo. Para probar el bloqueo por horario, por ejemplo, pon de 6:00 a 10:30 a. m.</span></p>
          </section>
        )}
      </div>
    </div>
  );
}
