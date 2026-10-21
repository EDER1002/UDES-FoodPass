import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Aviso, Cargando, EstadoPantalla, PantallaDeError } from '../../componentes/Comunes.jsx';
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
        <EstadoPantalla icono="qr" tono="info" titulo="Aún no tienes QR para hoy" alerta={false}
          acciones={<><Link to="/" className="btn btn-primario">Reservar mi almuerzo</Link><Link to="/pagos" className="btn btn-secundario">Ver mis pagos</Link></>}>
          <p>Tu QR aparece aquí apenas confirmas una reserva.</p>
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
          <p>Tu QR quedó anulado y las porciones volvieron al menú.</p>
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

  const banner = usado
    ? { clase: 'usado', icono: 'entrega', texto: 'Almuerzo entregado' }
    : vencido
      ? { clase: 'vencido', icono: 'x-circulo', texto: 'Ficho no válido' }
      : { clase: '', icono: 'check-circulo', texto: 'Reserva confirmada' };
  const pago = reserva.tipoReserva === 'SUBSIDIADA' ? 'Subsidio · $0' : `${NOMBRE_METODO[reserva.pago?.metodo] ?? ''} · ${dinero(reserva.valorTotal)}`;

  return (
    <div className="contenedor">
      <Link to="/" className="cerrar-circulo" aria-label="Volver al inicio"><Icono nombre="cerrar" /></Link>

      <h1 className="solo-lectores">Mi QR del día</h1>
      <p className={`banner-ficho ${banner.clase}`} role={recienConfirmada ? 'status' : undefined}>
        <Icono nombre={banner.icono} />{banner.texto}<Icono nombre={banner.icono} />
      </p>
      {recienConfirmada && (
        <p className="nota-peq" style={{ marginTop: -6 }}>
          {recienConfirmada.subsidio ? 'Subsidio aplicado · $0' : `Pago aprobado · ${NOMBRE_METODO[recienConfirmada.metodo] ?? ''} · ${dinero(recienConfirmada.monto)}`}
        </p>
      )}
      {usado && <p className="nota-peq">Entregado hoy a las {horaDeInstante(ficho.fechaUso)}. ¡Buen provecho!</p>}
      {vencido && <p className="nota-peq">Venció o la reserva se canceló.</p>}

      <section className={`tarjeta-qr ${usado || vencido ? 'apagado' : ''}`} aria-label="Tu código QR">
        {/* El QR lo genera el backend y contiene solo el token. */}
        <img src={ficho.codigoQr} alt={`Código QR de tu ficho. Token ${ficho.token}`} width="240" height="240" />
        <p className="token-figma"><span>Token Único:</span> <b>{ficho.token}</b></p>
        <p className="ayuda-centro">Muéstralo en la caja de la cafetería. Si la cámara no lo lee, dicta el token. Sube el brillo de tu pantalla.</p>
      </section>

      <div className="nota-figma">
        <b>Nota:</b>
        El QR es de un único uso al día.{!usado && !vencido && ' Deja de servir apenas lo escanean; no compartas capturas de pantalla.'}
      </div>

      <details className="tarjeta" style={{ gap: 0 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--azul-udes)' }}>Detalles de la reserva</summary>
        <dl className="filas" style={{ marginTop: 12 }}>
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
          <div className="fila"><dt>Pago</dt><dd>{pago}</dd></div>
          {!usado && <div className="fila"><dt>Válido hasta</dt><dd>Hoy, {horaDeInstante(ficho.fechaExpiracion)}</dd></div>}
        </dl>
      </details>

      {errorCancelacion && <Aviso tono="peligro" icono="x-circulo" titulo="No se pudo cancelar" rol="alert">{errorCancelacion.message}</Aviso>}

      {reserva.estado === 'CONFIRMADA' && !confirmarCancelacion && (
        <button type="button" className="btn btn-texto peligro" onClick={() => setConfirmarCancelacion(true)}>Cancelar reserva</button>
      )}
      {confirmarCancelacion && (
        <div className="tarjeta" role="group" aria-labelledby="pregunta-cancelar">
          <p id="pregunta-cancelar"><b>¿Seguro que quieres cancelar?</b> Tu QR dejará de servir y las porciones vuelven al menú.
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
