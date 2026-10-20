import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Aviso, Cargando, EstadoPantalla, PantallaDeError, Pasos } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { NOMBRE_METODO, dinero, fechaLarga, horaDeInstante, mayuscula } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';

export function MiFicho() {
  const { api } = useSesion();
  const ubicacion = useLocation();
  const recienConfirmada = ubicacion.state?.recienConfirmada;
  const { datos, error, cargando, recargar } = useDatos((senal) => api('/fichos/actual', { senal }), [api]);
  const [confirmarCancelacion, setConfirmarCancelacion] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState(null);
  const [cancelada, setCancelada] = useState(null);

  if (cargando) return <Cargando texto="Cargando tu ficho…" />;
  if (error?.codigo === 'SIN_FICHO') {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="qr" tono="info" titulo="Aún no tienes ficho para hoy" alerta={false}
          acciones={<><Link to="/" className="btn btn-primario">Reservar mi almuerzo</Link><Link to="/mis-reservas" className="btn btn-secundario">Ver mis reservas</Link></>}>
          <p>Tu ficho aparece aquí apenas confirmas una reserva.</p>
        </EstadoPantalla>
      </div>
    );
  }
  if (error) return <div className="contenedor"><PantallaDeError error={error} alReintentar={recargar} /></div>;

  if (cancelada) {
    return (
      <div className="contenedor">
        <EstadoPantalla icono="check-circulo" tono="ok" titulo="Reserva cancelada" alerta={false}
          acciones={<Link to="/" className="btn btn-primario">Volver al menú</Link>}>
          <p>Tu ficho quedó anulado y las porciones volvieron al menú.</p>
          {cancelada.pago?.estado === 'REEMBOLSADO' && <p>Te devolvimos {dinero(cancelada.pago.monto)} (reembolso simulado).</p>}
          {cancelada.tipoReserva === 'SUBSIDIADA' && <p>Tu subsidio de hoy queda disponible otra vez.</p>}
        </EstadoPantalla>
      </div>
    );
  }

  const { reserva } = datos;
  const { ficho } = reserva;
  const usado = ficho?.estado === 'USADO';
  const vencido = ficho?.estado === 'EXPIRADO';

  const cancelar = async () => {
    setCancelando(true);
    setErrorCancelacion(null);
    try {
      const { reserva: r } = await api(`/reservas/${reserva.idReserva}/cancelar`, { metodo: 'POST' });
      setCancelada(r);
    } catch (e) {
      setErrorCancelacion(e);
      setConfirmarCancelacion(false);
    } finally {
      setCancelando(false);
    }
  };

  return (
    <div className="contenedor">
      {recienConfirmada && <Pasos actual={3} texto="¡Listo!" siguiente="Reserva completa" />}
      {recienConfirmada && (
        <Aviso tono="exito" icono="check-circulo" titulo="Reserva confirmada" rol="status">
          {recienConfirmada.subsidio ? 'Subsidio aplicado · $0' : `Pago aprobado · ${NOMBRE_METODO[recienConfirmada.metodo] ?? ''} · ${dinero(recienConfirmada.monto)}`}
        </Aviso>
      )}
      {usado && (
        <Aviso tono="" icono="entrega" titulo="Ya reclamaste tu almuerzo">
          Entregado hoy a las {horaDeInstante(ficho.fechaUso)}. ¡Buen provecho!
        </Aviso>
      )}
      {vencido && <Aviso tono="peligro" icono="x-circulo" titulo="Este ficho ya no es válido">Venció o la reserva se canceló.</Aviso>}

      <section className={`tarjeta ficho ${usado || vencido ? 'usado' : ''}`} aria-labelledby="titulo-ficho">
        <h2 id="titulo-ficho">
          Mi Ficho
          {usado ? (
            <span className="estado info"><Icono nombre="entrega" />Usado</span>
          ) : vencido ? (
            <span className="estado peligro"><Icono nombre="x-circulo" />Vencido</span>
          ) : (
            <span className="estado alerta"><Icono nombre="alerta" />Uso único</span>
          )}
        </h2>
        {/* El QR lo genera el backend y contiene solo el token. */}
        <div className="qr-caja">
          <img src={ficho.codigoQr} alt={`Código QR de tu ficho. Token ${ficho.token}`} width="260" height="260" />
        </div>
        <div>
          <div className="token-lbl">Token</div>
          <div className="token">{ficho.token}</div>
        </div>
        <p className="ayuda-centro">Muéstralo en la caja de la cafetería. Si la cámara no lo lee, dicta el token. Sube el brillo de tu pantalla.</p>
      </section>

      <section className="tarjeta" aria-label="Detalles de la reserva">
        <dl className="filas">
          <div className="fila"><dt>Fecha</dt><dd>{mayuscula(fechaLarga(reserva.fechaReserva, { conAnio: true }))}</dd></div>
          <div className="fila">
            <dt>Almuerzo</dt>
            <dd>
              <span style={{ display: 'block' }}>{reserva.tipoAlmuerzo.nombre}</span>
              <span style={{ display: 'block' }}>{reserva.proteina.nombre}</span>
              <span style={{ display: 'block' }}>{reserva.acompanamientos.map((a) => a.nombre).join(', ')}</span>
            </dd>
          </div>
          <div className="fila"><dt>Lugar de reclamo</dt><dd>{reserva.lugarReclamo.split(' · ').map((p) => <span key={p} style={{ display: 'block' }}>{p}</span>)}</dd></div>
          <div className="fila"><dt>Pago</dt><dd>{reserva.tipoReserva === 'SUBSIDIADA' ? 'Subsidio · $0' : `${NOMBRE_METODO[reserva.pago?.metodo] ?? ''} · ${dinero(reserva.valorTotal)}`}</dd></div>
          {!usado && <div className="fila"><dt>Válido hasta</dt><dd>Hoy, {horaDeInstante(ficho.fechaExpiracion)}</dd></div>}
        </dl>
      </section>

      {!usado && !vencido && (
        <Aviso tono="alerta" icono="alerta" titulo="Ficho de uso único">Deja de servir apenas lo escanean en la entrega. No compartas capturas de pantalla.</Aviso>
      )}

      {errorCancelacion && <Aviso tono="peligro" icono="x-circulo" titulo="No se pudo cancelar" rol="alert">{errorCancelacion.message}</Aviso>}

      <Link to="/mis-reservas" className="btn btn-secundario">Ver mis reservas</Link>
      {reserva.estado === 'CONFIRMADA' && !confirmarCancelacion && (
        <button type="button" className="btn btn-texto peligro" onClick={() => setConfirmarCancelacion(true)}>Cancelar reserva</button>
      )}
      {confirmarCancelacion && (
        <div className="tarjeta" role="group" aria-labelledby="pregunta-cancelar">
          <p id="pregunta-cancelar"><b>¿Seguro que quieres cancelar?</b> Tu ficho dejará de servir y las porciones vuelven al menú.
            {reserva.tipoReserva === 'PAGADA' ? ' Te devolveremos el pago (reembolso simulado).' : ' Tu subsidio de hoy quedará libre.'}</p>
          <div className="fila-botones">
            <button type="button" className="btn btn-peligro-lleno chico" onClick={cancelar} disabled={cancelando}>{cancelando ? 'Cancelando…' : 'Sí, cancelar'}</button>
            <button type="button" className="btn btn-secundario chico" onClick={() => setConfirmarCancelacion(false)} disabled={cancelando}>No, conservarla</button>
          </div>
        </div>
      )}
    </div>
  );
}
