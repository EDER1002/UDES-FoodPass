import { Link } from 'react-router-dom';
import { Aviso, Cargando, EstadoPantalla, EstadoReserva, PantallaDeError } from '../../componentes/Comunes.jsx';
import { Icono } from '../../componentes/Icono.jsx';
import { useSesion } from '../../sesion/SesionContexto.jsx';
import { NOMBRE_METODO, dinero, fechaCorta, horaDeInstante, hoyEnBogota, mayuscula, textoReembolso } from '../../utilidades/formato.js';
import { useDatos } from '../../utilidades/ganchos.js';

export function MisReservas() {
  const { api } = useSesion();
  const { datos, error, cargando, recargar } = useDatos((senal) => api('/reservas/mias', { senal }), [api]);

  if (cargando) return <Cargando texto="Cargando tus pagos y reservas…" />;
  if (error) return <div className="contenedor"><PantallaDeError error={error} alReintentar={recargar} /></div>;
  const hoy = hoyEnBogota();

  return (
    <div className="contenedor">
      <h1 className="titulo-figma">Pagos</h1>
      <p className="nota-peq" style={{ marginTop: -10 }}>Tus reservas y el estado de cada pago</p>
      {datos.reservas.length === 0 ? (
        <EstadoPantalla icono="lista" tono="info" titulo="Aún no tienes reservas" alerta={false}
          acciones={<Link to="/" className="btn btn-primario">Reservar mi almuerzo</Link>}>
          <p>Cuando reserves tu almuerzo, aparecerá aquí.</p>
        </EstadoPantalla>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {datos.reservas.map((r) => <TarjetaReserva key={r.idReserva} reserva={r} esHoy={r.fechaReserva === hoy} />)}
        </ul>
      )}
    </div>
  );
}

function TarjetaReserva({ reserva: r, esHoy }) {
  const pago = r.pago;
  const lineaPago = r.tipoReserva === 'SUBSIDIADA' ? 'Subsidio · $0' : `${NOMBRE_METODO[pago?.metodo] ?? 'Sin pagar'} · ${dinero(r.valorTotal)}`;
  return (
    <li className="tarjeta" style={esHoy && r.estado === 'CONFIRMADA' ? { borderColor: 'var(--dorado)', borderWidth: 2 } : undefined}>
      <div className="reserva-cab">
        <span className="reserva-fecha">{esHoy ? `Hoy · ${fechaCorta(r.fechaReserva)}` : mayuscula(fechaCorta(r.fechaReserva))}</span>
        <EstadoReserva estado={r.estado} />
      </div>
      <div>
        <b>{r.tipoAlmuerzo.nombre}</b>
        <p className="pista">{[r.proteina.nombre, ...r.acompanamientos.map((a) => a.nombre)].join(' · ')}</p>
      </div>
      {r.estado === 'CANCELADA' && pago?.estado === 'RECHAZADO' && (
        <Aviso tono="peligro" icono="info">Pago rechazado. No se hizo ningún cobro.</Aviso>
      )}
      {r.estado === 'CANCELADA' && pago?.estado === 'REEMBOLSADO' && (
        <Aviso tono="" icono="info">Cancelada. {textoReembolso(pago)}</Aviso>
      )}
      <div className="reserva-cab">
        <span className="pista">
          {lineaPago}
          {r.estado === 'ENTREGADA' && r.ficho?.fechaUso ? ` · Entregado a las ${horaDeInstante(r.ficho.fechaUso)}` : ''}
        </span>
        {esHoy && r.estado === 'CONFIRMADA' && <Link to="/qr" className="volver">Ver mi QR<Icono nombre="flecha-der" /></Link>}
        {r.estado === 'PENDIENTE_PAGO' && (
          <Link to={`/reserva/${r.idReserva}/pago`} className="volver">
            {pago?.estado === 'PENDIENTE' ? 'Ver estado del pago' : 'Continuar al pago'}<Icono nombre="flecha-der" />
          </Link>
        )}
      </div>
    </li>
  );
}
