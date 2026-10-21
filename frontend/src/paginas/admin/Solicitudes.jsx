import { useState } from 'react';
import { Aviso, Cargando, PantallaDeError } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { fechaCorta, horaDeInstante, hoyEnBogota, mayuscula, sumarDias } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';

/**
 * Cuentas que esperan verificación: estudiantes subsidiados, empleados y
 * administradores. Hasta que se aprueban, no pueden iniciar sesión.
 */
export function Solicitudes() {
  const { api } = useSesion();
  const { datos, error, cargando, recargar } = useDatos((senal) => api('/admin/solicitudes', { senal }), [api]);
  const [mensaje, setMensaje] = useState(null);

  if (cargando && !datos) return <Cargando texto="Cargando solicitudes…" />;
  if (error && !datos) return <div className="admin-cuerpo"><PantallaDeError error={error} alReintentar={recargar} /></div>;

  const alResolver = (texto) => {
    setMensaje(texto);
    recargar();
  };

  return (
    <div className="admin-cuerpo angosto solicitudes">
      <div className="titulo-pagina">
        <h1>Solicitudes de cuenta</h1>
        {datos.solicitudes.length > 0 && <span className="estado alerta">{datos.solicitudes.length} {datos.solicitudes.length === 1 ? 'pendiente' : 'pendientes'}</span>}
        <div className="acciones"><button type="button" className="btn btn-secundario chico auto" onClick={recargar}><Icono nombre="actualizar" />Actualizar</button></div>
        <p>Verifica los datos de cada persona antes de aprobar su rol. Mientras la cuenta está en revisión, no puede iniciar sesión.</p>
      </div>
      {mensaje && <Aviso tono="exito" icono="check-circulo" titulo={mensaje} rol="status" />}
      {datos.solicitudes.length === 0 ? (
        <section className="tarjeta sin-solicitudes">
          <span className="icono-grande ok" aria-hidden="true"><Icono nombre="check-circulo" /></span>
          <h2>No hay solicitudes pendientes</h2>
          <p className="pista">Cuando alguien se registre como subsidiado, empleado o administrador, aparecerá aquí.</p>
        </section>
      ) : (
        <ul className="lista-solicitudes">
          {datos.solicitudes.map((s) => <TarjetaSolicitud key={s.idUsuario} solicitud={s} alResolver={alResolver} />)}
        </ul>
      )}
    </div>
  );
}

const fechaEnBogota = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(iso));

function TarjetaSolicitud({ solicitud: s, alResolver }) {
  const { api } = useSesion();
  const [accion, setAccion] = useState(null);
  const [desde, setDesde] = useState(hoyEnBogota);
  const [hasta, setHasta] = useState(() => sumarDias(hoyEnBogota(), 180));
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const esSubsidiado = s.rol === 'ESTUDIANTE_SUBSIDIADO';
  const idBase = `solicitud-${s.idUsuario}`;

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      if (accion === 'aprobar') {
        const cuerpo = esSubsidiado ? { fechaInicioVigencia: desde, ...(hasta ? { fechaFinVigencia: hasta } : {}) } : {};
        await api(`/admin/solicitudes/${s.idUsuario}/aprobar`, { metodo: 'POST', cuerpo });
        alResolver(`Se aprobó la cuenta de ${s.nombreCompleto} como ${s.nombreRol.toLowerCase()}.`);
      } else {
        await api(`/admin/solicitudes/${s.idUsuario}/rechazar`, { metodo: 'POST', cuerpo: { motivo } });
        alResolver(`Se rechazó la solicitud de ${s.nombreCompleto}.`);
      }
    } catch (err) {
      setError(err);
      if (err.codigo === 'SOLICITUD_YA_REVISADA') alResolver(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <li className="tarjeta solicitud" aria-labelledby={`${idBase}-nombre`}>
      <div className="reserva-cab">
        <div className="perfil">
          <span className="avatar" aria-hidden="true">{`${s.nombre[0] ?? ''}${s.apellido[0] ?? ''}`}</span>
          <div>
            <b id={`${idBase}-nombre`}>{s.nombreCompleto}</b>
            <span>Registrada el {mayuscula(fechaCorta(fechaEnBogota(s.fechaRegistro)))} a las {horaDeInstante(s.fechaRegistro)}</span>
          </div>
        </div>
        <span className={`estado ${esSubsidiado ? 'ok' : s.rol === 'ADMINISTRADOR' ? 'alerta' : 'info'}`}>
          <Icono nombre={esSubsidiado ? 'insignia' : s.rol === 'ADMINISTRADOR' ? 'escudo' : 'usuario'} />{s.nombreRol}
        </span>
      </div>
      <dl className="filas">
        <div className="fila"><dt>Documento</dt><dd>{s.documento}</dd></div>
        <div className="fila"><dt>Correo</dt><dd>{s.correo}</dd></div>
        <div className="fila"><dt>Celular</dt><dd>{s.telefono ?? '—'}</dd></div>
      </dl>
      {s.rol === 'ADMINISTRADOR' && (
        <p className="pista"><Icono nombre="alerta" /><span>Un administrador puede cambiar el menú y validar entregas. Apruébalo solo si trabaja en la cafetería.</span></p>
      )}

      {!accion && (
        <div className="fila-botones">
          <button type="button" className="btn btn-primario chico" onClick={() => setAccion('aprobar')}><Icono nombre="check" />Aprobar</button>
          <button type="button" className="btn btn-peligro chico" onClick={() => setAccion('rechazar')}><Icono nombre="x-circulo" />Rechazar</button>
        </div>
      )}

      {accion && (
        <form onSubmit={enviar} className="form-solicitud" aria-label={accion === 'aprobar' ? 'Aprobar la cuenta' : 'Rechazar la solicitud'}>
          {error && <Aviso tono="peligro" icono="x-circulo" titulo={error.message} rol="alert" />}
          {accion === 'aprobar' && esSubsidiado && (
            <div className="form-rejilla">
              <div className="campo">
                <label htmlFor={`${idBase}-desde`}>Subsidio vigente desde</label>
                <div className="entrada chica"><input id={`${idBase}-desde`} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required /></div>
              </div>
              <div className="campo">
                <label htmlFor={`${idBase}-hasta`}>Hasta (opcional)</label>
                <div className="entrada chica"><input id={`${idBase}-hasta`} type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></div>
              </div>
            </div>
          )}
          {accion === 'aprobar' && !esSubsidiado && <p className="pista"><Icono nombre="info" /><span>Al aprobar, {s.nombre} podrá iniciar sesión como {s.nombreRol.toLowerCase()}.</span></p>}
          {accion === 'rechazar' && (
            <div className="campo">
              <label htmlFor={`${idBase}-motivo`}>Motivo del rechazo</label>
              <textarea id={`${idBase}-motivo`} className="area" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} required
                placeholder="Ej.: no figura en la lista de beneficiarios de Bienestar Universitario" />
              <span className="ayuda">La persona lo verá al intentar iniciar sesión.</span>
            </div>
          )}
          <div className="fila-botones">
            <button type="submit" className={`btn chico ${accion === 'aprobar' ? 'btn-primario' : 'btn-peligro-lleno'}`} disabled={enviando}>
              {enviando ? 'Guardando…' : accion === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
            </button>
            <button type="button" className="btn btn-secundario chico" onClick={() => { setAccion(null); setError(null); }} disabled={enviando}>Cancelar</button>
          </div>
        </form>
      )}
    </li>
  );
}
